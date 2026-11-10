# CodeMeet — Real-Time Collaborative Coding & Technical Interview Platform

An advanced, enterprise-grade engineering workspace combining real-time multi-user collaborative code editing (Monaco + Yjs), sandboxed code execution, AI coding assistance, AI-powered mock interviews, collaborative system design whiteboard, GitHub integration, coding battles, and live analytics.

---

## 🎨 New Theme & Architecture Overview

CodeMeet now features a dark developer-centric layout inspired by **Qovery**, **Linear**, and **GitHub Next**:
- **Vertical Navigation Sidebar**: Fast access to Dashboard, Workspaces, Problem Bank, Coding Battles, Whiteboard, AI Mock Interview, GitHub Hub, and Analytics.
- **Top Status & Presence Bar**: Live system operational indicator (`● All systems operational`), notification center with unread badge, audio feedback toggle, and user profile badge.
- **KPI Metrics & Analytics Dashboard**:
  - 4 Top KPI Cards (Total Sessions, Successful Runs, Failed Runs, Active Workspaces)
  - Submissions per Day Stacked Bar Chart (Green, Coral, Blue segments)
  - Status Distribution Circular Ring Gauge with live metrics
  - Weekly Growth Momentum Wave Chart
  - Execution Stability progress bars by programming language

---

## 🚀 Quick Start (Zero External Dependencies)

Run the entire CodeMeet stack locally on Windows, macOS, or Linux without needing Docker, PostgreSQL, or Redis!

```bash
cd cm
npm start
# or
node run-local.js
# or (PowerShell)
.\run-local.ps1
```

The stack initializes:
- **Executor Sandbox**: `http://localhost:4001` (Direct MinGW C++, Python 3, and Node.js execution)
- **Backend API & WebSockets**: `http://localhost:4000` (SQLite `dev.db`, Yjs WebSocket server, Socket.IO)
- **Frontend Vite Application**: `http://localhost:5173`

Open **`http://localhost:5173`** in your browser!

---

## 🛠️ Complete Feature Matrix

### 1. AI Coding Assistant & Multi-LLM Engine
- **Supported Providers**:
  - **Groq** (`llama-3.3-70b-versatile`, `deepseek-r1-distill-llama-70b`) — Ultra-fast, 100% free tier.
  - **Google Gemini** (`gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro`) — Free tier at Google AI Studio.
  - **OpenRouter** (`meta-llama/llama-3.3-70b-instruct:free`) — Access to free & open models.
  - **OpenAI** (`gpt-4o-mini`, `gpt-4o`) — Production grade.
  - **Ollama** (`http://localhost:11434/v1`) — Run 100% local offline models.
- **How to Connect Keys**:
  - **Option A (Instant in Browser UI)**: Open any room -> Click **✨ AI Copilot** -> Click **⚙️ LLM** -> Paste your key and click **Save & Apply**.
  - **Option B (Server `.env`)**: Set `GROQ_API_KEY=""` or `GEMINI_API_KEY=""` in `cm/backend/.env`.
- **Actions**: Explain Code, Find Potential Bugs, Optimize Complexity, Generate Edge-Case Test Cases, Big-O Complexity Analysis, Socratic Hints, and Runtime/Compiler Error Diagnosis.
- **Languages**: Python 3, JavaScript (Node.js), C++ (GCC), and Java.
- **Controls**: Dockable side panel, 1-click **"📋 Copy Suggested Code"**, and **"⚡ Insert into Editor"**.

### 2. Advanced Technical Interview Mode
- **Interviewer Controls**: Create interview sessions, assign DSA problems, track candidate code in real time, lock editing permissions, set timer, and file structured evaluation reports (1–5 star rating, strengths, growth areas, hiring decisions: Strong Hire / Hire / No Hire).
- **Candidate Experience**: Shared collaborative workspace, test case verification, audio/video calling, and feedback viewing once released.

### 3. Collaborative Whiteboard & System Design Mode
- **Tools**: Freehand pen, microservice boxes, nodes, decision diamonds, connection arrows with arrowheads, database cylinders, and text labels.
- **Multiplayer**: Real-time multi-user drawing sync over WebSockets.
- **Actions**: Undo, redo, clear board, session persistence, and 1-click **Export PNG**.

### 4. GitHub Integration
- **Capabilities**: Connect GitHub Personal Access Tokens securely, list user repositories, browse directory file trees, load source files directly into Monaco Editor, and commit/push changes back to GitHub branches.

### 5. Advanced Monaco Code Editor
- **Multiplayer**: Multi-cursor live editing with user-specific cursor tags and colors powered by **Yjs CRDT**.
- **Features**: Document formatting, starter templates, download code (`.py`, `.js`, `.cpp`, `.java`), and `Ctrl + Enter` to run.

### 6. AI Mock Technical Interviewer
- **Categories**: DSA, Object-Oriented Programming (OOP), DBMS, Operating Systems, and System Design.
- **Simulator**: Conversational AI interviewer that probes approach, edge cases, and time/space complexity, providing incremental hints and post-interview scorecards.

### 7. Coding Battles & Live Leaderboards
- **Competitive Arena**: Host timed coding battles (15, 30, 45, 60 mins), submit solutions, and undergo server-side automated test-case evaluation.
- **Live Leaderboard**: Real-time scoring based on test case correctness and execution time penalties.

### 8. Analytics & Telemetry Dashboard
- Displays real stored telemetry: Total sessions, execution success rate %, average runtime latency in ms, language distribution, weekly activity bar chart, and status distribution gauges.

### 9. Real-Time Chat & Collaboration
- In-room group messaging, private direct messages, typing indicators, animated floating emoji reactions (`👍`, `🔥`, `🚀`, `💡`, `🎉`), and join/leave presence notifications.

### 10. WebRTC Video Conferencing
- Built-in multi-participant video calling with camera toggle, microphone mute, screen sharing, call duration counter, and network quality indicators.

### 11. Session Recording & Timeline Replay
- Scrub back and forth across code snapshots to review how the candidate built their solution.
- Restore historical versions or export session summaries.

---

## 🧪 Automated End-to-End Testing

Run the full verification suite against the live backend and sandbox:

```bash
node cm/test-e2e.js
```
All 10 verification test suites will run and report status.
