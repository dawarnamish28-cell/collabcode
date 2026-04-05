# CollabCode - Collaborative Coding Platform

A full-stack, browser-based collaborative coding platform similar to Replit with real-time multi-user editing, chat, and secure code execution.

## Live URLs

- **Frontend**: https://3000-inq8qfxj1gt1z5ghzjucu-0e616f0a.sandbox.novita.ai
- **Backend API**: https://4000-inq8qfxj1gt1z5ghzjucu-0e616f0a.sandbox.novita.ai
- **Health Check**: https://4000-inq8qfxj1gt1z5ghzjucu-0e616f0a.sandbox.novita.ai/api/health

## Architecture

```
collabcode/
├── client/                    # Next.js + React Frontend
│   ├── pages/
│   │   ├── _app.js            # App wrapper with global providers
│   │   ├── index.js           # Landing page (create/join rooms)
│   │   └── room/[id].js       # Collaborative workspace
│   ├── components/
│   │   ├── Editor.js          # Monaco Editor + Yjs CRDT binding
│   │   ├── Chat.js            # Real-time chat UI
│   │   ├── UserPresence.js    # Active users + cursor indicators
│   │   ├── Navbar.js          # Top bar: room ID, language, status
│   │   ├── RunButton.js       # Code execution trigger
│   │   └── OutputConsole.js   # Execution output display
│   ├── utils/
│   │   ├── socket.js          # Socket.io client singleton
│   │   └── yjsProvider.js     # Yjs + Socket.io CRDT provider
│   ├── context/
│   │   └── AppContext.js      # Global state (user/session/room)
│   └── styles/
│       └── globals.css        # Tailwind CSS + custom styles
│
├── server/                    # Node.js + Express Backend
│   ├── server.js              # Express + HTTP + Socket.io setup
│   ├── sockets/
│   │   └── roomHandler.js     # Room join/leave, CRDT relay, awareness
│   ├── controllers/
│   │   └── executionController.js  # Judge0 API proxy
│   ├── routes/
│   │   ├── execution.js       # POST /api/execute
│   │   └── auth.js            # Anonymous/JWT authentication
│   ├── models/
│   │   ├── Room.js            # Room schema (CRDT state, participants)
│   │   └── Message.js         # Chat message schema
│   ├── middleware/
│   │   ├── auth.js            # JWT + anonymous session auth
│   │   ├── rateLimiter.js     # Express + Socket rate limiters
│   │   └── errorHandler.js    # Centralized error handling
│   └── config/
│       └── db.js              # MongoDB connection with fallback
│
└── ecosystem.config.cjs       # PM2 process configuration
```

## Features

