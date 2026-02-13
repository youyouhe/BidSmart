"""Hook callbacks for agent governance, progress tracking, and content validation."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from ..config import MIN_SECTION_CONTENT_LENGTH

if TYPE_CHECKING:
    from ..state.project_state import BidProjectState

logger = logging.getLogger(__name__)


def on_agent_start(state: BidProjectState):
    """Return a hook callback that tracks when a subagent starts."""

    async def _hook(input_data: dict, tool_use_id: str | None, context: dict) -> dict:
        agent_id = input_data.get("agent_id", "unknown")
        agent_type = input_data.get("agent_type", "unknown")
        state.current_agent = agent_id
        state.agent_status[agent_id] = "running"
        logger.info("Agent started: %s (type: %s)", agent_id, agent_type)
        return {}

    return _hook


def on_agent_stop(state: BidProjectState):
    """Return a hook callback that tracks when a subagent stops."""

    async def _hook(input_data: dict, tool_use_id: str | None, context: dict) -> dict:
        agent_id = input_data.get("agent_id", "unknown")
        state.agent_status[agent_id] = "completed"

        # Log progress summary
        progress = state.get_progress_summary()
        logger.info(
            "Agent completed: %s | Progress: %d/%d sections (%s%%)",
            agent_id,
            progress["completed"],
            progress["total"],
            progress["percentage"],
        )
        return {}

    return _hook


async def validate_content_length(
    input_data: dict, tool_use_id: str | None, context: dict
) -> dict:
    """PreToolUse hook that rejects saving empty or too-short section content."""
    tool_input = input_data.get("tool_input", {})
    content = tool_input.get("content", "")

    if len(content) < MIN_SECTION_CONTENT_LENGTH:
        logger.warning(
            "Rejected save_section_content: content too short (%d chars, min %d)",
            len(content),
            MIN_SECTION_CONTENT_LENGTH,
        )
        return {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": (
                    f"章节内容过短（{len(content)} 字符，最少 {MIN_SECTION_CONTENT_LENGTH} 字符）。"
                    f"请生成更充实的内容后再保存。"
                ),
            }
        }

    return {}
