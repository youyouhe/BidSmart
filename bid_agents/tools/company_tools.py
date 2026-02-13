"""Tools for accessing company knowledge (profile, team, capabilities, past projects).

Agno-compatible tool functions.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..state.project_state import BidProjectState


async def get_company_profile(
    state: BidProjectState,
) -> str:
    """获取公司基础信息（名称、注册号、法人、资质等级、银行账户等）.
    
    Returns:
        公司信息JSON
    """
    if not state.company_profile:
        return (
            "公司信息未配置。请在 bid_agents/company_data/profile.json 中填写公司信息。\n"
            "模板已包含所有必要字段，请根据实际情况修改。"
        )
    # Remove internal instructions field
    profile = {k: v for k, v in state.company_profile.items() if not k.startswith("_")}
    return json.dumps(profile, ensure_ascii=False, indent=2)


async def get_company_capabilities(
    state: BidProjectState,
    domain: str = "",
) -> str:
    """获取公司在指定领域的技术能力描述.
    
    Args:
        domain: 领域名称
    
    Returns:
        能力描述文本
    """
    if not state.capabilities:
        return "公司能力信息未配置。请在 bid_agents/company_data/capabilities.json 中填写。"

    domain = domain.strip()

    if domain:
        # Search for matching domain
        for key, value in state.capabilities.items():
            if domain.lower() in key.lower():
                return (
                    f"领域: {key}\n"
                    f"描述: {value.get('description', '')}\n"
                    f"能力方向:\n" + "\n".join(f"  - {a}" for a in value.get("areas", []))
                )
        return f"未找到领域 \"{domain}\" 的能力信息。可用领域: {', '.join(state.capabilities.keys())}"

    # Return all capabilities
    return json.dumps(state.capabilities, ensure_ascii=False, indent=2)


async def get_team_profiles(
    state: BidProjectState,
    roles: str = "",
) -> str:
    """获取项目团队成员信息（按角色筛选：项目经理、技术总监等）.
    
    Args:
        roles: 角色列表（逗号分隔）
    
    Returns:
        团队成员信息文本
    """
    if not state.team_profiles:
        return "团队信息未配置。请在 bid_agents/company_data/team.json 中填写。"

    roles_filter = roles.strip()
    members = state.team_profiles

    if roles_filter:
        role_list = [r.strip().lower() for r in roles_filter.split(",")]
        members = [
            m for m in members
            if any(role in m.get("role", "").lower() for role in role_list)
        ]

    if not members:
        all_roles = list({m.get("role", "") for m in state.team_profiles})
        return f"未找到匹配角色。可用角色: {', '.join(all_roles)}"

    lines = [f"团队成员 ({len(members)} 人):\n"]
    for m in members:
        certs = ", ".join(m.get("certifications", []))
        lines.append(
            f"**{m.get('name', '')}** - {m.get('role', '')} ({m.get('title', '')})\n"
            f"  学历: {m.get('education', '')}, 经验: {m.get('years_experience', '')}年\n"
            f"  证书: {certs}\n"
            f"  简介: {m.get('description', '')}"
        )

    return "\n\n".join(lines)


async def search_past_projects(
    state: BidProjectState,
    query: str = "",
    min_contract_value: float = 0.0,
) -> str:
    """搜索公司过往项目业绩（可按关键词和最低合同金额筛选）.
    
    Args:
        query: 搜索关键词
        min_contract_value: 最低合同金额
    
    Returns:
        项目业绩文本
    """
    if not state.past_projects:
        return "过往项目信息未配置。请在 bid_agents/company_data/past_projects.json 中填写。"

    query_lower = query.lower()

    matches = []
    for p in state.past_projects:
        name = p.get("project_name", "").lower()
        desc = p.get("description", "").lower()
        domain = p.get("domain", "").lower()
        techs = " ".join(p.get("technologies", [])).lower()
        value = p.get("contract_value", 0)

        if value < min_contract_value:
            continue

        if not query_lower or any(
            query_lower in text for text in [name, desc, domain, techs]
        ):
            matches.append(p)

    if not matches:
        return "未找到匹配的项目业绩"

    lines = [f"匹配项目 ({len(matches)} 个):\n"]
    for p in matches:
        techs = ", ".join(p.get("technologies", []))
        lines.append(
            f"**{p.get('project_name', '')}**\n"
            f"  甲方: {p.get('client', '')}\n"
            f"  合同金额: {p.get('contract_value', 0)}{p.get('currency', '万元')}\n"
            f"  时间: {p.get('start_date', '')} ~ {p.get('end_date', '')}\n"
            f"  技术: {techs}\n"
            f"  描述: {p.get('description', '')}"
        )

    return "\n\n".join(lines)
