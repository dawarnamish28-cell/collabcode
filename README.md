# CollabCode - Collaborative Coding Platform

A full-stack, browser-based collaborative coding platform with real-time multi-user editing, chat, and **production-grade sandboxed code execution**.

## Live URLs

- **Frontend**: https://3000-inq8qfxj1gt1z5ghzjucu-0e616f0a.sandbox.novita.ai
- **Backend API**: https://4000-inq8qfxj1gt1z5ghzjucu-0e616f0a.sandbox.novita.ai
- **Health Check**: https://4000-inq8qfxj1gt1z5ghzjucu-0e616f0a.sandbox.novita.ai/api/health

## Architecture

```
collabcode/
├── client/                         # Next.js + React Frontend
│   ├── pages/
│   │   ├── _app.js                 # App wrapper with global providers
│   │   ├── index.js                # Landing page (create/join rooms)
│   │   └── room/[id].js           # Collaborative workspace
│   ├── components/
│   │   ├── Editor.js              # Monaco Editor + Yjs CRDT binding
│   │   ├── Chat.js                # Real-time chat UI + typing indicators
│   │   ├── UserPresence.js        # Active users + cursor indicators
│   │   ├── Navbar.js              # Room ID, language selector, status
│   │   ├── RunButton.js           # Code execution trigger
│   │   └── OutputConsole.js       # Rich terminal output (stdout/stderr/stdin)
│   ├── utils/
│   │   ├── socket.js              # Socket.io client singleton
│   │   └── yjsProvider.js         # Yjs + Socket.io CRDT provider
│   ├── context/
│   │   └── AppContext.js          # Global state (user/session/room)
│   └── styles/
│       └── globals.css            # Tailwind CSS + custom styles
│
├── server/                         # Node.js + Express Backend
│   ├── server.js                  # Express + HTTP + Socket.io setup
│   ├── sockets/
│   │   └── roomHandler.js         # Room join/leave, CRDT relay, awareness
│   ├── controllers/
│   │   └── executionController.js # Multi-engine code execution system
│   ├── routes/
│   │   ├── execution.js           # POST /api/execute, GET /api/languages
│   │   └── auth.js                # Unique username auth system
│   ├── models/
│   │   ├── Room.js                # Room schema (CRDT state, participants)
│   │   └── Message.js             # Chat message schema
│   ├── middleware/
│   │   ├── auth.js                # Unique username generator + JWT
│   │   ├── rateLimiter.js         # Express + Socket rate limiters
│   │   └── errorHandler.js        # Centralized error handling
│   └── config/
│       └── db.js                  # MongoDB connection with fallback
│
└── ecosystem.config.cjs            # PM2 process configuration
```

## Features

### Unique Username System
- **Guaranteed unique** across all sessions — server-side registry with collision detection
- 50 adjectives x 50 nouns x 9000 suffixes = **22.5 million** possible names
- Sequential fallback numbering for absolute collision prevention
- Names persist across reconnections via localStorage + JWT validation
- Example names: `CyberWizard1281`, `AgileHawk2775`, `CrystalPixel4327`

### Code Execution Engine (The Selling Point)
Multi-strategy execution with **real sandboxed local execution**:

| Strategy | Languages | Speed | Requirements |
|----------|-----------|-------|-------------|
| **Local Sandbox** (primary) | JavaScript, Python, C, C++ | 27-450ms | Node.js, Python3, GCC installed |
| **Wandbox API** (fallback) | C, C++ | ~2s | Free, no key needed |
| **Judge0 API** (optional) | All 10 languages | ~3s | RapidAPI key required |

**Security features:**
- Each execution gets an isolated temp directory (auto-cleaned)
- SIGKILL enforced timeout (10s default)
- stdout/stderr capped at 64KB to prevent memory bombs
- Separate compilation + execution phases for compiled languages
- No persistent filesystem access from executed code

**Execution results include:**
- Separate stdout and stderr streams
- Compilation vs runtime error distinction
- Execution time (high-resolution timer)
- Exit code reporting
- Engine identification (local/judge0/wandbox)
- Runtime version display (e.g., `Node.js v20.19.6`, `Python 3.12.11`)

### Real-time Collaboration
- **CRDT-based editing** via Yjs — conflict-free concurrent edits
- **Remote cursor awareness** — see other users' cursors and selections
- **Real-time chat** with typing indicators and message persistence
- **User presence** bar with color-coded avatars

### Other Features
- 10 language support (JS, TS, Python, Java, C++, C, Go, Rust, Ruby, PHP)
- Dark VS Code-inspired theme with custom scrollbars
- Keyboard shortcuts: `Ctrl+Enter` (run), `Ctrl+B` (chat), `` Ctrl+` `` (output)
- Resizable panels (editor/chat/output)
- Stdin input panel for interactive programs
- JWT + anonymous session authentication
- Rate limiting on all endpoints + socket events
- Graceful degradation (works without MongoDB, without Judge0)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check + active room count |
| GET | `/api/rooms` | List active rooms |
| GET | `/api/languages` | Supported languages with engine info |
| POST | `/api/execute` | **Execute code** (rate limited) |
| POST | `/api/auth/anonymous` | Create anonymous session with unique name |
| POST | `/api/auth/check-name` | Check username availability |
| GET | `/api/auth/me` | Get current user info |
| GET | `/api/auth/validate` | Validate session token |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Editor | Monaco Editor (@monaco-editor/react) |
| CRDT | Yjs, y-protocols, lib0 |
| Real-time | Socket.io (client + server) |
| Backend | Express.js, Node.js 20 |
| Execution | Local sandbox (Node/Python/GCC/G++), Wandbox, Judge0 |
| Database | MongoDB + Mongoose (optional) |
| Auth | JWT + unique username registry |
| Security | Helmet, CORS, express-rate-limit |
| Process | PM2 |

## Deployment

### Frontend (Vercel)
```bash
cd client && npm run build
# Deploy via Vercel CLI or GitHub integration
```

### Backend (Railway, Render, Fly.io)
```bash
cd server
# Requires: Node.js 20+, Python 3, GCC/G++ for local execution
npm start
```

### Environment Variables

**Server (.env):**
- `PORT` — Server port (default: 4000)
- `MONGODB_URI` — MongoDB connection string
- `JWT_SECRET` — JWT signing secret
- `JUDGE0_API_KEY` — RapidAPI key for Judge0 (optional)
- `EXEC_TIMEOUT_MS` — Execution timeout in ms (default: 10000)
- `EXEC_MAX_OUTPUT` — Max output bytes (default: 65536)
- `CRDT_PERSIST_INTERVAL` — CRDT snapshot interval in seconds (default: 30)

**Client (.env.local):**
- `NEXT_PUBLIC_SERVER_URL` — Backend API URL
- `NEXT_PUBLIC_WS_URL` — WebSocket URL

## User Guide

1. **Create a Room** — Click "Create Room" on the landing page
2. **Share** — Click the room ID in the navbar to copy the shareable link
3. **Code Together** — Changes sync instantly with all participants
4. **Run Code** — Click Run or press `Ctrl+Enter`
5. **Use stdin** — Toggle the stdin panel in the output console for interactive programs
6. **Chat** — Use the right panel to communicate

## Status
- **Platform**: Self-hosted (Node.js + Next.js)
- **Status**: Active
- **Last Updated**: 2026-04-06
