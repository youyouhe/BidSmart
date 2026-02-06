# 核心算法分析与优化方案

**分析日期**: 2026-02-07  
**文档ID参考**: 7ebf7085-423e-4d70-a3fe-2e8cdd98993b  
**问题文档**: 台州第一技师学院车铣复合机床采购招标文件

---

## 🔍 核心算法分析

### 总体架构流程

```
Phase 1: PDF解析（懒加载，初始30页）
    ↓
Phase 2: TOC检测
    ├─ 嵌入式TOC提取（优先）
    └─ 文本TOC检测（回退）
    ↓
Phase 3: TOC结构提取
    ↓
Phase 4: 页码映射
    ↓
Phase 5: 验证与修复
    ↓
Phase 6: 树构建
    ↓
Phase 6a: 递归大节点处理 ⚠️ **核心问题所在**
    ↓
Phase 6.5: 标题规范化
    ↓
Phase 7: 缺口填补
```

---

## 🔴 发现的核心问题

### 问题1: 嵌入式TOC转换时的章节识别不足 ⚠️⚠️

**位置**: `main.py::_convert_embedded_toc_to_structure()` (L996-1074)

**当前逻辑**:
```python
def _is_chapter_title(self, title: str) -> bool:
    # Pattern 1: 第X章 (Chinese numeral or digit)
    if re.match(r'^第[一二三四五六七八九十0-9]+章', title):
        return True
    # Pattern 2: Chapter X / CHAPTER X (English)
    if re.match(r'^(?:chapter|CHAPTER)\s*[0-9IVX]+', title, re.IGNORECASE):
        return True
    return False
```

**问题**:
- ✅ 能识别："第一章"、"第2章"、"Chapter 1"
- ❌ 不能识别："1 / 前言"、"2 投标人须知"、"3 技术、商务偏离表"
- ❌ 导致：编号风格不一致的章节无法被统一为L1

**测试案例**:
```
实际PDF中的章节:
- "1 / 前言"  ❌ 不匹配章节模式
- "2 投标人须知"  ❌ 不匹配
- "第三章 评标办法及评分标准"  ✅ 匹配
- "第四章 采购需求"  ✅ 匹配
- "第五章 合同文本"  ✅ 匹配
- "第六章 投标文件格式附件"  ✅ 匹配

结果: 前两章未被识别为章节，导致层级混乱
```

---

### 问题2: 递归大节点处理缺少上下文约束 ⚠️⚠️⚠️

**位置**: `main.py::_process_large_node_recursively()` (L1169-1309)

**当前逻辑**:
```python
async def _process_large_node_recursively(self, node: Dict, all_pages: List[PDFPage]):
    # ... 检查节点大小 ...
    
    # 提取子结构
    parent_context = {
        'structure': node.get('structure', ''),
        'title': node.get('title', '')
    }
    sub_structure = await self._generate_structure_from_content(node_pages, parent_context=parent_context)
    
    # ❌ 问题：没有传递父节点的level信息
    # ❌ 问题：没有限制子节点的最大level
    # ❌ 问题：子节点可能被LLM错误识别为顶层章节
```

**问题分析**:

1. **缺少层级约束**:
   ```python
   # 当前代码中，parent_context只包含:
   parent_context = {
       'structure': '4',  # 例如"第四章"
       'title': '第四章 采购需求'
   }
   
   # 缺少:
   # - parent_level: 1  （父节点的层级）
   # - max_child_level: 2  （子节点允许的最大层级）
   ```

2. **LLM提示词不明确**:
   ```python
   # 在_extract_structure_from_segment中的提示词：
   system_prompt = f"""
   ...
   Structure code rules:
   - Level 1: "1", "2", "3" (major chapters/parts)  ❌ 没有说明这是在子节点上下文中
   - Level 2: "1.1", "1.2", "2.1" (sections within chapters)
   ...
   Maximum depth: {self.opt.max_depth}  ❌ 这是全局深度，不是相对父节点的深度
   """
   
   # 结果：LLM看到"车铣复合机床技术参数及要求"时，认为是Level 1
   ```

