# BidSmart-Index API 文档

## RESTful API 设计规范和具体要求

基于 `api/index.py` 的实现，以下是完整的 RESTful API 设计规范。

### 📋 总体规范
- **框架**：FastAPI (自动生成 OpenAPI 3.0 文档)
- **数据格式**：JSON
- **字符编码**：UTF-8
- **认证**：无（基于 LLM API Key 环境变量）
- **部署**：Vercel Serverless (使用 Mangum 适配器)

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

#### 1. GET /health
**描述**：服务健康检查
**响应格式**：
```json
{
  "status": "ok" | "error",
  "provider": "gemini" | "deepseek" | "openrouter" | null,
  "model": "model_name" | null,
  "version": "1.0.0",
  "available_providers": ["gemini", "deepseek", "openrouter"]
}
```

#### 2. GET /
**描述**：API 根路径
**响应格式**：
```json
{
  "message": "BidSmart-Index API",
  "version": "1.0.0",
  "endpoints": {
    "health": "/health",
    "parse": "/api/parse",
    "chat": "/api/chat"
  }
}
```

#### 3. POST /api/parse
**描述**：文档解析（Markdown → 树结构）
**请求格式**：
- Content-Type: `multipart/form-data`
- Body: `file` (UploadFile) - Markdown 文件
**响应格式**：
```json
{
  "tree": {
    "id": "string",
    "title": "string",
    "content": "string",
    "level": 0,
    "children": [...]
  },
  "stats": {
    "total_nodes": 123,
    "filename": "document.md"
  }
}
```
**状态码**：
- 200：成功
- 400：文件读取失败
- 500：解析失败

#### 4. POST /api/chat
**描述**：基于文档树进行问答推理
**请求格式**：
```json
{
  "question": "用户问题文本",
  "tree": {
    "id": "string",
    "title": "string",
    "content": "string",
    "level": 0,
    "children": [...]
  }
}
```
**响应格式**：
```json
{
  "answer": "AI 生成的答案",
  "source_node": "来源章节标题",
  "debug_path": ["Root", "Chapter 1", "Section 1.1"]
}
```
**状态码**：
- 200：成功
- 503：PageIndex 服务未初始化
- 500：问答失败

### ⚠️ 错误处理规范
- 使用 `HTTPException` 抛出错误
- 错误响应包含 `detail` 字段
- 统一错误格式：
```json
{
  "detail": "错误描述信息"
}
```

### 🔧 环境变量要求
- `GEMINI_API_KEY`：Google Gemini API Key
- `DEEPSEEK_API_KEY`：DeepSeek API Key
- `OPENROUTER_API_KEY`：OpenRouter API Key
- `LLM_PROVIDER`：默认 LLM Provider (gemini/deepseek/openrouter)

### 📊 性能要求
- Vercel Serverless 函数最大执行时间：10秒
- 支持文件大小：需考虑 Vercel 限制
- 并发处理：单实例处理

### 🔒 安全要求
- 无敏感信息在响应中暴露
- API Key 通过环境变量配置
- CORS 在生产环境限制域名

### 📚 文档要求
- FastAPI 自动生成 Swagger UI (`/docs`)
- ReDoc 文档 (`/redoc`)
- OpenAPI JSON (`/openapi.json`)

### 🧪 测试要求
- 健康检查端点用于监控
- 所有端点需单元测试
- 错误场景覆盖

这个设计遵循 RESTful 原则，提供了完整的文档解析和问答功能，适合 Vercel Serverless 部署。