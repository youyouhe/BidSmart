import { useState, useCallback, useEffect } from 'react';
import {
  DocumentSet,
  DocumentSetItem,
  CreateDocumentSetRequest,
  DocumentSetQueryRequest,
  Node,
} from '../types';
import {
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
  chatDocumentSet,
  DocumentSetChatRequest,
  DocumentSetChatResponse,
} from '../services/apiService';

export interface UseDocumentSetState {
  // State
  documentSets: DocumentSet[];
  currentSet: DocumentSet | null;
  mergedTree: Node | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadDocumentSets: () => Promise<void>;
  loadDocumentSet: (id: string) => Promise<void>;
  createNewSet: (data: CreateDocumentSetRequest) => Promise<DocumentSet>;
  updateSet: (id: string, data: Partial<CreateDocumentSetRequest>) => Promise<void>;
  deleteSet: (id: string) => Promise<void>;
  addDocument: (
    setId: string,
    documentId: string,
    name: string,
    docType: string,
    role?: string
  ) => Promise<void>;
  removeDocument: (setId: string, documentId: string) => Promise<void>;
  setPrimary: (setId: string, documentId: string) => Promise<void>;
  querySet: (setId: string, query: string, scope?: string) => Promise<any>;
  loadMergedTree: (setId: string) => Promise<void>;
  compareDocs: (setId: string, docId1: string, docId2: string, sectionPattern?: string) => Promise<any>;
  chatWithSet: (setId: string, question: string, history?: Array<{ role: string; content: string }>) => Promise<DocumentSetChatResponse>;

  // Helpers
  clearError: () => void;
  getPrimaryItem: () => DocumentSetItem | null;
  getAuxiliaryItems: () => DocumentSetItem[];
  getItemsByType: (type: string) => DocumentSetItem[];
}

export function useDocumentSet(): UseDocumentSetState {
  const [documentSets, setDocumentSets] = useState<DocumentSet[]>([]);
  const [currentSet, setCurrentSet] = useState<DocumentSet | null>(null);
  const [mergedTree, setMergedTree] = useState<Node | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loadDocumentSets = useCallback(async () => {
    setIsLoading(true);
    clearError();
    try {
      const response = await listDocumentSets();
      setDocumentSets(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document sets');
    } finally {
      setIsLoading(false);
    }
  }, [clearError]);

  const loadDocumentSet = useCallback(async (id: string) => {
    setIsLoading(true);
    clearError();
    try {
      const response = await getDocumentSet(id);
      setCurrentSet(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document set');
    } finally {
      setIsLoading(false);
    }
  }, [clearError]);

  const createNewSet = useCallback(async (data: CreateDocumentSetRequest): Promise<DocumentSet> => {
    setIsLoading(true);
    clearError();
    try {
      const response = await createDocumentSet(data);
      setDocumentSets(prev => [...prev, response]);
      setCurrentSet(response);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create document set';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [clearError]);

  const updateSet = useCallback(async (id: string, data: Partial<CreateDocumentSetRequest>) => {
    setIsLoading(true);
    clearError();
    try {
      const response = await updateDocumentSet(id, data);
      setDocumentSets(prev =>
        prev.map(set => (set.id === id ? response : set))
      );
      if (currentSet?.id === id) {
        setCurrentSet(response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update document set');
    } finally {
      setIsLoading(false);
    }
  }, [clearError, currentSet]);

  const deleteSet = useCallback(async (id: string) => {
    setIsLoading(true);
    clearError();
    try {
      await deleteDocumentSet(id);
      setDocumentSets(prev => prev.filter(set => set.id !== id));
      if (currentSet?.id === id) {
        setCurrentSet(null);
        setMergedTree(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document set');
    } finally {
      setIsLoading(false);
    }
  }, [clearError, currentSet]);

  const addDocument = useCallback(async (
    setId: string,
    documentId: string,
    name: string,
    docType: string,
    role: string = 'auxiliary'
  ) => {
    setIsLoading(true);
    clearError();
    try {
      const response = await addDocumentToSet(setId, documentId, name, docType, role);
      if (currentSet?.id === setId) {
        setCurrentSet(response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add document');
    } finally {
      setIsLoading(false);
    }
  }, [clearError, currentSet]);

  const removeDocument = useCallback(async (setId: string, documentId: string) => {
    setIsLoading(true);
    clearError();
    try {
      const response = await removeDocumentFromSet(setId, documentId);
      if (currentSet?.id === setId) {
        setCurrentSet(response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove document');
    } finally {
      setIsLoading(false);
    }
  }, [clearError, currentSet]);

  const setPrimary = useCallback(async (setId: string, documentId: string) => {
    setIsLoading(true);
    clearError();
    try {
      const response = await setPrimaryDocument(setId, documentId);
      if (currentSet?.id === setId) {
        setCurrentSet(response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set primary document');
    } finally {
      setIsLoading(false);
    }
  }, [clearError, currentSet]);

  const querySet = useCallback(async (setId: string, query: string, scope: string = 'all') => {
    setIsLoading(true);
    clearError();
    try {
      const request: DocumentSetQueryRequest = { query, scope };
      const response = await queryDocumentSet(setId, request);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to query document set';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [clearError]);

  const loadMergedTree = useCallback(async (setId: string) => {
    setIsLoading(true);
    clearError();
    try {
      const response = await getMergedTree(setId);
      // Convert array to virtual root node for TreeView compatibility
      if (Array.isArray(response.tree) && response.tree.length > 0) {
        const virtualRoot: Node = {
          id: 'merged-root',
          title: '合并目录',
          children: response.tree,
          summary: '',
          ps: 0,
          pe: 0,
        };
        setMergedTree(virtualRoot);
      } else {
        setMergedTree(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load merged tree');
    } finally {
      setIsLoading(false);
    }
  }, [clearError]);

  const compareDocs = useCallback(async (
    setId: string,
    docId1: string,
    docId2: string,
    sectionPattern?: string
  ) => {
    setIsLoading(true);
    clearError();
    try {
      const response = await compareDocuments(setId, {
        docId1,
        docId2,
        sectionPattern,
      });
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to compare documents';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [clearError]);

  const chatWithSet = useCallback(async (
    setId: string,
    question: string,
    history?: Array<{ role: string; content: string }>
  ): Promise<DocumentSetChatResponse> => {
    setIsLoading(true);
    clearError();
    try {
      const response = await chatDocumentSet(setId, { question, history });
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to chat with document set';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [clearError]);

  const getPrimaryItem = useCallback((): DocumentSetItem | null => {
    if (!currentSet) return null;
    return currentSet.items.find(item => item.role === 'primary') || null;
  }, [currentSet]);

  const getAuxiliaryItems = useCallback((): DocumentSetItem[] => {
    if (!currentSet) return [];
    return currentSet.items.filter(item => item.role === 'auxiliary');
  }, [currentSet]);

  const getItemsByType = useCallback((type: string): DocumentSetItem[] => {
    if (!currentSet) return [];
    return currentSet.items.filter(item => item.docType === type);
  }, [currentSet]);

  return {
    documentSets,
    currentSet,
    mergedTree,
    isLoading,
    error,
    loadDocumentSets,
    loadDocumentSet,
    createNewSet,
    updateSet,
    deleteSet,
    addDocument,
    removeDocument,
    setPrimary,
    querySet,
    loadMergedTree,
    compareDocs,
    chatWithSet,
    clearError,
    getPrimaryItem,
    getAuxiliaryItems,
    getItemsByType,
  };
}
