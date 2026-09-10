/**
 * UserPresence v8.0 — Less bar, more subtle
 * made with <3 by Namish
 */

import { memo } from 'react';

const UserPresence = memo(function UserPresence({ users, currentUser, awarenessStates }) {
  if (!users || users.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-3 py-1 bg-[#19191c] border-b border-[#222] overflow-x-auto scrollbar-none">
      {/* Online count */}
      <div className="flex items-center gap-1.5 mr-2 pr-2.5 border-r border-[#282828]">
        <div className="w-1.5 h-1.5 rounded-full bg-[#5bd882] breathe" />
        <span className="text-[10px] text-[#666] font-mono whitespace-nowrap">
          {users.length}
        </span>
      </div>

      {/* User pills */}
      <div className="flex items-center gap-0.5">
        {users.map((user) => {
          const isCurrentUser = user.userId === currentUser?.userId;
          const awareness = awarenessStates?.get(user.userId);
          const cursorInfo = awareness?.cursor;

          return (
            <div key={user.userId} className="group relative flex items-center">
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] transition-all ${
                isCurrentUser
                  ? 'bg-[#5e9eff]/8 border border-[#5e9eff]/15'
                  : 'hover:bg-[#222] border border-transparent'
              }`}>
                <div className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-white/5"
                  style={{ backgroundColor: user.color || '#5e9eff' }} />
                <span className="font-mono truncate max-w-[80px]" style={{ color: user.color || '#5e9eff' }}>
                  {user.username}
                  {isCurrentUser && <span className="text-[#555] ml-0.5">(you)</span>}
                </span>

                {cursorInfo && !isCurrentUser && (
                  <span className="text-[9px] text-[#555] font-mono">L{cursorInfo.line}</span>
                )}
              </div>

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 
                            pointer-events-none transition-opacity duration-150 z-50">
                <div className="bg-[#222] text-[#ccc] text-[10px] px-2.5 py-1.5 rounded-lg shadow-xl 
                              border border-[#333] whitespace-nowrap font-mono">
                  <div>{user.username}</div>
                  {cursorInfo && (
                    <div className="text-[#666] text-[9px] mt-0.5">
                      line {cursorInfo.line}, col {cursorInfo.column}
                    </div>
                  )}
                  {isCurrentUser && (
                    <div className="text-[#5e9eff] text-[9px] mt-0.5">you</div>
                  )}
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 
                              border-4 border-transparent border-t-[#222]" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default UserPresence;
