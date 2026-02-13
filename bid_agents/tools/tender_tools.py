"""Tools for querying tender document requirements.

Agno-compatible tool functions.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..api.client import BidSmartAPIClient
    from ..state.project_state import BidProjectState


async def query_tender_requirements(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    query: str = "",
    node_ids: str = "",
) -> str:
    """根据关键词或章节ID查询招标文档中的具体要求和内容.
    
    Args:
        query: 查询关键词，如'评分标准'、'资格要求'、'技术需求'
        node_ids: 章节ID列表(逗号分隔)，用于精确查询
    
    Returns:
        查询结果文本
    """
    if not state.tender_tree:
        return "错误：未加载招标文档树"

    # If querying for format spec, return it from state if available
    if query and any(kw in query for kw in ("格式规范", "格式要求", "format_spec")):
        if state.format_spec:
            return (
                f"投标格式规范（由 format-extractor 提取）:\n"
                f"{json.dumps(state.format_spec, ensure_ascii=False, indent=2)}"
            )

    # If specific node IDs requested, extract their content directly
    if node_ids:
        from ..models.types import Node

        tree_node = Node.from_dict(state.tender_tree)
        results = []
        for nid in node_ids.split(","):
            nid = nid.strip()
            node = tree_node.find_node(nid)
            if node:
                results.append(f"[{node.title}]\n{node.summary or '无摘要'}")
        if results:
            return "\n\n".join(results)

    # Use backend chat API for semantic search
    try:
        response = await api_client.chat_with_document(
            question=query,
            tree=state.tender_tree,
            document_id=state.tender_document_id,
        )
        answer = response.get("answer", "未找到相关内容")
        sources = response.get("sources", [])
        source_info = ""
        if sources:
            source_titles = [s.get("title", "") for s in sources[:5]]
            source_info = f"\n\n来源章节: {', '.join(source_titles)}"
        return f"{answer}{source_info}"
    except Exception as e:
        return f"查询招标要求失败: {e}"


async def get_tender_tree(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    document_id: str = "",
) -> str:
    """获取招标文档的完整树形结构，包含所有章节标题和摘要.
    
    Args:
        document_id: 文档ID（可选，默认使用当前项目的招标文档）
    
    Returns:
        文档树结构的文本表示
    """
    doc_id = document_id or state.tender_document_id

    if not doc_id:
        return "错误：未指定文档ID"

    # Return cached tree if available
    if state.tender_tree and doc_id == state.tender_document_id:
        from ..models.types import Node

        tree_node = Node.from_dict(state.tender_tree)
        return tree_node.flatten()

    try:
        tree_data = await api_client.get_document_tree(doc_id)
        tree = tree_data.get("tree", tree_data)
        state.tender_tree = tree
        state.tender_document_id = doc_id

        from ..models.types import Node

        tree_node = Node.from_dict(tree)
        return tree_node.flatten()
    except Exception as e:
        return f"获取文档树失败: {e}"
