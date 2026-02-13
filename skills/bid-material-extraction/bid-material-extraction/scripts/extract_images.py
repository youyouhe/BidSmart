"""
Extract embedded images from PDF grouped by section headers.

Uses Y-coordinate positioning to correctly assign images to sections,
even when multiple sections share the same page.

Usage:
    python extract_images.py <pdf_path> [--output-dir pages] [--index index.json]

Adapt the scope detection, section regex, and category keywords to
match the specific PDF's structure before running.
"""
import argparse
import json
import os
import re

import fitz

MIN_WIDTH = 300
MIN_HEIGHT = 200


def parse_sections_with_positions(doc):
    """
    Parse section headers with their Y positions on each page.
    Returns list of (page_idx, y_pos, section_num, title, scope).
    """
    sections = []
    scope = "commercial"

    for i in range(len(doc)):
        page = doc[i]
        text_dict = page.get_text("dict")
        full_text = page.get_text()

        # Detect scope transition (skip TOC pages 1-3 which also mention "三、技术部分")
        if i > 10 and "三、" in full_text and "技术部分" in full_text:
            scope = "technical"

        # Walk through text blocks to find section headers with Y positions
        for block in text_dict["blocks"]:
            if block["type"] != 0:  # text block
                continue
            for line in block["lines"]:
                line_text = "".join(span["text"] for span in line["spans"]).strip()
                if not line_text or "页共" in line_text:
                    continue

                m = re.match(r'^(\d+(?:\.\d+)*)\.\s*(.*)', line_text)
                if not m:
                    continue

                num_str = m.group(1)
                title = m.group(2).strip()
                parts = num_str.split('.')
                top = int(parts[0])

                if top >= 100:
                    continue
                if scope == "technical" and top > 5 and len(parts) == 1:
                    continue

                y_pos = line["bbox"][1]  # top Y of the text line

                # If title is empty/punctuation, search subsequent blocks
                if not title or title in ('.', '。', ':', '：'):
                    title = _find_next_title(text_dict, block, line, y_pos)

                if not title or title in ('.', '。'):
                    title = f"(section {num_str})"

                sections.append((i, y_pos, num_str, title, scope))

    return sections


