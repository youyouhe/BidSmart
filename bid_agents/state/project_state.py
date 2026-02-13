"""Shared in-process state accessible by all MCP tools.

Because SDK MCP tools run in the same Python process, they access this state
via closure — no serialization needed. This is the primary coordination
mechanism between agents.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

from ..config import COMPANY_DATA_DIR
from ..models.types import TenderProject, TenderSection

if TYPE_CHECKING:
    from ..api.client import BidSmartAPIClient
    from ..models.document_set import DocumentSet

logger = logging.getLogger(__name__)


@dataclass
class BidProjectState:
    """Shared state singleton for a bid writing session."""

    # ── Project core ────────────────────────────────────────────────
    project_id: str | None = None
    tender_document_id: str | None = None
    tender_tree: dict | None = None
    project_title: str = ""

    # ── Outline & Sections ──────────────────────────────────────────
    outline: list[dict] | None = None
    sections: dict[str, dict] = field(default_factory=dict)  # section_id -> section dict

    # ── Format Specification (from format-extractor) ────────────────
    format_spec: dict | None = None  # 投标格式要求

    # ── Analysis Report (from tender-analyzer) ──────────────────────
    analysis_report: dict | None = None  # 招标文件分析报告

    # ── Document Set (multi-document support) ───────────────────────
    document_set_id: str | None = None
    document_set: DocumentSet | None = None  # type: ignore  # Forward reference

    # ── Review & Compliance ─────────────────────────────────────────
    review_feedback: dict[str, list[dict]] = field(default_factory=dict)  # section_id -> findings
    compliance_matrix: list[dict] = field(default_factory=list)

    # ── Document references (from document-finder) ──────────────────
    document_references: dict[str, list[str]] = field(default_factory=dict)  # section_id -> doc_ids

    # ── Company knowledge ───────────────────────────────────────────
    company_profile: dict | None = None
    team_profiles: list[dict] = field(default_factory=list)
    past_projects: list[dict] = field(default_factory=list)
    capabilities: dict | None = None

    # ── Agent tracking ──────────────────────────────────────────────
    current_agent: str | None = None
    agent_status: dict[str, str] = field(default_factory=dict)  # agent_id -> status

    async def load_from_backend(self, api_client: BidSmartAPIClient, project_id: str) -> None:
        """Load project state from backend and local company data."""
        self.project_id = project_id

        # Load project from backend
        try:
            project_data = await api_client.get_project(project_id)
            project = TenderProject.from_dict(project_data)
            self.tender_document_id = project.tender_document_id
            self.tender_tree = project.tender_document_tree
            self.project_title = project.title
            self.sections = {s.id: s.to_dict() for s in project.sections}
            logger.info("Loaded project %s with %d sections", project_id, len(self.sections))
        except Exception:
            logger.warning("Could not load project %s from backend, starting fresh", project_id)

        # Load tender tree if we have a document ID but no tree yet
        if self.tender_document_id and not self.tender_tree:
            try:
                tree_data = await api_client.get_document_tree(self.tender_document_id)
                self.tender_tree = tree_data.get("tree", tree_data)
                logger.info("Loaded tender tree for document %s", self.tender_document_id)
            except Exception:
                logger.warning("Could not load tender tree for %s", self.tender_document_id)

        # Load company data from local JSON files
        self._load_company_data()

    def _load_company_data(self) -> None:
        """Load company knowledge from local JSON files."""
        self.company_profile = self._load_json("profile.json")
        self.team_profiles = self._load_json("team.json") or []
        self.past_projects = self._load_json("past_projects.json") or []
        self.capabilities = self._load_json("capabilities.json")

    def _load_json(self, filename: str) -> dict | list | None:
        """Load a single JSON file from company_data/."""
        filepath = COMPANY_DATA_DIR / filename
        if not filepath.exists():
            logger.debug("Company data file not found: %s", filepath)
            return None
        try:
            return json.loads(filepath.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Failed to load %s: %s", filepath, e)
            return None

    def load_pricing_template(self, category: str) -> dict | None:
        """Load a pricing template by category (hardware/software/services)."""
        return self._load_json(f"templates/pricing_{category}.json")

    async def sync_to_backend(self, api_client: BidSmartAPIClient) -> None:
        """Sync current state back to backend."""
        if not self.project_id:
            logger.warning("No project_id set, cannot sync to backend")
            return

        sections_list = [
            TenderSection.from_dict(s) for s in self.sections.values()
        ]

        import time
        now_ms = int(time.time() * 1000)

        project_data = {
            "id": self.project_id,
            "title": self.project_title,
            "tender_document_id": self.tender_document_id or "",
            "tender_document_tree": self.tender_tree or {},
            "sections": [s.to_dict() for s in sorted(sections_list, key=lambda x: x.order)],
            "status": "draft",
            "created_at": now_ms,
            "updated_at": now_ms,
        }

        try:
            await api_client.update_project(self.project_id, project_data)
            logger.info("Synced project %s to backend", self.project_id)
        except Exception:
            logger.exception("Failed to sync project %s to backend", self.project_id)

    def get_section(self, section_id: str) -> dict | None:
        """Get a section by ID."""
        return self.sections.get(section_id)

    def get_all_sections_sorted(self) -> list[dict]:
        """Get all sections sorted by order."""
        return sorted(self.sections.values(), key=lambda s: s.get("order", 0))

    def get_sections_by_status(self, status: str) -> list[dict]:
        """Get sections filtered by status."""
        return [s for s in self.sections.values() if s.get("status") == status]

    def get_progress_summary(self) -> dict:
        """Get a summary of writing progress."""
        total = len(self.sections)
        completed = len(self.get_sections_by_status("completed"))
        in_progress = len(self.get_sections_by_status("in_progress"))
        pending = len(self.get_sections_by_status("pending"))
        return {
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "pending": pending,
            "percentage": round(completed / total * 100, 1) if total > 0 else 0,
        }

    # ── Document Set Methods ────────────────────────────────────────

    def get_effective_tree(self) -> dict | None:
        """Get the effective tree - from document set if available, otherwise from tender_tree.
        
        This provides backward compatibility while supporting multi-document scenarios.
        """
        if self.document_set:
            primary = self.document_set.get_primary_item()
            if primary and primary.tree:
                return primary.tree
        return self.tender_tree

    def get_document_set_summary(self) -> dict:
        """Get a summary of the document set."""
        if not self.document_set:
            return {
                "has_document_set": False,
                "document_count": 0,
                "primary_document": None,
            }
        
        primary = self.document_set.get_primary_item()
        return {
            "has_document_set": True,
            "document_set_id": self.document_set.id,
            "name": self.document_set.name,
            "document_count": len(self.document_set),
            "primary_document": primary.document_id if primary else None,
            "auxiliary_count": len(self.document_set.get_items_by_role("auxiliary")),
        }

    def is_using_document_set(self) -> bool:
        """Check if using document set (multi-document mode)."""
        return self.document_set is not None
