"""Content writing pipeline: classify sections → dispatch to writers.

Runs the appropriate writer agent (commercial / technical / pricing) for
each section based on its title and description.  Sections are written
sequentially so that later sections can reference earlier content.

Usage (from FastAPI backend)::

    results = await run_content_pipeline(
        project_id="project-xxx",
        api_url="http://localhost:8003",
        section_ids=["sec-1", "sec-4"],       # specific sections (or None = all pending)
        progress_callback=my_progress_fn,
    )
"""

from __future__ import annotations

import logging
import re
from typing import Awaitable, Callable, Optional

from .agent_runner import create_deepseek_agent
from .agents.prompts import commercial_writer, technical_writer, pricing_calculator
from .api.client import BidSmartAPIClient
from .outline_pipeline import _load_env
from .state.project_state import BidProjectState
from .tool_adapters import (
    build_commercial_writer_tools,
    build_technical_writer_tools,
    build_pricing_calculator_tools,
)

logger = logging.getLogger(__name__)

ProgressCallback = Optional[Callable[[str, str, int, int], Awaitable[None]]]

# ── Section classification ───────────────────────────────────────────────────

# Keywords that indicate each section type
_COMMERCIAL_KEYWORDS = [
    "投标函", "授权委托", "法人", "商务", "偏离表", "承诺", "保证金",
    "付款", "服务承诺", "售后", "质保", "响应", "资质", "业绩", "证明",
    "企业", "执照", "证书",
]

_PRICING_KEYWORDS = [
    "报价", "价格", "费用", "预算", "成本", "定价", "金额",
    "分项报价", "总价", "单价",
]

_TECHNICAL_KEYWORDS = [
    "技术", "方案", "架构", "设计", "实施", "部署", "集成",
    "团队", "人员", "培训", "测试", "质量", "风险", "进度", "计划",
    "功能", "系统", "平台", "网络", "安全", "运维", "开发",
]


def classify_section(title: str, description: str = "") -> str:
    """Classify a section as 'commercial', 'technical', or 'pricing'.

    Returns:
        One of: "commercial", "technical", "pricing"
    """
    text = (title + " " + description).lower()

    pricing_score = sum(1 for kw in _PRICING_KEYWORDS if kw in text)
    commercial_score = sum(1 for kw in _COMMERCIAL_KEYWORDS if kw in text)
    technical_score = sum(1 for kw in _TECHNICAL_KEYWORDS if kw in text)

    if pricing_score > 0 and pricing_score >= commercial_score and pricing_score >= technical_score:
        return "pricing"
    if commercial_score >= technical_score:
        return "commercial"
    return "technical"


# ── Pipeline ─────────────────────────────────────────────────────────────────

async def run_content_pipeline(
    project_id: str,
    api_url: str,
    section_ids: list[str] | None = None,
    progress_callback: ProgressCallback = None,
) -> dict:
    """Run content writing agents for specified (or all pending) sections.

    Args:
        project_id: The bid project ID (must exist with outline).
        api_url: BidSmart backend base URL.
        section_ids: Specific section IDs to write.  If ``None``, writes
            all sections with status ``pending``.
        progress_callback: ``async (phase, message, current, total) -> None``

    Returns:
        Dict with ``written`` (count), ``failed`` (list), and ``sections`` (all).
    """
    _load_env()

    api_client = BidSmartAPIClient(api_url)
    state = BidProjectState()
    written = 0
    failed: list[dict] = []

    try:
        await state.load_from_backend(api_client, project_id)

        # Determine which sections to write
        if section_ids:
            targets = [s for s in state.get_all_sections_sorted() if s["id"] in section_ids]
        else:
            targets = [s for s in state.get_all_sections_sorted() if s.get("status") == "pending"]

        if not targets:
            logger.info("No sections to write for project %s", project_id)
            return {"written": 0, "failed": [], "sections": state.get_all_sections_sorted()}

        total = len(targets)
        logger.info("Writing %d sections for project %s", total, project_id)

        # Build all tool sets (closures share state)
        commercial_tools = build_commercial_writer_tools(state, api_client)
        technical_tools = build_technical_writer_tools(state, api_client)
        pricing_tools = build_pricing_calculator_tools(state, api_client)

        for idx, section in enumerate(targets):
            section_id = section["id"]
            section_title = section.get("title", section_id)
            section_desc = section.get("summary", "")

            # Classify section
            writer_type = classify_section(section_title, section_desc)

            if progress_callback:
                await progress_callback(
                    f"writing_{writer_type}",
                    f"正在编写: {section_title}",
                    idx + 1,
                    total,
                )

            logger.info(
                "[%d/%d] Writing section '%s' (type=%s, id=%s)",
                idx + 1, total, section_title, writer_type, section_id,
            )

            # Select agent config
            if writer_type == "pricing":
                prompt = pricing_calculator.SYSTEM_PROMPT
                tools = pricing_tools
            elif writer_type == "commercial":
                prompt = commercial_writer.SYSTEM_PROMPT
                tools = commercial_tools
            else:
                prompt = technical_writer.SYSTEM_PROMPT
                tools = technical_tools

            # Build instruction for this specific section
            instruction = _build_writing_instruction(section, state)

            try:
                agent = create_deepseek_agent(
                    name=f"{writer_type}-writer",
                    system_prompt=prompt,
                    tools=tools,
                    tool_call_limit=20,
                )
                await agent.arun(instruction)
                written += 1
                logger.info("Section '%s' written successfully", section_title)
            except Exception as e:
                logger.exception("Failed to write section '%s'", section_title)
                failed.append({"section_id": section_id, "title": section_title, "error": str(e)})

        # Final sync
        await state.sync_to_backend(api_client)

        return {
            "written": written,
            "failed": failed,
            "sections": state.get_all_sections_sorted(),
        }

    finally:
        await api_client.close()


def _build_writing_instruction(section: dict, state: BidProjectState) -> str:
    """Build the user instruction for writing a specific section."""
    section_id = section["id"]
    title = section.get("title", "")
    description = section.get("summary", "")

    instruction = f"请编写投标章节: {title} (章节ID: {section_id})\n\n"

    if description:
        instruction += f"章节描述: {description}\n\n"

    # Include progress context
    progress = state.get_progress_summary()
    if progress["completed"] > 0:
        completed_titles = [
            s.get("title", "") for s in state.get_all_sections_sorted()
            if s.get("status") == "completed"
        ]
        instruction += f"已完成章节: {', '.join(completed_titles)}\n"
        instruction += "如需引用已完成章节的内容，请使用 get_section_content 工具查看。\n\n"

    instruction += (
        "请按以下步骤操作:\n"
        "1. 调用 query_tender_requirements 了解本章节对应的招标要求\n"
        "2. 根据需要调用其他工具获取公司信息\n"
        "3. 编写章节内容\n"
        "4. 调用 save_section_content 保存，status 设为 completed\n"
    )

    return instruction
