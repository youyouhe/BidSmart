"""Outline generation pipeline: format-extractor → outline-planner.

Uses agno Agent with DeepSeek to run two sequential agents that share state
via ``BidProjectState``.  The format-extractor identifies bid format
requirements, and the outline-planner generates a compliant outline.

Usage (from FastAPI backend)::

    sections = await run_outline_pipeline(
        project_id="project-xxx",
        api_url="http://localhost:8003",
        progress_callback=my_progress_fn,
    )
"""

from __future__ import annotations

import logging
import os
from typing import Awaitable, Callable, Optional

from dotenv import load_dotenv

from .agent_runner import create_deepseek_agent
from .agents.prompts import format_extractor, outline_planner
from .api.client import BidSmartAPIClient
from .state.project_state import BidProjectState
from .tool_adapters import build_format_extractor_tools, build_outline_planner_tools

logger = logging.getLogger(__name__)

# Type alias for the progress callback
ProgressCallback = Optional[Callable[[str, str], Awaitable[None]]]


async def run_outline_pipeline(
    project_id: str,
    api_url: str,
    user_requirements: str | None = None,
    attachment_names: list[str] | None = None,
    progress_callback: ProgressCallback = None,
) -> list[dict]:
    """Run format-extractor → outline-planner pipeline, return sections list.

    Args:
        project_id: The bid project ID (must already exist in backend as a
            draft with ``tender_document_id`` set).
        api_url: Base URL of the BidSmart backend (e.g. ``http://localhost:8003``).
        user_requirements: Optional free-text requirements from the user to
            guide the outline planner.
        attachment_names: Optional list of uploaded attachment filenames for
            reference in the outline.
        progress_callback: ``async (phase, message) -> None`` called when the
            pipeline transitions between phases.

    Returns:
        List of tender section dicts (sorted by order) written to the project.

    Raises:
        Exception: On unrecoverable errors (API unreachable, LLM failures, etc.).
    """
    # Load .env so DEEPSEEK_API_KEY is available
    _load_env()

    # 1. Initialize shared state + API client
    api_client = BidSmartAPIClient(api_url)
    state = BidProjectState()

    try:
        await state.load_from_backend(api_client, project_id)

        # 2. Build tools (closures over shared state)
        format_tools = build_format_extractor_tools(state, api_client)
        outline_tools = build_outline_planner_tools(state, api_client)

        # 3. Phase 1: Format extraction
        if progress_callback:
            await progress_callback("format_extraction", "正在分析招标文件格式要求...")

        format_agent = create_deepseek_agent(
            name="format-extractor",
            system_prompt=format_extractor.SYSTEM_PROMPT,
            tools=format_tools,
            tool_call_limit=8,
        )

        format_instruction = (
            f"请分析项目 {project_id} 的招标文档格式要求。"
            f"请先用 get_tender_tree 获取文档结构，然后针对性地查询格式相关章节（最多查询3次），"
            f"最后调用 save_format_spec 保存结果。"
        )
        logger.info("Starting format-extractor for project %s", project_id)
        await format_agent.arun(format_instruction)
        logger.info(
            "Format extraction complete. has_format_requirement=%s",
            state.format_spec.get("has_format_requirement") if state.format_spec else "N/A",
        )

        # 4. Phase 2: Outline planning
        if progress_callback:
            await progress_callback("outline_planning", "正在生成投标大纲...")

        outline_agent = create_deepseek_agent(
            name="outline-planner",
            system_prompt=outline_planner.SYSTEM_PROMPT,
            tools=outline_tools,
            tool_call_limit=10,
        )

        outline_instruction = f"请为项目 {project_id} 生成投标文件大纲。"
        if state.format_spec:
            outline_instruction += "\n\nformat-extractor 已完成格式分析，请先查询格式规范。"
        if user_requirements:
            outline_instruction += f"\n\n用户补充要求:\n{user_requirements}"
        if attachment_names:
            outline_instruction += f"\n\n参考附件: {', '.join(attachment_names)}"

        logger.info("Starting outline-planner for project %s", project_id)
        await outline_agent.arun(outline_instruction)
        logger.info(
            "Outline planning complete. %d sections generated.",
            len(state.sections),
        )

        # 5. Return the sections that save_outline wrote to state (and backend)
        return state.get_all_sections_sorted()

    finally:
        await api_client.close()


def _load_env() -> None:
    """Load environment variables from .env files.

    Searches in the following order:
    1. ``lib/docmind-ai/.env`` (primary backend config)
    2. ``.env`` (project root)
    """
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    backend_env = os.path.join(project_root, "lib", "docmind-ai", ".env")
    root_env = os.path.join(project_root, ".env")

    if os.path.exists(backend_env):
        load_dotenv(backend_env, override=False)
    if os.path.exists(root_env):
        load_dotenv(root_env, override=False)
