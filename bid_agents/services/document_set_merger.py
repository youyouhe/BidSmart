"""DocumentSet tree merging service.

Provides functionality to merge multiple document trees into a unified
structure for navigation and querying across document sets.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..models.document_set import DocumentSet, DocumentSetItem


class TreeMerger:
    """Merge multiple document trees into a unified structure."""
    
    def __init__(self, document_set: DocumentSet):
        self.document_set = document_set
        self._node_to_doc_map: dict[str, str] = {}  # node_id -> document_id
    
    def merge(self) -> dict:
        """Merge all document trees into a unified structure.
        
        Strategy:
        1. Primary document tree becomes the root
        2. Auxiliary documents become child nodes under a special branch
        3. Node IDs are prefixed with document identifier
        
        Returns:
            Unified tree structure
        """
        primary = self.document_set.get_primary_item()
        if not primary or not primary.tree:
            # No primary, create flat structure
            return self._create_flat_structure()
        
        # Start with primary tree
        merged_root = self._process_tree_node(
            primary.tree, 
            primary.document_id,
            is_primary=True
        )
        
        # Add auxiliary documents as children
        auxiliaries = self.document_set.get_items_by_role("auxiliary")
        if auxiliaries:
            aux_branch = {
                "id": "auxiliary_docs",
                "title": "辅助文档",
                "summary": f"共{len(auxiliaries)}个辅助文档",
                "children": [],
            }
            
            for aux in auxiliaries:
                if aux.tree:
                    aux_node = self._process_tree_node(
                        aux.tree,
                        aux.document_id,
                        is_primary=False
                    )
                    aux_node["title"] = f"[{aux.name}] {aux_node['title']}"
                    aux_branch["children"].append(aux_node)
            
            if aux_branch["children"]:
                merged_root["children"].append(aux_branch)
        
        return merged_root
    
    def _process_tree_node(
        self, 
        node: dict, 
        doc_id: str,
        is_primary: bool = True
    ) -> dict:
        """Process a tree node, prefixing IDs and tracking mappings.
        
        Args:
            node: Original tree node
            doc_id: Document ID for prefixing
            is_primary: Whether this is from primary document
            
        Returns:
            Processed node with prefixed IDs
        """
        original_id = node.get("id", "")
        
        # Create prefixed ID
        if is_primary:
            # Primary document keeps original IDs for backward compatibility
            new_id = original_id
        else:
            # Auxiliary documents get prefixed IDs
            new_id = f"doc_{doc_id}_{original_id}"
        
        # Track mapping
        if original_id:
            self._node_to_doc_map[new_id] = doc_id
        
        # Process children
        children = []
        for child in node.get("children", []):
            processed_child = self._process_tree_node(child, doc_id, is_primary)
            children.append(processed_child)
        
        return {
            "id": new_id,
            "title": node.get("title", ""),
            "summary": node.get("summary"),
            "ps": node.get("ps"),
            "pe": node.get("pe"),
            "line_start": node.get("line_start"),
            "children": children,
        }
    
    def _create_flat_structure(self) -> dict:
        """Create a flat structure when no primary document exists."""
        children = []
        
        for item in self.document_set.get_sorted_items():
            if item.tree:
                node = self._process_tree_node(
                    item.tree,
                    item.document_id,
                    is_primary=False
                )
                node["title"] = f"[{item.name}] {node['title']}"
                children.append(node)
        
        return {
            "id": "root",
            "title": self.document_set.name,
            "summary": f"文档集包含{len(children)}个文档",
            "children": children,
        }
    
    def get_node_document_id(self, node_id: str) -> str | None:
        """Get the document ID for a given node ID.
        
        Args:
            node_id: Node ID (possibly prefixed)
            
        Returns:
            Document ID or None if not found
        """
        # Check direct mapping
        if node_id in self._node_to_doc_map:
            return self._node_to_doc_map[node_id]
        
        # Try to extract from prefixed ID
        if node_id.startswith("doc_"):
            parts = node_id.split("_", 2)
            if len(parts) >= 2:
                return parts[1]
        
        # Default to primary document
        primary = self.document_set.get_primary_item()
        return primary.document_id if primary else None
    
    def flatten_to_text(self) -> str:
        """Get flattened text representation of merged tree.
        
        Returns:
            Multi-line string with indented structure
        """
        merged = self.merge()
        return self._flatten_node(merged, 0)
    
    def _flatten_node(self, node: dict, depth: int) -> str:
        """Recursively flatten a node to text."""
        indent = "  " * depth
        lines = [f"{indent}{node.get('title', 'Untitled')}"]
        
        if node.get("summary"):
            lines.append(f"{indent}  摘要: {node['summary']}")
        
        for child in node.get("children", []):
            lines.append(self._flatten_node(child, depth + 1))
        
        return "\n".join(lines)


class NodeResolver:
    """Resolve node references across document set."""
    
    def __init__(self, document_set: DocumentSet):
        self.document_set = document_set
        self._build_index()
    
    def _build_index(self) -> None:
        """Build index of all nodes across documents."""
        self._node_index: dict[str, tuple[str, dict]] = {}  # node_id -> (doc_id, node)
        
        for item in self.document_set.items:
            if item.tree:
                self._index_tree(item.tree, item.document_id)
    
    def _index_tree(self, node: dict, doc_id: str) -> None:
        """Recursively index a tree."""
        node_id = node.get("id")
        if node_id:
            self._node_index[node_id] = (doc_id, node)
        
        for child in node.get("children", []):
            self._index_tree(child, doc_id)
    
    def resolve_node(self, node_id: str) -> tuple[str, dict] | None:
        """Resolve a node ID to its document and node data.
        
        Args:
            node_id: Node ID to resolve
            
        Returns:
            Tuple of (document_id, node_data) or None
        """
        # Try exact match
        if node_id in self._node_index:
            return self._node_index[node_id]
        
        # Try extracting from prefixed ID
        if node_id.startswith("doc_"):
            parts = node_id.split("_", 2)
            if len(parts) >= 3:
                doc_id = parts[1]
                original_id = parts[2]
                if original_id in self._node_index:
                    found_doc_id, node = self._node_index[original_id]
                    if found_doc_id == doc_id:
                        return (doc_id, node)
        
        return None
    
    def find_nodes_by_title(self, title: str) -> list[tuple[str, dict]]:
        """Find all nodes with matching title.
        
        Args:
            title: Title to search for
            
        Returns:
            List of (document_id, node) tuples
        """
        results = []
        title_lower = title.lower()
        
        for node_id, (doc_id, node) in self._node_index.items():
            if title_lower in node.get("title", "").lower():
                results.append((doc_id, node))
        
        return results
    
    def get_document_nodes(self, doc_id: str) -> list[dict]:
        """Get all nodes for a specific document.
        
        Args:
            doc_id: Document ID
            
        Returns:
            List of nodes
        """
        return [
            node for stored_doc_id, node in self._node_index.values()
            if stored_doc_id == doc_id
        ]


def create_merged_tree(document_set: DocumentSet) -> dict:
    """Convenience function to create merged tree.
    
    Args:
        document_set: Document set to merge
        
    Returns:
        Merged tree structure
    """
    merger = TreeMerger(document_set)
    return merger.merge()


def get_node_document_mapping(document_set: DocumentSet) -> dict[str, str]:
    """Get mapping of node IDs to document IDs.
    
    Args:
        document_set: Document set
        
    Returns:
        Dictionary mapping node_id -> document_id
    """
    merger = TreeMerger(document_set)
    merger.merge()  # Build mappings
    return merger._node_to_doc_map
