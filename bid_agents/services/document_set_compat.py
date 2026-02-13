"""DocumentSet migration utilities.

Provides backward compatibility and migration from single-document
to multi-document document set architecture.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..api.client import BidSmartAPIClient
    from ..state.project_state import BidProjectState

logger = logging.getLogger(__name__)


async def migrate_single_to_document_set(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    set_name: str = "",
) -> str:
    """Migrate a single-document project to document set.
    
    This function:
    1. Creates a new document set from existing tender_document_id
    2. Preserves all existing functionality
    3. Enables multi-document features
    
    Args:
        state: Current project state
        api_client: API client
        set_name: Optional document set name (defaults to project title)
        
    Returns:
        Document set ID
    """
    if not state.tender_document_id:
        return "错误：当前项目没有关联的招标文档"
    
    if state.document_set:
        return f"项目已经是文档集模式: {state.document_set.id}"
    
    from ..models.document_set import DocumentSet, DocumentSetItem
    import time
    import uuid
    
    # Generate document set ID
    set_id = f"ds_{uuid.uuid4().hex[:12]}"
    now = int(time.time() * 1000)
    
    # Get document info
    try:
        tree_data = await api_client.get_document_tree(state.tender_document_id)
        tree = tree_data.get("tree", tree_data)
    except Exception as e:
        logger.warning("Could not fetch tree for document %s: %s", 
                      state.tender_document_id, e)
        tree = state.tender_tree
    
    # Create document set
    doc_set = DocumentSet(
        id=set_id,
        name=set_name or f"{state.project_title or '未命名项目'} 文档集",
        description="自动从单文档迁移的文档集",
        items=[],
        created_at=now,
        updated_at=now,
        project_id=state.project_id,
    )
    
    # Add existing document as primary
    primary_item = DocumentSetItem(
        document_id=state.tender_document_id,
        name="招标文件（主文档）",
        doc_type="tender",
        role="primary",
        order=0,
        metadata={"pages": tree_data.get("total_pages", 0) if 'tree_data' in dir() else 0},
        tree=tree,
    )
    doc_set.add_item(primary_item)
    
    # Update state
    state.document_set = doc_set
    state.document_set_id = set_id
    
    logger.info("Migrated project %s to document set %s", 
                state.project_id, set_id)
    
    return (
        f"✅ 迁移成功\n"
        f"文档集ID: {set_id}\n"
        f"主文档: {state.tender_document_id}\n"
        f"现在可以使用多文档功能了"
    )


async def auto_migrate_if_needed(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
) -> bool:
    """Automatically migrate to document set if needed.
    
    Args:
        state: Project state
        api_client: API client
        
    Returns:
        True if migration occurred
    """
    if state.document_set:
        return False  # Already using document set
    
    if not state.tender_document_id:
        return False  # No document to migrate
    
    # Perform migration
    result = await migrate_single_to_document_set(state, api_client)
    logger.info("Auto-migrated project: %s", result)
    return True


def get_backward_compatible_tree(state: BidProjectState) -> dict | None:
    """Get tree in backward-compatible format.
    
    Returns the tree in the same format as before, regardless of
    whether using single document or document set.
    
    Args:
        state: Project state
        
    Returns:
        Tree dict or None
    """
    return state.get_effective_tree()


def ensure_backward_compatibility(state: BidProjectState) -> None:
    """Ensure backward compatibility by syncing document set to legacy fields.
    
    This function ensures that:
    - tender_document_id is set from document set primary
    - tender_tree is set from document set primary tree
    
    Args:
        state: Project state
    """
    if not state.document_set:
        return
    
    primary = state.document_set.get_primary_item()
    if primary:
        state.tender_document_id = primary.document_id
        if primary.tree:
            state.tender_tree = primary.tree
        
        logger.debug("Synced document set to legacy fields")


async def add_historical_bid_to_set(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    historical_doc_id: str,
    bid_name: str = "",
) -> str:
    """Add a historical bid to the document set for content reuse.
    
    Args:
        state: Project state
        api_client: API client
        historical_doc_id: Historical bid document ID
        bid_name: Name for the historical bid
        
    Returns:
        Result message
    """
    if not state.document_set:
        # Auto-migrate first
        await auto_migrate_if_needed(state, api_client)
    
    if not state.document_set:
        return "错误：无法创建文档集"
    
    # Check if already exists
    if historical_doc_id in state.document_set:
        return f"历史标书 {historical_doc_id} 已在文档集中"
    
    from ..models.document_set import DocumentSetItem
    
    # Fetch tree
    try:
        tree_data = await api_client.get_document_tree(historical_doc_id)
        tree = tree_data.get("tree", tree_data)
    except Exception as e:
        return f"获取历史标书信息失败: {e}"
    
    # Create item
    item = DocumentSetItem(
        document_id=historical_doc_id,
        name=bid_name or f"历史标书_{historical_doc_id[:8]}",
        doc_type="historical",
        role="reference",
        order=len(state.document_set.items),
        metadata={"pages": tree_data.get("total_pages", 0)},
        tree=tree,
    )
    
    state.document_set.add_item(item)
    
    return (
        f"✅ 已添加历史标书到文档集\n"
        f"名称: {item.name}\n"
        f"文档集现在包含 {len(state.document_set)} 个文档"
    )


class DocumentSetCompatibilityWrapper:
    """Wrapper to provide backward-compatible interface.
    
    This wrapper allows existing code to work with document sets
    without modification.
    """
    
    def __init__(self, state: BidProjectState):
        self.state = state
    
    @property
    def tender_document_id(self) -> str | None:
        """Get tender document ID (backward compatible)."""
        if self.state.document_set:
            primary = self.state.document_set.get_primary_item()
            return primary.document_id if primary else None
        return self.state.tender_document_id
    
    @property
    def tender_tree(self) -> dict | None:
        """Get tender tree (backward compatible)."""
        if self.state.document_set:
            primary = self.state.document_set.get_primary_item()
            return primary.tree if primary else None
        return self.state.tender_tree
    
    def is_multi_document(self) -> bool:
        """Check if using multi-document mode."""
        return self.state.is_using_document_set()
    
    def get_document_count(self) -> int:
        """Get number of documents."""
        if self.state.document_set:
            return len(self.state.document_set)
        return 1 if self.state.tender_document_id else 0
