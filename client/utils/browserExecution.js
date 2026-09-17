import { getServerUrl } from './config';


// Cached Pyodide instance for Python
let pyodideInstance = null;
let pyodideLoadingPromise = null;

/**
 * Check if a language can be executed directly inside the user's browser
 */
export function canRunInBrowser(language) {
  const lang = (language || '').toLowerCase().trim();
  return ['javascript', 'js', 'typescript', 'ts', 'python', 'py', 'json', 'sqlite', 'sql'].includes(lang);
}

/**
 * Run code directly in the browser
 */
export async function runInBrowser(code, language, stdin = '') {
  const lang = (language || '').toLowerCase().trim();
  const startTime = performance.now();

  try {
    if (lang === 'javascript' || lang === 'js') {
      return await runJavaScriptWorker(code, stdin, false, startTime);
    }

    if (lang === 'typescript' || lang === 'ts') {
      return await runJavaScriptWorker(code, stdin, true, startTime);
    }

    if (lang === 'python' || lang === 'py') {
      return await runPythonBrowser(code, stdin, startTime);
    }

    if (lang === 'sqlite' || lang === 'sql') {
      return await runSqliteBrowser(code, stdin, startTime);
    }

    throw new Error(`In-browser execution not supported for ${language}`);
  } catch (err) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
    return {
      success: false,
      output: '',
      error: err.message || String(err),
      exitCode: 1,
      executionTime: `${elapsed}s`,
      status: 'Execution Error',
      engine: 'Browser (Client-Side)',
      language,
      version: 'Client',
      phase: 'run',
    };
  }
}

/**
 * Execute JavaScript/TypeScript in an isolated Web Worker with console interception
 */
function runJavaScriptWorker(code, stdin, isTs, startTime) {
  return new Promise((resolve) => {
    let cleanCode = code;

    // Basic TypeScript type stripping if needed
    if (isTs) {
      // Strip simple type annotations (e.g. : string, : number, : any, interface, type)
      cleanCode = cleanCode
        .replace(/:\s*(string|number|boolean|any|void|unknown|never|object)\b/g, '')
        .replace(/interface\s+\w+\s*\{[\s\S]*?\}/g, '')
        .replace(/type\s+\w+\s*=[\s\S]*?;/g, '')
        .replace(/as\s+(string|number|boolean|any)/g, '');
    }

    const workerScript = `
      self.onmessage = function(e) {
        const { code, stdin } = e.data;
        let logs = [];
        let errors = [];

        // Stdin helper
        const stdinLines = (stdin || '').split('\\n');
        let stdinIndex = 0;
        const readline = () => (stdinIndex < stdinLines.length ? stdinLines[stdinIndex++] : '');
        const prompt = (msg) => {
          if (msg) logs.push(String(msg));
          return readline();
        };

        // Intercept console
        const formatArgs = (args) => args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
        const customConsole = {
          log: (...args) => logs.push(formatArgs(args)),
          error: (...args) => errors.push(formatArgs(args)),
          warn: (...args) => logs.push('[warn] ' + formatArgs(args)),
          info: (...args) => logs.push(formatArgs(args)),
        };

        try {
          const runFn = new Function('console', 'readline', 'prompt', code);
          const result = runFn(customConsole, readline, prompt);
          if (result !== undefined && logs.length === 0) {
            logs.push(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
          }
          self.postMessage({ success: errors.length === 0, stdout: logs.join('\\n'), stderr: errors.join('\\n'), exitCode: errors.length === 0 ? 0 : 1 });
        } catch (err) {
          self.postMessage({ success: false, stdout: logs.join('\\n'), stderr: (err.name || 'Error') + ': ' + err.message, exitCode: 1 });
        }
      };
    `;

    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    let finished = false;
    const timeoutTimer = setTimeout(() => {
      if (!finished) {
        finished = true;
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
        resolve({
          success: false,
          output: '',
          error: 'Time Limit Exceeded (execution exceeded 10s timeout)',
          exitCode: -1,
          executionTime: `${elapsed}s`,
          status: 'Time Limit Exceeded',
          engine: 'Browser Worker',
          language: isTs ? 'TypeScript' : 'JavaScript',
          version: 'Browser V8',
          phase: 'run',
        });
      }
    }, 10000);

    worker.onmessage = (event) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutTimer);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
      const { success, stdout, stderr, exitCode } = event.data;

      resolve({
        success,
        output: stdout ? stdout + '\\n' : '',
        error: stderr || '',
        exitCode,
        executionTime: `${elapsed}s`,
        status: success ? 'Success' : `Exit Code: ${exitCode}`,
        engine: 'Browser Worker (Client-Side)',
        language: isTs ? 'TypeScript' : 'JavaScript',
        version: 'Browser Engine',
        phase: 'run',
      });
    };

    worker.onerror = (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutTimer);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
      resolve({
        success: false,
        output: '',
        error: err.message || 'Worker syntax error',
        exitCode: 1,
        executionTime: `${elapsed}s`,
        status: 'Error',
        engine: 'Browser Worker (Client-Side)',
        language: isTs ? 'TypeScript' : 'JavaScript',
        version: 'Browser Engine',
        phase: 'run',
      });
    };

    worker.postMessage({ code: cleanCode, stdin });
  });
}

