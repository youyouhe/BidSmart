import {
  RemoteParseResponse,
  IndexTreeResponse,
  RemoteChatResponse,
  ChatResponse,
  ChatMessage,
  HealthCheckResponse,
  Node,
  SourceInfo,
  AVAILABLE_PROVIDERS,
  ProviderType,
  Document,
  DocumentListResponse,
  DocumentTreeResponse,
  DeleteDocumentResponse,
  UploadDocumentResponse,
  ParseStatus,
  GalleryItem,
  PerformanceStats
} from '../types';
import { subscribeToDocumentStatus, DocumentWebSocket, WebSocketCallbacks } from './websocketService';

// API Configuration

// API Configuration
// In development, use empty string to leverage Vite proxy (avoids CORS)
// In production, use the full remote API URL
// @ts-ignore - Vite environment variables
const REMOTE_API_URL = import.meta.env.VITE_PAGEINDEX_API_URL || import.meta.env.NEXT_PUBLIC_PAGEINDEX_API_URL || 'http://192.168.8.107:8003';
// @ts-ignore
const IS_DEV = import.meta.env.DEV;

// Use Vite proxy in development to avoid CORS, direct URL in production
const API_BASE_URL = IS_DEV ? '' : REMOTE_API_URL;

// File type detection
const getFileType = (filename: string): 'markdown' | 'pdf' => {
  const ext = filename.toLowerCase().split('.').pop();
  return ext === 'pdf' ? 'pdf' : 'markdown';
};

/**
 * Health check endpoint - checks each provider separately
 */
export const checkHealth = async (providers = AVAILABLE_PROVIDERS): Promise<HealthCheckResponse> => {
  // Check each provider in parallel
  const healthChecks = providers.map(async (provider) => {
    const response = await fetch(`${API_BASE_URL}/api/provider-health?provider=${provider}`);
    if (!response.ok) {
      return { provider, status: 'unavailable' };
    }
    const data = await response.json();
    return { provider, ...data };
  });

  const results = await Promise.all(healthChecks);

  // Determine overall health status
  // Backend returns `configured` field, not `status`
  const availableProviders = results
    .filter(r => r.configured === true)
    .map(r => r.provider) as ProviderType[];

  // Use first available provider as current
  const firstConfigured = results.find(r => r.configured === true);

  return {
    status: firstConfigured ? 'healthy' : 'unhealthy',
    version: '0.2.0',
    provider: firstConfigured?.provider || 'none',
    model: firstConfigured?.default_model || 'unknown',
    available_providers: availableProviders,
  };
};

/**
 * Parse document (supports both markdown and pdf)
 */
export const parseDocument = async (file: File): Promise<IndexTreeResponse> => {
  const fileType = getFileType(file.name);
  const endpoint = fileType === 'pdf'
    ? '/api/parse/pdf'
    : '/api/parse/markdown';

  const formData = new FormData();
  formData.append('file', file);

  // Optional parameters with defaults
  formData.append('if_add_node_summary', 'true');
  formData.append('if_add_node_text', 'true');

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Parse failed: ${response.statusText}`);
  }

  const data: RemoteParseResponse = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Parse operation failed');
  }

  // Get filename without extension for the title
  const filenameWithoutExt = file.name.replace(/\.[^/.]+$/, '');

  // Transform remote response to backward compatible format
  // Update root node title to use filename instead of temp ID
  const treeWithTitle = {
    ...data.tree,
    title: filenameWithoutExt
  };

  return {
    tree: treeWithTitle,
    stats: {
      total_nodes: data.stats.total_nodes,
      filename: file.name, // Keep full filename for reference
      max_depth: data.stats.max_depth,
      total_characters: data.stats.total_characters,
      total_tokens: data.stats.total_tokens,
      has_summaries: data.stats.has_summaries,
      has_content: data.stats.has_content,
    }
  };
};

/**
 * Chat with document - supports multi-turn conversation with history
 */
export const chatWithDocument = async (
  question: string,
  tree: Node,
  history?: ChatMessage[],
  documentId?: string
): Promise<ChatResponse> => {
  const requestBody = {
    question,
    tree, // Send full tree structure
    history, // Include conversation history for context
    document_id: documentId || tree.id, // Prioritize documentId, fallback to tree.id
  };

  // Log the request payload for debugging
  console.log('=== Chat API Request ===');
  console.log('Question:', question);
  console.log('History length:', history?.length || 0);
  console.log('History:', history);
  console.log('Request body size:', JSON.stringify(requestBody).length, 'bytes');

  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Chat failed: ${response.statusText}`);
  }

  const data: RemoteChatResponse = await response.json();

  // Transform remote response to backward compatible format
  const sourceNode = data.sources && data.sources.length > 0
    ? data.sources[0].title // Use first source as legacy source_node
    : 'Unknown';

  return {
    answer: data.answer,
    source_node: sourceNode,
    sources: data.sources, // Keep full sources array
    debug_path: data.debug_path,
    provider: data.provider,
    model: data.model,
  };
};

