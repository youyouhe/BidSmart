export interface Node {
  id: string;
  title: string;
  children: Node[];
  summary?: string; // LLM-generated section summary
  ps?: number; // PDF: starting page number (1-based)
  pe?: number; // PDF: ending page number (1-based)
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

export interface ChatToolCall {
  name: string;
  status: string;
  result?: any;
}

export interface RemoteChatResponse {
  answer: string;
  sources: SourceInfo[];
  debug_path: string[];
  provider: string;
  model: string;
  system_prompt?: string; // System prompt used for generating the response
  raw_output?: string; // Raw LLM output (truncated to 500 chars)
  tool_call?: ChatToolCall; // Tool call result if triggered
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
  tool_call?: ChatToolCall; // Tool call result if triggered
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
    [key: string]: string | number | boolean | undefined;
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

// ====================
// Timeline Types
// ====================

export type TimelineStatus = 'active' | 'expiring_soon' | 'expired' | 'future';

// Full bidding lifecycle milestone types
export type MilestoneType =
  | 'publish'         // 公告发布
  | 'doc_deadline'    // 文件获取截止
  | 'qa_deadline'     // 答疑截止
  | 'bid_deadline'    // 投标截止
  | 'opening'         // 开标
  | 'evaluation'      // 评标
  | 'award_notice'    // 中标公示
  | 'contract_sign'   // 合同签订
  | 'delivery'        // 交货
  | 'acceptance'      // 验收
  | 'warranty_start'  // 质保开始
  | 'warranty_end'    // 质保结束
  | 'payment'         // 付款
  | 'custom'          // 自定义
  // Legacy aliases (backward compatible)
  | 'deadline'        // → bid_deadline
  | 'contract_start'  // → contract_sign
  | 'contract_end';   // → warranty_end

export interface TimelineMilestone {
  name: string;
  date: string; // YYYY-MM-DD
  type: MilestoneType;
}

export interface TimelineEntry {
  id: string;
  document_id: string;
  project_name: string;
  start_date: string | null;
  end_date: string | null;
  milestones: TimelineMilestone[];
  budget: number | null;
  budget_unit: string;
  notes: string | null;
  status: TimelineStatus;
  created_at: string;
  updated_at: string;
}

export interface TimelineListResponse {
  items: TimelineEntry[];
  count: number;
  expiring_count: number;
  expired_count: number;
}

// ====================
// Company Data Types (for bid agent system)
// ====================

export interface CompanyBankInfo {
  bank_name: string;
  account_name: string;
  account_number: string;
}

export interface CompanyProfile {
  company_name: string;
  legal_representative: string;
  registration_number: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  established_date: string;
  registered_capital: string;
  qualifications: string[];
  bank_info: CompanyBankInfo;
  business_scope: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  title: string;
  certifications: string[];
  years_experience: number;
  education: string;
  key_projects: string[];
  description: string;
}

export interface PastProject {
  id: string;
  project_name: string;
  client: string;
  contract_value: number;
  currency: string;
  start_date: string;
  end_date: string;
  status: string;
  domain: string;
  description: string;
  technologies: string[];
  team_size: number;
}

export interface CapabilityDomain {
  description: string;
  areas: string[];
}

export interface CompanyCapabilities {
  [domain: string]: CapabilityDomain;
}

export interface CompanyData {
  profile: CompanyProfile;
  team: TeamMember[];
  pastProjects: PastProject[];
  capabilities: CompanyCapabilities;
}

// ====================
// Multi-Document Analysis Types
// ====================

export interface DocumentTab {
  documentId: string;
  filename: string;
  tree: Node;              // original tree from backend
  namespacedTree: Node;    // tree with prefixed node IDs
}

export interface NodeDocumentMapping {
  [namespacedNodeId: string]: {
    documentId: string;
    originalNodeId: string;
  };
}

// ====================
// DocumentSet Types
// ====================

export type DocumentSetItemType = 'tender' | 'reference' | 'template' | 'historical' | 'company';
export type DocumentSetItemRole = 'primary' | 'auxiliary' | 'reference';

export interface DocumentSetItem {
  documentId: string;
  name: string;
  isPrimary?: boolean;
  addedAt?: string;
  docType?: DocumentSetItemType;
  role?: DocumentSetItemRole;
  order?: number;
  metadata?: {
    pages?: number;
    filename?: string;
    [key: string]: any;
  };
  tree?: Node;
}

export interface DocumentSet {
  id: string;
  name: string;
  description: string;
  items: DocumentSetItem[];
  createdAt: number;
  updatedAt: number;
  projectId?: string;
}

// For creating a new document set
export interface CreateDocumentSetRequest {
  name: string;
  description?: string;
  primaryDocId: string;
  auxiliaryDocs?: Array<{
    docId: string;
    name: string;
    docType: DocumentSetItemType;
  }>;
}

// API Response types
export interface DocumentSetResponse {
  id: string;
  name: string;
  description: string;
  items: DocumentSetItem[];
  createdAt: number;
  updatedAt: number;
  projectId?: string;
}

export interface DocumentSetListResponse {
  items: DocumentSet[];
  count: number;
}

// Document set query request
export interface DocumentSetQueryRequest {
  query: string;
  scope?: 'all' | 'primary' | 'auxiliary' | string; // string = specific docId
  nodeIds?: string[];
}

export interface DocumentSetQueryResponse {
  results: Array<{
    documentId: string;
    documentName: string;
    answer: string;
    sources?: SourceInfo[];
  }>;
}

// Merged tree view
export interface MergedTreeResponse {
  tree: Node[];
  nodeDocumentMap: NodeDocumentMapping;
}

// Document comparison
export interface DocumentComparisonRequest {
  docId1: string;
  docId2: string;
  sectionPattern?: string;
}

export interface DocumentComparisonResponse {
  commonSections: string[];
  onlyInDoc1: string[];
  onlyInDoc2: string[];
}
