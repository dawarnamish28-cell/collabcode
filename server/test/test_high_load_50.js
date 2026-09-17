/**
 * 50 Concurrent Request Load Test against Execution Engine v10.0
 */

const { executeCode } = require('./controllers/executionController');

function createMockReqRes({ code, language, stdin = '' }) {
  let resData = null;
  let resStatusCode = 200;

  const req = {
    body: { code, language, stdin },
    on: () => {},
  };

  const res = {
    status: (code) => {
      resStatusCode = code;
      return res;
    },
    json: (data) => {
      resData = data;
      res.writableEnded = true;
      return res;
    },
    writableEnded: false,
  };

  return { req, res, getData: () => resData, getStatusCode: () => resStatusCode };
}

const LANGUAGES_LOAD = [
  { lang: 'javascript', code: 'console.log("Load JS " + Math.random());' },
  { lang: 'python', code: 'import math; print("Load Py", math.factorial(6))' },
  { lang: 'bash', code: 'echo "Load Bash $$"' },
  { lang: 'sqlite', code: 'SELECT "Load SQLite", 1 + 1;' },
  { lang: 'c', code: '#include <stdio.h>\nint main(){ printf("Load C\\n"); return 0; }' },
  { lang: 'ruby', code: 'puts "Load Ruby #{2**8}"' },
  { lang: 'awk', code: 'BEGIN { print "Load AWK" }' },
];

async function runHighLoad() {
  console.log('Starting 50 concurrent requests stress test...\n');
  const startTime = Date.now();

  const promises = [];
  for (let i = 0; i < 50; i++) {
    const item = LANGUAGES_LOAD[i % LANGUAGES_LOAD.length];
    promises.push((async (index) => {
      const { req, res, getData, getStatusCode } = createMockReqRes({ code: item.code, language: item.lang });
      await executeCode(req, res);
      return { index, lang: item.lang, status: getStatusCode(), data: getData() };
    })(i));
  }

  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  const successes = results.filter(r => r.data && r.data.success);
  const failures = results.filter(r => !r.data || !r.data.success);

  console.log(`Executed 50 requests in ${duration}ms!`);
  console.log(`Successes: ${successes.length}/50 (${((successes.length / 50) * 100).toFixed(1)}%)`);
  if (failures.length > 0) {
    console.error(`Failures: ${failures.length}`);
    failures.slice(0, 5).forEach(f => console.error(f));
  }

  process.exit(failures.length > 0 ? 1 : 0);
}

runHighLoad().catch(err => {
  console.error(err);
  process.exit(1);
});
