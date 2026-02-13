"""Tools for managing bid project outline and sections.

Agno-compatible tool functions.
"""

from __future__ import annotations

import json
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..api.client import BidSmartAPIClient
    from ..state.project_state import BidProjectState


async def save_outline(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    sections_json: str = "",
) -> str:
    """保存AI生成的投标文件大纲到项目中，将大纲章节转换为可编辑的投标章节.
    
    Args:
        sections_json: 大纲章节JSON字符串
    
    Returns:
        保存结果文本
    """
    if not state.project_id:
        return "错误：未设置项目ID"

    try:
        sections = json.loads(sections_json)
    except json.JSONDecodeError as e:
        return f"大纲JSON解析失败: {e}"

    # Convert outline sections to writable tender sections
    tender_sections = []
    for i, sec in enumerate(sections):
        tender_sec = {
            "id": sec.get("id", f"sec-{i+1}"),
            "title": sec.get("title", ""),
            "content": "",
            "summary": sec.get("description", ""),
            "requirement_references": [],
            "status": "pending",
            "order": sec.get("order", i + 1),
            "word_count": 0,
        }
        tender_sections.append(tender_sec)
        state.sections[tender_sec["id"]] = tender_sec

    state.outline = sections

    # Sync to backend
    project_data = {
        "id": state.project_id,
        "title": state.project_title,
        "tender_document_id": state.tender_document_id or "",
        "tender_document_tree": state.tender_tree or {},
        "sections": tender_sections,
        "status": "draft",
        "created_at": int(time.time() * 1000),
        "updated_at": int(time.time() * 1000),
    }
    try:
        await api_client.update_project(state.project_id, project_data)
    except Exception:
        # If update fails (404), try create
        try:
            result = await api_client.create_project(project_data)
            state.project_id = result.get("id", state.project_id)
        except Exception as e:
            return f"保存大纲到后端失败: {e}"

    return f"大纲已保存，共 {len(tender_sections)} 个章节: {', '.join(s['title'] for s in tender_sections)}"


async def save_section_content(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    section_id: str = "",
    content: str = "",
    status: str = "in_progress",
) -> str:
    """保存或更新投标章节的内容.
    
    Args:
        section_id: 章节ID
        content: 章节内容
        status: 章节状态
    
    Returns:
        保存结果文本
    """
    if section_id not in state.sections:
        return f"章节 {section_id} 不存在"

    # Update local state
    state.sections[section_id]["content"] = content
    state.sections[section_id]["status"] = status
    state.sections[section_id]["word_count"] = len(content)

    # Sync to backend
    if state.project_id:
        try:
            await api_client.auto_save_section(state.project_id, section_id, content)
        except Exception as e:
            return f"保存到后端失败: {e}"

    word_count = len(content)
    return f"章节 [{state.sections[section_id]['title']}] 已保存 ({word_count} 字), 状态: {status}"


async def get_section_content(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
    section_id: str = "",
) -> str:
    """获取指定投标章节的当前内容.
    
    Args:
        section_id: 章节ID
    
    Returns:
        章节内容JSON
    """
    section = state.get_section(section_id)

    if not section:
        return f"章节 {section_id} 不存在"

    return json.dumps(section, ensure_ascii=False, indent=2)


async def get_all_sections(
    state: BidProjectState,
    api_client: BidSmartAPIClient,
) -> str:
    """获取投标项目的所有章节列表及其内容和状态.
    
    Returns:
        所有章节信息文本
    """
    sections = state.get_all_sections_sorted()
    if not sections:
        return "当前项目没有任何章节"

    progress = state.get_progress_summary()
    header = f"共 {progress['total']} 个章节 (已完成: {progress['completed']}, 进行中: {progress['in_progress']}, 待编写: {progress['pending']})\n\n"

    section_summaries = []
    for s in sections:
        status_icon = {"completed": "✓", "in_progress": "→", "pending": "○"}.get(s.get("status", ""), "?")
        word_count = s.get("word_count", len(s.get("content", "")))
        section_summaries.append(
            f"{status_icon} [{s['id']}] {s.get('title', '')} ({word_count}字) - {s.get('status', 'pending')}"
        )
        if s.get("content"):
            # Include a preview of content
            preview = s["content"][:200] + "..." if len(s["content"]) > 200 else s["content"]
            section_summaries.append(f"  内容预览: {preview}")

    return header + "\n".join(section_summaries)
