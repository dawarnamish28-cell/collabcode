import { useState, useEffect, useRef, useMemo } from 'react';

// Lightweight in-browser Markdown parser
function parseMarkdown(md = '') {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Fenced code blocks
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="bg-[#19191d] p-3 rounded-lg my-3 border border-[#2e2e34] overflow-x-auto font-mono text-xs text-[#5e9eff]"><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-[#24252a] px-1.5 py-0.5 rounded text-[#ffb347] font-mono text-[12px]">$1</code>');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-base font-bold text-white mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold text-white mt-5 mb-2 pb-1 border-b border-[#333]">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-xl font-extrabold text-white mt-6 mb-3 pb-2 border-b border-[#333]">$1</h1>');

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-[#5e9eff] pl-3 py-1 my-2 text-[#999] italic bg-[#5e9eff]/5 rounded-r">$1</blockquote>');

  // Bold & Italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Unordered lists
  html = html.replace(/^\s*[\-\*]\s+(.*$)/gim, '<li class="ml-4 list-disc text-[#ccc] my-0.5">$1</li>');

  // Ordered lists
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="ml-4 list-decimal text-[#ccc] my-0.5">$1</li>');

  // Task lists
  html = html.replace(/<li>\[ \] (.*?)<\/li>/g, '<li class="flex items-center gap-2 text-[#aaa]"><span class="w-3.5 h-3.5 rounded border border-[#555] inline-block"></span> $1</li>');
  html = html.replace(/<li>\[x\] (.*?)<\/li>/g, '<li class="flex items-center gap-2 text-[#5bd882]"><span class="w-3.5 h-3.5 rounded bg-[#5bd882] text-black text-[9px] flex items-center justify-center font-bold">✓</span> <span class="line-through text-[#666]">$1</span></li>');

  // Paragraphs
  html = html.split('\n\n').map(p => {
    if (p.trim().startsWith('<h') || p.trim().startsWith('<pre') || p.trim().startsWith('<blockquote') || p.trim().startsWith('<li')) {
      return p;
    }
    return `<p class="my-2 leading-relaxed text-[#ccc]">${p.replace(/\n/g, '<br/>')}</p>`;
  }).join('');

  return html;
}

export default function LiveWebPreview({ isOpen, onClose, code = '', language = 'html', filename = '' }) {
  const [viewport, setViewport] = useState('full'); // 'full', 'tablet' (768), 'mobile' (375)
  const [mode, setMode] = useState(language === 'markdown' ? 'markdown' : 'web');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef(null);

  // Sync mode if language changes
  useEffect(() => {
    if (language === 'markdown' || filename.endsWith('.md')) {
      setMode('markdown');
    } else {
      setMode('web');
    }
  }, [language, filename]);

  // Construct iframe source for web preview
  const iframeSrcDoc = useMemo(() => {
    if (mode === 'markdown') return '';

    let content = code;
    // If pure JS, wrap in minimal HTML container with console interception
    if (language === 'javascript' || language === 'typescript') {
      content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1013; color: #eee; padding: 16px; margin: 0; }
    #console-out { margin-top: 20px; padding: 12px; background: #16171b; border: 1px solid #282a30; border-radius: 8px; font-family: monospace; font-size: 12px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="app"></div>
  <div id="console-out"><strong>Console:</strong><div id="logs" style="margin-top: 8px;"></div></div>
  <script>
    const logBox = document.getElementById('logs');
    const _log = console.log;
    console.log = (...args) => {
      _log(...args);
      const div = document.createElement('div');
      div.style.padding = '2px 0';
      div.style.color = '#5bd882';
      div.textContent = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      logBox.appendChild(div);
    };
    window.onerror = (msg) => {
      const div = document.createElement('div');
      div.style.color = '#ff6b6b';
      div.textContent = 'Error: ' + msg;
      logBox.appendChild(div);
    };
    try {
      ${code}
    } catch(err) {
      console.error(err);
    }
  </script>
</body>
</html>`;
    }

    return content;
  }, [code, language, mode]);

  const handleOpenNewWindow = () => {
    if (mode === 'markdown') {
      const win = window.open('', '_blank');
      win.document.write(`<html><head><title>Preview - ${filename || 'Markdown'}</title><style>body { font-family: system-ui; max-width: 800px; margin: 40px auto; padding: 0 20px; background: #111; color: #eee; line-height: 1.6; }</style></head><body>${parseMarkdown(code)}</body></html>`);
      win.document.close();
    } else {
      const win = window.open('', '_blank');
      win.document.write(iframeSrcDoc);
      win.document.close();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6" onClick={onClose}>
      <div className="bg-[#141518] border border-[#2c2d33] rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#222] bg-[#18191c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#5bd882]/10 border border-[#5bd882]/30 flex items-center justify-center text-[#5bd882]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white font-mono">Live Sandbox Preview</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#222] text-[#888] font-mono border border-[#333]">
                  {mode === 'markdown' ? 'Markdown' : 'HTML / Web'}
                </span>
              </div>
              <p className="text-[11px] text-[#666] font-mono">{filename || 'live buffer'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode switch */}
            <div className="flex bg-[#101114] p-0.5 rounded-lg border border-[#2a2b30]">
              <button
                onClick={() => setMode('web')}
                className={`px-2.5 py-1 text-xs font-mono rounded-md transition ${mode === 'web' ? 'bg-[#222] text-white font-medium shadow-sm' : 'text-[#777] hover:text-[#bbb]'}`}
              >
                Web
              </button>
              <button
                onClick={() => setMode('markdown')}
                className={`px-2.5 py-1 text-xs font-mono rounded-md transition ${mode === 'markdown' ? 'bg-[#222] text-white font-medium shadow-sm' : 'text-[#777] hover:text-[#bbb]'}`}
              >
                Markdown
              </button>
            </div>

            {/* Close */}
            <button onClick={onClose} className="p-1.5 text-[#666] hover:text-white rounded-lg hover:bg-[#222] transition ml-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[#191a1e] border-b border-[#25262c] text-xs font-mono">
          {/* Viewport Device Size (only for Web mode) */}
          {mode === 'web' ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[#666] text-[11px] mr-1">Viewport:</span>
              <button
                onClick={() => setViewport('full')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition ${viewport === 'full' ? 'bg-[#5e9eff]/15 text-[#5e9eff] border-[#5e9eff]/40' : 'bg-[#202126] border-[#303138] text-[#888] hover:text-white'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <span>Desktop (100%)</span>
              </button>
              <button
                onClick={() => setViewport('tablet')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition ${viewport === 'tablet' ? 'bg-[#5e9eff]/15 text-[#5e9eff] border-[#5e9eff]/40' : 'bg-[#202126] border-[#303138] text-[#888] hover:text-white'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                <span>Tablet (768px)</span>
              </button>
              <button
                onClick={() => setViewport('mobile')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition ${viewport === 'mobile' ? 'bg-[#5e9eff]/15 text-[#5e9eff] border-[#5e9eff]/40' : 'bg-[#202126] border-[#303138] text-[#888] hover:text-white'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                <span>Mobile (375px)</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[#888] text-[11px]">
              <span>Real-time formatted markdown rendering</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#222] hover:bg-[#2c2d33] border border-[#333] text-[#aaa] hover:text-white text-[11px] transition active:scale-95"
              title="Reload preview"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              <span>Reload</span>
            </button>
            <button
              onClick={handleOpenNewWindow}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#222] hover:bg-[#2c2d33] border border-[#333] text-[#aaa] hover:text-white text-[11px] transition active:scale-95"
              title="Open in new window"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              <span>New Window</span>
            </button>
          </div>
        </div>

        {/* Content View */}
        <div className="flex-1 overflow-auto bg-[#0b0c0e] flex items-center justify-center p-3">
          {mode === 'web' ? (
            <div
              className={`h-full bg-white rounded-xl shadow-2xl overflow-hidden transition-all duration-300 ${
                viewport === 'tablet' ? 'w-[768px]' : viewport === 'mobile' ? 'w-[375px]' : 'w-full'
              }`}
            >
              <iframe
                key={refreshKey}
                ref={iframeRef}
                srcDoc={iframeSrcDoc}
                sandbox="allow-scripts allow-modals"
                className="w-full h-full border-0 bg-white"
                title="live-preview"
              />
            </div>
          ) : (
            <div className="w-full h-full max-w-4xl bg-[#141518] rounded-xl border border-[#26272d] p-6 overflow-y-auto font-sans leading-relaxed text-[#ddd] shadow-xl">
              <div dangerouslySetInnerHTML={{ __html: parseMarkdown(code) }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
