import { OutlineSection } from '../types';

/**
 * Extract JSON from AI response with multiple fallback strategies
 * Handles: pure JSON, markdown code blocks, JSON with explanatory text
 */
export function extractJSONFromResponse(answer: string): any {
  if (!answer || answer.trim().length === 0) {
    throw new Error('AI 返回空响应');
  }

  // Method 1: Direct JSON parse
  try {
    return JSON.parse(answer);
  } catch {
    // Continue to next method
  }

  // Method 2: Extract markdown code block
  const markdownMatch = answer.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (markdownMatch) {
    try {
      return JSON.parse(markdownMatch[1]);
    } catch {
      // Continue to next method
    }
  }

  // Method 3: Find JSON object (handles explanatory text around it)
  const jsonObjectMatch = answer.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      return JSON.parse(jsonObjectMatch[0]);
    } catch {
      // Continue to error
    }
  }

  throw new Error('无法从响应中提取有效的 JSON');
}

/**
 * Validate and sanitize outline sections data
 * Ensures all required fields are present and valid
 */
export function validateOutlineSections(data: any): OutlineSection[] {
  if (!data || typeof data !== 'object') {
    throw new Error('响应数据格式不正确');
  }

  if (!Array.isArray(data.sections)) {
    throw new Error('响应缺少 sections 数组');
  }

  if (data.sections.length === 0) {
    throw new Error('大纲不包含任何章节');
  }

  // Validate and sanitize each section
  return data.sections.map((section: any, index: number) => {
    // Ensure required fields exist
    const id = section.id || `section-${Date.now()}-${index}`;
    const title = section.title?.trim() || `章节 ${index + 1}`;
    const description = section.description?.trim() || '';
    const requirementSummary = section.requirementSummary?.trim() || '';
    const order = section.order || (index + 1);

    return {
      id,
      title,
      description,
      requirementSummary,
      order
    };
  });
}