3. **实际执行流程**:
   ```
   递归处理"第四章 采购需求" (L1, structure="4", pages=27-29, 大节点)
      ↓
   调用_generate_structure_from_content分析p27-29
      ↓
   LLM看到以下内容：
      "二、货物技术参数及要求
       车铣复合机床技术参数及要求
         主轴轴承
         刀塔
         铣削主轴
         ..."
      ↓
   LLM判断（❌错误）：
      - "车铣复合机床技术参数及要求" 是主要章节 → structure="1" (L1)
      - "数控编程软件及后处理程序" 是主要章节 → structure="2" (L1)
      - "车铣仿真软件" 是主要章节 → structure="3" (L1)
      ↓
   结果：这些L1节点被添加到树的根层级，而不是作为"第四章"的子节点
   ```

---

### 问题3: 树构建器不验证层级一致性 ⚠️⚠️

**位置**: `tree_builder.py::build_tree()` (L29-102)

**当前逻辑**:
```python
def build_tree(self, structure: List[Dict], pages: List) -> List[Dict]:
    # Step 1: 过滤已验证项
    verified = [s for s in structure if s.get('verification_passed', True)]
    
    # Step 2: 添加list索引
    for i, item in enumerate(verified):
        item['list_index'] = i
    
    # Step 3: 转换为树
    tree = list_to_tree(verified)
    
    # Step 4: 验证深度（只验证深度，不验证编号逻辑）
    is_valid, errors = validate_structure_depth(tree, self.max_depth)
    
    # ❌ 缺少：验证同级节点编号是否升序
    # ❌ 缺少：验证"第X章"是否都在L1
    # ❌ 缺少：验证页码是否递增
```

**问题**:
- 只验证深度限制（≤4层）
- 不验证章节编号的连续性（1→2→3→4...）
- 不验证同级节点的编号升序
- 不验证章节类型的层级一致性

---

### 问题4: 页码映射时的层级推断错误 ⚠️

**位置**: 从debug日志推测，在Phase 4页码映射时

**推测问题**:
```
"第四章 采购需求" 页码范围：27-29
"2 投标人须知" 页码范围：6-26

当前逻辑可能：
- 检测到"第四章"的第一次出现在p26（目录中）
- 而p26仍属于"2 投标人须知"的范围（6-26）
- 错误推断："第四章"是"第二章"的子节点

实际应该：
- "第四章"的内容从p27开始
- 应该是独立的L1节点
```

---

## 💡 优化方案

### 方案1: 增强章节识别模式（高优先级）

**目标**: 识别所有常见的章节标题格式

**修改位置**: `main.py::_is_chapter_title()`

**实施方案**:
```python
def _is_chapter_title(self, title: str) -> bool:
    """
    检测标题是否为章节。
    
    支持的章节格式:
    1. "第X章" (中文)
    2. "Chapter X" (英文)
    3. "数字 / 标题" (如 "1 / 前言")
    4. "数字 标题" (如 "2 投标人须知")
    5. "第X部分" / "第X节"
    """
    import re
    
    # Pattern 1: 第X章/第X部分/第X节
    if re.match(r'^第[一二三四五六七八九十百0-9]+[章部节]', title):
        return True
    
    # Pattern 2: Chapter X / Part X / Section X
    if re.match(r'^(?:chapter|part|section)\s*[0-9IVX]+', title, re.IGNORECASE):
        return True
    
    # Pattern 3: "数字 / 标题" (如 "1 / 前言")
    if re.match(r'^[0-9]{1,2}\s*/\s*.+', title):
        return True
    
    # Pattern 4: "数字 标题" (开头是1-2位数字+空格，且后面有文字)
    # 注意：要求至少2个汉字或3个字符，避免误判如"3.1 xxx"
    if re.match(r'^[0-9]{1,2}\s+[\u4e00-\u9fa5]{2,}', title):
        return True
    
    # Pattern 5: 罗马数字开头 (I, II, III, IV, V)
    if re.match(r'^[IVX]{1,5}[\s\.。、]+.+', title, re.IGNORECASE):
        return True
    
    return False
```

