"""CLI entry point for the BidSmart multi-agent bid writing system.

Uses agno framework for agent execution.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from .config import BIDSMART_API_URL, MAX_BUDGET_USD
from .orchestrator.orchestrator import create_bid_session, run_outline_generation, run_analysis

logger = logging.getLogger(__name__)


async def run_generate(args: argparse.Namespace) -> None:
    """Run the full bid generation workflow."""
    print(f"[BidSmart] 启动标书生成会话")
    print(f"  项目ID: {args.project_id}")
    print(f"  API: {args.api_url}")
    print("-" * 60)

    # Step 1: Analysis
    print("\n[1/4] 分析招标文件...")
    async def on_analysis_progress(phase: str, msg: str):
        print(f"  [{phase}] {msg}")
    
    analysis_report = await run_analysis(
        project_id=args.project_id,
        api_url=args.api_url,
        progress_callback=on_analysis_progress,
    )
    print(f"  ✓ 分析完成: {len(analysis_report) - 1} 个章节")

    # Step 2: Outline Generation
    print("\n[2/4] 生成投标文件大纲...")
    async def on_outline_progress(phase: str, msg: str):
        print(f"  [{phase}] {msg}")
    
    sections = await run_outline_generation(
        project_id=args.project_id,
        api_url=args.api_url,
        progress_callback=on_outline_progress,
    )
    print(f"  ✓ 大纲生成完成: {len(sections)} 个章节")
    for sec in sections:
        print(f"    - {sec.get('title', 'Untitled')}")

    # Step 3 & 4: Content generation would go here
    print("\n[3/4] 编写标书内容...")
    print("  (使用 content_pipeline 逐个章节编写)")
    
    print("\n[4/4] 审核与导出...")
    print("  (使用 review_pipeline 审核)")

    print("\n" + "=" * 60)
    print("[完成] 标书生成流程执行完毕")


async def run_analyze(args: argparse.Namespace) -> None:
    """Run only the analysis phase."""
    print(f"[BidSmart] 分析招标文件")
    print(f"  项目ID: {args.project_id}")
    print("-" * 60)

    async def on_progress(phase: str, msg: str):
        print(f"  [{phase}] {msg}")

    report = await run_analysis(
        project_id=args.project_id,
        api_url=args.api_url,
        progress_callback=on_progress,
    )

    print("\n" + "=" * 60)
    print("[分析完成]")
    
    # Print report summary
    overview = report.get("项目概况", {})
    if overview:
        print(f"\n项目: {overview.get('项目名称', 'N/A')}")
        print(f"预算: {overview.get('预算金额', 'N/A')}")
    
    scoring = report.get("评分标准", {})
    if scoring:
        categories = scoring.get("categories", [])
        print(f"评分类别: {len(categories)} 个")
        for cat in categories:
            print(f"  - {cat.get('name', 'N/A')}: {cat.get('score', 0)} 分")


async def run_outline(args: argparse.Namespace) -> None:
    """Run only the outline generation phase."""
    print(f"[BidSmart] 生成投标文件大纲")
    print(f"  项目ID: {args.project_id}")
    print("-" * 60)

    async def on_progress(phase: str, msg: str):
        print(f"  [{phase}] {msg}")

    sections = await run_outline_generation(
        project_id=args.project_id,
        api_url=args.api_url,
        progress_callback=on_progress,
    )

    print("\n" + "=" * 60)
    print(f"[完成] 生成 {len(sections)} 个章节:")
    for sec in sections:
        print(f"  {sec.get('order', 0)}. {sec.get('title', 'Untitled')}")


def cli_main() -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="bid-agents",
        description="BidSmart 多Agent标书编写系统 (agno版)",
    )
    parser.add_argument(
        "--api-url",
        default=BIDSMART_API_URL,
        help=f"BidSmart后端API地址 (默认: {BIDSMART_API_URL})",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="启用详细日志",
    )

    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # generate command
    gen_parser = subparsers.add_parser("generate", help="生成完整投标文件")
    gen_parser.add_argument("--project-id", required=True, help="项目ID")

    # analyze command
    analyze_parser = subparsers.add_parser("analyze", help="分析招标文件")
    analyze_parser.add_argument("--project-id", required=True, help="项目ID")

    # outline command
    outline_parser = subparsers.add_parser("outline", help="生成大纲")
    outline_parser.add_argument("--project-id", required=True, help="项目ID")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    # Run the appropriate command
    command_map = {
        "generate": run_generate,
        "analyze": run_analyze,
        "outline": run_outline,
    }

    asyncio.run(command_map[args.command](args))


if __name__ == "__main__":
    cli_main()
