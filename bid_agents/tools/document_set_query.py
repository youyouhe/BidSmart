"""Enhanced query tools for DocumentSet support.

These tools extend the base tender_tools with multi-document awareness.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..api.client import BidSmartAPIClient
    from ..state.project_state import BidProjectState


async def query_document_set(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    query: str = "",
    scope: str = "all",  # all|primary|auxiliary|doc_id
    node_ids: str = "",
) -> str:
    """Query across documents in the document set.
    
    This tool automatically routes queries to the appropriate document(s)
    based on scope and aggregates results.
    
    Args:
        query: Search query
        scope: Query scope - "all", "primary", "auxiliary", or specific doc_id
        node_ids: Comma-separated list of node IDs to search within
        
    Returns:
        Aggregated query results
    """
    if not state.document_set:
        # Fall back to single document query
        from ..tools.tender_tools import query_tender_requirements
        return await query_tender_requirements(state, api_client, query, node_ids)
    
    # Determine which documents to query
    documents_to_query = []
    
    if scope == "primary":
        primary = state.document_set.get_primary_item()
        if primary:
            documents_to_query.append(primary)
    elif scope == "auxiliary":
        documents_to_query = state.document_set.get_items_by_role("auxiliary")
    elif scope in state.document_set.get_all_document_ids():
        # Specific document ID
        item = state.document_set.get_item_by_doc_id(scope)
        if item:
            documents_to_query.append(item)
    else:  # "all" or unrecognized scope
        documents_to_query = state.document_set.get_sorted_items()
    
    if not documents_to_query:
        return "错误：没有找到可查询的文档"
    
    # Execute queries
    results = []
    for item in documents_to_query:
        try:
            response = await api_client.chat_with_document(
                question=query,
                tree=item.tree or {},
                document_id=item.document_id,
            )
            
            answer = response.get("answer", "未找到相关内容")
            sources = response.get("sources", [])
            
            # Prefix with document name if multiple docs
            prefix = f"[{item.name}] " if len(documents_to_query) > 1 else ""
            
            result_text = f"{prefix}{answer}"
            if sources:
                source_titles = [s.get("title", "") for s in sources[:3]]
                result_text += f"\n  来源: {', '.join(source_titles)}"
            
            results.append(result_text)
            
        except Exception as e:
            results.append(f"[{item.name}] 查询失败: {e}")
    
    # Aggregate results
    header = f"📚 在 {len(documents_to_query)} 个文档中查询: {query}\n"
    if node_ids:
        header += f"限定节点: {node_ids}\n"
    header += "=" * 60 + "\n\n"
    
    return header + "\n\n".join(results)


async def get_merged_tree(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    format: str = "hierarchical",  # hierarchical|flat
) -> str:
    """Get the merged tree view of the document set.
    
    Args:
        format: Output format - "hierarchical" or "flat"
        
    Returns:
        Tree representation as text
    """
    if not state.document_set:
        return "错误：当前没有活动的文档集"
    
    from ..services.document_set_merger import TreeMerger
    
    merger = TreeMerger(state.document_set)
    
    if format == "flat":
        return merger.flatten_to_text()
    else:
        # Hierarchical JSON
        merged = merger.merge()
        return json.dumps(merged, ensure_ascii=False, indent=2)


async def find_across_documents(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    keyword: str = "",
    doc_types: str = "",  # Comma-separated: tender,reference,template,historical,company
) -> str:
    """Find content across documents by keyword.
    
    Args:
        keyword: Keyword to search for
        doc_types: Filter by document types
        
    Returns:
        Search results with document locations
    """
    if not state.document_set:
        return "错误：当前没有活动的文档集"
    
    if not keyword:
        return "错误：必须提供搜索关键词"
    
    # Filter by document types if specified
    items = state.document_set.get_sorted_items()
    if doc_types:
        allowed_types = {t.strip() for t in doc_types.split(",")}
        items = [item for item in items if item.doc_type in allowed_types]
    
    if not items:
        return f"错误：没有找到类型为 '{doc_types}' 的文档"
    
    # Search in each document
    results = []
    from ..services.document_set_merger import NodeResolver
    
    resolver = NodeResolver(state.document_set)
    matching_nodes = resolver.find_nodes_by_title(keyword)
    
    if not matching_nodes:
        return f"未找到包含 '{keyword}' 的章节"
    
    # Group by document
    by_document: dict[str, list] = {}
    for doc_id, node in matching_nodes:
        item = state.document_set.get_item_by_doc_id(doc_id)
        doc_name = item.name if item else doc_id
        
        if doc_name not in by_document:
            by_document[doc_name] = []
        by_document[doc_name].append(node)
    
    # Format results
    lines = [f"🔍 找到 {len(matching_nodes)} 个包含 '{keyword}' 的章节:\n"]
    
    for doc_name, nodes in by_document.items():
        lines.append(f"\n📄 {doc_name}:")
        for node in nodes:
            lines.append(f"  • {node.get('title', 'Untitled')}")
            if node.get("summary"):
                summary = node["summary"][:100] + "..." if len(node["summary"]) > 100 else node["summary"]
                lines.append(f"    {summary}")
    
    return "\n".join(lines)


async def compare_documents(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    doc_id_1: str = "",
    doc_id_2: str = "",
    section_pattern: str = "",
) -> str:
    """Compare similar sections across two documents.
    
    Args:
        doc_id_1: First document ID
        doc_id_2: Second document ID
        section_pattern: Section title pattern to compare
        
    Returns:
        Comparison results
    """
    if not state.document_set:
        return "错误：当前没有活动的文档集"
    
    if not doc_id_1 or not doc_id_2:
        return "错误：必须指定两个文档ID"
    
    item1 = state.document_set.get_item_by_doc_id(doc_id_1)
    item2 = state.document_set.get_item_by_doc_id(doc_id_2)
    
    if not item1 or not item2:
        return "错误：指定的文档不在文档集中"
    
    from ..services.document_set_merger import NodeResolver
    
    resolver = NodeResolver(state.document_set)
    
    # Get nodes from both documents
    nodes1 = resolver.get_document_nodes(doc_id_1)
    nodes2 = resolver.get_document_nodes(doc_id_2)
    
    if section_pattern:
        # Filter by pattern
        pattern_lower = section_pattern.lower()
        nodes1 = [n for n in nodes1 if pattern_lower in n.get("title", "").lower()]
        nodes2 = [n for n in nodes2 if pattern_lower in n.get("title", "").lower()]
    
    # Find common/similar titles
    titles1 = {n.get("title", "").lower() for n in nodes1}
    titles2 = {n.get("title", "").lower() for n in nodes2}
    common = titles1 & titles2
    only_in_1 = titles1 - titles2
    only_in_2 = titles2 - titles1
    
    lines = [
        f"📊 文档对比: {item1.name} vs {item2.name}",
        "",
        f"共同章节 ({len(common)}):",
    ]
    
    for title in sorted(common):
        lines.append(f"  ✓ {title}")
    
    if only_in_1:
        lines.extend(["", f"仅在 {item1.name} 中 ({len(only_in_1)}):"])
        for title in sorted(only_in_1):
            lines.append(f"  • {title}")
    
    if only_in_2:
        lines.extend(["", f"仅在 {item2.name} 中 ({len(only_in_2)}):"])
        for title in sorted(only_in_2):
            lines.append(f"  • {title}")
    
    return "\n".join(lines)


async def get_document_set_summary(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
) -> str:
    """Get a comprehensive summary of the document set.
    
    Returns:
        Formatted summary
    """
    if not state.document_set:
        return "当前没有活动的文档集"
    
    doc_set = state.document_set
    primary = doc_set.get_primary_item()
    auxiliaries = doc_set.get_items_by_role("auxiliary")
    
    lines = [
        f"📁 文档集: {doc_set.name}",
        f"ID: {doc_set.id}",
        f"描述: {doc_set.description or '无'}",
        "",
        f"📄 主文档: {primary.name if primary else '未设置'}",
        f"   ID: {primary.document_id if primary else 'N/A'}",
        f"   类型: {primary.doc_type if primary else 'N/A'}",
        "",
        f"📚 辅助文档 ({len(auxiliaries)}个):",
    ]
    
    for aux in auxiliaries:
        lines.append(f"   • {aux.name} ({aux.doc_type})")
        if aux.tree:
            # Count chapters
            chapter_count = _count_chapters(aux.tree)
            lines.append(f"     共 {chapter_count} 个章节")
    
    # Document type breakdown
    lines.append("")
    lines.append("📊 文档类型统计:")
    for doc_type in ["tender", "reference", "template", "historical", "company"]:
        count = len(doc_set.get_items_by_type(doc_type))
        if count > 0:
            lines.append(f"   {doc_type}: {count} 个")
    
    return "\n".join(lines)


def _count_chapters(tree: dict) -> int:
    """Count chapters in a tree."""
    count = 1  # Root
    for child in tree.get("children", []):
        count += _count_chapters(child)
    return count