/**
 * Utility: Extract node IDs from debug path for highlighting
 */
export const extractNodeIdsFromPath = (debugPath: string[]): string[] => {
  // Remote API returns node IDs in debug_path
  return debugPath;
};

/**
 * Utility: Format source information for display
 */
export const formatSourceInfo = (sources: SourceInfo[] | undefined): string => {
  if (!sources || sources.length === 0) return 'Unknown';

  if (sources.length === 1) {
    return sources[0].title;
  }

  return sources.map(s => s.title).join(', ');
};

// ============================================================
// Document Management API Functions
// ============================================================

/**
 * List all documents with optional status filter
 * Note: API returns { items: [...], count: N, limit: N, offset: N }
 */
export const listDocuments = async (status?: ParseStatus): Promise<DocumentListResponse> => {
  const url = status
    ? `${API_BASE_URL}/api/documents/?parse_status=${status}`
    : `${API_BASE_URL}/api/documents/`;

  const response = await fetch(url, {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Failed to list documents: ${response.statusText}`);
  }

  const data = await response.json();

  // API returns: { items: [...], count: N, limit: N, offset: N }
  if (data && data.items && Array.isArray(data.items)) {
    return data as DocumentListResponse;
  }

  // If response is an array (unexpected), wrap it
  if (Array.isArray(data)) {
    return { items: data, count: data.length, limit: 100, offset: 0 };
  }

  // Otherwise return empty list
  return { items: [], count: 0, limit: 100, offset: 0 };
};

/**
 * Get document details by ID
 */
export const getDocument = async (id: string): Promise<Document> => {
  const response = await fetch(`${API_BASE_URL}/api/documents/${id}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Failed to get document: ${response.statusText}`);
  }

  return await response.json();
};

/**
 * Get document tree by ID
 * Also fetches document metadata to ensure proper title (filename instead of UUID)
 */
export const getDocumentTree = async (id: string): Promise<DocumentTreeResponse> => {
  // Fetch both document metadata and tree in parallel
  const [docResponse, treeResponse] = await Promise.all([
    fetch(`${API_BASE_URL}/api/documents/${id}`, { method: 'GET' }),
    fetch(`${API_BASE_URL}/api/documents/${id}/tree`, { method: 'GET' })
  ]);

  // Check document metadata response
  if (!docResponse.ok) {
    const error = await docResponse.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Failed to get document: ${docResponse.statusText}`);
  }

  // Check tree response
  if (!treeResponse.ok) {
    const error = await treeResponse.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Failed to get document tree: ${treeResponse.statusText}`);
  }

  const doc: Document = await docResponse.json();
  const tree: Node = await treeResponse.json();

  // Get filename without extension for the title
  const filenameWithoutExt = doc.filename.replace(/\.[^/.]+$/, '');

  // Return tree with proper title
  return {
    ...tree,
    title: filenameWithoutExt
  };
};

/**
 * Delete document by ID
 */
export const deleteDocument = async (id: string): Promise<DeleteDocumentResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/documents/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Failed to delete document: ${response.statusText}`);
  }

  return await response.json();
};

/**
 * Get global performance statistics (latest parse)
 */
export const getGlobalPerformanceStats = async (): Promise<PerformanceStats | null> => {
  const response = await fetch(`${API_BASE_URL}/api/performance/stats`, {
    method: 'GET',
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
};

/**
 * Re-parse document by ID
 * Triggers synchronous re-parsing and returns the tree directly
 */
export const reparseDocument = async (
  id: string,
  model?: string,
  customPrompt?: string
): Promise<DocumentTreeResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/documents/${id}/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      custom_prompt: customPrompt?.trim(),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Failed to re-parse document: ${response.statusText}`);
  }

  // Returns the full RemoteParseResponse
  const data: RemoteParseResponse = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Re-parse operation failed');
  }

  return data.tree;
};

/**
 * Upload document to gallery
 * Note: This uses a different endpoint than parseDocument
 * Returns document ID that can be used to poll for completion
 */
export const uploadDocument = async (file: File, customPrompt?: string): Promise<UploadDocumentResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  // Add optional parameters for parsing
  formData.append('if_add_node_summary', 'true');
  formData.append('if_add_node_text', 'true');
  formData.append('auto_parse', 'true');
  // Add custom prompt if provided
  if (customPrompt && customPrompt.trim()) {
    formData.append('custom_prompt', customPrompt.trim());
  }

  console.log('Uploading file:', file.name, 'Size:', file.size);

  const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Upload failed: ${response.statusText}`);
  }

  const data = await response.json();
  console.log('Upload response:', data);
  return data;
};

