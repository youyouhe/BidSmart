/**
 * WebSocket service for real-time document parsing status updates.
 *
 * Features:
 * - Auto-reconnect with exponential backoff
 * - Heartbeat mechanism (30s ping/pong)
 * - Multiple document subscription support
 * - Graceful error handling
 */

// =============================================================================
// Types
// =============================================================================

export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface StatusUpdateMessage {
  type: 'status_update';
  document_id: string;
  status: DocumentStatus;
  progress?: number;
  error_message?: string;
  metadata?: {
    duration_ms?: number;
    is_reparse?: boolean;
    [key: string]: any;
  };
}

export interface ConnectedMessage {
  type: 'connected';
  document_id: string;
  message: string;
}

export interface SubscribedMessage {
  type: 'subscribed';
  document_id: string;
  message: string;
}

export type WebSocketMessage =
  | StatusUpdateMessage
  | ConnectedMessage
  | SubscribedMessage
  | 'ping'
  | 'pong';

export interface WebSocketCallbacks {
  onStatus?: (update: StatusUpdateMessage) => void;
  onConnected?: (msg: ConnectedMessage) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
  onClosed?: () => void;
}

// =============================================================================
// DocumentWebSocket Class
// =============================================================================

class DocumentWebSocket {
  private ws: WebSocket | null = null;
  private documentId: string;
  private url: string;
  private callbacks: WebSocketCallbacks;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // Start with 2s
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private heartbeatMissed = 0;
  private isIntentionalClose = false;

  // Constants
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly HEARTBEAT_TIMEOUT = 10000; // 10 seconds (client timeout)
  private readonly RECONNECT_BACKOFF_MULTIPLIER = 1.5;

  constructor(documentId: string, callbacks: WebSocketCallbacks) {
    this.documentId = documentId;
    this.callbacks = callbacks;

    // Build WebSocket URL from current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.url = `${protocol}//${host}/ws/documents/${documentId}?timeout=300`;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log(`[WebSocket] Already connected to ${this.documentId}`);
      return;
    }

    console.log(`[WebSocket] Connecting to ${this.documentId}...`);

