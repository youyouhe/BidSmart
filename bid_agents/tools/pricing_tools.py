"""Tools for pricing calculation and template retrieval.

Agno-compatible tool functions.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..state.project_state import BidProjectState


async def get_pricing_templates(
    state: BidProjectState,
    category: str = "",
) -> str:
    """获取标准报价表模板（hardware=硬件, software=软件, services=服务）.
    
    Args:
        category: 报价类别
    
    Returns:
        报价模板JSON
    """
    category = category.strip().lower()

    valid_categories = ["hardware", "software", "services"]
    if category not in valid_categories:
        return (
            f"无效的报价类别: {category}\n"
            f"可用类别: {', '.join(valid_categories)}"
        )

    template = state.load_pricing_template(category)
    if not template:
        return (
            f"未找到 {category} 报价模板。\n"
            f"请在 bid_agents/company_data/templates/pricing_{category}.json 中配置。"
        )

    return json.dumps(template, ensure_ascii=False, indent=2)


async def calculate_totals(
    state: BidProjectState,
    items_json: str = "",
    tax_rate: float = 0.13,
) -> str:
    """计算报价汇总：从明细项计算小计、税费和总价.
    
    Args:
        items_json: 明细项JSON字符串
        tax_rate: 税率
    
    Returns:
        报价汇总文本
    """
    try:
        items = json.loads(items_json)
    except json.JSONDecodeError as e:
        return f"明细项JSON解析失败: {e}"

    subtotal = 0.0
    lines = ["报价汇总计算:\n"]
    lines.append("| 序号 | 项目 | 数量 | 单价 | 小计 |")
    lines.append("|------|------|------|------|------|")

    for i, item in enumerate(items, 1):
        name = item.get("name", f"项目{i}")
        quantity = float(item.get("quantity", 1))
        unit_price = float(item.get("unit_price", 0))
        item_total = quantity * unit_price
        subtotal += item_total
        lines.append(f"| {i} | {name} | {quantity} | {unit_price:,.2f} | {item_total:,.2f} |")

    tax = subtotal * tax_rate
    grand_total = subtotal + tax

    lines.append("")
    lines.append(f"**不含税小计**: ¥{subtotal:,.2f}")
    lines.append(f"**税率**: {tax_rate*100:.0f}%")
    lines.append(f"**税额**: ¥{tax:,.2f}")
    lines.append(f"**含税总计**: ¥{grand_total:,.2f}")
    lines.append(f"**大写金额**: {_num_to_chinese(grand_total)}")

    return "\n".join(lines)


def _num_to_chinese(num: float) -> str:
    """Convert a number to Chinese uppercase currency representation."""
    digits = "零壹贰叁肆伍陆柒捌玖"
    units = ["", "拾", "佰", "仟"]
    big_units = ["", "万", "亿"]

    # Simplified implementation for bid documents
    # Use round() to avoid floating-point precision issues
    total_fen = round(num * 100)
    yuan = total_fen // 100
    jiao = (total_fen // 10) % 10
    fen = total_fen % 10

    if yuan == 0:
        result = "零元"
    else:
        result = ""
        yuan_str = str(yuan)
        length = len(yuan_str)

        for i, ch in enumerate(yuan_str):
            d = int(ch)
            pos = length - 1 - i
            group_pos = pos % 4
            big_pos = pos // 4

            if d != 0:
                result += digits[d] + units[group_pos]
            else:
                if result and not result.endswith("零"):
                    result += "零"

            if group_pos == 0 and big_pos > 0:
                result = result.rstrip("零")
                result += big_units[big_pos]

        result = result.rstrip("零") + "元"

    if jiao > 0:
        result += digits[jiao] + "角"
    if fen > 0:
        result += digits[fen] + "分"
    elif jiao == 0:
        result += "整"

    return result
