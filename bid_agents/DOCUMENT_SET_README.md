# 文档集（DocumentSet）功能

## 概述

文档集（DocumentSet）是 BidSmart 的多文档管理功能，允许将多个文档组合在一起进行统一的投标编写。支持以下文档类型：

- **tender** - 招标文件（主文档）
- **reference** - 参考资料
- **template** - 模板文件
- **historical** - 历史标书（用于内容复用）
- **company** - 公司资质文档

## 架构设计

### 核心组件

```
models/document_set.py              # DocumentSet, DocumentSetItem 模型
services/document_set_merger.py     # 目录合并服务
services/document_set_compat.py     # 向后兼容层
tools/document_set_tools.py         # 文档集管理工具
tools/document_set_query.py         # 增强查询工具
pipelines/document_set_pipeline.py  # 文档集感知流程
```

### 数据结构

```python
DocumentSet:
  - id: str
  - name: str
  - items: List[DocumentSetItem]
  
DocumentSetItem:
  - document_id: str
  - name: str
  - doc_type: "tender" | "reference" | "template" | "historical" | "company"
  - role: "primary" | "auxiliary" | "reference"
  - order: int
  - tree: dict  # 解析后的目录树
```

## 使用方式

### 1. 创建文档集

```python
from bid_agents.orchestrator.orchestrator import create_bid_session

api_client, state = await create_bid_session(
    project_id="project-xxx",
    auto_migrate=True  # 自动从单文档迁移
)

# 或使用工具显式创建
from bid_agents.tools.document_set_tools import create_document_set

result = await create_document_set(
    state, api_client,
    name="某项目投标文档集",
    description="包含招标三册+历史标书",
    primary_doc_id="doc_tender_main",
    auxiliary_docs='[
        {"doc_id": "doc_tender_tech", "name": "技术册", "doc_type": "tender"},
        {"doc_id": "doc_template", "name": "合同模板", "doc_type": "template"},
        {"doc_id": "doc_historical", "name": "2023年标书", "doc_type": "historical"}
    ]'
)
```

### 2. 管理文档集

```python
# 添加文档
await add_to_document_set(
    state, api_client,
    document_id="doc_new_ref",
    name="补充说明",
    doc_type="reference"
)

# 列出文档集
await list_document_set(state, api_client)

# 切换主文档
await set_primary_document(state, api_client, document_id="doc_new_main")
```

### 3. 文档集感知查询

```python
from bid_agents.tools.document_set_query import query_document_set

# 查询所有文档
result = await query_document_set(
    state, api_client,
    query="评分标准",
    scope="all"
)

# 仅查询主文档
result = await query_document_set(
    state, api_client,
    query="技术需求",
    scope="primary"
)

# 查询特定文档
result = await query_document_set(
    state, api_client,
    query="合同条款",
    scope="doc_contract_template"  # 文档ID
)
```

### 4. 跨文档搜索

```python
from bid_agents.tools.document_set_query import find_across_documents

# 搜索标题包含"验收"的章节
result = await find_across_documents(
    state, api_client,
    keyword="验收",
    doc_types="tender,reference"
)
```

### 5. 文档对比

```python
from bid_agents.tools.document_set_query import compare_documents

result = await compare_documents(
    state, api_client,
    doc_id_1="doc_tender_2024",
    doc_id_2="doc_tender_2023",
    section_pattern="付款"  # 可选：仅对比特定章节
)
```

## 目录合并

### 合并策略

1. **主文档优先**：主文档的目录作为根节点
2. **辅助文档归类**：辅助文档放入"辅助文档"分支
3. **节点ID前缀**：辅助文档节点ID添加 `doc_{doc_id}_` 前缀

### 获取合并树

```python
from bid_agents.tools.document_set_query import get_merged_tree

# JSON 格式
tree_json = await get_merged_tree(state, api_client, format="hierarchical")

# 文本格式
tree_text = await get_merged_tree(state, api_client, format="flat")
```

示例输出：
```
📁 某项目投标文档集
├── 招标公告
├── 投标人须知
├── 技术需求
├── 合同条款
└── 📂 辅助文档
    ├── [技术册] 技术需求详情
    ├── [合同模板] 标准合同
    └── [2023年标书] 实施方案
```

## 文档集感知流程

### 分析流程

```python
from bid_agents.pipelines.document_set_pipeline import run_document_set_analysis_pipeline

report = await run_document_set_analysis_pipeline(
    project_id="project-xxx",
    api_url="http://localhost:8003",
    progress_callback=lambda phase, msg: print(f"[{phase}] {msg}")
)
```