    try {
      this.ws = new WebSocket(this.url);
      this.setupEventHandlers();
    } catch (error) {
      console.error('[WebSocket] Failed to create WebSocket:', error);
      this.callbacks.onError?.(error as Error);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.isIntentionalClose = true;
    this.clearHeartbeat();
    this.clearReconnectTimeout();

    if (this.ws) {
      this.ws.close(1000, 'Client closing connection');
      this.ws = null;
    }

    console.log(`[WebSocket] Disconnected from ${this.documentId}`);
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log(`[WebSocket] Connected to ${this.documentId}`);
      this.reconnectAttempts = 0; // Reset reconnect counter on successful connection
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onerror = (event) => {
      console.error('[WebSocket] Error:', event);
      this.callbacks.onError?.(new Error('WebSocket connection error'));
    };

    this.ws.onclose = (event) => {
      console.log(`[WebSocket] Connection closed: ${event.code} ${event.reason}`);

      this.clearHeartbeat();

      if (!this.isIntentionalClose) {
        this.callbacks.onClosed?.();
        this.scheduleReconnect();
      }
    };
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    // Handle ping/pong
    if (data === 'ping') {
      this.send('pong');
      return;
    }

    if (data === 'pong') {
      this.heartbeatMissed = 0;
      return;
    }

    // Handle JSON messages
    try {
      const message = JSON.parse(data) as WebSocketMessage;

      switch (message.type) {
        case 'connected':
          console.log(`[WebSocket] ${message.message}`);
          this.callbacks.onConnected?.(message);
          break;

        case 'subscribed':
          console.log(`[WebSocket] ${message.message}`);
          break;

        case 'status_update':
          console.log(`[WebSocket] Status update: ${message.status} for ${message.document_id}`);
          this.callbacks.onStatus?.(message);

          // Extract progress if available
          if (message.progress !== undefined) {
            this.callbacks.onProgress?.(message.progress);
          }

          // Auto-disconnect 5 seconds after completion
          if (message.status === 'completed' || message.status === 'failed') {
            setTimeout(() => {
              this.disconnect();
            }, 5000);
          }
          break;
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', data, error);
    }
  }

  /**
   * Send a message to the server
   */
  private send(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      console.warn('[WebSocket] Cannot send message: not connected');
    }
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatMissed = 0;

    this.heartbeatIntervalId = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send('ping');
        this.heartbeatMissed++;

        // If we miss 3 consecutive heartbeats, close and reconnect
        if (this.heartbeatMissed >= 3) {
          console.error('[WebSocket] Heartbeat timeout, reconnecting...');
          this.ws?.close();
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Clear heartbeat interval
   */
  private clearHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimeout();

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      this.callbacks.onError?.(
        new Error('Failed to connect after multiple attempts')
      );
      return;
    }

    const delay = this.reconnectDelay;
    this.reconnectAttempts++;

    console.log(
      `[WebSocket] Scheduling reconnect in ${delay}ms ` +
      `(attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
      // Increase delay for next attempt (exponential backoff)
      this.reconnectDelay = Math.floor(
        this.reconnectDelay * this.RECONNECT_BACKOFF_MULTIPLIER
      );
    }, delay);
  }

  /**
   * Clear reconnect timeout
   */
  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  /**
   * Check if the connection is currently open
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// =============================================================================
// WebSocketConnectionManager Class
// =============================================================================

class WebSocketConnectionManager {
  private connections: Map<string, DocumentWebSocket> = new Map();

  /**
   * Get or create a WebSocket connection for a document
   */
  getConnection(documentId: string, callbacks: WebSocketCallbacks): DocumentWebSocket {
    let connection = this.connections.get(documentId);

    if (!connection) {
      console.log(`[WebSocketManager] Creating new connection for ${documentId}`);
      connection = new DocumentWebSocket(documentId, callbacks);
      this.connections.set(documentId, connection);
    }

    return connection;
  }

  /**
   * Disconnect a specific document's WebSocket
   */
  disconnect(documentId: string): void {
    const connection = this.connections.get(documentId);
    if (connection) {
      connection.disconnect();
      this.connections.delete(documentId);
      console.log(`[WebSocketManager] Removed connection for ${documentId}`);
    }
  }

  /**
   * Disconnect all active WebSocket connections
   */
  disconnectAll(): void {
    console.log(`[WebSocketManager] Disconnecting all connections (${this.connections.size})`);
    this.connections.forEach((connection, documentId) => {
      connection.disconnect();
    });
    this.connections.clear();
  }

  /**
   * Get the number of active connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Check if a document has an active connection
   */
  hasConnection(documentId: string): boolean {
    const connection = this.connections.get(documentId);
    return connection?.isConnected() ?? false;
  }
}

// =============================================================================
// Global Instance
// =============================================================================

export const websocketManager = new WebSocketConnectionManager();

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Subscribe to document status updates via WebSocket
 *
 * @param documentId - The document ID to subscribe to
 * @param callbacks - Callback functions for status updates
 * @returns The WebSocket connection (call disconnect() when done)
 */
export function subscribeToDocumentStatus(
  documentId: string,
  callbacks: WebSocketCallbacks
): DocumentWebSocket {
  const connection = websocketManager.getConnection(documentId, callbacks);
  connection.connect();
  return connection;
}

/**
 * Unsubscribe from document status updates
 *
 * @param documentId - The document ID to unsubscribe from
 */
export function unsubscribeFromDocumentStatus(documentId: string): void {
  websocketManager.disconnect(documentId);
}

/**
 * Unsubscribe from all document status updates
 */
export function unsubscribeAll(): void {
  websocketManager.disconnectAll();
}
