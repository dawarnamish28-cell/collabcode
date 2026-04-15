/**
 * Chat v8.0 — Warm, conversational feel
 * 
 * Less corporate messaging app, more casual hangout.
 * 
 * made with <3 by Namish
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react';

const Chat = memo(function Chat({ messages, onSendMessage, currentUser, socket }) {
  const [inputValue, setInputValue] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Map());
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderMessage(msg, index) {
    const isSystem = msg.type === 'system';
    const isOwn = msg.userId === currentUser?.userId;

    if (isSystem) {
      return (
        <div key={index} className="flex justify-center py-1.5 chat-message-enter">
          <span className="text-[10px] text-[#555] font-mono bg-[#1e1f22] px-3 py-1 rounded-full border border-[#282828]">
            {msg.content}
          </span>
        </div>
      );
    }

    return (
      <div key={index} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} chat-message-enter`}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: msg.color || '#5e9eff' }} />
          <span className="text-[10px] font-mono font-medium" style={{ color: msg.color || '#5e9eff' }}>
            {msg.username}
          </span>
          <span className="text-[9px] text-[#444] font-mono">
            {msg.createdAt ? formatTime(msg.createdAt) : ''}
          </span>
        </div>
        <div className={`max-w-[85%] px-3 py-1.5 rounded-xl text-[13px] break-words leading-relaxed
          ${isOwn
            ? 'bg-[#5e9eff]/10 text-[#c8d8ee] rounded-br-sm border border-[#5e9eff]/15'
            : 'bg-[#1e1f22] text-[#bbb] rounded-bl-sm border border-[#282828]'
          }`}>
          {msg.content}
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
        <span className="text-[11px] font-mono text-[#888]">chat</span>
        <span className="text-[10px] text-[#444] font-mono">{messages.length}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
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

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-[#282828]">
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="type something..."
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
