"""Tools for review feedback and compliance checking.

Agno-compatible tool functions.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..state.project_state import BidProjectState


async def submit_review_feedback(
    state: BidProjectState,
    section_id: str = "",
    findings_json: str = "",
) -> str:
    """提交对投标章节的审核意见（包含问题严重程度、描述和修改建议）.
    
    Args:
        section_id: 章节ID
        findings_json: 审核意见JSON字符串
    
    Returns:
        提交结果文本
    """
    try:
        findings = json.loads(findings_json)
    except json.JSONDecodeError as e:
        return f"审核意见JSON解析失败: {e}"

    if section_id not in state.sections:
        return f"章节 {section_id} 不存在"

    # Validate findings format
    validated = []
    for f in findings:
        validated.append({
            "severity": f.get("severity", "minor"),
            "section_id": section_id,
            "description": f.get("description", ""),
            "suggestion": f.get("suggestion", ""),
            "reference": f.get("reference"),
        })

    state.review_feedback[section_id] = validated

    # Summary
    critical = sum(1 for f in validated if f["severity"] == "critical")
    major = sum(1 for f in validated if f["severity"] == "major")
    minor = sum(1 for f in validated if f["severity"] == "minor")

    section_title = state.sections[section_id].get("title", section_id)
    return (
        f"已提交章节 [{section_title}] 的审核意见: "
        f"{len(validated)} 条 (严重: {critical}, 主要: {major}, 次要: {minor})"
    )


async def get_compliance_checklist(
    state: BidProjectState,
) -> str:
    """生成合规检查清单，列出招标文件中的所有强制性要求及其响应状态.
    
    Returns:
        合规检查清单文本
    """
    if not state.tender_tree:
        return "未加载招标文档，无法生成合规清单"

    # Build checklist from tender tree mandatory requirements
    from ..models.types import Node

    tree = Node.from_dict(state.tender_tree)
    checklist_items = []

    def extract_requirements(node: Node, depth: int = 0) -> None:
        if node.summary:
            # Check if any section references this node
            is_covered = False
            covering_section = None
            for sid, sec in state.sections.items():
                refs = sec.get("requirement_references", [])
                content = sec.get("content", "")
                if node.id in refs or (
                    node.title and node.title.lower() in content.lower()
                ):
                    is_covered = True
                    covering_section = sid
                    break

            checklist_items.append({
                "requirement_id": node.id,
                "requirement_text": f"{node.title}: {node.summary[:100]}",
                "is_compliant": is_covered,
                "section_id": covering_section,
                "notes": "已响应" if is_covered else "待确认",
            })

        for child in node.children:
            extract_requirements(child, depth + 1)

    extract_requirements(tree)
    state.compliance_matrix = checklist_items

    # Format output
    total = len(checklist_items)
    compliant = sum(1 for c in checklist_items if c["is_compliant"])
    non_compliant = total - compliant

    lines = [
        f"合规检查清单 (总计: {total}, 已响应: {compliant}, 待确认: {non_compliant})\n",
        "| 状态 | 要求ID | 招标要求 | 响应章节 | 备注 |",
        "|------|--------|---------|---------|------|",
    ]

    for item in checklist_items:
        status = "✓" if item["is_compliant"] else "✗"
        section = item["section_id"] or "-"
        req_text = item["requirement_text"][:50]
        lines.append(f"| {status} | {item['requirement_id']} | {req_text} | {section} | {item['notes']} |")

    return "\n".join(lines)
