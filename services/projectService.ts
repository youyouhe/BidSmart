/**
 * Project Service for Bid Writing
 *
 * Handles CRUD operations for bid writing projects,
 * including auto-save functionality.
 */

import { TenderProject, TenderSection } from '../types';

// API Configuration
const REMOTE_API_URL = import.meta.env.VITE_PAGEINDEX_API_URL || import.meta.env.NEXT_PUBLIC_PAGEINDEX_API_URL || 'http://192.168.8.107:8003';
const IS_DEV = import.meta.env.DEV;
const API_BASE_URL = IS_DEV ? '' : REMOTE_API_URL;

// ====================
// Types
// ====================

export interface CreateProjectRequest {
  title: string;
  tender_document_id: string;
  tender_document_tree: Record<string, unknown>;
  sections: TenderSection[];
}

export interface AutoSaveResponse {
  success: boolean;
  saved_at: number;
}

// ====================
// Project CRUD Operations
// ====================

/**
 * Create a new bid writing project
 */
export const createProject = async (request: CreateProjectRequest): Promise<TenderProject> => {
  const response = await fetch(`${API_BASE_URL}/api/bid/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Failed to create project: ${response.statusText}`);
  }

  return await response.json();
};

/**
 * List all bid writing projects
 */
export const listProjects = async (): Promise<TenderProject[]> => {
  const response = await fetch(`${API_BASE_URL}/api/bid/projects`, {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Failed to list projects: ${response.statusText}`);
  }

  return await response.json();
};

/**
 * Get a specific project by ID
 */
export const getProject = async (projectId: string): Promise<TenderProject> => {
  const response = await fetch(`${API_BASE_URL}/api/bid/projects/${projectId}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Failed to get project: ${response.statusText}`);
  }

  return await response.json();
};

/**
 * Update a project
 */
export const updateProject = async (projectId: string, project: TenderProject): Promise<TenderProject> => {
  const response = await fetch(`${API_BASE_URL}/api/bid/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(project),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Failed to update project: ${response.statusText}`);
  }

  return await response.json();
};

/**
 * Delete a project
 */
export const deleteProject = async (projectId: string): Promise<{ id: string; deleted: boolean }> => {
  const response = await fetch(`${API_BASE_URL}/api/bid/projects/${projectId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Failed to delete project: ${response.statusText}`);
  }

  return await response.json();
};

// ====================
// Auto-save Operations
// ====================

/**
 * Auto-save a section's content
 *
 * This is designed for frequent calls from the frontend (debounced)
 */
export const autoSaveSection = async (
  projectId: string,
  sectionId: string,
  content: string
): Promise<AutoSaveResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/bid/projects/${projectId}/sections/${sectionId}/auto-save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Auto-save failed: ${response.statusText}`);
  }

  return await response.json();
};

// ====================
// Bid Content Generation
// ====================

/**
 * Generate bid section content using AI
 */
export const generateBidContent = async (params: {
  section_id: string;
  section_title: string;
  section_description: string;
  tender_tree: any;
  requirement_references?: string[];
  previous_context?: string;
  user_prompt?: string;
  attachments?: string[];
}): Promise<{ content: string; provider: string; model: string; generated_at: number }> => {
  const response = await fetch(`${API_BASE_URL}/api/bid/content/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Content generation failed: ${response.statusText}`);
  }

  return await response.json();
};

/**
 * Rewrite text using AI
 */
export const rewriteBidText = async (params: {
  text: string;
  mode: 'formal' | 'concise' | 'expand' | 'clarify';
  context?: string;
}): Promise<{ rewritten_text: string; provider: string; model: string }> => {
  const response = await fetch(`${API_BASE_URL}/api/bid/content/rewrite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Rewrite failed: ${response.statusText}`);
  }

  return await response.json();
};

// ====================
// Export Operations
// ====================

/**
 * Export a project as Word document
 */
export const exportProjectToWord = async (
  projectId: string,
  config: {
    format: 'word' | 'pdf';
    include_outline: boolean;
    include_requirements: boolean;
  }
): Promise<Blob> => {
  const response = await fetch(`${API_BASE_URL}/api/bid/projects/${projectId}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || error.message || `Export failed: ${response.statusText}`);
  }

  return await response.blob();
};
