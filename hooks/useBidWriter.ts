import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { TenderProject, TenderSection, WorkflowState, RewriteRequest, TenderOutline, ExportConfig, Node } from '../types';
import { type BidEditorRef } from '../components/BidEditor';
import {
  convertOutlineToSections,
  saveProject,
  rewriteText,
  autoSaveSectionContent,
} from '../services/bidWriterService';
import { generateWordDocument } from '../utils/wordExport';
import { saveAs } from 'file-saver';

type ViewMode = 'upload' | 'gallery' | 'chat' | 'bid-writer';

export interface BidWriterState {
  tenderProject: TenderProject | null;
  setTenderProject: (p: TenderProject | null) => void;
  activeSectionId: string;
  setActiveSectionId: (id: string) => void;
  workflowState: WorkflowState;
  showLeftPanel: boolean;
  setShowLeftPanel: (v: boolean) => void;
  showRightPanel: boolean;
  setShowRightPanel: (v: boolean) => void;
  showExportModal: boolean;
  setShowExportModal: (v: boolean) => void;
  showDocumentSelector: boolean;
  setShowDocumentSelector: (v: boolean) => void;
  bidEditorRef: React.RefObject<BidEditorRef>;
  handleStartBidWriter: () => void;
  startBidWriterWithTree: (tree: Node, docId: string) => void;
  handleSectionSelect: (sectionId: string) => void;
  handleSectionUpdate: (updatedSection: TenderSection) => void;
  handleRewrite: (request: RewriteRequest) => Promise<string>;
  handleSectionContentGenerated: (sectionId: string, content: string) => void;
  handleOutlineGenerated: (outline: TenderOutline) => void;
  handleCancelOutline: () => void;
  handleReEditOutline: () => void;
  handleExport: (config: ExportConfig) => Promise<void>;
}