**预期效果**:
```
测试用例:
✅ "第一章 招标公告"
✅ "第2章 投标人须知"
✅ "1 / 前言"
✅ "2 投标人须知"
✅ "Chapter 1 Introduction"
✅ "第一部分 总则"
❌ "1.1 子章节"  (不是章节)
❌ "一、采购内容"  (这是section，不是chapter)
```

---

### 方案2: 递归处理时传递层级约束（高优先级）⚠️⚠️⚠️

**目标**: 防止子内容被错误提升为顶层节点

**修改位置**: 
1. `main.py::_process_large_node_recursively()` (L1169)
2. `main.py::_extract_structure_from_segment()` (L799)

**实施方案**:

#### 2.1 修改递归函数，传递层级信息

```python
async def _process_large_node_recursively(
    self,
    node: Dict,
    all_pages: List[PDFPage],
    parent_level: int = 0  # 新增：父节点层级
) -> Dict:
    """
    递归处理大节点
    
    Args:
        node: 当前节点
        all_pages: 所有页面
        parent_level: 父节点的层级（0表示根层级）
    """
    # ... 现有代码 ...
    
    # 提取子结构时，传递层级约束
    parent_context = {
        'structure': node.get('structure', ''),
        'title': node.get('title', ''),
        'level': node.get('level', parent_level + 1),  # 新增
        'max_child_level': self.opt.max_depth - (parent_level + 1)  # 新增：子节点最大相对深度
    }
    
    sub_structure = await self._generate_structure_from_content(
        node_pages, 
        parent_context=parent_context
    )
    
    # ... 现有代码 ...
    
    # 递归处理子节点时，传递新的parent_level
    if node['nodes']:
        tasks = [
            self._process_large_node_recursively(
                child, 
                all_pages,
                parent_level=parent_level + 1  # 新增
            )
            for child in node['nodes']
        ]
        node['nodes'] = await asyncio.gather(*tasks)
    
    return node
```

#### 2.2 修改LLM提示词，明确层级约束

```python
async def _extract_structure_from_segment(
    self, 
    segment: dict,
    existing_structure: list,
    segment_index: int = 1,
    parent_context: dict = None
) -> list:
    """提取segment的结构"""
    
    # 构建上下文说明
    context_instruction = ""
    min_level = 1  # 默认最小level
    
    if parent_context:
        parent_struct = parent_context.get('structure', '')
        parent_title = parent_context.get('title', 'parent section')
        parent_level = parent_context.get('level', 0)
        max_child_level = parent_context.get('max_child_level', self.opt.max_depth - 1)
        
        min_level = parent_level + 1  # 子节点至少是parent_level + 1
        
        context_instruction = f"""
        
        ⚠️ **CRITICAL CONTEXT - Subsection Analysis**:
        
        You are analyzing content WITHIN a parent section:
        - Parent title: "{parent_title}"
        - Parent structure: "{parent_struct}"
        - Parent level: {parent_level}
        
        **IMPORTANT CONSTRAINTS**:
        1. ALL extracted items must be CHILDREN of the parent section
        2. Minimum level for extracted items: Level {min_level}
        3. Maximum level for extracted items: Level {min_level + max_child_level}
        4. DO NOT extract items as Level 1 unless they are truly document-wide chapters
        
        **Structure codes for children**:
        - Use "{parent_struct}.1", "{parent_struct}.2", "{parent_struct}.3" for direct children
        - Use "{parent_struct}.1.1", "{parent_struct}.1.2" for nested children
        
        **Example**: 
        Parent: "第四章 采购需求" (structure="4", level=1)
        Valid children:
          ✅ "4.1" or "二、" → "货物技术参数" (Level 2)
          ✅ "4.1.1" or "2.1" → "车铣复合机床参数" (Level 3)
        Invalid:
          ❌ "1" → "车铣复合机床参数" (Level 1 - would be a sibling of parent!)
        """
    
    system_prompt = f"""
    Analyze the document content and extract its hierarchical structure.
    {context_instruction}
    
    ⚠️ **CRITICAL RULE - Title Text Integrity**:
    ...（保持现有内容）...
    
    ⚠️ **CRITICAL RULE - Level Constraints**:
    - Extracted items must start at Level {min_level} or deeper
    - DO NOT extract Level 1 items unless you are analyzing the ENTIRE document (no parent context)
    - When in doubt, check the parent context instruction above
    
    ... (其余提示词保持不变) ...
    """
    
    # ... 其余代码保持不变 ...
```

