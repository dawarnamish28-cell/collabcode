# CollabCode - Real-Time Collaborative Coding Platform

A full-stack collaborative coding platform (Replit-like) with real-time editing, voice/video chat, 20 language runtimes, admin dashboard, competition mode, and instant code execution.

## Features

### Core
- **Real-Time Collaborative Editing** — Yjs CRDT-based synchronization via Socket.io
  - Remote cursor/selection awareness with colored labels
  - Conflict-free concurrent editing (CRDT)
  - Monaco Editor with VS Code-like experience + IntelliSense for 6 languages
- **20 Language Execution Engines** (all local, with stdin/input support):
  - JavaScript, TypeScript, Python 3, Java, C, C++, Go, Rust, Ruby, PHP
  - Bash, Perl, Lua, R, Swift, Kotlin, Scala, Haskell, Elixir, Dart
- **Interactive Terminal** — Separate stdout/stderr, stdin input panel, execution history, structured error display
- **Voice Chat** — WebRTC peer-to-peer audio with mute/deafen controls
- **Video Chat** — WebRTC peer-to-peer video with camera toggle, screen awareness
- **Real-Time Chat** — Message history, typing indicators, system messages, URL detection
- **User Presence** — See who's online, their cursor positions, color-coded

### Authentication & Access
- **Sign Up / Sign In** — Email + password authentication with JWT tokens
- **Anonymous Access** — Unique username per browser tab (no login required)
- **Simple 6-Character Room Codes** — Easy to share (e.g., `ABC123`)

### Editor & Files
- **File Save/Open** — Download/upload files with correct language extensions
- **Keyboard Shortcuts** — Ctrl+Enter (run), Ctrl+S (save), Ctrl+O (open), Ctrl+B (chat), Ctrl+` (terminal)
- **Resizable Panels** — Drag to resize chat sidebar and output console
- **Code Completion** — IntelliSense providers for JS, TS, Python, Java, C/C++, Go

### Admin & Competition
- **Admin Dashboard** (`/admin`) — Tabbed UI with Overview, Rooms & Users, Admin Tools, Bans
  - Broadcast messages to all users (info/warning/success types)
  - Force disconnect all users with reason
  - Room data export as JSON
  - Quick room link generator with language selector
  - Server resource monitoring (memory, CPU, uptime)
  - Admin activity log (session-based)
  - User ban/unban system
  - Room rename and user kick
  - Violation tracking
- **Competition Mode** — Lock/unlock editing, timed competitions, submission controls

### Infrastructure
- **Rate Limiting** — Per-endpoint rate limits for API security
- **MongoDB Persistence** — Room state, chat history, CRDT snapshots (graceful fallback to in-memory)
- **Graceful Shutdown** — 5-phase coordinated shutdown with connection draining
- **Memory Monitoring** — Heap pressure detection with auto GC trigger
- **Connection Rate Limiting** — Max connections per IP on Socket.IO

## Architecture

```
collabcode/
├── client/                    # Next.js 14 + React 18 Frontend
│   ├── components/
│   │   ├── Editor.js          # Monaco Editor + Yjs CRDT + IntelliSense (v8)
│   │   ├── Navbar.js          # Room code, language selector, file ops (v15)
│   │   ├── Chat.js            # Real-time chat with typing indicators (v16)
│   │   ├── VoiceChat.js       # WebRTC voice chat (v13)
│   │   ├── VideoChat.js       # WebRTC video chat (v10)
│   │   ├── OutputConsole.js   # Interactive terminal with structured errors (v17)
│   │   ├── UserPresence.js    # Online users + cursor positions
│   │   └── RunButton.js       # Code execution trigger
│   ├── context/
│   │   └── AppContext.js      # Global state (user, room, auth) (v3)
│   ├── pages/
│   │   ├── index.js           # Landing page (create/join rooms)
│   │   ├── room/[id].js       # Collaborative workspace (v21)
│   │   └── _app.js            # App wrapper with providers
│   ├── utils/
│   │   ├── socket.js          # Socket.io client singleton (v3)
│   │   └── yjsProvider.js     # Custom Yjs provider over Socket.io (v3)
│   └── styles/globals.css     # Tailwind + custom editor styles
│
├── server/                    # Node.js + Express + Socket.io Backend
│   ├── controllers/
│   │   └── executionController.js  # Code execution for 20 languages
│   ├── middleware/
│   │   ├── auth.js            # JWT auth + unique username generator (v2)
│   │   ├── errorHandler.js    # Centralized error handling
│   │   └── rateLimiter.js     # Express + Socket rate limiting
│   ├── models/
│   │   ├── Room.js            # Room model (Mongoose)
│   │   └── Message.js         # Chat message model
│   ├── routes/
│   │   ├── admin.js           # Admin API endpoints (v3)
│   │   ├── auth.js            # /api/auth/* (signup, signin, anonymous)
│   │   ├── execution.js       # /api/execute, /api/languages
│   │   ├── files.js           # /api/files/save, /api/files/parse
│   │   ├── gallery.js         # Public room gallery
│   │   ├── workspaces.js      # Saved workspace management
│   │   └── teams.js           # Team management
│   ├── sockets/
│   │   └── roomHandler.js     # Socket.io room management + voice/video signaling (v13)
│   ├── config/
│   │   └── db.js              # MongoDB connection with retry
│   ├── public/
│   │   └── admin.html         # Admin dashboard UI
│   └── server.js              # Main Express + Socket.io server (v11)
│
├── ecosystem.config.cjs       # PM2 process management config
└── README.md
```

## API Routes

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Register with email, password, username |
| POST | `/api/auth/signin` | Login with email, password |
| POST | `/api/auth/anonymous` | Create anonymous session (per-tab unique) |
| GET | `/api/auth/validate` | Validate JWT session |
| POST | `/api/auth/check-name` | Check username availability |

### Code Execution
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/execute` | Execute code with optional stdin |
| GET | `/api/languages` | List supported languages with versions |

