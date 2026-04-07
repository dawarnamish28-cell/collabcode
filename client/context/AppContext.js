/**
 * Application Context v2.0
 * 
 * Per-tab unique usernames: each browser tab generates a tabId,
 * which the server uses to assign a unique username.
 * Supports both anonymous and registered (email/password) users.
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

const initialState = {
  user: null, isAuthenticated: false,
  room: null, roomId: null, users: [],
  connectionStatus: 'disconnected',
  language: 'javascript', theme: 'vs-dark',
  sidebarOpen: true, chatOpen: true, outputOpen: true,
};

const ActionTypes = {
  SET_USER: 'SET_USER', SET_ROOM: 'SET_ROOM', SET_USERS: 'SET_USERS',
  ADD_USER: 'ADD_USER', REMOVE_USER: 'REMOVE_USER',
  SET_CONNECTION: 'SET_CONNECTION', SET_LANGUAGE: 'SET_LANGUAGE',
  SET_THEME: 'SET_THEME', TOGGLE_SIDEBAR: 'TOGGLE_SIDEBAR',
  TOGGLE_CHAT: 'TOGGLE_CHAT', TOGGLE_OUTPUT: 'TOGGLE_OUTPUT', RESET: 'RESET',
};

function appReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_USER: return { ...state, user: action.payload, isAuthenticated: !!action.payload?.authenticated };
    case ActionTypes.SET_ROOM: return { ...state, room: action.payload, roomId: action.payload?.roomId || null };
    case ActionTypes.SET_USERS: return { ...state, users: action.payload };
    case ActionTypes.ADD_USER:
      if (state.users.find(u => u.userId === action.payload.userId)) return state;
      return { ...state, users: [...state.users, action.payload] };
    case ActionTypes.REMOVE_USER: return { ...state, users: state.users.filter(u => u.userId !== action.payload) };
    case ActionTypes.SET_CONNECTION: return { ...state, connectionStatus: action.payload };
    case ActionTypes.SET_LANGUAGE: return { ...state, language: action.payload };
    case ActionTypes.SET_THEME: return { ...state, theme: action.payload };
    case ActionTypes.TOGGLE_SIDEBAR: return { ...state, sidebarOpen: !state.sidebarOpen };
    case ActionTypes.TOGGLE_CHAT: return { ...state, chatOpen: !state.chatOpen };
    case ActionTypes.TOGGLE_OUTPUT: return { ...state, outputOpen: !state.outputOpen };
    case ActionTypes.RESET: return { ...initialState, user: state.user };
    default: return state;
  }
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => { initSession(); }, []);

  async function initSession() {
    if (typeof window === 'undefined') return;

    // Per-tab unique ID: sessionStorage is tab-scoped!
    let tabId = sessionStorage.getItem('collabcode_tab_id');
    if (!tabId) {
      tabId = uuidv4();
      sessionStorage.setItem('collabcode_tab_id', tabId);
    }

    // Check if we have a registered user stored
    const storedAuth = localStorage.getItem('collabcode_auth');
    if (storedAuth) {
      try {
        const authData = JSON.parse(storedAuth);
        if (authData.token && authData.authenticated) {
          const res = await axios.get(`${SERVER_URL}/api/auth/validate`, {
            headers: { Authorization: `Bearer ${authData.token}` }, timeout: 3000,
          });
          if (res.data.valid) {
            dispatch({ type: ActionTypes.SET_USER, payload: { ...authData, tabId } });
            return;
          }
        }
      } catch (e) {
        localStorage.removeItem('collabcode_auth');
      }
    }

    // Otherwise, get anonymous session keyed by tabId
    // Each tab sends its own tabId → server returns unique username for each tab
    try {
      const res = await axios.post(`${SERVER_URL}/api/auth/anonymous`, { tabId }, { timeout: 5000 });
      const user = { ...res.data, tabId };
      sessionStorage.setItem('collabcode_user', JSON.stringify(user));
      dispatch({ type: ActionTypes.SET_USER, payload: user });
    } catch (err) {
      const fallback = {
        userId: uuidv4(), username: `User_${tabId.substring(0, 6)}`,
        color: '#3b82f6', token: '', authenticated: false, tabId,
      };
      sessionStorage.setItem('collabcode_user', JSON.stringify(fallback));
      dispatch({ type: ActionTypes.SET_USER, payload: fallback });
    }
  }

  const actions = {
    setUser: useCallback((user) => {
      if (typeof window !== 'undefined') {
        if (user?.authenticated) localStorage.setItem('collabcode_auth', JSON.stringify(user));
        sessionStorage.setItem('collabcode_user', JSON.stringify(user));
      }
      dispatch({ type: ActionTypes.SET_USER, payload: user });
    }, []),
    setRoom: useCallback((room) => dispatch({ type: ActionTypes.SET_ROOM, payload: room }), []),
    setUsers: useCallback((users) => dispatch({ type: ActionTypes.SET_USERS, payload: users }), []),
    addUser: useCallback((user) => dispatch({ type: ActionTypes.ADD_USER, payload: user }), []),
    removeUser: useCallback((userId) => dispatch({ type: ActionTypes.REMOVE_USER, payload: userId }), []),
    setConnectionStatus: useCallback((status) => dispatch({ type: ActionTypes.SET_CONNECTION, payload: status }), []),
    setLanguage: useCallback((lang) => dispatch({ type: ActionTypes.SET_LANGUAGE, payload: lang }), []),
    setTheme: useCallback((theme) => dispatch({ type: ActionTypes.SET_THEME, payload: theme }), []),
    toggleSidebar: useCallback(() => dispatch({ type: ActionTypes.TOGGLE_SIDEBAR }), []),
    toggleChat: useCallback(() => dispatch({ type: ActionTypes.TOGGLE_CHAT }), []),
    toggleOutput: useCallback(() => dispatch({ type: ActionTypes.TOGGLE_OUTPUT }), []),
    logout: useCallback(() => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('collabcode_auth');
        sessionStorage.removeItem('collabcode_user');
      }
      dispatch({ type: ActionTypes.RESET });
      // Re-init anonymous session
      setTimeout(() => window.location.reload(), 100);
    }, []),
    reset: useCallback(() => dispatch({ type: ActionTypes.RESET }), []),
  };

  return <AppContext.Provider value={{ state, ...actions }}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}

export default AppContext;
