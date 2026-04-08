/**
 * Landing Page v3.0
 * 
 * Improvements:
 * - Cleaner layout with better spacing
 * - Language version display
 * - Better auth modal with validation feedback
 * - Animated feature cards
 * - Mobile responsive
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAppContext } from '../context/AppContext';
import axios from 'axios';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

const LANGUAGES = [
  { id: 'javascript', name: 'JavaScript', icon: 'JS', color: '#f7df1e', bg: '#f7df1e15' },
  { id: 'typescript', name: 'TypeScript', icon: 'TS', color: '#3178c6', bg: '#3178c615' },
  { id: 'python', name: 'Python', icon: 'PY', color: '#3776ab', bg: '#3776ab15' },
  { id: 'java', name: 'Java', icon: 'JV', color: '#ed8b00', bg: '#ed8b0015' },
  { id: 'cpp', name: 'C++', icon: 'C+', color: '#00599c', bg: '#00599c15' },
  { id: 'c', name: 'C', icon: 'C', color: '#a8b9cc', bg: '#a8b9cc15' },
  { id: 'go', name: 'Go', icon: 'GO', color: '#00add8', bg: '#00add815' },
  { id: 'rust', name: 'Rust', icon: 'RS', color: '#ce412b', bg: '#ce412b15' },
  { id: 'ruby', name: 'Ruby', icon: 'RB', color: '#cc342d', bg: '#cc342d15' },
  { id: 'php', name: 'PHP', icon: 'PH', color: '#777bb4', bg: '#777bb415' },
];

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default function Home() {
  const router = useRouter();
  const { state, setUser } = useAppContext();
  const [joinCode, setJoinCode] = useState('');
  const [selectedLang, setSelectedLang] = useState('python');
  const [activeRooms, setActiveRooms] = useState([]);
  const [error, setError] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [langVersions, setLangVersions] = useState({});

  useEffect(() => {
    fetchActiveRooms();
    fetchLanguages();
  }, []);

  async function fetchActiveRooms() {
    try {
      const res = await axios.get(`${SERVER_URL}/api/rooms`);
      setActiveRooms(res.data.rooms || []);
    } catch (err) {}
  }

  async function fetchLanguages() {
    try {
      const res = await axios.get(`${SERVER_URL}/api/languages`);
      const versions = {};
      (res.data.languages || []).forEach(l => { versions[l.id] = l.version; });
      setLangVersions(versions);
    } catch (err) {}
  }

  function handleCreateRoom() {
    const code = generateRoomCode();
    router.push(`/room/${code}?lang=${selectedLang}`);
  }

  function handleJoinRoom(e) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) { setError('Enter a room code'); return; }
    if (code.length < 3) { setError('Code too short'); return; }
    router.push(`/room/${code}`);
  }

  async function handleAuth(e) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/signin';
      const body = authMode === 'signup'
        ? { email: authForm.email, password: authForm.password, username: authForm.username }
        : { email: authForm.email, password: authForm.password };
      const res = await axios.post(`${SERVER_URL}${endpoint}`, body);
      const user = res.data;
      setUser(user);
      setShowAuth(false);
      setAuthForm({ email: '', password: '', username: '' });
    } catch (err) {
      setAuthError(err.response?.data?.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d1117] via-[#161b22] to-[#0d1117] flex flex-col">
      {/* Header */}
      <header className="border-b border-editor-border/30 backdrop-blur-sm bg-black/20 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-blue-600/20">{'<>'}</div>
            <h1 className="text-lg font-bold text-white">CollabCode</h1>
          </div>
          <div className="flex items-center gap-3">
            {state.user && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: state.user.color }} />
                <span className="text-xs">{state.user.username}</span>
                {state.user.authenticated && <span className="text-[9px] px-1.5 py-0.5 bg-green-600/20 text-green-400 rounded-full font-medium">PRO</span>}
              </div>
            )}
            {state.isAuthenticated ? (
              <button onClick={() => { localStorage.removeItem('collabcode_auth'); window.location.reload(); }}
                className="text-xs px-3 py-1.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition">Sign Out</button>
            ) : (
              <button onClick={() => setShowAuth(true)}
                className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition font-medium shadow-lg shadow-blue-600/20">Sign In</button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-5xl font-bold text-white mb-4 leading-tight">
              Code Together,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">In Real-Time</span>
            </h2>
            <p className="text-sm sm:text-lg text-gray-400 max-w-2xl mx-auto">
              Collaborative code editor with real-time editing, voice chat, 10 language runtimes with input() support, and instant execution.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-6 mb-10">
            {/* Create Room */}
            <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-5 sm:p-6 hover:border-blue-500/40 transition-all group">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <h3 className="text-lg font-semibold text-white">Create Room</h3>
              </div>
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-2">Choose Language</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {LANGUAGES.map(lang => (
                    <button key={lang.id} onClick={() => setSelectedLang(lang.id)}
                      className={`relative px-1 py-2 rounded-lg text-xs font-mono font-bold transition-all ${selectedLang === lang.id
                        ? 'text-white ring-2 ring-blue-400/50 shadow-lg'
                        : 'text-gray-400 hover:text-white border border-editor-border/30 hover:border-gray-500'}`}
                      style={selectedLang === lang.id ? { backgroundColor: lang.color + '30' } : { backgroundColor: '#0d1117' }}
                      title={`${lang.name}${langVersions[lang.id] ? ` — ${langVersions[lang.id]}` : ''}`}>
                      <span style={{ color: selectedLang === lang.id ? lang.color : undefined }}>{lang.icon}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600 mt-1.5">
                  {LANGUAGES.find(l => l.id === selectedLang)?.name}
                  {langVersions[selectedLang] && <span className="ml-1 text-gray-700">({langVersions[selectedLang]?.split(' ')[0]?.split('(')[0]})</span>}
                </p>
              </div>
              <button onClick={handleCreateRoom}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]">
                Create Room
              </button>
            </div>

            {/* Join Room */}
            <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-5 sm:p-6 hover:border-purple-500/40 transition-all">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <h3 className="text-lg font-semibold text-white">Join Room</h3>
              </div>
              <form onSubmit={handleJoinRoom}>
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 mb-2">Room Code</label>
                  <input type="text" value={joinCode}
                    onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
                    placeholder="ABC123" maxLength={6}
                    className="w-full px-4 py-3 bg-[#0d1117] border border-editor-border/40 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono text-center text-2xl tracking-[0.3em] uppercase" />
                  {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
                </div>
                <button type="submit" className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-purple-600/20 active:scale-[0.98]">Join Room</button>
              </form>
            </div>
          </div>

          {/* Active Rooms */}
          {activeRooms.length > 0 && (
            <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-5 mb-8">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Active Rooms</h3>
              <div className="space-y-1.5">
                {activeRooms.map(room => (
                  <button key={room.roomId} onClick={() => router.push(`/room/${room.roomId}`)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0d1117] hover:bg-[#21262d] rounded-xl transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-sm font-mono text-gray-300 tracking-wider">{room.roomId}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{room.userCount} user{room.userCount !== 1 ? 's' : ''}</span>
                      <svg className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Features */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
            {[
              { icon: '⚡', label: 'Real-time Sync', desc: 'CRDT-based' },
              { icon: '🎙️', label: 'Voice Chat', desc: 'WebRTC P2P' },
              { icon: '▶️', label: '10 Languages', desc: 'Local exec' },
              { icon: '💾', label: 'Save/Open', desc: 'File I/O' },
              { icon: '🔐', label: 'Auth', desc: 'Sign Up/In' },
            ].map((feat, i) => (
              <div key={i} className="text-center py-3 px-2 bg-[#161b22]/50 rounded-xl border border-editor-border/20">
                <div className="text-xl mb-1">{feat.icon}</div>
                <div className="text-xs font-medium text-gray-300">{feat.label}</div>
                <div className="text-[10px] text-gray-600">{feat.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Auth Modal */}
      {showAuth && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowAuth(false); setAuthError(''); } }}>
          <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-6 w-full max-w-md relative animate-fade-in">
            <button onClick={() => { setShowAuth(false); setAuthError(''); }}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2a2d2e]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="text-xl font-bold text-white mb-1">{authMode === 'signup' ? 'Create Account' : 'Welcome Back'}</h3>
            <p className="text-sm text-gray-500 mb-6">{authMode === 'signup' ? 'Sign up to save your settings' : 'Sign in to your account'}</p>
            <form onSubmit={handleAuth} className="space-y-3">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Username</label>
                  <input type="text" placeholder="e.g. CodeNinja" value={authForm.username}
                    onChange={(e) => setAuthForm(p => ({ ...p, username: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-[#0d1117] border border-editor-border/40 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500/50 focus:outline-none text-sm" required minLength={3} maxLength={20} />
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email</label>
                <input type="email" placeholder="you@example.com" value={authForm.email}
                  onChange={(e) => setAuthForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-[#0d1117] border border-editor-border/40 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500/50 focus:outline-none text-sm" required />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Password</label>
                <input type="password" placeholder="Min 6 characters" value={authForm.password}
                  onChange={(e) => setAuthForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-[#0d1117] border border-editor-border/40 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500/50 focus:outline-none text-sm" required minLength={6} />
              </div>
              {authError && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-600/10 border border-red-600/20 rounded-lg px-3 py-2">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {authError}
                </div>
              )}
              <button type="submit" disabled={authLoading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition disabled:opacity-50 shadow-lg shadow-blue-600/20 mt-2">
                {authLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Loading...
                  </span>
                ) : (authMode === 'signup' ? 'Create Account' : 'Sign In')}
              </button>
            </form>
            <p className="text-center text-sm text-gray-500 mt-4">
              {authMode === 'signup' ? 'Already have an account?' : "Don't have an account?"}
              <button onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthError(''); }}
                className="text-blue-400 ml-1 hover:underline font-medium">{authMode === 'signup' ? 'Sign In' : 'Sign Up'}</button>
            </p>
            <p className="text-center text-[10px] text-gray-700 mt-3">
              Or skip sign-in — anonymous access with unique username per tab
            </p>
          </div>
        </div>
      )}

      <footer className="border-t border-editor-border/20 py-3 text-center text-xs text-gray-600">
        CollabCode &mdash; Real-time Collaborative Coding Platform
      </footer>
    </div>
  );
}
