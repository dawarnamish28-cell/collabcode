/**
 * FileExplorer v2.0 — Multi-file support, 20 languages
 * 
 * VSCode-style file explorer with tabs.
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

  const langInfo = LANG_ICONS[language] || { icon: '?', color: '#858585' };

  return (
    <div className="h-full flex flex-col bg-[#252526] border-r border-editor-border overflow-hidden"
      onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
      
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-editor-border/50">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Explorer</span>
        <div className="flex items-center gap-1">
          <button onClick={handleOpenFiles}
            className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e] transition"
            title="Open Files">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button onClick={onOpenFolder}
            className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e] transition"
            title="Open Folder">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto py-1">
        {files.length === 0 ? (
          <div className={`mx-2 my-2 p-3 border border-dashed rounded-lg text-center ${dragOver ? 'border-blue-400 bg-blue-500/10' : 'border-editor-border/50'}`}>
            <svg className="w-6 h-6 text-gray-600 mx-auto mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-[10px] text-gray-500">Drop files here</p>
            <p className="text-[9px] text-gray-600 mt-0.5">or click + to add</p>
          </div>
        ) : (
          files.map(file => {
            const fileLang = LANG_ICONS[file.language] || { icon: '?', color: '#858585' };
            const isActive = file.id === activeFileId;
            return (
              <div key={file.id}
                onClick={() => onSelectFile(file.id)}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 cursor-pointer transition group ${
                  isActive ? 'bg-[#37373d] text-white' : 'text-gray-400 hover:bg-[#2a2d2e] hover:text-gray-200'
                }`}>
                <span className="text-[9px] sm:text-[10px] font-mono font-bold w-4 text-center flex-shrink-0" style={{ color: fileLang.color }}>{fileLang.icon}</span>
                <span className="text-[11px] sm:text-xs truncate flex-1">{file.name}</span>
                {file.modified && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" title="Modified" />}
                <button onClick={(e) => { e.stopPropagation(); onRemoveFile(file.id); }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#555] transition">
                  <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Current Language Info */}
      <div className="px-3 py-1.5 border-t border-editor-border/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold" style={{ color: langInfo.color }}>{langInfo.icon}</span>
          <span className="text-[10px] text-gray-500 truncate">Active: {language}</span>
        </div>
      </div>
    </div>
  );
});

export default FileExplorer;