---

### 方案3: 添加后处理验证器（中优先级）

**目标**: 在树构建后验证常识性规则

**新增文件**: `pageindex_v2/utils/tree_validator.py`

**实施方案**:

```python
"""
Tree Validator - 验证树结构的常识性规则
"""
from typing import List, Dict, Tuple
import re

class TreeValidator:
    """验证树结构的逻辑一致性"""
    
    def __init__(self, debug: bool = False):
        self.debug = debug
    
    def validate_tree(self, tree: List[Dict]) -> Tuple[bool, List[str]]:
        """
        验证树结构
        
        Returns:
            (is_valid, errors): 布尔值和错误列表
        """
        errors = []
        
        # 规则1: 章节编号连续性
        chapter_errors = self._validate_chapter_sequence(tree)
        errors.extend(chapter_errors)
        
        # 规则2: 页码递增
        page_errors = self._validate_page_order(tree)
        errors.extend(page_errors)
        
        # 规则3: 同级节点编号升序
        numbering_errors = self._validate_numbering_order(tree)
        errors.extend(numbering_errors)
        
        # 规则4: 章节层级一致性
        level_errors = self._validate_chapter_levels(tree)
        errors.extend(level_errors)
        
        is_valid = len(errors) == 0
        
        if self.debug:
            if is_valid:
                print("[VALIDATOR] ✅ Tree structure validation passed")
            else:
                print(f"[VALIDATOR] ❌ Found {len(errors)} validation errors:")
                for err in errors[:5]:
                    print(f"  - {err}")
                if len(errors) > 5:
                    print(f"  ... and {len(errors) - 5} more errors")
        
        return is_valid, errors
    
    def _validate_chapter_sequence(self, tree: List[Dict]) -> List[str]:
        """验证章节编号是否连续（第一章、第二章、第三章...）"""
        errors = []
        
        # 提取所有L1的章节编号
        chapters = []
        for node in tree:
            title = node.get('title', '')
            # 匹配"第X章"
            match = re.match(r'^第([一二三四五六七八九十百0-9]+)章', title)
            if match:
                num_str = match.group(1)
                # 转换为数字
                num = self._chinese_to_number(num_str)
                chapters.append((num, title, node))
        
        if len(chapters) < 2:
            return errors  # 少于2章，无需检查连续性
        
        # 排序并检查
        chapters.sort(key=lambda x: x[0])
        
        expected = chapters[0][0]
        for num, title, node in chapters:
            if num != expected:
                errors.append(
                    f"章节编号不连续: 期望'第{self._number_to_chinese(expected)}章'，"
                    f"实际是'{title}' (页码: {node.get('page_start', '?')})"
                )
            expected = num + 1
        
        return errors
    
    def _validate_page_order(self, tree: List[Dict]) -> List[str]:
        """验证页码是否递增"""
        errors = []
        
        def check_node(node: Dict, prev_page: int = 0) -> int:
            """递归检查节点及其子节点的页码顺序"""
            page_start = node.get('page_start') or node.get('start_index', 0)
            title = node.get('title', '未命名')[:30]
            
            if page_start < prev_page:
                errors.append(
                    f"页码顺序错误: '{title}' 起始页{page_start} < 前一节点{prev_page}"
                )
            
            max_page = page_start
            
            # 检查子节点
            if 'nodes' in node and node['nodes']:
                for child in node['nodes']:
                    child_max = check_node(child, max_page)
                    max_page = max(max_page, child_max)
            
            page_end = node.get('page_end') or node.get('end_index', page_start)
            max_page = max(max_page, page_end)
            
            return max_page
        
        current_page = 0
        for node in tree:
            current_page = check_node(node, current_page)
        
        return errors
    
    def _validate_numbering_order(self, tree: List[Dict]) -> List[str]:
        """验证同级节点的structure编号是否升序"""
        errors = []
        
        def check_siblings(nodes: List[Dict], parent_title: str = "root"):
            """检查同级节点"""
            if not nodes:
                return
            
            prev_structure = None
            for node in nodes:
                structure = node.get('structure', '')
                title = node.get('title', '未命名')[:30]
                
                if prev_structure and structure:
                    # 比较结构编号
                    if not self._is_structure_ascending(prev_structure, structure):
                        errors.append(
                            f"编号顺序错误 (父节点: {parent_title}): "
                            f"{prev_structure} → {structure} ('{title}')"
                        )
                
                prev_structure = structure
                
                # 递归检查子节点
                if 'nodes' in node and node['nodes']:
                    check_siblings(node['nodes'], title)
        
        check_siblings(tree)
        return errors
    
    def _validate_chapter_levels(self, tree: List[Dict]) -> List[str]:
        """验证所有"第X章"都在L1层级"""
        errors = []
        
        def check_node(node: Dict, current_level: int = 1):
            """递归检查"""
            title = node.get('title', '')
            
            # 如果是"第X章"格式
            if re.match(r'^第[一二三四五六七八九十百0-9]+章', title):
                if current_level != 1:
                    errors.append(
                        f"章节层级错误: '{title}' 位于Level {current_level}，应该在Level 1"
                    )
            
            # 检查子节点
            if 'nodes' in node and node['nodes']:
                for child in node['nodes']:
                    check_node(child, current_level + 1)
        
        for node in tree:
            check_node(node)
        
        return errors
    
    def _chinese_to_number(self, cn: str) -> int:
        """中文数字转阿拉伯数字（简化版）"""
        if cn.isdigit():
            return int(cn)
        
        cn_num = {
            '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
            '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
            '百': 100
        }
        
        if len(cn) == 1:
            return cn_num.get(cn, 0)
        
        # 简化处理：第一章、第二章...第十章、第十一章...
        if cn.startswith('十'):
            if len(cn) == 1:
                return 10
            return 10 + cn_num.get(cn[1], 0)
        
        # 处理如"二十一"
        result = 0
        i = 0
        while i < len(cn):
            if cn[i] == '十':
                result = result * 10 if result else 10
            elif cn[i] == '百':
                result *= 100
            else:
                result += cn_num.get(cn[i], 0)
            i += 1
        
        return result or 0
    
    def _number_to_chinese(self, num: int) -> str:
        """阿拉伯数字转中文（简化版）"""
        if num <= 0:
            return str(num)
        if num <= 10:
            nums = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
            return nums[num]
        if num < 20:
            return '十' + ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][num - 10]
        # 简化处理，20以上直接返回数字
        return str(num)
    
    def _is_structure_ascending(self, prev: str, current: str) -> bool:
        """检查结构编号是否升序（如 "1" < "2", "1.1" < "1.2"）"""
        try:
            prev_parts = [int(p) for p in prev.split('.')]
            curr_parts = [int(p) for p in current.split('.')]
            
            # 比较每一级
            for i in range(min(len(prev_parts), len(curr_parts))):
                if curr_parts[i] > prev_parts[i]:
                    return True
                elif curr_parts[i] < prev_parts[i]:
                    return False
            
            # 如果前缀相同，较长的编号在后（如 "1.1" < "1.1.1"）
            return len(curr_parts) >= len(prev_parts)
        except:
            # 如果解析失败，不报错
            return True
```

