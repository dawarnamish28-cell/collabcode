/**
 * Chat Component
 * 
 * Real-time chat UI with:
 * - Message history
 * - System messages (join/leave)
 * - Typing indicators
 * - Auto-scroll to latest
 * - Keyboard shortcut (Enter to send)
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react';

const Chat = memo(function Chat({ messages, onSendMessage, currentUser, socket }) {
  const [inputValue, setInputValue] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Map());
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // ─── Auto-scroll to bottom ─────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Typing Indicator ──────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleTyping = (data) => {
      setTypingUsers(prev => {
        const next = new Map(prev);
        if (data.isTyping) {
          next.set(data.userId, data.username);
          // Auto-remove after 3 seconds
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

  // ─── Send Message Handler ──────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue);
    setInputValue('');
    
    // Clear typing indicator
    if (socket) {
      socket.emit('chat:typing', { isTyping: false });
    }
  }, [inputValue, onSendMessage, socket]);

  // ─── Input Change + Typing Notification ─────────────────────────
  const handleInputChange = useCallback((e) => {
    setInputValue(e.target.value);
    
    // Send typing indicator
    if (socket) {
      socket.emit('chat:typing', { isTyping: true });
      
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('chat:typing', { isTyping: false });
      }, 2000);
    }
  }, [socket]);

  // ─── Key Handler ───────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ─── Format Timestamp ─────────────────────────────────────────
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ─── Render Message ────────────────────────────────────────────
  function renderMessage(msg, index) {
    const isSystem = msg.type === 'system';
    const isOwn = msg.userId === currentUser?.userId;

    if (isSystem) {
      return (
        <div key={index} className="flex justify-center py-1 chat-message-enter">
          <span className="text-xs text-gray-500 bg-[#2a2d2e] px-3 py-1 rounded-full">
            {msg.content}
          </span>
        </div>
      );
    }

    return (
      <div key={index} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} chat-message-enter`}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: msg.color || '#3b82f6' }}
          />
          <span className="text-xs font-medium" style={{ color: msg.color || '#3b82f6' }}>
            {msg.username}
          </span>
          <span className="text-[10px] text-gray-600">
            {msg.createdAt ? formatTime(msg.createdAt) : ''}
          </span>
        </div>
        <div className={`max-w-[85%] px-3 py-1.5 rounded-xl text-sm break-words
          ${isOwn 
            ? 'bg-blue-600/20 text-blue-100 rounded-br-md' 
            : 'bg-[#2a2d2e] text-gray-200 rounded-bl-md'
          }`}>
          {msg.content}
        </div>
      </div>
    );
  }

  // ─── Typing Indicator Display ──────────────────────────────────
  const typingDisplay = Array.from(typingUsers.values())
    .filter(name => name !== currentUser?.username);

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-editor-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-sm font-medium text-gray-300">Chat</span>
        </div>
        <span className="text-xs text-gray-500">{messages.length} messages</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-gray-600 text-sm">
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p>No messages yet</p>
              <p className="text-xs mt-1">Say hello to your collaborators!</p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => renderMessage(msg, i))}
        
        {/* Typing indicator */}
        {typingDisplay.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500 py-1">
            <div className="typing-dots">
              <span /><span /><span />
            </div>
            <span>
              {typingDisplay.length === 1
                ? `${typingDisplay[0]} is typing...`
                : `${typingDisplay.length} people typing...`
              }
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-editor-border">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            maxLength={2000}
            className="flex-1 px-3 py-2 bg-[#2a2d2e] border border-editor-border rounded-lg 
                     text-sm text-gray-200 placeholder-gray-500 
                     focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50
                     transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 
                     disabled:text-gray-500 text-white rounded-lg transition-all 
                     active:scale-95 disabled:active:scale-100"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});

export default Chat;
