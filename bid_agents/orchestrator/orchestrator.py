"""Orchestrator: coordinates bid writing pipelines using agno framework.

This module provides document set aware orchestration.
"""

from __future__ import annotations

import logging
from typing import Callable, Awaitable, Optional

from ..api.client import BidSmartAPIClient
from ..config import BIDSMART_API_URL
from ..state.project_state import BidProjectState
from ..services.document_set_compat import auto_migrate_if_needed

logger = logging.getLogger(__name__)

ProgressCallback = Optional[Callable[[str, str], Awaitable[None]]]


async def create_bid_session(
    project_id: str,
    api_url: str | None = None,
    auto_migrate: bool = True,
) -> tuple[BidSmartAPIClient, BidProjectState]:
    """Create a bid writing session with initialized state.
    
    Args:
        project_id: The project ID
        api_url: API base URL
        auto_migrate: Whether to auto-migrate to document set
        
    Returns:
        Tuple of (api_client, state)
    """
    effective_url = api_url or BIDSMART_API_URL

    # Initialize
    state = BidProjectState()
    api_client = BidSmartAPIClient(effective_url)

    # Load from backend
    await state.load_from_backend(api_client, project_id)

    # Auto-migrate to document set if needed
    if auto_migrate and not state.is_using_document_set():
        migrated = await auto_migrate_if_needed(state, api_client)
        if migrated:
            logger.info("Auto-migrated project %s to document set", project_id)

    logger.info("Created bid session for project %s (document_set=%s)", 
                project_id, state.is_using_document_set())
    
    return api_client, state


async def run_document_set_workflow(
    project_id: str,
    api_url: str | None = None,
    workflow_type: str = "full",  # full|analysis|outline|write
    progress_callback: ProgressCallback = None,
) -> dict:
    """Run document set aware workflow.
    
    Args:
        project_id: Project ID
        api_url: API URL
        workflow_type: Type of workflow to run
        progress_callback: Progress callback
        
    Returns:
        Workflow results
    """
    api_client, state = await create_bid_session(project_id, api_url)
    
    results = {
        "project_id": project_id,
        "using_document_set": state.is_using_document_set(),
        "document_count": len(state.document_set) if state.document_set else 1,
    }
    
    if workflow_type == "analysis":
        from ..pipelines.document_set_pipeline import run_document_set_analysis_pipeline
        
        if progress_callback:
            await progress_callback("start", "开始文档集分析")
        
        analysis = await run_document_set_analysis_pipeline(
            project_id, api_url or BIDSMART_API_URL, progress_callback
        )
        results["analysis"] = analysis
        
    elif workflow_type == "outline":
        from ..pipelines.document_set_pipeline import run_document_set_outline_pipeline
        
        if progress_callback:
            await progress_callback("start", "生成大纲")
        
        sections = await run_document_set_outline_pipeline(
            project_id, api_url or BIDSMART_API_URL, progress_callback
        )
        results["sections"] = sections
        
    elif workflow_type == "write":
        from ..pipelines.document_set_pipeline import run_document_set_writing_pipeline
        
        # Write first pending section
        pending = state.get_sections_by_status("pending")
        if pending:
            section = pending[0]
            if progress_callback:
                await progress_callback("start", f"编写章节: {section['title']}")
            
            content = await run_document_set_writing_pipeline(
                project_id, section["id"], api_url or BIDSMART_API_URL, progress_callback
            )
            results["content"] = content
        else:
            results["message"] = "没有待编写的章节"
            
    else:  # full
        from ..pipelines.document_set_pipeline import run_document_set_full_pipeline
        
        if progress_callback:
            await progress_callback("start", "执行完整流程")
        
        full_results = await run_document_set_full_pipeline(
            project_id, api_url or BIDSMART_API_URL, progress_callback
        )
        results.update(full_results)
    
    if progress_callback:
        await progress_callback("complete", "工作流完成")
    
    return results


async def run_outline_generation(
    project_id: str,
    api_url: str | None = None,
    progress_callback: ProgressCallback = None,
) -> list[dict]:
    """Run the outline generation pipeline.
    
    Document set aware - will use document set if available.
    """
    from ..outline_pipeline import run_outline_pipeline
    
    return await run_outline_pipeline(
        project_id=project_id,
        api_url=api_url or BIDSMART_API_URL,
        progress_callback=progress_callback,
    )


async def run_analysis(
    project_id: str,
    api_url: str | None = None,
    progress_callback: ProgressCallback = None,
) -> dict:
    """Run the tender document analysis.
    
    Document set aware - will use document set if available.
    """
    api_client, state = await create_bid_session(project_id, api_url)
    
    if state.is_using_document_set():
        from ..pipelines.document_set_pipeline import run_document_set_analysis_pipeline
        return await run_document_set_analysis_pipeline(
            project_id, api_url or BIDSMART_API_URL, progress_callback
        )
    else:
        from ..analysis_pipeline import run_analysis_pipeline
        return await run_analysis_pipeline(
            project_id, api_url or BIDSMART_API_URL, progress_callback
        )
