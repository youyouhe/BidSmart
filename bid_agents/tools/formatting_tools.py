"""Tools for document formatting and export.

Agno-compatible tool functions.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..api.client import BidSmartAPIClient
    from ..state.project_state import BidProjectState


async def format_table(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    headers: str = "",
    rows_json: str = "",
) -> str:
    """将数据格式化为标准Markdown表格.
    
    Args:
        headers: 表头（逗号分隔）
        rows_json: 表格数据JSON字符串
    
    Returns:
        Markdown表格文本
    """
    headers_str = headers
    headers_list = [h.strip() for h in headers_str.split(",")]

    try:
        rows = json.loads(rows_json)
    except json.JSONDecodeError as e:
        return f"表格数据JSON解析失败: {e}"

    if not headers_list or not rows:
        return "表头或数据不能为空"

    # Build markdown table
    lines = []
    lines.append("| " + " | ".join(headers_list) + " |")
    lines.append("| " + " | ".join(["---"] * len(headers_list)) + " |")

    for row in rows:
        if isinstance(row, dict):
            cells = [str(row.get(h, "")) for h in headers_list]
        elif isinstance(row, list):
            cells = [str(c) for c in row]
        else:
            cells = [str(row)]
        # Pad if needed
        while len(cells) < len(headers_list):
            cells.append("")
        lines.append("| " + " | ".join(cells[:len(headers_list)]) + " |")

    return "\n".join(lines)


async def export_document(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    format: str = "word",
    include_outline: bool = True,
) -> str:
    """将投标项目导出为Word或PDF文档.
    
    Args:
        format: 导出格式（word/pdf）
        include_outline: 是否包含大纲
    
    Returns:
        导出结果文本
    """
    if not state.project_id:
        return "未设置项目ID，无法导出"

    export_format = format
    include_outline_flag = include_outline

    config = {
        "format": export_format,
        "include_outline": include_outline_flag,
        "include_requirements": True,
    }

    try:
        content = await api_client.export_project(state.project_id, config)
        ext = "docx" if export_format == "word" else "pdf"
        filename = f"{state.project_title or 'bid_document'}.{ext}"

        # Save to local file
        from pathlib import Path

        output_dir = Path.cwd() / "exports"
        output_dir.mkdir(exist_ok=True)
        output_path = output_dir / filename
        output_path.write_bytes(content)

        return f"文档已导出: {output_path} (大小: {len(content)} 字节)"
    except Exception as e:
        return f"导出失败: {e}"
