"""Tools for extracting and saving bid format specifications.

Agno-compatible tool functions.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..state.project_state import BidProjectState


async def save_format_spec(
    state: BidProjectState,
    format_spec_json: str = "",
) -> str:
    """保存从招标文件中提取的投标格式要求规范.
    
    Args:
        format_spec_json: 格式规范JSON字符串
    
    Returns:
        保存结果文本
    """
    try:
        spec = json.loads(format_spec_json)
    except (json.JSONDecodeError, KeyError) as e:
        return f"格式规范JSON解析失败: {e}"

    # Validate required fields
    if "has_format_requirement" not in spec:
        return "格式规范缺少 has_format_requirement 字段"

    state.format_spec = spec

    if spec.get("has_format_requirement"):
        structure = spec.get("required_structure", [])
        rules = spec.get("additional_rules", [])
        source = spec.get("source_section", "未知")
        return (
            f"格式要求已保存。来源: {source}\n"
            f"必需章节: {len(structure)} 个\n"
            f"附加规则: {len(rules)} 条\n"
            f"章节列表: {', '.join(s.get('title', '') for s in structure)}"
        )
    else:
        return "已记录：该招标文件无明确的投标格式要求，将使用标准模板。"