export function useBidWriter(
  tree: Node | null,
  currentDocumentId: string | null,
  setViewMode: (mode: ViewMode) => void,
): BidWriterState {
  const [tenderProject, setTenderProject] = useState<TenderProject | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string>('');
  const [workflowState, setWorkflowState] = useState<WorkflowState>({ currentStep: 'outline' });
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDocumentSelector, setShowDocumentSelector] = useState(false);
  const bidEditorRef = useRef<BidEditorRef>(null);

  // Backend persistence tracking
  const backendProjectIdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleStartBidWriter = () => {
    if (!tree) return;
    startBidWriterWithTree(tree, currentDocumentId || tree.id);
  };

  const startBidWriterWithTree = (treeArg: Node, docId: string) => {
    backendProjectIdRef.current = null; // Reset for new project
    const newProject: TenderProject = {
      id: `project-${Date.now()}`,
      title: `投标文件 - ${treeArg.title}`,
      tenderDocumentId: docId,
      tenderDocumentTree: treeArg,
      sections: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'draft',
    };
    setTenderProject(newProject);
    setWorkflowState({ currentStep: 'outline' });
    setViewMode('bid-writer');
  };

  const handleSectionSelect = (sectionId: string) => {
    setActiveSectionId(sectionId);
  };

  const handleSectionUpdate = useCallback((updatedSection: TenderSection) => {
    setTenderProject(prev => {
      if (!prev) return null;
      // Auto-status: pending → in_progress when content is added
      let section = updatedSection;
      if (section.status === 'pending' && section.content.trim().length > 0) {
        section = { ...section, status: 'in_progress' };
      }
      const updatedSections = prev.sections.map(s =>
        s.id === section.id ? section : s
      );
      return { ...prev, sections: updatedSections, updatedAt: Date.now() };
    });

    // Debounced auto-save to backend
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const projectId = backendProjectIdRef.current;
      if (projectId) {
        autoSaveSectionContent(projectId, updatedSection.id, updatedSection.content).catch(e => {
          console.warn('Auto-save failed:', e);
        });
      }
    }, 2000);
  }, []);

  const handleRewrite = async (request: RewriteRequest): Promise<string> => {
    return rewriteText(request.text, request.mode, request.context?.sectionTitle);
  };

  const handleSectionContentGenerated = (sectionId: string, content: string) => {
    setTenderProject(prev => {
      if (!prev) return null;
      const section = prev.sections.find(s => s.id === sectionId);
      if (!section) return prev;
      const updatedSection = { ...section, content: section.content + content, status: 'completed' as const };
      const updatedSections = prev.sections.map(s => s.id === sectionId ? updatedSection : s);
      return { ...prev, sections: updatedSections, updatedAt: Date.now() };
    });

    // Auto-save the generated content
    const projectId = backendProjectIdRef.current;
    if (projectId) {
      // Small delay to let state update settle
      setTimeout(() => {
        setTenderProject(prev => {
          if (!prev) return null;
          const section = prev.sections.find(s => s.id === sectionId);
          if (section) {
            autoSaveSectionContent(projectId, sectionId, section.content).catch(e => {
              console.warn('Auto-save after generation failed:', e);
            });
          }
          return prev; // No state change, just side effect
        });
      }, 500);
    }
  };

  const handleOutlineGenerated = (outline: TenderOutline) => {
    setTenderProject(prev => {
      if (!prev) return null;

      // Build sections — preserve agent-assigned IDs if present
      const sections: TenderSection[] = outline.sections.map((section, index) => ({
        id: section.id || `section-${Date.now()}-${index}`,
        title: section.title,
        content: '',
        summary: section.description,
        requirementReferences: [],
        status: 'pending' as const,
        order: section.order,
      }));

      // If projectId comes from agent pipeline, it already exists on backend
      const agentProjectId = outline.projectId;
      const isAgentProject = agentProjectId.includes('-') && agentProjectId.length > 20;

      const updatedProject: TenderProject = {
        ...prev,
        id: isAgentProject ? agentProjectId : prev.id,
        sections,
        updatedAt: Date.now(),
      };

      if (isAgentProject) {
        // Project was created by agent pipeline — just update with edited sections
        backendProjectIdRef.current = agentProjectId;
        saveProject(updatedProject).then(() => {
          toast.success('项目已保存');
        }).catch(e => {
          console.warn('Failed to update agent project:', e);
        });
      } else {
        // Original flow: create new project on backend
        saveProject(updatedProject).then(savedProject => {
          backendProjectIdRef.current = savedProject.id;
          setTenderProject(current => {
            if (!current) return null;
            if (current.id === updatedProject.id) {
              return { ...current, id: savedProject.id };
            }
            return current;
          });
          toast.success('项目已保存');
        }).catch(e => {
          console.warn('Failed to save project to backend:', e);
          toast.error('项目保存失败，编辑内容仅保留在本地');
        });
      }

      if (sections.length > 0) setActiveSectionId(sections[0].id);
      setWorkflowState({ currentStep: 'writing', outline });
      return updatedProject;
    });
  };

  const handleCancelOutline = () => {
    backendProjectIdRef.current = null;
    setTenderProject(null);
    setViewMode('chat');
  };

  const handleReEditOutline = () => {
    // Go back to outline step — clears sections so OutlineGenerator shows
    setTenderProject(prev => {
      if (!prev) return null;
      return { ...prev, sections: [], updatedAt: Date.now() };
    });
    setWorkflowState({ currentStep: 'outline' });
    setActiveSectionId('');
  };

  const handleExport = async (config: ExportConfig) => {
    if (!tenderProject) return;
    try {
      const blob = await generateWordDocument(tenderProject, config);
      saveAs(blob, `${tenderProject.title}.docx`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出失败');
    }
  };

  return {
    tenderProject, setTenderProject,
    activeSectionId, setActiveSectionId,
    workflowState,
    showLeftPanel, setShowLeftPanel,
    showRightPanel, setShowRightPanel,
    showExportModal, setShowExportModal,
    showDocumentSelector, setShowDocumentSelector,
    bidEditorRef,
    handleStartBidWriter, startBidWriterWithTree, handleSectionSelect, handleSectionUpdate,
    handleRewrite, handleSectionContentGenerated,
    handleOutlineGenerated, handleCancelOutline, handleReEditOutline, handleExport,
  };
}
