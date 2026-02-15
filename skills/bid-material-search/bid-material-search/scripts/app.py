"""FastAPI backend for bid document retrieval."""
import json
import shutil
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
INDEX_PATH = BASE_DIR / "index.json"
PAGES_DIR = BASE_DIR / "pages"
DATA_DIR = BASE_DIR / "data"
MANIFEST_PATH = DATA_DIR / "manifest.json"

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"}

CATEGORY_MAP = {
    "company": "基本文件",
    "qualification": "资质证明",
    "personnel": "人员资料",
    "performance": "业绩证明",
}

app = FastAPI(title="投标文件检索系统", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

documents: list[dict] = []


@app.on_event("startup")
def load_index():
    global documents
    docs: list[dict] = []

    # Load pages/index.json
    if INDEX_PATH.is_file():
        with open(INDEX_PATH, encoding="utf-8") as f:
            data = json.load(f)
        for doc in data["documents"]:
            doc["_source"] = "pages"
            docs.append(doc)

    # Load data/manifest.json
    if MANIFEST_PATH.is_file():
        with open(MANIFEST_PATH, encoding="utf-8") as f:
            manifest = json.load(f)
        for entry in manifest.get("results", []):
            image_files = [
                f for f in entry.get("files", [])
                if Path(f).suffix.lower() in _IMAGE_EXTS
            ]
            if not image_files:
                continue
            title = entry.get("title", "")
            number = entry.get("number", "")
            doc = {
                "id": f"data_{number}_{title}".replace(" ", "_"),
                "section": number,
                "type": title,
                "category": CATEGORY_MAP.get(entry.get("category", ""), entry.get("category", "")),
                "label": f"{number} {title}",
                "files": image_files,
                "page_range": [],
                "searchable_tags": [title],
                "_source": "data",
            }
            docs.append(doc)

    documents = docs


def _match_keyword(doc: dict, keyword: str) -> bool:
    keyword = keyword.lower()
    fields = [doc.get("type", ""), doc.get("label", ""), doc.get("section", "")]
    fields.extend(doc.get("searchable_tags", []))
    return any(keyword in f.lower() for f in fields)


def _get_source_dir(doc: dict) -> Path:
    """Return the filesystem directory where a document's files live."""
    return DATA_DIR if doc.get("_source") == "data" else PAGES_DIR


def _format_result(doc: dict) -> dict:
    files = doc.get("files", [])
    source = doc.get("_source", "pages")
    url_prefix = f"/{source}"
    return {
        "id": doc["id"],
        "section": doc.get("section", ""),
        "type": doc["type"],
        "category": doc["category"],
        "label": doc["label"],
        "page_range": doc.get("page_range", []),
        "source": source,
        "images": [{"filename": f, "url": f"{url_prefix}/{f}"} for f in files],
    }


@app.get("/api/search")
def search(
    q: Optional[str] = Query(None, description="搜索关键词"),
    type: Optional[str] = Query(None, description="文档类型匹配"),
    category: Optional[str] = Query(None, description="分类过滤"),
):
    results = documents

    if q:
        results = [d for d in results if _match_keyword(d, q)]

    if type:
        results = [d for d in results if type in d.get("type", "")]

    if category:
        results = [d for d in results if category in d.get("category", "")]

    return {"results": [_format_result(d) for d in results]}


@app.get("/api/documents")
def list_documents():
    return {"documents": [_format_result(d) for d in documents]}


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: str):
    for doc in documents:
        if doc["id"] == doc_id:
            return _format_result(doc)
    raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")


class ReplaceRequest(BaseModel):
    target_file: str
    placeholder: str
    doc_id: str | None = None
    query: str | None = None


@app.post("/api/replace")
def replace_placeholder(req: ReplaceRequest):
    # 1. Resolve document: doc_id takes priority, then query
    doc = None
    if req.doc_id:
        for d in documents:
            if d["id"] == req.doc_id:
                doc = d
                break
        if doc is None:
            raise HTTPException(status_code=404, detail=f"Document '{req.doc_id}' not found")
    elif req.query:
        matches = [d for d in documents if _match_keyword(d, req.query)]
        if not matches:
            raise HTTPException(status_code=404, detail=f"No document matching '{req.query}'")
        doc = matches[0]
    else:
        raise HTTPException(status_code=400, detail="Must provide doc_id or query")

    # 2. Read target file and verify placeholder exists
    target = Path(req.target_file)
    if not target.is_file():
        raise HTTPException(status_code=404, detail=f"Target file not found: {req.target_file}")

    content = target.read_text(encoding="utf-8")
    if req.placeholder not in content:
        raise HTTPException(
            status_code=404,
            detail=f"Placeholder not found in file: {req.placeholder}",
        )

    # 3. Copy images to target file's directory
    source_dir = _get_source_dir(doc)
    target_dir = target.parent
    files = doc.get("files", [])
    copied: list[str] = []
    for fname in files:
        src = source_dir / fname
        if not src.is_file():
            raise HTTPException(status_code=404, detail=f"Source image not found: {fname}")
        dst = target_dir / fname
        shutil.copy2(str(src), str(dst))
        copied.append(fname)

    # 4. Build markdown image references and replace placeholder
    label = doc.get("label", doc["id"])
    md_images = "\n".join(f"![{label}]({fname})" for fname in files)
    content = content.replace(req.placeholder, md_images, 1)

    # 5. Write back
    target.write_text(content, encoding="utf-8")

    return {
        "success": True,
        "replaced": req.placeholder,
        "doc_id": doc["id"],
        "doc_label": label,
        "images_copied": copied,
        "target_file": str(target),
    }


app.mount("/pages", StaticFiles(directory=str(PAGES_DIR)), name="pages")
if DATA_DIR.is_dir():
    app.mount("/data", StaticFiles(directory=str(DATA_DIR)), name="data")
