/**
 * Execution Controller
 * 
 * Handles code execution requests by proxying to Judge0 CE API.
 * Supports multiple languages with proper language ID mapping.
 * Falls back to a mock executor for development when Judge0 is unavailable.
 */

const axios = require('axios');

// Judge0 CE Language ID mapping
const LANGUAGE_MAP = {
  'javascript': { id: 63, name: 'JavaScript (Node.js 12.14.0)' },
  'typescript': { id: 74, name: 'TypeScript (3.7.4)' },
  'python':     { id: 71, name: 'Python (3.8.1)' },
  'java':       { id: 62, name: 'Java (OpenJDK 13.0.1)' },
  'cpp':        { id: 54, name: 'C++ (GCC 9.2.0)' },
  'c':          { id: 50, name: 'C (GCC 9.2.0)' },
  'go':         { id: 60, name: 'Go (1.13.5)' },
  'rust':       { id: 73, name: 'Rust (1.40.0)' },
  'ruby':       { id: 72, name: 'Ruby (2.7.0)' },
  'php':        { id: 68, name: 'PHP (7.4.1)' },
};

const JUDGE0_URL = process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com';
const JUDGE0_KEY = process.env.JUDGE0_API_KEY;
const JUDGE0_HOST = process.env.JUDGE0_API_HOST || 'judge0-ce.p.rapidapi.com';

/**
 * Execute code via Judge0 API
 */
async function executeCode(req, res) {
  const { code, language, stdin = '' } = req.body;

  // Validate input
  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      error: true,
      message: 'Code is required and must be a string',
    });
  }

  if (!language || !LANGUAGE_MAP[language]) {
    return res.status(400).json({
      error: true,
      message: `Unsupported language. Supported: ${Object.keys(LANGUAGE_MAP).join(', ')}`,
    });
  }

  if (code.length > 100000) {
    return res.status(400).json({
      error: true,
      message: 'Code exceeds maximum length (100KB)',
    });
  }

  const langConfig = LANGUAGE_MAP[language];

  // If Judge0 API key not configured, use mock execution
  if (!JUDGE0_KEY || JUDGE0_KEY === 'your-rapidapi-key-here') {
    return mockExecute(code, language, stdin, res);
  }

  try {
    // Submit code to Judge0
    const submitResponse = await axios.post(
      `${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`,
      {
        source_code: code,
        language_id: langConfig.id,
        stdin: stdin,
        cpu_time_limit: 5,        // 5 seconds
        memory_limit: 128000,      // 128 MB
        wall_time_limit: 10,       // 10 seconds wall time
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': JUDGE0_KEY,
          'X-RapidAPI-Host': JUDGE0_HOST,
        },
        timeout: 30000, // 30 second timeout
      }
    );

    const result = submitResponse.data;

    // Parse Judge0 response
    const output = {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      compile_output: result.compile_output || '',
      status: result.status?.description || 'Unknown',
      time: result.time || '0',
      memory: result.memory || 0,
      exit_code: result.exit_code,
    };

    // Determine if execution was successful
    const success = result.status?.id === 3; // Status 3 = Accepted

    return res.json({
      success,
      output: output.stdout,
      error: output.stderr || output.compile_output,
      executionTime: `${output.time}s`,
      memoryUsed: `${Math.round(output.memory / 1024)}KB`,
      status: output.status,
    });

  } catch (err) {
    console.error('[Execution] Judge0 API error:', err.message);

    if (err.response?.status === 429) {
      return res.status(429).json({
        error: true,
        message: 'Judge0 API rate limit exceeded. Please wait and try again.',
      });
    }

    return res.status(502).json({
      error: true,
      message: 'Code execution service unavailable. Please try again later.',
    });
  }
}

/**
 * Mock code execution for development without Judge0
 * Simulates execution with basic output
 */
function mockExecute(code, language, stdin, res) {
  console.log(`[Execution] Mock executing ${language} code (${code.length} chars)`);

  const mockOutputs = {
    javascript: () => {
      try {
        // Very basic mock - just returns info about the code
        const lines = code.split('\n').length;
        return {
          stdout: `[Mock Executor] JavaScript code received (${lines} lines)\n` +
                  `// Configure JUDGE0_API_KEY in .env for real execution\n` +
                  `// Code preview: ${code.substring(0, 100)}...`,
          stderr: '',
        };
      } catch (e) {
        return { stdout: '', stderr: e.message };
      }
    },
    python: () => ({
      stdout: `[Mock Executor] Python code received (${code.split('\n').length} lines)\n` +
              `# Configure JUDGE0_API_KEY in .env for real execution`,
      stderr: '',
    }),
  };

  const executor = mockOutputs[language] || (() => ({
    stdout: `[Mock Executor] ${language} code received (${code.split('\n').length} lines)\n` +
            `// Configure JUDGE0_API_KEY in .env for real execution`,
    stderr: '',
  }));

  const result = executor();

  return res.json({
    success: true,
    output: result.stdout,
    error: result.stderr,
    executionTime: '0.001s',
    memoryUsed: '0KB',
    status: 'Mock Execution (Development Mode)',
    mock: true,
  });
}

/**
 * Get supported languages
 */
function getSupportedLanguages(req, res) {
  const languages = Object.entries(LANGUAGE_MAP).map(([key, val]) => ({
    id: key,
    name: val.name,
    judgeId: val.id,
  }));

  res.json({ languages });
}

module.exports = {
  executeCode,
  getSupportedLanguages,
};
