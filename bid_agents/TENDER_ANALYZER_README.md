# Tender Analyzer Agent - 招标文件分析Agent

## 概述

基于项目已有的完整TOC（目录结构）优势，结合bid-analysis skill的设计亮点，构建的深度招标文件分析Agent。

## 设计亮点

### 1. 利用完整TOC优势
- **TOC作为导航**：自动识别文档结构，定位关键章节
- **精准提取**：基于目录层级关系，准确找到评分标准、商务条款、技术需求
- **完整性校验**：确保提取的章节与TOC一致，无遗漏

### 2. 继承分析Skill核心原则
- **引用原文**：关键数据必须逐字提取，不得概括
- **数据验证**：评分分值计算验证、关键数据交叉验证
- **结构化输出**：标准化的分析报告格式

### 3. 新增工具函数
- `validate_scoring_criteria` - 自动验证评分标准分值计算
- `extract_key_data` - 从章节提取关键数据点
- `save_analysis_report` - 保存结构化分析报告

## 文件结构

```
bid_agents/
├── agents/
│   ├── definitions.py          # 注册 tender-analyzer agent
│   └── prompts/
│       └── tender_analyzer.py  # 分析agent的系统prompt
├── tools/
│   ├── analysis_tools.py       # 分析相关MCP工具
│   └── server.py               # 注册新工具到MCP server
├── state/
│   └── project_state.py        # 添加 analysis_report 状态字段
├── tool_adapters.py            # 添加 build_tender_analyzer_tools
├── analysis_pipeline.py        # 分析工作流封装
└── config.py                   # 添加 ANALYZER_MODEL 配置
```

## 使用方式

### 方式一：Pipeline调用

```python
from bid_agents.analysis_pipeline import run_analysis_pipeline

report = await run_analysis_pipeline(
    project_id="project-xxx",
    api_url="http://localhost:8003",
    progress_callback=lambda phase, msg: print(f"{phase}: {msg}")
)
```

### 方式二：Agent直接调用

```python
from bid_agents.agent_runner import create_deepseek_agent
from bid_agents.agents.prompts import tender_analyzer
from bid_agents.tool_adapters import build_tender_analyzer_tools

# 构建工具
analysis_tools = build_tender_analyzer_tools(state, api_client)

# 创建agent
analyzer = create_deepseek_agent(
    name="tender-analyzer",
    system_prompt=tender_analyzer.SYSTEM_PROMPT,
    tools=analysis_tools,
    tool_call_limit=20
)

# 运行分析
result = await analyzer.arun("请深度分析项目xxx的招标文件...")
```

## 工作流程

1. **获取TOC并规划**
   - 调用 `get_tender_tree` 获取完整目录结构
   - 分析章节层级，标记关键章节位置

2. **逐章节深入分析**
   - 第一优先级：评分标准、供应商须知、资格要求、技术需求
   - 第二优先级：招标公告、合同条款、响应文件格式

3. **数据提取与验证**
   - 评分分值验证（子项之和=大类分值，大类之和=100分）
   - 关键数据交叉验证（预算、编号、截止时间等）

4. **输出结构化报告**
   - 项目概况、资格要求、评分标准、技术需求、商务要求
   - 响应文件组成、合规注意事项、风险提示、评分策略建议

## 分析报告结构

```json
{
  "项目概况": {
    "项目名称": "xxx",
    "预算金额": "xxx",
    "采购方式": "竞争性磋商",
    "截止时间": "2025-xx-xx"
  },
  "资格要求": {
    "一般资格条件": [...],
    "特定资格条件": [...],
    "负面清单": [...]
  },
  "评分标准": {
    "categories": [...],
    "验证结果": "通过"
  },
  "技术需求": {
    "功能需求": [...],
    "技术参数": [...]
  },
  "商务要求": {
    "交付期": "xxx",
    "付款方式": "xxx",
    "质保期": "xxx"
  },
  "响应文件组成": [...],
  "合规注意事项": [...],
  "风险提示": [...],
  "评分策略建议": [...],
  "_metadata": {
    "created_at": "2025-02-12T...",
    "version": "1.0"
  }
}
```

## 与现有Agent的关系

```
Phase -1: tender-analyzer (新增)
          ↓ 生成分析报告
Phase 0:  format-extractor
          ↓
Phase 1:  outline-planner
          ↓
Phase 2:  document-finder
          ↓
Phase 3:  commercial-bid-writer / technical-bid-writer
          ↓
Phase 4:  review-agent / compliance-checker
          ↓
Phase 6:  formatting-agent
```

tender-analyzer位于Phase -1，作为整个投标流程的起点，为后续所有agent提供结构化的招标信息。

## 优势对比

| 特性 | format-extractor | tender-analyzer |
|------|------------------|-----------------|
| 主要功能 | 提取投标格式要求 | 深度分析所有招标信息 |
| TOC利用 | 浏览结构 | 深度利用，精准定位 |
| 数据验证 | 无 | 评分验证、交叉验证 |
| 输出 | format_spec | 完整分析报告 |
| 定位 | Phase 0 | Phase -1 (前置分析) |

## 后续优化方向

1. **与写作Agent集成**：让写作agent自动读取分析报告作为上下文
2. **智能章节推荐**：基于分析报告，自动推荐需要重点撰写的章节
3. **风险提示增强**：基于历史投标数据，识别高风险条款
4. **多文档对比**：支持多个类似项目招标文件的对比分析
