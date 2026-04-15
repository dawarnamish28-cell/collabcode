/**
 * FileExplorer v8.0 — Clean, breathing room
 * made with <3 by Namish
 */

import { memo, useState, useCallback } from 'react';

const LANG_ICONS = {
  javascript: { icon: 'JS', color: '#f7df1e' },
  typescript: { icon: 'TS', color: '#3178c6' },
  python: { icon: 'PY', color: '#3776ab' },
  java: { icon: 'JV', color: '#ed8b00' },
  cpp: { icon: 'C+', color: '#00599c' },
  c: { icon: 'C', color: '#a8b9cc' },
  go: { icon: 'GO', color: '#00add8' },
  rust: { icon: 'RS', color: '#ce412b' },
  ruby: { icon: 'RB', color: '#cc342d' },
  php: { icon: 'PH', color: '#777bb4' },
  perl: { icon: 'PL', color: '#39457e' },
  r: { icon: 'R', color: '#276dc3' },
  bash: { icon: 'SH', color: '#4eaa25' },
  shell: { icon: '$', color: '#89e051' },
  awk: { icon: 'AW', color: '#c4a000' },
  lua: { icon: 'LU', color: '#000080' },
  fortran: { icon: 'FN', color: '#734f96' },
  tcl: { icon: 'TC', color: '#e4cc98' },
  sqlite: { icon: 'SQ', color: '#003b57' },
  nasm: { icon: 'AS', color: '#6e4c13' },
};

const EXT_TO_LANG = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python', '.java': 'java',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.go': 'go', '.rs': 'rust', '.rb': 'ruby', '.php': 'php',
  '.pl': 'perl', '.pm': 'perl',
  '.r': 'r', '.R': 'r',
  '.sh': 'bash', '.bash': 'bash',
  '.awk': 'awk',
  '.lua': 'lua',
  '.f90': 'fortran', '.f95': 'fortran', '.f': 'fortran', '.for': 'fortran',
  '.tcl': 'tcl',
  '.sql': 'sqlite',
  '.asm': 'nasm', '.s': 'nasm',
  '.txt': 'plaintext', '.md': 'plaintext', '.json': 'javascript',
  '.xml': 'plaintext', '.html': 'plaintext', '.css': 'plaintext',
};

const FileExplorer = memo(function FileExplorer({
  files, activeFileId, onSelectFile, onAddFile, onRemoveFile,
  onOpenFolder, language,
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer.files;
    if (!items || items.length === 0) return;
    for (let i = 0; i < items.length; i++) {
      const file = items[i];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        const lang = EXT_TO_LANG[ext] || 'plaintext';
        onAddFile({ name: file.name, content: ev.target.result, language: lang });
      };
      reader.readAsText(file);
    }
  }, [onAddFile]);

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const handleOpenFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = Object.keys(EXT_TO_LANG).join(',');
    input.onchange = (e) => {
      const fileList = e.target.files;
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const reader = new FileReader();
        reader.onload = (ev) => {
          const ext = '.' + file.name.split('.').pop().toLowerCase();
          const lang = EXT_TO_LANG[ext] || 'plaintext';
          onAddFile({ name: file.name, content: ev.target.result, language: lang });
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const langInfo = LANG_ICONS[language] || { icon: '?', color: '#666' };

  return (
    <div className="h-full flex flex-col bg-[#19191c] border-r border-[#282828] overflow-hidden"
      onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
      
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#222]">
        <span className="text-[10px] font-mono text-[#666] uppercase tracking-wider">files</span>
        <div className="flex items-center gap-0.5">
          <button onClick={handleOpenFiles}
            className="p-1 rounded text-[#555] hover:text-[#aaa] hover:bg-[#222] transition"
            title="Open Files">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button onClick={onOpenFolder}
            className="p-1 rounded text-[#555] hover:text-[#aaa] hover:bg-[#222] transition"
            title="Open Folder">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto py-1">
        {files.length === 0 ? (
          <div className={`mx-2.5 my-3 p-4 border border-dashed rounded-xl text-center transition-colors ${dragOver ? 'border-[#5e9eff]/40 bg-[#5e9eff]/5' : 'border-[#333]'}`}>
            <p className="text-[10px] text-[#555] font-mono">drop files here</p>
            <p className="text-[9px] text-[#444] mt-0.5 font-mono">or click + above</p>
          </div>
        ) : (
          files.map(file => {
            const fileLang = LANG_ICONS[file.language] || { icon: '?', color: '#666' };
            const isActive = file.id === activeFileId;
            return (
              <div key={file.id}
                onClick={() => onSelectFile(file.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition group ${
                  isActive ? 'bg-[#222] text-[#ddd]' : 'text-[#777] hover:bg-[#1e1f22] hover:text-[#bbb]'
                }`}>
                <span className="text-[9px] font-mono font-bold w-4 text-center flex-shrink-0" style={{ color: fileLang.color }}>{fileLang.icon}</span>
                <span className="text-[11px] truncate flex-1 font-mono">{file.name}</span>
                {file.modified && <div className="w-1.5 h-1.5 rounded-full bg-[#ffb347] flex-shrink-0" title="Modified" />}
                <button onClick={(e) => { e.stopPropagation(); onRemoveFile(file.id); }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#333] transition">
                  <svg className="w-2.5 h-2.5 text-[#666]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[#222]">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono font-bold" style={{ color: langInfo.color }}>{langInfo.icon}</span>
          <span className="text-[9px] text-[#555] font-mono truncate">{language}</span>
        </div>
      </div>
    </div>
  );
});

export default FileExplorer;
