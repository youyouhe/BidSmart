# PageIndex API 文档

## RESTful API 设计规范和具体要求

基于 `api/index.py` 的实现，以下是完整的 RESTful API 设计规范。

### 📋 总体规范
- **框架**：FastAPI (自动生成 OpenAPI 3.0 文档)
- **版本**：0.2.0
- **数据格式**：JSON
- **字符编码**：UTF-8
- **认证**：无（基于 LLM API Key 环境变量）

### 🌐 CORS 配置
```json
{
  "allow_origins": ["*"],
  "allow_credentials": true,
  "allow_methods": ["*"],
  "allow_headers": ["*"]
}
```
**要求**：生产环境应限制具体域名

### 📍 API 端点规范

#### 1. GET /
**描述**：API 根路径，获取 API 信息和可用端点列表
**响应格式**：
```json
{
  "name": "PageIndex API",
  "version": "0.2.0",
  "description": "Vectorless, reasoning-based RAG system for document analysis",
  "endpoints": [
    {"path": "/health", "method": "GET", "description": "Health check"},
    {"path": "/api/provider-health", "method": "GET", "description": "Check LLM provider configuration status"},
    {"path": "/api/parse/markdown", "method": "POST", "description": "Parse Markdown document"},
    {"path": "/api/parse/pdf", "method": "POST", "description": "Parse PDF document"},
    {"path": "/api/chat", "method": "POST", "description": "Q&A with document"},
    {"path": "/api/documents/upload", "method": "POST", "description": "Upload new document"},
    {"path": "/api/documents/", "method": "GET", "description": "List all documents"},
    {"path": "/api/documents/{id}", "method": "GET", "description": "Get document details"},
    {"path": "/api/documents/{id}", "method": "DELETE", "description": "Delete document"},
    {"path": "/api/documents/{id}/parse", "method": "POST", "description": "Re-parse document"},
    {"path": "/api/documents/{id}/download", "method": "GET", "description": "Download original file"},
    {"path": "/api/documents/{id}/tree", "method": "GET", "description": "Get parsed tree structure"},
    {"path": "/api/performance/stats", "method": "GET", "description": "Get parsing performance statistics"}
  ]
}
```

#### 2. GET /health
**描述**：服务健康检查
**响应格式**：
```json
{
  "status": "healthy",
  "version": "0.2.0",
  "provider": "deepseek",
  "model": "deepseek-reasoner",
  "available_providers": ["deepseek", "gemini", "openrouter", "openai"]
}
```
**状态码**：
- 200：健康
- 503：LLM provider 初始化失败

#### 3. GET /api/provider-health
**描述**：检查 LLM provider 配置和健康状态，用于前端检测哪些 provider 已配置 API key
**查询参数**：
- `provider`: 可选，指定 provider 名称（deepseek/gemini/openrouter/openai）。支持 "google" 作为 "gemini" 的别名

**响应格式（单个 provider）**：
```json
{
  "provider": "deepseek",
  "configured": true,
  "default_model": "deepseek-reasoner",
  "base_url": "https://api.deepseek.com"
}
```

**响应格式（所有 providers，不传参数）**：
```json
{
  "deepseek": {
    "configured": true,
    "default_model": "deepseek-reasoner",
    "base_url": "https://api.deepseek.com"
  },
  "gemini": {
    "configured": false,
    "default_model": "gemini-2.5-flash-lite",
    "base_url": "https://generativelanguage.googleapis.com"
  },
  "openrouter": {
    "configured": true,
    "default_model": "deepseek/deepseek-r1",
    "base_url": "https://openrouter.ai/api/v1"
  },
  "openai": {
    "configured": false,
    "default_model": "gpt-4o-2024-11-20",
    "base_url": "https://api.openai.com/v1"
  }
}
```

**字段说明**：
| 字段 | 类型 | 说明 |
|------|------|------|
| configured | boolean | 是否已配置 API Key |
| default_model | string | 默认模型名称 |
| base_url | string | API 基础 URL |

