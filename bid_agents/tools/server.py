"""Aggregates all bid writing tools for agno framework.

This module provides direct imports of all tool functions for use with agno.
The tools are used via tool_adapters.py which wraps them in agno Function objects.
"""

from __future__ import annotations

# Import tool functions directly - these are now plain async functions
# that can be used with agno's Function.from_callable()

from .tender_tools import query_tender_requirements, get_tender_tree
from .project_tools import save_outline, save_section_content, get_section_content, get_all_sections
from .document_tools import search_documents, get_document_metadata, list_documents_by_category, get_document_tree as get_doc_tree
from .company_tools import get_company_profile, get_company_capabilities, get_team_profiles, search_past_projects
from .pricing_tools import get_pricing_templates, calculate_totals
from .formatting_tools import format_table, export_document
from .review_tools import submit_review_feedback, get_compliance_checklist
from .format_tools import save_format_spec
from .analysis_tools import save_analysis_report, validate_scoring_criteria, extract_key_data
from .document_set_tools import (
    create_document_set,
    add_to_document_set,
    remove_from_document_set,
    list_document_set,
    get_document_set_info,
    set_primary_document,
    refresh_document_tree,
)

# Export all tool functions
__all__ = [
    # Tender tools
    "query_tender_requirements",
    "get_tender_tree",
    # Project tools
    "save_outline",
    "save_section_content",
    "get_section_content",
    "get_all_sections",
    # Document tools
    "search_documents",
    "get_document_metadata",
    "list_documents_by_category",
    "get_doc_tree",
    # Company tools
    "get_company_profile",
    "get_company_capabilities",
    "get_team_profiles",
    "search_past_projects",
    # Pricing tools
    "get_pricing_templates",
    "calculate_totals",
    # Formatting tools
    "format_table",
    "export_document",
    # Review tools
    "submit_review_feedback",
    "get_compliance_checklist",
    # Format extraction tools
    "save_format_spec",
    # Analysis tools
    "save_analysis_report",
    "validate_scoring_criteria",
    "extract_key_data",
    # Document set tools
    "create_document_set",
    "add_to_document_set",
    "remove_from_document_set",
    "list_document_set",
    "get_document_set_info",
    "set_primary_document",
    "refresh_document_tree",
]

# Tool names mapping for reference
ALL_TOOL_NAMES = [
    # Tender tools
    "query_tender_requirements",
    "get_tender_tree",
    # Project tools
    "save_outline",
    "save_section_content",
    "get_section_content",
    "get_all_sections",
    # Document tools
    "search_documents",
    "get_document_metadata",
    "list_documents_by_category",
    "get_doc_tree",
    # Company tools
    "get_company_profile",
    "get_company_capabilities",
    "get_team_profiles",
    "search_past_projects",
    # Pricing tools
    "get_pricing_templates",
    "calculate_totals",
    # Formatting tools
    "format_table",
    "export_document",
    # Review tools
    "submit_review_feedback",
    "get_compliance_checklist",
    # Format extraction tools
    "save_format_spec",
    # Analysis tools
    "save_analysis_report",
    "validate_scoring_criteria",
    "extract_key_data",
    # Document set tools
    "create_document_set",
    "add_to_document_set",
    "remove_from_document_set",
    "list_document_set",
    "get_document_set_info",
    "set_primary_document",
    "refresh_document_tree",
]
