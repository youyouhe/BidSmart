"""Review pipeline: review-agent → compliance-checker.

Runs two sequential agents that review the bid document for quality
issues and compliance gaps.

Usage (from FastAPI backend)::

    results = await run_review_pipeline(
        project_id="project-xxx",
        api_url="http://localhost:8003",
        progress_callback=my_progress_fn,
    )
"""

from __future__ import annotations

import logging
from typing import Awaitable, Callable, Optional

from .agent_runner import create_deepseek_agent
from .agents.prompts import review_agent, compliance_checker
from .api.client import BidSmartAPIClient
from .outline_pipeline import _load_env
from .state.project_state import BidProjectState
from .tool_adapters import build_review_agent_tools, build_compliance_checker_tools

logger = logging.getLogger(__name__)

ProgressCallback = Optional[Callable[[str, str], Awaitable[None]]]


async def run_review_pipeline(
    project_id: str,
    api_url: str,
    progress_callback: ProgressCallback = None,
) -> dict:
    """Run review-agent → compliance-checker pipeline.

    Args:
        project_id: The bid project ID.
        api_url: BidSmart backend base URL.
        progress_callback: ``async (phase, message) -> None``

    Returns:
        Dict with ``review_feedback`` and ``compliance_matrix``.
    """
    _load_env()

    api_client = BidSmartAPIClient(api_url)
    state = BidProjectState()

    try:
        await state.load_from_backend(api_client, project_id)

        # Build tools
        review_tools = build_review_agent_tools(state, api_client)
        compliance_tools = build_compliance_checker_tools(state, api_client)

        # Phase 1: Quality review
        if progress_callback:
            await progress_callback("quality_review", "正在审核投标文件质量...")

        logger.info("Starting review-agent for project %s", project_id)
        review_ag = create_deepseek_agent(
            name="review-agent",
            system_prompt=review_agent.SYSTEM_PROMPT,
            tools=review_tools,
            tool_call_limit=25,
        )
        await review_ag.arun(
            f"请对项目 {project_id} 的投标文件进行全面质量审核。"
            f"先调用 get_all_sections 获取所有章节，然后逐章审核。"
        )
        logger.info(
            "Quality review complete. Feedback for %d sections.",
            len(state.review_feedback),
        )

        # Phase 2: Compliance check
        if progress_callback:
            await progress_callback("compliance_check", "正在检查合规性...")

        logger.info("Starting compliance-checker for project %s", project_id)
        compliance_ag = create_deepseek_agent(
            name="compliance-checker",
            system_prompt=compliance_checker.SYSTEM_PROMPT,
            tools=compliance_tools,
            tool_call_limit=20,
        )
        await compliance_ag.arun(
            f"请对项目 {project_id} 的投标文件进行合规性检查。"
            f"核对所有招标要求是否已在投标文件中得到响应。"
        )
        logger.info(
            "Compliance check complete. %d items in checklist.",
            len(state.compliance_matrix),
        )

        # Aggregate feedback statistics
        total_findings = sum(len(f) for f in state.review_feedback.values())
        critical = sum(
            1 for findings in state.review_feedback.values()
            for f in findings if f.get("severity") == "critical"
        )
        major = sum(
            1 for findings in state.review_feedback.values()
            for f in findings if f.get("severity") == "major"
        )
        minor_count = total_findings - critical - major

        compliant = sum(1 for c in state.compliance_matrix if c.get("is_compliant"))
        non_compliant = len(state.compliance_matrix) - compliant

        return {
            "review_feedback": state.review_feedback,
            "compliance_matrix": state.compliance_matrix,
            "summary": {
                "total_findings": total_findings,
                "critical": critical,
                "major": major,
                "minor": minor_count,
                "compliance_total": len(state.compliance_matrix),
                "compliance_passed": compliant,
                "compliance_failed": non_compliant,
            },
        }

    finally:
        await api_client.close()
