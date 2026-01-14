export interface Node {
  id: string;
  title: string;
  content: string;
  level: number;
  children: Node[];
}

export interface IndexTreeResponse {
  tree: Node;
  stats: {
    total_nodes: number;
  };
}

export interface ChatRequest {
  question: string;
  tree: Node;
}

export interface ChatResponse {
  answer: string;
  source_node: string;
  debug_path: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
  debugPath?: string[]; // Optional path to highlight when displaying this message
  thinkingSteps?: string[]; // For UI effect
}

export type ThinkingState = 'idle' | 'routing' | 'diving' | 'generating';
