/**
 * AccountSettings v11.0 — Full account settings modal
 * 
 * Profile editing, avatar customization, color picker,
 * notification preferences, keyboard shortcuts reference,
 * danger zone (delete account), and session management.
 * 
 * made with <3 by Namish
 */

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

const AVATAR_COLORS = [
  '#5e9eff', '#5bd882', '#ffb347', '#ff6b6b', '#c4b5fd',
  '#f472b6', '#34d399', '#fbbf24', '#818cf8', '#fb923c',
  '#22d3ee', '#a78bfa', '#f87171', '#4ade80', '#facc15',
  '#e879f9',
];

const AVATAR_EMOJIS = [
  '🧑‍💻', '👨‍💻', '👩‍💻', '🦊', '🐱', '🐼', '🦉', '🐙',
  '🎮', '🚀', '💡', '⚡', '🔥', '🌊', '🎯', '🎨',
];

const TABS = [
  { id: 'profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { id: 'appearance', label: 'Appearance', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
  { id: 'sessions', label: 'Sessions', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
];

const SHORTCUTS = [
  { keys: ['Ctrl', 'Enter'], action: 'Run code', desc: 'Execute current code' },
  { keys: ['Ctrl', 'B'], action: 'Toggle chat', desc: 'Show/hide chat panel' },
  { keys: ['Ctrl', '`'], action: 'Toggle terminal', desc: 'Show/hide output console' },
  { keys: ['Ctrl', 'S'], action: 'Save file', desc: 'Download current file' },
  { keys: ['Ctrl', 'O'], action: 'Open file', desc: 'Open a file from disk' },
  { keys: ['Esc'], action: 'Close dropdowns', desc: 'Close menus and modals' },
];

function SettingsPortal({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

const AccountSettings = memo(function AccountSettings({ isOpen, onClose, user, onUpdateUser, isAuthenticated }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // Profile form state
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [selectedColor, setSelectedColor] = useState('#5e9eff');
  const [selectedEmoji, setSelectedEmoji] = useState('🧑‍💻');
  const [bio, setBio] = useState('');

  // Appearance state
  const [uiScale, setUiScale] = useState('normal');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [soundEffects, setSoundEffects] = useState(true);

  const modalRef = useRef(null);

  // Load user data when modal opens
  useEffect(() => {
    if (isOpen && user) {
      setUsername(user.username || '');
      setEmail(user.email || '');
      setSelectedColor(user.color || '#5e9eff');
      setSelectedEmoji(user.emoji || '🧑‍💻');
      setBio(user.bio || '');
      
      // Load appearance prefs from localStorage
      try {
        const prefs = JSON.parse(localStorage.getItem('collabcode_prefs') || '{}');
        setUiScale(prefs.uiScale || 'normal');
        setReducedMotion(prefs.reducedMotion || false);
        setSoundEffects(prefs.soundEffects !== false);
      } catch (e) {}
    }
  }, [isOpen, user]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [isOpen, onClose]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!username.trim()) {
      showToast('Username is required', 'error');
      return;
    }
    if (username.trim().length < 3) {
      showToast('Username must be at least 3 characters', 'error');
      return;
    }

    setSaving(true);
    try {
      if (isAuthenticated && user?.token) {
        // Save to server for authenticated users
        try {
          await axios.put(`${SERVER_URL}/api/auth/profile`, {
            username: username.trim(),
            color: selectedColor,
            emoji: selectedEmoji,
            bio: bio.trim(),
          }, {
            headers: { Authorization: `Bearer ${user.token}` },
            timeout: 5000,
          });
        } catch (err) {
          // Server update failed — still update locally
        }
      }

      // Always update locally
      const updatedUser = {
        ...user,
        username: username.trim(),
        color: selectedColor,
        emoji: selectedEmoji,
        bio: bio.trim(),
      };
      
      onUpdateUser(updatedUser);
      showToast('Profile updated!');
    } catch (err) {
      showToast('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  }, [username, selectedColor, selectedEmoji, bio, user, isAuthenticated, onUpdateUser, showToast]);

  const handleSaveAppearance = useCallback(() => {
    try {
      localStorage.setItem('collabcode_prefs', JSON.stringify({
        uiScale, reducedMotion, soundEffects,
      }));
      showToast('Preferences saved!');
    } catch (e) {
      showToast('Failed to save preferences', 'error');
    }
  }, [uiScale, reducedMotion, soundEffects, showToast]);

  const handleDeleteAccount = useCallback(async () => {
    if (!isAuthenticated) {
      showToast('You need to be signed in to delete your account', 'error');
      return;
    }
    try {
      await axios.delete(`${SERVER_URL}/api/auth/account`, {
        headers: { Authorization: `Bearer ${user?.token}` },
        timeout: 5000,
      });
      localStorage.removeItem('collabcode_auth');
      sessionStorage.removeItem('collabcode_user');
      window.location.reload();
    } catch (err) {
      // Even if server fails, clear local data
      localStorage.removeItem('collabcode_auth');
      showToast('Account data cleared locally', 'success');
      onClose();
    }
  }, [isAuthenticated, user, onClose, showToast]);

  if (!isOpen) return null;

  return (
    <SettingsPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease' }} />
        
        {/* Modal */}
        <div ref={modalRef}
          className="relative w-full max-w-xl bg-[#1a1b1e] border border-[#333] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          style={{ animation: 'modalIn 0.25s cubic-bezier(0.22, 1, 0.36, 1)' }}>
          
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#282828] bg-[#19191c] flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{ background: selectedColor + '18', color: selectedColor }}>
                {selectedEmoji}
              </div>
              <div>
                <h2 className="text-[14px] font-display font-semibold text-white">Account Settings</h2>
                <p className="text-[10px] text-[#555] font-mono">
                  {isAuthenticated ? user?.email || 'signed in' : 'anonymous session'}
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className="p-1.5 text-[#555] hover:text-white rounded-lg hover:bg-[#222] transition active:scale-95">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-[#282828] px-3 bg-[#19191c] flex-shrink-0 overflow-x-auto scrollbar-none">
            {TABS.map(tab => (
              <button key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-mono transition-all whitespace-nowrap border-b-2 ${
                  activeTab === tab.id
                    ? 'text-[#5e9eff] border-[#5e9eff]'
                    : 'text-[#555] hover:text-[#888] border-transparent'
                }`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* ── Profile Tab ──────────────────────────────── */}
            {activeTab === 'profile' && (
              <div className="space-y-5" style={{ animation: 'fadeUp 0.3s ease' }}>
                {/* Avatar Preview */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl border-2 transition-all"
                      style={{ borderColor: selectedColor + '40', background: selectedColor + '12' }}>
                      {selectedEmoji}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#1a1b1e]"
                      style={{ background: selectedColor }} />
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-white">{username || 'Anonymous'}</p>
                    <p className="text-[11px] text-[#666] font-mono">{isAuthenticated ? 'Registered account' : 'Anonymous — sign in to save'}</p>
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label className="block text-[10px] text-[#666] mb-1.5 font-mono uppercase tracking-wider">username</label>
                  <input type="text" value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="CodeNinja"
                    maxLength={20}
                    className="w-full px-3.5 py-2.5 bg-[#111] border border-[#282828] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#5e9eff]/40 focus:shadow-[0_0_0_3px_rgba(94,158,255,0.08)] text-[13px] transition-all font-mono" />
                  <p className="text-[9px] text-[#444] mt-1 font-mono">{username.length}/20 characters</p>
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-[10px] text-[#666] mb-1.5 font-mono uppercase tracking-wider">bio</label>
                  <textarea value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="tell us about yourself..."
                    maxLength={120}
                    rows={2}
                    className="w-full px-3.5 py-2.5 bg-[#111] border border-[#282828] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#5e9eff]/40 focus:shadow-[0_0_0_3px_rgba(94,158,255,0.08)] text-[13px] transition-all resize-none" />
                  <p className="text-[9px] text-[#444] mt-1 font-mono">{bio.length}/120</p>
                </div>

                {/* Avatar Emoji */}
                <div>
                  <label className="block text-[10px] text-[#666] mb-2 font-mono uppercase tracking-wider">avatar</label>
                  <div className="grid grid-cols-8 gap-1.5">
                    {AVATAR_EMOJIS.map(emoji => (
                      <button key={emoji}
                        onClick={() => setSelectedEmoji(emoji)}
                        className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                          selectedEmoji === emoji
                            ? 'bg-[#5e9eff]/15 ring-2 ring-[#5e9eff]/30 scale-110'
                            : 'bg-[#111] hover:bg-[#222] hover:scale-105'
                        }`}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Picker */}
                <div>
                  <label className="block text-[10px] text-[#666] mb-2 font-mono uppercase tracking-wider">accent color</label>
                  <div className="grid grid-cols-8 gap-1.5">
                    {AVATAR_COLORS.map(color => (
                      <button key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`w-9 h-9 rounded-lg transition-all ${
                          selectedColor === color ? 'ring-2 ring-white/30 scale-110' : 'hover:scale-105'
                        }`}
                        style={{ background: color }}>
                        {selectedColor === color && (
                          <svg className="w-4 h-4 mx-auto text-white drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Save Button */}
                <button onClick={handleSaveProfile} disabled={saving}
                  className="w-full py-2.5 bg-[#5e9eff] hover:bg-[#7ab3ff] text-[#0a0a0a] rounded-xl font-display font-semibold transition-all text-[13px] disabled:opacity-50 active:scale-[0.98]">
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-[#0a0a0a]/30 border-t-[#0a0a0a] rounded-full animate-spin" />
                      saving...
                    </span>
                  ) : 'save profile'}
                </button>
              </div>
            )}

            {/* ── Appearance Tab ────────────────────────────── */}
            {activeTab === 'appearance' && (
              <div className="space-y-5" style={{ animation: 'fadeUp 0.3s ease' }}>
                {/* UI Scale */}
                <div>
                  <label className="block text-[10px] text-[#666] mb-2 font-mono uppercase tracking-wider">ui scale</label>
                  <div className="flex gap-2">
                    {['compact', 'normal', 'comfortable'].map(scale => (
                      <button key={scale}
                        onClick={() => setUiScale(scale)}
                        className={`flex-1 py-2 rounded-lg text-[11px] font-mono transition-all ${
                          uiScale === scale
                            ? 'bg-[#5e9eff]/10 text-[#5e9eff] border border-[#5e9eff]/20'
                            : 'bg-[#111] text-[#666] hover:text-[#aaa] border border-[#222] hover:border-[#333]'
                        }`}>
                        {scale}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-3">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div>
                      <span className="text-[12px] text-[#ccc] group-hover:text-white transition block">Reduced Motion</span>
                      <span className="text-[10px] text-[#555] font-mono">Disable animations for accessibility</span>
                    </div>
                    <button onClick={() => setReducedMotion(!reducedMotion)}
                      className={`w-9 h-5 rounded-full transition-all relative flex-shrink-0 ${reducedMotion ? 'bg-[#5e9eff]' : 'bg-[#444]'}`}>
                      <div className="w-[16px] h-[16px] rounded-full bg-white absolute top-[2px] transition-all shadow-sm"
                        style={{ left: reducedMotion ? '18px' : '2px' }} />
                    </button>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer group">
                    <div>
                      <span className="text-[12px] text-[#ccc] group-hover:text-white transition block">Sound Effects</span>
                      <span className="text-[10px] text-[#555] font-mono">Play sounds for notifications</span>
                    </div>
                    <button onClick={() => setSoundEffects(!soundEffects)}
                      className={`w-9 h-5 rounded-full transition-all relative flex-shrink-0 ${soundEffects ? 'bg-[#5bd882]' : 'bg-[#444]'}`}>
                      <div className="w-[16px] h-[16px] rounded-full bg-white absolute top-[2px] transition-all shadow-sm"
                        style={{ left: soundEffects ? '18px' : '2px' }} />
                    </button>
                  </label>
                </div>

                {/* Save */}
                <button onClick={handleSaveAppearance}
                  className="w-full py-2.5 bg-[#222] hover:bg-[#2a2b30] text-white rounded-xl font-display font-semibold transition-all text-[13px] border border-[#333] active:scale-[0.98]">
                  save preferences
                </button>
              </div>
            )}

            {/* ── Shortcuts Tab ────────────────────────────── */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-2" style={{ animation: 'fadeUp 0.3s ease' }}>
                <p className="text-[11px] text-[#666] font-mono mb-3">Available keyboard shortcuts in the editor</p>
                {SHORTCUTS.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 bg-[#111] rounded-xl border border-[#1e1e1e] hover:border-[#282828] transition group">
                    <div>
                      <p className="text-[12px] text-[#ccc] group-hover:text-white transition">{shortcut.action}</p>
                      <p className="text-[10px] text-[#555] font-mono">{shortcut.desc}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, j) => (
                        <span key={j}>
                          <kbd className="text-[10px] px-1.5 py-0.5 bg-[#222] border border-[#333] rounded text-[#aaa] font-mono">{key}</kbd>
                          {j < shortcut.keys.length - 1 && <span className="text-[#444] mx-0.5 text-[9px]">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="mt-4 p-3 bg-[#5e9eff]/5 border border-[#5e9eff]/10 rounded-xl">
                  <p className="text-[10px] text-[#5e9eff] font-mono">
                    tip: on mac, use <kbd className="text-[9px]">Cmd</kbd> instead of <kbd className="text-[9px]">Ctrl</kbd>
                  </p>
                </div>
              </div>
            )}

            {/* ── Sessions Tab ─────────────────────────────── */}
            {activeTab === 'sessions' && (
              <div className="space-y-5" style={{ animation: 'fadeUp 0.3s ease' }}>
                {/* Current Session */}
                <div>
                  <label className="block text-[10px] text-[#666] mb-2 font-mono uppercase tracking-wider">current session</label>
                  <div className="p-3.5 bg-[#111] rounded-xl border border-[#222]">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-2 h-2 rounded-full bg-[#5bd882] animate-pulse" />
                      <span className="text-[12px] text-[#ccc] font-medium">Active Now</span>
                    </div>
                    <div className="space-y-1 text-[10px] font-mono text-[#666]">
                      <p>user: <span className="text-[#aaa]">{username}</span></p>
                      <p>id: <span className="text-[#aaa]">{user?.userId?.slice(0, 12)}...</span></p>
                      <p>type: <span className="text-[#aaa]">{isAuthenticated ? 'registered' : 'anonymous'}</span></p>
                      <p>tab: <span className="text-[#aaa]">{user?.tabId?.slice(0, 8)}...</span></p>
                    </div>
                  </div>
                </div>

                {/* Storage Info */}
                <div>
                  <label className="block text-[10px] text-[#666] mb-2 font-mono uppercase tracking-wider">local storage</label>
                  <div className="space-y-1.5">
                    {['collabcode_auth', 'collabcode_settings', 'collabcode_prefs'].map(key => {
                      const exists = typeof window !== 'undefined' && !!localStorage.getItem(key);
                      return (
                        <div key={key} className="flex items-center justify-between py-2 px-3 bg-[#111] rounded-lg border border-[#1e1e1e]">
                          <span className="text-[11px] font-mono text-[#888]">{key}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-mono ${exists ? 'text-[#5bd882]' : 'text-[#555]'}`}>
                              {exists ? 'stored' : 'empty'}
                            </span>
                            {exists && (
                              <button onClick={() => { localStorage.removeItem(key); showToast(`Cleared ${key}`); }}
                                className="text-[9px] text-[#ff6b6b] hover:underline font-mono">
                                clear
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="border border-[#ff6b6b]/15 rounded-xl p-4 bg-[#ff6b6b]/3">
                  <h4 className="text-[12px] font-semibold text-[#ff6b6b] mb-1">Danger Zone</h4>
                  <p className="text-[10px] text-[#888] font-mono mb-3">
                    {isAuthenticated 
                      ? 'Delete your account and all associated data. This cannot be undone.'
                      : 'Clear all local session data and start fresh.'}
                  </p>
                  {!confirmDelete ? (
                    <button onClick={() => setConfirmDelete(true)}
                      className="text-[11px] px-4 py-2 bg-[#ff6b6b]/10 text-[#ff6b6b] rounded-lg border border-[#ff6b6b]/15 hover:bg-[#ff6b6b]/20 transition font-mono active:scale-95">
                      {isAuthenticated ? 'delete account' : 'clear all data'}
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={handleDeleteAccount}
                        className="text-[11px] px-4 py-2 bg-[#ff6b6b] text-white rounded-lg hover:bg-[#ff5555] transition font-mono font-semibold active:scale-95">
                        confirm delete
                      </button>
                      <button onClick={() => setConfirmDelete(false)}
                        className="text-[11px] px-4 py-2 bg-[#222] text-[#aaa] rounded-lg border border-[#333] hover:bg-[#2a2b30] transition font-mono active:scale-95">
                        cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Toast Notification */}
        {toast && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100000] px-4 py-2.5 rounded-xl text-[12px] font-mono shadow-2xl border backdrop-blur-sm transition-all ${
            toast.type === 'error'
              ? 'bg-[#ff6b6b]/15 text-[#ff6b6b] border-[#ff6b6b]/20'
              : 'bg-[#5bd882]/15 text-[#5bd882] border-[#5bd882]/20'
          }`} style={{ animation: 'fadeUp 0.3s ease' }}>
            <div className="flex items-center gap-2">
              {toast.type === 'error' ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {toast.message}
            </div>
          </div>
        )}
      </div>
    </SettingsPortal>
  );
});

export default AccountSettings;
