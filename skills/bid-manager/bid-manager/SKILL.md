---
name: bid-manager
description: >
  投标全流程管理器。编排所有 bid skills 按流水线自动执行，支持一键投标、
  断点续跑、指定阶段启动。10个阶段：分析→核实→信息收集→商务标→技术标→
  图表→扫描件→质检→自动修复→生成Word。
  当用户要求一键投标、全流程投标、管理投标进度、继续投标流程时触发。
  前置条件：需要有招标/磋商/采购文件。
---

# 投标全流程管理器

## 核心功能

编排所有 bid skills 按 10 阶段流水线自动执行，提供统一的进度管理、断点续跑和自动修复能力。

## 流水线阶段

```
S1:分析 → S2:核实 → S3:信息收集 → S4:商务标 → S5:技术标
→ S6:图表 → S7:扫描件 → S8:质检 → S9:自动修复 → S10:生成Word
```

| 阶段 | 名称 | 调用 Skill | 说明 | 需用户交互 |
|------|------|-----------|------|-----------|
| S1 | 分析 | bid-analysis | 分析招标文件，生成 `分析报告.md` | 否 |
| S2 | 核实 | bid-verification | 核实分析报告，自动修正错误 | 否 |
| S3 | 信息收集 | （人工交互） | 收集公司信息、报价决策 | **是** |
| S4 | 商务标 | bid-commercial-proposal | 编写商务标全部附件 | 否（自动模式） |
| S5 | 技术标 | bid-tech-proposal | 编写技术标全部文件 | 否（自动模式） |
| S6 | 图表 | bid-mermaid-diagrams | 生成并替换图表占位符 | 否 |
| S7 | 扫描件 | bid-material-search | 批量替换扫描件占位符 | 否 |
| S8 | 质检 | bid-assembly | 全面质检，生成核对报告 | 否 |
| S9 | 自动修复 | bid-tech/commercial-proposal | 根据质检结果分派修复 | 否 |
| S10 | 生成Word | bid-md2doc | 转换为最终 Word 文档 | 否 |

## 进度管理

### 进度文件

每次流程启动时创建/更新 `pipeline_progress.json`：

```json
{
  "project_name": "XXX项目",
  "started_at": "2025-01-15T10:00:00",
  "updated_at": "2025-01-15T14:30:00",
  "current_stage": "S5",
  "stages": {
    "S1": { "status": "completed", "started_at": "...", "completed_at": "...", "output": "分析报告.md" },
    "S2": { "status": "completed", "started_at": "...", "completed_at": "...", "output": "核实报告.md" },
    "S3": { "status": "completed", "started_at": "...", "completed_at": "...", "note": "用户已确认公司信息和报价" },
    "S4": { "status": "completed", "started_at": "...", "completed_at": "...", "output": "响应文件/01-*.md ~ 14-*.md", "file_count": 14 },
    "S5": { "status": "in_progress", "started_at": "..." },
    "S6": { "status": "pending" },
    "S7": { "status": "pending" },
    "S8": { "status": "pending" },
    "S9": { "status": "pending" },
    "S10": { "status": "pending" }
  },
  "company_info": {
    "name": "XXX公司",
    "credit_code": "...",
    "legal_person": "...",
    "bid_price": "..."
  },
  "fix_rounds": 0
}
```

### 断点续跑

读取 `pipeline_progress.json`，从上次中断的阶段继续：
- `completed` 阶段跳过
- `in_progress` 阶段重新执行
- `pending` 阶段按顺序执行

## 启动模式

### 一键投标（全流程）

用户说："一键投标" / "全流程投标" / "开始投标"

1. 检查是否有招标文件（PDF/Word）
2. 创建 `pipeline_progress.json`
3. 从 S1 开始依次执行

### 继续（断点续跑）

用户说："继续" / "继续投标" / "接着上次"

1. 读取 `pipeline_progress.json`
2. 找到第一个非 `completed` 阶段
3. 从该阶段继续

### 指定阶段启动

用户说："从技术标开始" / "从S5开始" / "只做质检"

1. 读取或创建 `pipeline_progress.json`
2. 将指定阶段之前的阶段标记为 `completed`（假设已完成）
3. 从指定阶段开始执行
4. 如果前置依赖不满足（如缺少分析报告），提示用户

## 各阶段详细流程

### S1: 分析

```
输入: 招标文件 (PDF/Word)
输出: 分析报告.md
调用: bid-analysis
```

- 执行 bid-analysis 的完整工作流程
- 完成后解析状态摘要，记录项目名称、评分结构等
- 更新 `pipeline_progress.json`

### S2: 核实

```
输入: 分析报告.md + 原始招标文件
输出: 核实报告.md（+ 自动修正的分析报告.md）
调用: bid-verification
```

- 执行 bid-verification 核实流程
- 如有错误自动修正分析报告
- 更新进度

### S3: 信息收集（必须暂停）

```
输入: 分析报告.md（提取所需字段）
输出: 公司信息 + 报价决策（写入 pipeline_progress.json）
交互: 必须等待用户输入
```

**此阶段必须暂停等待用户输入。** 根据分析报告中的要求，向用户收集：

