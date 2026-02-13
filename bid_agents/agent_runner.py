"""Agent factory using agno framework with DeepSeek.

Replaces the custom AgentRunner with agno's Agent class, using DeepSeek's
OpenAI-compatible function calling API.
"""

from __future__ import annotations

import os
from typing import List, Optional, Union

from agno.agent import Agent
from agno.models.deepseek import DeepSeek
from agno.tools.function import Function
from agno.tools.toolkit import Toolkit


def create_deepseek_agent(
    name: str,
    system_prompt: str,
    tools: List[Union[Function, Toolkit]],
    model_id: Optional[str] = None,
    tool_call_limit: int = 30,
    temperature: float = 0.3,
) -> Agent:
    """Create an agno Agent configured for DeepSeek.

    Args:
        name: Human-readable agent name (for logging/tracing).
        system_prompt: The system message controlling agent behaviour.
        tools: List of agno Function or Toolkit objects.
        model_id: DeepSeek model identifier. Defaults to ``LLM_MODEL`` env
            var or ``deepseek-chat``.
        tool_call_limit: Maximum tool calls before the agent stops.
        temperature: Sampling temperature for the LLM.

    Returns:
        A ready-to-use ``Agent`` instance.  Call ``await agent.arun(msg)``
        to execute the agent loop.
    """
    resolved_model = model_id or os.getenv("LLM_MODEL", "deepseek-chat")

    return Agent(
        name=name,
        model=DeepSeek(id=resolved_model, temperature=temperature),
        system_message=system_prompt,
        tools=tools,
        tool_call_limit=tool_call_limit,
        markdown=False,
        num_history_runs=0,
    )