#### 集成到主流程

在 `main.py` 的 Phase 6 后添加验证：

```python
# Phase 6: Build Tree
tree = builder.build_tree(verified_structure, pages)

# NEW: Phase 6b: Validate Tree
from .utils.tree_validator import TreeValidator
validator = TreeValidator(debug=self.debug)
is_valid, validation_errors = validator.validate_tree(tree)

if not is_valid and self.debug:
    print(f"\n⚠️  [WARNING] Tree validation found {len(validation_errors)} issues:")
    for err in validation_errors[:10]:
        print(f"  - {err}")
```

---

### 方案4: 改进嵌入式TOC的质量过滤（中优先级）

**目标**: 更准确地识别嵌入式TOC中的有效条目

**修改位置**: `main.py::_is_valid_toc_title()` (L1101)

**当前问题**:
```python
# 当前代码会过滤掉一些有效标题，如：
- "1 / 前言"  （可能被认为是表单）
- "附件1: 投标函"  （包含冒号，可能被过滤）
```

**优化建议**:
```python
def _is_valid_toc_title(self, title: str) -> bool:
    """验证TOC标题的有效性"""
    import re
    
    # 1. 长度检查（放宽限制）
    if len(title) < 2:  # 至少2个字符
        return False
    if len(title) > 150:  # 放宽到150字符
        return False
    
    # 2. 过滤明显的垃圾
    garbage_patterns = [
        r'^\.{3,}',  # "......"
        r'^\s*$',  # 空白
        r'^[\d\s\.\-_]{5,}$',  # 只有数字、空格、标点（如"1.2.3.4.5"）
    ]
    
    for pattern in garbage_patterns:
        if re.match(pattern, title):
            return False
    
    # 3. 表单字段检查（更精确）
    # 只过滤明显的表单字段，保留正常的冒号标题
    if re.match(r'^[\u4e00-\u9fa5]{1,4}\s*[：:]\s*$', title):
        # 如："地址："、"日期："
        return False
    
    # 4. 保留常见的有效标题格式
    valid_patterns = [
        r'^第[一二三四五六七八九十百0-9]+[章节部分]',  # "第一章"
        r'^[0-9]{1,2}\s*[/\/]',  # "1 /" 或 "1/"
        r'^[0-9]{1,2}\s+[\u4e00-\u9fa5]{2,}',  # "1 标题"
        r'^附件[0-9]{1,2}[：:]',  # "附件1:"
        r'^[一二三四五六七八九十]、',  # "一、"
        r'^[0-9]{1,2}[\.\。、]',  # "1."
        r'^Chapter\s+[0-9IVX]+',  # "Chapter 1"
    ]
    
    for pattern in valid_patterns:
        if re.match(pattern, title, re.IGNORECASE):
            return True
    
    # 5. 默认：如果看起来像标题（2-150字符，不是纯符号），保留
    if re.search(r'[\u4e00-\u9fa5a-zA-Z]{2,}', title):
        return True
    
    return False
```

