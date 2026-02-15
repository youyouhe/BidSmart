#!/usr/bin/env python3
"""
OCR Pages - Optional OCR client for scanned PDF pages
Adapted from docmind-ai/api/ocr_client.py

Calls DeepSeek-OCR-2 service via HTTP with content-based caching.
Requires OCR_SERVICE_URL environment variable.

Usage:
    python ocr_pages.py <pdf_path> --pages 1-10 [--output ocr.json] [--cache-dir .ocr_cache]
"""
import os
import sys
import json
import hashlib
import tempfile
import argparse
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF
import requests


class OCRClient:
    """Client for the DeepSeek-OCR-2 microservice."""

    def __init__(self, service_url: Optional[str] = None, cache_dir: Optional[str] = None):
        self.service_url = (
            service_url or os.getenv("OCR_SERVICE_URL", "")
        ).rstrip("/")
        self.enabled = bool(self.service_url)

        if cache_dir:
            self.cache_dir = Path(cache_dir)
        else:
            self.cache_dir = Path(".ocr_cache")

        if self.enabled:
            self.cache_dir.mkdir(parents=True, exist_ok=True)

    def is_available(self) -> bool:
        """Check if OCR service is configured and healthy."""
        if not self.enabled:
            return False
        try:
            resp = requests.get(f"{self.service_url}/health", timeout=5)
            return resp.status_code == 200 and resp.json().get("status") == "healthy"
        except Exception:
            return False

    def ocr_page(self, pdf_path: str, page_number: int) -> dict:
        """
        OCR a single page. Returns dict with text, tokens, has_table.
        Uses cache if available.
        """
        # Check cache
        cached = self._get_cached_page(pdf_path, page_number)
        if cached is not None:
            tokens = self._estimate_tokens(cached)
            has_table = bool(cached and "|" in cached and "---" in cached)
            return {"page": page_number, "text": cached, "tokens": tokens, "has_table": has_table}

        # Render page to image at 300 DPI
        doc = fitz.open(pdf_path)
        page = doc.load_page(page_number - 1)
        pix = page.get_pixmap(dpi=300)
        img_path = tempfile.mktemp(suffix=".png")
        pix.save(img_path)
        doc.close()

        try:
            with open(img_path, "rb") as f:
                resp = requests.post(
                    f"{self.service_url}/ocr/page",
                    files={"image": ("page.png", f, "image/png")},
                    data={"page_number": page_number},
                    timeout=120,
                )

            if resp.status_code != 200:
                print(f"[OCR] Service returned {resp.status_code}: {resp.text}", file=sys.stderr)
                return {"page": page_number, "text": "", "tokens": 0, "has_table": False}

            result = resp.json()
            if not result.get("success", False):
                print(f"[OCR] Failed for page {page_number}: {result.get('error')}", file=sys.stderr)
                return {"page": page_number, "text": "", "tokens": 0, "has_table": False}

            md_text = result.get("markdown_text", "")
            self._cache_page(pdf_path, page_number, md_text)

            tokens = self._estimate_tokens(md_text)
            has_table = bool(md_text and "|" in md_text and "---" in md_text)
            return {"page": page_number, "text": md_text, "tokens": tokens, "has_table": has_table}

        except requests.exceptions.Timeout:
            print(f"[OCR] Timeout for page {page_number}", file=sys.stderr)
            return {"page": page_number, "text": "", "tokens": 0, "has_table": False}
        except Exception as e:
            print(f"[OCR] Error for page {page_number}: {e}", file=sys.stderr)
            return {"page": page_number, "text": "", "tokens": 0, "has_table": False}
        finally:
            if os.path.exists(img_path):
                os.unlink(img_path)

    # ------------------------------------------------------------------
    # Cache management (from ocr_client.py)
    # ------------------------------------------------------------------

    def _get_cache_key(self, pdf_path: str) -> str:
        """Generate cache key from PDF content hash (size + first 8KB SHA256)."""
        stat = os.stat(pdf_path)
        with open(pdf_path, "rb") as f:
            head = f.read(8192)
        content_hash = hashlib.sha256(head).hexdigest()
        raw = f"{stat.st_size}_{content_hash}"
        return hashlib.md5(raw.encode()).hexdigest()

    def _get_cache_path(self, pdf_path: str) -> Path:
        """Get cache directory for a specific PDF."""
        key = self._get_cache_key(pdf_path)
        return self.cache_dir / key

    def _get_cached_page(self, pdf_path: str, page_number: int) -> Optional[str]:
        """Get cached OCR result for a page."""
        cache_file = self._get_cache_path(pdf_path) / f"page_{page_number}.md"
        if cache_file.exists():
            return cache_file.read_text(encoding="utf-8")
        return None

    def _cache_page(self, pdf_path: str, page_number: int, text: str):
        """Cache OCR result for a page."""
        cache_path = self._get_cache_path(pdf_path)
        cache_path.mkdir(parents=True, exist_ok=True)
        cache_file = cache_path / f"page_{page_number}.md"
        cache_file.write_text(text, encoding="utf-8")

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count (Chinese-aware)."""
        chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        other_chars = len(text) - chinese_chars
        return (chinese_chars // 2) + (other_chars // 4)


def parse_page_range(spec: str, total: int) -> list:
    """Parse page range spec like '1-10' or '1,3,5-8' into list of page numbers."""
    pages = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            start, end = part.split("-", 1)
            start = max(1, int(start))
            end = min(total, int(end))
            pages.extend(range(start, end + 1))
        else:
            p = int(part)
            if 1 <= p <= total:
                pages.append(p)
    return sorted(set(pages))


def main():
    parser = argparse.ArgumentParser(description="OCR scanned PDF pages via DeepSeek-OCR-2")
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument("--pages", required=True, help="Page range, e.g. '1-10' or '1,3,5-8'")
    parser.add_argument("--output", "-o", help="Output JSON file path (default: stdout)")
    parser.add_argument("--cache-dir", default=".ocr_cache", help="Cache directory")
    args = parser.parse_args()

    service_url = os.getenv("OCR_SERVICE_URL", "")
    if not service_url:
        print("OCR_SERVICE_URL not set. OCR is unavailable.", file=sys.stderr)
        # Output empty result and exit cleanly
        result = {
            "source": os.path.basename(args.pdf_path),
            "ocr_service": None,
            "error": "OCR_SERVICE_URL not configured",
            "pages": [],
        }
        output_json = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output_json)
        else:
            print(output_json)
        sys.exit(0)

    # Get total pages
    doc = fitz.open(args.pdf_path)
    total_pages = len(doc)
    doc.close()

    page_list = parse_page_range(args.pages, total_pages)

    client = OCRClient(service_url=service_url, cache_dir=args.cache_dir)

    if not client.is_available():
        print(f"[OCR] Service at {service_url} is not healthy", file=sys.stderr)
        result = {
            "source": os.path.basename(args.pdf_path),
            "ocr_service": service_url,
            "error": "OCR service not healthy",
            "pages": [],
        }
        output_json = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output_json)
        else:
            print(output_json)
        sys.exit(1)

    pages = []
    for page_num in page_list:
        print(f"[OCR] Processing page {page_num}/{page_list[-1]}...", file=sys.stderr)
        page_result = client.ocr_page(args.pdf_path, page_num)
        pages.append(page_result)

    result = {
        "source": os.path.basename(args.pdf_path),
        "ocr_service": service_url,
        "pages": pages,
    }

    output_json = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
        print(f"Output written to {args.output}", file=sys.stderr)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
