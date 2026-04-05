/**
 * UserPresence Component
 * 
 * Displays active users in the room with:
 * - Colored avatar circles
 * - Username tooltips
 * - Cursor position indicators
 * - Connection status per user
 */

import { memo } from 'react';

const UserPresence = memo(function UserPresence({ users, currentUser, awarenessStates }) {
  if (!users || users.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-[#252526] border-b border-editor-border overflow-x-auto">
      {/* Active users count */}
      <div className="flex items-center gap-1.5 mr-2 pr-3 border-r border-editor-border">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {users.length} online
        </span>
      </div>

      {/* User avatars */}
      <div className="flex items-center gap-1">
        {users.map((user) => {
          const isCurrentUser = user.userId === currentUser?.userId;
          const awareness = awarenessStates?.get(user.userId);
          const cursorInfo = awareness?.cursor;

          return (
            <div
              key={user.userId}
              className="group relative flex items-center"
            >
              {/* Avatar */}
              <div
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs transition-all
                  ${isCurrentUser 
                    ? 'bg-blue-600/20 border border-blue-500/30' 
                    : 'bg-[#2a2d2e] hover:bg-[#333] border border-transparent'
                  }`}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-white/10"
                  style={{ backgroundColor: user.color || '#3b82f6' }}
                />
                <span 
                  className="font-medium truncate max-w-[100px]"
                  style={{ color: user.color || '#3b82f6' }}
                >
                  {user.username}
                  {isCurrentUser && <span className="text-gray-500 ml-1">(you)</span>}
                </span>

                {/* Cursor position badge */}
                {cursorInfo && !isCurrentUser && (
                  <span className="text-[10px] text-gray-500 font-mono">
                    L{cursorInfo.line}
                  </span>
                )}
              </div>

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 
                            pointer-events-none transition-opacity duration-150 z-50">
                <div className="bg-[#333] text-gray-200 text-xs px-2.5 py-1.5 rounded-lg shadow-xl 
                              border border-editor-border whitespace-nowrap">
                  <div className="font-medium">{user.username}</div>
                  {cursorInfo && (
                    <div className="text-gray-400 text-[10px] mt-0.5">
                      Line {cursorInfo.line}, Col {cursorInfo.column}
                    </div>
                  )}
                  {isCurrentUser && (
                    <div className="text-blue-400 text-[10px] mt-0.5">You</div>
                  )}
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 
                              border-4 border-transparent border-t-[#333]" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default UserPresence;