**状态码**：
- 200：成功
- 400：未知的 provider 名称

---

## 📄 文档解析端点（向后兼容）

### 4. POST /api/parse/markdown
**描述**：解析 Markdown 文档为树结构（无持久化）
**请求格式**：
- Content-Type: `multipart/form-data`
- Body:
  - `file`: Markdown 文件（必需）
  - `model`: LLM 模型（默认：gpt-4o-2024-11-20）
  - `if_add_node_summary`: 是否添加摘要（默认：true）
  - `if_add_node_text`: 是否添加完整文本（默认：true）

**响应格式**：
```json
{
  "success": true,
  "message": "Successfully parsed Markdown file: document.md",
  "tree": {
    "id": "root",
    "title": "Document",
    "level": 0,
    "content": "Full text content...",
    "summary": "Section summary...",
    "children": [...]
  },
  "stats": {
    "total_nodes": 42,
    "max_depth": 4,
    "total_characters": 15000,
    "total_tokens": 3750,
    "has_summaries": true,
    "has_content": true
  }
}
```
**状态码**：
- 200：成功
- 400：文件类型无效
- 500：解析失败

### 5. POST /api/parse/pdf
**描述**：解析 PDF 文档为树结构（无持久化）
**请求格式**：
- Content-Type: `multipart/form-data`
- Body:
  - `file`: PDF 文件（必需）
  - `model`: LLM 模型（默认：gpt-4o-2024-11-20）
  - `toc_check_pages`: TOC 检测页数（默认：20）
  - `max_pages_per_node`: 每节点最大页数（默认：10）
  - `max_tokens_per_node`: 每节点最大 token 数（默认：20000）
  - `if_add_node_summary`: 是否添加摘要（默认：true）
  - `if_add_node_id`: 是否添加节点 ID（默认：true）
  - `if_add_node_text`: 是否添加完整文本（默认：false）

**响应格式**：同 `/api/parse/markdown`

### 6. POST /api/chat
**描述**：基于文档树进行问答推理，支持多轮对话历史
**请求格式**：
```json
{
  "question": "用户问题文本",
  "tree": {
    "id": "root",
    "title": "Document",
    "level": 0,
    "children": [...]
  },
  "history": [
    {"role": "user", "content": "第一个问题"},
    {"role": "assistant", "content": "第一个回答"}
  ]
}
```
**字段说明**：
| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| question | string | ✅ | 当前用户问题 |
| tree | TreeNode | ✅ | 文档树结构 |
| history | ChatMessage[] | ❌ | 对话历史（用于多轮对话上下文） |

**history 字段格式**：
```typescript
interface ChatMessage {
  role: 'user' | 'assistant';  // 消息角色
  content: string;              // 消息内容
}
```

**响应格式**：
```json
{
  "answer": "AI 生成的答案",
  "sources": [
    {"id": "0003", "title": "Chapter 3", "relevance": 0.95}
  ],
  "debug_path": ["root", "0001", "0003"],
  "provider": "deepseek",
  "model": "deepseek-reasoner"
}
```

**多轮对话示例**：
```javascript
// 前端实现示例
const [messages, setMessages] = useState([]);

// 第一轮对话
await chatWithDocument("什么是PageIndex？", tree);

// 第二轮对话（带历史）
const history = [
  {role: "user", content: "什么是PageIndex？"},
  {role: "assistant", content: "PageIndex是一个向量less的RAG系统..."}
];
await chatWithDocument("它有什么优势？", tree, history);
```

**状态码**：
- 200：成功
- 503：LLM provider 未初始化
- 500：问答失败

---

## 🗂️ 文档管理端点（新增）

