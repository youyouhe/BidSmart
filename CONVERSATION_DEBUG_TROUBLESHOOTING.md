# 对话调试工具 - 故障排查指南

## 已修复的问题

### ✅ CORS 错误
**问题**：
```
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource
```

**原因**：
前端调用后端API时没有使用正确的认证头和API配置。

**解决方案**：
1. 导出 `getAuthHeaders` 函数 (services/apiService.ts:39)
2. 在 ConversationDebugModal 中使用 `getApiBaseUrl()` 和 `getAuthHeaders()`
3. 确保后端CORS配置正确（已配置为允许所有来源）

### ✅ 缺少字段错误
**问题**：
后端返回的对话记录中缺少 `system_prompt` 和 `raw_output` 字段。

**原因**：
`get_conversation_history` API端点没有返回这两个新增字段。

**解决方案**：
修改 lib/docmind-ai/api/document_routes.py:1165-1183，在返回的 ConversationMessage 中包含这两个字段。

## 使用前检查清单

### 1. 数据库迁移
确保已运行数据库迁移脚本添加新字段：

```bash
cd lib/docmind-ai
python migrate_conversation_fields.py
```

**验证**：
- 脚本应该显示 "✓ Migration completed successfully!"
- 或者显示 "✓ Columns already exist. No migration needed."

### 2. 后端服务器
确保后端服务器正在运行：

```bash
# 检查健康状态
curl http://localhost:8000/health

# 应该返回：
# {"status": "healthy", "provider": "google", "model": "gemini-2.0-flash-exp"}
```

### 3. API配置
在前端设置中配置正确的API端点：

1. 点击顶部的"设置"按钮
2. 确认API端点设置为：`http://localhost:8000`（或你的实际地址）
3. 如需认证，填写访问令牌

### 4. 对话记录
确保已经有对话记录：

1. 打开或上传一个文档
2. 在右侧文档助手中发送至少一个问题
3. 等待AI回复
4. 现在可以打开调试工具查看对话

## 常见错误及解决方法

### 错误 1: NetworkError when attempting to fetch resource

**症状**：
```
Error loading conversations: TypeError: NetworkError when attempting to fetch resource.
```

**可能原因**：
1. 后端服务器未启动
2. API端点配置错误
3. 网络连接问题
4. CORS配置问题

**解决步骤**：
```bash
# 1. 检查后端是否运行
curl http://localhost:8000/health

# 2. 检查API端点（在浏览器控制台）
console.log(getApiBaseUrl())

# 3. 检查CORS配置（lib/docmind-ai/api/index.py:170-176）
# 应该包含：
# allow_origins=["*"]
# allow_credentials=True
# allow_methods=["*"]
# allow_headers=["*"]

# 4. 重启后端服务器
# Ctrl+C 然后重新运行
```

### 错误 2: Document not found

**症状**：
```
❌ 加载失败
Failed to load conversations: Document not found: xxx
```

**可能原因**：
文档ID不存在或已被删除

**解决步骤**：
1. 关闭调试工具
2. 重新打开或上传文档
3. 再次打开调试工具

### 错误 3: 没有对话记录

**症状**：
调试工具显示"暂无对话记录"

**原因**：
当前文档还没有产生对话

**解决步骤**：
1. 在文档助手中提问
2. 等待AI回复
3. 点击刷新按钮
4. 应该能看到对话记录了

### 错误 4: 看不到系统提示词/原始输出

**症状**：
对话记录中 system_prompt 和 raw_output 字段为空

**可能原因**：
1. 这是旧的对话记录（在功能上线前创建）
2. 数据库迁移未完成
3. 后端代码未更新

**解决步骤**：
```bash
# 1. 运行数据库迁移
cd lib/docmind-ai
python migrate_conversation_fields.py

# 2. 重启后端服务器

# 3. 发起新的对话
# 新的对话应该包含这些字段
```

### 错误 5: 调试按钮是灰色的

**症状**：
无法点击调试按钮

**原因**：
AI正在思考中（isReasoning = true）

**解决步骤**：
等待AI回答完成，按钮会自动恢复

### 错误 6: WebSocket错误

**症状**：
```
[WebSocket] Cannot send message: not connected
```

**原因**：
这是正常的警告，不影响调试工具功能。WebSocket用于实时更新，调试工具使用HTTP API。

**解决步骤**：
无需处理，不影响使用

## 验证安装

运行以下测试脚本验证功能是否正常：

```bash
cd lib/docmind-ai
python test_conversation_fields.py
```

**预期输出**：
```
======================================================================
Testing Conversation Fields Enhancement
======================================================================

1. Creating test document: xxx-xxx-xxx
   ✓ Document created

2. Saving conversation message with system prompt and raw output
   System prompt length: 350 characters
   Raw output length: 700 characters
   ✓ Message saved

3. Retrieving conversation history
   ✓ Retrieved 1 message(s)

4. Verifying saved data:
   Message ID: xxx-xxx-xxx
   Role: assistant
   Content length: 88 characters
   ✓ System prompt saved: 350 characters
   System prompt preview: You are a helpful assistant...
   ✓ Raw output saved: 500 characters
   ✓ Raw output properly truncated to 500 characters
   Raw output preview: Based on the document content...

5. Cleaning up test data
   ✓ Test data cleaned up

======================================================================
Test completed successfully!
======================================================================
```

## 调试技巧

### 1. 使用浏览器开发者工具

打开浏览器控制台（F12），查看：

**网络请求**：
```
开发者工具 → Network → XHR
查找 /conversations 请求
检查请求头、响应状态、响应内容
```

**控制台日志**：
```
开发者工具 → Console
查看错误信息和警告
```

### 2. 检查API响应

直接调用API测试：

```bash
# 获取对话历史
curl -X GET "http://localhost:8000/api/documents/{DOCUMENT_ID}/conversations?limit=10" \
  -H "Content-Type: application/json"

# 应该返回：
# {
#   "document_id": "xxx",
#   "messages": [...],
#   "count": 5
# }
```

### 3. 查看数据库内容

如果安装了SQLite工具：

```bash
cd lib/docmind-ai/data
sqlite3 documents.db

# 查看conversations表结构
.schema conversations

# 查看对话记录
SELECT id, role, LENGTH(content), LENGTH(system_prompt), LENGTH(raw_output) 
FROM conversations 
ORDER BY created_at DESC 
LIMIT 5;
```

### 4. 启用详细日志

在后端添加更多日志：

```python
# lib/docmind-ai/api/document_routes.py
import logging
logger = logging.getLogger(__name__)

@router.get("/{document_id}/conversations", response_model=ConversationHistory)
async def get_conversation_history(...):
    logger.info(f"Getting conversations for document: {document_id}")
    messages = db.get_conversation_history(document_id, limit=limit)
    logger.info(f"Found {len(messages)} messages")
    # ...
```

## 获取帮助

如果问题仍未解决，请提供以下信息：

1. **错误信息**：浏览器控制台的完整错误
2. **网络请求**：失败的API请求详情（状态码、响应）
3. **环境信息**：
   - 浏览器版本
   - 后端Python版本
   - API端点配置
4. **复现步骤**：如何触发这个问题

## 相关文档

- [对话信息增强功能](CONVERSATION_FIELDS_ENHANCEMENT.md)
- [使用指南](CONVERSATION_DEBUG_GUIDE.md)
- [快速开始](CONVERSATION_DEBUG_QUICKSTART.md)