1. **公司基本信息**：名称、信用代码、地址、法人信息
2. **授权代表信息**（如需要）
3. **报价决策**：报价金额（必须用户确认，不可自动决定）
4. **业绩清单**（如评分中有业绩项）
5. **人员配备**（如评分中有人员项）
6. **资质证书**（如评分中有资质项）

收集完成后，将所有信息写入 `pipeline_progress.json` 的 `company_info` 字段。

### S4: 商务标

```
输入: 分析报告.md + company_info
输出: 响应文件/01-*.md ~ NN-*.md
调用: bid-commercial-proposal (AUTO_MODE=true)
```

- 在上下文中设置 `AUTO_MODE=true`
- 将 `company_info` 注入上下文
- 执行 bid-commercial-proposal 的完整编写流程
- 跳过信息收集步骤（使用预置信息）

### S5: 技术标

```
输入: 分析报告.md
输出: 响应文件/NN-*.md（技术文件）
调用: bid-tech-proposal (AUTO_MODE=true)
```

- 在上下文中设置 `AUTO_MODE=true`
- 执行 bid-tech-proposal 的完整编写流程
- 跳过文件规划确认步骤

### S6: 图表

```
输入: 响应文件/*.md（含图表占位符）
输出: 响应文件/diagram-*.png + 更新后的 .md 文件
调用: bid-mermaid-diagrams
```

- 扫描所有技术文件中的 `【此处插入XX图】` 占位符
- 逐个生成 Mermaid 图并渲染为 PNG
- 替换占位符为图片引用

### S7: 扫描件

```
输入: 响应文件/*.md（含扫描件占位符）+ 资料库
输出: 响应文件中的占位符替换为图片引用
调用: bid-material-search（批量替换模式）
前置: 需要资料库（pages/ + index.json）
```

- 如果资料库不存在，提示用户并跳过此阶段
- 如果存在，启动检索服务并执行批量替换
- 记录替换统计

### S8: 质检

```
输入: 分析报告.md + 响应文件/*.md
输出: 响应文件/核对报告.md + 00-目录.md + 装订指南.md
调用: bid-assembly
```

- 执行完整质检流程
- 解析核对报告末尾的 JSON 摘要
- 如果 `red_count == 0`，跳过 S9，直接进入 S10
- 如果 `red_count > 0`，进入 S9

### S9: 自动修复（最多2轮）

```
输入: 核对报告.md 中的 ASSEMBLY_SUMMARY JSON
输出: 修复后的 响应文件/*.md
调用: bid-tech-proposal / bid-commercial-proposal（修复模式）
```

修复循环：

1. 解析 `ASSEMBLY_SUMMARY` JSON，提取 `red_issues` 和 `yellow_issues`
2. 按 `target_skill` 分组：
   - `bid-tech-proposal` 类问题 → 调用 bid-tech-proposal 修复模式
   - `bid-commercial-proposal` 类问题 → 调用 bid-commercial-proposal 修复模式
3. 修复完成后，重新执行 S8 质检
4. 如果仍有 🔴 问题且修复轮次 < 2，再次修复
5. 如果修复轮次 >= 2 仍有问题，输出剩余问题清单，建议人工处理
6. 更新 `pipeline_progress.json` 中的 `fix_rounds`

### S10: 生成Word

```
输入: 响应文件/*.md
输出: 响应文件/响应文件-{公司}-{项目}.docx
调用: bid-md2doc
```

- 执行 bid-md2doc 完整流程
- 报告最终文件路径和大小

## 进度展示

每个阶段开始和结束时输出状态行：

```
========================================
[S1/10] 📋 分析 — 开始
========================================

... (skill 执行输出) ...

========================================
[S1/10] ✅ 分析 — 完成
  输出: 分析报告.md
  项目: XXX项目 | 预算: XXX万元 | 附件: N个
========================================

========================================
[S2/10] 🔍 核实 — 开始
========================================
```

最终汇总：

```
========================================
投标流程完成！
========================================
项目: XXX项目
公司: XXX公司
报价: XXX万元

输出文件:
  📄 响应文件/响应文件-XX-XX.docx (XXX KB)
  📊 分析报告.md
  ✅ 核对报告.md (🔴0 🟡N 🔵N)

统计:
  商务文件: N 个
  技术文件: N 个
  图表: N 张
  扫描件替换: N 处

质检修复: N 轮
耗时阶段: S1-S10
========================================
```

## 错误处理

- **Skill 执行失败**：记录错误，更新进度为 `failed`，提示用户
- **前置依赖缺失**：如缺少分析报告但要执行 S4，提示用户先完成 S1
- **资料库不存在**：S7 跳过并提示，不阻塞后续阶段
- **修复循环超限**：S9 超过2轮后输出剩余问题，继续 S10

## 完成状态

全流程完成后，输出以下结构化状态摘要：

```
--- BID-MANAGER COMPLETE ---
项目名称: {项目名称}
公司名称: {公司名称}
报价金额: {金额}
完成阶段: S1-S10
修复轮次: {N}
输出文件: {docx文件路径}
文件大小: {KB}
状态: SUCCESS
--- END ---
```
