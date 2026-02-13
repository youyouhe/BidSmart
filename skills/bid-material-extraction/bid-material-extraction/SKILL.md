---
name: bid-material-extraction
description: >
  从投标/响应文件中提取可复用资料。三步流水线：
  (1) 提取文档目录 → toc.json
  (2) LLM 判断哪些章节需要提取 → extraction_plan.json
  (3) 按计划提取文本和图片 → 文件系统
  当用户需要从已有投标文件中提取资料建立复用库时触发。
  提取完成后，检索服务由 bid-material-search skill 提供。
---

# 投标资料提取

## 核心思路

投标文件自带目录。用目录做路线图，让 LLM 判断哪些是可复用的中立资料，然后定向提取。

不做格式依赖的表格分类 — 换一个文件不需要改代码。

## 依赖

- Python: python-docx (`docx`)
- Python: PyMuPDF (`fitz`)（仅 PDF 图片提取时需要）

## 三步流程

### Step 1: 提取目录

```bash
python scripts/extract_toc.py <docx_path> --output toc.json
```

脚本自动识别 Word 文档的目录（TOC），输出结构化 JSON：

```json
{
  "entries": [
    {"number": "一、", "title": "报价部分", "page": 4, "level": 1, "part": "报价部分"},
    {"number": "1",    "title": "报价函",   "page": 4, "level": 2, "part": "报价部分"},
    {"number": "10",   "title": "供应商基本情况表", "page": 20, "level": 2, "part": "商务部分"},
    {"number": "10.1", "title": "营业执照", "page": 21, "level": 3, "part": "商务部分"}
  ]
}
```

三种策略自动降级：TOC 样式 → "目录"标题后解析 → 扫描正文标题。

### Step 2: LLM 判断提取范围

读取 `toc.json`，按以下规则决定每个章节是否提取：

#### 提取（中立/可复用数据）

| 类别 | 典型章节 | 提取方式 |
|------|---------|---------|
| **公司信息** | 供应商基本情况表 | text |
| **资质证书** | 营业执照、管理体系证书、ISO、CMMI | image |
| **人员信息** | 项目负责人情况表、团队成员（每人） | text + image |
| **人员证件** | 身份证、学历证明、资格证、社保证明 | image |
| **业绩** | 业绩汇总表、各项目合同/中标通知 | text + image |
| **声明模板** | 法定代表人资格证明书、授权书（格式参考） | text |

#### 跳过（项目特定，不可复用）

| 类别 | 典型章节 | 原因 |
|------|---------|------|
| 报价 | 报价函、报价明细 | 金额项目特定 |
| 技术方案 | 技术方案、实施方案、服务方案 | 按项目需求编写 |
| 差异表 | 技术差异表、商务差异表 | 项目特定 |
| 承诺书 | 诚信承诺、廉洁承诺、保密承诺 | 内容通用但填写了项目特定信息 |
| 进度计划 | 组织保障、进度保障 | 项目特定 |

#### 输出 extraction_plan.json

```json
{
  "source": "响应文件-琪信通达.docx",
  "extractions": [
    {
      "number": "10",
      "title": "供应商基本情况表",
      "extract_text": true,
      "extract_images": false,
      "category": "company",
      "output_name": "供应商基本情况表"
    },
    {
      "number": "10.1",
      "title": "营业执照",
      "extract_text": false,
      "extract_images": true,
      "category": "qualification",
      "output_name": "营业执照"
    },
    {
      "number": "12.1",
      "title": "吴良伟",
      "extract_text": true,
      "extract_images": true,
      "category": "personnel",
      "output_name": "吴良伟"
    },
    {
      "number": "13",
      "title": "业绩汇总表",
      "extract_text": true,
      "extract_images": false,
      "category": "performance",
      "output_name": "业绩汇总表"
    },
    {
      "number": "13.1",
      "title": "交信投车载定位装置维护技术服务项目",
      "extract_text": false,
      "extract_images": true,
      "category": "performance",
      "output_name": "交信投项目"
    }
  ]
}
```

字段说明：
- `number` / `title`: 对应 toc.json 中的编号和标题
- `extract_text`: 是否提取该章节的文字内容（段落+表格→ .txt）
- `extract_images`: 是否提取该章节的嵌入图片（证书/合同扫描件→ .png/.jpg）
- `category`: 分类标签，用于文件组织
- `output_name`: 输出文件名基础（可缩短长标题）

#### 粒度选择

- 想要某章节连同所有子章节一起提取 → 只写父章节编号（如 `"10"` 包含 10.1、10.2）
- 想要每个子章节独立提取 → 分别列出每个子编号（如 `"10.1"`, `"10.2"`）
- 一般做法：**汇总表取 text，子章节取 image**

### Step 3: 按计划提取

```bash
python scripts/extract_sections.py <docx_path> --plan extraction_plan.json --output-dir data/
```

脚本按计划依次定位每个章节，提取文本和/或图片，保存为独立文件。

输出文件命名：`{编号}-{标题}.txt` 或 `{编号}-{标题}.png`

```
data/
  10-供应商基本情况表.txt
  10.1-营业执照.png
  10.2-企业管理体系-01.png
  10.2-企业管理体系-02.png
  11-项目负责人情况表.txt
  12-团队成员汇总表.txt
  12.1-吴良伟.txt
  12.1-吴良伟-01.png
  13-业绩汇总表.txt
  13.1-交信投项目-01.png
  13.1-交信投项目-02.png
  manifest.json
```

`manifest.json` 记录提取结果（每个章节的文件列表），供后续检索使用。

## PDF 图片提取（补充模式）

如果投标文件只有 PDF（无 Word），或需要更高质量的扫描件图片：

```bash
python scripts/extract_images.py <pdf_path> --output-dir pages --index index.json
```

此模式使用 PyMuPDF 直接从 PDF 提取图片，按章节编号归类，生成 `index.json` 索引。
与 Word 提取互补：PDF 出图更清晰，Word 出文本更准确。

## 注意事项

- **图片在标题之后**：嵌入图片（证书/合同扫描件）通常紧跟在该章节标题后面，可能是一张或多张
- **图片最小尺寸**：自动过滤 < 5KB 的小图（印章、图标、装饰线）
- **EMF/WMF 跳过**：Windows 矢量格式不提取，只提取 PNG/JPEG/GIF/BMP
- **目录缺失时**：脚本自动降级为扫描正文标题，但提取精度会下降
- **合并单元格**：python-docx 中合并单元格会重复出现，提取时自动去重
- **没有的东西就算了**：如果某个章节在正文中找不到对应标题，跳过并警告，不中断流程