---

## 📊 优化方案优先级总结

| 优先级 | 方案 | 影响范围 | 预计工作量 | 预期效果 |
|--------|------|---------|-----------|---------|
| ⚠️⚠️⚠️ 高 | 方案2: 递归层级约束 | 核心问题 | 3-4小时 | 解决90%的层级混乱 |
| ⚠️⚠️ 高 | 方案1: 章节识别增强 | 嵌入式TOC | 1小时 | 解决编号不一致问题 |
| ⚠️ 中 | 方案3: 后处理验证器 | 质量保证 | 2-3小时 | 提供错误检测和修复建议 |
| ⚠️ 中 | 方案4: TOC质量过滤 | 嵌入式TOC | 1小时 | 减少误判 |

---

## 🎯 实施计划

### Phase 1: 立即修复（第一天）

1. ✅ **实施方案1**: 增强章节识别（1小时）
   - 修改`_is_chapter_title()`
   - 添加测试用例

2. ✅ **实施方案2**: 递归层级约束（3-4小时）
   - 修改`_process_large_node_recursively()`
   - 修改`_extract_structure_from_segment()`
   - 更新LLM提示词

3. ✅ **测试**: 使用问题PDF测试（1小时）
   - 重新解析`7ebf7085-423e-4d70-a3fe-2e8cdd98993b.pdf`
   - 验证章节层级是否正确