### 7. POST /api/documents/upload
**描述**：上传新文档，自动触发后台解析
**请求格式**：
- Content-Type: `multipart/form-data`
- Body:
  - `file`: 文档文件（必需，支持 PDF 和 Markdown）
  - `model`: LLM 模型（默认：gpt-4o-2024-11-20）
  - `toc_check_pages`: PDF - TOC 检测页数（默认：20）
  - `max_pages_per_node`: PDF - 每节点最大页数（默认：10）
  - `max_tokens_per_node`: PDF - 每节点最大 token 数（默认：20000）
  - `if_add_node_id`: PDF - 是否添加节点 ID（默认：true）
  - `if_add_node_summary`: 是否添加摘要（默认：true）
  - `if_add_node_text`: 是否添加完整文本（默认：false）
  - `auto_parse`: 是否自动解析（默认：true）

**响应格式**：
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "document.pdf",
  "file_type": "pdf",
  "file_size_bytes": 1048576,
  "parse_status": "pending",
  "message": "Document uploaded successfully. Parsing will begin shortly."
}
```
**解析状态值**：
- `pending`: 等待解析
- `processing`: 正在解析
- `completed`: 解析完成
- `failed`: 解析失败

**状态码**：
- 200：成功
- 400：文件类型无效或文件过大
- 500：保存失败

### 8. GET /api/documents/
**描述**：列出所有文档，支持筛选和分页
**查询参数**：
- `file_type`: 文件类型筛选（可选：pdf/markdown）
- `parse_status`: 解析状态筛选（可选：pending/processing/completed/failed）
- `limit`: 每页最大数量（默认：100，最大：1000）
- `offset`: 分页偏移量（默认：0）

**响应格式**：
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "filename": "document.pdf",
      "file_type": "pdf",
      "file_size_bytes": 1048576,
      "title": null,
      "description": null,
      "parse_status": "completed",
      "error_message": null,
      "created_at": "2024-01-15T10:30:00",
      "updated_at": "2024-01-15T10:30:15"
    }
  ],
  "count": 1,
  "limit": 100,
  "offset": 0
}
```
**状态码**：
- 200：成功
- 400：筛选参数无效

### 9. GET /api/documents/{document_id}
**描述**：获取文档详情
**响应格式**：
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "document.pdf",
  "file_type": "pdf",
  "file_size_bytes": 1048576,
  "title": null,
  "description": null,
  "parse_status": "completed",
  "error_message": null,
  "created_at": "2024-01-15T10:30:00",
  "updated_at": "2024-01-15T10:30:15",
  "parse_result": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "document_id": "550e8400-e29b-41d4-a716-446655440000",
    "model_used": "gpt-4o-2024-11-20",
    "parsed_at": "2024-01-15T10:30:15",
    "parse_duration_ms": 15000
  },
  "performance": {
    "total_duration_seconds": 120.5,
    "llm_total_duration": 95.2,
    "total_llm_calls": 65,
    "llm_errors": 2,
    "llm_retries": 3,
    "total_input_tokens": 45000,
    "total_output_tokens": 18000,
    "stages": {
      "toc_processing": {"duration": 15.2, "llm_calls": 15},
      "toc_postprocessing": {"duration": 3.5, "llm_calls": 10},
      "large_node_processing": {"duration": 0.0, "llm_calls": 0},
      "summary_generation": {"duration": 45.6, "llm_calls": 40},
      "tree_building": {"duration": 52.3, "llm_calls": 0}
    },
    "formatted": {
      "total_duration": "120.50s",
      "llm_duration": "95.20s",
      "total_calls": 65,
      "input_tokens": "45,000",
      "output_tokens": "18,000"
    }
  }
}
```

**性能字段说明**：
- `total_duration_seconds`: 总处理时间（秒）
- `llm_total_duration`: LLM 调用总耗时（秒）
- `total_llm_calls`: LLM API 调用总次数
- `llm_errors`: 失败的 LLM 调用次数
- `llm_retries`: 重试次数
- `total_input_tokens`: 输入 token 总数
- `total_output_tokens`: 输出 token 总数
- `stages`: 各阶段耗时和 LLM 调用数
- `formatted`: 格式化的可读统计信息

**状态码**：
- 200：成功
- 404：文档不存在

### 10. DELETE /api/documents/{document_id}
**描述**：删除文档及所有关联数据
**响应格式**：
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "deleted": true,
  "files_deleted": {
    "upload_deleted": true,
    "parse_results_deleted": true
  }
}
```
**状态码**：
- 200：成功
- 404：文档不存在

