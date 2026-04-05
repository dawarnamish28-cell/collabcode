/**
 * Landing Page
 * 
 * Entry point for the collaborative coding platform.
 * Users can create new rooms or join existing ones.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';
import { useAppContext } from '../context/AppContext';
import axios from 'axios';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

const LANGUAGES = [
  { id: 'javascript', name: 'JavaScript', icon: 'JS' },
  { id: 'typescript', name: 'TypeScript', icon: 'TS' },
  { id: 'python', name: 'Python', icon: 'PY' },
  { id: 'java', name: 'Java', icon: 'JV' },
  { id: 'cpp', name: 'C++', icon: 'C+' },
  { id: 'c', name: 'C', icon: 'C' },
  { id: 'go', name: 'Go', icon: 'GO' },
  { id: 'rust', name: 'Rust', icon: 'RS' },
  { id: 'ruby', name: 'Ruby', icon: 'RB' },
  { id: 'php', name: 'PHP', icon: 'PH' },
];

export default function Home() {
  const router = useRouter();
  const { state } = useAppContext();
  const [joinRoomId, setJoinRoomId] = useState('');
  const [selectedLang, setSelectedLang] = useState('javascript');
  const [activeRooms, setActiveRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchActiveRooms();
  }, []);

  async function fetchActiveRooms() {
    try {
      const res = await axios.get(`${SERVER_URL}/api/rooms`);
      setActiveRooms(res.data.rooms || []);
    } catch (err) {
      // Server might not be running yet
      console.log('Could not fetch active rooms');
    }
  }

  function handleCreateRoom() {
    const roomId = uuidv4().substring(0, 8);
    router.push(`/room/${roomId}?lang=${selectedLang}`);
  }

  function handleJoinRoom(e) {
    e.preventDefault();
    if (!joinRoomId.trim()) {
      setError('Please enter a Room ID');
      return;
    }
    setError('');
    router.push(`/room/${joinRoomId.trim()}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d1117] via-[#161b22] to-[#0d1117] flex flex-col">
      {/* Header */}
      <header className="border-b border-editor-border/30 backdrop-blur-sm bg-black/20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-lg font-bold">
              {'</>'}
            </div>
            <h1 className="text-xl font-bold text-white">CollabCode</h1>
          </div>
          {state.user && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: state.user.color }}
              />
              {state.user.username}
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-4xl w-full">
          {/* Hero Text */}
          <div className="text-center mb-12">
            <h2 className="text-5xl font-bold text-white mb-4 leading-tight">
              Code Together,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                In Real-Time
              </span>
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Collaborative code editor with real-time multi-user editing, 
              built-in chat, and instant code execution. No signup required.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {/* Create Room Card */}
            <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-6 hover:border-blue-500/40 transition-all duration-300">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <h3 className="text-lg font-semibold text-white">Create New Room</h3>
              </div>

              {/* Language Selection */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Select Language</label>
                <div className="grid grid-cols-5 gap-2">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.id}
                      onClick={() => setSelectedLang(lang.id)}
                      className={`px-2 py-2 rounded-lg text-xs font-mono font-bold transition-all duration-150 
                        ${selectedLang === lang.id
                          ? 'bg-blue-600 text-white ring-2 ring-blue-400/50'
                          : 'bg-[#0d1117] text-gray-400 hover:bg-[#21262d] hover:text-white border border-editor-border/30'
                        }`}
                      title={lang.name}
                    >
                      {lang.icon}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCreateRoom}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 
                         text-white font-medium rounded-xl transition-all duration-200 active:scale-[0.98]
                         shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
              >
                Create Room
              </button>
            </div>

            {/* Join Room Card */}
            <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-6 hover:border-purple-500/40 transition-all duration-300">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <h3 className="text-lg font-semibold text-white">Join Existing Room</h3>
              </div>

              <form onSubmit={handleJoinRoom}>
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">Room ID</label>
                  <input
                    type="text"
                    value={joinRoomId}
                    onChange={(e) => {
                      setJoinRoomId(e.target.value);
                      setError('');
                    }}
                    placeholder="Enter room ID..."
                    className="w-full px-4 py-3 bg-[#0d1117] border border-editor-border/40 rounded-xl 
                             text-white placeholder-gray-500 focus:outline-none focus:ring-2 
                             focus:ring-purple-500/50 focus:border-purple-500/50 transition-all font-mono"
                  />
                  {error && (
                    <p className="text-red-400 text-xs mt-1">{error}</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 
                           text-white font-medium rounded-xl transition-all duration-200 active:scale-[0.98]
                           shadow-lg shadow-purple-600/20 hover:shadow-purple-500/30"
                >
                  Join Room
                </button>
              </form>
            </div>
          </div>

          {/* Active Rooms */}
          {activeRooms.length > 0 && (
            <div className="bg-[#161b22] border border-editor-border/40 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Active Rooms</h3>
              <div className="space-y-2">
                {activeRooms.map(room => (
                  <button
                    key={room.roomId}
                    onClick={() => router.push(`/room/${room.roomId}`)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-[#0d1117] 
                             hover:bg-[#21262d] rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-sm font-mono text-gray-300">{room.roomId}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      {room.userCount} user{room.userCount !== 1 ? 's' : ''}
                      <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Features */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            {[
              { icon: '&#9889;', label: 'Real-time Sync', desc: 'CRDT-based editing' },
              { icon: '&#128172;', label: 'Built-in Chat', desc: 'Communicate instantly' },
              { icon: '&#9654;', label: 'Code Execution', desc: '10+ languages' },
              { icon: '&#128274;', label: 'No Sign-up', desc: 'Anonymous sessions' },
            ].map((feat, i) => (
              <div key={i} className="text-center py-4">
                <div className="text-2xl mb-2" dangerouslySetInnerHTML={{ __html: feat.icon }} />
                <div className="text-sm font-medium text-gray-300">{feat.label}</div>
                <div className="text-xs text-gray-500">{feat.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-editor-border/20 py-4 text-center text-xs text-gray-600">
        CollabCode &mdash; Collaborative Coding Platform | Built with Next.js + Socket.io + Yjs
      </footer>
    </div>
  );
}
