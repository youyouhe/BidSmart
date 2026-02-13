"""Async HTTP client for BidSmart backend APIs.

Wraps the same endpoints used by the frontend (projectService.ts + apiService.ts).
"""

from __future__ import annotations

import httpx


class BidSmartAPIClient:
    """Async HTTP client for all BidSmart backend interactions."""

    def __init__(self, base_url: str, token: str | None = None, timeout: float = 60.0):
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers=headers,
            timeout=timeout,
        )

    async def close(self) -> None:
        await self._client.aclose()

    # ── Project CRUD (projectService.ts) ────────────────────────────

    async def create_project(self, data: dict) -> dict:
        """POST /api/bid/projects"""
        r = await self._client.post("/api/bid/projects", json=data)
        r.raise_for_status()
        return r.json()

    async def get_project(self, project_id: str) -> dict:
        """GET /api/bid/projects/{id}"""
        r = await self._client.get(f"/api/bid/projects/{project_id}")
        r.raise_for_status()
        return r.json()

    async def list_projects(self) -> dict:
        """GET /api/bid/projects"""
        r = await self._client.get("/api/bid/projects")
        r.raise_for_status()
        return r.json()

    async def update_project(self, project_id: str, data: dict) -> dict:
        """PUT /api/bid/projects/{id}"""
        r = await self._client.put(f"/api/bid/projects/{project_id}", json=data)
        r.raise_for_status()
        return r.json()

    async def delete_project(self, project_id: str) -> dict:
        """DELETE /api/bid/projects/{id}"""
        r = await self._client.delete(f"/api/bid/projects/{project_id}")
        r.raise_for_status()
        return r.json()

    # ── Section Auto-save ───────────────────────────────────────────

    async def auto_save_section(
        self, project_id: str, section_id: str, content: str
    ) -> dict:
        """POST /api/bid/projects/{id}/sections/{sectionId}/auto-save"""
        r = await self._client.post(
            f"/api/bid/projects/{project_id}/sections/{section_id}/auto-save",
            json={"content": content},
        )
        r.raise_for_status()
        return r.json()

    # ── Content Generation ──────────────────────────────────────────

    async def generate_bid_content(self, params: dict) -> dict:
        """POST /api/bid/content/generate"""
        r = await self._client.post("/api/bid/content/generate", json=params)
        r.raise_for_status()
        return r.json()

    async def rewrite_bid_text(self, params: dict) -> dict:
        """POST /api/bid/content/rewrite"""
        r = await self._client.post("/api/bid/content/rewrite", json=params)
        r.raise_for_status()
        return r.json()

    # ── Export ──────────────────────────────────────────────────────

    async def export_project(self, project_id: str, config: dict) -> bytes:
        """POST /api/bid/projects/{id}/export — returns binary blob."""
        r = await self._client.post(
            f"/api/bid/projects/{project_id}/export",
            json=config,
        )
        r.raise_for_status()
        return r.content

    # ── Document APIs (apiService.ts) ───────────────────────────────

    async def list_documents(self, status: str | None = None) -> dict:
        """GET /api/documents/"""
        params: dict[str, str] = {}
        if status:
            params["parse_status"] = status
        r = await self._client.get("/api/documents/", params=params)
        r.raise_for_status()
        return r.json()

    async def get_document(self, doc_id: str) -> dict:
        """GET /api/documents/{id}"""
        r = await self._client.get(f"/api/documents/{doc_id}")
        r.raise_for_status()
        return r.json()

    async def get_document_tree(self, doc_id: str) -> dict:
        """GET /api/documents/{id}/tree"""
        r = await self._client.get(f"/api/documents/{doc_id}/tree")
        r.raise_for_status()
        return r.json()

    # ── Chat / AI (apiService.ts) ───────────────────────────────────

    async def chat_with_document(
        self,
        question: str,
        tree: dict,
        history: list[dict] | None = None,
        document_id: str | None = None,
    ) -> dict:
        """POST /api/chat — main AI endpoint for querying tender documents."""
        payload: dict = {
            "question": question,
            "tree": tree,
            "history": history or [],
        }
        if document_id:
            payload["document_id"] = document_id
        r = await self._client.post("/api/chat", json=payload, timeout=120.0)
        r.raise_for_status()
        return r.json()

    # ── Health ──────────────────────────────────────────────────────

    async def check_health(self, providers: list[str] | None = None) -> dict:
        """GET /api/provider-health"""
        params: dict[str, str] = {}
        if providers:
            params["provider"] = ",".join(providers)
        r = await self._client.get("/api/provider-health", params=params)
        r.raise_for_status()
        return r.json()
