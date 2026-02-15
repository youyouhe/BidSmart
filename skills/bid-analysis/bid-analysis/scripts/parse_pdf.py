#!/usr/bin/env python3
"""
PDF Parser - Extract text with table preservation
Adapted from docmind-ai/pageindex_v2/core/pdf_parser.py

Two-tier fallback strategy:
1. pdfplumber (best for tables)
2. PyMuPDF (always available)

Features:
- Table structure preservation as Markdown with [TABLE]...[/TABLE] markers
- Chinese document support
- Automatic quality detection
- Scanned PDF detection

Usage:
    python parse_pdf.py <pdf_path> [--output pages.json] [--max-pages N]
"""
import os
import sys
import json
import argparse
from typing import List, Optional

# Import PDF libraries
try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

import fitz  # PyMuPDF


class PDFParser:
    """
    Parse PDF with two-tier fallback:
    1. pdfplumber (best for tables)
    2. PyMuPDF (always available)
    """

    def __init__(self, debug: bool = False):
        self.debug = debug

    def parse(self, pdf_path: str, max_pages: Optional[int] = None) -> dict:
        """
        Parse PDF and return structured result.

        Returns:
            dict with source, total_pages, parsed_pages, parser_used, is_scanned, pages
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        # Get total page count
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        doc.close()

        limit = max_pages if max_pages else total_pages

        if self.debug:
            libs = []
            if HAS_PDFPLUMBER:
                libs.append("pdfplumber")
            libs.append("pymupdf")
            print(f"[PDF] File: {pdf_path}", file=sys.stderr)
            print(f"[PDF] Available parsers: {' -> '.join(libs)}", file=sys.stderr)
            print(f"[PDF] Total pages: {total_pages}, will parse: {limit}", file=sys.stderr)

        pages = []
        parser_used = None

        # Tier 1: pdfplumber
        if HAS_PDFPLUMBER:
            if self.debug:
                print("[PDF] Trying Tier 1: pdfplumber...", file=sys.stderr)
            pages = self._parse_with_pdfplumber(pdf_path, limit)
            if pages and not self._is_poor_extraction(pages[0]["text"]):
                parser_used = "pdfplumber"
            else:
                if self.debug:
                    print("[PDF] Poor quality with pdfplumber", file=sys.stderr)
                pages = []

        # Tier 2: PyMuPDF fallback
        if not pages:
            if self.debug:
                print("[PDF] Using fallback: PyMuPDF...", file=sys.stderr)
            pages = self._parse_with_pymupdf(pdf_path, limit)
            parser_used = "pymupdf"

        is_scanned = self._is_scanned_pdf(pages)

        if self.debug:
            print(f"[PDF] Extraction complete using: {parser_used}", file=sys.stderr)
            print(f"[PDF] Extracted: {len(pages)} pages", file=sys.stderr)
            total_tokens = sum(p["tokens"] for p in pages)
            tables_found = sum(1 for p in pages if p["has_table"])
            print(f"[PDF] Total tokens: {total_tokens}", file=sys.stderr)
            print(f"[PDF] Pages with tables: {tables_found}", file=sys.stderr)
            print(f"[PDF] Is scanned: {is_scanned}", file=sys.stderr)

        return {
            "source": os.path.basename(pdf_path),
            "total_pages": total_pages,
            "parsed_pages": len(pages),
            "parser_used": parser_used,
            "is_scanned": is_scanned,
            "pages": pages,
        }

    def _parse_with_pdfplumber(self, pdf_path: str, max_pages: int) -> list:
        """Parse using pdfplumber with table detection."""
        pages = []
        with pdfplumber.open(pdf_path) as pdf:
            for i in range(min(max_pages, len(pdf.pages))):
                page_num = i + 1
                page = pdf.pages[i]

                tables = page.extract_tables()
                has_table = len(tables) > 0
                raw_text = page.extract_text() or ""
                formatted_text = self._format_with_tables(raw_text, tables)
                tokens = self._estimate_tokens(formatted_text)

                pages.append({
                    "page": page_num,
                    "text": formatted_text,
                    "tokens": tokens,
                    "has_table": has_table,
                })

                if self.debug:
                    table_markers = formatted_text.count("[TABLE]")
                    print(f"  Page {page_num}: {tokens} tokens, {table_markers} tables", file=sys.stderr)

        return pages

    def _parse_with_pymupdf(self, pdf_path: str, max_pages: int) -> list:
        """Fallback: Parse using PyMuPDF."""
        pages = []
        doc = fitz.open(pdf_path)

        for i in range(min(max_pages, len(doc))):
            page_num = i + 1
            page = doc.load_page(i)
            text = page.get_text("text")
            tokens = self._estimate_tokens(text)

            pages.append({
                "page": page_num,
                "text": text,
                "tokens": tokens,
                "has_table": False,
            })

            if self.debug:
                print(f"  Page {page_num}: {tokens} tokens", file=sys.stderr)

        doc.close()
        return pages

    # ------------------------------------------------------------------
    # Core algorithms (from pdf_parser.py lines 353-582)
    # ------------------------------------------------------------------

    def _format_with_tables(self, text: str, tables: list) -> str:
        """
        Format text with tables in Markdown format.
        REPLACES original table text with clean Markdown tables.
        """
        if not tables:
            return text

        # Build set of all table cell texts for detection
        table_cell_texts = set()
        for table in tables:
            for row in table:
                for cell in row:
                    if cell:
                        cell_text = str(cell).strip()
                        table_cell_texts.add(cell_text)
                        if len(cell_text) > 5:
                            table_cell_texts.add(cell_text[:10])
                            table_cell_texts.add(cell_text[-10:])

        # Convert tables to markdown
        markdown_tables = []
        for table in tables:
            if not table:
                continue

            clean_rows = []
            for row in table:
                clean_row = [
                    str(cell).replace('\n', ' ').strip() if cell else ""
                    for cell in row
                ]
                clean_rows.append(clean_row)

            if not clean_rows:
                continue

            md_lines = []
            md_lines.append("| " + " | ".join(clean_rows[0]) + " |")
            md_lines.append("|" + "|".join([" --- " for _ in clean_rows[0]]) + "|")
            for row in clean_rows[1:]:
                md_lines.append("| " + " | ".join(row) + " |")

            markdown_tables.append("\n".join(md_lines))

        # Smart replacement: detect table regions and replace with markdown
        lines = text.split('\n')
        result_lines = []
        table_idx = 0
        skip_until_idx = -1

        for i, line in enumerate(lines):
            if i <= skip_until_idx:
                continue

            is_table_line = False
            line_stripped = line.strip()

            if line_stripped:
                for cell_text in table_cell_texts:
                    if len(cell_text) > 3 and cell_text in line_stripped:
                        is_table_line = True
                        break

                if not is_table_line and len(line_stripped) < 40:
                    has_slashes = line_stripped.count('/') >= 2
                    has_numbers = any(c.isdigit() for c in line_stripped[:5])
                    if has_slashes and has_numbers:
                        is_table_line = True

            if is_table_line:
                if table_idx < len(markdown_tables):
                    j = i
                    while j < len(lines) and j < i + 15:
                        next_line = lines[j].strip()
                        is_still_table = False
                        for cell_text in table_cell_texts:
                            if len(cell_text) > 3 and cell_text in next_line:
                                is_still_table = True
                                break
                        if not is_still_table and next_line and len(next_line) > 30:
                            break
                        j += 1

                    result_lines.append("\n[TABLE]\n" + markdown_tables[table_idx] + "\n[/TABLE]\n")
                    table_idx += 1
                    skip_until_idx = j - 1
            else:
                result_lines.append(line)

        while table_idx < len(markdown_tables):
            result_lines.append("\n[TABLE]\n" + markdown_tables[table_idx] + "\n[/TABLE]\n")
            table_idx += 1

        return '\n'.join(result_lines)

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count (Chinese-aware)."""
        chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        other_chars = len(text) - chinese_chars
        return (chinese_chars // 2) + (other_chars // 4)

    def _is_scanned_pdf(self, pages: list) -> bool:
        """
        Detect if pages represent a scanned/image-based PDF.
        Returns True if most sampled pages have very little text (<50 chars).
        """
        if not pages:
            return True
        sample = pages[:min(5, len(pages))]
        empty_count = sum(1 for p in sample if len(p["text"].strip()) < 50)
        return empty_count >= max(1, int(len(sample) * 0.8))

    def _is_poor_extraction(self, text: str) -> bool:
        """
        Detect if text extraction quality is poor.
        Returns True if extraction appears broken (e.g., character separation).
        """
        if not text or len(text) < 100:
            return False

        words = text.split()
        if len(words) < 20:
            return False

        single_char_words = sum(1 for w in words if len(w) == 1)
        single_char_ratio = single_char_words / len(words)
        avg_word_length = sum(len(w) for w in words) / len(words)

        is_poor = single_char_ratio > 0.80 or avg_word_length < 1.5

        if self.debug and is_poor:
            print(f"[PDF] Quality check: {single_char_ratio:.1%} single-char words, "
                  f"avg word length: {avg_word_length:.2f}", file=sys.stderr)

        return is_poor


def main():
    parser = argparse.ArgumentParser(description="Parse PDF with table preservation")
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument("--output", "-o", help="Output JSON file path (default: stdout)")
    parser.add_argument("--max-pages", "-n", type=int, help="Maximum pages to parse")
    parser.add_argument("--debug", action="store_true", help="Enable debug output to stderr")
    args = parser.parse_args()

    pdf_parser = PDFParser(debug=args.debug)
    result = pdf_parser.parse(args.pdf_path, max_pages=args.max_pages)

    output_json = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
        print(f"Output written to {args.output}", file=sys.stderr)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
