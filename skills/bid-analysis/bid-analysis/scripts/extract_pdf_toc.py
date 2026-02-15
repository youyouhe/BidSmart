#!/usr/bin/env python3
"""
PDF TOC Extractor - Extract and validate document table of contents
Adapted from docmind-ai/pageindex_v2/main.py and phases/page_mapper.py

Features:
- Extract embedded PDF TOC (fitz.get_toc()) with quality filtering
- Smart chapter detection, deduplication, appendix demotion
- Heuristic TOC page detection (pattern matching, no LLM required)
- Fuzzy title-to-page validation with page offset detection

Usage:
    python extract_pdf_toc.py <pdf_path> [--pages-json pages.json] [--output toc.json]
"""
import os
import re
import sys
import json
import argparse
from typing import List, Dict, Optional
from collections import Counter

import fitz  # PyMuPDF


class TOCExtractor:
    """Extract and validate PDF table of contents."""

    def __init__(self, debug: bool = False):
        self.debug = debug

    def extract(self, pdf_path: str, pages_data: Optional[dict] = None) -> dict:
        """
        Extract TOC from PDF.

        Args:
            pdf_path: Path to PDF file
            pages_data: Pre-parsed pages JSON (from parse_pdf.py), optional

        Returns:
            dict with TOC structure, validation results, page sections
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        raw_toc = doc.get_toc()
        doc.close()

        # Load page texts
        page_texts = []
        if pages_data and "pages" in pages_data:
            page_texts = [p["text"] for p in pages_data["pages"]]
        else:
            # Fall back to PyMuPDF extraction
            doc = fitz.open(pdf_path)
            for i in range(total_pages):
                page = doc.load_page(i)
                page_texts.append(page.get_text("text"))
            doc.close()

        # 1. Convert embedded TOC
        has_embedded_toc = bool(raw_toc) and len(raw_toc) >= 3
        embedded_toc = []
        if has_embedded_toc:
            embedded_toc = self._convert_embedded_toc(raw_toc)

        # 2. Detect TOC pages (heuristic)
        toc_pages = self._detect_toc_pages(page_texts)
        toc_page_text = ""
        if toc_pages:
            toc_page_text = "\n\n".join(
                page_texts[p - 1] for p in toc_pages if p - 1 < len(page_texts)
            )

        # 3. Validate and build page sections
        page_offset = 0
        page_sections = []
        validation_summary = {"total": 0, "passed": 0, "failed": 0, "rate": 0.0}

        if embedded_toc:
            # Validate page mapping
            mapped, validated, not_found = self._validate_page_mapping(
                embedded_toc, page_texts, offset=0
            )
            validation_rate = validated / len(embedded_toc) if embedded_toc else 0

            if self.debug:
                print(f"[TOC] Direct mapping: {validated}/{len(embedded_toc)} "
                      f"({validation_rate:.1%})", file=sys.stderr)

            # Try offset detection if validation rate is low
            if validation_rate < 0.5 and len(embedded_toc) > 0:
                detected_offset = self._detect_page_offset(embedded_toc, page_texts)
                if detected_offset != 0:
                    new_mapped, new_validated, new_not_found = self._validate_page_mapping(
                        embedded_toc, page_texts, offset=detected_offset
                    )
                    if new_validated > validated:
                        mapped = new_mapped
                        validated = new_validated
                        not_found = new_not_found
                        page_offset = detected_offset
                        if self.debug:
                            print(f"[TOC] Offset {detected_offset:+d} improved to "
                                  f"{new_validated}/{len(embedded_toc)}", file=sys.stderr)

            # Build page sections with start/end pages
            page_sections = self._build_page_sections(mapped, total_pages, page_offset)

            validation_summary = {
                "total": len(embedded_toc),
                "passed": validated,
                "failed": not_found,
                "rate": round(validated / len(embedded_toc), 3) if embedded_toc else 0.0,
            }

        return {
            "source": os.path.basename(pdf_path),
            "total_pages": total_pages,
            "has_embedded_toc": has_embedded_toc,
            "embedded_toc_count": len(embedded_toc),
            "embedded_toc": embedded_toc,
            "toc_pages": toc_pages,
            "toc_page_text": toc_page_text,
            "page_offset": page_offset,
            "page_sections": page_sections,
            "validation_summary": validation_summary,
        }

    # ------------------------------------------------------------------
    # Embedded TOC conversion (from main.py:1047-1165)
    # ------------------------------------------------------------------

    def _convert_embedded_toc(self, raw_toc: list) -> list:
        """
        Convert PyMuPDF get_toc() to structured format with quality filtering.
        Includes chapter detection, dedup, appendix demotion.
        """
        structure = []
        level_counters = {}
        filtered_count = 0
        chapter_counter = 0
        seen_chapter_titles = set()
        dedup_count = 0
        skip_until_next_chapter = False
        duplicate_level = 0

        for level, title, page in raw_toc:
            title = title.strip()

            if not self._is_valid_toc_title(title):
                if self.debug:
                    preview = title[:50] + "..." if len(title) > 50 else title
                    print(f"  [FILTER] Skipping: '{preview}'", file=sys.stderr)
                filtered_count += 1
                continue

            is_chapter = self._is_chapter_title(title)

            # Dedup chapters
            if is_chapter:
                normalized = title.strip()
                if normalized in seen_chapter_titles:
                    if self.debug:
                        print(f"  [DEDUP] Skipping duplicate: '{normalized}'", file=sys.stderr)
                    dedup_count += 1
                    skip_until_next_chapter = True
                    duplicate_level = level
                    continue
                seen_chapter_titles.add(normalized)
                skip_until_next_chapter = False
            elif skip_until_next_chapter:
                if level > duplicate_level:
                    continue
                else:
                    skip_until_next_chapter = False

            # Normalize levels
            if is_chapter:
                level = 1
                chapter_counter += 1
            elif level == 1 and chapter_counter > 0 and self._is_appendix_title(title):
                level = 2

            # Update counters
            if level not in level_counters:
                level_counters[level] = 0
            level_counters[level] += 1

            for k in [k for k in level_counters if k > level]:
                del level_counters[k]

            structure_code_parts = []
            for lv in sorted(k for k in level_counters if k <= level):
                structure_code_parts.append(str(level_counters[lv]))
            structure_code = ".".join(structure_code_parts)

            structure.append({
                "level": level,
                "title": title,
                "page": page,
                "structure": structure_code,
            })

        if self.debug:
            if filtered_count:
                print(f"  [FILTER] Filtered {filtered_count} invalid entries", file=sys.stderr)
            if dedup_count:
                print(f"  [DEDUP] Removed {dedup_count} duplicates", file=sys.stderr)
            if chapter_counter:
                print(f"  [CHAPTER] Detected {chapter_counter} chapters", file=sys.stderr)

        return structure

    # ------------------------------------------------------------------
    # Title classification (from main.py:1167-1322)
    # ------------------------------------------------------------------

    def _is_chapter_title(self, title: str) -> bool:
        """Detect if title represents a chapter/main section."""
        if re.match(r'^第[一二三四五六七八九十0-9]+章', title):
            return True
        if re.match(r'^(?:chapter|CHAPTER)\s*[0-9IVX]+', title, re.IGNORECASE):
            return True
        if re.match(r'^[0-9]{1,2}\s*/\s*.+', title):
            return True
        if re.match(r'^[0-9]{1,2}\s+[\u4e00-\u9fa5]{2,}', title):
            return True
        if re.match(r'^第[一二三四五六七八九十百0-9]+[部节]', title):
            return True
        return False

    def _is_appendix_title(self, title: str) -> bool:
        """Detect if title represents an appendix entry."""
        if re.match(r'^附件\s*[0-9０-９一二三四五六七八九十]', title):
            return True
        appendix_keywords = [
            '投标函', '开标一览表', '报价明细表', '偏离表',
            '声明书', '承诺书', '授权委托书', '证明书',
            '自评表', '基本情况表', '业绩一览表', '情况表',
            '清单', '一览表', '证书一览表',
        ]
        for kw in appendix_keywords:
            if kw in title:
                return True
        return False

    def _is_valid_toc_title(self, title: str) -> bool:
        """Validate if a TOC title looks reasonable."""
        title = title.strip()

        if len(title) <= 1:
            return False
        if len(title) > 80:
            return False

        content_indicators = ['\u3002', '\uff0c', '\uff01', '\uff1f']  # 。，！？
        if any(p in title for p in content_indicators):
            legitimate_prefixes = ['第', '\uff08', '(', '附件', '表', '图']
            if not any(title.startswith(prefix) for prefix in legitimate_prefixes):
                return False

        single_char_words = ['报', '价', '文', '件', '供', '应', '商', '称', '章']
        if title in single_char_words:
            return False

        if all(not c.isalnum() for c in title):
            return False

        if title.endswith('\uff1a') or title.endswith(':'):
            form_keywords = ['地址', '时间', '日期', '名称', '公章', '签字', '盖章', '电话', '传真', '邮编']
            has_form_keyword = any(kw in title for kw in form_keywords)
            has_multiple_spaces = '  ' in title
            if has_form_keyword or has_multiple_spaces:
                return False

        if len(title) > 2 and title[0].isalpha() and title[1] == '.':
            if not any(title[2:].strip().startswith(prefix) for prefix in ['附', '补', '表', '图']):
                return False

        words = title.split()
        if len(words) >= 2 and all(len(w) <= 4 for w in words):
            table_header_keywords = [
                '序号', '项目', '内容', '名称', '规格', '数量', '单价', '合价',
                '金额', '备注', '编号', '类别', '单位', '要求', '说明',
            ]
            if any(w in table_header_keywords for w in words):
                return False

        return True

    # ------------------------------------------------------------------
    # Heuristic TOC page detection (new, replaces LLM-based toc_detector)
    # ------------------------------------------------------------------

    def _detect_toc_pages(self, page_texts: list) -> list:
        """
        Detect TOC pages using text pattern heuristics.
        Only checks the first 20 pages.
        """
        toc_pages = []
        check_limit = min(20, len(page_texts))

        for i in range(check_limit):
            page_text = page_texts[i]
            if not page_text or not page_text.strip():
                continue

            score = 0
            lines = page_text.strip().split('\n')

            # Signal 1: Page top contains "目录" keyword -> +3
            first_lines_text = "\n".join(lines[:5])
            if re.search(r'目\s*录', first_lines_text):
                score += 3

            # Signal 2: Dot leaders (title.....42) count >= 3 -> +count
            dot_leader_count = 0
            for line in lines:
                if re.search(r'\.{3,}\s*\d+', line) or re.search(r'\u2026{1,}\s*\d+', line):
                    dot_leader_count += 1
            if dot_leader_count >= 3:
                score += dot_leader_count

            # Signal 3: Chinese chapter references (第X章/节/部) >= 3 -> +count
            chapter_ref_count = 0
            for line in lines:
                if re.search(r'第[一二三四五六七八九十0-9]+[章节部]', line):
                    chapter_ref_count += 1
            if chapter_ref_count >= 3:
                score += chapter_ref_count

            # Signal 4: Numbered entries (1.1, 1.2, 2.1) >= 5 -> +2
            numbered_count = 0
            for line in lines:
                if re.match(r'^\s*\d+\.\d+', line.strip()):
                    numbered_count += 1
            if numbered_count >= 5:
                score += 2

            if score >= 5:
                toc_pages.append(i + 1)  # 1-indexed
                if self.debug:
                    print(f"  [TOC-DETECT] Page {i + 1}: score={score} "
                          f"(dots={dot_leader_count}, chapters={chapter_ref_count}, "
                          f"numbered={numbered_count})", file=sys.stderr)

        return toc_pages

    # ------------------------------------------------------------------
    # Page validation (from page_mapper.py:162-271)
    # ------------------------------------------------------------------

    def _title_in_page(self, title: str, page_text: str) -> bool:
        """
        Check if title appears in page text with fuzzy matching.
        Handles OCR artifacts like extra spaces.
        """
        if not title or not page_text:
            return False

        if title in page_text:
            return True

        normalized_title = re.sub(r'\s+', '', title)
        normalized_page = re.sub(r'\s+', '', page_text)

        if normalized_title in normalized_page:
            return True

        page_start = page_text[:2000]
        normalized_start = re.sub(r'\s+', '', page_start)
        if normalized_title in normalized_start:
            return True

        return False

    def _validate_page_mapping(
        self, structure: list, page_texts: list, offset: int = 0
    ) -> tuple:
        """
        Validate TOC page numbers against physical pages.

        Returns:
            (mapped_items, validated_count, not_found_count)
        """
        mapped = []
        validated = 0
        not_found = 0

        for item in structure:
            title = item.get("title", "").strip()
            toc_page = item.get("page")

            if not toc_page:
                mapped.append({**item, "validation": "no_page"})
                not_found += 1
                continue

            physical_page = toc_page + offset

            if physical_page < 1 or physical_page > len(page_texts):
                mapped.append({**item, "physical_page": physical_page, "validation": "out_of_range"})
                not_found += 1
                continue

            page_text = page_texts[physical_page - 1]
            if self._title_in_page(title, page_text):
                validated += 1
                mapped.append({**item, "physical_page": physical_page, "validation": "passed"})
            else:
                not_found += 1
                mapped.append({**item, "physical_page": physical_page, "validation": "failed"})

        return mapped, validated, not_found

    # ------------------------------------------------------------------
    # Offset detection (from page_mapper.py:273-345)
    # ------------------------------------------------------------------

    def _detect_page_offset(self, structure: list, page_texts: list) -> int:
        """
        Detect page offset by searching for TOC titles across all pages.
        Returns consensus offset.
        """
        sample_items = structure[:min(5, len(structure))]
        sample_titles = []
        for item in sample_items:
            title = item.get("title", "").strip()
            if title:
                sample_titles.append(re.sub(r'\s+', '', title))

        if not sample_titles:
            return 0

        # Step 1: Identify TOC listing pages
        toc_listing_pages = set()
        for page_idx, page_text in enumerate(page_texts):
            normalized_text = re.sub(r'\s+', '', page_text[:5000])
            match_count = sum(1 for t in sample_titles if t in normalized_text)
            if match_count >= 3:
                toc_listing_pages.add(page_idx)

        # Step 2: Search for each title, skipping TOC listing pages
        offsets = []
        for item in sample_items:
            title = item.get("title", "").strip()
            toc_page = item.get("page")
            if not title or not toc_page:
                continue

            normalized_title = re.sub(r'\s+', '', title)

            for page_idx, page_text in enumerate(page_texts):
                if page_idx in toc_listing_pages:
                    continue
                physical_page = page_idx + 1
                normalized_text = re.sub(r'\s+', '', page_text[:3000])
                if normalized_title in normalized_text:
                    offset = physical_page - toc_page
                    offsets.append(offset)
                    break

        if not offsets:
            return 0

        counter = Counter(offsets)
        best_offset, count = counter.most_common(1)[0]

        if self.debug:
            print(f"  [OFFSET] Consensus: {best_offset:+d} "
                  f"({count}/{len(offsets)} matches)", file=sys.stderr)

        return best_offset

    # ------------------------------------------------------------------
    # Build page sections with start/end pages
    # ------------------------------------------------------------------

    def _build_page_sections(
        self, mapped: list, total_pages: int, page_offset: int
    ) -> list:
        """
        Build page sections with start_page and end_page from validated mapping.
        Each section's end_page is the next section's start_page - 1.
        """
        sections = []
        for item in mapped:
            toc_page = item.get("page")
            physical_page = (toc_page + page_offset) if toc_page else None

            sections.append({
                "title": item.get("title", ""),
                "start_page": physical_page,
                "end_page": None,  # filled below
                "level": item.get("level", 1),
                "structure": item.get("structure", ""),
                "validation": item.get("validation", "unknown"),
            })

        # Calculate end_page: next section's start_page - 1
        for i in range(len(sections)):
            if sections[i]["start_page"] is None:
                continue
            # Find next section with a valid start_page
            next_start = None
            for j in range(i + 1, len(sections)):
                if sections[j]["start_page"] is not None:
                    next_start = sections[j]["start_page"]
                    break
            if next_start is not None:
                sections[i]["end_page"] = next_start - 1
            else:
                sections[i]["end_page"] = total_pages

        return sections


def main():
    parser = argparse.ArgumentParser(description="Extract PDF table of contents")
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument("--pages-json", help="Pre-parsed pages JSON from parse_pdf.py")
    parser.add_argument("--output", "-o", help="Output JSON file path (default: stdout)")
    parser.add_argument("--debug", action="store_true", help="Enable debug output to stderr")
    args = parser.parse_args()

    pages_data = None
    if args.pages_json:
        with open(args.pages_json, "r", encoding="utf-8") as f:
            pages_data = json.load(f)

    extractor = TOCExtractor(debug=args.debug)
    result = extractor.extract(args.pdf_path, pages_data=pages_data)

    output_json = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
        print(f"Output written to {args.output}", file=sys.stderr)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
