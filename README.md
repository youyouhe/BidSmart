# BidSmart - Intelligent Document Structure Auditing System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6.svg)](https://www.typescriptlang.org/)

**BidSmart** is an intelligent document structure auditing system designed for tender/bidding documents. It leverages large language models (LLMs) to analyze PDF document hierarchies, identify structural issues, and provide actionable optimization suggestions with AI-powered insights.

## Features

### Document Processing
- **PDF Upload & Parsing**: Extract table of contents and document structure from PDF files
- **Hierarchical Tree Visualization**: Interactive tree view with expand/collapse functionality
- **Real-time WebSocket Updates**: Live progress tracking during document processing

### AI-Powered Auditing
- **Intelligent Structure Analysis**: LLM-based detection of 7+ types of structural issues
- **Real-time Audit Progress**: Visual progress bars showing 5 audit phases:
  1. Numbering system analysis
  2. Format consistency check
  3. Logical hierarchy validation
  4. Completeness evaluation
  5. Overall recommendations
- **Confidence Scoring**: High/Medium/Low confidence levels for each suggestion
- **Action Types**: DELETE, ADD, MODIFY_FORMAT, MODIFY_PAGE operations

### Batch Operations
- **Filter by Confidence**: Show only high/medium/low confidence suggestions
- **Filter by Action Type**: Focus on specific operation types
- **Batch Accept/Reject**: Apply multiple suggestions at once
- **Context Menu Operations**: Right-click batch operations for same confidence/action
- **Statistics Display**: Real-time count of filtered vs total suggestions

### Backup & Recovery
- **Automatic Backups**: System creates backups before applying changes
- **Backup Manager**: View all backups with timestamps and change counts
- **One-Click Restore**: Undo changes and return to previous states
- **Safety Protection**: Restoration creates new backup of current state first

### User Experience
- **Auto-Expand Smart Nodes**: Automatically expand parent nodes containing child suggestions
- **Visual Indicators**: Orange badges for parent nodes with descendant issues
- **Responsive Design**: Clean UI built with Tailwind CSS
- **Document Gallery**: Browse and manage multiple documents

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Document     │  │ Tree View    │  │ Backup       │         │
│  │ Gallery      │  │ + Context    │  │ Manager      │         │
│  │              │  │   Menu       │  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   API Gateway   │
                    │   (FastAPI)     │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
    ┌─────▼─────┐     ┌─────▼─────┐     ┌─────▼─────┐
    │ Document  │     │  Audit    │     │ WebSocket │
    │ Routes    │     │  Routes   │     │ Manager   │
    └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                    ┌────────▼────────┐
                    │  TreeAuditorV2  │
                    │   (LLM Chain)   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────▼─────┐  ┌────▼────┐  ┌─────▼─────┐
        │ Numbering │  │ Format  │  │ Hierarchy │
        │ Analysis  │  │ Check   │  │ Validator │
        └───────────┘  └─────────┘  └───────────┘
```

## Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.8+)
- **ORM**: SQLAlchemy
- **LLM Integration**: LangChain
- **AI Models**: OpenAI GPT-4 / Azure OpenAI
- **WebSocket**: FastAPI WebSocket support
- **File Storage**: Local filesystem + database metadata

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: React Hooks
- **HTTP Client**: Fetch API
- **WebSocket**: Native WebSocket API

### Database
- **Development**: SQLite
- **Production Ready**: PostgreSQL support via SQLAlchemy

## Installation

### Prerequisites
- Python 3.8+
- Node.js 16+
- npm or yarn
- OpenAI API key or Azure OpenAI credentials

### Clone Repository

**Important**: This project uses git submodules. You must clone with the `--recursive` flag:

```bash
# Option 1: Clone with submodules (Recommended)
git clone --recursive https://github.com/youyouhe/BidSmart.git
cd BidSmart
```

If you already cloned without `--recursive`:

```bash
# Option 2: Initialize submodules after cloning
git clone https://github.com/youyouhe/BidSmart.git
cd BidSmart
git submodule update --init --recursive
```

### Backend Setup

1. Navigate to backend directory:
```bash
cd lib/docmind-ai
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Configure environment variables:
```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1

# Or Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your_azure_api_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_VERSION=2024-02-01

# Database (optional, defaults to SQLite)
DATABASE_URL=sqlite:///./data/bidsmart.db

# Storage paths
UPLOAD_DIR=./data/uploads
PARSED_DIR=./data/parsed
```