### Completed
- **Real-time Collaborative Editing**: Monaco Editor integrated with Yjs CRDT for conflict-free concurrent editing
- **CRDT Synchronization**: Binary Yjs updates relayed via Socket.io for low-latency sync
- **Remote Cursor Awareness**: See other users' cursor positions and selections in real-time
- **Real-time Chat**: Persistent chat with typing indicators, system messages, and message history
- **User Presence**: Active user list with color-coded avatars and cursor position badges
- **Code Execution**: Judge0 API integration with mock executor for development mode
- **10 Language Support**: JavaScript, TypeScript, Python, Java, C++, C, Go, Rust, Ruby, PHP
- **Anonymous Sessions**: Auto-generated usernames and colors, no signup required
- **JWT Authentication**: Optional JWT-based auth with token generation
- **Room Management**: Create/join rooms by ID, active room listing, room persistence
- **CRDT Persistence**: Periodic state snapshots to MongoDB (every 30s + on disconnect)
- **Rate Limiting**: Per-endpoint and per-socket rate limiters for abuse prevention
- **Dark Theme**: VS Code-inspired dark theme with custom scrollbars
- **Keyboard Shortcuts**: Ctrl+Enter (run), Ctrl+B (toggle chat), Ctrl+` (toggle output)
- **Resizable Panels**: Drag-to-resize editor/chat/output panels
- **Responsive Design**: Adaptive layout with collapsible panels
- **Connection Recovery**: Automatic reconnection with state re-sync
- **Error Handling**: Graceful degradation (works without MongoDB, without Judge0)

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check + active room count |
| GET | `/api/rooms` | List active rooms |
| GET | `/api/languages` | Supported programming languages |
| POST | `/api/execute` | Execute code (rate limited) |
| POST | `/api/auth/anonymous` | Create anonymous session |
| GET | `/api/auth/me` | Get current user info |
| GET | `/api/auth/validate` | Validate session token |

### Socket.io Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `room:join` | Client -> Server | Join a room |
| `room:state` | Server -> Client | Initial room state (CRDT + users) |
| `room:user-joined` | Server -> Client | User joined notification |
| `room:user-left` | Server -> Client | User left notification |
| `crdt:update` | Bidirectional | Binary Yjs document updates |
| `awareness:update` | Bidirectional | Cursor/selection state |
| `chat:send` | Client -> Server | Send chat message |
| `chat:message` | Server -> Client | Receive chat message |
| `chat:history` | Server -> Client | Chat message history |
| `chat:typing` | Bidirectional | Typing indicator |
| `room:language-change` | Bidirectional | Language change broadcast |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Editor | Monaco Editor (@monaco-editor/react) |
| CRDT | Yjs, y-protocols, lib0 |
| Real-time | Socket.io (client + server) |
| Backend | Express.js, Node.js |
| Database | MongoDB + Mongoose (optional) |
| Auth | JWT (jsonwebtoken), Anonymous sessions |
| Execution | Judge0 CE API (RapidAPI) |
| Security | Helmet, CORS, express-rate-limit |
| Process Manager | PM2 |

## Deployment

### Frontend (Vercel)
```bash
cd client
npm run build
# Deploy via Vercel CLI or GitHub integration
```

### Backend (Node.js Cloud - Railway, Render, Fly.io)
```bash
cd server
# Set environment variables:
# MONGODB_URI, JWT_SECRET, JUDGE0_API_KEY, CLIENT_URL
npm start
```

### Environment Variables

**Server (.env)**:
- `PORT` - Server port (default: 4000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `JUDGE0_API_KEY` - RapidAPI key for Judge0
- `JUDGE0_API_HOST` - Judge0 API host
- `CRDT_PERSIST_INTERVAL` - Seconds between CRDT snapshots (default: 30)
- `CLIENT_URL` - Frontend URL for CORS

**Client (.env.local)**:
- `NEXT_PUBLIC_SERVER_URL` - Backend API URL
- `NEXT_PUBLIC_WS_URL` - WebSocket URL

## Data Models

### Room
- `roomId` (string, unique) - Room identifier
- `name` (string) - Display name
- `language` (enum) - Programming language
- `participants` (array) - Active user list
- `crdtState` (Buffer) - Encoded Yjs document state
- `lastCodeSnapshot` (string) - Plain-text code backup
- `activeCount` (number) - Current user count

### Message
- `roomId` (string) - Associated room
- `userId`, `username` (string) - Sender info
- `content` (string, max 2000) - Message text
- `type` (enum: chat/system/code-share) - Message type
- TTL: Auto-deleted after 7 days

## User Guide

1. **Create a Room**: Click "Create Room" on the landing page, optionally select a language
2. **Join a Room**: Enter a room ID or click an active room from the list
3. **Share**: Click the room ID in the navbar to copy the shareable link
4. **Code**: Type in the editor - changes sync instantly with all participants
5. **Run Code**: Click the green Run button or press `Ctrl+Enter`
6. **Chat**: Use the right panel to communicate with collaborators
7. **Change Language**: Use the language dropdown in the navbar

## Status
- **Platform**: Self-hosted (Node.js + Next.js)
- **Status**: Active (Development Mode)
- **Last Updated**: 2026-04-05
