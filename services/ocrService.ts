/**
 * OCR Service for CompanyDataManager auto-fill.
 *
 * Pipeline: Image → OCR Service (/ocr/ocr/page) → Markdown text
 *           Markdown → Main API (/api/ocr/extract) → Structured JSON
 */

import { getApiBaseUrl, getAuthHeaders } from './apiService';

// ─── Types ──────────────────────────────────────────────────

export type ExtractionType =
  | 'company_profile'
  | 'team_member'
  | 'past_project'
  | 'qualification';

export interface OcrPageResponse {
  page_number: number;
  markdown_text: string;
  success: boolean;
  error?: string;
}

export interface ExtractionResponse {
  success: boolean;
  data: Record<string, unknown>;
  extraction_type: string;
  error?: string;
}

// ─── Health Check ───────────────────────────────────────────

/**
 * Check if the OCR service is available and the model is loaded.
 */
export async function checkOcrHealth(): Promise<boolean> {
  try {
    const response = await fetch('/ocr/health', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === 'healthy';
  } catch {
    return false;
  }
}

// ─── OCR Image ──────────────────────────────────────────────

/**
 * Send an image to the OCR service and return extracted markdown text.
 */
export async function ocrImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('page_number', '1');

  const response = await fetch('/ocr/ocr/page', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error('OCR 服务不可用，请确认 OCR 服务已启动 (端口 8010)');
    }
    throw new Error(`OCR 服务错误: ${response.statusText}`);
  }

  const data: OcrPageResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'OCR 识别失败');
  }

  if (!data.markdown_text || data.markdown_text.trim().length === 0) {
    throw new Error('OCR 未能识别出任何文字，请检查图片质量');
  }

  return data.markdown_text;
}

// ─── LLM Field Extraction ───────────────────────────────────

/**
 * Send OCR text to the main API for LLM-based field extraction.
 */
export async function extractFields(
  text: string,
  type: ExtractionType,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${getApiBaseUrl()}/api/ocr/extract`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ text, extraction_type: type }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `字段提取失败: ${response.statusText}`);
  }

  const data: ExtractionResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || '字段提取失败');
  }

  return data.data;
}