### Files & Workspaces
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/files/save` | Generate downloadable file from code |
| POST | `/api/files/parse` | Parse uploaded file, detect language |
| GET/POST | `/api/workspaces/*` | Saved workspace CRUD |
| GET/POST | `/api/teams/*` | Team management |

### Admin (all require admin auth cookie)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin` | Admin dashboard HTML |
| POST | `/admin/api/login` | Admin login |
| GET | `/admin/api/stats` | Server stats overview |
| GET | `/admin/api/rooms` | Detailed room list |
| POST | `/admin/api/broadcast` | Send message to all users |
| POST | `/admin/api/force-disconnect` | Disconnect all users |
| GET | `/admin/api/export/rooms` | Export room data as JSON |
| GET | `/admin/api/stats/executions` | Execution engine stats |
| POST | `/admin/api/ban/:userId` | Ban user (session) |
| POST | `/admin/api/unban/:userId` | Unban user |
| GET | `/admin/api/bans` | List banned users |
| POST | `/admin/api/rooms/:roomId/rename` | Rename a room |
| POST | `/admin/api/rooms/:roomId/kick/:userId` | Kick user from room |
| POST | `/admin/api/competition/lock` | Lock/unlock competition |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health + diagnostics |
| GET | `/api/rooms` | List active rooms |
| GET | `/api/rooms/:roomId/check` | Check if room exists |
| GET | `/api/gallery` | Public room gallery |

## Tech Stack

- **Frontend**: Next.js 14, React 18, Monaco Editor, Tailwind CSS, Yjs CRDT
- **Backend**: Node.js 20, Express 4.18, Socket.IO 4.7, Mongoose 8 (MongoDB)
- **Real-Time**: Socket.IO (WebSocket + polling), Yjs CRDT
- **Voice/Video Chat**: WebRTC with Socket.IO signaling, polite peer pattern
- **Auth**: JWT tokens, bcrypt password hashing
- **Execution**: Isolated temp-dir sandbox per run, 10s timeout, SIGKILL enforcement, 20 languages
- **Process Management**: PM2 with memory limits (256MB server, 512MB client)

## Setup & Running

### Prerequisites
- Node.js 18+
- MongoDB (optional — runs in memory-only mode without it)
- Language runtimes: node, python3, gcc, g++, javac, go, rustc, ruby, php, bash, perl, lua, Rscript, swift, kotlin, scala, ghc, elixir, dart

### Install
```bash
# Install server dependencies
cd server && npm install

# Install client dependencies
cd client && npm install
```

### Development
```bash
# Start both services with PM2
pm2 start ecosystem.config.cjs

# Or start individually
cd server && node server.js      # Backend on port 4000
cd client && npm run dev          # Frontend on port 3000
```

### Environment Variables
Create `server/.env`:
```env
PORT=4000
CLIENT_URL=http://localhost:3000
MONGODB_URI=mongodb://127.0.0.1:27017/collabcode
JWT_SECRET=your-secret-key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-admin-password
```

Create `client/.env.local`:
```env
NEXT_PUBLIC_SERVER_URL=http://localhost:4000
```

## Version History

| Version | Phase | Changes |
|---------|-------|---------|
| v21 | Phase 4 | WebRTC voice/video fix, language default fix, enhanced admin dashboard |
| v20 | Phase 3 | Structured error display, IntelliSense, room code UX hardening |
| v17 | Phase 2 | Video chat, competition mode, admin panel, output console v17 |
| v13 | Phase 1 | Chat polish, 20 languages, gallery, workspaces, teams |
| v1-v8 | Initial | Core platform: editor, CRDT, voice chat, auth, 10 languages |

## GitHub
- **Repository**: https://github.com/dawarnamish28-cell/collabcode

## Status
- **Platform**: Node.js (Express + Next.js)
- **Status**: Active
- **Last Updated**: 2026-05-18
- **Latest Commit**: v21 Phase 4

made with <3 by Namish
