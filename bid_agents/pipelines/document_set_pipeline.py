"""DocumentSet-aware analysis pipeline.

Extends the base analysis pipeline to work with multi-document document sets.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from ..agent_runner import create_deepseek_agent
from ..agents.prompts import tender_analyzer
from ..api.client import BidSmartAPIClient
from ..state.project_state import BidProjectState
from ..tool_adapters import build_tender_analyzer_tools

if TYPE_CHECKING:
    from typing import Awaitable, Callable, Optional
    ProgressCallback = Optional[Callable[[str, str], Awaitable[None]]]

logger = logging.getLogger(__name__)


async def run_document_set_analysis_pipeline(
    project_id: str,
    api_url: str,
    progress_callback: ProgressCallback = None,
) -> dict:
    """Run tender document analysis on a document set.
    
    This pipeline:
    1. Analyzes primary document for key requirements
    2. Scans auxiliary documents for relevant context
    3. Cross-references historical bids for reusable content
    4. Generates comprehensive analysis report
    
    Args:
        project_id: The bid project ID
        api_url: Base URL of the BidSmart backend
        progress_callback: Async callback for progress updates
        
    Returns:
        Analysis report dictionary
    """
    # Initialize
    api_client = BidSmartAPIClient(api_url)
    state = BidProjectState()
    
    try:
        await state.load_from_backend(api_client, project_id)
        
        # Check if using document set
        if not state.is_using_document_set():
            logger.warning("No document set found, falling back to single document analysis")
            # Fall back to standard analysis
            from ..analysis_pipeline import run_analysis_pipeline
            return await run_analysis_pipeline(project_id, api_url, progress_callback)
        
        if progress_callback:
            await progress_callback("init", f"开始分析文档集: {state.document_set.name}")
        
        # Build tools
        analysis_tools = build_tender_analyzer_tools(state, api_client)
        
        # Create agent
        analyzer = create_deepseek_agent(
            name="document-set-analyzer",
            system_prompt=tender_analyzer.SYSTEM_PROMPT + _get_document_set_context(state),
            tools=analysis_tools,
            tool_call_limit=25,
        )
        
        # Build analysis instruction
        primary = state.document_set.get_primary_item()
        aux_count = len(state.document_set.get_items_by_role("auxiliary"))
        
        instruction = (
            f"请深度分析项目 {project_id} 的文档集。\n\n"
            f"文档集信息:\n"
            f"- 名称: {state.document_set.name}\n"
            f"- 主文档: {primary.name if primary else 'N/A'}\n"
            f"- 辅助文档: {aux_count} 个\n\n"
            f"分析步骤:\n"
            f"1. 首先调用 get_tender_tree 获取主文档目录结构\n"
            f"2. 使用 query_tender_requirements 分析主文档的关键章节:\n"
            f"   - 评分标准和评审细则\n"
            f"   - 供应商须知附表\n"
            f"   - 资格要求\n"
            f"   - 技术需求\n"
            f"3. 如存在辅助文档，可简要查看其目录结构了解内容类型\n"
            f"4. 使用 validate_scoring_criteria 验证评分标准\n"
            f"5. 最后调用 save_analysis_report 保存分析报告\n\n"
            f"注意事项:\n"
            f"- 主文档是分析重点，包含评分标准等关键信息\n"
            f"- 辅助文档提供补充信息，按需查询\n"
            f"- 必须引用原文，不得概括或推测"
        )
        
        logger.info("Starting document set analysis for project %s", project_id)
        await analyzer.arun(instruction)
        
        if state.analysis_report:
            logger.info("Document set analysis complete: %d sections", 
                       len(state.analysis_report) - 1)
            if progress_callback:
                await progress_callback("complete", "文档集分析完成")
        
        return state.analysis_report or {}
        
    except Exception:
        logger.exception("Document set analysis pipeline failed for project %s", project_id)
        raise


def _get_document_set_context(state: BidProjectState) -> str:
    """Generate additional context for document set analysis.
    
    Args:
        state: Project state with document set
        
    Returns:
        Additional context text for system prompt
    """
    if not state.document_set:
        return ""
    
    doc_set = state.document_set
    primary = doc_set.get_primary_item()
    
    context = "\n\n## 文档集上下文\n\n"
    context += f"当前工作于文档集: {doc_set.name}\n"
    context += f"包含 {len(doc_set)} 个文档:\n"
    
    for item in doc_set.get_sorted_items():
        icon = "⭐" if item.role == "primary" else "📄"
        context += f"{icon} [{item.doc_type}] {item.name}\n"
    
    context += "\n"
    context += "主文档是招标要求的主要来源，辅助文档提供参考资料。\n"
    context += "分析时以主文档为主，必要时查阅辅助文档。\n"
    
    return context


async def run_document_set_outline_pipeline(
    project_id: str,
    api_url: str,
    progress_callback: ProgressCallback = None,
) -> list[dict]:
    """Generate outline considering document set structure.
    
    Args:
        project_id: Project ID
        api_url: API URL
        progress_callback: Progress callback
        
    Returns:
        List of section dictionaries
    """
    from ..outline_pipeline import run_outline_pipeline
    
    # For now, use standard outline pipeline
    # The document set context is already in state
    return await run_outline_pipeline(
        project_id=project_id,
        api_url=api_url,
        progress_callback=progress_callback,
    )


async def run_document_set_writing_pipeline(
    project_id: str,
    section_id: str,
    api_url: str,
    progress_callback: ProgressCallback = None,
) -> str:
    """Write a section using document set resources.
    
    This pipeline:
    1. Gets section requirements from primary document
    2. Searches auxiliary documents for reference content
    3. Looks for reusable content in historical bids
    4. Generates optimized content
    
    Args:
        project_id: Project ID
        section_id: Section ID to write
        api_url: API URL
        progress_callback: Progress callback
        
    Returns:
        Generated content
    """
    from ..content_pipeline import run_content_pipeline
    
    # Initialize
    api_client = BidSmartAPIClient(api_url)
    state = BidProjectState()
    await state.load_from_backend(api_client, project_id)
    
    if not state.is_using_document_set():
        # Standard writing
        return await run_content_pipeline(
            project_id=project_id,
            api_url=api_url,
            section_ids=[section_id],
            progress_callback=progress_callback,
        )
    
    # Document set aware writing
    if progress_callback:
        await progress_callback("init", f"开始编写章节，使用文档集资源")
    
    # Get section info
    section = state.get_section(section_id)
    if not section:
        raise ValueError(f"Section {section_id} not found")
    
    # Check for historical bids in document set
    historical_items = state.document_set.get_items_by_type("historical")
    
    if historical_items and progress_callback:
        await progress_callback("reference", 
            f"发现 {len(historical_items)} 个历史标书可供参考")
    
    # For now, use standard pipeline
    # Future enhancement: add historical bid content matching
    return await run_content_pipeline(
        project_id=project_id,
        api_url=api_url,
        section_ids=[section_id],
        progress_callback=progress_callback,
    )


async def run_document_set_full_pipeline(
    project_id: str,
    api_url: str,
    progress_callback: ProgressCallback = None,
) -> dict:
    """Run complete bid generation pipeline with document set support.
    
    Args:
        project_id: Project ID
        api_url: API URL
        progress_callback: Progress callback
        
    Returns:
        Final project summary
    """
    results = {
        "project_id": project_id,
        "analysis": None,
        "outline": None,
        "sections_written": 0,
        "errors": [],
    }
    
    try:
        # Phase 1: Analysis
        if progress_callback:
            await progress_callback("phase", "Phase 1: 文档集分析")
        
        analysis = await run_document_set_analysis_pipeline(
            project_id, api_url, progress_callback
        )
        results["analysis"] = analysis
        
        # Phase 2: Outline
        if progress_callback:
            await progress_callback("phase", "Phase 2: 生成大纲")
        
        sections = await run_document_set_outline_pipeline(
            project_id, api_url, progress_callback
        )
        results["outline"] = sections
        
        # Phase 3: Writing (one section for demo)
        if progress_callback:
            await progress_callback("phase", "Phase 3: 编写内容")
        
        # Write first pending section
        api_client = BidSmartAPIClient(api_url)
        state = BidProjectState()
        await state.load_from_backend(api_client, project_id)
        
        pending = state.get_sections_by_status("pending")
        if pending:
            section = pending[0]
            await run_document_set_writing_pipeline(
                project_id, section["id"], api_url, progress_callback
            )
            results["sections_written"] = 1
        
        if progress_callback:
            await progress_callback("complete", "文档集流程完成")
        
    except Exception as e:
        logger.exception("Full pipeline failed")
        results["errors"].append(str(e))
    
    return results
