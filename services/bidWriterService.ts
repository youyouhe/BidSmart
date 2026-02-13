import { TenderProject, TenderSection, TenderOutline, ExportConfig, RewriteRequest, Node, AIConfig } from '../types';
import { chatWithDocument } from './apiService';
import { generateSectionContentPrompt, generateRewritePrompt, generateOutlinePrompt } from '../utils/promptTemplates';
import { extractJSONFromResponse, validateOutlineSections } from '../utils/jsonParser';
import {
  createProject as apiCreateProject,
  getProject as apiGetProject,
  listProjects as apiListProjects,
  updateProject as apiUpdateProject,
  rewriteBidText,
  autoSaveSection as apiAutoSaveSection,
  exportProjectToWord,
} from './projectService';

// =============================================================================
// Backend ↔ Frontend format conversion (snake_case ↔ camelCase)
// =============================================================================

function toBackendSection(s: TenderSection): Record<string, unknown> {
  return {
    id: s.id,
    title: s.title,
    content: s.content,
    summary: s.summary || '',
    requirement_references: s.requirementReferences,
    status: s.status,
    order: s.order,
    word_count: s.content.length,
  };
}

function fromBackendSection(s: Record<string, unknown>): TenderSection {
  return {
    id: s.id as string,
    title: s.title as string,
    content: (s.content as string) || '',
    summary: (s.summary as string) || '',
    requirementReferences: (s.requirement_references as string[]) || [],
    status: (s.status as TenderSection['status']) || 'pending',
    order: (s.order as number) || 0,
  };
}

function fromBackendProject(data: Record<string, unknown>): TenderProject {
  return {
    id: data.id as string,
    title: data.title as string,
    tenderDocumentId: data.tender_document_id as string,
    tenderDocumentTree: data.tender_document_tree as Node,
    sections: ((data.sections as Record<string, unknown>[]) || []).map(fromBackendSection),
    createdAt: data.created_at as number,
    updatedAt: data.updated_at as number,
    status: (data.status as TenderProject['status']) || 'draft',
  };
}

/**
 * Generate tender bid outline based on tender document tree
 */
export async function generateOutline(
  tenderTree: Node,
  userRequirements?: string,
  aiConfig?: AIConfig,
  attachments?: string[],
  documentId?: string
): Promise<TenderOutline> {
  try {
    // Step 1: Generate prompt using template
    const prompt = generateOutlinePrompt(tenderTree, userRequirements);

    // Step 2: Call API
    const response = await chatWithDocument(prompt, tenderTree, [], documentId);

    // Step 3: Extract and parse JSON from response
    const parsedData = extractJSONFromResponse(response.answer);
    const sections = validateOutlineSections(parsedData);

    // Step 4: Map attachments (names only, as we don't have file content)
    const mappedAttachments = attachments?.map((name, index) => ({
      id: `attachment-${Date.now()}-${index}`,
      name,
      size: 0, // Unknown - only names are passed
      type: name.split('.').pop() || 'unknown'
    }));

    // Step 5: Build tender outline response
    return {
      projectId: `project-${Date.now()}`,
      sections,
      generatedAt: Date.now(),
      attachments: mappedAttachments
    };

  } catch (error: unknown) {
    console.error('大纲生成失败:', error);

    const message = error instanceof Error ? error.message : String(error);

    // User-friendly error messages
    if (message.includes('空响应')) {
      throw new Error('AI 返回空响应，请重试');
    }
    if (message.includes('JSON') || message.includes('json')) {
      throw new Error('AI 返回格式不正确，请重试');
    }
    if (message.includes('章节')) {
      throw new Error('生成的大纲不完整，请尝试简化您的要求');
    }

    throw new Error(`大纲生成失败: ${message}`);
  }
}

/**
 * Generate outline via multi-agent pipeline (format-extractor → outline-planner).
 * Returns immediately with a projectId; actual generation runs in backend.
 * Subscribe to WebSocket status updates using the returned projectId.
 */
export async function generateOutlineViaAgents(
  tenderDocumentTree: Node,
  tenderDocumentId: string,
  title: string,
  userRequirements?: string,
  attachmentNames?: string[],
): Promise<{ projectId: string }> {
  const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_PAGEINDEX_API_URL || 'http://192.168.8.107:8003');
  const response = await fetch(`${API_BASE_URL}/api/bid/outline/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tender_document_id: tenderDocumentId,
      tender_document_tree: tenderDocumentTree,
      title,
      user_requirements: userRequirements || null,
      attachment_names: attachmentNames || null,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Agent outline generation failed: ${err}`);
  }

  const data = await response.json();
  return { projectId: data.project_id };
}