/**
 * Load Pyodide WebAssembly for Python
 */
async function loadPyodideEngine() {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoadingPromise) return pyodideLoadingPromise;

  pyodideLoadingPromise = new Promise(async (resolve, reject) => {
    try {
      // Check if pyodide script is already present in document
      if (!window.loadPyodide) {
        await new Promise((res, rej) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js';
          script.onload = res;
          script.onerror = () => rej(new Error('Failed to load Pyodide WebAssembly from CDN'));
          document.head.appendChild(script);
        });
      }

      const pyodide = await window.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/',
      });

      pyodideInstance = pyodide;
      resolve(pyodide);
    } catch (err) {
      pyodideLoadingPromise = null;
      reject(err);
    }
  });

  return pyodideLoadingPromise;
}

/**
 * Execute Python inside the browser using Pyodide WebAssembly
 */
async function runPythonBrowser(code, stdin, startTime) {
  const pyodide = await loadPyodideEngine();

  // Setup Python environment with stdout/stderr redirection and stdin feed
  const escapedStdin = JSON.stringify(stdin || '');

  const setupPythonCode = `
import sys, io
_collab_stdout = io.StringIO()
_collab_stderr = io.StringIO()
sys.stdout = _collab_stdout
sys.stderr = _collab_stderr

# Configure mock stdin
_stdin_content = ${escapedStdin}
sys.stdin = io.StringIO(_stdin_content)
`;

  pyodide.runPython(setupPythonCode);

  let success = true;
  let exitCode = 0;
  let pyError = '';

  try {
    await pyodide.runPythonAsync(code);
  } catch (err) {
    success = false;
    exitCode = 1;
    pyError = err.message || String(err);
  }

  // Extract stdout & stderr
  const stdout = pyodide.runPython('_collab_stdout.getvalue()');
  const stderr = pyodide.runPython('_collab_stderr.getvalue()');

  const finalError = (stderr ? stderr + '\\n' : '') + (pyError || '');
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);

  return {
    success,
    output: stdout || (success && !finalError ? 'Code executed with no output.\\n' : ''),
    error: finalError.trim(),
    exitCode,
    executionTime: `${elapsed}s`,
    status: success ? 'Success' : `Exit Code: ${exitCode}`,
    engine: 'Pyodide WebAssembly (Client-Side)',
    language: 'Python 3',
    version: '3.12 (Wasm)',
    phase: 'run',
  };
}

/**
 * Load sql.js WebAssembly for in-browser SQLite execution
 */
let sqlJsInstance = null;
let sqlJsLoadingPromise = null;

