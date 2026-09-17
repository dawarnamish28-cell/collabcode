/**
 * UserPresence v23.0 — High Clarity Active Collaborator Strip
 * Displays online room collaborators with crisp avatar pills, color rings, and live cursor indicators.
 * made with <3 by Namish
 */

import { memo } from 'react';

const UserPresence = memo(function UserPresence({ users, currentUser, awarenessStates, compact = false }) {
  if (!users || users.length === 0) return null;

  if (compact) {
    // Compact avatar stack for embedding in navigation bars
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        <div className="flex items-center -space-x-1.5 overflow-hidden py-0.5">
          {users.slice(0, 5).map((user) => {
            const isCurrentUser = user.userId === currentUser?.userId;
            const awareness = awarenessStates?.get(user.userId);
            const cursorInfo = awareness?.cursor;

            return (
              <div
                key={user.userId}
                className="group relative flex items-center justify-center cursor-pointer"
                title={`${user.username}${isCurrentUser ? ' (you)' : ''}${cursorInfo ? ` — Line ${cursorInfo.line}` : ''}`}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold font-mono ring-2 ring-[#181a20] transition-transform duration-150 group-hover:scale-110 group-hover:z-20"
                  style={{
                    backgroundColor: (user.color || '#5e9eff') + '25',
                    color: user.color || '#5e9eff',
                    border: `1.5px solid ${user.color || '#5e9eff'}`,
                  }}
                >
                  {user.username?.charAt(0)?.toUpperCase() || '?'}
                </div>

                {/* Tooltip */}
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                  <div className="bg-[#121316] text-[#e2e8f0] text-[11px] px-2.5 py-1.5 rounded-lg shadow-xl border border-[#2d3139] whitespace-nowrap font-mono">
                    <div className="font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: user.color || '#5e9eff' }} />
                      {user.username} {isCurrentUser && <span className="text-blue-400 font-normal">(you)</span>}
                    </div>
                    {cursorInfo && (
                      <div className="text-[#94a3b8] text-[10px] mt-0.5">
                        Line {cursorInfo.line}, Col {cursorInfo.column}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {users.length > 5 && (
            <div className="w-6 h-6 rounded-full bg-[#222630] border border-[#333a46] text-[#94a3b8] flex items-center justify-center text-[10px] font-mono font-bold ring-2 ring-[#181a20]">
              +{users.length - 5}
            </div>
          )}
        </div>
        <span className="text-[11px] font-mono text-[#94a3b8] font-medium hidden md:inline">
          {users.length} {users.length === 1 ? 'user' : 'users'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-[#14161a] border-b border-[#252830] overflow-x-auto scrollbar-none">
      {/* Online count */}
      <div className="flex items-center gap-1.5 pr-2.5 border-r border-[#2d3139]">
        <div className="w-2 h-2 rounded-full bg-emerald-400 relative">
          <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />
        </div>
        <span className="text-[11px] text-[#cbd5e1] font-mono font-medium whitespace-nowrap">
          {users.length} {users.length === 1 ? 'collaborator' : 'collaborators'}
        </span>
      </div>

      {/* User pills */}
      <div className="flex items-center gap-1">
        {users.map((user) => {
          const isCurrentUser = user.userId === currentUser?.userId;
          const awareness = awarenessStates?.get(user.userId);
          const cursorInfo = awareness?.cursor;

          return (
            <div key={user.userId} className="group relative flex items-center">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-all font-mono select-none ${
                isCurrentUser
                  ? 'bg-blue-500/15 border border-blue-500/30 text-blue-200'
                  : 'bg-[#1e2128] hover:bg-[#252932] border border-[#2d3139] text-[#cbd5e1]'
              }`}>
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: user.color || '#5e9eff' }}
                />
                <span className="truncate max-w-[100px] font-medium" style={{ color: user.color || '#5e9eff' }}>
                  {user.username}
                  {isCurrentUser && <span className="text-[#94a3b8] font-normal ml-1">(you)</span>}
                </span>

                {cursorInfo && !isCurrentUser && (
                  <span className="text-[10px] text-[#94a3b8] font-mono bg-black/20 px-1 py-0.2 rounded">
                    L{cursorInfo.line}
                  </span>
                )}
              </div>

              {/* Tooltip */}
              <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                <div className="bg-[#121316] text-[#e2e8f0] text-[11px] px-2.5 py-1.5 rounded-lg shadow-2xl border border-[#2d3139] whitespace-nowrap font-mono">
                  <div className="font-semibold">{user.username} {isCurrentUser && '(you)'}</div>
                  {cursorInfo && (
                    <div className="text-[#94a3b8] text-[10px] mt-0.5">
                      Line {cursorInfo.line}, Col {cursorInfo.column}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default UserPresence;

