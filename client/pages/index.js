/**
 * CollabCode Landing Page
 * Engineered for sub-millisecond collaborative programming.
 * 
 * Distinctive developer aesthetic: VS Code / Linear / GitHub level polish,
 * architectural typography, authentic IDE viewport, and zero generic SaaS fluff.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAppContext } from '../context/AppContext';
import AccountSettings from '../components/AccountSettings';
import axios from 'axios';
import { SERVER_URL } from '../utils/config';

const LANGUAGES = [
  { id: 'python', name: 'Python', icon: 'PY', color: '#3776ab', runtime: 'Browser WASM', ext: '.py' },
  { id: 'javascript', name: 'JavaScript', icon: 'JS', color: '#f7df1e', runtime: 'Browser Engine', ext: '.js' },
  { id: 'typescript', name: 'TypeScript', icon: 'TS', color: '#3178c6', runtime: 'Browser Engine', ext: '.ts' },
  { id: 'sqlite', name: 'SQLite', icon: 'SQ', color: '#003b57', runtime: 'In-Memory WASM', ext: '.sql' },
  { id: 'rust', name: 'Rust', icon: 'RS', color: '#dea584', runtime: 'Cloud Sandbox', ext: '.rs' },
  { id: 'go', name: 'Go', icon: 'GO', color: '#00add8', runtime: 'Cloud Sandbox', ext: '.go' },
  { id: 'cpp', name: 'C++', icon: 'C+', color: '#00599c', runtime: 'Cloud Sandbox', ext: '.cpp' },
  { id: 'c', name: 'C', icon: 'C', color: '#a8b9cc', runtime: 'Cloud Sandbox', ext: '.c' },
  { id: 'java', name: 'Java', icon: 'JV', color: '#ed8b00', runtime: 'Cloud Sandbox', ext: '.java' },
  { id: 'bash', name: 'Bash', icon: 'SH', color: '#4eaa25', runtime: 'Cloud Sandbox', ext: '.sh' },
  { id: 'ruby', name: 'Ruby', icon: 'RB', color: '#cc342d', runtime: 'Cloud Sandbox', ext: '.rb' },
  { id: 'php', name: 'PHP', icon: 'PH', color: '#777bb4', runtime: 'Cloud Sandbox', ext: '.php' },
  { id: 'perl', name: 'Perl', icon: 'PL', color: '#39457e', runtime: 'Cloud Sandbox', ext: '.pl' },
  { id: 'r', name: 'R', icon: 'R', color: '#276dc3', runtime: 'Cloud Sandbox', ext: '.R' },
  { id: 'lua', name: 'Lua', icon: 'LU', color: '#000080', runtime: 'Cloud Sandbox', ext: '.lua' },
  { id: 'fortran', name: 'Fortran', icon: 'FN', color: '#734f96', runtime: 'Cloud Sandbox', ext: '.f90' },
  { id: 'shell', name: 'POSIX sh', icon: '$', color: '#89e051', runtime: 'Cloud Sandbox', ext: '.sh' },
  { id: 'awk', name: 'AWK', icon: 'AW', color: '#c4a000', runtime: 'Cloud Sandbox', ext: '.awk' },
  { id: 'tcl', name: 'Tcl', icon: 'TC', color: '#e4cc98', runtime: 'Cloud Sandbox', ext: '.tcl' },
  { id: 'nasm', name: 'Assembly', icon: 'AS', color: '#e06c75', runtime: 'Cloud Sandbox', ext: '.asm' },
];

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── Toast System ─────────────────────────────────────────────
function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div key={toast.id}
          className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-[#121417] border border-white/10 rounded-lg shadow-xl text-xs font-mono text-[#d1d5db] backdrop-blur-md animate-slide-up">
          <div className="flex items-center gap-2 truncate">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: toast.color || '#3b82f6' }} />
            <span className="truncate">{toast.message}</span>
          </div>
          <button onClick={() => onDismiss(toast.id)} className="text-[#555] hover:text-[#999] p-0.5" aria-label="Dismiss">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, { color, duration = 3200 } = {}) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
    setToasts(prev => [...prev, { id, message, color }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);
  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  return { toasts, show, dismiss };
}

// ─── Interactive Hero IDE Viewport ─────────────────────────────
function HeroIdeViewport() {
  const [activeLine, setActiveLine] = useState(7);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveLine(prev => (prev === 7 ? 8 : prev === 8 ? 12 : 7));
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full bg-[#0c0d10] border border-white/[0.09] rounded-xl shadow-2xl overflow-hidden font-mono text-[12px] select-none">
      {/* Window Titlebar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#101216] border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]/80 border border-[#e0443e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]/80 border border-[#dea123]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]/80 border border-[#1aab29]" />
          </div>
          <span className="text-[11px] text-neutral-500 ml-2 hidden sm:inline">collabcode / src / distributed_worker.py</span>
        </div>

        {/* Real-time telemetry badges */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>CRDT: SYNCED</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded text-[10px] text-neutral-400">
            <span>3 PEERS</span>
          </div>
        </div>
      </div>

      {/* Editor Tabs & Presence Strip */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0e1013] border-b border-white/[0.05] text-[11px]">
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0c0d10] border-t-2 border-t-blue-500 border-x border-x-white/[0.06] text-neutral-200">
            <span className="text-[#3776ab] font-bold">PY</span>
            <span>distributed_worker.py</span>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 ml-1" />
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-neutral-500 hover:text-neutral-300 transition cursor-pointer">
            <span className="text-[#dea584] font-bold">RS</span>
            <span>consensus_ring.rs</span>
          </div>
        </div>

        {/* Collaborators online */}
        <div className="flex items-center gap-2 text-[10px]">
          <div className="flex -space-x-1.5">
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-bold text-[9px]" title="Alice (Active)">AL</div>
            <div className="w-5 h-5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 flex items-center justify-center font-bold text-[9px]" title="Marcus (Editing)">MK</div>
            <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 flex items-center justify-center font-bold text-[9px]" title="You">YO</div>
          </div>
          <span className="text-neutral-500 hidden md:inline">14ms latency</span>
        </div>
      </div>

      {/* Code Editor Body */}
      <div className="p-4 bg-[#0c0d10] text-[12px] leading-[1.65] relative overflow-hidden">
        {/* Line 1 */}
        <div className="flex">
          <span className="w-8 text-neutral-600 select-none text-right pr-4 text-[11px]">1</span>
          <span className="text-neutral-500"># Distributed CRDT Consensus Aggregator</span>
        </div>
        {/* Line 2 */}
        <div className="flex">
          <span className="w-8 text-neutral-600 select-none text-right pr-4 text-[11px]">2</span>
          <span><span className="text-purple-400">import</span> <span className="text-neutral-200">asyncio, time, typing</span></span>
        </div>
        {/* Line 3 */}
        <div className="flex">
          <span className="w-8 text-neutral-600 select-none text-right pr-4 text-[11px]">3</span>
          <span><span className="text-purple-400">from</span> <span className="text-neutral-200">collabcode.crdt</span> <span className="text-purple-400">import</span> <span className="text-blue-400">VectorClock</span></span>
        </div>
        {/* Line 4 */}
        <div className="flex">
          <span className="w-8 text-neutral-600 select-none text-right pr-4 text-[11px]">4</span>
          <span>&nbsp;</span>
        </div>
        {/* Line 5 */}
        <div className="flex">
          <span className="w-8 text-neutral-600 select-none text-right pr-4 text-[11px]">5</span>
          <span><span className="text-purple-400">async def</span> <span className="text-blue-400">synchronize_delta</span>(clock: <span className="text-emerald-400">VectorClock</span>, batch_size: <span className="text-amber-400">int</span> = <span className="text-amber-300">256</span>):</span>
        </div>
        {/* Line 6 */}
        <div className="flex">
          <span className="w-8 text-neutral-600 select-none text-right pr-4 text-[11px]">6</span>
          <span className="pl-6 text-neutral-400">&quot;&quot;&quot;Merge character deltas with commutative state isolation.&quot;&quot;&quot;</span>
        </div>
        {/* Line 7: Alice's cursor */}
        <div className={`flex relative ${activeLine === 7 ? 'bg-emerald-500/[0.06]' : ''} transition-colors duration-300`}>
          <span className="w-8 text-neutral-600 select-none text-right pr-4 text-[11px]">7</span>
          <span className="pl-6">
            <span className="text-neutral-300">deltas = </span>
            <span className="text-purple-400">await</span>
            <span className="text-blue-300"> clock.fetch_unmerged_ops</span>(timeout=<span className="text-amber-300">0.05</span>)
            <span className="inline-block relative">
              <span className="inline-block w-[2px] h-[14px] bg-emerald-400 align-middle animate-pulse" />
              <span className="absolute -top-5 left-0 px-1 py-0.2 bg-emerald-500 text-black text-[9px] font-bold rounded tracking-tight shadow">alice</span>
            </span>
          </span>
        </div>
        {/* Line 8 */}
        <div className={`flex relative ${activeLine === 8 ? 'bg-blue-500/[0.06]' : ''} transition-colors duration-300`}>
          <span className="w-8 text-neutral-600 select-none text-right pr-4 text-[11px]">8</span>
          <span className="pl-6 text-neutral-300">applied_count = <span className="text-emerald-400">len</span>(deltas)</span>
        </div>
        {/* Line 9 */}
        <div className="flex">
          <span className="w-8 text-neutral-600 select-none text-right pr-4 text-[11px]">9</span>
          <span className="pl-6"><span className="text-purple-400">return</span> &#123;<span className="text-emerald-300">&quot;status&quot;</span>: <span className="text-emerald-300">&quot;OK&quot;</span>, <span className="text-emerald-300">&quot;ops&quot;</span>: applied_count&#125;</span>
        </div>
        {/* Line 10 */}
        <div className="flex">
          <span className="w-8 text-neutral-600 select-none text-right pr-4 text-[11px]">10</span>
          <span>&nbsp;</span>
        </div>
        {/* Line 11: Marcus's selection */}
        <div className="flex">
          <span className="w-8 text-neutral-600 select-none text-right pr-4 text-[11px]">11</span>
          <span><span className="text-purple-400">if</span> __name__ == <span className="text-emerald-300">&quot;__main__&quot;</span>:</span>
        </div>
        {/* Line 12: Marcus cursor */}
        <div className={`flex relative ${activeLine === 12 ? 'bg-purple-500/[0.07]' : ''} transition-colors duration-300`}>
          <span className="w-8 text-neutral-600 select-none text-right pr-4 text-[11px]">12</span>
          <span className="pl-6">
            <span className="text-blue-300">print</span>(
            <span className="bg-purple-500/25 text-purple-200 px-0.5 rounded">f&quot;CRDT sync benchmark: &#123;time.time():.4f&#125;&quot;</span>
            )
            <span className="inline-block relative">
              <span className="inline-block w-[2px] h-[14px] bg-purple-400 align-middle animate-pulse" />
              <span className="absolute -top-5 left-0 px-1 py-0.2 bg-purple-500 text-white text-[9px] font-bold rounded tracking-tight shadow">marcus</span>
            </span>
          </span>
        </div>
      </div>

      {/* Docked Execution Terminal */}
      <div className="border-t border-white/[0.07] bg-[#090a0d]">
        <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#0e1014] border-b border-white/[0.04] text-[10px] text-neutral-400">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              TERMINAL
            </span>
            <span className="text-neutral-600">|</span>
            <span className="text-neutral-500">Python 3.11.2 (WASM)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-emerald-400">✓ EXIT 0</span>
            <span className="text-neutral-500">0.038s</span>
          </div>
        </div>
        <div className="p-3 text-[11px] text-neutral-300 font-mono space-y-1">
          <div className="text-neutral-500">$ python distributed_worker.py --concurrency 4</div>
          <div className="text-neutral-400">[13:28:38] <span className="text-blue-400">INF</span> Initialized Yjs CRDT document channel: room_3e90</div>
          <div className="text-neutral-400">[13:28:38] <span className="text-emerald-400">INF</span> Peer mesh connected (2 remotes: alice, marcus)</div>
          <div className="text-emerald-300">[13:28:38] SUCCESS State vector synchronized (142 deltas, 0 merge conflicts)</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Landing Page Component ──────────────────────────────
