/**
 * WorkspacePanel v15.0 — Saved workspaces & templates
 *
 * Features:
 *  - Save/load workspaces (persistent per user)
 *  - Starter templates with one-click load
 *  - Workspace management (rename, delete)
 *  - Template categories
 *
 * made with <3 by Namish
 */

import { useState, useEffect, useCallback, memo } from 'react';
import axios from 'axios';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

const WorkspacePanel = memo(function WorkspacePanel({ isOpen, onClose, user, language, onLoadWorkspace, onSaveWorkspace, code, roomId }) {
  const [tab, setTab] = useState('workspaces'); // 'workspaces' | 'templates'
  const [workspaces, setWorkspaces] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [error, setError] = useState('');

  const headers = useCallback(() => {
    const h = { 'Content-Type': 'application/json' };
    if (user?.token) h['Authorization'] = `Bearer ${user.token}`;
    h['x-tab-id'] = user?.tabId || '';
    return h;
  }, [user]);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${SERVER_URL}/api/workspaces`, { headers: headers() });
      setWorkspaces(res.data.workspaces || []);
    } catch (e) { setWorkspaces([]); }
    setLoading(false);
  }, [headers]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await axios.get(`${SERVER_URL}/api/workspaces/templates/all`);
      setTemplates(res.data.templates || []);
    } catch (e) { setTemplates([]); }
  }, []);

  useEffect(() => {
    if (isOpen) { fetchWorkspaces(); fetchTemplates(); }
  }, [isOpen, fetchWorkspaces, fetchTemplates]);

  const handleSave = useCallback(async () => {
    if (!saveName.trim()) return;
    setSaving(true); setError('');
    try {
      await axios.post(`${SERVER_URL}/api/workspaces`, {
        name: saveName.trim(), language, code: code || '', roomId,
      }, { headers: headers() });
      setSaveName(''); setShowSaveForm(false);
      fetchWorkspaces();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save');
    }
    setSaving(false);
  }, [saveName, language, code, roomId, headers, fetchWorkspaces]);

  const handleLoad = useCallback(async (id) => {
    try {
      const res = await axios.get(`${SERVER_URL}/api/workspaces/${id}`, { headers: headers() });
      const ws = res.data.workspace;
      if (ws && onLoadWorkspace) onLoadWorkspace(ws);
      onClose?.();
    } catch (e) { setError('Failed to load workspace'); }
  }, [headers, onLoadWorkspace, onClose]);

  const handleDelete = useCallback(async (id) => {
    try {
      await axios.delete(`${SERVER_URL}/api/workspaces/${id}`, { headers: headers() });
      fetchWorkspaces();
    } catch (e) {}
  }, [headers, fetchWorkspaces]);

  const handleLoadTemplate = useCallback(async (id) => {
    try {
      const res = await axios.get(`${SERVER_URL}/api/workspaces/templates/${id}`);
      const tmpl = res.data.template;
      if (tmpl && onLoadWorkspace) onLoadWorkspace({ code: tmpl.code, language: tmpl.language, name: tmpl.name });
      onClose?.();
    } catch (e) { setError('Failed to load template'); }
  }, [onLoadWorkspace, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal-enter bg-[#1a1b1e] border border-[#333] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#282828] flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-[15px] font-display font-semibold text-white">Workspaces</h3>
            <p className="text-[10px] text-[#555] font-mono mt-0.5">save & load your coding sessions</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#666] hover:text-white transition rounded-lg hover:bg-[#222]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-5 pt-3 pb-2 flex-shrink-0">
          <button onClick={() => setTab('workspaces')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-mono transition ${tab === 'workspaces' ? 'bg-[#5e9eff]/10 text-[#5e9eff]' : 'text-[#666] hover:text-[#aaa] hover:bg-[#222]'}`}>
            my workspaces
          </button>
          <button onClick={() => setTab('templates')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-mono transition ${tab === 'templates' ? 'bg-[#5bd882]/10 text-[#5bd882]' : 'text-[#666] hover:text-[#aaa] hover:bg-[#222]'}`}>
            templates
          </button>
          <div className="flex-1" />
          {tab === 'workspaces' && (
            <button onClick={() => setShowSaveForm(!showSaveForm)}
              className="px-3 py-1.5 bg-[#5e9eff]/10 text-[#5e9eff] rounded-lg text-[11px] font-mono hover:bg-[#5e9eff]/20 transition">
              + save current
            </button>
          )}
        </div>

        {/* Save form */}
        {showSaveForm && (
          <div className="px-5 pb-3 flex-shrink-0">
            <div className="flex gap-2">
              <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)}
                placeholder="workspace name..." maxLength={100}
                className="flex-1 px-3 py-2 bg-[#111] border border-[#282828] rounded-lg text-[12px] text-white placeholder-[#555] focus:outline-none focus:border-[#5e9eff]/40 font-mono"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }} autoFocus />
              <button onClick={handleSave} disabled={saving || !saveName.trim()}
                className="px-4 py-2 bg-[#5e9eff] text-[#0a0a0a] rounded-lg text-[11px] font-semibold disabled:opacity-40 transition hover:bg-[#7ab3ff]">
                {saving ? '...' : 'save'}
              </button>
            </div>
            {error && <p className="text-[10px] text-[#ff6b6b] mt-1 font-mono">{error}</p>}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {tab === 'workspaces' && (
            <>
              {loading ? (
                <div className="py-12 text-center"><div className="spinner mx-auto mb-2" /><p className="text-[11px] text-[#555] font-mono">loading...</p></div>
              ) : workspaces.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[#1e1f22] border border-[#282828] flex items-center justify-center text-[20px]">💾</div>
                  <p className="text-[#555] text-[12px]">no saved workspaces</p>
                  <p className="text-[#444] text-[10px] mt-1 font-mono">save your current code to pick up later</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {workspaces.map(ws => (
                    <div key={ws.id} className="flex items-center gap-3 p-3 bg-[#1e1f22] rounded-xl border border-[#282828] hover:border-[#333] transition group">
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleLoad(ws.id)}>
                        <p className="text-[12px] text-[#ccc] font-medium truncate group-hover:text-white transition">{ws.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] text-[#555] font-mono">{ws.language}</span>
                          <span className="text-[9px] text-[#444]">{ws.size ? `${(ws.size / 1024).toFixed(1)}KB` : ''}</span>
                          <span className="text-[9px] text-[#444]">{ws.updatedAt ? new Date(ws.updatedAt).toLocaleDateString() : ''}</span>
                        </div>
                      </div>
                      <button onClick={() => handleDelete(ws.id)}
                        className="p-1.5 text-[#444] hover:text-[#ff6b6b] opacity-0 group-hover:opacity-100 transition rounded-lg hover:bg-[#ff6b6b]/10">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'templates' && (
            <div className="space-y-2">
              {templates.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="spinner mx-auto mb-2" /><p className="text-[11px] text-[#555] font-mono">loading templates...</p>
                </div>
              ) : templates.map(tmpl => (
                <button key={tmpl.id} onClick={() => handleLoadTemplate(tmpl.id)}
                  className="w-full flex items-start gap-3 p-3 bg-[#1e1f22] rounded-xl border border-[#282828] hover:border-[#5bd882]/30 transition text-left group">
                  <div className="text-[20px] flex-shrink-0 mt-0.5">{tmpl.icon || '📄'}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-[#ccc] font-medium group-hover:text-white transition">{tmpl.name}</p>
                    <p className="text-[10px] text-[#555] mt-0.5 line-clamp-2">{tmpl.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] px-1.5 py-0.5 bg-[#5bd882]/10 text-[#5bd882] rounded font-mono">{tmpl.language}</span>
                      <span className="text-[9px] text-[#444] font-mono">{tmpl.category}</span>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-[#333] group-hover:text-[#5bd882] flex-shrink-0 mt-1 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default WorkspacePanel;
