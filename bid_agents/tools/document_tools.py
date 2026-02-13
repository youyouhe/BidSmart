"""Tools for searching and retrieving company documents (scanned licenses, contracts, etc.).

Agno-compatible tool functions.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..api.client import BidSmartAPIClient
    from ..state.project_state import BidProjectState


async def search_documents(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    query: str = "",
    category: str = "",
) -> str:
    """搜索公司文档库中的资质文件、执照、合同、业绩证明等扫描件.
    
    Args:
        query: 搜索关键词
        category: 文档类别
    
    Returns:
        搜索结果文本
    """
    query_lower = query.lower()
    category_lower = category.lower()

    try:
        result = await api_client.list_documents(status="completed")
        documents = result.get("documents", result) if isinstance(result, dict) else result
    except Exception as e:
        return f"搜索文档失败: {e}"

    if not isinstance(documents, list):
        return "文档库为空或格式异常"

    # Client-side filtering by query keywords and category
    matches = []
    for doc in documents:
        filename = doc.get("filename", doc.get("name", "")).lower()
        doc_category = doc.get("category", "").lower()
        doc_tags = " ".join(doc.get("tags", [])).lower() if doc.get("tags") else ""

        score = 0
        if query_lower in filename:
            score += 3
        if query_lower in doc_tags:
            score += 2
        if query_lower in doc_category:
            score += 2
        if category_lower and category_lower in doc_category:
            score += 3

        # Keyword matching for common document types
        keyword_map = {
            "营业执照": ["营业执照", "business_license"],
            "资质证书": ["资质", "证书", "认证", "certification"],
            "业绩": ["业绩", "合同", "中标", "performance"],
            "执照": ["执照", "许可", "license"],
            "合同": ["合同", "contract", "协议"],
            "证明": ["证明", "证书", "certificate"],
            "授权": ["授权", "代理", "authorization"],
        }
        for key, keywords in keyword_map.items():
            if any(k in query_lower for k in keywords):
                if any(k in filename or k in doc_tags for k in keywords):
                    score += 2

        if score > 0:
            matches.append({
                "id": doc.get("id", ""),
                "filename": doc.get("filename", doc.get("name", "")),
                "category": doc.get("category", "未分类"),
                "status": doc.get("parse_status", doc.get("status", "")),
                "score": score,
            })

    if not matches:
        return f"未找到与 \"{query}\" 相关的文档"

    matches.sort(key=lambda x: x["score"], reverse=True)
    lines = [f"找到 {len(matches)} 个相关文档:\n"]
    for m in matches[:10]:
        lines.append(f"- [{m['id']}] {m['filename']} (分类: {m['category']}, 相关度: {m['score']})")

    return "\n".join(lines)


async def get_document_metadata(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    document_id: str = "",
) -> str:
    """获取指定文档的详细元数据信息（文件名、大小、解析状态等）.
    
    Args:
        document_id: 文档ID
    
    Returns:
        文档元数据JSON
    """
    try:
        doc = await api_client.get_document(document_id)
        return json.dumps(doc, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"获取文档元数据失败: {e}"


async def list_documents_by_category(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    category: str = "",
) -> str:
    """按类别列出所有已解析文档（如：资质文件、业绩证明、合同等）.
    
    Args:
        category: 文档类别
    
    Returns:
        文档列表文本
    """
    category_lower = category.lower()

    try:
        result = await api_client.list_documents(status="completed")
        documents = result.get("documents", result) if isinstance(result, dict) else result
    except Exception as e:
        return f"列出文档失败: {e}"

    if not isinstance(documents, list):
        return "文档库为空"

    filtered = []
    for doc in documents:
        doc_cat = doc.get("category", "").lower()
        doc_name = doc.get("filename", doc.get("name", "")).lower()
        if category_lower in doc_cat or category_lower in doc_name:
            filtered.append(doc)

    if not filtered:
        # Return all documents if no category match
        filtered = documents

    lines = [f"文档列表 (分类: {category or '全部'}), 共 {len(filtered)} 个:\n"]
    for doc in filtered[:20]:
        lines.append(
            f"- [{doc.get('id', '')}] {doc.get('filename', doc.get('name', ''))} "
            f"({doc.get('category', '未分类')})"
        )

    return "\n".join(lines)


async def get_document_tree(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    document_id: str = "",
) -> str:
    """获取指定文档的解析后树形结构.
    
    Args:
        document_id: 文档ID
    
    Returns:
        文档树结构文本
    """
    try:
        tree_data = await api_client.get_document_tree(document_id)
        from ..models.types import Node

        tree = tree_data.get("tree", tree_data)
        node = Node.from_dict(tree)
        return node.flatten()
    except Exception as e:
        return f"获取文档树失败: {e}"
