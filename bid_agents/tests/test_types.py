"""Tests for Python type definitions."""

from bid_agents.models.types import (
    Node,
    OutlineSection,
    TenderSection,
)


def test_node_from_dict():
    data = {
        "id": "root",
        "title": "招标文件",
        "children": [
            {
                "id": "ch-1",
                "title": "招标公告",
                "children": [],
                "summary": "本项目为XX采购",
            }
        ],
        "summary": "完整招标文档",
    }
    node = Node.from_dict(data)
    assert node.id == "root"
    assert node.title == "招标文件"
    assert len(node.children) == 1
    assert node.children[0].summary == "本项目为XX采购"


def test_node_flatten():
    node = Node(
        id="root",
        title="招标文件",
        children=[
            Node(id="ch-1", title="第一章", summary="概述"),
            Node(
                id="ch-2",
                title="第二章",
                children=[Node(id="ch-2-1", title="第2.1节")],
            ),
        ],
    )
    text = node.flatten()
    assert "招标文件" in text
    assert "第一章" in text
    assert "概述" in text
    assert "第2.1节" in text


def test_node_find_node():
    node = Node(
        id="root",
        title="Root",
        children=[
            Node(id="a", title="A", children=[
                Node(id="a1", title="A1"),
            ]),
        ],
    )
    found = node.find_node("a1")
    assert found is not None
    assert found.title == "A1"
    assert node.find_node("nonexistent") is None


def test_node_to_dict_roundtrip():
    original = {
        "id": "root",
        "title": "Test",
        "children": [{"id": "c1", "title": "Child", "children": [], "summary": "S"}],
        "summary": "Root summary",
    }
    node = Node.from_dict(original)
    result = node.to_dict()
    assert result["id"] == "root"
    assert result["children"][0]["summary"] == "S"


def test_outline_section_from_dict():
    data = {
        "id": "sec-1",
        "title": "投标函",
        "description": "正式承诺书",
        "requirementSummary": "第X章要求",
        "order": 1,
    }
    sec = OutlineSection.from_dict(data)
    assert sec.id == "sec-1"
    assert sec.requirement_summary == "第X章要求"


def test_tender_section_from_outline():
    outline = OutlineSection(
        id="sec-1",
        title="技术方案",
        description="系统架构设计",
        requirement_summary="详见技术规格",
        order=1,
    )
    section = TenderSection.from_outline_section(outline)
    assert section.id == "sec-1"
    assert section.title == "技术方案"
    assert section.content == ""
    assert section.status == "pending"


def test_tender_section_to_dict():
    section = TenderSection(
        id="sec-1",
        title="Test",
        content="Some content here",
        status="in_progress",
        order=1,
    )
    d = section.to_dict()
    assert d["word_count"] == len("Some content here")
    assert d["status"] == "in_progress"