### 11. POST /api/documents/{document_id}/parse
**描述**：手动重新解析文档
**请求格式**：
- Content-Type: `multipart/form-data`
- Body:
  - `model`: 覆盖模型（可选）

**响应格式**：同 `POST /api/parse/pdf` 或 `/api/parse/markdown`
**状态码**：
- 200：成功
- 404：文档不存在或文件丢失
- 500：解析失败

### 12. GET /api/documents/{document_id}/download
**描述**：下载原始上传文件
**响应**：文件下载
**状态码**：
- 200：成功
- 404：文档不存在或文件丢失

### 13. GET /api/documents/{document_id}/tree
**描述**：获取解析后的树结构
**响应格式**：
```json
{
  "id": "root",
  "title": "Document",
  "level": 0,
  "content": "...",
  "summary": "...",
  "children": [...]
}
```
**状态码**：
- 200：成功
- 400：文档尚未解析
- 404：文档不存在或数据丢失

### 14. GET /api/documents/{document_id}/stats
**描述**：获取解析统计信息
**响应格式**：
```json
{
  "total_nodes": 42,
  "max_depth": 4,
  "total_characters": 15000,
  "total_tokens": 3750,
  "has_summaries": true,
  "has_content": true
}
```
**状态码**：
- 200：成功
- 400：文档尚未解析
- 404：文档不存在或数据丢失

---

## ⚠️ 错误处理规范

### 统一错误格式
```json
{
  "error": "error_code",
  "message": "人类可读的错误描述",
  "details": [
    {"field": "field_name", "message": "具体错误信息"}
  ]
}
```

### HTTP 状态码
- **200 OK**：请求成功
- **400 Bad Request**：请求参数无效
- **404 Not Found**：资源不存在
- **413 Payload Too Large**：文件过大
- **500 Internal Server Error**：服务器内部错误
- **503 Service Unavailable**：LLM provider 未初始化

---

## 🔧 环境变量要求

### LLM Provider 配置
- `LLM_PROVIDER`：默认 LLM Provider（deepseek/gemini/openrouter/openai）
- `DEEPSEEK_API_KEY`：DeepSeek API Key
- `GEMINI_API_KEY`：Google Gemini API Key
- `OPENROUTER_API_KEY`：OpenRouter API Key
- `OPENAI_API_KEY`：OpenAI API Key
- `LLM_MODEL`：覆盖默认模型名称（可选）

### 数据库配置
- `PAGEINDEX_DB_PATH`：数据库文件路径（默认：data/documents.db）

---

## 📁 存储结构

```
data/
├── documents.db           # SQLite 数据库（仅元数据）
├── uploads/               # 原始上传文件
│   ├── {uuid}.pdf
│   └── {uuid}.md
└── parsed/                # 解析结果 JSON 文件
    ├── {uuid}_tree.json   # 树结构
    └── {uuid}_stats.json  # 统计信息
```

---

## 🔒 安全要求

- 无敏感信息在响应中暴露
- API Key 通过环境变量配置
- CORS 在生产环境限制域名
- 文件上传大小限制（默认：100MB）
- 文件类型验证

---

## 📚 文档要求

- FastAPI 自动生成 Swagger UI (`/docs`)
- ReDoc 文档 (`/redoc`)
- OpenAPI JSON (`/openapi.json`)

---

## 🧪 测试要求