/**
 * Generate section content using AI
 */
export async function generateSectionContent(
  sectionId: string,
  sectionTitle: string,
  tenderTree: Node,
  userPrompt?: string,
  previousContext?: string,
  attachments?: string[],
  aiConfig?: AIConfig,
  documentId?: string,
  sectionDescription?: string,
  requirementReferences?: string[]
): Promise<string> {
  // Build the prompt using templates
  const prompt = generateSectionContentPrompt(
    sectionTitle,
    sectionDescription || '',
    tenderTree,
    requirementReferences || [],
    previousContext,
    userPrompt,
    attachments
  );

  try {
    // Use the existing chat API
    const response = await chatWithDocument(prompt, tenderTree, [], documentId);

    return response.answer;
  } catch (error) {
    console.error('Failed to generate section content:', error);
    throw error;
  }
}

/**
 * Rewrite text using AI (calls backend /api/bid/content/rewrite)
 */
export async function rewriteText(
  text: string,
  mode: RewriteRequest['mode'],
  context?: string,
  _aiConfig?: AIConfig
): Promise<string> {
  const result = await rewriteBidText({ text, mode, context });
  return result.rewritten_text;
}

/**
 * Save tender project to backend.
 * Creates if not yet persisted, updates if already exists.
 * Returns the project with backend-assigned ID.
 */
export async function saveProject(project: TenderProject): Promise<TenderProject> {
  try {
    // Try update first (project already on backend)
    const result = await apiUpdateProject(project.id, {
      id: project.id,
      title: project.title,
      tender_document_id: project.tenderDocumentId,
      tender_document_tree: project.tenderDocumentTree,
      sections: project.sections.map(toBackendSection),
      status: project.status,
      created_at: project.createdAt,
      updated_at: Date.now(),
    } as any);
    return fromBackendProject(result as any);
  } catch {
    // Update failed (likely 404) — create new project
    const result = await apiCreateProject({
      title: project.title,
      tender_document_id: project.tenderDocumentId,
      tender_document_tree: project.tenderDocumentTree as any,
      sections: project.sections.map(toBackendSection) as any,
    });
    return fromBackendProject(result as any);
  }
}

/**
 * Load tender project from backend
 */
export async function loadProject(projectId: string): Promise<TenderProject> {
  const result = await apiGetProject(projectId);
  return fromBackendProject(result as any);
}

/**
 * List all projects from backend
 */
export async function listProjects(): Promise<TenderProject[]> {
  const results = await apiListProjects();
  return (results as any[]).map(fromBackendProject);
}

/**
 * Auto-save a single section's content to backend
 */
export async function autoSaveSectionContent(
  projectId: string,
  sectionId: string,
  content: string,
): Promise<void> {
  await apiAutoSaveSection(projectId, sectionId, content);
}

/**
 * Export project as Word document
 */
export async function exportDocument(
  projectId: string,
  config: ExportConfig
): Promise<Blob> {
  return exportProjectToWord(projectId, {
    format: config.format,
    include_outline: config.includeOutline,
    include_requirements: config.includeRequirements,
  });
}

/**
 * Convert outline to tender sections
 */
export function convertOutlineToSections(outline: TenderOutline): TenderSection[] {
  return outline.sections.map((section, index) => ({
    id: `section-${Date.now()}-${index}`,
    title: section.title,
    content: '',
    summary: section.description,
    requirementReferences: [],
    status: 'pending',
    order: section.order
  }));
}

// =============================================================================
// Agent-based Content Writing & Review
// =============================================================================

const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_PAGEINDEX_API_URL || 'http://192.168.8.107:8003');

/**
 * Write section content via multi-agent pipeline.
 * Returns immediately; subscribe to WebSocket for progress.
 *
 * @param projectId - The project to write content for
 * @param sectionIds - Specific section IDs (null = all pending)
 */
export async function writeContentViaAgents(
  projectId: string,
  sectionIds?: string[],
): Promise<{ projectId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/bid/projects/${projectId}/content/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      section_ids: sectionIds || null,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Agent content writing failed: ${err}`);
  }

  const data = await response.json();
  return { projectId: data.project_id };
}

/**
 * Review bid document via multi-agent pipeline (review-agent → compliance-checker).
 * Returns immediately; subscribe to WebSocket for progress.
 */
export async function reviewViaAgents(
  projectId: string,
): Promise<{ projectId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/bid/projects/${projectId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Agent review failed: ${err}`);
  }

  const data = await response.json();
  return { projectId: data.project_id };
}
