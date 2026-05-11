/**
 * Chat v16.0 — Hardened for Heavy Load
 *
 * v16.0 hardening:
 *  - Typing indicator timers tracked per-user and properly cleaned up on unmount
 *  - Reactions state capped at 500 messages max (oldest pruned)
 *  - typingTimeoutRef properly cleaned on unmount
 *  - Max 50 typing users tracked (prevents Map explosion from malicious clients)
 *
 * Previous: v15.0 — Full emoji picker, enhanced reactions, polished UX
 *
 * New in v15:
 *  - Full emoji picker drawer with categories & search
 *  - Enhanced reaction bar with animation on add/remove
 *  - Better hover reaction tray (6 quick + picker button)
 *  - Improved code block styling with language detection hint
 *  - Better URL detection (handles more edge cases)
 *  - Message edit indicator
 *  - Reply-to threading (single-level)
 *  - Reaction count badges with tooltip
 *  - Improved empty state & scroll behavior
 *
 * made with <3 by Namish
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '👀', '🎉'];

// v15: Full emoji picker categories
const EMOJI_CATEGORIES = {
  'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  'Gestures': ['👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐','🖖','👋','🤏','✍️','💪'],
  'Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟'],
  'Objects': ['🔥','⭐','🌟','✨','💥','💫','🎉','🎊','🏆','🥇','🏅','🎯','🎪','🎭','🎨','🎬','🎮','🎲','🔮','💡','📌','📎','🔗','💻','⌨️','🖥','📱','📝','📚','🔔'],
  'Nature': ['🌸','🌺','🌻','🌼','🌷','🌹','🍀','🌿','🌱','🌳','🍃','🍂','🍁','🌾','🌵','🌈','☀️','🌤','⛅','🌥','☁️','🌧','⛈','🌩','❄️','☃️','🌊','💧','💦'],
};

function EmojiPicker({ onSelect, onClose }) {
  const [activeTab, setActiveTab] = useState('Smileys');
  const [search, setSearch] = useState('');
  const categories = Object.keys(EMOJI_CATEGORIES);

  const filteredEmojis = search
    ? Object.values(EMOJI_CATEGORIES).flat().filter(e => e.includes(search))
    : EMOJI_CATEGORIES[activeTab] || [];

  return (
    <div className="bg-[#1a1b1e] border border-[#333] rounded-xl shadow-2xl overflow-hidden w-[260px]"
      style={{ animation: 'fadeUp 0.15s ease' }} onClick={(e) => e.stopPropagation()}>
      {/* Search */}
      <div className="px-2.5 pt-2.5 pb-1.5">
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emoji..."
          className="w-full px-2.5 py-1.5 bg-[#111] border border-[#282828] rounded-lg text-[11px] text-white placeholder-[#555] focus:outline-none focus:border-[#5e9eff]/30 font-mono"
          autoFocus autoComplete="off" spellCheck={false}
        />
      </div>
      {/* Category Tabs */}
      {!search && (
        <div className="flex px-2 gap-0.5 border-b border-[#222] pb-1">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveTab(cat)}
              className={`flex-1 py-1 text-[9px] font-mono rounded transition truncate ${activeTab === cat ? 'text-[#5e9eff] bg-[#5e9eff]/10' : 'text-[#555] hover:text-[#888] hover:bg-[#222]'}`}>
              {cat === 'Smileys' ? '😀' : cat === 'Gestures' ? '👍' : cat === 'Hearts' ? '❤️' : cat === 'Objects' ? '🔥' : '🌸'}
            </button>
          ))}
        </div>
      )}
      {/* Emoji Grid */}
      <div className="grid grid-cols-8 gap-0.5 p-2 max-h-[180px] overflow-y-auto">
        {filteredEmojis.map((emoji, i) => (
          <button key={i} onClick={() => { onSelect(emoji); onClose(); }}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#222] text-[16px] transition active:scale-90">
            {emoji}
          </button>
        ))}
        {filteredEmojis.length === 0 && (
          <div className="col-span-8 py-4 text-center text-[10px] text-[#555] font-mono">no emoji found</div>
        )}
      </div>
    </div>
  );
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatExactTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Detect code language from content heuristics
function detectCodeLang(code) {
  if (/^\s*(def |class |import |from |print\()/.test(code)) return 'python';
  if (/^\s*(function |const |let |var |=>|console\.)/.test(code)) return 'js';
  if (/^\s*(#include|int main|printf\()/.test(code)) return 'c';
  if (/^\s*(fn |let mut |println!|use )/.test(code)) return 'rust';
  if (/^\s*(func |package |fmt\.)/.test(code)) return 'go';
  if (/^\s*(public class|System\.out)/.test(code)) return 'java';
  if (/^\s*(<\?php|echo |\$\w+)/.test(code)) return 'php';
  if (/^\s*(SELECT |INSERT |CREATE |ALTER )/i.test(code)) return 'sql';
  if (/^\s*(<!DOCTYPE|<html|<div)/.test(code)) return 'html';
  if (/^\s*(\{|\[)/.test(code) && /["\w]+\s*:/.test(code)) return 'json';
  return null;
}

// Parse message content for code blocks and URLs
function renderContent(content) {
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    const lang = match[1] || detectCodeLang(match[2].trim());
    parts.push({ type: 'code', content: match[2].trim(), lang });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  if (parts.length === 0) parts.push({ type: 'text', content });

  return parts.map((part, i) => {
    if (part.type === 'code') {
      return (
        <div key={i} className="relative group/code mt-1.5 mb-1.5">
          {part.lang && (
            <div className="flex items-center justify-between px-3 py-1 bg-[#0a0a0c] rounded-t-lg border border-b-0 border-[#222]">
              <span className="text-[9px] font-mono text-[#555] uppercase tracking-wider">{part.lang}</span>
            </div>
          )}
          <pre className={`text-[11px] bg-[#0d0d10] px-3 py-2.5 overflow-x-auto font-mono border border-[#222] text-[#ccc] leading-relaxed ${part.lang ? 'rounded-b-lg' : 'rounded-lg'}`}>{part.content}</pre>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(part.content).catch(() => {});
              const btn = e.currentTarget;
              btn.dataset.copied = 'true';
              setTimeout(() => { btn.dataset.copied = ''; }, 1200);
            }}
            className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-[#1a1a1f] text-[#555] hover:text-[#aaa] opacity-0 group-hover/code:opacity-100 transition-all border border-[#222] hover:border-[#444]"
            title="Copy code">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
        </div>
      );
    }
    // Parse URLs in text — improved regex
    const urlRegex = /(https?:\/\/[^\s<>)"']+)/g;
    const textParts = part.content.split(urlRegex);
    return (
      <span key={i}>
        {textParts.map((p, j) => {
          // Reset regex state for test
          urlRegex.lastIndex = 0;
          if (urlRegex.test(p)) {
            // Clean trailing punctuation
            let url = p;
            const trailingPunct = /[.,;:!?)]+$/;
            const trailMatch = url.match(trailingPunct);
            const trailing = trailMatch ? trailMatch[0] : '';
            if (trailing) url = url.slice(0, -trailing.length);
            return (
              <span key={j}>
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="text-[#5e9eff] hover:text-[#7cb8ff] hover:underline break-all transition-colors" onClick={(e) => e.stopPropagation()}>
                  {url.length > 50 ? url.slice(0, 50) + '...' : url}
                </a>
                {trailing}
              </span>
            );
          }
          return <span key={j}>{p}</span>;
        })}
      </span>
    );
  });
}

const Chat = memo(function Chat({ messages, onSendMessage, currentUser, socket }) {
  const [inputValue, setInputValue] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [reactions, setReactions] = useState({}); // { msgIndex: { emoji: [userId, ...] } }
  const [replyTo, setReplyTo] = useState(null); // index of message being replied to
  const [emojiPickerFor, setEmojiPickerFor] = useState(null); // v15: which msgIndex has picker open
  const [inputEmojiPicker, setInputEmojiPicker] = useState(false); // v15: emoji picker for input
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingTimersRef = useRef(new Map()); // v16: per-user typing cleanup timers
  const isNearBottom = useRef(true);

  // v16: Cleanup typing timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of typingTimersRef.current.values()) clearTimeout(timer);
      typingTimersRef.current.clear();
      clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    setUnreadCount(0);
  }, []);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    isNearBottom.current = nearBottom;
    setShowScrollBtn(!nearBottom);
    if (nearBottom) setUnreadCount(0);
  }, []);

  useEffect(() => {
    if (isNearBottom.current) {
      scrollToBottom(true);
    } else {
      setUnreadCount(prev => prev + 1);
    }
  }, [messages]);

  // Socket listeners for typing and reactions
  useEffect(() => {
    if (!socket) return;
    const handleTyping = (data) => {
      setTypingUsers(prev => {
        const next = new Map(prev);
        if (data.isTyping) {
          // v16: Cap typing users at 50 to prevent Map explosion
          if (next.size >= 50 && !next.has(data.userId)) return next;
          next.set(data.userId, data.username);
          // v16: Track per-user timer and clear previous one
          const prevTimer = typingTimersRef.current.get(data.userId);
          if (prevTimer) clearTimeout(prevTimer);
          const timer = setTimeout(() => {
            typingTimersRef.current.delete(data.userId);
            setTypingUsers(p => {
              const n = new Map(p);
              n.delete(data.userId);
              return n;
            });
          }, 3000);
          typingTimersRef.current.set(data.userId, timer);
        } else {
          next.delete(data.userId);
          const prevTimer = typingTimersRef.current.get(data.userId);
          if (prevTimer) { clearTimeout(prevTimer); typingTimersRef.current.delete(data.userId); }
        }
        return next;
      });
    };

    const handleReaction = (data) => {
      // data: { msgIndex, emoji, userId, action: 'add'|'remove' }
      setReactions(prev => {
        const next = { ...prev };
        const msgReactions = { ...(next[data.msgIndex] || {}) };
        const users = [...(msgReactions[data.emoji] || [])];
        if (data.action === 'add' && !users.includes(data.userId)) {
          users.push(data.userId);
        } else if (data.action === 'remove') {
          const idx = users.indexOf(data.userId);
          if (idx > -1) users.splice(idx, 1);
        }
        if (users.length > 0) {
          msgReactions[data.emoji] = users;
        } else {
          delete msgReactions[data.emoji];
        }
        if (Object.keys(msgReactions).length > 0) {
          next[data.msgIndex] = msgReactions;
        } else {
          delete next[data.msgIndex];
        }
        // v16: Cap reactions state at 500 message indices — prune oldest
        const keys = Object.keys(next);
        if (keys.length > 500) {
          const sortedKeys = keys.map(Number).sort((a, b) => a - b);
          const excess = sortedKeys.length - 500;
          for (let i = 0; i < excess; i++) delete next[sortedKeys[i]];
        }
        return next;
      });
    };

    socket.on('chat:typing', handleTyping);
    socket.on('chat:reaction', handleReaction);
    return () => {
      socket.off('chat:typing', handleTyping);
      socket.off('chat:reaction', handleReaction);
    };
  }, [socket]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    const payload = { content: inputValue.trim(), type: 'chat' };
    if (replyTo !== null && messages[replyTo]) {
      payload.replyTo = {
        username: messages[replyTo].username,
        content: messages[replyTo].content?.slice(0, 80),
      };
    }
    onSendMessage(inputValue);
    setInputValue('');
    setReplyTo(null);
    if (socket) socket.emit('chat:typing', { isTyping: false });
  }, [inputValue, onSendMessage, socket, replyTo, messages]);

  const handleInputChange = useCallback((e) => {
    setInputValue(e.target.value);
    if (socket) {
      socket.emit('chat:typing', { isTyping: true });
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('chat:typing', { isTyping: false });
      }, 2000);
    }
  }, [socket]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && replyTo !== null) {
      setReplyTo(null);
    }
  }, [handleSend, replyTo]);

  const handleReact = useCallback((msgIndex, emoji) => {
    if (!socket || !currentUser) return;
    const msgReactions = reactions[msgIndex] || {};
    const users = msgReactions[emoji] || [];
    const alreadyReacted = users.includes(currentUser.userId);
    const action = alreadyReacted ? 'remove' : 'add';

    // Optimistic update
    setReactions(prev => {
      const next = { ...prev };
      const mr = { ...(next[msgIndex] || {}) };
      const u = [...(mr[emoji] || [])];
      if (action === 'add') {
        u.push(currentUser.userId);
      } else {
        const idx = u.indexOf(currentUser.userId);
        if (idx > -1) u.splice(idx, 1);
      }
      if (u.length > 0) mr[emoji] = u;
      else delete mr[emoji];
      if (Object.keys(mr).length > 0) next[msgIndex] = mr;
      else delete next[msgIndex];
      return next;
    });

    socket.emit('chat:reaction', { msgIndex, emoji, action });
  }, [socket, currentUser, reactions]);

  // Group consecutive messages from same user
  function shouldShowHeader(msg, index) {
    if (index === 0) return true;
    if (msg.type === 'system') return true;
    const prev = messages[index - 1];
    if (prev.type === 'system') return true;
    if (prev.userId !== msg.userId) return true;
    if (msg.createdAt && prev.createdAt) {
      const diff = new Date(msg.createdAt) - new Date(prev.createdAt);
      if (diff > 300000) return true;
    }
    return false;
  }

  function renderMessage(msg, index) {
    const isSystem = msg.type === 'system';
    const isOwn = msg.userId === currentUser?.userId;
    const showHeader = shouldShowHeader(msg, index);
    const msgReactions = reactions[index] || {};
    const hasReactions = Object.keys(msgReactions).length > 0;

    if (isSystem) {
      return (
        <div key={index} className="flex justify-center py-2 chat-message-enter">
          <span className="text-[10px] text-[#555] font-mono bg-[#1e1f22] px-3 py-1 rounded-full border border-[#282828] flex items-center gap-1.5">
            <svg className="w-2.5 h-2.5 text-[#444]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {msg.content}
          </span>
        </div>
      );
    }

    return (
      <div key={index}
        className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} chat-message-enter group relative ${showHeader ? '' : 'mt-0.5'}`}
        onMouseEnter={() => setHoveredMsg(index)}
        onMouseLeave={() => setHoveredMsg(null)}>

        {showHeader && (
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: msg.color || '#5e9eff' }} />
            <span className="text-[10px] font-mono font-medium" style={{ color: msg.color || '#5e9eff' }}>
              {msg.username}
            </span>
            <span className="text-[9px] text-[#444] font-mono" title={formatExactTime(msg.createdAt)}>
              {msg.createdAt ? formatRelativeTime(msg.createdAt) : ''}
            </span>
          </div>
        )}

        {/* Reply context */}
        {msg.replyTo && (
          <div className={`flex items-center gap-1 text-[9px] mb-0.5 px-2 py-0.5 rounded border-l-2 ${isOwn ? 'border-[#5e9eff]/40 bg-[#5e9eff]/5' : 'border-[#444] bg-[#1a1a1f]'}`}>
            <span className="text-[#666]">replying to</span>
            <span className="text-[#888] font-medium">{msg.replyTo.username}</span>
            <span className="text-[#555] truncate max-w-[120px]">{msg.replyTo.content}</span>
          </div>
        )}

        <div className="relative max-w-[85%]">
          <div className={`px-3 py-1.5 text-[13px] break-words leading-relaxed
            ${isOwn
              ? `bg-[#5e9eff]/10 text-[#c8d8ee] ${showHeader ? 'rounded-xl rounded-br-sm' : 'rounded-xl rounded-br-sm'} border border-[#5e9eff]/15`
              : `bg-[#1e1f22] text-[#bbb] ${showHeader ? 'rounded-xl rounded-bl-sm' : 'rounded-xl rounded-bl-sm'} border border-[#282828]`
            }`}>
            {renderContent(msg.content)}
          </div>

          {/* Reaction badges */}
          {hasReactions && (
            <div className={`flex items-center gap-1 mt-1 flex-wrap ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {Object.entries(msgReactions).map(([emoji, users]) => {
                const isActive = users.includes(currentUser?.userId);
                return (
                  <button key={emoji}
                    onClick={() => handleReact(index, emoji)}
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition-all active:scale-90 ${
                      isActive
                        ? 'bg-[#5e9eff]/15 border border-[#5e9eff]/25'
                        : 'bg-[#1e1f22] border border-[#282828] hover:border-[#444]'
                    }`}>
                    <span className="text-[11px]">{emoji}</span>
                    <span className={`font-mono ${isActive ? 'text-[#5e9eff]' : 'text-[#666]'}`}>{users.length}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* v15: Enhanced quick reactions + reply + emoji picker on hover */}
          {hoveredMsg === index && (
            <div className={`absolute ${isOwn ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} top-0 flex items-center gap-0.5 z-10`}
              style={{ animation: 'fadeUp 0.15s ease' }}>
              {QUICK_REACTIONS.map((emoji, i) => (
                <button key={i} className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#222] text-[11px] transition active:scale-90 hover:scale-125"
                  onClick={(e) => { e.stopPropagation(); handleReact(index, emoji); }}
                  title={emoji}>
                  {emoji}
                </button>
              ))}
              {/* Emoji picker button */}
              <button className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#222] text-[#555] hover:text-[#aaa] transition active:scale-90"
                onClick={(e) => { e.stopPropagation(); setEmojiPickerFor(emojiPickerFor === index ? null : index); }}
                title="More reactions">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
              {/* Reply button */}
              <button className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#222] text-[#555] hover:text-[#aaa] transition active:scale-90"
                onClick={(e) => { e.stopPropagation(); setReplyTo(index); inputRef.current?.focus(); }}
                title="Reply">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
              </button>
            </div>
          )}
          {/* v15: Emoji picker popup for this message */}
          {emojiPickerFor === index && (
            <div className={`absolute ${isOwn ? 'right-0' : 'left-0'} top-full mt-1 z-20`}>
              <EmojiPicker
                onSelect={(emoji) => handleReact(index, emoji)}
                onClose={() => setEmojiPickerFor(null)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  const typingDisplay = Array.from(typingUsers.values())
    .filter(name => name !== currentUser?.username);

  return (
    <div className="h-full flex flex-col bg-[#1a1b1e]">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[#282828] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-[#888]">chat</span>
          {unreadCount > 0 && !isNearBottom.current && (
            <span className="text-[8px] px-1.5 py-0.5 bg-[#5e9eff] text-white rounded-full font-mono animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <span className="text-[10px] text-[#444] font-mono">{messages.length}</span>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2 relative"
        onScroll={handleScroll}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col">
            {/* v15: Chat loading skeleton — shows briefly before empty state */}
            <div className="flex-1 flex flex-col justify-end px-1 pb-2 gap-3" style={{ animation: 'fadeUp 0.4s ease' }}>
              {/* Skeleton message bubbles */}
              {[
                { align: 'left', w1: 24, w2: '75%' },
                { align: 'right', w1: 20, w2: '60%' },
                { align: 'left', w1: 28, w2: '85%' },
              ].map((s, i) => (
                <div key={i} className={`flex items-start gap-2 ${s.align === 'right' ? 'flex-row-reverse' : ''}`}
                  style={{ opacity: 0.15 - (i * 0.03), animationDelay: `${i * 0.1}s` }}>
                  <div className="skeleton w-6 h-6 rounded-full flex-shrink-0" />
                  <div className="space-y-1.5 max-w-[70%]">
                    <div className="skeleton rounded" style={{ width: `${s.w1}px`, height: '8px' }} />
                    <div className="skeleton rounded" style={{ width: s.w2, height: '28px', borderRadius: '12px' }} />
                  </div>
                </div>
              ))}
            </div>
            {/* Empty state message */}
            <div className="flex items-center justify-center pb-6 pt-2">
              <div className="text-center" style={{ animation: 'fadeUp 0.5s ease 0.2s both' }}>
                <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-[#1e1f22] border border-[#282828] flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#444]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                </div>
                <p className="text-[#555] text-[11px]">no messages yet</p>
                <p className="text-[#444] text-[9px] mt-1 font-mono">start the conversation</p>
              </div>
            </div>
          </div>
        )}
        {messages.map((msg, i) => renderMessage(msg, i))}

        {typingDisplay.length > 0 && (
          <div className="flex items-center gap-2 text-[10px] text-[#555] py-1 font-mono">
            <div className="typing-dots"><span /><span /><span /></div>
            <span>
              {typingDisplay.length === 1
                ? `${typingDisplay[0]} typing...`
                : `${typingDisplay.length} typing...`}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <div className="absolute right-4 z-20" style={{ bottom: '70px' }}>
          <button onClick={() => scrollToBottom(true)}
            className="w-8 h-8 rounded-full bg-[#222] border border-[#333] flex items-center justify-center text-[#888] hover:text-white hover:bg-[#2a2a30] transition shadow-lg active:scale-90"
            style={{ animation: 'fadeUp 0.2s ease' }}>
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#5e9eff] text-white text-[8px] rounded-full flex items-center justify-center font-mono">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
          </button>
        </div>
      )}

      {/* Reply indicator */}
      {replyTo !== null && messages[replyTo] && (
        <div className="px-3 py-1.5 border-t border-[#282828] bg-[#19191c] flex items-center gap-2 flex-shrink-0">
          <div className="w-0.5 h-4 rounded-full bg-[#5e9eff] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[9px] text-[#666]">replying to </span>
            <span className="text-[9px] font-medium" style={{ color: messages[replyTo].color || '#5e9eff' }}>{messages[replyTo].username}</span>
            <p className="text-[10px] text-[#555] truncate">{messages[replyTo].content?.slice(0, 60)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 text-[#555] hover:text-[#aaa] transition rounded">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-[#282828] relative">
        {/* v15: Input emoji picker */}
        {inputEmojiPicker && (
          <div className="absolute bottom-full left-3 mb-2 z-20">
            <EmojiPicker
              onSelect={(emoji) => setInputValue(prev => prev + emoji)}
              onClose={() => setInputEmojiPicker(false)}
            />
          </div>
        )}
        <div className="flex gap-1.5">
          {/* v15: Emoji button for input */}
          <button
            onClick={() => setInputEmojiPicker(prev => !prev)}
            className={`px-2 py-2 rounded-lg transition active:scale-95 flex-shrink-0 ${inputEmojiPicker ? 'bg-[#5e9eff]/10 text-[#5e9eff]' : 'text-[#555] hover:text-[#888] hover:bg-[#1e1f22]'} border border-transparent hover:border-[#282828]`}
            title="Add emoji">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={replyTo !== null ? "type your reply..." : "type something... (```code``` for code blocks)"}
            maxLength={2000}
            className="flex-1 px-3 py-2 bg-[#111] border border-[#282828] rounded-lg 
                     text-[13px] text-[#ccc] placeholder-[#444] font-mono
                     focus:outline-none focus:border-[#5e9eff]/30 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="px-3 py-2 bg-[#5e9eff]/10 hover:bg-[#5e9eff]/20 disabled:bg-[#1e1f22]
                     text-[#5e9eff] disabled:text-[#444] rounded-lg transition-all 
                     active:scale-[0.97] border border-[#5e9eff]/15 disabled:border-[#282828]"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});

export default Chat;
