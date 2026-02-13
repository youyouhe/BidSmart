"""Tools for saving tender document analysis reports.

Agno-compatible tool functions.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..state.project_state import BidProjectState


async def save_analysis_report(
    state: BidProjectState,
    report_json: str = "",
) -> str:
    """保存招标文件分析报告，包含评分标准、资格要求、技术需求等结构化信息.
    
    Args:
        report_json: 分析报告JSON字符串
    
    Returns:
        保存结果文本
    """
    try:
        report = json.loads(report_json)
    except (json.JSONDecodeError, KeyError) as e:
        return f"分析报告JSON解析失败: {e}"

    # Validate required sections
    required_sections = ["项目概况", "资格要求", "评分标准", "技术需求", "商务要求"]
    missing = [s for s in required_sections if s not in report]
    
    if missing:
        return f"分析报告缺少必需章节: {', '.join(missing)}"

    # Add metadata
    report["_metadata"] = {
        "created_at": datetime.now().isoformat(),
        "tender_document_id": state.tender_document_id,
        "version": "1.0"
    }

    state.analysis_report = report

    # Generate summary
    summary = _generate_report_summary(report)
    
    return (
        f"✅ 招标文件分析报告已保存\n\n"
        f"{summary}\n\n"
        f"报告包含 {len(report) - 1} 个主要章节，可供后续写作agent参考。"
    )


async def validate_scoring_criteria(
    state: BidProjectState,
    scoring_json: str = "",
) -> str:
    """验证评分标准的分值计算是否正确.
    
    Args:
        scoring_json: 评分标准JSON字符串
    
    Returns:
        验证结果文本
    """
    try:
        scoring = json.loads(scoring_json)
    except json.JSONDecodeError as e:
        return f"评分标准JSON解析失败: {e}"

    issues = []
    total_score = 0

    for category in scoring.get("categories", []):
        category_score = category.get("score", 0)
        category_name = category.get("name", "未命名")
        
        # Calculate sub-items sum
        sub_items = category.get("items", [])
        sub_total = sum(item.get("score", 0) for item in sub_items)
        
        if sub_total != category_score:
            issues.append(
                f"【{category_name}】分值计算异常: "
                f"大类分值 {category_score} ≠ 子项之和 {sub_total}"
            )
        
        total_score += category_score

    if total_score != 100:
        issues.append(f"总分验证异常: 所有大类之和为 {total_score}，应为 100")

    if issues:
        return (
            "⚠️ 评分标准验证发现问题:\n\n" + 
            "\n".join(f"{i+1}. {issue}" for i, issue in enumerate(issues)) +
            "\n\n建议: 向采购代理核实评分标准"
        )
    else:
        return "✅ 评分标准验证通过: 所有分值计算正确"


async def extract_key_data(
    state: BidProjectState,
    node_id: str = "",
    data_types: str = "金额,日期,数量,百分比",
) -> str:
    """从指定章节提取关键数据点（金额、日期、数量等）.
    
    Args:
        node_id: 节点ID
        data_types: 数据类型列表
    
    Returns:
        提取提示文本
    """
    return (
        f"准备从节点 {node_id} 提取以下类型的数据: {data_types}\n"
        f"请使用 query_tender_requirements 工具查询该节点内容后进行分析。"
    )


def _generate_report_summary(report: dict) -> str:
    """Generate a human-readable summary of the analysis report."""
    summary_parts = []
    
    # Project overview
    overview = report.get("项目概况", {})
    if overview:
        project_name = overview.get("项目名称", "未知")
        budget = overview.get("预算金额", "未知")
        summary_parts.append(f"📋 项目: {project_name}")
        summary_parts.append(f"💰 预算: {budget}")
    
    # Qualification requirements
    qualifications = report.get("资格要求", {})
    if qualifications:
        general = len(qualifications.get("一般资格条件", []))
        specific = len(qualifications.get("特定资格条件", []))
        negative = len(qualifications.get("负面清单", []))
        summary_parts.append(f"✅ 资格: {general}条一般 + {specific}条特定 + {negative}条负面")
    
    # Scoring criteria
    scoring = report.get("评分标准", {})
    if scoring:
        categories = len(scoring.get("categories", []))
        total_score = sum(c.get("score", 0) for c in scoring.get("categories", []))
        summary_parts.append(f"📊 评分: {categories}个类别，总分{total_score}分")
    
    # Technical requirements
    technical = report.get("技术需求", {})
    if technical:
        functional = len(technical.get("功能需求", []))
        params = len(technical.get("技术参数", []))
        summary_parts.append(f"🔧 技术: {functional}项功能 + {params}项参数")
    
    # Business requirements
    business = report.get("商务要求", {})
    if business:
        delivery = business.get("交付期", "未知")
        warranty = business.get("质保期", "未知")
        summary_parts.append(f"📅 交付: {delivery} | 质保: {warranty}")
    
    return "\n".join(summary_parts)