/**
 * Poll for document parsing completion
 * Returns the parsed tree when ready
 */
export const waitForDocumentParsing = async (
  documentId: string,
  onProgress?: (status: ParseStatus) => void
): Promise<DocumentTreeResponse> => {
  const maxAttempts = 60; // Maximum 60 attempts (2 minutes with 2s intervals)
  const interval = 2000; // 2 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Check document status
      const doc = await getDocument(documentId);

      if (onProgress) {
        onProgress(doc.parse_status);
      }

      if (doc.parse_status === 'completed') {
        // Parsing complete, fetch the tree
        return await getDocumentTree(documentId);
      }

      if (doc.parse_status === 'failed') {
        throw new Error(doc.error_message || 'Document parsing failed');
      }

      // Still pending or processing, wait and retry
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    } catch (error) {
      // If it's a 400 error, the tree might not be ready yet
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      } else {
        throw error;
      }
    }
  }

  throw new Error('Document parsing timed out. Please try again later.');
};

/**
 * Transform Document list to GalleryItem format
 */
export const transformToGalleryItems = (documents: Document[]): GalleryItem[] => {
  if (!documents || !Array.isArray(documents)) {
    console.warn('transformToGalleryItems: Invalid documents input', documents);
    return [];
  }

  return documents.map(doc => {
    // Get filename without extension for title
    const filenameWithoutExt = doc.filename.replace(/\.[^/.]+$/, '');

    // Determine category based on file type
    const category = doc.file_type === 'pdf' ? 'PDF' : 'Markdown';

    // Format date (created_at is ISO string)
    const date = new Date(doc.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    // Create description based on parse status
    const getDescription = (status: ParseStatus, fileSize: number): string => {
      const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      const statusText = {
        pending: 'Pending parsing',
        processing: 'Processing...',
        completed: `Ready • ${sizeMB} MB`,
        failed: 'Parse failed'
      };
      return statusText[status];
    };

    return {
      id: doc.id,
      title: filenameWithoutExt,
      category,
      date,
      description: getDescription(doc.parse_status, doc.file_size_bytes),
      parseStatus: doc.parse_status
    };
  });
};

/**
 * Upload document with WebSocket for real-time status updates.
 *
 * This is the recommended upload method. It:
 * 1. Uploads the document and returns immediately with the document ID
 * 2. Establishes a WebSocket connection for real-time status updates
 * 3. Calls the provided callbacks when status changes occur
 *
 * Usage:
 * ```typescript
 * const { documentId, websocket } = await uploadDocumentWithWebSocket(
 *   file,
 *   customPrompt,
 *   {
 *     onStatus: (update) => console.log('Status:', update.status),
 *     onProgress: (progress) => console.log('Progress:', progress),
 *     onError: (error) => console.error('Error:', error),
 *   }
 * );
 * ```
 *
 * @param file - The file to upload
 * @param customPrompt - Optional custom prompt for TOC extraction
 * @param callbacks - WebSocket event callbacks
 * @returns Object with documentId and websocket connection
 */
export const uploadDocumentWithWebSocket = async (
  file: File,
  customPrompt: string | undefined,
  callbacks: WebSocketCallbacks
): Promise<{ documentId: string; websocket: DocumentWebSocket }> => {
  // Upload the document first
  const uploadResponse = await uploadDocument(file, customPrompt);

  // Establish WebSocket connection for status updates
  const websocket = subscribeToDocumentStatus(uploadResponse.id, callbacks);

  return {
    documentId: uploadResponse.id,
    websocket
  };
};

// =============================================================================
// Conversation History API Functions
// =============================================================================

/**
 * Get conversation history for a document
 */
export const getConversationHistory = async (documentId: string, limit: number = 100): Promise<{
  document_id: string;
  messages: Array<{
    id: string;
    document_id: string;
    role: string;
    content: string;
    created_at: string;
    sources?: string;
    debug_path?: string;
  }>;
  count: number;
}> => {
  const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}/conversations?limit=${limit}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `Failed to get conversation history: ${response.statusText}`);
  }

  return await response.json();
};

/**
 * Save a conversation message
 */
export const saveConversationMessage = async (
  documentId: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: SourceInfo[],
  debugPath?: string[]
): Promise<{ id: string; document_id: string; role: string; created: boolean }> => {
  const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role,
      content,
      sources,
      debug_path: debugPath,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `Failed to save message: ${response.statusText}`);
  }

  return await response.json();
};

/**
 * Delete all conversation history for a document
 */
export const deleteConversationHistory = async (documentId: string): Promise<{
  document_id: string;
  deleted: number;
  message: string;
}> => {
  const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}/conversations`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `Failed to delete conversation history: ${response.statusText}`);
  }

  return await response.json();
};