async function loadSqlJsEngine() {
  if (sqlJsInstance) return sqlJsInstance;
  if (sqlJsLoadingPromise) return sqlJsLoadingPromise;

  sqlJsLoadingPromise = new Promise(async (resolve, reject) => {
    try {
      if (typeof window === 'undefined') return reject(new Error('Browser environment required'));
      if (!window.initSqlJs) {
        await new Promise((res, rej) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js';
          script.onload = res;
          script.onerror = () => rej(new Error('Failed to load sql.js from CDN'));
          document.head.appendChild(script);
        });
      }

      const SQL = await window.initSqlJs({
        locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`,
      });

      sqlJsInstance = SQL;
      resolve(SQL);
    } catch (err) {
      sqlJsLoadingPromise = null;
      reject(err);
    }
  });

  return sqlJsLoadingPromise;
}

function formatSqlResults(results) {
  if (!results || results.length === 0) {
    return 'Query executed successfully. (0 result sets returned)\n';
  }

  let out = '';
  for (const res of results) {
    if (!res.columns || res.columns.length === 0) continue;
    const cols = res.columns;
    const rows = res.values || [];

    const colWidths = cols.map((c, i) => {
      let max = c.length;
      for (const row of rows) {
        const valStr = row[i] === null ? 'NULL' : String(row[i]);
        if (valStr.length > max) max = valStr.length;
      }
      return max;
    });

    const header = cols.map((c, i) => c.padEnd(colWidths[i])).join(' | ');
    const divider = colWidths.map((w) => '-'.repeat(w)).join('-+-');
    const rowLines = rows.map((row) =>
      row.map((val, i) => (val === null ? 'NULL' : String(val)).padEnd(colWidths[i])).join(' | ')
    );

    out += header + '\n' + divider + '\n' + (rowLines.length > 0 ? rowLines.join('\n') + '\n' : '') + `(${rows.length} row${rows.length === 1 ? '' : 's'})\n\n`;
  }

  return out.trim() + '\n';
}

/**
 * Run SQLite in browser with real SQLite WebAssembly (sql.js)
 */
async function runSqliteBrowser(code, stdin, startTime) {
  try {
    const SQL = await loadSqlJsEngine();
    const db = new SQL.Database();

    // Clean out sqlite3 CLI dot-commands (.headers on, .mode column, etc.)
    const lines = (code || '').split('\n');
    const sqlStatements = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('.')) {
        if (trimmed.startsWith('.tables')) {
          sqlStatements.push("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
        } else if (trimmed.startsWith('.schema')) {
          sqlStatements.push("SELECT sql FROM sqlite_master WHERE type='table';");
        }
        continue;
      }
      sqlStatements.push(line);
    }

    const cleanSql = sqlStatements.join('\n').trim();
    if (!cleanSql) {
      return {
        success: true,
        output: 'No SQL statements executed.\n',
        error: '',
        exitCode: 0,
        executionTime: '0.001s',
        status: 'Success',
        engine: 'SQLite WebAssembly (Client-Side)',
        language: 'SQLite',
        version: 'SQLite 3 (Wasm)',
        phase: 'run',
      };
    }

    const results = db.exec(cleanSql);
    const output = formatSqlResults(results);
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);

    return {
      success: true,
      output: output || 'Statements executed successfully.\n',
      error: '',
      exitCode: 0,
      executionTime: `${elapsed}s`,
      status: 'Success',
      engine: 'SQLite WebAssembly (Client-Side)',
      language: 'SQLite',
      version: 'SQLite 3 (Wasm)',
      phase: 'run',
    };
  } catch (err) {
    // If client-side sql.js fails or CDN blocked, fall back seamlessly to Judge0
    try {
      return await runInCloud(code, 'sqlite', stdin);
    } catch (cloudErr) {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
      return {
        success: false,
        output: '',
        error: err.message || String(err),
        exitCode: 1,
        executionTime: `${elapsed}s`,
        status: 'SQL Error',
        engine: 'SQLite WebAssembly (Client-Side)',
        language: 'SQLite',
        version: 'SQLite 3 (Wasm)',
        phase: 'run',
      };
    }
  }
}

/**
 * Judge0 CE Cloud Execution Engine mapping (All 20 languages supported)
 */
export const JUDGE0_LANGUAGE_MAP = {
  javascript: 102,
  typescript: 101,
  python: 100,
  java: 91,
  c: 103,
  cpp: 105,
  go: 107,
  rust: 108,
  ruby: 72,
  php: 98,
  perl: 85,
  r: 99,
  bash: 46,
  shell: 46,
  awk: 100,    // Python awk runner
  lua: 64,
  fortran: 59,
  tcl: 100,    // Python tkinter.Tcl() embedded runner
  sqlite: 82,
  nasm: 45,
};

/**
 * Direct Cloud Execution — proxied via our server to avoid CORS/rate-limit issues
 * with Judge0 CE when called directly from the browser.
 */
export async function runInCloud(code, language, stdin = '') {
  const langKey = (language || '').toLowerCase().trim();
  if (!JUDGE0_LANGUAGE_MAP[langKey]) {
    throw new Error(`Cloud execution not available for ${language}`);
  }

  const SERVER_URL = getServerUrl();

  const startTime = performance.now();

  // Route through our server proxy — never call Judge0 directly from the browser
  const res = await fetch(`${SERVER_URL}/api/execute/cloud`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_code: code, code, language: langKey, stdin: stdin || '' }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `Cloud execution failed with HTTP ${res.status}`);
  }

  const data = await res.json();
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
  const isSuccess = data.success;
  const stdout = data.output || '';
  const stderr = (data.error || '').trim();

  return {
    success: isSuccess,
    output: stdout || (isSuccess && !stderr ? 'Code executed with no output.\n' : ''),
    error: stderr,
    exitCode: isSuccess ? 0 : (data.exitCode ?? 1),
    executionTime: data.executionTime || `${elapsed}s`,
    status: data.status || (isSuccess ? 'Success' : 'Execution Failed'),
    engine: data.engine || 'Cloud (Judge0 Engine)',
    language,
    version: 'Cloud 2026',
    phase: data.phase || 'run',
  };
}
