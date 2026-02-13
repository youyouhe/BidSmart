"""Configuration for BidSmart Agent system."""

from __future__ import annotations

import os
from pathlib import Path

# API Configuration
BIDSMART_API_URL = os.getenv("BIDSMART_API_URL", "http://192.168.8.107:8003")
BIDSMART_TOKEN = os.getenv("BIDSMART_TOKEN", "")

# Model Configuration
ORCHESTRATOR_MODEL = os.getenv("ORCHESTRATOR_MODEL", "claude-opus-4-6")
ANALYZER_MODEL: str = os.getenv("ANALYZER_MODEL", "opus")
WRITER_MODEL = "opus"
CALCULATOR_MODEL = "sonnet"
FINDER_MODEL = "sonnet"
REVIEWER_MODEL = "opus"
COMPLIANCE_MODEL = "sonnet"
FORMATTER_MODEL = "haiku"

# Paths
BASE_DIR = Path(__file__).parent
COMPANY_DATA_DIR = BASE_DIR / "company_data"

# Cost Control
MAX_BUDGET_USD = float(os.getenv("BID_AGENT_MAX_BUDGET", "5.0"))
MAX_TURNS = int(os.getenv("BID_AGENT_MAX_TURNS", "100"))

# Content Validation
MIN_SECTION_CONTENT_LENGTH = 50
MAX_REVISION_ROUNDS = 2
