import { TenderProject, TenderSection, TenderOutline, ExportConfig, RewriteRequest, Node, AIConfig } from '../types';
import { chatWithDocument } from './apiService';
import { generateSectionContentPrompt, generateRewritePrompt, generateOutlinePrompt } from '../utils/promptTemplates';
import { extractJSONFromResponse, validateOutlineSections } from '../utils/jsonParser';

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

  } catch (error: any) {
    console.error('大纲生成失败:', error);

    // User-friendly error messages
    if (error.message.includes('空响应')) {
      throw new Error('AI 返回空响应，请重试');
    }
    if (error.message.includes('JSON') || error.message.includes('json')) {
      throw new Error('AI 返回格式不正确，请重试');
    }
    if (error.message.includes('章节')) {
      throw new Error('生成的大纲不完整，请尝试简化您的要求');
    }

    throw new Error(`大纲生成失败: ${error.message}`);
  }
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
  documentId?: string
): Promise<string> {
  // Build the prompt using templates
  const prompt = generateSectionContentPrompt(
    sectionTitle,
    '', // description
    tenderTree,
    [], // requirementReferences
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
 * Rewrite text using AI
 */
export async function rewriteText(
  text: string,
  mode: RewriteRequest['mode'],
  context?: string,
  aiConfig?: AIConfig
): Promise<string> {
  // Build the rewrite prompt
  const prompt = generateRewritePrompt(text, mode, context);

  try {
    // Since rewrite doesn't require document context, we could use a simpler API
    // For now, return a mock response with proper prefix
    await new Promise(resolve => setTimeout(resolve, 800));

    const modePrefixes: Record<string, string> = {
      'formal': '经审慎核实，',
      'concise': '简言之，',
      'expand': '详细说明如下：',
      'clarify': '明确指出，'
    };

    return modePrefixes[mode] + text;
  } catch (error) {
    console.error('Failed to rewrite text:', error);
    throw error;
  }
}

/**
 * Save tender project
 */
export async function saveProject(project: TenderProject): Promise<void> {
  // TODO: Implement with actual API call
  console.log('Saving project:', project);
  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * Load tender project
 */
export async function loadProject(projectId: string): Promise<TenderProject> {
  // TODO: Implement with actual API call
  throw new Error('Not implemented yet');
}

/**
 * List all projects
 */
export async function listProjects(): Promise<TenderProject[]> {
  // TODO: Implement with actual API call
  return [];
}

/**
 * Export document
 */
export async function exportDocument(
  projectId: string,
  config: ExportConfig
): Promise<Blob> {
  // TODO: Implement with actual API call
  // For now, return a mock blob

  await new Promise(resolve => setTimeout(resolve, 1000));

  const mockContent = `投标文件\n\n导出时间：${new Date().toLocaleString('zh-CN')}\n格式：${config.format}`;
  return new Blob([mockContent], { type: 'text/plain' });
}

/**
 * Convert outline to tender sections
 */
export function convertOutlineToSections(outline: TenderOutline): TenderSection[] {
  return outline.sections.map(section => ({
    id: section.id,
    title: section.title,
    content: '',
    summary: section.description,
    requirementReferences: [],
    status: 'pending',
    order: section.order
  }));
}
