"""Tests for pricing calculation tools."""

from bid_agents.tools.pricing_tools import _num_to_chinese


def test_num_to_chinese_integer():
    assert "伍拾万元整" == _num_to_chinese(500000)


def test_num_to_chinese_with_decimals():
    result = _num_to_chinese(123456.78)
    assert "壹拾贰万叁仟肆佰伍拾陆元" in result
    assert "柒角" in result
    assert "捌分" in result


def test_num_to_chinese_zero():
    result = _num_to_chinese(0)
    assert "零元整" == result


def test_num_to_chinese_small():
    result = _num_to_chinese(1.50)
    assert "壹元" in result
    assert "伍角" in result
