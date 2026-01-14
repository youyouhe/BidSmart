import { IndexTreeResponse, ChatRequest, ChatResponse } from '../types';
import { MOCK_TREE_DATA, MOCK_ANSWERS, GALLERY_ITEMS, GalleryItem } from '../constants';

const DELAY_MS = 800;

export const parseDocument = async (file: File): Promise<IndexTreeResponse> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        tree: MOCK_TREE_DATA,
        stats: { total_nodes: 15 }
      });
    }, 1500); // Simulate upload and parsing delay
  });
};

export const fetchGalleryItems = async (): Promise<GalleryItem[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(GALLERY_ITEMS);
    }, 500); 
  });
};

export const loadGalleryDocument = async (id: string): Promise<IndexTreeResponse> => {
  return new Promise((resolve) => {
    const item = GALLERY_ITEMS.find(g => g.id === id);
    const title = item ? item.title : MOCK_TREE_DATA.title;
    
    // Clone tree to modify title
    const treeWithTitle = { ...MOCK_TREE_DATA, title: title };

    setTimeout(() => {
      resolve({
        tree: treeWithTitle,
        stats: { total_nodes: 15 }
      });
    }, 1000); 
  });
};

export const chatWithDocument = async (req: ChatRequest): Promise<ChatResponse> => {
  return new Promise((resolve) => {
    // Find the best matching mock answer based on keywords
    const questionLower = req.question.toLowerCase();
    let result = MOCK_ANSWERS['default'];

    if (questionLower.includes('质保') || questionLower.includes('保修')) {
      result = MOCK_ANSWERS['质保'];
    } else if (questionLower.includes('内存') || questionLower.includes('memory')) {
      result = MOCK_ANSWERS['内存'];
    } else if (questionLower.includes('交付') || questionLower.includes('时间') || questionLower.includes('工期')) {
      result = MOCK_ANSWERS['交付'];
    } else if (questionLower.includes('cpu') || questionLower.includes('处理器') || questionLower.includes('主频')) {
      result = MOCK_ANSWERS['CPU'];
    }

    setTimeout(() => {
      resolve({
        answer: result.answer,
        source_node: result.source_node,
        debug_path: result.debug_path
      });
    }, 2500); // Simulate LLM reasoning delay
  });
};