def _find_next_title(text_dict, current_block, current_line, current_y):
    """Find the next meaningful text line after the current position."""
    found_current = False
    for block in text_dict["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            if not found_current:
                if line is current_line:
                    found_current = True
                continue
            # Found a subsequent line
            line_text = "".join(span["text"] for span in line["spans"]).strip()
            if line_text and not re.match(r'^[\d\.\s]+$', line_text) and "页共" not in line_text:
                return line_text
    return ""


def extract_images(pdf_path, output_dir, index_path):
    os.makedirs(output_dir, exist_ok=True)

    # Clean old files
    for f in os.listdir(output_dir):
        os.remove(os.path.join(output_dir, f))

    doc = fitz.open(pdf_path)
    total = len(doc)
    print(f"Scanning {total} pages...")

    sections = parse_sections_with_positions(doc)
    print(f"Found {len(sections)} section headers with positions")

    # Build per-page section list sorted by Y position
    page_sections = {}  # page_idx -> [(y_pos, num_str, title, scope)]
    for page_idx, y_pos, num_str, title, scope in sections:
        if page_idx not in page_sections:
            page_sections[page_idx] = []
        page_sections[page_idx].append((y_pos, num_str, title, scope))
    for k in page_sections:
        page_sections[k].sort(key=lambda x: x[0])

    # For images on pages with no section header, find the last section from previous pages
    last_section_by_page = {}  # page_idx -> (num_str, title, scope)
    current_section = None
    for i in range(total):
        if i in page_sections:
            # Use the last section on this page as the "current" going forward
            _, num_str, title, scope = page_sections[i][-1]
            current_section = (num_str, title, scope)
        last_section_by_page[i] = current_section

    # Also track the first section on each page for carry-forward
    # We need: for a page without headers, what section are we in?
    # That's the last section header seen on any previous page.
    carry_section = {}
    prev = None
    for i in range(total):
        if i in page_sections:
            # The carry section for pages AFTER this one is the last section on this page
            _, num_str, title, scope = page_sections[i][-1]

            # For top-level commercial sections 1-9, don't carry forward beyond 5 pages
            parts = num_str.split('.')
            if scope == "commercial" and len(parts) == 1 and int(parts[0]) <= 9:
                carry_section[i] = (num_str, title, scope, i + 5)  # max carry page
            else:
                carry_section[i] = (num_str, title, scope, None)  # no limit
            prev = i
        # else: no new section on this page

    # Now extract images with position-aware section assignment
    section_images = {}  # (num_str, title, scope) -> [(page_idx, xref, img_data)]
    extracted_xrefs = set()

    for i in range(total):
        page = doc[i]
        images = page.get_images(full=True)
        if not images:
            continue

        # Get section headers on this page (if any)
        headers_on_page = page_sections.get(i, [])

        for img_tuple in images:
            xref = img_tuple[0]
            if xref in extracted_xrefs:
                continue

            try:
                base_img = doc.extract_image(xref)
            except Exception:
                continue

            w, h = base_img["width"], base_img["height"]
            if w < MIN_WIDTH or h < MIN_HEIGHT:
                continue

            # Get image Y position on page
            rects = page.get_image_rects(xref)
            if rects:
                img_y = min(r.y0 for r in rects)
            else:
                img_y = 0

            # Determine which section this image belongs to
            assigned = None
            if headers_on_page:
                # Find the last header whose Y position is above (or near) the image
                for y_pos, num_str, title, scope in reversed(headers_on_page):
                    if y_pos <= img_y + 20:  # header is above image (with small tolerance)
                        assigned = (num_str, title, scope)
                        break
                if not assigned:
                    # Image is above all headers on this page - use carry from previous page
                    assigned = _get_carry_section(i, carry_section, page_sections)
            else:
                # No headers on this page - use carry from previous page
                assigned = _get_carry_section(i, carry_section, page_sections)

            if not assigned:
                continue

            extracted_xrefs.add(xref)
            key = assigned
            if key not in section_images:
                section_images[key] = []
            section_images[key].append((i, xref, base_img))

    # Save images and build index
    print(f"\nExtracting images for {len(section_images)} sections...")
    documents = []

    def sort_key(k):
        # Sort by scope (commercial first), then by section number
        scope_ord = 0 if k[2] == "commercial" else 1
        try:
            nums = [int(n) for n in k[0].split('.')]
        except ValueError:
            nums = [999]
        return (scope_ord, nums)

    for key in sorted(section_images.keys(), key=sort_key):
        num_str, title, scope = key
        img_list = section_images[key]
        safe_sec = num_str.replace('.', '_')
        safe_title = _safe_filename(title)
        section_id = f"sec_{safe_sec}_{safe_title}"

        if scope == "technical":
            section_id = f"tech_{safe_sec}_{safe_title}"

        filenames = []
        for idx, (page_idx, xref, base_img) in enumerate(img_list):
            ext = base_img["ext"]
            prefix = f"tech_{safe_sec}" if scope == "technical" else safe_sec
            if len(img_list) == 1:
                fname = f"{prefix}_{safe_title}.{ext}"
            else:
                fname = f"{prefix}_{safe_title}_{idx + 1:02d}.{ext}"
            out_path = os.path.join(output_dir, fname)
            with open(out_path, "wb") as f:
                f.write(base_img["image"])
            filenames.append(fname)

        category = _guess_category(num_str, title, scope)

        # Find parent section name for team members (12.x.y -> parent is 12.x)
        parent_name = _find_parent_name(num_str, sections)

        doc_entry = {
            "id": section_id,
            "section": num_str,
            "type": title,
            "category": category,
            "label": f"{num_str} {title}",
            "files": filenames,
            "page_range": [img_list[0][0] + 1, img_list[-1][0] + 1],
            "searchable_tags": _build_tags(num_str, title, parent_name),
        }
        documents.append(doc_entry)
        page_info = f"p{img_list[0][0]+1}"
        if img_list[-1][0] != img_list[0][0]:
            page_info += f"-{img_list[-1][0]+1}"
        scope_tag = " [技术]" if scope == "technical" else ""
        parent_tag = f" [{parent_name}]" if parent_name else ""
        print(f"  {num_str} {title}: {len(filenames)} image(s) ({page_info}){parent_tag}{scope_tag}")

    doc.close()

    index = {"documents": documents}
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    total_imgs = sum(len(d["files"]) for d in documents)
    print(f"\nDone: {total_imgs} images in {len(documents)} sections")
    print(f"Images: {output_dir}")
    print(f"Index:  {index_path}")


def _get_carry_section(page_idx, carry_section, page_sections):
    """Find the active section for a page that has no header (or image is above all headers)."""
    # Walk backwards to find the most recent page with a section header
    for p in range(page_idx - 1, -1, -1):
        if p in carry_section:
            num_str, title, scope, max_page = carry_section[p]
            if max_page is not None and page_idx >= max_page:
                return None  # carry limit exceeded, don't fall through to older sections
            return (num_str, title, scope)
    return None


def _find_parent_name(num_str, sections):
    """For a sub-section like 12.3.4, find the name of parent 12.3."""
    parts = num_str.split('.')
    if len(parts) < 3:
        return ""
    parent_num = '.'.join(parts[:2])
    for _, _, sec_num, title, _ in sections:
        if sec_num == parent_num:
            return title
    return ""


def _safe_filename(s: str) -> str:
    s = re.sub(r'[\\/:*?"<>|\u201c\u201d\u2018\u2019]', '_', s)
    s = re.sub(r'[（）\(\)]', '_', s)
    s = re.sub(r'\s+', '_', s)
    s = s.strip('_.')
    return s[:50]


def _guess_category(sec_num: str, title: str, scope: str) -> str:
    if scope == "technical":
        return "技术文件"

    keywords = {
        "营业执照": "资质证明", "ISO": "资质证明", "CMMI": "资质证明",
        "管理体系": "资质证明", "信用": "资质证明", "认证": "资质证明",
        "著作权": "资质证明", "资质": "资质证明",
        "合同": "业绩证明", "业绩": "业绩证明", "发票": "业绩证明",
        "中标": "业绩证明", "验收": "业绩证明",
        "身份证": "基本文件", "授权": "基本文件", "法定代表人": "基本文件",
        "社保": "基本文件", "承诺": "基本文件", "印章": "基本文件",
        "报价": "商务文件",
        "学历": "人员资料", "资格证": "人员资料", "学位": "人员资料",
        "简历": "人员资料",
        "审计": "财务文件", "财务": "财务文件",
    }
    for kw, cat in keywords.items():
        if kw in title:
            return cat

    top = sec_num.split('.')[0]
    sec_map = {"10": "基本文件", "11": "人员资料", "12": "人员资料", "13": "业绩证明"}
    if top in sec_map:
        return sec_map[top]

    return "商务文件"


def _build_tags(sec_num: str, title: str, parent_name: str = "") -> list[str]:
    tags = [title]
    parts = re.split(r'[、，,\s]+', title)
    tags.extend(p for p in parts if len(p) >= 2 and p != title)

    if parent_name:
        tags.append(parent_name)

    alias_map = {
        "营业执照": ["工商登记", "执照"],
        "ISO9001": ["质量管理", "质量体系"],
        "ISO14001": ["环境管理"],
        "ISO20000": ["IT服务管理"],
        "ISO27001": ["信息安全"],
        "OHSAS18001": ["职业健康"],
        "0HSAS18001": ["职业健康", "OHSAS18001"],
        "身份证": ["证件"],
        "社保": ["社会保险"],
        "发票": ["税务"],
        "合同": ["协议", "项目合同"],
        "学历": ["毕业证", "学位"],
        "资格证": ["执业资格", "证书"],
        "中标通知书": ["中标", "通知书"],
    }
    for kw, aliases in alias_map.items():
        if kw.lower() in title.lower():
            tags.extend(aliases)

    top = sec_num.split('.')[0]
    if top == "12":
        tags.extend(["团队成员", "项目团队"])
    elif top == "11":
        tags.extend(["项目负责人"])
    elif top == "13":
        tags.extend(["业绩", "项目业绩"])

    return tags


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract images from bid PDF by section")
    parser.add_argument("pdf_path", help="Path to the PDF file")
    parser.add_argument("--output-dir", default="pages", help="Output directory for images")
    parser.add_argument("--index", default="index.json", help="Output path for index JSON")
    args = parser.parse_args()
    extract_images(args.pdf_path, args.output_dir, args.index)
