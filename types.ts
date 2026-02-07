export interface Node {
  id: string;
  title: string;
  content: string;
  level: number;
  children: Node[];
  summary?: string; // Optional summary from remote API
  display_title?: string; // Cleaned title with id prepended for UI display (e.g., "1 项目概况")
  is_noise?: boolean; // Whether this is an invalid entry (headers, footers, metadata)
  page_start?: number; // PDF: starting page number (1-based)
  page_end?: number; // PDF: ending page number (1-based)
  line_start?: number; // Markdown: starting line number
}

// Available LLM providers
export const AVAILABLE_PROVIDERS = ['deepseek', 'openai', 'google', 'openrouter', 'zhipu'] as const;
export type ProviderType = typeof AVAILABLE_PROVIDERS[number];

// Remote API response types
export interface SourceInfo {
  id: string;
  title: string;
  relevance: number;
}

export interface RemoteParseResponse {
  success: boolean;
  message: string;
  tree: Node;
  stats: {
    total_nodes: number;
    max_depth: number;
    total_characters: number;
    total_tokens: number;
    has_summaries: boolean;
    has_content: boolean;
  };
}

export interface RemoteChatResponse {
  answer: string;
  sources: SourceInfo[];
  debug_path: string[];
  provider: string;
  model: string;
  system_prompt?: string; // System prompt used for generating the response
  raw_output?: string; // Raw LLM output (truncated to 500 chars)
}

export interface HealthCheckResponse {
  status: string;
  version: string;
  provider: string;
  model: string;
  available_providers: ProviderType[];
}

// Backward compatible types
export interface IndexTreeResponse {
  tree: Node;
  stats: {
    total_nodes: number;
    filename?: string; // Local API only
    max_depth?: number; // Remote API only
    total_characters?: number; // Remote API only
    total_tokens?: number; // Remote API only
    has_summaries?: boolean; // Remote API only
    has_content?: boolean; // Remote API only
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  question: string;
  tree: Node;
  history?: ChatMessage[];
  document_id?: string; // Document ID for loading PDF page content dynamically
}

export interface ChatResponse {
  answer: string;
  source_node: string; // Legacy single source
  sources?: SourceInfo[]; // New array of sources from remote API
  debug_path: string[];
  provider?: string; // Remote API only
  model?: string; // Remote API only
  system_prompt?: string; // System prompt used for generating the response
  raw_output?: string; // Raw LLM output (truncated to 500 chars)
}

export interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
  debugPath?: string[]; // Optional path to highlight when displaying this message
  thinkingSteps?: string[]; // For UI effect
  sourceNode?: string; // Legacy single source
  sources?: SourceInfo[]; // New array of sources
}

export type ThinkingState = 'idle' | 'routing' | 'diving' | 'generating';

// Document Management API types
export type ParseStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Performance statistics from document parsing
export interface PerformanceStage {
  duration: number;
}

export interface PerformanceStats {
  total_duration_seconds: number;
  total_llm_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  stages: Record<string, PerformanceStage>;
  llm_calls_by_stage: Record<string, number>;
}

export interface Document {
  id: string;
  filename: string;
  file_type: 'markdown' | 'pdf';
  file_size_bytes: number;
  title: string | null;
  description: string | null;
  parse_status: ParseStatus;
  error_message: string | null;
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
  performance?: PerformanceStats | null; // Performance statistics from latest parse
  metadata?: {
    progress?: number;
    stage?: string;
    message?: string;
    [key: string]: any;
  };
  category?: string | null; // Document category
  tags?: string[]; // Document tags
}

export interface DocumentListResponse {
  items: Document[];
  count: number;
  limit: number;
  offset: number;
}

// GET /api/documents/{id}/tree returns just the Node directly
export type DocumentTreeResponse = Node;

export interface DeleteDocumentResponse {
  id: string;
  deleted: boolean;
  files_deleted: {
    upload_deleted: boolean;
    parse_results_deleted: boolean;
  };
}

// POST /api/documents/upload response
export interface UploadDocumentResponse {
  id: string;
  filename: string;
  file_type: string;
  file_size_bytes: number;
  parse_status: string;
  message: string;
}

// Transform backend Document to GalleryItem
export interface GalleryItem {
  id: string;
  title: string;
  category: string; // Document category (e.g., "教育招标", "政府采购")
  date: string;
  description: string;
  parseStatus: ParseStatus;
  tags?: string[]; // Document tags
}

// ====================
// Bid Writer Types
// ====================

// Tender outline structure
export interface OutlineSection {
  id: string;
  title: string;
  description: string;
  requirementSummary: string; // Corresponding tender requirement summary
  order: number;
  children?: OutlineSection[];
}

export interface TenderOutline {
  projectId: string;
  sections: OutlineSection[];
  generatedAt: number;
  attachments?: TenderAttachment[];
}

export interface TenderAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

// Tender section in bid document
export interface TenderSection {
  id: string;
  title: string;
  content: string;
  summary?: string;
  requirementReferences: string[]; // References to tender document node IDs
  status: 'pending' | 'in_progress' | 'completed';
  order: number;
  pages?: string[]; // Split content into pages for A4 display
}

// Tender project (bid document)
export interface TenderProject {
  id: string;
  title: string;
  tenderDocumentId: string; // Associated tender document ID
  tenderDocumentTree: Node; // Tender document tree structure
  sections: TenderSection[];
  createdAt: number;
  updatedAt: number;
  status: 'draft' | 'review' | 'completed';
}

// Workflow state
export type WorkflowStep = 'outline' | 'writing' | 'rewriting' | 'exporting';

export interface WorkflowState {
  currentStep: WorkflowStep;
  activeSectionId?: string;
  outline?: TenderOutline;
}

// Text rewrite request
export interface RewriteRequest {
  text: string;
  mode: 'formal' | 'concise' | 'expand' | 'clarify';
  context?: {
    sectionTitle: string;
    requirementText: string;
  };
}

// Document export configuration
export interface ExportConfig {
  format: 'word' | 'pdf';
  includeOutline: boolean;
  includeRequirements: boolean;
  template?: 'standard' | 'custom';
}

// AI configuration (from NovelFlow)
export interface AIConfig {
  provider: 'google' | 'deepseek' | 'openai' | 'openrouter' | 'zhipu';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

// Writing language
export type WritingLanguage = 'zh' | 'en' | 'ja' | 'ko';
