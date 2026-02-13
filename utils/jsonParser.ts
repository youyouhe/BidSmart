import { OutlineSection } from '../types';

/**
 * Extract the first balanced JSON object from a string.
 * Tracks brace depth to find the matching closing brace,
 * respecting strings so that braces inside quotes are ignored.
 */
function extractBalancedJSON(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * Extract JSON from AI response with multiple fallback strategies
 * Handles: pure JSON, markdown code blocks, JSON with explanatory text
 */
export function extractJSONFromResponse(answer: string): unknown {
  if (!answer || answer.trim().length === 0) {
    throw new Error('AI 返回空响应');
  }

  // Method 1: Direct JSON parse
  try {
    return JSON.parse(answer);
  } catch {
    // Continue to next method
  }

  // Method 2: Extract markdown code block (object or array)
  const markdownMatch = answer.match(/```(?:json)?\s*([\[{][\s\S]*?[\]}])\s*```/);
  if (markdownMatch) {
    try {
      return JSON.parse(markdownMatch[1]);
    } catch {
      // Continue to next method
    }
  }

  // Method 3: Find JSON object with balanced braces
  const jsonObject = extractBalancedJSON(answer);
  if (jsonObject) {
    try {
      return JSON.parse(jsonObject);
    } catch {
      // Continue to next method
    }
  }

  // Method 4: Find JSON array with balanced brackets
  const arrayStart = answer.indexOf('[');
  if (arrayStart !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = arrayStart; i < answer.length; i++) {
      const ch = answer[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(answer.slice(arrayStart, i + 1));
          } catch { break; }
        }
      }
    }
  }

  throw new Error('无法从响应中提取有效的 JSON');
}

/**
 * Locate the sections array from various AI response formats:
 *   { "sections": [...] }
 *   { "outline": [...] }
 *   { "data": { "sections": [...] } }
 *   [ ... ]   (bare array)
 *   { "anyKey": [...] }  (single-array object)
 */
function findSectionsArray(data: unknown): unknown[] | null {
  // Bare array
  if (Array.isArray(data)) return data;

  if (!data || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;

  // Known key names
  for (const key of ['sections', 'outline', 'data', 'chapters']) {
    const val = record[key];
    if (Array.isArray(val)) return val;
    // One level deeper (e.g. { data: { sections: [...] } })
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const inner = val as Record<string, unknown>;
      for (const k2 of ['sections', 'outline', 'chapters']) {
        if (Array.isArray(inner[k2])) return inner[k2] as unknown[];
      }
    }
  }

  // Fallback: use the first array-valued property
  for (const key of Object.keys(record)) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }

  return null;
}

/**
 * Validate and sanitize outline sections data
 * Ensures all required fields are present and valid
 */
export function validateOutlineSections(data: unknown): OutlineSection[] {
  const sections = findSectionsArray(data);

  if (!sections) {
    throw new Error('响应缺少 sections 数组');
  }

  if (sections.length === 0) {
    throw new Error('大纲不包含任何章节');
  }

  // Validate and sanitize each section
  return sections.map((section: unknown, index: number) => {
    const s = (section && typeof section === 'object' ? section : {}) as Record<string, unknown>;
    const id = (s.id as string) || `section-${Date.now()}-${index}`;
    const title = (typeof s.title === 'string' ? s.title.trim() : '') || `章节 ${index + 1}`;
    const description = typeof s.description === 'string' ? s.description.trim() : '';
    const requirementSummary = typeof s.requirementSummary === 'string' ? s.requirementSummary.trim() : '';
    const order = (typeof s.order === 'number' ? s.order : 0) || (index + 1);

    return {
      id,
      title,
      description,
      requirementSummary,
      order
    };
  });
}