- 健康检查端点用于监控
- 所有端点需单元测试
- 错误场景覆盖

---

## 📊 性能监控端点

### GET /api/performance/stats
**描述**：获取最近一次文档解析的性能统计

**响应格式**：
```json
{
  "total_duration_seconds": 120.5,
  "llm_total_duration": 95.2,
  "total_llm_calls": 65,
  "llm_errors": 2,
  "llm_retries": 3,
  "total_input_tokens": 45000,
  "total_output_tokens": 18000,
  "stages": {
    "toc_processing": {"duration": 15.2},
    "toc_postprocessing": {"duration": 3.5},
    "large_node_processing": {"duration": 0.0},
    "summary_generation": {"duration": 45.6},
    "tree_building": {"duration": 52.3}
  },
  "llm_calls_by_stage": {
    "toc_processing": 15,
    "toc_postprocessing": 10,
    "large_node_processing": 0,
    "summary_generation": 40,
    "tree_building": 0
  },
  "formatted": {
    "total_duration": "120.50s",
    "llm_duration": "95.20s",
    "total_calls": 65,
    "input_tokens": "45,000",
    "output_tokens": "18,000"
  }
}
```

**字段说明**：
- `total_duration_seconds`: 总处理时间（秒）
- `llm_total_duration`: LLM 调用总耗时（秒）
- `total_llm_calls`: LLM API 调用总次数
- `llm_errors`: 失败的 LLM 调用次数
- `llm_retries`: 重试次数
- `total_input_tokens`: 输入 token 总数
- `total_output_tokens`: 输出 token 总数
- `stages`: 各阶段耗时明细
- `llm_calls_by_stage`: 各阶段 LLM 调用次数

**监控的阶段**：
- `pdf_tokenization`: PDF 转 token
- `toc_processing`: TOC 检测、转换、验证、修复
- `toc_postprocessing`: TOC 后处理
- `tree_building`: 树结构构建
- `large_node_processing`: 大节点递归处理
- `summary_generation`: 摘要生成

**状态码**：
- 200：成功

---

## 使用示例

### 上传并自动解析 PDF
```bash
curl -X POST "http://localhost:8003/api/documents/upload" \
  -F "file=@document.pdf" \
  -F "model=gpt-4o-2024-11-20"
```

### 查询已解析的文档列表
```bash
curl "http://localhost:8003/api/documents/?parse_status=completed"
```

### 获取文档树结构
```bash
curl "http://localhost:8003/api/documents/{document_id}/tree"
```

### 删除文档
```bash
curl -X DELETE "http://localhost:8003/api/documents/{document_id}"
```

### 对话问答（单轮）
```bash
curl -X POST "http://localhost:8003/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "什么是PageIndex？",
    "tree": {
      "id": "root",
      "title": "Document",
      "level": 0,
      "children": []
    }
  }'
```

### 对话问答（多轮，带历史）
```bash
curl -X POST "http://localhost:8003/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "它有什么优势？",
    "tree": {
      "id": "root",
      "title": "Document",
      "level": 0,
      "children": []
    },
    "history": [
      {"role": "user", "content": "什么是PageIndex？"},
      {"role": "assistant", "content": "PageIndex是一个向量less的RAG系统..."}
    ]
  }'
```

### 获取文档性能数据
```bash
curl "http://localhost:8003/api/documents/{document_id}"
```

**响应格式**（包含 performance 字段）：
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "performance": {
    "total_duration_seconds": 120.5,
    "llm_total_duration": 95.2,
    "total_llm_calls": 65,
    "formatted": {
      "total_duration": "120.50s",
      "llm_duration": "95.20s",
      "total_calls": 65
    }
  }
}
```

### 获取全局性能统计
```bash
curl "http://localhost:8003/api/performance/stats"
```

**说明**：
- `/api/documents/{id}` - 获取特定文档的性能数据
- `/api/performance/stats` - 获取最近一次解析的全局性能数据

