/**
 * Landing Page v9.0 — Fun, Animated, Human
 * 
 * Custom cursor, particle background, typing hero,
 * floating language pills, scroll reveals, magnetic buttons,
 * and enough personality to feel like a real dev built it.
 * 
 * made with <3 by Namish
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
  { id: 'lua', name: 'Lua', icon: 'LU', color: '#000080', bg: '#00008015' },
  { id: 'fortran', name: 'Fortran', icon: 'FN', color: '#734f96', bg: '#734f9615' },
  { id: 'tcl', name: 'Tcl', icon: 'TC', color: '#e4cc98', bg: '#e4cc9815' },
  { id: 'sqlite', name: 'SQLite', icon: 'SQ', color: '#003b57', bg: '#003b5715' },
  { id: 'nasm', name: 'Assembly', icon: 'AS', color: '#6e4c13', bg: '#6e4c1315' },
];

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── Custom Cursor Hook ─────────────────────────────────────────
function useCustomCursor() {
  const cursorRef = useRef(null);
  const dotRef = useRef(null);
  const [hovering, setHovering] = useState(false);
  const [clicking, setClicking] = useState(false);

  useEffect(() => {
    const cursor = cursorRef.current;
    const dot = dotRef.current;
    if (!cursor || !dot) return;

    let mx = -100, my = -100;
    let cx = -100, cy = -100;

    const move = (e) => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.left = mx + 'px';
      dot.style.top = my + 'px';
    };

    // Smooth follow with lerp
    let raf;
    const lerp = () => {
      cx += (mx - cx) * 0.15;
      cy += (my - cy) * 0.15;
      cursor.style.left = cx + 'px';
      cursor.style.top = cy + 'px';
      raf = requestAnimationFrame(lerp);
    };

    const checkHover = (e) => {
      const el = e.target;
      const isInteractive = el.closest('button, a, input, textarea, select, [role="button"], .hover-lift, .lang-pill, .magnetic-btn');
      setHovering(!!isInteractive);
    };

    const down = () => setClicking(true);
    const up = () => setClicking(false);

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseover', checkHover);
    window.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    raf = requestAnimationFrame(lerp);

    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseover', checkHover);
      window.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      cancelAnimationFrame(raf);
    };
  }, []);

  return { cursorRef, dotRef, hovering, clicking };
}

// ─── Particle Background ────────────────────────────────────────
function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, particles, raf;

    const resize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    };

    const init = () => {
      resize();
      particles = [];
      const count = Math.min(60, Math.floor((w * h) / 15000));
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          r: Math.random() * 1.5 + 0.5,
          color: ['#5e9eff', '#5bd882', '#ffb347', '#c4b5fd', '#ff6b6b'][Math.floor(Math.random() * 5)],
          alpha: Math.random() * 0.4 + 0.1,
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(94, 158, 255, ${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw particles
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      raf = requestAnimationFrame(draw);
    };

    init();
    draw();
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" />;
}

// ─── Typing Animation ──────────────────────────────────────────
function TypingHero() {
  const phrases = [
    'print("hello, world")',
    'console.log("collab time")',
    'fmt.Println("let\'s go")',
    'System.out.println("ready")',
    'puts "code together"',
    'echo "no conflicts"',
  ];
  const [text, setText] = useState('');
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const phrase = phrases[phraseIdx];
    let timer;

    if (!deleting && charIdx < phrase.length) {
      timer = setTimeout(() => {
        setText(phrase.slice(0, charIdx + 1));
        setCharIdx(charIdx + 1);
      }, 50 + Math.random() * 40);
    } else if (!deleting && charIdx === phrase.length) {
      timer = setTimeout(() => setDeleting(true), 2000);
    } else if (deleting && charIdx > 0) {
      timer = setTimeout(() => {
        setText(phrase.slice(0, charIdx - 1));
        setCharIdx(charIdx - 1);
      }, 25);
    } else if (deleting && charIdx === 0) {
      setDeleting(false);
      setPhraseIdx((phraseIdx + 1) % phrases.length);
    }

    return () => clearTimeout(timer);
  }, [charIdx, deleting, phraseIdx]);

  return (
    <span className="font-mono text-[13px] sm:text-[16px] text-[#5e9eff]">
      {text}<span className="typing-cursor" />
    </span>
  );
}

// ─── Floating Language Marquee ──────────────────────────────────
function LanguageMarquee() {
  const doubled = [...LANGUAGES, ...LANGUAGES];
  return (
    <div className="w-full overflow-hidden py-3 relative">
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#131416] to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#131416] to-transparent z-10" />
      <div className="marquee-track flex gap-3 w-max">
        {doubled.map((lang, i) => (
          <div key={`${lang.id}-${i}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1b1e] border border-[#282828] rounded-full text-[11px] font-mono whitespace-nowrap hover:border-[#444] transition-all"
            style={{ color: lang.color }}>
            <span className="font-bold">{lang.icon}</span>
            <span className="text-[#666]">{lang.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Scroll Reveal Observer ─────────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ─── Main Component ─────────────────────────────────────────────
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
  const [tab, setTab] = useState('rooms');
  const [gallery, setGallery] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareForm, setShareForm] = useState({ title: '', description: '', code: '', language: 'python' });
  const [shareLoading, setShareLoading] = useState(false);
  const [selectedSnippet, setSelectedSnippet] = useState(null);

  const { cursorRef, dotRef, hovering, clicking } = useCustomCursor();
  useScrollReveal();

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
        setError('No room found with this code. Create a new one instead.');
      }
    } catch (err) {
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
    <div className="min-h-screen bg-[#131416] flex flex-col grain landing-cursor-hide">
      {/* Custom Cursor */}
      <div ref={cursorRef}
        className={`custom-cursor hidden md:block ${hovering ? 'hovering' : ''} ${clicking ? 'clicking' : ''}`} />
      <div ref={dotRef} className="custom-cursor-dot hidden md:block" />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="border-b border-[#222] sticky top-0 z-40 bg-[#131416]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#222] border border-[#333] flex items-center justify-center text-[11px] font-mono font-bold text-[#5e9eff] shadow-inner-subtle glow-pulse">
              {'//'}
            </div>
            <div>
              <h1 className="text-[15px] font-display font-semibold text-white tracking-tight leading-none">CollabCode</h1>
              <p className="text-[9px] text-[#555] font-mono mt-0.5">by namish</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {state.user && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-[#888]">
                <div className="w-2 h-2 rounded-full ring-1 ring-white/10 breathe" style={{ backgroundColor: state.user.color }} />
                <span className="font-mono text-[11px]">{state.user.username}</span>
                {state.user.authenticated && <span className="text-[9px] px-1.5 py-0.5 bg-[#5bd882]/10 text-[#5bd882] rounded font-mono">pro</span>}
              </div>
            )}
            {state.isAuthenticated ? (
              <button onClick={() => { localStorage.removeItem('collabcode_auth'); window.location.reload(); }}
                className="text-[11px] px-3 py-1.5 text-[#888] hover:text-white bg-transparent hover:bg-[#222] rounded-lg transition-all border border-transparent hover:border-[#333]">
                sign out
              </button>
            ) : (
              <button onClick={() => setShowAuth(true)}
                className="magnetic-btn text-[11px] px-4 py-1.5 bg-[#222] text-white rounded-lg hover:bg-[#2a2b30] transition-all border border-[#333] font-medium">
                sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 sm:px-8 overflow-x-hidden">
        <div className="max-w-6xl mx-auto">

          {/* ── Hero Section ────────────────────────────────────── */}
          <section className="relative pt-12 sm:pt-20 pb-8 sm:pb-16">
            {/* Background orbs */}
            <div className="gradient-orb w-[400px] h-[400px] bg-[#5e9eff] top-[-100px] left-[-150px]" style={{ animationDelay: '0s' }} />
            <div className="gradient-orb w-[300px] h-[300px] bg-[#5bd882] top-[50px] right-[-100px]" style={{ animationDelay: '-7s' }} />
            <div className="gradient-orb w-[200px] h-[200px] bg-[#c4b5fd] bottom-[0] left-[30%]" style={{ animationDelay: '-14s' }} />

            {/* Particles */}
            <ParticleBackground />

            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4 fade-up">
                <div className="w-2 h-2 rounded-full bg-[#5bd882] breathe" />
                <span className="text-[11px] text-[#666] font-mono">20 languages &middot; 0 latency &middot; real-time sync</span>
              </div>

              <h2 className="text-[32px] sm:text-[52px] font-display font-bold text-white leading-[1.05] tracking-tight max-w-2xl fade-up" style={{ animationDelay: '100ms' }}>
                Your code.{' '}
                <br className="hidden sm:block" />
                <span className="shimmer-text">Their code.</span>{' '}
                <br className="hidden sm:block" />
                <span className="text-[#555]">Same editor.</span>
              </h2>

              <p className="text-[13px] sm:text-[16px] text-[#666] mt-5 max-w-lg leading-relaxed fade-up" style={{ animationDelay: '200ms' }}>
                Pair program with anyone, anywhere. CRDT-synced editor, voice chat, 
                interactive terminal — runs everything from Python to Assembly
                in the browser.
              </p>

              {/* Typing animation */}
              <div className="mt-6 fade-up" style={{ animationDelay: '300ms' }}>
                <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1a1b1e] border border-[#282828] rounded-xl">
                  <span className="text-[10px] text-[#555] font-mono">$</span>
                  <TypingHero />
                </div>
              </div>

              {/* Quick stats */}
              <div className="flex flex-wrap gap-6 mt-8 fade-up" style={{ animationDelay: '400ms' }}>
                {[
                  { value: '20', label: 'languages', color: '#ffb347' },
                  { value: 'CRDT', label: 'sync engine', color: '#5e9eff' },
                  { value: 'P2P', label: 'voice chat', color: '#5bd882' },
                  { value: '6', label: 'themes', color: '#c4b5fd' },
                ].map((stat, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[18px] font-display font-bold" style={{ color: stat.color }}>{stat.value}</span>
                    <span className="text-[11px] text-[#555] font-mono">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Language Marquee ─────────────────────────────────── */}
          <div className="reveal mb-8 sm:mb-12">
            <LanguageMarquee />
          </div>

          {/* ── Create + Join (asymmetric layout) ────────────────── */}
          <div className="grid md:grid-cols-[1.2fr_1fr] gap-4 sm:gap-6 mb-10 sm:mb-16 stagger-in">
            {/* Create Room */}
            <div className="bg-[#1a1b1e] border border-[#282828] rounded-2xl p-5 sm:p-7 hover-lift fade-in-scale tilt-card">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#5e9eff] breathe" />
                  <h3 className="text-[14px] font-display font-semibold text-white">new room</h3>
                </div>
                <span className="text-[10px] text-[#555] font-mono">pick a language, hit go</span>
              </div>
              
              {/* Language Grid */}
              <div className="mb-5">
                <div className="grid grid-cols-5 gap-1.5">
                  {LANGUAGES.map(lang => (
                    <button key={lang.id} onClick={() => setSelectedLang(lang.id)}
                      className={`lang-pill relative px-1 py-2.5 rounded-lg text-[10px] font-mono font-bold transition-all duration-200 ${
                        selectedLang === lang.id
                          ? 'selected ring-1 ring-[#5e9eff]/50 bg-[#5e9eff]/10'
                          : 'text-[#666] hover:text-[#aaa] bg-transparent hover:bg-[#222]'
                      }`}
                      title={`${lang.name}${langVersions[lang.id] ? ` (${langVersions[lang.id]})` : ''}`}>
                      <span style={{ color: selectedLang === lang.id ? lang.color : undefined }}>{lang.icon}</span>
                      {selectedLang === lang.id && (
                        <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full" style={{ background: lang.color }} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <div className="w-2 h-2 rounded-full" style={{ background: getLangInfo(selectedLang).color, boxShadow: `0 0 8px ${getLangInfo(selectedLang).color}40` }} />
                  <p className="text-[12px] text-[#999] font-mono">
                    {getLangInfo(selectedLang).name}
                    {langVersions[selectedLang] && <span className="text-[#555] ml-1">({langVersions[selectedLang]?.split(' ')[0]?.split('(')[0]})</span>}
                  </p>
                </div>
              </div>

              {/* Public Toggle */}
              <label className="flex items-center gap-2.5 mb-6 cursor-pointer group">
                <button onClick={() => setIsPublicRoom(!isPublicRoom)}
                  className={`w-8 h-[17px] rounded-full transition-all relative ${isPublicRoom ? 'bg-[#5bd882]' : 'bg-[#444]'}`}>
                  <div className={`w-[13px] h-[13px] rounded-full bg-white absolute top-[2px] transition-all duration-200 shadow-sm`}
                    style={{ left: isPublicRoom ? '14px' : '2px' }} />
                </button>
                <span className="text-[11px] text-[#777] group-hover:text-[#aaa] transition font-mono">
                  {isPublicRoom ? 'public — listed on home' : 'private — invite only'}
                </span>
              </label>

              <button onClick={handleCreateRoom}
                className="magnetic-btn ripple-btn w-full py-3 bg-[#5e9eff] hover:bg-[#7ab3ff] text-[#0a0a0a] text-[14px] font-display font-semibold rounded-xl transition-all glow-pulse shadow-lg shadow-[#5e9eff]/10">
                create room
              </button>
            </div>

            {/* Join Room */}
            <div className="bg-[#1a1b1e] border border-[#282828] rounded-2xl p-5 sm:p-7 hover-lift fade-in-scale tilt-card" style={{ animationDelay: '100ms' }}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ffb347] breathe" />
                  <h3 className="text-[14px] font-display font-semibold text-white">join room</h3>
                </div>
                <span className="text-[10px] text-[#555] font-mono">got a code?</span>
              </div>
              <form onSubmit={handleJoinRoom}>
                <div className="mb-6">
                  <input type="text" value={joinCode}
                    onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
                    placeholder="ABC123" maxLength={6}
                    className="w-full px-4 py-3.5 bg-[#111] border border-[#282828] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#5e9eff]/40 focus:shadow-[0_0_0_3px_rgba(94,158,255,0.08)] font-mono text-center text-xl tracking-[0.3em] uppercase transition-all" />
                  {error && (
                    <p className="mt-2 text-[#ff6b6b] text-[11px] font-mono pl-1 fade-up">{error}</p>
                  )}
                </div>
                <button type="submit" disabled={joinLoading}
                  className="magnetic-btn ripple-btn w-full py-3 bg-[#222] hover:bg-[#2a2b30] text-white text-[14px] font-display font-semibold rounded-xl transition-all border border-[#333] disabled:opacity-40 hover:border-[#444]">
                  {joinLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-[#555] border-t-white rounded-full animate-spin" />
                      checking...
                    </span>
                  ) : 'join room'}
                </button>
              </form>
            </div>
          </div>

          {/* ── Features (fun cards) ─────────────────────────────── */}
          <div className="reveal mb-10 sm:mb-16">
            <h3 className="text-[11px] text-[#555] font-mono mb-5 uppercase tracking-wider">what you get</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 stagger-in">
              {[
                { 
                  label: 'CRDT Sync', 
                  detail: 'Yjs-powered, no conflicts ever. Type freely.', 
                  color: '#5e9eff',
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )
                },
                { 
                  label: 'Voice Chat', 
                  detail: 'WebRTC peer-to-peer audio. No server relay.', 
                  color: '#5bd882',
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )
                },
                { 
                  label: '20 Languages', 
                  detail: 'From Python to Assembly. All run server-side.', 
                  color: '#ffb347',
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  )
                },
                { 
                  label: 'Themes & More', 
                  detail: '6 terminal themes, minimap, font control.', 
                  color: '#c4b5fd',
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                  )
                },
              ].map((feat, i) => (
                <div key={i} className="hover-lift p-4 bg-[#1a1b1e] rounded-xl border border-[#222] hover:border-[#333] transition-all group"
                  style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                      style={{ color: feat.color, background: feat.color + '12' }}>
                      {feat.icon}
                    </div>
                    <div className="text-[13px] font-semibold text-[#ddd] group-hover:text-white transition">{feat.label}</div>
                  </div>
                  <div className="text-[11px] text-[#555] font-mono leading-relaxed group-hover:text-[#777] transition">{feat.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Tabs: Rooms / Gallery ──────────────────────────── */}
          <div className="reveal">
            <div className="flex items-center gap-5 mb-5">
              <button onClick={() => setTab('rooms')}
                className={`text-[12px] font-mono pb-1.5 transition-all ${tab === 'rooms' ? 'text-white border-b-2 border-[#5e9eff]' : 'text-[#555] hover:text-[#888]'}`}>
                live rooms
              </button>
              <button onClick={() => { setTab('gallery'); fetchGallery(); }}
                className={`text-[12px] font-mono pb-1.5 transition-all ${tab === 'gallery' ? 'text-white border-b-2 border-[#5e9eff]' : 'text-[#555] hover:text-[#888]'}`}>
                gallery
              </button>
              <div className="flex-1" />
              {tab === 'rooms' && (
                <button onClick={fetchPublicRooms} className="text-[10px] text-[#555] hover:text-[#888] transition font-mono hover:underline">refresh</button>
              )}
              {tab === 'gallery' && (
                <button onClick={() => setShowShareModal(true)}
                  className="magnetic-btn text-[10px] px-3 py-1.5 bg-[#222] text-[#888] hover:text-white rounded-lg border border-[#333] hover:border-[#444] transition font-mono">
                  + share code
                </button>
              )}
            </div>

            {/* Public Rooms */}
            {tab === 'rooms' && (
              <div className="mb-10 fade-up">
                {publicRooms.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="text-[32px] mb-3 float">{'{ }'}</div>
                    <p className="text-[#555] text-[13px]">no public rooms right now</p>
                    <p className="text-[#444] text-[11px] mt-1 font-mono">create one and it shows up here</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {publicRooms.map((room, idx) => {
                      const langInfo = getLangInfo(room.language);
                      return (
                        <button key={room.roomId} onClick={() => router.push(`/room/${room.roomId}`)}
                          className="w-full flex items-center justify-between px-4 py-3.5 bg-[#1a1b1e] hover:bg-[#1e1f22] rounded-xl transition-all group border border-transparent hover:border-[#282828] hover-lift"
                          style={{ animationDelay: `${idx * 40}ms` }}>
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-[#5bd882] breathe" />
                            <span className="text-[13px] font-mono text-[#aaa] tracking-wider">{room.roomId}</span>
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ color: langInfo.color, background: langInfo.color + '12' }}>
                              {langInfo.icon}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-[#555] font-mono">
                            <span>{room.userCount} online</span>
                            <svg className="w-3 h-3 opacity-0 group-hover:opacity-60 transition transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
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
              <div className="mb-10 fade-up">
                {galleryLoading ? (
                  <div className="text-center py-16">
                    <div className="spinner mx-auto mb-3" />
                    <p className="text-[#555] text-[11px] font-mono">loading snippets...</p>
                  </div>
                ) : gallery.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="text-[32px] mb-3 float-delayed">{'</>'}</div>
                    <p className="text-[#555] text-[13px]">gallery is empty</p>
                    <p className="text-[#444] text-[11px] mt-1 font-mono">be the first to share something</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {gallery.map((snippet, idx) => {
                      const langInfo = getLangInfo(snippet.language);
                      return (
                        <div key={snippet.id}
                          onClick={() => setSelectedSnippet(snippet.id === selectedSnippet?.id ? null : snippet)}
                          className="bg-[#1a1b1e] border border-[#282828] rounded-xl p-4 hover:border-[#333] cursor-pointer transition-all hover-lift"
                          style={{ animationDelay: `${idx * 60}ms` }}>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-[13px] font-medium text-[#ccc] truncate">{snippet.title}</h4>
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ml-2 flex-shrink-0" style={{ color: langInfo.color, background: langInfo.color + '12' }}>
                              {langInfo.icon}
                            </span>
                          </div>
                          {snippet.description && <p className="text-[11px] text-[#555] mb-2 line-clamp-2">{snippet.description}</p>}
                          <pre className="text-[10px] text-[#666] bg-[#111] rounded-lg p-2.5 overflow-hidden max-h-20 font-mono leading-relaxed border border-[#1e1e1e]">{snippet.code}</pre>
                          <div className="flex items-center justify-between mt-2.5 text-[10px] text-[#555] font-mono">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: snippet.authorColor || '#666' }} />
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
          </div>

          {/* ── Keyboard Shortcuts (fun footer section) ──────────── */}
          <div className="reveal mb-10 sm:mb-16">
            <div className="bg-[#1a1b1e] border border-[#222] rounded-2xl p-5 sm:p-6 text-center">
              <h3 className="text-[11px] text-[#555] font-mono mb-4 uppercase tracking-wider">keyboard shortcuts</h3>
              <div className="flex flex-wrap justify-center gap-4 text-[11px]">
                {[
                  { keys: 'Ctrl + Enter', action: 'Run code' },
                  { keys: 'Ctrl + B', action: 'Toggle chat' },
                  { keys: 'Ctrl + `', action: 'Toggle terminal' },
                  { keys: 'Ctrl + S', action: 'Save file' },
                ].map((shortcut, i) => (
                  <div key={i} className="flex items-center gap-2 text-[#666] font-mono">
                    <kbd className="text-[#aaa]">{shortcut.keys}</kbd>
                    <span className="text-[#444]">{shortcut.action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* ── Snippet Detail Modal ───────────────────────────── */}
      {selectedSnippet && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setSelectedSnippet(null); }}>
          <div className="modal-enter bg-[#1a1b1e] border border-[#333] rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-display font-semibold text-white">{selectedSnippet.title}</h3>
              <button onClick={() => setSelectedSnippet(null)} className="p-1.5 text-[#666] hover:text-white transition rounded-lg hover:bg-[#222]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {selectedSnippet.description && <p className="text-[13px] text-[#777] mb-4">{selectedSnippet.description}</p>}
            <pre className="text-[12px] text-[#ccc] bg-[#111] rounded-xl p-4 overflow-auto max-h-96 font-mono leading-relaxed border border-[#222]">{selectedSnippet.code}</pre>
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2 text-[11px] text-[#666] font-mono">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedSnippet.authorColor || '#666' }} />
                <span>{selectedSnippet.author}</span>
                <span className="text-[#444]">/</span>
                <span>{getLangInfo(selectedSnippet.language).name}</span>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(selectedSnippet.code).catch(() => {}); }}
                className="magnetic-btn text-[11px] px-3 py-1.5 bg-[#222] text-[#aaa] rounded-lg hover:bg-[#2a2b30] hover:text-white transition border border-[#333] font-mono">
                copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Share Code Modal ────────────────────────────────── */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowShareModal(false); }}>
          <div className="modal-enter bg-[#1a1b1e] border border-[#333] rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-[15px] font-display font-semibold text-white mb-4">share your code</h3>
            <form onSubmit={handleShareCode} className="space-y-3">
              <input type="text" placeholder="title" value={shareForm.title}
                onChange={(e) => setShareForm(p => ({ ...p, title: e.target.value }))}
                className="w-full px-4 py-2.5 bg-[#111] border border-[#282828] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#5e9eff]/40 focus:shadow-[0_0_0_3px_rgba(94,158,255,0.08)] text-[13px] transition-all" required maxLength={100} />
              <input type="text" placeholder="description (optional)" value={shareForm.description}
                onChange={(e) => setShareForm(p => ({ ...p, description: e.target.value }))}
                className="w-full px-4 py-2.5 bg-[#111] border border-[#282828] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#5e9eff]/40 focus:shadow-[0_0_0_3px_rgba(94,158,255,0.08)] text-[13px] transition-all" maxLength={500} />
              <select value={shareForm.language} onChange={(e) => setShareForm(p => ({ ...p, language: e.target.value }))}
                className="w-full px-4 py-2.5 bg-[#111] border border-[#282828] rounded-xl text-white focus:outline-none focus:border-[#5e9eff]/40 text-[13px] transition-all">
                {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <textarea placeholder="paste your code..." value={shareForm.code}
                onChange={(e) => setShareForm(p => ({ ...p, code: e.target.value }))}
                className="w-full px-4 py-2.5 bg-[#111] border border-[#282828] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#5e9eff]/40 focus:shadow-[0_0_0_3px_rgba(94,158,255,0.08)] text-[13px] font-mono h-40 resize-none transition-all" required maxLength={50000} />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowShareModal(false)} className="flex-1 py-2.5 bg-[#222] text-[#aaa] rounded-xl hover:bg-[#2a2b30] transition text-[13px] border border-[#333]">cancel</button>
                <button type="submit" disabled={shareLoading} className="magnetic-btn flex-1 py-2.5 bg-[#5e9eff] text-[#0a0a0a] rounded-xl hover:bg-[#7ab3ff] transition text-[13px] font-semibold disabled:opacity-40">
                  {shareLoading ? 'sharing...' : 'share'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Auth Modal ──────────────────────────────────────── */}
      {showAuth && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowAuth(false); setAuthError(''); } }}>
          <div className="modal-enter bg-[#1a1b1e] border border-[#333] rounded-2xl p-6 w-full max-w-sm relative shadow-2xl">
            <button onClick={() => { setShowAuth(false); setAuthError(''); }}
              className="absolute top-4 right-4 text-[#555] hover:text-white transition p-1.5 rounded-lg hover:bg-[#222]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="text-[16px] font-display font-semibold text-white mb-1">{authMode === 'signup' ? 'create account' : 'welcome back'}</h3>
            <p className="text-[12px] text-[#666] mb-5 font-mono">{authMode === 'signup' ? 'save your settings across sessions' : 'pick up where you left off'}</p>
            <form onSubmit={handleAuth} className="space-y-2.5">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-[10px] text-[#666] mb-1 font-mono uppercase tracking-wider">username</label>
                  <input type="text" placeholder="CodeNinja" value={authForm.username}
                    onChange={(e) => setAuthForm(p => ({ ...p, username: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-[#111] border border-[#282828] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#5e9eff]/40 focus:shadow-[0_0_0_3px_rgba(94,158,255,0.08)] text-[13px] transition-all" required minLength={3} maxLength={20} />
                </div>
              )}
              <div>
                <label className="block text-[10px] text-[#666] mb-1 font-mono uppercase tracking-wider">email</label>
                <input type="email" placeholder="you@example.com" value={authForm.email}
                  onChange={(e) => setAuthForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-[#111] border border-[#282828] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#5e9eff]/40 focus:shadow-[0_0_0_3px_rgba(94,158,255,0.08)] text-[13px] transition-all" required />
              </div>
              <div>
                <label className="block text-[10px] text-[#666] mb-1 font-mono uppercase tracking-wider">password</label>
                <input type="password" placeholder="min 6 characters" value={authForm.password}
                  onChange={(e) => setAuthForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-[#111] border border-[#282828] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#5e9eff]/40 focus:shadow-[0_0_0_3px_rgba(94,158,255,0.08)] text-[13px] transition-all" required minLength={6} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input type="checkbox" checked={authForm.remember}
                  onChange={(e) => setAuthForm(p => ({ ...p, remember: e.target.checked }))}
                  className="w-3.5 h-3.5 rounded bg-[#111] border-[#333] text-[#5e9eff] focus:ring-[#5e9eff]/30 accent-[#5e9eff]" />
                <span className="text-[11px] text-[#666] font-mono">remember me</span>
              </label>
              {authError && (
                <p className="text-[#ff6b6b] text-[11px] font-mono bg-[#ff6b6b]/8 rounded-lg px-3 py-2">{authError}</p>
              )}
              <button type="submit" disabled={authLoading}
                className="magnetic-btn w-full py-2.5 bg-[#5e9eff] hover:bg-[#7ab3ff] text-[#0a0a0a] rounded-xl font-display font-semibold transition disabled:opacity-40 mt-1 text-[13px]">
                {authLoading ? 'loading...' : (authMode === 'signup' ? 'create account' : 'sign in')}
              </button>
            </form>
            <p className="text-center text-[11px] text-[#555] mt-4 font-mono">
              {authMode === 'signup' ? 'already have an account?' : "don't have an account?"}
              <button onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthError(''); }}
                className="text-[#5e9eff] ml-1 hover:underline">{authMode === 'signup' ? 'sign in' : 'sign up'}</button>
            </p>
            <p className="text-center text-[9px] text-[#444] mt-2.5 font-mono">
              or just skip — you get a unique anonymous name per tab
            </p>
          </div>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-[#1e1e1e] py-5 px-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <p className="text-[10px] text-[#444] font-mono">
            made with <span className="text-[#ff6b6b]">&lt;3</span> by namish
          </p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#333] font-mono">collabcode v9</span>
            <div className="w-1 h-1 rounded-full bg-[#5bd882] breathe" />
          </div>
        </div>
      </footer>
    </div>
  );
}
