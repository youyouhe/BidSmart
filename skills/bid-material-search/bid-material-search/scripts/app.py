"""FastAPI backend for bid document retrieval."""
import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
INDEX_PATH = BASE_DIR / "index.json"
PAGES_DIR = BASE_DIR / "pages"

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
    with open(INDEX_PATH, encoding="utf-8") as f:
        data = json.load(f)
    documents = data["documents"]


def _match_keyword(doc: dict, keyword: str) -> bool:
    keyword = keyword.lower()
    fields = [doc.get("type", ""), doc.get("label", ""), doc.get("section", "")]
    fields.extend(doc.get("searchable_tags", []))
    return any(keyword in f.lower() for f in fields)


def _format_result(doc: dict) -> dict:
    files = doc.get("files", [])
    return {
        "id": doc["id"],
        "section": doc.get("section", ""),
        "type": doc["type"],
        "category": doc["category"],
        "label": doc["label"],
        "page_range": doc.get("page_range", []),
        "images": [{"filename": f, "url": f"/pages/{f}"} for f in files],
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


app.mount("/pages", StaticFiles(directory=str(PAGES_DIR)), name="pages")
