"""Adapter layer that converts existing bid_agents tools to agno Function format.

This module wraps the core logic from bid_agents/tools/ into agno ``Function``
objects compatible with agno's ``Agent``.  The original tool files are NOT modified.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import TYPE_CHECKING

from agno.tools.function import Function

if TYPE_CHECKING:
    from .api.client import BidSmartAPIClient
    from .state.project_state import BidProjectState

logger = logging.getLogger(__name__)

# Import tool functions directly from tools modules
from .tools.tender_tools import query_tender_requirements as _query_tender_requirements_impl, get_tender_tree as _get_tender_tree_impl
from .tools.project_tools import save_outline as _save_outline_impl, save_section_content as _save_section_content_impl, get_section_content as _get_section_content_impl, get_all_sections as _get_all_sections_impl
from .tools.format_tools import save_format_spec as _save_format_spec_impl
from .tools.analysis_tools import save_analysis_report as _save_analysis_report_impl, validate_scoring_criteria as _validate_scoring_criteria_impl, extract_key_data as _extract_key_data_impl
from .tools.document_tools import search_documents as _search_documents_impl, get_document_metadata as _get_document_metadata_impl, list_documents_by_category as _list_documents_by_category_impl, get_document_tree as _get_document_tree_impl
from .tools.company_tools import get_company_profile as _get_company_profile_impl, get_company_capabilities as _get_company_capabilities_impl, get_team_profiles as _get_team_profiles_impl, search_past_projects as _search_past_projects_impl
from .tools.pricing_tools import get_pricing_templates as _get_pricing_templates_impl, calculate_totals as _calculate_totals_impl
from .tools.formatting_tools import format_table as _format_table_impl, export_document as _export_document_impl
from .tools.review_tools import submit_review_feedback as _submit_review_feedback_impl, get_compliance_checklist as _get_compliance_checklist_impl


# =============================================================================
# Tender tools — handlers
# =============================================================================

async def _run_tender_query(
    state: BidProjectState, api_client: BidSmartAPIClient,
    query: str = "", node_ids: str = "",
) -> str:
    """Call query_tender_requirements from tender_tools.py."""
    return await _query_tender_requirements_impl(state, api_client, query, node_ids)


async def _run_get_tree(
    state: BidProjectState, api_client: BidSmartAPIClient,
    document_id: str = "",
) -> str:
    """Call get_tender_tree from tender_tools.py."""
    return await _get_tender_tree_impl(state, api_client, document_id)


# =============================================================================
# Format tools — handlers
# =============================================================================

async def _run_save_format_spec(state: BidProjectState, format_spec_json: str) -> str:
    """Call save_format_spec from format_tools.py."""
    return await _save_format_spec_impl(state, format_spec_json)


# =============================================================================
# Analysis tools — handlers
# =============================================================================

async def _run_save_analysis_report(state: BidProjectState, report_json: str) -> str:
    """Call save_analysis_report from analysis_tools.py."""
    return await _save_analysis_report_impl(state, report_json)


async def _run_validate_scoring_criteria(state: BidProjectState, scoring_json: str) -> str:
    """Call validate_scoring_criteria from analysis_tools.py."""
    return await _validate_scoring_criteria_impl(state, scoring_json)


async def _run_extract_key_data(state: BidProjectState, node_id: str, data_types: str) -> str:
    """Call extract_key_data from analysis_tools.py."""
    return await _extract_key_data_impl(state, node_id, data_types)


# =============================================================================
# Project tools — handlers
# =============================================================================

async def _run_save_outline(
    state: BidProjectState, api_client: BidSmartAPIClient,
    sections_json: str,
) -> str:
    """Call save_outline from project_tools.py."""
    return await _save_outline_impl(state, api_client, sections_json)


async def _run_save_section_content(
    state: BidProjectState, api_client: BidSmartAPIClient,
    section_id: str, content: str, status: str = "in_progress",
) -> str:
    """Call save_section_content from project_tools.py."""
    return await _save_section_content_impl(state, api_client, section_id, content, status)


async def _run_get_section_content(state: BidProjectState, api_client: BidSmartAPIClient, section_id: str) -> str:
    """Call get_section_content from project_tools.py."""
    return await _get_section_content_impl(state, api_client, section_id)


async def _run_get_all_sections(state: BidProjectState, api_client: BidSmartAPIClient) -> str:
    """Call get_all_sections from project_tools.py."""
    return await _get_all_sections_impl(state, api_client)


# =============================================================================
# Company tools — handlers
# =============================================================================

async def _run_get_company_profile(state: BidProjectState) -> str:
    """Call get_company_profile from company_tools.py."""
    return await _get_company_profile_impl(state)


async def _run_get_company_capabilities(state: BidProjectState, domain: str = "") -> str:
    """Call get_company_capabilities from company_tools.py."""
    return await _get_company_capabilities_impl(state, domain)


async def _run_get_team_profiles(state: BidProjectState, roles: str = "") -> str:
    """Call get_team_profiles from company_tools.py."""
    return await _get_team_profiles_impl(state, roles)


async def _run_search_past_projects(
    state: BidProjectState, query: str = "", min_contract_value: float = 0.0,
) -> str:
    """Call search_past_projects from company_tools.py."""
    return await _search_past_projects_impl(state, query, min_contract_value)


# =============================================================================
# Document tools — handlers
# =============================================================================

async def _run_search_documents(
    state: BidProjectState, api_client: BidSmartAPIClient, query: str = "", category: str = "",
) -> str:
    """Call search_documents from document_tools.py."""
    return await _search_documents_impl(state, api_client, query, category)


async def _run_get_document_metadata(state: BidProjectState, api_client: BidSmartAPIClient, document_id: str) -> str:
    """Call get_document_metadata from document_tools.py."""
    return await _get_document_metadata_impl(state, api_client, document_id)


async def _run_list_documents_by_category(state: BidProjectState, api_client: BidSmartAPIClient, category: str = "") -> str:
    """Call list_documents_by_category from document_tools.py."""
    return await _list_documents_by_category_impl(state, api_client, category)


async def _run_get_document_tree_tool(
    state: BidProjectState, api_client: BidSmartAPIClient, document_id: str,
) -> str:
    """Call get_document_tree from document_tools.py."""
    return await _get_document_tree_impl(state, api_client, document_id)


# =============================================================================
# Pricing tools — handlers
# =============================================================================

async def _run_get_pricing_templates(state: BidProjectState, category: str = "") -> str:
    """Call get_pricing_templates from pricing_tools.py."""
    return await _get_pricing_templates_impl(state, category)


def _num_to_chinese(num: float) -> str:
    """Convert a number to Chinese uppercase currency representation."""
    digits = "零壹贰叁肆伍陆柒捌玖"
    units = ["", "拾", "佰", "仟"]
    big_units = ["", "万", "亿"]

    total_fen = round(num * 100)
    yuan = total_fen // 100
    jiao = (total_fen // 10) % 10
    fen = total_fen % 10

    if yuan == 0:
        result = "零元"
    else:
        result = ""
        yuan_str = str(yuan)
        length = len(yuan_str)

        for i, ch in enumerate(yuan_str):
            d = int(ch)
            pos = length - 1 - i
            group_pos = pos % 4
            big_pos = pos // 4

            if d != 0:
                result += digits[d] + units[group_pos]
            else:
                if result and not result.endswith("零"):
                    result += "零"

            if group_pos == 0 and big_pos > 0:
                result = result.rstrip("零")
                result += big_units[big_pos]

        result = result.rstrip("零") + "元"

    if jiao > 0:
        result += digits[jiao] + "角"
    if fen > 0:
        result += digits[fen] + "分"
    elif jiao == 0:
        result += "整"

    return result


async def _run_calculate_totals(state: BidProjectState, items_json: str, tax_rate: float = 0.13) -> str:
    """Call calculate_totals from pricing_tools.py."""
    return await _calculate_totals_impl(state, items_json, tax_rate)


# =============================================================================
# Review tools — handlers
# =============================================================================

async def _run_submit_review_feedback(
    state: BidProjectState, section_id: str, findings_json: str,
) -> str:
    """Call submit_review_feedback from review_tools.py."""
    return await _submit_review_feedback_impl(state, section_id, findings_json)


async def _run_get_compliance_checklist(state: BidProjectState) -> str:
    """Call get_compliance_checklist from review_tools.py."""
    return await _get_compliance_checklist_impl(state)


# =============================================================================
# Formatting tools — handlers
# =============================================================================

async def _run_format_table(state: BidProjectState, api_client: BidSmartAPIClient, headers: str, rows_json: str) -> str:
    """Call format_table from formatting_tools.py."""
    return await _format_table_impl(state, api_client, headers, rows_json)


async def _run_export_document(
    state: BidProjectState, api_client: BidSmartAPIClient,
    format: str = "word", include_outline: bool = True,
) -> str:
    """Call export_document from formatting_tools.py."""
    return await _export_document_impl(state, api_client, format, include_outline)


# =============================================================================
# Tool builders for each agent
# =============================================================================

def build_format_extractor_tools(
    state: BidProjectState, api_client: BidSmartAPIClient
) -> list[Function]:
    """Build agno Function list for the format-extractor agent."""

    async def query_tender_requirements(query: str = "", node_ids: str = "") -> str:
        """根据关键词或章节ID查询招标文档中的具体要求和内容"""
        return await _run_tender_query(state, api_client, query, node_ids)

    async def get_tender_tree(document_id: str = "") -> str:
        """获取招标文档的完整树形结构，包含所有章节标题和摘要"""
        return await _run_get_tree(state, api_client, document_id)

    async def save_format_spec(format_spec_json: str) -> str:
        """保存从招标文件中提取的投标格式要求规范

        Args:
            format_spec_json: 格式规范的JSON字符串，包含 has_format_requirement, source_section, required_structure, additional_rules
        """
        return await _run_save_format_spec(state, format_spec_json)

    return [
        Function.from_callable(query_tender_requirements),
        Function.from_callable(get_tender_tree),
        Function.from_callable(save_format_spec),
    ]


def build_outline_planner_tools(
    state: BidProjectState, api_client: BidSmartAPIClient
) -> list[Function]:
    """Build agno Function list for the outline-planner agent."""

    async def query_tender_requirements(query: str = "", node_ids: str = "") -> str:
        """根据关键词或章节ID查询招标文档中的具体要求和内容

        Args:
            query: 查询关键词，如'技术要求'、'评分标准'、'投标格式规范'
            node_ids: 章节ID列表(逗号分隔)，用于精确查询
        """
        return await _run_tender_query(state, api_client, query, node_ids)

    async def get_tender_tree(document_id: str = "") -> str:
        """获取招标文档的完整树形结构，包含所有章节标题和摘要

        Args:
            document_id: 文档ID（可选，默认使用当前项目的招标文档）
        """
        return await _run_get_tree(state, api_client, document_id)

    async def save_outline(sections_json: str) -> str:
        """保存AI生成的投标文件大纲到项目中，将大纲章节转换为可编辑的投标章节

        Args:
            sections_json: 大纲章节JSON数组，每个元素包含 id, title, description, requirementSummary, order
        """
        return await _run_save_outline(state, api_client, sections_json)

    return [
        Function.from_callable(query_tender_requirements),
        Function.from_callable(get_tender_tree),
        Function.from_callable(save_outline),
    ]


def build_document_finder_tools(
    state: BidProjectState, api_client: BidSmartAPIClient
) -> list[Function]:
    """Build agno Function list for the document-finder agent."""

    async def search_documents(query: str = "", category: str = "") -> str:
        """搜索公司文档库中的资质文件、执照、合同、业绩证明等扫描件

        Args:
            query: 搜索关键词，如'营业执照'、'ISO认证'、'中标通知书'
            category: 文档分类，如'资质文件'、'业绩证明'、'合同'
        """
        return await _run_search_documents(state, api_client, query, category)

    async def get_document_metadata(document_id: str) -> str:
        """获取指定文档的详细元数据信息（文件名、大小、解析状态等）

        Args:
            document_id: 文档ID
        """
        return await _run_get_document_metadata(state, api_client, document_id)

    async def list_documents_by_category(category: str = "") -> str:
        """按类别列出所有已解析文档（如：资质文件、业绩证明、合同等）

        Args:
            category: 文档分类
        """
        return await _run_list_documents_by_category(state, api_client, category)

    async def get_document_tree(document_id: str) -> str:
        """获取指定文档的解析后树形结构

        Args:
            document_id: 文档ID
        """
        return await _run_get_document_tree_tool(state, api_client, document_id)

    return [
        Function.from_callable(search_documents),
        Function.from_callable(get_document_metadata),
        Function.from_callable(list_documents_by_category),
        Function.from_callable(get_document_tree),
    ]


def build_commercial_writer_tools(
    state: BidProjectState, api_client: BidSmartAPIClient
) -> list[Function]:
    """Build agno Function list for the commercial-bid-writer agent."""

    async def query_tender_requirements(query: str = "", node_ids: str = "") -> str:
        """根据关键词或章节ID查询招标文档中的具体要求和内容

        Args:
            query: 查询关键词，如'商务条款'、'付款条件'、'投标保证金'
            node_ids: 章节ID列表(逗号分隔)
        """
        return await _run_tender_query(state, api_client, query, node_ids)

    async def save_section_content(section_id: str, content: str, status: str = "completed") -> str:
        """保存或更新投标章节的内容

        Args:
            section_id: 章节ID
            content: 章节内容
            status: 章节状态(pending/in_progress/completed)
        """
        return await _run_save_section_content(state, api_client, section_id, content, status)

    async def get_section_content(section_id: str) -> str:
        """获取指定投标章节的当前内容

        Args:
            section_id: 章节ID
        """
        return await _run_get_section_content(state, api_client, section_id)

    async def get_company_profile() -> str:
        """获取公司基础信息（名称、注册号、法人、资质等级、银行账户等）"""
        return await _run_get_company_profile(state)

    async def get_pricing_templates(category: str = "") -> str:
        """获取标准报价表模板（hardware=硬件, software=软件, services=服务）

        Args:
            category: 模板类别 (hardware/software/services)
        """
        return await _run_get_pricing_templates(state, category)

    async def format_table(headers: str, rows_json: str) -> str:
        """将数据格式化为标准Markdown表格

        Args:
            headers: 表头(逗号分隔)，如'序号,项目,数量,单价,合计'
            rows_json: 行数据JSON数组
        """
        return await _run_format_table(state, api_client, headers, rows_json)

    return [
        Function.from_callable(query_tender_requirements),
        Function.from_callable(save_section_content),
        Function.from_callable(get_section_content),
        Function.from_callable(get_company_profile),
        Function.from_callable(get_pricing_templates),
        Function.from_callable(format_table),
    ]


def build_technical_writer_tools(
    state: BidProjectState, api_client: BidSmartAPIClient
) -> list[Function]:
    """Build agno Function list for the technical-bid-writer agent."""

    async def query_tender_requirements(query: str = "", node_ids: str = "") -> str:
        """根据关键词或章节ID查询招标文档中的具体要求和内容

        Args:
            query: 查询关键词，如'技术要求'、'性能指标'、'系统架构'
            node_ids: 章节ID列表(逗号分隔)
        """
        return await _run_tender_query(state, api_client, query, node_ids)

    async def save_section_content(section_id: str, content: str, status: str = "completed") -> str:
        """保存或更新投标章节的内容

        Args:
            section_id: 章节ID
            content: 章节内容
            status: 章节状态(pending/in_progress/completed)
        """
        return await _run_save_section_content(state, api_client, section_id, content, status)

    async def get_section_content(section_id: str) -> str:
        """获取指定投标章节的当前内容

        Args:
            section_id: 章节ID
        """
        return await _run_get_section_content(state, api_client, section_id)

    async def get_company_capabilities(domain: str = "") -> str:
        """获取公司在指定领域的技术能力描述

        Args:
            domain: 领域名称，如'IT'、'软件开发'、'集成服务'
        """
        return await _run_get_company_capabilities(state, domain)

    async def search_past_projects(query: str = "", min_contract_value: float = 0.0) -> str:
        """搜索公司过往项目业绩（可按关键词和最低合同金额筛选）

        Args:
            query: 搜索关键词
            min_contract_value: 最低合同金额(万元)
        """
        return await _run_search_past_projects(state, query, min_contract_value)

    async def get_team_profiles(roles: str = "") -> str:
        """获取项目团队成员信息（按角色筛选：项目经理、技术总监等）

        Args:
            roles: 角色筛选(逗号分隔)，如'项目经理,技术总监'
        """
        return await _run_get_team_profiles(state, roles)

    return [
        Function.from_callable(query_tender_requirements),
        Function.from_callable(save_section_content),
        Function.from_callable(get_section_content),
        Function.from_callable(get_company_capabilities),
        Function.from_callable(search_past_projects),
        Function.from_callable(get_team_profiles),
    ]


def build_pricing_calculator_tools(
    state: BidProjectState, api_client: BidSmartAPIClient
) -> list[Function]:
    """Build agno Function list for the pricing-calculator agent."""

    async def query_tender_requirements(query: str = "", node_ids: str = "") -> str:
        """根据关键词或章节ID查询招标文档中的具体要求和内容

        Args:
            query: 查询关键词，如'报价要求'、'限价'、'付款方式'
            node_ids: 章节ID列表(逗号分隔)
        """
        return await _run_tender_query(state, api_client, query, node_ids)

    async def get_pricing_templates(category: str = "") -> str:
        """获取标准报价表模板（hardware=硬件, software=软件, services=服务）

        Args:
            category: 模板类别 (hardware/software/services)
        """
        return await _run_get_pricing_templates(state, category)

    async def calculate_totals(items_json: str, tax_rate: float = 0.13) -> str:
        """计算报价汇总：从明细项计算小计、税费和总价

        Args:
            items_json: 明细项JSON数组，每项包含 name, quantity, unit_price
            tax_rate: 税率(默认0.13即13%)
        """
        return await _run_calculate_totals(state, items_json, tax_rate)

    async def format_table(headers: str, rows_json: str) -> str:
        """将数据格式化为标准Markdown表格

        Args:
            headers: 表头(逗号分隔)
            rows_json: 行数据JSON数组
        """
        return await _run_format_table(state, api_client, headers, rows_json)

    async def save_section_content(section_id: str, content: str, status: str = "completed") -> str:
        """保存或更新投标章节的内容

        Args:
            section_id: 章节ID
            content: 章节内容
            status: 章节状态
        """
        return await _run_save_section_content(state, api_client, section_id, content, status)

    async def get_section_content(section_id: str) -> str:
        """获取指定投标章节的当前内容

        Args:
            section_id: 章节ID
        """
        return await _run_get_section_content(state, api_client, section_id)

    return [
        Function.from_callable(query_tender_requirements),
        Function.from_callable(get_pricing_templates),
        Function.from_callable(calculate_totals),
        Function.from_callable(format_table),
        Function.from_callable(save_section_content),
        Function.from_callable(get_section_content),
    ]


def build_review_agent_tools(
    state: BidProjectState, api_client: BidSmartAPIClient
) -> list[Function]:
    """Build agno Function list for the review-agent."""

    async def query_tender_requirements(query: str = "", node_ids: str = "") -> str:
        """根据关键词或章节ID查询招标文档中的具体要求和内容

        Args:
            query: 查询关键词
            node_ids: 章节ID列表(逗号分隔)
        """
        return await _run_tender_query(state, api_client, query, node_ids)

    async def get_section_content(section_id: str) -> str:
        """获取指定投标章节的当前内容

        Args:
            section_id: 章节ID
        """
        return await _run_get_section_content(state, api_client, section_id)

    async def get_all_sections() -> str:
        """获取投标项目的所有章节列表及其内容和状态"""
        return await _run_get_all_sections(state, api_client)

    async def submit_review_feedback(section_id: str, findings_json: str) -> str:
        """提交对投标章节的审核意见（包含问题严重程度、描述和修改建议）

        Args:
            section_id: 被审核的章节ID
            findings_json: 审核意见JSON数组，每项包含 severity, description, suggestion, reference
        """
        return await _run_submit_review_feedback(state, section_id, findings_json)

    return [
        Function.from_callable(query_tender_requirements),
        Function.from_callable(get_section_content),
        Function.from_callable(get_all_sections),
        Function.from_callable(submit_review_feedback),
    ]


def build_compliance_checker_tools(
    state: BidProjectState, api_client: BidSmartAPIClient
) -> list[Function]:
    """Build agno Function list for the compliance-checker agent."""

    async def query_tender_requirements(query: str = "", node_ids: str = "") -> str:
        """根据关键词或章节ID查询招标文档中的具体要求和内容

        Args:
            query: 查询关键词
            node_ids: 章节ID列表(逗号分隔)
        """
        return await _run_tender_query(state, api_client, query, node_ids)

    async def get_all_sections() -> str:
        """获取投标项目的所有章节列表及其内容和状态"""
        return await _run_get_all_sections(state, api_client)

    async def get_compliance_checklist() -> str:
        """生成合规检查清单，列出招标文件中的所有强制性要求及其响应状态"""
        return await _run_get_compliance_checklist(state)

    return [
        Function.from_callable(query_tender_requirements),
        Function.from_callable(get_all_sections),
        Function.from_callable(get_compliance_checklist),
    ]


def build_mermaid_generator_tools(
    state: BidProjectState, api_client: BidSmartAPIClient
) -> list[Function]:
    """Build agno Function list for the mermaid-generator agent."""

    async def get_section_content(section_id: str) -> str:
        """获取指定投标章节的当前内容

        Args:
            section_id: 章节ID
        """
        return await _run_get_section_content(state, api_client, section_id)

    async def save_section_content(section_id: str, content: str, status: str = "completed") -> str:
        """保存或更新投标章节的内容（将生成的Mermaid图表插入到章节内容中）

        Args:
            section_id: 章节ID
            content: 包含Mermaid图表的章节内容
            status: 章节状态
        """
        return await _run_save_section_content(state, api_client, section_id, content, status)

    return [
        Function.from_callable(get_section_content),
        Function.from_callable(save_section_content),
    ]


def build_formatting_agent_tools(
    state: BidProjectState, api_client: BidSmartAPIClient
) -> list[Function]:
    """Build agno Function list for the formatting-agent."""

    async def get_all_sections() -> str:
        """获取投标项目的所有章节列表及其内容和状态"""
        return await _run_get_all_sections(state, api_client)

    async def save_section_content(section_id: str, content: str, status: str = "completed") -> str:
        """保存格式化后的章节内容

        Args:
            section_id: 章节ID
            content: 格式化后的内容
            status: 章节状态
        """
        return await _run_save_section_content(state, api_client, section_id, content, status)

    async def export_document(format: str = "word", include_outline: bool = True) -> str:
        """将投标项目导出为Word或PDF文档

        Args:
            format: 导出格式 (word/pdf)
            include_outline: 是否包含目录
        """
        return await _run_export_document(state, api_client, format, include_outline)

    return [
        Function.from_callable(get_all_sections),
        Function.from_callable(save_section_content),
        Function.from_callable(export_document),
    ]


def build_tender_analyzer_tools(
    state: BidProjectState, api_client: BidSmartAPIClient
) -> list[Function]:
    """Build agno Function list for the tender-analyzer agent."""

    async def get_tender_tree(document_id: str = "") -> str:
        """获取招标文档的完整树形结构，包含所有章节标题和摘要

        Args:
            document_id: 文档ID（可选，默认使用当前项目的招标文档）
        """
        return await _run_get_tree(state, api_client, document_id)

    async def query_tender_requirements(query: str = "", node_ids: str = "") -> str:
        """根据关键词或章节ID查询招标文档中的具体要求和内容

        Args:
            query: 查询关键词，如'评分标准'、'资格要求'、'技术需求'
            node_ids: 章节ID列表(逗号分隔)，用于精确查询
        """
        return await _run_tender_query(state, api_client, query, node_ids)

    async def save_analysis_report(report_json: str) -> str:
        """保存招标文件分析报告，包含评分标准、资格要求、技术需求等结构化信息

        Args:
            report_json: 分析报告的JSON字符串，包含项目概况、资格要求、评分标准、技术需求、商务要求等章节
        """
        return await _run_save_analysis_report(state, report_json)

    async def validate_scoring_criteria(scoring_json: str) -> str:
        """验证评分标准的分值计算是否正确

        Args:
            scoring_json: 评分标准的JSON字符串，包含categories数组，每个category有name、score和items
        """
        return await _run_validate_scoring_criteria(state, scoring_json)

    async def extract_key_data(node_id: str, data_types: str) -> str:
        """从指定章节提取关键数据点（金额、日期、数量等）

        Args:
            node_id: 章节ID
            data_types: 要提取的数据类型，如'金额,日期,数量,百分比'
        """
        return await _run_extract_key_data(state, node_id, data_types)

    return [
        Function.from_callable(get_tender_tree),
        Function.from_callable(query_tender_requirements),
        Function.from_callable(save_analysis_report),
        Function.from_callable(validate_scoring_criteria),
        Function.from_callable(extract_key_data),
    ]
