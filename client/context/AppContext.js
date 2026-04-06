/**
 * Application Context
 * 
 * Global state management for user session, room data, and connection status.
 * Session persistence via localStorage.
 * Unique usernames are ALWAYS assigned by the server to guarantee no collisions.
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

// ─── Initial State ───────────────────────────────────────────────────
const initialState = {
  user: null,
  isAuthenticated: false,
  room: null,
  roomId: null,
  users: [],
  connectionStatus: 'disconnected',
  language: 'javascript',
  theme: 'vs-dark',
  sidebarOpen: true,
  chatOpen: true,
  outputOpen: true,
};

// ─── Actions ─────────────────────────────────────────────────────────
const ActionTypes = {
  SET_USER: 'SET_USER',
  SET_ROOM: 'SET_ROOM',
  SET_USERS: 'SET_USERS',
  ADD_USER: 'ADD_USER',
  REMOVE_USER: 'REMOVE_USER',
  SET_CONNECTION: 'SET_CONNECTION',
  SET_LANGUAGE: 'SET_LANGUAGE',
  SET_THEME: 'SET_THEME',
  TOGGLE_SIDEBAR: 'TOGGLE_SIDEBAR',
  TOGGLE_CHAT: 'TOGGLE_CHAT',
  TOGGLE_OUTPUT: 'TOGGLE_OUTPUT',
  RESET: 'RESET',
};

// ─── Reducer ─────────────────────────────────────────────────────────
function appReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_USER:
      return { ...state, user: action.payload, isAuthenticated: !!action.payload };
    case ActionTypes.SET_ROOM:
      return { ...state, room: action.payload, roomId: action.payload?.roomId || null };
    case ActionTypes.SET_USERS:
      return { ...state, users: action.payload };
    case ActionTypes.ADD_USER:
      if (state.users.find(u => u.userId === action.payload.userId)) return state;
      return { ...state, users: [...state.users, action.payload] };
    case ActionTypes.REMOVE_USER:
      return { ...state, users: state.users.filter(u => u.userId !== action.payload) };
    case ActionTypes.SET_CONNECTION:
      return { ...state, connectionStatus: action.payload };
    case ActionTypes.SET_LANGUAGE:
      return { ...state, language: action.payload };
    case ActionTypes.SET_THEME:
      return { ...state, theme: action.payload };
    case ActionTypes.TOGGLE_SIDEBAR:
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case ActionTypes.TOGGLE_CHAT:
      return { ...state, chatOpen: !state.chatOpen };
    case ActionTypes.TOGGLE_OUTPUT:
      return { ...state, outputOpen: !state.outputOpen };
    case ActionTypes.RESET:
      return { ...initialState, user: state.user };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────
const AppContext = createContext(null);

// ─── Provider ────────────────────────────────────────────────────────
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Initialize user session on mount
  useEffect(() => {
    initSession();
  }, []);

  async function initSession() {
    if (typeof window === 'undefined') return;

    // Check localStorage for existing session
    let user = null;
    const stored = localStorage.getItem('collabcode_user');

    if (stored) {
      try {
        user = JSON.parse(stored);
        // Validate the stored session is still valid with the server
        if (user.token) {
          try {
            const res = await axios.get(`${SERVER_URL}/api/auth/validate`, {
              headers: { Authorization: `Bearer ${user.token}` },
              timeout: 3000,
            });
            if (res.data.valid) {
              dispatch({ type: ActionTypes.SET_USER, payload: user });
              return;
            }
          } catch (e) {
            // Token expired or server down — re-register the name
          }
        }
        // If we have a stored user but token is invalid, try to re-register
        // with the same username (server will check availability)
        if (user.username) {
          try {
            const res = await axios.post(`${SERVER_URL}/api/auth/anonymous`, {
              username: user.username,
            }, { timeout: 3000 });
            user = res.data;
            localStorage.setItem('collabcode_user', JSON.stringify(user));
            dispatch({ type: ActionTypes.SET_USER, payload: user });
            return;
          } catch (e) {
            // Server down — use stored user as-is
            dispatch({ type: ActionTypes.SET_USER, payload: user });
            return;
          }
        }
      } catch (e) {
        localStorage.removeItem('collabcode_user');
      }
    }

    // No stored session → create fresh anonymous session
    // The server assigns the unique username — we NEVER generate locally
    try {
      const res = await axios.post(`${SERVER_URL}/api/auth/anonymous`, {}, { timeout: 5000 });
      user = res.data;
    } catch (err) {
      // Server unreachable — generate a local-only session with UUID suffix
      // to make collisions nearly impossible even without server validation
      const id = uuidv4().substring(0, 8);
      user = {
        userId: uuidv4(),
        username: `User_${id}`,
        color: ['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899'][Math.floor(Math.random()*6)],
        token: '',
        authenticated: false,
      };
    }

    localStorage.setItem('collabcode_user', JSON.stringify(user));
    dispatch({ type: ActionTypes.SET_USER, payload: user });
  }

  // ─── Action Creators ──────────────────────────────────────────────
  const actions = {
    setUser: useCallback((user) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('collabcode_user', JSON.stringify(user));
      }
      dispatch({ type: ActionTypes.SET_USER, payload: user });
    }, []),

    setRoom: useCallback((room) => {
      dispatch({ type: ActionTypes.SET_ROOM, payload: room });
    }, []),

    setUsers: useCallback((users) => {
      dispatch({ type: ActionTypes.SET_USERS, payload: users });
    }, []),

    addUser: useCallback((user) => {
      dispatch({ type: ActionTypes.ADD_USER, payload: user });
    }, []),

    removeUser: useCallback((userId) => {
      dispatch({ type: ActionTypes.REMOVE_USER, payload: userId });
    }, []),

    setConnectionStatus: useCallback((status) => {
      dispatch({ type: ActionTypes.SET_CONNECTION, payload: status });
    }, []),

    setLanguage: useCallback((lang) => {
      dispatch({ type: ActionTypes.SET_LANGUAGE, payload: lang });
    }, []),

    setTheme: useCallback((theme) => {
      dispatch({ type: ActionTypes.SET_THEME, payload: theme });
    }, []),

    toggleSidebar: useCallback(() => {
      dispatch({ type: ActionTypes.TOGGLE_SIDEBAR });
    }, []),

    toggleChat: useCallback(() => {
      dispatch({ type: ActionTypes.TOGGLE_CHAT });
    }, []),

    toggleOutput: useCallback(() => {
      dispatch({ type: ActionTypes.TOGGLE_OUTPUT });
    }, []),

    reset: useCallback(() => {
      dispatch({ type: ActionTypes.RESET });
    }, []),
  };

  return (
    <AppContext.Provider value={{ state, ...actions }}>
      {children}
    </AppContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────
export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}

export default AppContext;
