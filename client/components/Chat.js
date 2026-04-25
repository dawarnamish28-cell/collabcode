/**
 * Chat v12.0 — Rich messages, reactions, code blocks, scroll-to-bottom
 * 
 * New in v12:
 *  - Code block detection (```code```) with copy button
 *  - URL detection with clickable links
 *  - Emoji quick reactions on hover
 *  - Scroll-to-bottom FAB when scrolled up
 *  - Relative timestamps ("2m ago")
 *  - Message grouping (consecutive from same user)
 *  - Unread message indicator
 *  - Empty state illustration
 *  - Better system messages
 * 
 * made with <3 by Namish
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '👀', '🎉'];

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

// Parse message content for code blocks and URLs
function renderContent(content) {
  // Check for code blocks (```code```)
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  if (parts.length === 0) parts.push({ type: 'text', content });

  return parts.map((part, i) => {
    if (part.type === 'code') {
      return (
        <div key={i} className="relative group/code mt-1 mb-1">
          <pre className="text-[11px] bg-[#111] rounded-lg px-3 py-2 overflow-x-auto font-mono border border-[#222] text-[#ccc] leading-relaxed">{part.content}</pre>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(part.content).catch(() => {});
            }}
            className="absolute top-1.5 right-1.5 p-1 rounded bg-[#222] text-[#666] hover:text-[#aaa] opacity-0 group-hover/code:opacity-100 transition"
            title="Copy code">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
        </div>
      );
    }
    // Parse URLs in text
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    const textParts = part.content.split(urlRegex);
    return (
      <span key={i}>
        {textParts.map((p, j) =>
          urlRegex.test(p) ? (
            <a key={j} href={p} target="_blank" rel="noopener noreferrer"
              className="text-[#5e9eff] hover:underline break-all" onClick={(e) => e.stopPropagation()}>
              {p.length > 40 ? p.slice(0, 40) + '...' : p}
            </a>
          ) : (
            <span key={j}>{p}</span>
          )
        )}
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
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isNearBottom = useRef(true);

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

  useEffect(() => {
    if (!socket) return;
    const handleTyping = (data) => {
      setTypingUsers(prev => {
        const next = new Map(prev);
        if (data.isTyping) {
          next.set(data.userId, data.username);
          setTimeout(() => {
            setTypingUsers(p => {
              const n = new Map(p);
              n.delete(data.userId);
              return n;
            });
          }, 3000);
        } else {
          next.delete(data.userId);
        }
        return next;
      });
    };
    socket.on('chat:typing', handleTyping);
    return () => socket.off('chat:typing', handleTyping);
  }, [socket]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue);
    setInputValue('');
    if (socket) socket.emit('chat:typing', { isTyping: false });
  }, [inputValue, onSendMessage, socket]);

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
  }, [handleSend]);

  // Group consecutive messages from same user
  function shouldShowHeader(msg, index) {
    if (index === 0) return true;
    if (msg.type === 'system') return true;
    const prev = messages[index - 1];
    if (prev.type === 'system') return true;
    if (prev.userId !== msg.userId) return true;
    // Show header if > 5 minutes gap
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

        <div className="relative max-w-[85%]">
          <div className={`px-3 py-1.5 text-[13px] break-words leading-relaxed
            ${isOwn
              ? `bg-[#5e9eff]/10 text-[#c8d8ee] ${showHeader ? 'rounded-xl rounded-br-sm' : 'rounded-xl rounded-br-sm'} border border-[#5e9eff]/15`
              : `bg-[#1e1f22] text-[#bbb] ${showHeader ? 'rounded-xl rounded-bl-sm' : 'rounded-xl rounded-bl-sm'} border border-[#282828]`
            }`}>
            {renderContent(msg.content)}
          </div>

          {/* Quick reactions on hover */}
          {hoveredMsg === index && (
            <div className={`absolute ${isOwn ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} top-0 flex items-center gap-0.5 z-10`}
              style={{ animation: 'fadeUp 0.15s ease' }}>
              {QUICK_REACTIONS.slice(0, 3).map((emoji, i) => (
                <button key={i} className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#222] text-[11px] transition active:scale-90"
                  onClick={(e) => { e.stopPropagation(); /* reaction handler placeholder */ }}
                  title={emoji}>
                  {emoji}
                </button>
              ))}
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
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-[#222] border border-[#333] flex items-center justify-center text-[18px]">
                💬
              </div>
              <p className="text-[#555] text-[12px]">no messages yet</p>
              <p className="text-[#444] text-[10px] mt-1 font-mono">say something nice</p>
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

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-[#282828]">
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="type something... (```code``` for code blocks)"
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