流程：
1. 分析主文档（评分标准、资格要求等）
2. 扫描辅助文档了解内容类型
3. 识别历史标书中的可复用章节
4. 生成综合分析报告

### 编写流程

```python
from bid_agents.pipelines.document_set_pipeline import run_document_set_writing_pipeline

content = await run_document_set_writing_pipeline(
    project_id="project-xxx",
    section_id="sec-technical-solution",
    api_url="http://localhost:8003"
)
```

特性：
- 从主文档获取章节要求
- 搜索辅助文档获取参考内容
- 匹配历史标书中的可复用段落

## 向后兼容

### 自动迁移

旧项目会自动迁移到文档集模式，保持向后兼容：

```python
# 原有代码无需修改
from bid_agents.orchestrator.orchestrator import create_bid_session

api_client, state = await create_bid_session(project_id)
# 自动创建文档集，原 tender_document_id 成为主文档
```

### 兼容层

```python
from bid_agents.services.document_set_compat import DocumentSetCompatibilityWrapper

wrapper = DocumentSetCompatibilityWrapper(state)

# 向后兼容的属性访问
doc_id = wrapper.tender_document_id  # 自动返回主文档ID
tree = wrapper.tender_tree           # 自动返回主文档树

# 检查模式
is_multi = wrapper.is_multi_document()  # True/False
count = wrapper.get_document_count()    # 文档数量
```

### 状态方法

```python
# 检查是否使用文档集
if state.is_using_document_set():
    print(f"使用文档集: {state.document_set.name}")

# 获取有效树（兼容方法）
tree = state.get_effective_tree()  # 优先从文档集获取

# 获取文档集摘要
summary = state.get_document_set_summary()
```

## 典型使用场景

### 场景1：多册招标文件

```python
# 招标项目分为三册
result = await create_document_set(
    state, api_client,
    name="某省信息化项目",
    primary_doc_id="doc_tender_vol1",  # 第一册：通用条款
    auxiliary_docs='[
        {"doc_id": "doc_tender_vol2", "name": "第二册-技术需求", "doc_type": "tender"},
        {"doc_id": "doc_tender_vol3", "name": "第三册-合同样本", "doc_type": "tender"}
    ]'
)
```

### 场景2：带历史参考的投标

```python
# 新投标参考历史标书
await add_to_document_set(
    state, api_client,
    document_id="doc_bid_2023",
    name="2023年同类项目标书",
    doc_type="historical"
)

# 编写时自动搜索历史内容
content = await run_document_set_writing_pipeline(...)
```

### 场景3：公司资质文档包

```python
# 添加公司资质作为辅助文档
await add_to_document_set(
    state, api_client,
    document_id="doc_company_qual",
    name="公司资质包",
    doc_type="company"
)
```

## API 扩展

如需后端支持，建议添加以下 API：

```
POST   /api/document-sets              # 创建文档集
GET    /api/document-sets/{id}         # 获取文档集
PUT    /api/document-sets/{id}         # 更新文档集
DELETE /api/document-sets/{id}/items/{doc_id}  # 移除文档
GET    /api/document-sets/{id}/merge   # 获取合并树
POST   /api/document-sets/{id}/query   # 跨文档查询
```

## 工具列表

### 文档集管理工具

| 工具名 | 功能 |
|--------|------|
| `create_document_set` | 创建新文档集 |
| `add_to_document_set` | 添加文档到集 |
| `remove_from_document_set` | 从集移除文档 |
| `list_document_set` | 列出所有文档 |
| `get_document_set_info` | 获取集信息(JSON) |
| `set_primary_document` | 设置主文档 |
| `refresh_document_tree` | 刷新文档树 |

### 增强查询工具

| 工具名 | 功能 |
|--------|------|
| `query_document_set` | 跨文档查询 |
| `get_merged_tree` | 获取合并树 |
| `find_across_documents` | 跨文档搜索 |
| `compare_documents` | 文档对比 |
| `get_document_set_summary` | 获取集摘要 |

## 文件清单

```
bid_agents/
├── models/
│   └── document_set.py          # 文档集模型
├── services/
│   ├── document_set_merger.py   # 目录合并
│   └── document_set_compat.py   # 向后兼容
├── tools/
│   ├── document_set_tools.py    # 管理工具
│   └── document_set_query.py    # 查询工具
└── pipelines/
    └── document_set_pipeline.py # 文档集流程
```
