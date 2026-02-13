"""Tender document analysis pipeline.

Uses the tender-analyzer agent to perform deep analysis of tender documents,
extracting scoring criteria, qualification requirements, technical needs,
and generating a structured analysis report.

Usage (from FastAPI backend)::

    report = await run_analysis_pipeline(
        project_id="project-xxx",
        api_url="http://localhost:8003",
        progress_callback=my_progress_fn,
    )
"""

from __future__ import annotations

import logging
from typing import Awaitable, Callable, Optional

from .agent_runner import create_deepseek_agent
from .agents.prompts import tender_analyzer
from .api.client import BidSmartAPIClient
from .state.project_state import BidProjectState
from .tool_adapters import build_tender_analyzer_tools

logger = logging.getLogger(__name__)

# Type alias for the progress callback
ProgressCallback = Optional[Callable[[str, str], Awaitable[None]]]


async def run_analysis_pipeline(
    project_id: str,
    api_url: str,
    progress_callback: ProgressCallback = None,
) -> dict:
    """Run tender-analyzer pipeline, return analysis report.

    Args:
        project_id: The bid project ID (must already exist in backend as a
            draft with ``tender_document_id`` set).
        api_url: Base URL of the BidSmart backend (e.g. ``http://localhost:8003``).
        progress_callback: ``async (phase, message) -> None`` called when the
            pipeline transitions between phases.

    Returns:
        Analysis report dict containing structured information about the
        tender document (project overview, qualifications, scoring criteria,
        technical requirements, business terms, etc.).

    Raises:
        Exception: On unrecoverable errors (API unreachable, LLM failures, etc.).
    """
    # 1. Initialize shared state + API client
    api_client = BidSmartAPIClient(api_url)
    state = BidProjectState()

    try:
        await state.load_from_backend(api_client, project_id)

        # 2. Build tools (closures over shared state)
        analysis_tools = build_tender_analyzer_tools(state, api_client)

        # 3. Run tender analysis
        if progress_callback:
            await progress_callback("analysis", "正在深度分析招标文件...")

        analyzer_agent = create_deepseek_agent(
            name="tender-analyzer",
            system_prompt=tender_analyzer.SYSTEM_PROMPT,
            tools=analysis_tools,
            tool_call_limit=20,  # Analysis requires more tool calls
        )

        analysis_instruction = (
            f"请深度分析项目 {project_id} 的招标文档。\n\n"
            f"工作流程：\n"
            f"1. 首先调用 get_tender_tree 获取完整目录结构\n"
            f"2. 基于TOC定位并分析以下关键章节（优先级顺序）：\n"
            f"   - 评分标准和评审细则\n"
            f"   - 供应商须知附表（份数、密封、付款、交付期）\n"
            f"   - 资格要求（一般+特定+负面清单）\n"
            f"   - 技术需求/服务要求\n"
            f"   - 招标公告/磋商邀请\n"
            f"   - 响应文件格式\n"
            f"3. 对评分标准进行分值验证（使用 validate_scoring_criteria）\n"
            f"4. 最后调用 save_analysis_report 保存完整分析报告\n\n"
            f"注意事项：\n"
            f"- 必须引用原文，不得概括或推测\n"
            f"- 评分标准必须逐行提取并验证分值计算\n"
            f"- 发现任何数据不一致必须明确标注"
        )

        logger.info("Starting tender-analyzer for project %s", project_id)
        await analyzer_agent.arun(analysis_instruction)
        
        if state.analysis_report:
            logger.info(
                "Tender analysis complete. Report contains %d sections",
                len(state.analysis_report) - 1  # Exclude _metadata
            )
        else:
            logger.warning("Tender analysis completed but no report was saved")

        if progress_callback:
            await progress_callback("analysis_complete", "招标文件分析完成")

        return state.analysis_report or {}

    except Exception:
        logger.exception("Analysis pipeline failed for project %s", project_id)
        raise