export default function Home() {
  const router = useRouter();
  const { state, setUser } = useAppContext();

  // Navigation and Workspace state
  const [controlMode, setControlMode] = useState('create'); // 'create' | 'join'
  const [selectedLang, setSelectedLang] = useState('python');
  const [customRoomName, setCustomRoomName] = useState('');
  const [isPublicRoom, setIsPublicRoom] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [error, setError] = useState('');

  // Directory and Gallery state
  const [tab, setTab] = useState('rooms'); // 'rooms' | 'gallery'
  const [publicRooms, setPublicRooms] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareForm, setShareForm] = useState({ title: '', description: '', code: '', language: 'python' });
  const [shareLoading, setShareLoading] = useState(false);
  const [selectedSnippet, setSelectedSnippet] = useState(null);

  // Auth & Account state
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: '', remember: true });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const { toasts, show: showToast, dismiss: dismissToast } = useToast();

  // Load initial data
  useEffect(() => {
    fetchPublicRooms();
    fetchGallery();
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const close = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', close); };
  }, [userMenuOpen]);

  async function fetchPublicRooms() {
    try {
      const res = await axios.get(`${SERVER_URL}/api/rooms?public=true`);
      setPublicRooms(res.data.rooms || []);
    } catch (err) {}
  }

  async function fetchGallery() {
    setGalleryLoading(true);
    try {
      const res = await axios.get(`${SERVER_URL}/api/gallery`);
      setGallery(res.data.snippets || []);
    } catch (err) {} finally {
      setGalleryLoading(false);
    }
  }

  function handleCreateRoom() {
    const rawName = customRoomName.trim();
    const code = rawName || generateRoomCode();
    const roomId = rawName
      ? rawName.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || generateRoomCode()
      : code;
    const nameParam = rawName ? `&roomName=${encodeURIComponent(rawName)}` : '';
    showToast('Initializing collaborative room...', { color: '#3b82f6' });
    router.push(`/room/${roomId}?lang=${selectedLang}&public=${isPublicRoom}${nameParam}`);
  }

  async function handleJoinRoom(e) {
    e?.preventDefault();
    const code = joinCode.trim();
    if (!code) { setError('Please enter a room code or identifier'); return; }
    if (code.length < 3) { setError('Room code is too short'); return; }
    setJoinLoading(true);
    setError('');
    try {
      const res = await axios.get(`${SERVER_URL}/api/rooms/${code}/check`);
      if (res.data.exists) {
        showToast('Connecting to room...', { color: '#10b981' });
        router.push(`/room/${code}`);
      } else {
        setError('No active room found with this code. You can create one below.');
      }
    } catch (err) {
      setError('Unable to verify room. Please check code or try again.');
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
      if (authForm.remember) localStorage.setItem('collabcode_auth', JSON.stringify(user));
      setShowAuth(false);
      setAuthForm({ email: '', password: '', username: '', remember: true });
      showToast(authMode === 'signup' ? 'Account created' : 'Signed in successfully', { color: '#10b981' });
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
      showToast('Snippet published to community vault', { color: '#3b82f6' });
    } catch (err) {
      showToast('Failed to publish snippet', { color: '#ef4444' });
    } finally {
      setShareLoading(false);
    }
  }

  const handleUpdateUser = useCallback((updatedUser) => {
    setUser(updatedUser);
  }, [setUser]);

  const selectedLangObj = LANGUAGES.find(l => l.id === selectedLang) || LANGUAGES[0];

  return (
    <div className="min-h-screen bg-[#090a0d] text-neutral-200 flex flex-col selection:bg-blue-500/20 selection:text-white relative">
      {/* Subtle technical background grid */}
      <div className="fixed inset-0 technical-grid pointer-events-none z-0 opacity-80" />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#090a0d]/90 backdrop-blur-md border-b border-white/[0.07]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Brand mark */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#121418] border border-white/10 flex items-center justify-center font-mono font-bold text-[13px] text-blue-400 shadow-sm">
              {'//'}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-[15px] tracking-tight text-white">CollabCode</span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/[0.06] text-neutral-400 border border-white/[0.08]">v20.4</span>
            </div>
          </div>

          {/* Center Architecture Telemetry (Desktop) */}
          <div className="hidden md:flex items-center gap-4 text-xs font-mono text-neutral-400">
            <a href="#workspace" className="hover:text-neutral-200 transition">Workspace</a>
            <span className="text-neutral-700">/</span>
            <a href="#architecture" className="hover:text-neutral-200 transition">Architecture</a>
            <span className="text-neutral-700">/</span>
            <a href="#rooms" className="hover:text-neutral-200 transition">Directory</a>
            <span className="text-neutral-700">/</span>
            <a href="#gallery" className="hover:text-neutral-200 transition">Vault</a>
          </div>

          {/* Right Action & User Identity */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/[0.03] border border-white/[0.06] text-[10px] font-mono text-neutral-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Yjs Sync Engine: Online</span>
            </div>

            {state.user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#121418] border border-white/10 hover:border-white/20 transition active:scale-95 text-xs font-mono"
                >
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-[10px]">
                    {state.user.username?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <span className="text-neutral-300 max-w-[90px] truncate">{state.user.username}</span>
                  <svg className={`w-3 h-3 text-neutral-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-[#101216] border border-white/10 rounded-xl shadow-2xl py-1.5 z-50 font-mono text-xs animate-slide-up">
                    <div className="px-3.5 py-2 border-b border-white/[0.06]">
                      <p className="font-semibold text-neutral-200 truncate">{state.user.username}</p>
                      <p className="text-[10px] text-neutral-500">{state.isAuthenticated ? state.user.email || 'Authenticated' : 'Guest Session'}</p>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => { setUserMenuOpen(false); setShowAccountSettings(true); }}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-neutral-300 hover:text-white hover:bg-white/[0.04] transition text-left"
                      >
                        <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        <span>Profile & Settings</span>
                      </button>
                    </div>
                    <div className="border-t border-white/[0.06] pt-1">
                      {state.isAuthenticated ? (
                        <button
                          onClick={() => { setUserMenuOpen(false); localStorage.removeItem('collabcode_auth'); window.location.reload(); }}
                          className="w-full flex items-center gap-2 px-3.5 py-2 text-rose-400 hover:bg-rose-500/10 transition text-left"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                          <span>Sign Out</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => { setUserMenuOpen(false); setShowAuth(true); }}
                          className="w-full flex items-center gap-2 px-3.5 py-2 text-blue-400 hover:bg-blue-500/10 transition text-left"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                          <span>Sign In / Create Account</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/10 border border-white/10 rounded-lg text-xs font-mono text-neutral-300 transition"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content Container ────────────────────────────── */}
      <main className="flex-1 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-16">

          {/* ── Hero Section (Asymmetric, Product-Centric) ────────── */}
          <section className="grid lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-14 items-center mb-16 sm:mb-24">
            {/* Left: Editorial Header */}
            <div>
              {/* Technical category badge */}
              <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-white/[0.03] border border-white/[0.08] rounded-md mb-5 text-[11px] font-mono text-neutral-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span>YJS CRDT KERNEL</span>
                <span className="text-neutral-600">·</span>
                <span>ZERO MERGE CONFLICTS</span>
              </div>

              {/* Core Hero Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-display font-bold text-white tracking-tight leading-[1.06] mb-5">
                Your code.<br />
                Their code.<br />
                <span className="text-neutral-500">Same editor.</span>
              </h1>

              {/* Crisp, engineering copy */}
              <p className="text-sm sm:text-base text-neutral-400 leading-relaxed max-w-lg mb-8">
                Conflict-free pair programming and execution across 20 languages. Powered by decentralized CRDT state vectors, browser WebAssembly sandboxing, and direct peer-to-peer voice. No extensions, no downloads.
              </p>

              {/* Direct Actions */}
              <div className="flex flex-wrap items-center gap-3 mb-10">
                <a
                  href="#workspace"
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold tracking-tight transition shadow-lg shadow-blue-600/20 active:scale-[0.98] flex items-center gap-2"
                >
                  <span>Launch Workspace</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                </a>
                <a
                  href="#architecture"
                  className="px-4 py-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-lg text-sm font-mono text-neutral-300 transition"
                >
                  System Spec →
                </a>
              </div>

              {/* Architectural Highlights */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/[0.07] text-left">
                <div>
                  <div className="text-lg font-bold font-mono text-neutral-100">20</div>
                  <div className="text-[11px] font-mono text-neutral-500">Active Runtimes</div>
                </div>
                <div>
                  <div className="text-lg font-bold font-mono text-emerald-400">&lt; 1ms</div>
                  <div className="text-[11px] font-mono text-neutral-500">WASM Latency</div>
                </div>
                <div>
                  <div className="text-lg font-bold font-mono text-purple-400">P2P</div>
                  <div className="text-[11px] font-mono text-neutral-500">48kHz Voice</div>
                </div>
              </div>
            </div>

            {/* Right: High-Fidelity IDE Viewport */}
            <div className="w-full">
              <HeroIdeViewport />
            </div>
          </section>

          {/* ── Session Control Station (Create / Join) ─────────────── */}
          <section id="workspace" className="mb-20 sm:mb-28 scroll-mt-20">
            <div className="bg-[#0c0e12] border border-white/[0.08] rounded-2xl p-6 sm:p-8 shadow-2xl">
              {/* Segmented Control Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.06]">
                <div>
                  <h2 className="text-lg font-display font-semibold text-white tracking-tight">Session Controller</h2>
                  <p className="text-xs text-neutral-400 font-mono mt-0.5">Initialize a collaborative environment or join an existing peer session.</p>
                </div>

                {/* Segmented Mode Switcher */}
                <div className="flex items-center p-1 bg-[#121419] border border-white/[0.08] rounded-xl self-start sm:self-auto">
                  <button
                    onClick={() => setControlMode('create')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-mono font-medium transition ${
                      controlMode === 'create'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    + New Session
                  </button>
                  <button
                    onClick={() => setControlMode('join')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-mono font-medium transition ${
                      controlMode === 'join'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    → Join via Code
                  </button>
                </div>
              </div>

              {/* Mode: Create Session */}
              {controlMode === 'create' && (
                <div className="pt-6 space-y-6">
                  {/* Runtime Picker */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold">
                        Select Runtime Environment ({LANGUAGES.length})
                      </label>
                      <span className="text-[11px] font-mono text-neutral-500">
                        Active: <span className="text-white font-semibold">{selectedLangObj.name}</span> ({selectedLangObj.runtime})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                      {LANGUAGES.map(lang => {
                        const isSelected = selectedLang === lang.id;
                        return (
                          <button
                            key={lang.id}
                            onClick={() => setSelectedLang(lang.id)}
                            className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'bg-blue-500/10 border-blue-500/50 shadow-sm'
                                : 'bg-[#101216] border-white/[0.05] hover:border-white/15 hover:bg-[#14161c]'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className="w-6 h-6 rounded flex items-center justify-center font-mono font-bold text-[10px] flex-shrink-0"
                                style={{ backgroundColor: lang.color + '20', color: lang.color }}
                              >
                                {lang.icon}
                              </span>
                              <div className="truncate">
                                <div className={`text-xs font-mono truncate ${isSelected ? 'text-white font-semibold' : 'text-neutral-300'}`}>
                                  {lang.name}
                                </div>
                                <div className="text-[9px] font-mono text-neutral-500 truncate">{lang.ext}</div>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Room Name & Configuration */}
                  <div className="grid sm:grid-cols-[1.5fr_1fr] gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold mb-1.5">
                        Session Identifier (Optional)
                      </label>
                      <input
                        type="text"
                        value={customRoomName}
                        onChange={(e) => setCustomRoomName(e.target.value)}
                        placeholder="e.g. distributed-consensus-review"
                        maxLength={30}
                        className="w-full px-3.5 py-2.5 bg-[#101216] border border-white/10 rounded-lg text-neutral-100 placeholder-neutral-600 font-mono text-xs focus:outline-none focus:border-blue-500 transition"
                      />
                      <div className="text-[10px] font-mono text-neutral-500 mt-1">
                        URL Slug: <span className="text-neutral-400">/room/{customRoomName.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'auto-generated-code'}</span>
                      </div>
                    </div>

                    {/* Visibility Switcher */}
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold mb-1.5">
                        Directory Visibility
                      </label>
                      <div className="flex items-center gap-2 p-1 bg-[#101216] border border-white/10 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setIsPublicRoom(false)}
                          className={`flex-1 py-1.5 text-center text-xs font-mono rounded transition ${
                            !isPublicRoom ? 'bg-white/[0.08] text-white font-medium' : 'text-neutral-500 hover:text-neutral-300'
                          }`}
                        >
                          Private (Invite)
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsPublicRoom(true)}
                          className={`flex-1 py-1.5 text-center text-xs font-mono rounded transition ${
                            isPublicRoom ? 'bg-emerald-500/20 text-emerald-300 font-medium' : 'text-neutral-500 hover:text-neutral-300'
                          }`}
                        >
                          Public (Directory)
                        </button>
                      </div>
                      <div className="text-[10px] font-mono text-neutral-500 mt-1">
                        {isPublicRoom ? 'Listed on public directory' : 'Accessible only via direct room link'}
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      onClick={handleCreateRoom}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold tracking-tight transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                    >
                      <span>Create Workspace ({selectedLangObj.name})</span>
                      <span className="font-mono text-xs opacity-75">↵ Enter</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Mode: Join Session */}
              {controlMode === 'join' && (
                <div className="pt-6 max-w-lg mx-auto">
                  <form onSubmit={handleJoinRoom} className="space-y-4">
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold mb-1.5 text-center">
                        Enter 6-Character Room Code or Session Identifier
                      </label>
                      <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
                        placeholder="e.g. X9K2P4"
                        maxLength={30}
                        className="w-full px-4 py-3.5 bg-[#101216] border border-white/10 rounded-lg text-white font-mono text-center text-xl tracking-[0.25em] placeholder:tracking-normal placeholder-neutral-600 focus:outline-none focus:border-amber-500 transition uppercase"
                      />
                      {error && (
                        <p className="mt-2 text-rose-400 text-xs font-mono text-center">{error}</p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={joinLoading}
                      className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold tracking-tight transition flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20"
                    >
                      {joinLoading ? (
                        <span>Connecting to Session...</span>
                      ) : (
                        <span>Connect to Room →</span>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </section>

          {/* ── System Architecture (Technical Deep-Dive) ─────────── */}
          <section id="architecture" className="mb-20 sm:mb-28 scroll-mt-20">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-neutral-400">System Architecture</h2>
            </div>
            <h3 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight mb-8">
              Engineered for deterministic concurrency.
            </h3>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Module 1: CRDT */}
              <div className="p-5 bg-[#0c0d10] border border-white/[0.07] rounded-xl flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-mono text-xs font-bold mb-4">
                    Yjs
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-2">Decentralized CRDT Core</h4>
                  <p className="text-xs text-neutral-400 leading-relaxed font-mono">
                    Character insertions and deletions are encoded as commutative state vectors. Peer updates merge deterministically without central operational transformation locks.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/[0.05] text-[10px] font-mono text-neutral-500">
                  Zero Merge Conflicts
                </div>
              </div>

              {/* Module 2: Hybrid Execution */}
              <div className="p-5 bg-[#0c0d10] border border-white/[0.07] rounded-xl flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono text-xs font-bold mb-4">
                    WASM
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-2">Hybrid WASM Sandbox</h4>
                  <p className="text-xs text-neutral-400 leading-relaxed font-mono">
                    Python (Pyodide), JS/TS (Workers), and SQLite compile entirely in-browser at 0ms latency. Compiled runtimes (Rust, Go, C++, Fortran) execute in isolated containers.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/[0.05] text-[10px] font-mono text-neutral-500">
                  Sub-millisecond Feedback
                </div>
              </div>

              {/* Module 3: Mesh Audio */}
              <div className="p-5 bg-[#0c0d10] border border-white/[0.07] rounded-xl flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center font-mono text-xs font-bold mb-4">
                    RTC
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-2">Peer-to-Peer Mesh Audio</h4>
                  <p className="text-xs text-neutral-400 leading-relaxed font-mono">
                    Direct WebRTC mesh topology streaming 48kHz Opus audio between connected peers. Zero third-party telephony servers or intermediary eavesdropping.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/[0.05] text-[10px] font-mono text-neutral-500">
                  Direct Browser-to-Browser
                </div>
              </div>

              {/* Module 4: Anticheat Engine */}
              <div className="p-5 bg-[#0c0d10] border border-white/[0.07] rounded-xl flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center font-mono text-xs font-bold mb-4">
                    VG
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-2">Vanguard Integrity Protocol</h4>
                  <p className="text-xs text-neutral-400 leading-relaxed font-mono">
                    Integrated competition monitor with 13 passive telemetry hooks for tab switching, devtools inspection, and unnatural paste rate anomalies during technical interviews.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/[0.05] text-[10px] font-mono text-neutral-500">
                  Integrity Telemetry
                </div>
              </div>
            </div>
          </section>

          {/* ── Directory & Community Vault ───────────────────────── */}
          <section id="rooms" className="mb-20 sm:mb-28 scroll-mt-20">
            {/* Header with Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setTab('rooms')}
                  className={`text-sm font-mono pb-1 border-b-2 transition ${
                    tab === 'rooms'
                      ? 'border-blue-500 text-white font-semibold'
                      : 'border-transparent text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  Live Session Directory ({publicRooms.length})
                </button>
                <span className="text-neutral-700">|</span>
                <button
                  onClick={() => { setTab('gallery'); fetchGallery(); }}
                  className={`text-sm font-mono pb-1 border-b-2 transition ${
                    tab === 'gallery'
                      ? 'border-blue-500 text-white font-semibold'
                      : 'border-transparent text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  Code Vault ({gallery.length})
                </button>
              </div>

              <div className="flex items-center gap-3">
                {tab === 'rooms' ? (
                  <button
                    onClick={fetchPublicRooms}
                    className="text-xs font-mono text-neutral-400 hover:text-white transition flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    <span>Refresh</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="px-3 py-1 bg-white/[0.05] hover:bg-white/10 border border-white/10 rounded-lg text-xs font-mono text-neutral-200 transition flex items-center gap-1.5"
                  >
                    <span>+ Publish Snippet</span>
                  </button>
                )}
              </div>
            </div>

            {/* Content: Live Rooms Table */}
            {tab === 'rooms' && (
              <div className="bg-[#0c0e12] border border-white/[0.08] rounded-xl overflow-hidden shadow-xl">
                {publicRooms.length === 0 ? (
                  <div className="py-16 px-4 text-center">
                    <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/10 text-neutral-500 font-mono text-sm flex items-center justify-center mx-auto mb-3">
                      {'//'}
                    </div>
                    <h4 className="text-sm font-mono text-neutral-300 mb-1">No public rooms currently broadcasting</h4>
                    <p className="text-xs font-mono text-neutral-500 max-w-sm mx-auto">
                      Create a room with visibility set to &quot;Public&quot; to list your collaborative session here.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.05]">
                    <div className="grid grid-cols-12 px-4 py-2.5 bg-[#101216] text-[11px] font-mono uppercase tracking-wider text-neutral-500">
                      <div className="col-span-5 sm:col-span-4">Session Name</div>
                      <div className="col-span-3 sm:col-span-3">Language</div>
                      <div className="col-span-2 sm:col-span-3">Active Peers</div>
                      <div className="col-span-2 sm:col-span-2 text-right">Connect</div>
                    </div>

                    {publicRooms.map(room => {
                      const langObj = LANGUAGES.find(l => l.id === room.language) || LANGUAGES[0];
                      return (
                        <div key={room.roomId} className="grid grid-cols-12 px-4 py-3.5 items-center hover:bg-white/[0.02] transition font-mono text-xs">
                          <div className="col-span-5 sm:col-span-4 flex items-center gap-2.5 truncate">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" />
                            <span className="text-neutral-100 font-semibold truncate">{room.roomName || room.roomId}</span>
                            {room.roomName && (
                              <span className="text-[10px] text-neutral-500 truncate hidden sm:inline">({room.roomId})</span>
                            )}
                          </div>

                          <div className="col-span-3 sm:col-span-3 flex items-center gap-1.5 truncate">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: langObj.color + '18', color: langObj.color }}>
                              {langObj.icon}
                            </span>
                            <span className="text-neutral-300 truncate">{langObj.name}</span>
                          </div>

                          <div className="col-span-2 sm:col-span-3 text-neutral-400">
                            {room.userCount || 1} peer{(room.userCount || 1) === 1 ? '' : 's'}
                          </div>

                          <div className="col-span-2 sm:col-span-2 text-right">
                            <button
                              onClick={() => router.push(`/room/${room.roomId}`)}
                              className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 rounded text-xs transition"
                            >
                              Join →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Content: Snippet Vault */}
            {tab === 'gallery' && (
              <div id="gallery">
                {galleryLoading ? (
                  <div className="py-16 text-center text-xs font-mono text-neutral-500">
                    Loading code vault...
                  </div>
                ) : gallery.length === 0 ? (
                  <div className="bg-[#0c0e12] border border-white/[0.08] rounded-xl py-16 px-4 text-center">
                    <div className="text-sm font-mono text-neutral-300 mb-1">Code vault is empty</div>
                    <p className="text-xs font-mono text-neutral-500">Be the first to share an algorithm or utility snippet.</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {gallery.map(snippet => {
                      const langObj = LANGUAGES.find(l => l.id === snippet.language) || LANGUAGES[0];
                      return (
                        <div
                          key={snippet.id}
                          onClick={() => setSelectedSnippet(snippet)}
                          className="p-4 bg-[#0c0e12] border border-white/[0.07] hover:border-white/20 rounded-xl cursor-pointer transition flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-semibold text-neutral-200 truncate">{snippet.title}</h4>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold" style={{ backgroundColor: langObj.color + '18', color: langObj.color }}>
                                {langObj.name}
                              </span>
                            </div>
                            {snippet.description && (
                              <p className="text-[11px] text-neutral-400 line-clamp-2 mb-3">{snippet.description}</p>
                            )}
                            <pre className="p-2.5 bg-[#08090b] border border-white/[0.04] rounded-lg text-[10px] font-mono text-neutral-400 overflow-hidden max-h-24 leading-relaxed">
                              {snippet.code}
                            </pre>
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/[0.05] text-[10px] font-mono text-neutral-500">
                            <span>Author: {snippet.author || 'Anonymous'}</span>
                            <span className="text-blue-400 hover:underline">Inspect →</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Keyboard Shortcut Registry ────────────────────────── */}
          <section className="p-6 bg-[#0c0d10] border border-white/[0.07] rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-mono uppercase tracking-widest text-neutral-400">Default Command Registry</h4>
              <span className="text-[10px] font-mono text-neutral-500">VS Code Native Ergonomics</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-2.5 bg-[#101216] border border-white/[0.05] rounded-lg flex items-center justify-between">
                <span className="text-neutral-400">Run Code</span>
                <kbd className="px-2 py-0.5 bg-white/[0.06] border border-white/10 rounded text-[11px] text-neutral-200">Ctrl + Enter</kbd>
              </div>
              <div className="p-2.5 bg-[#101216] border border-white/[0.05] rounded-lg flex items-center justify-between">
                <span className="text-neutral-400">Terminal</span>
                <kbd className="px-2 py-0.5 bg-white/[0.06] border border-white/10 rounded text-[11px] text-neutral-200">Ctrl + `</kbd>
              </div>
              <div className="p-2.5 bg-[#101216] border border-white/[0.05] rounded-lg flex items-center justify-between">
                <span className="text-neutral-400">Toggle Chat</span>
                <kbd className="px-2 py-0.5 bg-white/[0.06] border border-white/10 rounded text-[11px] text-neutral-200">Ctrl + B</kbd>
              </div>
              <div className="p-2.5 bg-[#101216] border border-white/[0.05] rounded-lg flex items-center justify-between">
                <span className="text-neutral-400">Zen Mode</span>
                <kbd className="px-2 py-0.5 bg-white/[0.06] border border-white/10 rounded text-[11px] text-neutral-200">Ctrl+Shift+Z</kbd>
              </div>
            </div>
          </section>

        </div>
      </main>

      {/* ── Snippet Modal ────────────────────────────────────── */}
      {selectedSnippet && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedSnippet(null)}>
          <div className="bg-[#0e1014] border border-white/15 rounded-xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col font-mono text-xs animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">{selectedSnippet.title}</h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">{selectedSnippet.description || 'No description provided'}</p>
              </div>
              <button onClick={() => setSelectedSnippet(null)} className="text-neutral-500 hover:text-white p-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <pre className="p-4 bg-[#08090b] border border-white/[0.06] rounded-lg overflow-auto flex-1 leading-relaxed text-neutral-300">
              {selectedSnippet.code}
            </pre>

            <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/10">
              <span className="text-neutral-500">Author: {selectedSnippet.author}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedSnippet.code).catch(() => {});
                  showToast('Code copied to clipboard', { color: '#3b82f6' });
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
              >
                Copy Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Share Modal ──────────────────────────────────────── */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowShareModal(false)}>
          <div className="bg-[#0e1014] border border-white/15 rounded-xl max-w-lg w-full p-6 shadow-2xl font-mono text-xs animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-sm font-semibold text-white">Publish Snippet to Vault</h3>
              <button onClick={() => setShowShareModal(false)} className="text-neutral-500 hover:text-white p-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleShareCode} className="space-y-3">
              <div>
                <label className="block text-neutral-400 mb-1 text-[11px]">Title</label>
                <input
                  type="text"
                  required
                  value={shareForm.title}
                  onChange={e => setShareForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Distributed Worker Pool"
                  className="w-full px-3 py-2 bg-[#121419] border border-white/10 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1 text-[11px]">Language</label>
                <select
                  value={shareForm.language}
                  onChange={e => setShareForm(p => ({ ...p, language: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#121419] border border-white/10 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                >
                  {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1 text-[11px]">Code</label>
                <textarea
                  required
                  rows={8}
                  value={shareForm.code}
                  onChange={e => setShareForm(p => ({ ...p, code: e.target.value }))}
                  placeholder="Paste snippet code here..."
                  className="w-full px-3 py-2 bg-[#121419] border border-white/10 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 bg-white/[0.05] hover:bg-white/10 rounded-lg text-neutral-400 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={shareLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition"
                >
                  {shareLoading ? 'Publishing...' : 'Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Auth Modal ───────────────────────────────────────── */}
      {showAuth && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAuth(false)}>
          <div className="bg-[#0e1014] border border-white/15 rounded-xl max-w-sm w-full p-6 shadow-2xl font-mono text-xs animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-sm font-semibold text-white">
                {authMode === 'signup' ? 'Create Developer Account' : 'Sign In'}
              </h3>
              <button onClick={() => setShowAuth(false)} className="text-neutral-500 hover:text-white p-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-3">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-neutral-400 mb-1 text-[11px]">Username</label>
                  <input
                    type="text"
                    required
                    value={authForm.username}
                    onChange={e => setAuthForm(p => ({ ...p, username: e.target.value }))}
                    placeholder="dev_user"
                    className="w-full px-3 py-2 bg-[#121419] border border-white/10 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-neutral-400 mb-1 text-[11px]">Email</label>
                <input
                  type="email"
                  required
                  value={authForm.email}
                  onChange={e => setAuthForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="name@domain.com"
                  className="w-full px-3 py-2 bg-[#121419] border border-white/10 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1 text-[11px]">Password</label>
                <input
                  type="password"
                  required
                  value={authForm.password}
                  onChange={e => setAuthForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 bg-[#121419] border border-white/10 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              {authError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-[11px]">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-semibold transition mt-2"
              >
                {authLoading ? 'Authenticating...' : (authMode === 'signup' ? 'Create Account' : 'Sign In')}
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-white/10 text-center text-neutral-500 text-[11px]">
              {authMode === 'signup' ? 'Already have an account?' : 'Need an account?'}
              <button
                onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthError(''); }}
                className="text-blue-400 ml-1.5 hover:underline"
              >
                {authMode === 'signup' ? 'Sign In' : 'Sign Up'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Account Settings Modal ────────────────────────────── */}
      <AccountSettings
        isOpen={showAccountSettings}
        onClose={() => setShowAccountSettings(false)}
        user={state.user}
        onUpdateUser={handleUpdateUser}
        isAuthenticated={state.isAuthenticated}
      />

      {/* ── Minimalist Engineering Footer ─────────────────────── */}
      <footer className="border-t border-white/[0.07] bg-[#07080a] py-8 text-xs font-mono text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-[#101216] border border-white/10 flex items-center justify-center text-[10px] text-blue-400 font-bold">
              {'//'}
            </div>
            <span>CollabCode · Decentralized Collaborative Coding Environment</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/dawarnamish28-cell/collabcode"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-white transition flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              <span>GitHub</span>
            </a>
            <span className="text-neutral-700">·</span>
            <span>MIT License</span>
            <span className="text-neutral-700">·</span>
            <span className="text-neutral-400">v20.4</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
