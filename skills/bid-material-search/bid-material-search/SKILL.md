---
name: bid-material-search
description: >
  基于已提取的投标资料图片和index.json索引，构建FastAPI检索服务，
  支持关键词搜索、分类过滤、文档类型查询，提供图片静态文件服务。
  当用户需要查询投标资料（营业执照、证书、合同、业绩等）、
  启动资料检索服务、管理索引条目（增删改）时触发。
  前置条件：需已通过 bid-material-extraction 完成图片提取和索引建立。
---

# 投标资料检索服务

## 前置条件

- `pages/` 目录：已提取的图片文件
- `index.json`：元数据索引（由 bid-material-extraction 生成）

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