5. Run backend server:
```bash
python -m uvicorn api.index:app --reload --port 8000
```

Backend will be available at `http://localhost:8000`

### Frontend Setup

1. Return to project root:
```bash
cd ../..
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Run development server:
```bash
npm run dev
```

Frontend will be available at `http://localhost:5173`

## Usage

### 1. Upload Document
- Click the upload area or drag & drop a PDF file
- System will extract table of contents and build document tree
- View progress via WebSocket connection

### 2. View Document Structure
- Explore hierarchical tree structure
- Expand/collapse nodes
- View page numbers for each section

### 3. Run Audit
- Click the **CheckCircle** icon to start audit
- Watch real-time progress across 5 phases
- Review suggestions with confidence scores

### 4. Review Suggestions
Each suggestion includes:
- **Action Type**: DELETE, ADD, MODIFY_FORMAT, MODIFY_PAGE
- **Confidence Level**: High (green), Medium (yellow), Low (orange)
- **Reason**: AI-generated explanation
- **Target Node**: Affected section in tree

### 5. Apply Changes
**Individual Operations:**
- Click "接受" (Accept) or "拒绝" (Reject) on each suggestion
- Use "应用" (Apply) to execute accepted suggestions

**Batch Operations:**
- Filter suggestions by confidence or action type
- Use batch accept/reject buttons
- Right-click for context menu batch operations

**Statistics:**
- View "显示 X / Y 个建议" to see filtered count
- Real-time updates as filters change

### 6. Manage Backups
- Click **Clock** icon to open Backup Manager
- View all historical backups with timestamps
- See change summaries (e.g., "添加 3 个节点，删除 1 个节点")
- Click "恢复" to restore any previous version
- System creates safety backup before restoration

## Audit Suggestion Types

| Action Type | Description | Example |
|------------|-------------|---------|
| `DELETE` | Remove redundant or incorrectly parsed sections | Remove duplicate "1.1 项目概述" entry |
| `ADD` | Insert missing sections based on document conventions | Add "（二）资质要求" between sections |
| `MODIFY_FORMAT` | Fix incorrect numbering or formatting | Change "1-1" to "1.1" |
| `MODIFY_PAGE` | Correct inaccurate page number references | Update page range from [3,5] to [3,6] |

## Configuration

### Audit System Settings
Modify `lib/docmind-ai/pageindex_v2/phases/tree_auditor_v2.py`:

```python
# Adjust confidence thresholds
MIN_CONFIDENCE_HIGH = 0.8
MIN_CONFIDENCE_MEDIUM = 0.5

# Modify audit phases (5 total)
PHASES = [
    "numbering_analysis",
    "format_check", 
    "hierarchy_validation",
    "completeness_check",
    "overall_recommendation"
]
```

