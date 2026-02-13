"""Python dataclasses mirroring BidSmart types.ts.

Backend uses snake_case; these types match the backend format directly.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Node:
    """Tender document tree node."""

    id: str
    title: str
    children: list[Node] = field(default_factory=list)
    summary: str | None = None
    ps: int | None = None  # PDF page start (1-based)
    pe: int | None = None  # PDF page end (1-based)
    line_start: int | None = None  # Markdown line start

    @classmethod
    def from_dict(cls, data: dict) -> Node:
        children = [cls.from_dict(c) for c in data.get("children", [])]
        return cls(
            id=data["id"],
            title=data["title"],
            children=children,
            summary=data.get("summary"),
            ps=data.get("ps"),
            pe=data.get("pe"),
            line_start=data.get("line_start"),
        )

    def to_dict(self) -> dict:
        result: dict = {
            "id": self.id,
            "title": self.title,
            "children": [c.to_dict() for c in self.children],
        }
        if self.summary is not None:
            result["summary"] = self.summary
        if self.ps is not None:
            result["ps"] = self.ps
        if self.pe is not None:
            result["pe"] = self.pe
        if self.line_start is not None:
            result["line_start"] = self.line_start
        return result

    def flatten(self, depth: int = 0) -> str:
        """Flatten tree to indented text for prompt inclusion."""
        indent = "  " * depth
        lines = [f"{indent}{self.title}"]
        if self.summary:
            lines.append(f"{indent}  摘要: {self.summary}")
        for child in self.children:
            lines.append(child.flatten(depth + 1))
        return "\n".join(lines)

    def find_node(self, node_id: str) -> Node | None:
        """Recursively find a node by ID."""
        if self.id == node_id:
            return self
        for child in self.children:
            found = child.find_node(node_id)
            if found:
                return found
        return None


@dataclass
class OutlineSection:
    """AI-generated outline section."""

    id: str
    title: str
    description: str
    requirement_summary: str
    order: int
    children: list[OutlineSection] | None = None

    @classmethod
    def from_dict(cls, data: dict) -> OutlineSection:
        children = None
        if data.get("children"):
            children = [cls.from_dict(c) for c in data["children"]]
        return cls(
            id=data.get("id", ""),
            title=data.get("title", ""),
            description=data.get("description", ""),
            requirement_summary=data.get("requirement_summary", data.get("requirementSummary", "")),
            order=data.get("order", 0),
            children=children,
        )

    def to_dict(self) -> dict:
        result = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "requirement_summary": self.requirement_summary,
            "order": self.order,
        }
        if self.children:
            result["children"] = [c.to_dict() for c in self.children]
        return result


@dataclass
class TenderOutline:
    """Complete bid outline."""

    project_id: str
    sections: list[OutlineSection]
    generated_at: int
    attachments: list[dict] | None = None

    @classmethod
    def from_dict(cls, data: dict) -> TenderOutline:
        return cls(
            project_id=data.get("project_id", data.get("projectId", "")),
            sections=[OutlineSection.from_dict(s) for s in data.get("sections", [])],
            generated_at=data.get("generated_at", data.get("generatedAt", 0)),
            attachments=data.get("attachments"),
        )


@dataclass
class TenderSection:
    """A section in the bid document being written."""

    id: str
    title: str
    content: str = ""
    summary: str | None = None
    requirement_references: list[str] = field(default_factory=list)
    status: str = "pending"  # "pending" | "in_progress" | "completed"
    order: int = 0
    word_count: int = 0

    @classmethod
    def from_dict(cls, data: dict) -> TenderSection:
        return cls(
            id=data["id"],
            title=data["title"],
            content=data.get("content", ""),
            summary=data.get("summary"),
            requirement_references=data.get("requirement_references", []),
            status=data.get("status", "pending"),
            order=data.get("order", 0),
            word_count=data.get("word_count", 0),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "summary": self.summary,
            "requirement_references": self.requirement_references,
            "status": self.status,
            "order": self.order,
            "word_count": len(self.content),
        }

    @classmethod
    def from_outline_section(cls, section: OutlineSection) -> TenderSection:
        """Convert an OutlineSection to a writable TenderSection."""
        return cls(
            id=section.id,
            title=section.title,
            content="",
            summary=section.description,
            requirement_references=[],
            status="pending",
            order=section.order,
        )


@dataclass
class TenderProject:
    """Complete bid project."""

    id: str
    title: str
    tender_document_id: str
    tender_document_tree: dict  # Raw dict for API compatibility
    sections: list[TenderSection]
    created_at: int = 0
    updated_at: int = 0
    status: str = "draft"  # "draft" | "review" | "completed"

    @classmethod
    def from_dict(cls, data: dict) -> TenderProject:
        return cls(
            id=data["id"],
            title=data["title"],
            tender_document_id=data.get("tender_document_id", ""),
            tender_document_tree=data.get("tender_document_tree", {}),
            sections=[TenderSection.from_dict(s) for s in data.get("sections", [])],
            created_at=data.get("created_at", 0),
            updated_at=data.get("updated_at", 0),
            status=data.get("status", "draft"),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "tender_document_id": self.tender_document_id,
            "tender_document_tree": self.tender_document_tree,
            "sections": [s.to_dict() for s in self.sections],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "status": self.status,
        }


@dataclass
class ReviewFinding:
    """A single review finding from the review agent."""

    severity: str  # "critical" | "major" | "minor"
    section_id: str
    description: str
    suggestion: str
    reference: str | None = None

    def to_dict(self) -> dict:
        result = {
            "severity": self.severity,
            "section_id": self.section_id,
            "description": self.description,
            "suggestion": self.suggestion,
        }
        if self.reference:
            result["reference"] = self.reference
        return result


@dataclass
class ComplianceItem:
    """A single compliance check item."""

    requirement_id: str
    requirement_text: str
    is_compliant: bool
    section_id: str | None = None
    notes: str = ""

    def to_dict(self) -> dict:
        return {
            "requirement_id": self.requirement_id,
            "requirement_text": self.requirement_text,
            "is_compliant": self.is_compliant,
            "section_id": self.section_id,
            "notes": self.notes,
        }


@dataclass
class ExportConfig:
    """Export configuration."""

    format: str = "word"  # "word" | "pdf"
    include_outline: bool = True
    include_requirements: bool = True
    template: str = "standard"  # "standard" | "custom"
