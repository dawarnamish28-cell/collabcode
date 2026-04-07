# CollabCode - Real-Time Collaborative Coding Platform

A full-stack collaborative coding platform (Replit-like) with real-time editing, voice chat, 10 language runtimes, and instant code execution.

## Features

### Completed
- **Real-Time Collaborative Editing** - Yjs CRDT-based synchronization via Socket.io
  - Remote cursor/selection awareness with colored labels
  - Conflict-free concurrent editing (CRDT)
  - Monaco Editor with VS Code-like experience
- **10 Language Execution Engines** (all local, with stdin/input support):
  - JavaScript (Node.js 20), TypeScript (tsx), Python 3.12
  - Java (OpenJDK 17), C (GCC 12), C++ (G++ 12)
  - Go 1.19, Rust 1.63, Ruby 3.1, PHP 8.2
- **Interactive Terminal** - Separate stdout/stderr, stdin input panel, execution history, copy-to-clipboard
- **Sign Up / Sign In** - Email + password authentication with JWT tokens
- **Anonymous Access** - Unique username per browser tab (no login required)
- **Simple 6-Character Room Codes** - Easy to share (e.g., `ABC123`)
- **Voice Chat** - Optional WebRTC-based peer-to-peer audio
- **File Save/Open** - Download/upload files with correct language extensions
- **Real-Time Chat** - Message history, typing indicators, system messages
- **User Presence** - See who's online, their cursor positions
- **Keyboard Shortcuts** - Ctrl+Enter (run), Ctrl+S (save), Ctrl+O (open), Ctrl+B (chat), Ctrl+\` (terminal)
- **Resizable Panels** - Drag to resize chat sidebar and output console
- **Rate Limiting** - Per-endpoint rate limits for API security
- **MongoDB Persistence** - Room state, chat history, CRDT snapshots (graceful fallback to in-memory)

## Architecture

```
collabcode/
├── client/                    # Next.js 14 + React 18 Frontend
│   ├── components/
│   │   ├── Editor.js          # Monaco Editor + Yjs CRDT binding
│   │   ├── Navbar.js          # Room code, language selector, file ops
│   │   ├── Chat.js            # Real-time chat with typing indicators
│   │   ├── VoiceChat.js       # WebRTC voice chat
│   │   ├── OutputConsole.js   # Interactive terminal with stdin
│   │   ├── UserPresence.js    # Online users + cursor positions
│   │   └── RunButton.js       # Code execution trigger
│   ├── context/
│   │   └── AppContext.js      # Global state (user, room, auth)
│   ├── pages/
│   │   ├── index.js           # Landing page (create/join rooms)
│   │   ├── room/[id].js       # Collaborative workspace
│   │   └── _app.js            # App wrapper with providers
│   ├── utils/
│   │   ├── socket.js          # Socket.io client singleton
│   │   └── yjsProvider.js     # Custom Yjs provider over Socket.io
│   └── styles/globals.css     # Tailwind + custom editor styles
│
├── server/                    # Node.js + Express + Socket.io Backend
│   ├── controllers/
│   │   └── executionController.js  # Code execution for all 10 languages
│   ├── middleware/
│   │   ├── auth.js            # JWT auth + unique username generator
│   │   ├── errorHandler.js    # Centralized error handling
│   │   └── rateLimiter.js     # Express + Socket rate limiting
│   ├── models/
│   │   ├── Room.js            # Room model (Mongoose)
│   │   └── Message.js         # Chat message model
│   ├── routes/
│   │   ├── auth.js            # /api/auth/* (signup, signin, anonymous)
│   │   ├── execution.js       # /api/execute, /api/languages
│   │   └── files.js           # /api/files/save, /api/files/parse
│   ├── sockets/
│   │   └── roomHandler.js     # Socket.io room management + voice signaling
│   ├── config/
│   │   └── db.js              # MongoDB connection with retry
│   └── server.js              # Main Express + Socket.io server
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

### Files
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/files/save` | Generate downloadable file from code |
| POST | `/api/files/parse` | Parse uploaded file, detect language |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health check |
| GET | `/api/rooms` | List active rooms |

## Tech Stack

- **Frontend**: Next.js 14, React 18, Monaco Editor, Tailwind CSS, Yjs CRDT
- **Backend**: Node.js, Express, Socket.io, Mongoose (MongoDB)
- **Real-Time**: Socket.io (WebSocket + polling), Yjs CRDT
- **Voice Chat**: WebRTC with Socket.io signaling
- **Auth**: JWT tokens, bcrypt password hashing
- **Execution**: Isolated temp-dir sandbox per run, 10s timeout, SIGKILL enforcement

## Setup & Running

### Prerequisites
- Node.js 18+
- MongoDB (optional - runs in memory-only mode without it)
- Language runtimes: node, python3, gcc, g++, javac, go, rustc, ruby, php

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
```

Create `client/.env.local`:
```env
NEXT_PUBLIC_SERVER_URL=http://localhost:4000
```

## GitHub
- **Repository**: https://github.com/dawarnamish28-cell/collabcode

## Status
- **Platform**: Node.js (Express + Next.js)
- **Status**: Active
- **Last Updated**: 2026-04-07
