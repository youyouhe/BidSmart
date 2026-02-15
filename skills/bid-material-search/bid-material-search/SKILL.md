---
name: bid-material-search
description: >
  基于已提取的投标资料图片和index.json索引，构建FastAPI检索服务，
  支持关键词搜索、分类过滤、文档类型查询，提供图片静态文件服务，
  并支持自动替换响应文件中的占位符为实际图片引用。
  当用户需要查询投标资料（营业执照、证书、合同、业绩等）、
  启动资料检索服务、管理索引条目（增删改）、
  或替换响应文件中的【此处插入XX扫描件】占位符时触发。
  前置条件：需已通过 bid-material-extraction 完成图片提取和索引建立。
---

# 投标资料检索服务

## 前置条件

- `pages/` 目录 + `index.json`：从旧标书PDF提取的图片和索引（由 bid-material-extraction 生成）
- `data/` 目录 + `data/manifest.json`（可选）：从公司自有响应文件提取的资料图片

启动时自动加载两个数据源，合并为统一的文档列表。搜索和替换对两个来源透明。

## 依赖

- Python: FastAPI, uvicorn

## 启动服务

核心脚本：`scripts/app.py`

将 `app.py` 放置在与 `index.json` 和 `pages/` 同级的目录下，启动：

```bash
uvicorn app:app --host 0.0.0.0 --port 9000
```

## API 端点

| 端点 | 说明 |
|------|------|
| `GET /api/search?q=关键词` | 关键词搜索（匹配 type+label+section+tags） |
| `GET /api/search?category=分类` | 按分类过滤（资质证明/业绩证明/基本文件等） |
| `GET /api/search?type=类型` | 按文档类型过滤 |
| `GET /api/search?q=关键词&category=分类` | 组合查询 |
| `GET /api/documents` | 列出所有文档 |
| `GET /api/documents/{id}` | 单个文档详情 |
| `POST /api/replace` | 占位符替换（搜索+复制图片+替换markdown） |
| `GET /pages/{filename}` | 静态图片文件 |

返回格式：

```json
{
  "results": [
    {
      "id": "sec_10_1_营业执照",
      "section": "10.1",
      "type": "营业执照",
      "category": "资质证明",
      "label": "10.1 营业执照",
      "page_range": [22, 22],
      "images": [
        {"filename": "10_1_营业执照.jpeg", "url": "/pages/10_1_营业执照.jpeg"}
      ]
    }
  ]
}
```

## 索引管理

### 新增条目

直接编辑 `index.json`，在 `documents` 数组中添加新条目，将对应图片放入 `pages/` 目录。重启服务生效。

### 替换过期资料

1. 将新图片放入 `pages/`，删除旧图片
2. 更新 `index.json` 中对应条目的 `files` 字段
3. 重启服务

### 扩展搜索能力

如需增强检索（如模糊匹配、拼音搜索），修改 `app.py` 中的 `_match_keyword` 函数。当前实现为子串包含匹配，对中文关键词已够用。

## 占位符替换

`POST /api/replace` 端点可自动将响应文件中的 `【此处插入XX扫描件】` 占位符替换为实际图片引用。

### 参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `target_file` | string | 是 | markdown 文件绝对路径 |
| `placeholder` | string | 是 | 要替换的占位符文本 |
| `doc_id` | string | 否 | 精确文档 ID（优先使用） |
| `query` | string | 否 | 模糊搜索关键词（doc_id 未提供时使用，取第一个匹配） |

`doc_id` 和 `query` 至少提供一个。

### 替换流程

1. 根据 `doc_id` 或 `query` 查找匹配文档
2. 读取目标文件，确认占位符存在
3. 将 `pages/` 下的图片复制到目标文件所在目录
4. 将占位符替换为 `![label](filename)` 格式的 markdown 图片引用
5. 写回文件

### 调用示例

```bash
# 通过 query 模糊匹配
curl -X POST localhost:9000/api/replace \
  -H 'Content-Type: application/json' \
  -d '{"target_file":"/path/to/响应文件/26-企业营业执照副本.md","placeholder":"【此处插入企业营业执照副本扫描件】","query":"营业执照"}'

# 通过 doc_id 精确指定
curl -X POST localhost:9000/api/replace \
  -H 'Content-Type: application/json' \
  -d '{"target_file":"/path/to/file.md","placeholder":"【此处插入ISO认证扫描件】","doc_id":"sec_10_5_ISO认证"}'
```

### 返回格式

```json
{
  "success": true,
  "replaced": "【此处插入企业营业执照副本扫描件】",
  "doc_id": "sec_10_1_营业执照",
  "doc_label": "10.1 营业执照",
  "images_copied": ["10_1_营业执照.jpeg"],
  "target_file": "/path/to/响应文件/26-企业营业执照副本.md"
}
```

### Claude 工作流中的典型用法

在编写响应文件时，遇到需要插入扫描件的占位符，可直接调用替换端点：

```python
import requests
requests.post("http://localhost:9000/api/replace", json={
    "target_file": "/abs/path/to/响应文件/26-企业营业执照副本.md",
    "placeholder": "【此处插入企业营业执照副本扫描件】",
    "query": "营业执照"
})
```

替换后图片文件会复制到目标 markdown 文件的同级目录，无需手动移动。

## 批量替换模式

当被 bid-manager 调度或用户要求批量替换时，自动扫描 `响应文件/` 目录下所有 `.md` 文件中的扫描件占位符，逐个匹配并替换。

### 工作流程

1. **扫描占位符**：遍历 `响应文件/` 下所有 `.md` 文件，提取所有 `【此处插入XX扫描件】` 格式的占位符
2. **逐个匹配**：对每个占位符，从占位符文字中提取关键词，调用搜索 API 查找匹配文档
3. **自动替换**：找到匹配后调用 `/api/replace` 端点完成替换
4. **记录结果**：
   - ✅ 成功替换：占位符 → 图片引用
   - ⚠️ 多个匹配：列出候选，标记为需人工确认
   - ❌ 无匹配：保留原占位符，列入未匹配清单

### 调用方式

```bash
# 批量替换所有扫描件占位符
curl -X POST localhost:9000/api/batch-replace \
  -H 'Content-Type: application/json' \
  -d '{"target_dir": "/home/tiger/bid/响应文件"}'
```

或由 Claude 直接执行：

```python
import os, requests

resp_dir = "/home/tiger/bid/响应文件"
for fname in os.listdir(resp_dir):
    if not fname.endswith('.md'):
        continue
    fpath = os.path.join(resp_dir, fname)
    content = open(fpath).read()
    import re
    placeholders = re.findall(r'【此处插入(.+?)扫描件】', content)
    for ph in placeholders:
        requests.post("http://localhost:9000/api/replace", json={
            "target_file": fpath,
            "placeholder": f"【此处插入{ph}扫描件】",
            "query": ph.strip()
        })
```

## 典型查询示例

```bash
# 搜索某人相关资料
curl "localhost:9000/api/search?q=张三"

# 查看所有资质证明
curl "localhost:9000/api/search?category=资质证明"

# 查找合同类文件
curl "localhost:9000/api/search?q=合同"

# 查找ISO认证
curl "localhost:9000/api/search?q=ISO"
```

## 完成状态

替换完成后，输出以下结构化状态摘要：

```
--- BID-MATERIAL-SEARCH COMPLETE ---
扫描文件数: {N}
发现占位符: {N}
✅成功替换: {N}
⚠️需人工确认: {N}
❌无匹配: {N}
复制图片数: {N}
输出目录: 响应文件/
状态: SUCCESS
--- END ---
```
