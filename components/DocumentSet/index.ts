/**
 * DocumentSet Components Index
 * 
 * Central export point for all document set related components
 */

export { default as DocumentSetManager } from '../DocumentSetManager';
export { default as DocumentSetCreator } from '../DocumentSetCreator';
export { default as DocumentSetDetail } from '../DocumentSetDetail';
export { default as DocumentSetQueryPanel } from '../DocumentSetQueryPanel';
export { default as MergedTreeViewer } from '../MergedTreeViewer';

// Re-export hooks for convenience
export { useDocumentSet } from '../../hooks/useDocumentSet';

// Re-export types
export type {
  DocumentSet,
  DocumentSetItem,
  DocumentSetItemType,
  DocumentSetItemRole,
  CreateDocumentSetRequest,
  DocumentSetResponse,
  DocumentSetListResponse,
  DocumentSetQueryRequest,
  DocumentSetQueryResponse,
  MergedTreeResponse,
  DocumentComparisonRequest,
  DocumentComparisonResponse,
} from '../../types';

// Re-export API functions
export {
  createDocumentSet,
  getDocumentSet,
  listDocumentSets,
  updateDocumentSet,
  deleteDocumentSet,
  addDocumentToSet,
  removeDocumentFromSet,
  queryDocumentSet,
  getMergedTree,
  compareDocuments,
  setPrimaryDocument,
} from '../../services/apiService';
