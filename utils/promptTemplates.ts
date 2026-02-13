import { Node, OutlineSection } from '../types';

/**
 * Generate prompt for creating tender bid outline
 */
export function generateOutlinePrompt(
  tenderTree: Node,
  userRequirements?: string
): string {
  // Format tree structure for the prompt
  const treeStructure = formatTreeStructure(tenderTree);

  return `你是一个专业的投标文件编写专家。请根据以下招标文档大纲和用户要求，生成投标文件大纲。

=== 招标文档结构 ===
${treeStructure}

=== 用户补充要求 ===
${userRequirements || "无特殊要求"}

=== 任务要求 ===
1. 分析招标文档的章节结构
2. 识别必须响应的技术和商务要求
3. 构建投标文件大纲，包含:
   - 投标函
   - 技术方案响应
   - 商务条款响应
   - 资质证明
   - 其他必要章节
4. 每个章节说明:
   - 章节标题
   - 主要内容描述
   - 对应的招标要求章节引用

请以JSON格式返回大纲结构：
{
  "sections": [
    {
      "id": "section-1",
      "title": "章节标题",
      "description": "章节描述",
      "requirementSummary": "对应的招标要求摘要",
      "order": 1
    }
  ]
}`;
}

/**
 * Generate prompt for writing section content
 */
export function generateSectionContentPrompt(
  sectionTitle: string,
  sectionDescription: string,
  tenderTree: Node,
  requirementReferences: string[],
  previousSections?: string,
  userPrompt?: string,
  attachments?: string[]
): string {
  const relevantRequirements = getRelevantRequirements(tenderTree, requirementReferences);

  return `你是一个专业的投标文件编写专家。请根据招标要求编写投标文件章节。

=== 当前章节 ===
标题：${sectionTitle}
描述：${sectionDescription}

=== 对应招标要求 ===
${relevantRequirements || '无具体要求'}

=== 前文上下文 ===
${previousSections || '（无）'}

=== 用户补充说明 ===
${userPrompt || '无'}

=== 用户提供的附件内容 ===
${attachments?.join('\n') || '无'}

=== 编写要求 ===
1. 严格按照招标要求编写
2. 使用专业、规范的商务语言
3. 突出公司优势和符合性
4. 结构清晰，逻辑严密
5. 语言简练，避免冗余

请生成该章节的完整内容。`;
}

/**
 * Generate prompt for text rewriting
 */
export function generateRewritePrompt(
  originalText: string,
  mode: 'formal' | 'concise' | 'expand' | 'clarify',
  context?: string
): string {
  const modeDescriptions = {
    'formal': '正式化 - 使语言更加正式、规范，符合商务文件要求',
    'concise': '精简 - 去除冗余，保留核心信息，使表达更加简洁',
    'expand': '扩充 - 增加细节和说明，使内容更加充实完整',
    'clarify': '澄清 - 使表达更加清晰明确，避免歧义'
  };

  const modeInstructions = {
    'formal': '使用商务正式用语，适当使用被动语态，增加专业术语',
    'concise': '删除重复和不必要的词语，保留关键信息，使用更直接的表达',
    'expand': '在原有内容基础上增加详细说明、具体例子和补充信息',
    'clarify': '重新组织句子结构，使用更明确的词汇，消除模糊表达'
  };

  return `请对以下投标文件文本进行改写。

=== 改写模式 ===
${modeDescriptions[mode]}

=== 原文 ===
${originalText}

${context ? `=== 上下文 ===\n${context}\n` : ''}

=== 改写要求 ===
${modeInstructions[mode]}

请直接返回改写后的文本，不要解释或添加其他内容。`;
}

/**
 * Helper function to format tree structure for prompt
 */
function formatTreeStructure(node: Node, indent = 0): string {
  const prefix = '  '.repeat(indent);
  let result = `${prefix}${node.title}\n`;

  if (node.summary) {
    result += `${prefix}  摘要: ${node.summary}\n`;
  }

  for (const child of node.children) {
    result += formatTreeStructure(child, indent + 1);
  }

  return result;
}

/**
 * Helper function to get relevant requirements from tree
 */
function getRelevantRequirements(tree: Node, nodeIds: string[]): string {
  if (!nodeIds || nodeIds.length === 0) {
    return '无具体引用要求';
  }

  const requirements: string[] = [];

  function searchNode(node: Node): void {
    if (nodeIds.includes(node.id)) {
      let req = `【${node.title}】`;
      if (node.summary) {
        req += `\n摘要: ${node.summary}`;
      }
      requirements.push(req);
    }

    for (const child of node.children) {
      searchNode(child);
    }
  }

  searchNode(tree);

  return requirements.length > 0
    ? requirements.join('\n\n')
    : '未找到对应的要求内容';
}

/**
 * Generate summary for completed bid document
 */
export function generateProjectSummary(
  projectName: string,
  sectionCount: number,
  completedCount: number,
  totalWords: number
): string {
  return `投标文件编写完成

项目：${projectName}
总章节：${sectionCount}
已完成：${completedCount}
总字数：${totalWords.toLocaleString()}

完成度：${((completedCount / sectionCount) * 100).toFixed(1)}%`;
}
