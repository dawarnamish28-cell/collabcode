/**
 * Landing Page v5.0
 * 
 * Major update:
 * - Public rooms listing on home screen
 * - Code gallery for sharing projects
 * - Room validation (no room found for invalid codes)
 * - 15 languages
 * - Remember me auth
 * - "made with <3 by Namish" branding
 */

import { useState, useEffect, useCallback } from 'react';
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
  { id: 'perl', name: 'Perl', icon: 'PL', color: '#39457e', bg: '#39457e15' },
  { id: 'r', name: 'R', icon: 'R', color: '#276dc3', bg: '#276dc315' },
  { id: 'bash', name: 'Bash', icon: 'SH', color: '#4eaa25', bg: '#4eaa2515' },
  { id: 'shell', name: 'Shell', icon: '$', color: '#89e051', bg: '#89e05115' },
  { id: 'awk', name: 'AWK', icon: 'AW', color: '#c4a000', bg: '#c4a00015' },
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
  const [isPublicRoom, setIsPublicRoom] = useState(false);
  const [publicRooms, setPublicRooms] = useState([]);
  const [error, setError] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: '', remember: true });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [langVersions, setLangVersions] = useState({});
  const [tab, setTab] = useState('rooms'); // 'rooms' | 'gallery'
  const [gallery, setGallery] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareForm, setShareForm] = useState({ title: '', description: '', code: '', language: 'python' });
  const [shareLoading, setShareLoading] = useState(false);
  const [selectedSnippet, setSelectedSnippet] = useState(null);

  useEffect(() => {
    fetchPublicRooms();
    fetchLanguages();
    fetchGallery();
  }, []);

  async function fetchPublicRooms() {
    try {
      const res = await axios.get(`${SERVER_URL}/api/rooms?public=true`);
      setPublicRooms(res.data.rooms || []);
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

  async function fetchGallery() {
    setGalleryLoading(true);
    try {
      const res = await axios.get(`${SERVER_URL}/api/gallery`);
      setGallery(res.data.snippets || []);
    } catch (err) {} finally { setGalleryLoading(false); }
  }

  function handleCreateRoom() {
    const code = generateRoomCode();
    router.push(`/room/${code}?lang=${selectedLang}&public=${isPublicRoom}`);
  }

  async function handleJoinRoom(e) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) { setError('Enter a room code'); return; }
    if (code.length < 3) { setError('Code too short'); return; }

    setJoinLoading(true);
    setError('');
    try {
      const res = await axios.get(`${SERVER_URL}/api/rooms/${code}/check`);
      if (res.data.exists) {
        router.push(`/room/${code}`);
      } else {
        setError('No room found with this code. Create a new room instead.');
      }
    } catch (err) {
      // If API fails, still try to join (room might not be in memory yet)
      setError('No room found. Check the code or create a new room.');
    } finally {
      setJoinLoading(false);
    }
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
      // Remember me: store in localStorage
      if (authForm.remember) {
        localStorage.setItem('collabcode_auth', JSON.stringify(user));
      }
      setShowAuth(false);
      setAuthForm({ email: '', password: '', username: '', remember: true });
    } catch (err) {
      setAuthError(err.response?.data?.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleShareCode(e) {
    e.preventDefault();
    if (!shareForm.title || !shareForm.code) return;
    setShareLoading(true);
    try {
      const headers = {};
      if (state.user?.token) headers['Authorization'] = `Bearer ${state.user.token}`;
      headers['x-tab-id'] = state.user?.tabId || '';
      await axios.post(`${SERVER_URL}/api/gallery`, shareForm, { headers });
      setShowShareModal(false);
      setShareForm({ title: '', description: '', code: '', language: 'python' });
      fetchGallery();
    } catch (err) {} finally { setShareLoading(false); }
  }

  const getLangInfo = (id) => LANGUAGES.find(l => l.id === id) || LANGUAGES[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d1117] via-[#161b22] to-[#0d1117] flex flex-col">
      {/* Header */}
      <header className="border-b border-editor-border/30 backdrop-blur-sm bg-black/20 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-blue-600/20">{'<>'}</div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">CollabCode</h1>
              <p className="text-[9px] text-gray-600 -mt-0.5">made with &lt;3 by Namish</p>
            </div>
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

      <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10">
        <div className="max-w-6xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-5xl font-bold text-white mb-3 leading-tight">
              Code Together,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">In Real-Time</span>
            </h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto">
              Collaborative code editor with 15 language runtimes, voice chat, real-time sync, and interactive terminal with input() support.
            </p>
          </div>

          {/* Create + Join */}
          <div className="grid md:grid-cols-2 gap-4 sm:gap-6 mb-8">
            {/* Create Room */}
            <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-5 sm:p-6 hover:border-blue-500/40 transition-all">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <h3 className="text-lg font-semibold text-white">Create Room</h3>
              </div>
              <div className="mb-3">
                <label className="block text-xs text-gray-400 mb-2">Choose Language</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {LANGUAGES.slice(0, 15).map(lang => (
                    <button key={lang.id} onClick={() => setSelectedLang(lang.id)}
                      className={`relative px-1 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all ${selectedLang === lang.id
                        ? 'text-white ring-2 ring-blue-400/50 shadow-lg'
                        : 'text-gray-400 hover:text-white border border-editor-border/30 hover:border-gray-500'}`}
                      style={selectedLang === lang.id ? { backgroundColor: lang.color + '30' } : { backgroundColor: '#0d1117' }}
                      title={`${lang.name}${langVersions[lang.id] ? ` — ${langVersions[lang.id]}` : ''}`}>
                      <span style={{ color: selectedLang === lang.id ? lang.color : undefined }}>{lang.icon}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600 mt-1.5">
                  {getLangInfo(selectedLang).name}
                  {langVersions[selectedLang] && <span className="ml-1 text-gray-700">({langVersions[selectedLang]?.split(' ')[0]?.split('(')[0]})</span>}
                </p>
              </div>

              {/* Public/Private Toggle */}
              <label className="flex items-center gap-2 mb-4 cursor-pointer group">
                <button onClick={() => setIsPublicRoom(!isPublicRoom)}
                  className={`w-8 h-4 rounded-full transition-all relative ${isPublicRoom ? 'bg-green-500' : 'bg-[#555]'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all`}
                    style={{ left: isPublicRoom ? '17px' : '2px' }} />
                </button>
                <span className="text-xs text-gray-400 group-hover:text-gray-200 transition">
                  {isPublicRoom ? '🌍 Public Room' : '🔒 Private Room'}
                </span>
                <span className="text-[10px] text-gray-600">
                  {isPublicRoom ? '— visible on home screen' : '— invite only'}
                </span>
              </label>

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
                  {error && (
                    <div className="flex items-center gap-1.5 mt-2 text-red-400 text-xs bg-red-600/10 border border-red-600/20 rounded-lg px-3 py-2">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {error}
                    </div>
                  )}
                </div>
                <button type="submit" disabled={joinLoading}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-purple-600/20 active:scale-[0.98] disabled:opacity-50">
                  {joinLoading ? 'Checking...' : 'Join Room'}
                </button>
              </form>
            </div>
          </div>

          {/* Tabs: Public Rooms / Gallery */}
          <div className="flex items-center gap-1 mb-4 bg-[#161b22] rounded-xl p-1 max-w-xs">
            <button onClick={() => setTab('rooms')} className={`flex-1 py-2 px-4 rounded-lg text-xs font-medium transition ${tab === 'rooms' ? 'bg-[#252526] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              🌍 Public Rooms
            </button>
            <button onClick={() => { setTab('gallery'); fetchGallery(); }} className={`flex-1 py-2 px-4 rounded-lg text-xs font-medium transition ${tab === 'gallery' ? 'bg-[#252526] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              📦 Gallery
            </button>
          </div>

          {/* Public Rooms */}
          {tab === 'rooms' && (
            <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-5 mb-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Public Rooms</h3>
                <button onClick={fetchPublicRooms} className="text-[10px] text-gray-500 hover:text-gray-300 transition">Refresh</button>
              </div>
              {publicRooms.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 text-sm">No public rooms right now</p>
                  <p className="text-gray-700 text-xs mt-1">Create a public room and it'll show up here!</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {publicRooms.map(room => {
                    const langInfo = getLangInfo(room.language);
                    return (
                      <button key={room.roomId} onClick={() => router.push(`/room/${room.roomId}`)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-[#0d1117] hover:bg-[#21262d] rounded-xl transition-all group">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                          <span className="text-sm font-mono text-gray-300 tracking-wider">{room.roomId}</span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ color: langInfo.color, background: langInfo.color + '20' }}>
                            {langInfo.icon}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{room.userCount} user{room.userCount !== 1 ? 's' : ''}</span>
                          <svg className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Gallery */}
          {tab === 'gallery' && (
            <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-5 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Code Gallery</h3>
                <button onClick={() => setShowShareModal(true)}
                  className="text-xs px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Share Code
                </button>
              </div>
              {galleryLoading ? (
                <div className="text-center py-8"><div className="spinner mx-auto mb-3" /><p className="text-gray-600 text-xs">Loading gallery...</p></div>
              ) : gallery.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 text-sm">Gallery is empty</p>
                  <p className="text-gray-700 text-xs mt-1">Be the first to share your code!</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {gallery.map(snippet => {
                    const langInfo = getLangInfo(snippet.language);
                    return (
                      <div key={snippet.id}
                        onClick={() => setSelectedSnippet(snippet.id === selectedSnippet?.id ? null : snippet)}
                        className="bg-[#0d1117] border border-editor-border/30 rounded-xl p-4 hover:border-editor-border/60 cursor-pointer transition">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-gray-200 truncate">{snippet.title}</h4>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 ml-2" style={{ color: langInfo.color, background: langInfo.color + '20' }}>
                            {langInfo.icon}
                          </span>
                        </div>
                        {snippet.description && <p className="text-[11px] text-gray-500 mb-2 line-clamp-2">{snippet.description}</p>}
                        <pre className="text-[10px] text-gray-400 bg-[#161b22] rounded-lg p-2 overflow-hidden max-h-20 font-mono leading-relaxed">{snippet.code}</pre>
                        <div className="flex items-center justify-between mt-2 text-[10px] text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: snippet.authorColor || '#858585' }} />
                            <span>{snippet.author}</span>
                          </div>
                          <span>{snippet.views || 0} views</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Features */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-8">
            {[
              { icon: '⚡', label: 'Real-time Sync', desc: 'CRDT-based' },
              { icon: '🎙️', label: 'Voice Chat', desc: 'WebRTC P2P' },
              { icon: '▶️', label: '15 Languages', desc: 'Local exec' },
              { icon: '📁', label: 'Multi-File', desc: 'File explorer' },
              { icon: '🎨', label: 'Themes', desc: 'Extensions' },
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

      {/* Snippet Detail Modal */}
      {selectedSnippet && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setSelectedSnippet(null); }}>
          <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">{selectedSnippet.title}</h3>
              <button onClick={() => setSelectedSnippet(null)} className="p-1 text-gray-500 hover:text-white transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {selectedSnippet.description && <p className="text-sm text-gray-400 mb-4">{selectedSnippet.description}</p>}
            <pre className="text-sm text-gray-300 bg-[#0d1117] rounded-xl p-4 overflow-auto max-h-96 font-mono leading-relaxed">{selectedSnippet.code}</pre>
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedSnippet.authorColor || '#858585' }} />
                <span>{selectedSnippet.author}</span>
                <span>•</span>
                <span>{getLangInfo(selectedSnippet.language).name}</span>
              </div>
              <button onClick={() => {
                navigator.clipboard.writeText(selectedSnippet.code).catch(() => {});
              }} className="text-xs px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition">
                Copy Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Code Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowShareModal(false); }}>
          <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold text-white mb-4">Share Your Code</h3>
            <form onSubmit={handleShareCode} className="space-y-3">
              <input type="text" placeholder="Title" value={shareForm.title}
                onChange={(e) => setShareForm(p => ({ ...p, title: e.target.value }))}
                className="w-full px-4 py-2.5 bg-[#0d1117] border border-editor-border/40 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500/50 focus:outline-none text-sm" required maxLength={100} />
              <input type="text" placeholder="Description (optional)" value={shareForm.description}
                onChange={(e) => setShareForm(p => ({ ...p, description: e.target.value }))}
                className="w-full px-4 py-2.5 bg-[#0d1117] border border-editor-border/40 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500/50 focus:outline-none text-sm" maxLength={500} />
              <select value={shareForm.language} onChange={(e) => setShareForm(p => ({ ...p, language: e.target.value }))}
                className="w-full px-4 py-2.5 bg-[#0d1117] border border-editor-border/40 rounded-xl text-white focus:ring-2 focus:ring-blue-500/50 focus:outline-none text-sm">
                {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <textarea placeholder="Paste your code here..." value={shareForm.code}
                onChange={(e) => setShareForm(p => ({ ...p, code: e.target.value }))}
                className="w-full px-4 py-2.5 bg-[#0d1117] border border-editor-border/40 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500/50 focus:outline-none text-sm font-mono h-40 resize-none" required maxLength={50000} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowShareModal(false)} className="flex-1 py-2.5 bg-[#252526] text-gray-300 rounded-xl hover:bg-[#2a2d2e] transition text-sm">Cancel</button>
                <button type="submit" disabled={shareLoading} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition text-sm disabled:opacity-50">
                  {shareLoading ? 'Sharing...' : 'Share'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuth && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowAuth(false); setAuthError(''); } }}>
          <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-6 w-full max-w-md relative">
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
              {/* Remember Me */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={authForm.remember}
                  onChange={(e) => setAuthForm(p => ({ ...p, remember: e.target.checked }))}
                  className="w-3.5 h-3.5 rounded bg-[#0d1117] border-editor-border text-blue-500 focus:ring-blue-500" />
                <span className="text-xs text-gray-400">Remember me</span>
              </label>
              {authError && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-600/10 border border-red-600/20 rounded-lg px-3 py-2">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {authError}
                </div>
              )}
              <button type="submit" disabled={authLoading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition disabled:opacity-50 shadow-lg shadow-blue-600/20 mt-2">
                {authLoading ? 'Loading...' : (authMode === 'signup' ? 'Create Account' : 'Sign In')}
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

      <footer className="border-t border-editor-border/20 py-4 text-center">
        <p className="text-xs text-gray-500">made with &lt;3 by Namish</p>
        <p className="text-[10px] text-gray-700 mt-1">CollabCode — Real-time Collaborative Coding Platform</p>
      </footer>
    </div>
  );
}
