"""Tools for managing DocumentSets.

Agno-compatible tool functions for creating and managing document collections.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..api.client import BidSmartAPIClient
    from ..state.project_state import BidProjectState
    from ..models.document_set import DocumentSet, DocumentSetItem


async def create_document_set(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    name: str = "",
    description: str = "",
    primary_doc_id: str = "",
    auxiliary_docs: str = "",  # JSON array of {"doc_id": str, "name": str, "doc_type": str}
) -> str:
    """Create a new document set with primary and auxiliary documents.
    
    Args:
        name: Document set name
        description: Optional description
        primary_doc_id: Primary document ID (usually the tender document)
        auxiliary_docs: JSON array of auxiliary documents
        
    Returns:
        Document set ID
    """
    if not name:
        return "错误：文档集名称不能为空"
    
    if not primary_doc_id:
        return "错误：必须指定主文档ID"
    
    # Generate unique ID
    set_id = f"ds_{uuid.uuid4().hex[:12]}"
    now = int(time.time() * 1000)
    
    from ..models.document_set import DocumentSet, DocumentSetItem
    
    items = []
    
    # Add primary document
    try:
        # Fetch primary document tree
        tree_data = await api_client.get_document_tree(primary_doc_id)
        primary_tree = tree_data.get("tree", tree_data)
        
        primary_item = DocumentSetItem(
            document_id=primary_doc_id,
            name="招标文件（主文档）",
            doc_type="tender",
            role="primary",
            order=0,
            metadata={"pages": tree_data.get("total_pages", 0)},
            tree=primary_tree,
        )
        items.append(primary_item)
    except Exception as e:
        return f"获取主文档信息失败: {e}"
    
    # Add auxiliary documents
    if auxiliary_docs:
        try:
            aux_list = json.loads(auxiliary_docs)
            for i, aux in enumerate(aux_list):
                doc_id = aux.get("doc_id")
                doc_name = aux.get("name", f"辅助文档{i+1}")
                doc_type = aux.get("doc_type", "reference")
                
                try:
                    tree_data = await api_client.get_document_tree(doc_id)
                    aux_tree = tree_data.get("tree", tree_data)
                    
                    aux_item = DocumentSetItem(
                        document_id=doc_id,
                        name=doc_name,
                        doc_type=doc_type,
                        role="auxiliary",
                        order=i + 1,
                        metadata={"pages": tree_data.get("total_pages", 0)},
                        tree=aux_tree,
                    )
                    items.append(aux_item)
                except Exception as e:
                    return f"获取辅助文档 {doc_id} 信息失败: {e}"
        except json.JSONDecodeError:
            return "错误：auxiliary_docs 必须是有效的JSON数组"
    
    # Create document set
    doc_set = DocumentSet(
        id=set_id,
        name=name,
        description=description,
        items=items,
        created_at=now,
        updated_at=now,
    )
    
    # Store in state
    state.document_set = doc_set
    state.document_set_id = set_id
    
    return (
        f"✅ 文档集创建成功\n"
        f"ID: {set_id}\n"
        f"名称: {name}\n"
        f"包含 {len(items)} 个文档:\n"
        + "\n".join(f"  {i+1}. [{item.role}] {item.name} ({item.doc_type})" 
                   for i, item in enumerate(items))
    )


async def add_to_document_set(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    document_id: str = "",
    name: str = "",
    doc_type: str = "reference",
    role: str = "auxiliary",
) -> str:
    """Add a document to the current document set.
    
    Args:
        document_id: Document ID to add
        name: Display name for the document
        doc_type: Document type (tender|reference|template|historical|company)
        role: Document role (primary|auxiliary|reference)
        
    Returns:
        Result message
    """
    if not state.document_set:
        return "错误：当前没有活动的文档集，请先创建文档集"
    
    if not document_id:
        return "错误：必须指定文档ID"
    
    # Check if already exists
    if document_id in state.document_set:
        return f"错误：文档 {document_id} 已在文档集中"
    
    from ..models.document_set import DocumentSetItem
    
    # Fetch document tree
    try:
        tree_data = await api_client.get_document_tree(document_id)
        tree = tree_data.get("tree", tree_data)
    except Exception as e:
        return f"获取文档信息失败: {e}"
    
    # Create new item
    new_item = DocumentSetItem(
        document_id=document_id,
        name=name or f"文档_{document_id[:8]}",
        doc_type=doc_type,
        role=role,
        order=len(state.document_set.items),
        metadata={"pages": tree_data.get("total_pages", 0)},
        tree=tree,
    )
    
    # Add to set
    state.document_set.add_item(new_item)
    state.document_set.updated_at = int(time.time() * 1000)
    
    return (
        f"✅ 已添加文档到文档集\n"
        f"文档: {new_item.name}\n"
        f"类型: {doc_type}\n"
        f"角色: {role}\n"
        f"文档集现在包含 {len(state.document_set)} 个文档"
    )


async def remove_from_document_set(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    document_id: str = "",
) -> str:
    """Remove a document from the current document set.
    
    Args:
        document_id: Document ID to remove
        
    Returns:
        Result message
    """
    if not state.document_set:
        return "错误：当前没有活动的文档集"
    
    if not document_id:
        return "错误：必须指定文档ID"
    
    if state.document_set.remove_item(document_id):
        state.document_set.updated_at = int(time.time() * 1000)
        return f"✅ 已从文档集中移除文档 {document_id}"
    else:
        return f"错误：文档 {document_id} 不在当前文档集中"


async def list_document_set(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
) -> str:
    """List all documents in the current document set.
    
    Returns:
        Formatted list of documents
    """
    if not state.document_set:
        return "当前没有活动的文档集"
    
    doc_set = state.document_set
    items = doc_set.get_sorted_items()
    
    lines = [
        f"📁 文档集: {doc_set.name}",
        f"ID: {doc_set.id}",
        f"描述: {doc_set.description or '无'}",
        f"共 {len(items)} 个文档:\n",
    ]
    
    for item in items:
        role_icon = "⭐" if item.role == "primary" else "📄"
        tree_status = "✓" if item.tree else "✗"
        lines.append(
            f"{role_icon} [{item.order}] {item.name}\n"
            f"   ID: {item.document_id}\n"
            f"   类型: {item.doc_type} | 角色: {item.role}\n"
            f"   目录树: {tree_status}"
        )
    
    return "\n".join(lines)


async def get_document_set_info(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
) -> str:
    """Get detailed information about the current document set.
    
    Returns:
        JSON formatted document set info
    """
    if not state.document_set:
        return "{}"
    
    return json.dumps(state.document_set.to_dict(), ensure_ascii=False, indent=2)


async def set_primary_document(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    document_id: str = "",
) -> str:
    """Set a document as the primary document in the set.
    
    Args:
        document_id: Document ID to set as primary
        
    Returns:
        Result message
    """
    if not state.document_set:
        return "错误：当前没有活动的文档集"
    
    if not document_id:
        return "错误：必须指定文档ID"
    
    item = state.document_set.get_item_by_doc_id(document_id)
    if not item:
        return f"错误：文档 {document_id} 不在当前文档集中"
    
    # Unset current primary
    for existing in state.document_set.items:
        if existing.role == "primary":
            existing.role = "auxiliary"
    
    # Set new primary
    item.role = "primary"
    item.order = 0
    
    # Re-sort
    state.document_set.items.sort(key=lambda x: (0 if x.role == "primary" else 1, x.order))
    
    return f"✅ 已将 {item.name} 设置为主文档"


async def refresh_document_tree(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    document_id: str = "",
) -> str:
    """Refresh the tree for a specific document in the set.
    
    Args:
        document_id: Document ID to refresh
        
    Returns:
        Result message
    """
    if not state.document_set:
        return "错误：当前没有活动的文档集"
    
    if not document_id:
        return "错误：必须指定文档ID"
    
    item = state.document_set.get_item_by_doc_id(document_id)
    if not item:
        return f"错误：文档 {document_id} 不在当前文档集中"
    
    try:
        tree_data = await api_client.get_document_tree(document_id)
        item.tree = tree_data.get("tree", tree_data)
        item.metadata["pages"] = tree_data.get("total_pages", 0)
        state.document_set.updated_at = int(time.time() * 1000)
        return f"✅ 已刷新文档 {item.name} 的目录树"
    except Exception as e:
        return f"刷新失败: {e}"