### Frontend API Endpoint
Modify `services/apiService.ts`:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
```

### Database Configuration
Switch to PostgreSQL in `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost/bidsmart
```

## Known Issues & Solutions

### Issue 1: ADD Suggestions Not Displaying
**Symptom**: Suggestions with `action: "ADD"` don't appear in tree view

**Root Cause**: ADD suggestions require `node_info.parent_id` and `node_info.insert_position`. When `node_info` is null, TreeView couldn't match them to nodes.

**Solution**: 
- Frontend: Modified `TreeView.tsx` (lines 121-198) to show ADD suggestions with null `node_info` on root node as fallback
- Backend: Fixed `document_routes.py` (lines 1509-1537) to properly extract and assemble `node_info` from top-level fields

### Issue 2: node_info Backend Bug
**Symptom**: Database saves ADD suggestions with `node_info: null`

**Root Cause**: TreeAuditorV2 generates ADD suggestions with `parent_id` and `insert_position` at top level, but backend was looking for `advice.get("node_info", {})`

**Solution**: Modified `lib/docmind-ai/api/document_routes.py` to extract top-level fields and assemble them into `node_info` before database save.

### Issue 3: Audit Progress Stalling
**Symptom**: Progress bar stuck at 0%

**Solution**: 
- Ensure WebSocket connection is active
- Check backend logs for LLM API errors
- Verify OpenAI/Azure API key is valid and has sufficient quota

## Project Structure

```
BidSmart/
├── lib/docmind-ai/              # Backend (git submodule)
│   ├── api/
│   │   ├── document_routes.py   # Document CRUD + parsing
│   │   ├── audit_routes.py      # Audit operations + backups
│   │   ├── database.py          # SQLAlchemy models
│   │   ├── websocket_manager.py # WebSocket handler
│   │   └── index.py             # FastAPI app entry
│   ├── pageindex_v2/
│   │   ├── phases/
│   │   │   ├── tree_auditor_v2.py  # Main audit logic
│   │   │   ├── advice_executor.py   # Apply suggestions
│   │   │   └── tree_builder.py      # PDF parsing
│   │   └── main.py              # Pipeline orchestrator
│   ├── data/
│   │   ├── uploads/             # PDF files
│   │   ├── parsed/              # JSON trees
│   │   └── bidsmart.db          # SQLite database
│   └── requirements.txt
│
├── components/
│   ├── DocumentGallery.tsx      # Document list view
│   ├── TreeView.tsx             # Hierarchical tree + suggestions
│   ├── BackupManager.tsx        # Backup list + restore
│   ├── ContextMenu.tsx          # Right-click batch operations
│   └── UploadZone.tsx           # File upload UI
│
├── services/
│   ├── apiService.ts            # HTTP API client
│   └── websocketService.ts      # WebSocket client
│
├── App.tsx                      # Main application component
├── package.json                 # Frontend dependencies
├── vite.config.ts               # Vite configuration
├── tsconfig.json                # TypeScript configuration
└── README.md                    # This file
```

## API Documentation

### Core Endpoints

#### Document Management
- `POST /api/documents/upload` - Upload PDF and parse
- `GET /api/documents` - List all documents
- `GET /api/documents/{id}` - Get document details
- `DELETE /api/documents/{id}` - Delete document

#### Audit Operations
- `POST /api/documents/{id}/audit` - Start audit process
- `GET /api/documents/{id}/audit/suggestions` - Get suggestions
- `POST /api/documents/{id}/audit/suggestions/{suggestion_id}/review` - Accept/reject suggestion
- `POST /api/documents/{id}/audit/suggestions/batch-review` - Batch operations
- `POST /api/documents/{id}/audit/suggestions/apply` - Apply accepted suggestions

#### Backup Management
- `GET /api/documents/{id}/audit/backups` - List all backups
- `POST /api/documents/{id}/audit/backups/{backup_id}/restore` - Restore backup

#### WebSocket
- `WS /ws` - Real-time updates for parsing and audit progress

## Development

### Run Tests
```bash
# Backend tests (if available)
cd lib/docmind-ai
pytest tests/

# Frontend tests
npm test
```

### Build for Production
```bash
# Frontend build
npm run build

# Backend (use production ASGI server)
pip install gunicorn
gunicorn api.index:app --workers 4 --worker-class uvicorn.workers.UvicornWorker
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "Add some feature"`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a Pull Request

### Coding Standards
- **Python**: Follow PEP 8, use type hints
- **TypeScript**: Follow ESLint rules, strict mode enabled
- **Commits**: Use conventional commits (feat:, fix:, docs:, etc.)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [LangChain](https://github.com/langchain-ai/langchain) for LLM orchestration
- PDF parsing powered by [PyMuPDF](https://github.com/pymupdf/PyMuPDF)
- UI components inspired by modern design patterns

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Contact: [your-email@example.com]

---

**Made with care for smarter document management**
