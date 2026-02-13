"""All AgentDefinition objects for the BidSmart multi-agent system.

This module defines all agents using agno-compatible configuration.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from ..config import (
    ANALYZER_MODEL,
    CALCULATOR_MODEL,
    COMPLIANCE_MODEL,
    FINDER_MODEL,
    FORMATTER_MODEL,
    REVIEWER_MODEL,
    WRITER_MODEL,
)
from .prompts import (
    commercial_writer,
    compliance_checker,
    document_finder,
    format_extractor,
    formatting_agent,
    mermaid_generator,
    outline_planner,
    pricing_calculator,
    review_agent,
    technical_writer,
    tender_analyzer,
)


@dataclass
class AgentDefinition:
    """Agent configuration definition for agno framework.
    
    Attributes:
        description: Human-readable description of what the agent does.
        prompt: The system prompt that controls agent behavior.
        tools: List of tool function names available to the agent.
        model: The model to use for this agent.
    """
    description: str
    prompt: str
    tools: list[str]
    model: Literal["opus", "sonnet", "haiku"] | str


ALL_AGENTS: dict[str, AgentDefinition] = {
    # ── Phase -1: Tender Document Analysis ───────────────────────────
    "tender-analyzer": AgentDefinition(
        description="深度分析招标文件，提取评分标准、资格要求、技术需求等关键信息，生成结构化分析报告",
        prompt=tender_analyzer.SYSTEM_PROMPT,
        tools=[
            "get_tender_tree",
            "query_tender_requirements",
            "save_analysis_report",
            "validate_scoring_criteria",
            "extract_key_data",
        ],
        model=ANALYZER_MODEL,
    ),
    # ── Phase 0: Format Extraction ──────────────────────────────────
    "format-extractor": AgentDefinition(
        description="识别招标文件中的投标格式要求，提取投标文件编排规范",
        prompt=format_extractor.SYSTEM_PROMPT,
        tools=[
            "query_tender_requirements",
            "get_tender_tree",
            "save_format_spec",
        ],
        model=FINDER_MODEL,
    ),
    # ── Phase 1: Outline Planning ───────────────────────────────────
    "outline-planner": AgentDefinition(
        description="分析招标文档结构，生成投标文件大纲",
        prompt=outline_planner.SYSTEM_PROMPT,
        tools=[
            "query_tender_requirements",
            "get_tender_tree",
            "save_outline",
        ],
        model=WRITER_MODEL,
    ),
    # ── Phase 2: Document Gathering ─────────────────────────────────
    "document-finder": AgentDefinition(
        description="查找公司资质文件、执照、合同、业绩扫描件",
        prompt=document_finder.SYSTEM_PROMPT,
        tools=[
            "search_documents",
            "get_document_metadata",
            "list_documents_by_category",
            "get_document_tree",
        ],
        model=FINDER_MODEL,
    ),
    # ── Phase 3: Content Writing ────────────────────────────────────
    "commercial-bid-writer": AgentDefinition(
        description="编写商务标书：投标函、商务条款、偏离表、服务承诺",
        prompt=commercial_writer.SYSTEM_PROMPT,
        tools=[
            "query_tender_requirements",
            "save_section_content",
            "get_section_content",
            "get_company_profile",
            "get_pricing_templates",
            "format_table",
        ],
        model=WRITER_MODEL,
    ),
    "technical-bid-writer": AgentDefinition(
        description="编写技术标书：技术方案、实施计划、团队配置、风险管理",
        prompt=technical_writer.SYSTEM_PROMPT,
        tools=[
            "query_tender_requirements",
            "save_section_content",
            "get_section_content",
            "get_company_capabilities",
            "search_past_projects",
            "get_team_profiles",
        ],
        model=WRITER_MODEL,
    ),
    "pricing-calculator": AgentDefinition(
        description="计算和生成报价表、分项报价、税费",
        prompt=pricing_calculator.SYSTEM_PROMPT,
        tools=[
            "query_tender_requirements",
            "get_pricing_templates",
            "calculate_totals",
            "format_table",
            "save_section_content",
            "get_section_content",
        ],
        model=CALCULATOR_MODEL,
    ),
    # ── Phase 4: Review ─────────────────────────────────────────────
    "review-agent": AgentDefinition(
        description="审核投标文件质量、一致性和完整性",
        prompt=review_agent.SYSTEM_PROMPT,
        tools=[
            "query_tender_requirements",
            "get_section_content",
            "get_all_sections",
            "submit_review_feedback",
        ],
        model=REVIEWER_MODEL,
    ),
    "compliance-checker": AgentDefinition(
        description="检查投标文件对招标要求的合规性，生成合规矩阵",
        prompt=compliance_checker.SYSTEM_PROMPT,
        tools=[
            "query_tender_requirements",
            "get_all_sections",
            "get_compliance_checklist",
        ],
        model=COMPLIANCE_MODEL,
    ),
    # ── Utility: Diagram Generation ─────────────────────────────────
    "mermaid-generator": AgentDefinition(
        description="将投标文件中的文字描述转换为Mermaid流程图、架构图等",
        prompt=mermaid_generator.SYSTEM_PROMPT,
        tools=[
            "get_section_content",
            "save_section_content",
        ],
        model=FINDER_MODEL,
    ),
    # ── Phase 6: Formatting & Export ────────────────────────────────
    "formatting-agent": AgentDefinition(
        description="格式化投标文件，规范编号、目录和排版",
        prompt=formatting_agent.SYSTEM_PROMPT,
        tools=[
            "get_all_sections",
            "save_section_content",
            "export_document",
        ],
        model=FORMATTER_MODEL,
    ),
}