### Phase 2: 质量提升（第二天）

4. ✅ **实施方案3**: 后处理验证器（2-3小时）
   - 创建`tree_validator.py`
   - 集成到主流程

5. ✅ **实施方案4**: TOC质量过滤（1小时）
   - 优化`_is_valid_toc_title()`

6. ✅ **回归测试**: 使用多个PDF测试（2小时）
   - 招标文件
   - 学术论文
   - 技术手册

### Phase 3: 文档和监控（第三天）

7. ✅ **文档更新**
   - 更新IMPROVEMENTS_SUMMARY.md
   - 添加算法说明文档

8. ✅ **添加监控指标**
   - 章节识别准确率
   - 层级验证错误率

---

## 📝 测试用例

### 用例1: 招标文件（当前问题文档）

**预期修复后的tree结构**:
```
root
├─ [L1] 第一章 招标公告 (或 "1 / 前言" if that's the actual title)
├─ [L1] 第二章 投标人须知
├─ [L1] 第三章 评标办法及评分标准
├─ [L1] 第四章 采购需求
│  ├─ [L2] 一、采购内容
│  ├─ [L2] 二、货物技术参数及要求
│  │  ├─ [L3] 车铣复合机床技术参数及要求
│  │  │  ├─ [L4] 主轴轴承
│  │  │  ├─ [L4] 刀塔
│  │  │  └─ ...
│  │  ├─ [L3] 数控编程软件及后处理程序
│  │  ├─ [L3] 车铣仿真软件
│  │  └─ [L3] 其他技术要求
│  ├─ [L2] 三、车铣常用刀具明细
│  ├─ [L2] 五、付款方式
│  └─ [L2] 六、质保期
├─ [L1] 第五章 合同文本
└─ [L1] 第六章 投标文件格式附件
```

### 用例2: 标准学术论文

**测试PDF**: PRML.pdf 或类似学术论文

**预期行为**:
- ✅ "Chapter 1", "Chapter 2" 识别为L1
- ✅ "1.1", "1.2" 识别为L2（Chapter 1的子节点）
- ❌ 不会出现L2的"Chapter 1"嵌套在另一个章节下

---

## 🔧 调试建议

### 启用详细调试日志

```bash
# 解析PDF时启用debug模式
python -m pageindex_v2.main your_file.pdf --debug

# 查看关键日志输出：
# [PHASE 2] 嵌入式TOC转换
# [RECURSIVE] 递归处理
# [VALIDATOR] 树验证结果
```

### 检查点

1. **Phase 2**: 检查章节是否被正确识别
   ```
   [PHASE 2] Sample entries:
     1. [1] 第一章 招标公告 → Page 2  ✅ Level 1
     2. [1] 第二章 投标人须知 → Page 6  ✅ Level 1
   ```

2. **Phase 6a**: 检查递归处理的上下文
   ```
   [RECURSIVE] Processing large node:
     Title: 第四章 采购需求
     Level context: parent_level=1, max_child_level=3
   ```

3. **Phase 6b**: 检查验证结果
   ```
   [VALIDATOR] ✅ Tree structure validation passed
   或
   [VALIDATOR] ❌ Found 3 validation errors:
     - 章节编号不连续: 期望'第三章'，实际是'第五章'
   ```

---

**分析完成时间**: 2026-02-07  
**下一步**: 开始实施优化方案
