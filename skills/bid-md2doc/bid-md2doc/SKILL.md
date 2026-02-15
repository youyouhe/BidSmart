---
name: bid-md2doc
description: >
  将 响应文件/ 目录下的 Markdown 文件转换为格式化的 Word (.docx) 文档。
  自动从分析报告和商务文件中读取项目名称、公司名称等信息，
  编辑 generate_docx.js 的 CONFIG 区域，然后运行脚本生成 Word 文件。
  当用户要求生成Word文档、转换MD为docx、导出响应文件时触发。
  前置条件：响应文件/ 目录下已有编写完成的 .md 文件。
---

# MD 转 Word 文档

## 核心功能

将 `响应文件/` 目录下的 Markdown 文件合并转换为一个格式化的 Word (.docx) 文档，
支持标题层级、表格、图片嵌入、页眉页脚、分页等。

## 工作流程

### 1. 读取项目信息

#### 1.1 从分析报告读取项目名称

```python
# 读取 分析报告.md，提取项目名称
# 通常在 "## 项目概况" 章节的 "项目名称" 行
```

提取字段：
- **项目名称**：用于页眉文字和输出文件名
- **采购编号**：可选，用于页眉补充信息

#### 1.2 从商务文件读取公司名称

扫描 `响应文件/` 目录下的文件（如报价函、封面等），提取公司全称：

```python
# 在已编写的商务文件中搜索公司名称
# 通常在报价函或封面文件的签章区域
```

提取字段：
- **公司全称**：用于页脚

### 2. 编辑 generate_docx.js 配置

编辑 `/home/tiger/bid/generate_docx.js` 顶部的 CONFIG 区域（位于 `// === CONFIG START ===` 和 `// === CONFIG END ===` 之间）：

```javascript
const CONFIG = {
  inputDir: '/home/tiger/bid/响应文件',
  outputFile: '响应文件-{公司简称}-{项目简称}.docx',
  headerText: '{项目全称} 响应文件',
  footerCompany: '{公司全称}',
  excludeFiles: ['核对报告.md', '装订指南.md'],
};
```

字段填写规则：
- `inputDir`：保持为 `响应文件/` 的绝对路径
- `outputFile`：格式为 `响应文件-{公司简称}-{项目简称}.docx`
- `headerText`：`{项目全称} 响应文件`
- `footerCompany`：公司全称
- `excludeFiles`：固定排除 `核对报告.md` 和 `装订指南.md`，如用户指定额外排除文件则追加

### 3. 运行生成脚本

```bash
cd /home/tiger/bid && node generate_docx.js
```

### 4. 报告生成结果

输出以下信息：
- 生成的 .docx 文件路径和大小
- 处理的 Markdown 文件数量
- 嵌入的图片数量
- 排除的文件列表

## 排除规则

以下文件不转换为 Word：
- `核对报告.md` — 内部质检文件，不进入最终文档
- `装订指南.md` — 内部参考文件，不进入最终文档
- 用户指定的其他排除文件

## 图片处理

generate_docx.js 支持 Markdown 图片语法 `![alt](file.png)`：
- 自动读取图片文件并嵌入 Word
- 图片宽度不超过页面内容区（约15cm），高度按比例缩放
- 支持 PNG 和 JPEG 格式
- 图片不存在时插入红色 `[图片缺失: filename]` 占位文字

## 注意事项

- 运行前确认 `响应文件/` 目录存在且有 .md 文件
- 确认 `docx` npm 包已安装（`node_modules/docx`）
- CONFIG 编辑仅修改 `CONFIG START` 和 `CONFIG END` 之间的内容，不改动其他代码
- 如果生成失败，检查控制台错误信息并修复（常见：图片路径错误、特殊字符导致表格解析失败）

## 完成状态

生成完成后，输出以下结构化状态摘要：

```
--- BID-MD2DOC COMPLETE ---
输出文件: {文件路径}
文件大小: {KB}
MD文件数: {N}
图片数: {N}
排除文件: {核对报告.md, 装订指南.md, ...}
状态: SUCCESS
--- END ---
```
