import { useState, useRef, useEffect, useCallback } from 'react';

const GRADIENTS = [
  { id: 'midnight', name: 'Midnight', css: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)', stops: ['#6366f1', '#a855f7', '#ec4899'] },
  { id: 'emerald', name: 'Emerald', css: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #06b6d4 100%)', stops: ['#059669', '#10b981', '#06b6d4'] },
  { id: 'sunset', name: 'Sunset', css: 'linear-gradient(135deg, #f97316 0%, #ef4444 50%, #8b5cf6 100%)', stops: ['#f97316', '#ef4444', '#8b5cf6'] },
  { id: 'cyberpunk', name: 'Cyber', css: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #9333ea 100%)', stops: ['#06b6d4', '#3b82f6', '#9333ea'] },
  { id: 'minimal', name: 'Obsidian', css: 'linear-gradient(135deg, #18191c 0%, #282a30 100%)', stops: ['#18191c', '#282a30'] },
];

export default function CodeShotModal({ isOpen, onClose, code = '', language = 'javascript', roomId = '' }) {
  const [theme, setTheme] = useState(GRADIENTS[0]);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [showWindowControls, setShowWindowControls] = useState(true);
  const [showWatermark, setShowWatermark] = useState(true);
  const [padding, setPadding] = useState(32); // 16, 32, 48
  const [title, setTitle] = useState(`${language}-snippet`);
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const canvasRef = useRef(null);

  const codeLines = (code || '// No code to export').split('\n');

  // Render to high-DPI canvas
  const renderToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = 2; // high-dpi retina scale

    const fontSize = 13;
    const lineHeight = 20;
    const font = `${fontSize}px 'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace`;

    ctx.font = font;
    let maxLineWidth = 0;
    for (const line of codeLines) {
      const w = ctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    }

    const lineNumGutter = showLineNumbers ? 44 : 0;
    const contentWidth = Math.max(380, maxLineWidth + lineNumGutter + 40);
    const headerHeight = showWindowControls || title ? 38 : 16;
    const footerHeight = showWatermark ? 28 : 14;
    const codeHeight = codeLines.length * lineHeight;
    const cardHeight = headerHeight + codeHeight + footerHeight;

    const totalWidth = contentWidth + padding * 2;
    const totalHeight = cardHeight + padding * 2;

    canvas.width = totalWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${totalHeight}px`;

    ctx.scale(dpr, dpr);

    // 1. Draw outer gradient background
    const grad = ctx.createLinearGradient(0, 0, totalWidth, totalHeight);
    if (theme.stops.length === 3) {
      grad.addColorStop(0, theme.stops[0]);
      grad.addColorStop(0.5, theme.stops[1]);
      grad.addColorStop(1, theme.stops[2]);
    } else {
      grad.addColorStop(0, theme.stops[0]);
      grad.addColorStop(1, theme.stops[1]);
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(0, 0, totalWidth, totalHeight, 16);
    ctx.fill();

    // 2. Inner card container
    const cardX = padding;
    const cardY = padding;
    const cardRadius = 12;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;

    ctx.fillStyle = '#141518';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, contentWidth, cardHeight, cardRadius);
    ctx.fill();
    ctx.restore();

    // Card border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, contentWidth, cardHeight, cardRadius);
    ctx.stroke();

    // 3. Window header & dots
    if (showWindowControls) {
      const dotY = cardY + 18;
      // Red
      ctx.fillStyle = '#ff5f56';
      ctx.beginPath();
      ctx.arc(cardX + 20, dotY, 5.5, 0, Math.PI * 2);
      ctx.fill();
      // Yellow
      ctx.fillStyle = '#ffbd2e';
      ctx.beginPath();
      ctx.arc(cardX + 38, dotY, 5.5, 0, Math.PI * 2);
      ctx.fill();
      // Green
      ctx.fillStyle = '#27c93f';
      ctx.beginPath();
      ctx.arc(cardX + 56, dotY, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Title in header
    if (title) {
      ctx.fillStyle = '#888';
      ctx.font = `11px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(title, cardX + contentWidth / 2, cardY + 22);
      ctx.textAlign = 'left';
    }

    // Header divider line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.moveTo(cardX, cardY + headerHeight);
    ctx.lineTo(cardX + contentWidth, cardY + headerHeight);
    ctx.stroke();

    // 4. Code text & Line numbers
    ctx.font = font;
    const textStartY = cardY + headerHeight + 18;

    codeLines.forEach((line, i) => {
      const y = textStartY + i * lineHeight;

      // Line number
      if (showLineNumbers) {
        ctx.fillStyle = '#444';
        ctx.textAlign = 'right';
        ctx.fillText(String(i + 1), cardX + lineNumGutter - 12, y);
        ctx.textAlign = 'left';
      }

      // Syntax-tinted line text
      const x = cardX + lineNumGutter + 16;
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
        ctx.fillStyle = '#6a737d';
      } else if (trimmed.startsWith('import ') || trimmed.startsWith('export ') || trimmed.startsWith('from ') || trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('function ') || trimmed.startsWith('class ') || trimmed.startsWith('def ') || trimmed.startsWith('return ')) {
        ctx.fillStyle = '#ff7b72';
      } else {
        ctx.fillStyle = '#e6edf3';
      }
      ctx.fillText(line, x, y);
    });

    // 5. Watermark Footer
    if (showWatermark) {
      ctx.font = `10px 'JetBrains Mono', monospace`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.textAlign = 'right';
      ctx.fillText(`collabcode.io • ${roomId || 'session'}`, cardX + contentWidth - 16, cardY + cardHeight - 10);
      ctx.textAlign = 'left';
    }
  }, [codeLines, padding, showLineNumbers, showWatermark, showWindowControls, theme, title, roomId]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(renderToCanvas, 50);
    }
  }, [isOpen, renderToCanvas]);

  const handleCopy = async () => {
    setCopying(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            setToastMsg('Image copied to clipboard!');
          } else {
            setToastMsg('Clipboard API not supported in this browser');
          }
        } catch (err) {
          setToastMsg('Failed to copy image');
        }
        setTimeout(() => setToastMsg(''), 2500);
        setCopying(false);
      }, 'image/png');
    } catch {
      setCopying(false);
    }
  };

  const handleDownload = () => {
    setDownloading(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '-').toLowerCase() || 'code-card'}.png`;
      a.click();
      setToastMsg('Image downloaded!');
      setTimeout(() => setToastMsg(''), 2500);
    } catch (err) {
      setToastMsg('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#141518] border border-[#2c2d33] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#222] bg-[#18191c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#5e9eff]/10 border border-[#5e9eff]/30 flex items-center justify-center text-[#5e9eff]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white font-mono">CodeShot Studio</h3>
              <p className="text-[11px] text-[#666] font-mono">Export high-resolution code snippet cards</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#666] hover:text-white rounded-lg hover:bg-[#222] transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-[#191a1e] border-b border-[#25262c] text-xs font-mono">
          {/* Gradient Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[#666] text-[11px] mr-1">Backdrop:</span>
            {GRADIENTS.map(g => (
              <button
                key={g.id}
                onClick={() => setTheme(g)}
                title={g.name}
                className={`w-6 h-6 rounded-full border transition transform active:scale-95 ${theme.id === g.id ? 'border-white ring-2 ring-[#5e9eff]' : 'border-transparent hover:scale-105'}`}
                style={{ background: g.css }}
              />
            ))}
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[#aaa] cursor-pointer hover:text-white transition">
              <input
                type="checkbox"
                checked={showLineNumbers}
                onChange={e => setShowLineNumbers(e.target.checked)}
                className="rounded border-[#444] bg-[#222] text-[#5e9eff] focus:ring-0"
              />
              <span className="text-[11px]">Line Numbers</span>
            </label>
            <label className="flex items-center gap-1.5 text-[#aaa] cursor-pointer hover:text-white transition">
              <input
                type="checkbox"
                checked={showWindowControls}
                onChange={e => setShowWindowControls(e.target.checked)}
                className="rounded border-[#444] bg-[#222] text-[#5e9eff] focus:ring-0"
              />
              <span className="text-[11px]">Window Header</span>
            </label>
            <label className="flex items-center gap-1.5 text-[#aaa] cursor-pointer hover:text-white transition">
              <input
                type="checkbox"
                checked={showWatermark}
                onChange={e => setShowWatermark(e.target.checked)}
                className="rounded border-[#444] bg-[#222] text-[#5e9eff] focus:ring-0"
              />
              <span className="text-[11px]">Watermark</span>
            </label>
          </div>

          {/* Padding */}
          <div className="flex items-center gap-1">
            <span className="text-[#666] text-[11px] mr-1">Padding:</span>
            {[16, 32, 48].map(p => (
              <button
                key={p}
                onClick={() => setPadding(p)}
                className={`px-2 py-0.5 rounded text-[11px] border transition ${padding === p ? 'bg-[#5e9eff]/20 border-[#5e9eff]/50 text-[#5e9eff]' : 'bg-[#222] border-[#333] text-[#777] hover:text-white'}`}
              >
                {p}px
              </button>
            ))}
          </div>
        </div>

        {/* Live Canvas Preview Area */}
        <div className="flex-1 p-6 overflow-auto bg-[#0d0e11] flex items-center justify-center min-h-[300px]">
          <canvas ref={canvasRef} className="rounded-2xl shadow-2xl max-w-full" />
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#222] bg-[#18191c]">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Card title..."
              className="bg-[#121316] border border-[#2c2d33] rounded-lg px-2.5 py-1.5 text-xs text-[#ccc] font-mono focus:border-[#5e9eff] focus:outline-none w-48"
            />
            {toastMsg && (
              <span className="text-xs font-mono text-[#5bd882] animate-fade-in">{toastMsg}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={copying}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#333] bg-[#222] text-[#ddd] hover:text-white hover:border-[#555] text-xs font-mono font-medium transition active:scale-95"
            >
              <svg className="w-3.5 h-3.5 text-[#5e9eff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>{copying ? 'Copying...' : 'Copy Image'}</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#5e9eff] hover:bg-[#4d8eed] text-white text-xs font-mono font-semibold transition active:scale-95 shadow-md shadow-[#5e9eff]/20"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>{downloading ? 'Downloading...' : 'Download PNG'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
