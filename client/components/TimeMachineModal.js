import { useState, useEffect, useMemo } from 'react';

// Lightweight line-by-line diff generator (LCS / Myers approximation)
function computeLineDiff(oldText = '', newText = '') {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const diff = [];
  let i = 0;
  let j = 0;

  // Simple greedy matching
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      diff.push({ type: 'same', text: oldLines[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else {
      // Look ahead up to 5 lines for matching
      let foundMatch = false;
      for (let lookahead = 1; lookahead <= 5; lookahead++) {
        if (i + lookahead < oldLines.length && oldLines[i + lookahead] === newLines[j]) {
          for (let k = 0; k < lookahead; k++) {
            diff.push({ type: 'remove', text: oldLines[i + k], oldLine: i + k + 1 });
          }
          i += lookahead;
          foundMatch = true;
          break;
        }
        if (j + lookahead < newLines.length && oldLines[i] === newLines[j + lookahead]) {
          for (let k = 0; k < lookahead; k++) {
            diff.push({ type: 'add', text: newLines[j + k], newLine: j + k + 1 });
          }
          j += lookahead;
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        diff.push({ type: 'remove', text: oldLines[i], oldLine: i + 1 });
        diff.push({ type: 'add', text: newLines[j], newLine: j + 1 });
        i++;
        j++;
      }
    }
  }

  while (i < oldLines.length) {
    diff.push({ type: 'remove', text: oldLines[i], oldLine: i + 1 });
    i++;
  }
  while (j < newLines.length) {
    diff.push({ type: 'add', text: newLines[j], newLine: j + 1 });
    j++;
  }

  const additions = diff.filter(d => d.type === 'add').length;
  const deletions = diff.filter(d => d.type === 'remove').length;

  return { diff, additions, deletions };
}

export default function TimeMachineModal({
  isOpen,
  onClose,
  currentCode = '',
  roomId = '',
  onRestoreCode,
}) {
  const storageKey = `collabcode:snapshots:${roomId || 'default'}`;
  const [snapshots, setSnapshots] = useState([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const [viewMode, setViewMode] = useState('diff'); // 'diff' | 'raw'
  const [toast, setToast] = useState('');

  // Load snapshots from local storage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSnapshots(parsed);
        if (parsed.length > 0) setSelectedSnapshotId(parsed[0].id);
      }
    } catch {}
  }, [storageKey]);

  // Save snapshot handler
  const handleSaveSnapshot = (customLabel = '') => {
    if (!currentCode.trim()) return;
    const now = new Date();
    const newSnap = {
      id: `snap_${Date.now()}`,
      timestamp: now.toISOString(),
      label: customLabel || newLabel.trim() || `Checkpoint ${now.toLocaleTimeString()}`,
      code: currentCode,
      lines: currentCode.split('\n').length,
    };

    const updated = [newSnap, ...snapshots].slice(0, 30);
    setSnapshots(updated);
    setSelectedSnapshotId(newSnap.id);
    setNewLabel('');
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {}

    setToast('Checkpoint saved!');
    setTimeout(() => setToast(''), 2500);
  };

  const handleDeleteSnapshot = (id, e) => {
    e.stopPropagation();
    const updated = snapshots.filter(s => s.id !== id);
    setSnapshots(updated);
    if (selectedSnapshotId === id) {
      setSelectedSnapshotId(updated[0]?.id || null);
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {}
  };

  const selectedSnapshot = snapshots.find(s => s.id === selectedSnapshotId);

  // Compute diff against current code
  const { diff, additions, deletions } = useMemo(() => {
    if (!selectedSnapshot) return { diff: [], additions: 0, deletions: 0 };
    return computeLineDiff(selectedSnapshot.code, currentCode);
  }, [selectedSnapshot, currentCode]);

  const handleRestore = () => {
    if (!selectedSnapshot || !onRestoreCode) return;
    if (window.confirm(`Restore code to checkpoint "${selectedSnapshot.label}"? Current edits will be replaced.`)) {
      onRestoreCode(selectedSnapshot.code);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6" onClick={onClose}>
      <div className="bg-[#141518] border border-[#2c2d33] rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#222] bg-[#18191c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#ffb347]/10 border border-[#ffb347]/30 flex items-center justify-center text-[#ffb347]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white font-mono">Time Machine</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#222] text-[#888] font-mono border border-[#333]">
                  {snapshots.length} checkpoints
                </span>
              </div>
              <p className="text-[11px] text-[#666] font-mono">Track code history & inspect visual diffs</p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 text-[#666] hover:text-white rounded-lg hover:bg-[#222] transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex flex-col sm:flex-row min-h-0 overflow-hidden">
          {/* Left Sidebar: Snapshots List */}
          <div className="w-full sm:w-72 border-r border-[#222] bg-[#17181c] flex flex-col flex-shrink-0">
            {/* Create Checkpoint input */}
            <div className="p-3 border-b border-[#25262c]">
              <form onSubmit={e => { e.preventDefault(); handleSaveSnapshot(); }} className="flex gap-1.5">
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="Checkpoint name..."
                  className="flex-1 bg-[#121316] border border-[#2e3038] rounded-lg px-2.5 py-1.5 text-xs text-[#ccc] font-mono focus:border-[#ffb347] focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#ffb347] hover:bg-[#ffa32b] text-[#1a1205] text-xs font-mono font-bold rounded-lg transition active:scale-95 flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Save</span>
                </button>
              </form>
              {toast && <p className="text-[11px] text-[#5bd882] font-mono mt-1.5">{toast}</p>}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
              {snapshots.length === 0 ? (
                <div className="py-12 text-center text-[#555] font-mono text-xs">
                  <p>No checkpoints saved yet</p>
                  <p className="text-[10px] text-[#444] mt-1">Click Save to snapshot the current code</p>
                </div>
              ) : (
                snapshots.map(s => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSnapshotId(s.id)}
                    className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between group ${
                      selectedSnapshotId === s.id
                        ? 'bg-[#22232a] border-[#ffb347]/50 shadow-sm'
                        : 'bg-[#1a1b20] border-[#25262c] hover:border-[#3a3c44]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-mono font-medium truncate ${selectedSnapshotId === s.id ? 'text-white' : 'text-[#ccc]'}`}>
                        {s.label}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#666] font-mono">
                        <span>{new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        <span>&bull;</span>
                        <span>{s.lines} lines</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={e => handleDeleteSnapshot(s.id, e)}
                      className="p-1 rounded text-[#555] hover:text-[#ff6b6b] opacity-0 group-hover:opacity-100 transition"
                      title="Delete checkpoint"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Area: Diff / Inspector */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#0f1013] overflow-hidden">
            {selectedSnapshot ? (
              <>
                {/* Diff Toolbar */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-[#222] bg-[#16171b] text-xs font-mono">
                  <div className="flex items-center gap-3">
                    <span className="text-[#888] font-medium truncate max-w-[200px]">{selectedSnapshot.label}</span>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-[#5bd882] font-semibold">+{additions}</span>
                      <span className="text-[#ff6b6b] font-semibold">-{deletions}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex bg-[#101114] p-0.5 rounded-lg border border-[#2a2b30]">
                      <button
                        onClick={() => setViewMode('diff')}
                        className={`px-2.5 py-0.5 text-[11px] font-mono rounded-md transition ${viewMode === 'diff' ? 'bg-[#222] text-white font-medium' : 'text-[#777] hover:text-[#bbb]'}`}
                      >
                        Diff vs Current
                      </button>
                      <button
                        onClick={() => setViewMode('raw')}
                        className={`px-2.5 py-0.5 text-[11px] font-mono rounded-md transition ${viewMode === 'raw' ? 'bg-[#222] text-white font-medium' : 'text-[#777] hover:text-[#bbb]'}`}
                      >
                        Raw Code
                      </button>
                    </div>

                    <button
                      onClick={handleRestore}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#5e9eff] hover:bg-[#4d8eed] text-white text-[11px] font-mono font-semibold transition active:scale-95"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Restore This</span>
                    </button>
                  </div>
                </div>

                {/* Diff or Raw Viewer */}
                <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-5">
                  {viewMode === 'diff' ? (
                    diff.length === 0 ? (
                      <p className="text-[#666] italic">No differences found between this checkpoint and current code.</p>
                    ) : (
                      <div className="space-y-0.5">
                        {diff.map((line, idx) => (
                          <div
                            key={idx}
                            className={`flex items-start px-2 py-0.5 rounded font-mono ${
                              line.type === 'add'
                                ? 'bg-[#5bd882]/10 text-[#5bd882]'
                                : line.type === 'remove'
                                ? 'bg-[#ff6b6b]/10 text-[#ff6b6b]'
                                : 'text-[#888]'
                            }`}
                          >
                            <span className="w-6 text-right select-none opacity-40 mr-2 text-[10px]">
                              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                            </span>
                            <span className="w-8 text-right select-none opacity-30 mr-3 text-[10px]">
                              {line.newLine || line.oldLine || ''}
                            </span>
                            <pre className="flex-1 whitespace-pre-wrap font-mono text-[12px]">{line.text || ' '}</pre>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <pre className="text-[#ccc] whitespace-pre font-mono">{selectedSnapshot.code}</pre>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[#555] font-mono text-xs">
                Select a checkpoint from the left or create one to view diffs.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
