"""DocumentSet models for managing multiple documents in a bid project.

A DocumentSet represents a collection of documents (tender docs, references,
templates, historical bids) that are used together for bid writing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


DocumentType = Literal["tender", "reference", "template", "historical", "company"]
DocumentRole = Literal["primary", "auxiliary", "reference"]


@dataclass
class DocumentSetItem:
    """A single document within a DocumentSet.
    
    Attributes:
        document_id: Unique identifier for the document
        name: Human-readable name (e.g., "招标文件第一册")
        doc_type: Type of document
        role: Role in the document set
        order: Display/processing order
        metadata: Additional metadata (pages, format, etc.)
        tree: Parsed document tree structure
    """
    document_id: str
    name: str
    doc_type: DocumentType
    role: DocumentRole
    order: int = 0
    metadata: dict = field(default_factory=dict)
    tree: dict | None = None
    
    @classmethod
    def from_dict(cls, data: dict) -> DocumentSetItem:
        """Create from dictionary."""
        return cls(
            document_id=data["document_id"],
            name=data["name"],
            doc_type=data.get("doc_type", "tender"),
            role=data.get("role", "auxiliary"),
            order=data.get("order", 0),
            metadata=data.get("metadata", {}),
            tree=data.get("tree"),
        )
    
    def to_dict(self) -> dict:
        """Convert to dictionary."""
        result = {
            "document_id": self.document_id,
            "name": self.name,
            "doc_type": self.doc_type,
            "role": self.role,
            "order": self.order,
            "metadata": self.metadata,
        }
        if self.tree:
            result["tree"] = self.tree
        return result
    
    def is_primary(self) -> bool:
        """Check if this is the primary document."""
        return self.role == "primary"
    
    def get_node_prefix(self) -> str:
        """Get the node ID prefix for this document."""
        return f"doc_{self.document_id}"


@dataclass
class DocumentSet:
    """A collection of documents for bid writing.
    
    Attributes:
        id: Unique identifier for the document set
        name: Human-readable name
        description: Optional description
        items: List of documents in the set
        created_at: Creation timestamp
        updated_at: Last update timestamp
        project_id: Associated project ID (optional)
    """
    id: str
    name: str
    description: str = ""
    items: list[DocumentSetItem] = field(default_factory=list)
    created_at: int = 0
    updated_at: int = 0
    project_id: str | None = None
    
    @classmethod
    def from_dict(cls, data: dict) -> DocumentSet:
        """Create from dictionary."""
        return cls(
            id=data["id"],
            name=data["name"],
            description=data.get("description", ""),
            items=[DocumentSetItem.from_dict(item) for item in data.get("items", [])],
            created_at=data.get("created_at", 0),
            updated_at=data.get("updated_at", 0),
            project_id=data.get("project_id"),
        )
    
    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "items": [item.to_dict() for item in self.items],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "project_id": self.project_id,
        }
    
    def get_primary_item(self) -> DocumentSetItem | None:
        """Get the primary document item."""
        for item in self.items:
            if item.is_primary():
                return item
        # If no primary marked, return first item
        return self.items[0] if self.items else None
    
    def get_item_by_doc_id(self, document_id: str) -> DocumentSetItem | None:
        """Get item by document ID."""
        for item in self.items:
            if item.document_id == document_id:
                return item
        return None
    
    def get_items_by_type(self, doc_type: DocumentType) -> list[DocumentSetItem]:
        """Get all items of a specific type."""
        return [item for item in self.items if item.doc_type == doc_type]
    
    def get_items_by_role(self, role: DocumentRole) -> list[DocumentSetItem]:
        """Get all items with a specific role."""
        return [item for item in self.items if item.role == role]
    
    def get_sorted_items(self) -> list[DocumentSetItem]:
        """Get items sorted by order."""
        return sorted(self.items, key=lambda x: x.order)
    
    def add_item(self, item: DocumentSetItem) -> None:
        """Add a new item to the set."""
        # Ensure unique order
        existing_orders = {i.order for i in self.items}
        while item.order in existing_orders:
            item.order += 1
        self.items.append(item)
        self.items.sort(key=lambda x: x.order)
    
    def remove_item(self, document_id: str) -> bool:
        """Remove an item by document ID."""
        for i, item in enumerate(self.items):
            if item.document_id == document_id:
                self.items.pop(i)
                return True
        return False
    
    def update_item_tree(self, document_id: str, tree: dict) -> bool:
        """Update the tree for a specific item."""
        item = self.get_item_by_doc_id(document_id)
        if item:
            item.tree = tree
            return True
        return False
    
    def get_all_document_ids(self) -> list[str]:
        """Get all document IDs in the set."""
        return [item.document_id for item in self.items]
    
    def __len__(self) -> int:
        """Return number of documents in the set."""
        return len(self.items)
    
    def __contains__(self, document_id: str) -> bool:
        """Check if document ID is in the set."""
        return any(item.document_id == document_id for item in self.items)
