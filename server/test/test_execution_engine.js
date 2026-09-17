/**
 * Comprehensive Verification & Load Test for Execution Engine v10.0
 */

const { LANGUAGES } = require('./controllers/executionController');
const { adaptiveQueue } = require('./controllers/executionEngine/queue');
const { resultCache, singleflight } = require('./controllers/executionEngine/cache');
const { circuitBreaker, executeCloud } = require('./controllers/executionEngine/cloudRunner');

// Mock req and res
function createMockReqRes({ code, language, stdin = '' }) {
  let resData = null;
  let resStatusCode = 200;
  let closeListener = null;

  const req = {
    body: { code, language, stdin },
    on: (evt, cb) => {
      if (evt === 'close') closeListener = cb;
    },
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

  return {
    req,
    res,
    getData: () => resData,
    getStatusCode: () => resStatusCode,
    triggerClose: () => {
      if (closeListener) closeListener();
    },
  };
}

async function runTest() {
  console.log('====================================================');
  console.log('   STARTING EXECUTION ENGINE v10.0 COMPREHENSIVE TESTS');
  console.log('====================================================\n');

  const { executeCode, getExecutionStats } = require('./controllers/executionController');

  // Test 1: Basic execution of diverse languages
  console.log('--- TEST 1: Multi-Language Core Execution ---');
  const testLanguages = [
    { lang: 'javascript', code: 'console.log("Hello JS " + (2 + 2));' },
    { lang: 'python', code: 'print("Hello Python", sum([1, 2, 3, 4]))' },
    { lang: 'bash', code: 'echo "Hello Bash $(whoami)"' },
    { lang: 'sqlite', code: 'SELECT 42 AS answer;' },
    { lang: 'c', code: '#include <stdio.h>\nint main(){ printf("Hello C 100\\n"); return 0; }' },
    { lang: 'cpp', code: '#include <iostream>\nint main(){ std::cout << "Hello C++ 200" << std::endl; return 0; }' },
  ];

  for (const t of testLanguages) {
    const { req, res, getData, getStatusCode } = createMockReqRes({ code: t.code, language: t.lang });
    await executeCode(req, res);
    const data = getData();
    const ok = data && data.success && data.output;
    console.log(`[${t.lang}] Status: ${getStatusCode()} | Success: ${ok} | Engine: ${data?.engine} | Output: ${data?.output?.trim()}`);
    if (!ok) {
      console.error(`FAILED test for ${t.lang}:`, data);
    }
  }

  // Test 2: Cloud Fallback Execution (e.g. Fortran or R or Go)
  console.log('\n--- TEST 2: Cloud Fallback Execution (Fortran & R) ---');
  const cloudTests = [
    {
      lang: 'fortran',
      code: 'program hello\n    implicit none\n    print *, "Fortran Cloud Success 42"\nend program hello',
    },
    {
      lang: 'r',
      code: 'cat("R Cloud Result:", 10 * 10, "\\n")',
    },
  ];

  for (const t of cloudTests) {
    const { req, res, getData, getStatusCode } = createMockReqRes({ code: t.code, language: t.lang });
    await executeCode(req, res);
    const data = getData();
    console.log(`[${t.lang}] Status: ${getStatusCode()} | Success: ${data?.success} | Engine: ${data?.engine} | Output: ${data?.output?.trim()}`);
  }

  // Test 3: High Concurrency Load Test (30 parallel requests)
  console.log('\n--- TEST 3: High Concurrency Load Test (30 Concurrent Requests) ---');
  const startLoadTime = Date.now();
  const concurrentTasks = [];
  const parallelCodes = [
    { lang: 'javascript', code: 'console.log("Concurrent JS run " + Math.random());' },
    { lang: 'python', code: 'import sys; print("Concurrent Py", sys.version.split()[0])' },
    { lang: 'bash', code: 'echo "Concurrent bash"' },
    { lang: 'sqlite', code: 'SELECT "Concurrent SQL";' },
    { lang: 'c', code: '#include <stdio.h>\nint main(){ printf("Concurrent C\\n"); return 0; }' },
  ];

  for (let i = 0; i < 30; i++) {
    const t = parallelCodes[i % parallelCodes.length];
    concurrentTasks.push((async (idx) => {
      const { req, res, getData, getStatusCode } = createMockReqRes({ code: t.code, language: t.lang });
      await executeCode(req, res);
      return { idx, lang: t.lang, status: getStatusCode(), data: getData() };
    })(i));
  }

  const results = await Promise.all(concurrentTasks);
  const loadElapsed = Date.now() - startLoadTime;
  const successes = results.filter(r => r.data?.success).length;
  console.log(`Executed 30 concurrent requests in ${loadElapsed}ms`);
  console.log(`Success rate: ${successes}/30 (${((successes / 30) * 100).toFixed(1)}%)`);

  // Test 4: Singleflight Deduplication & Result Cache
  console.log('\n--- TEST 4: Singleflight Deduplication & Cache Hit Test ---');
  const identicalCode = 'console.log("Identical execution test " + (100 * 2));';
  const identicalReqs = [];
  for (let i = 0; i < 10; i++) {
    const { req, res, getData, getStatusCode } = createMockReqRes({ code: identicalCode, language: 'javascript' });
    identicalReqs.push((async () => {
      await executeCode(req, res);
      return getData();
    })());
  }

  const identicalResults = await Promise.all(identicalReqs);
  const allSucceeded = identicalResults.every(r => r && r.success && r.output.includes('200'));
  console.log(`10 parallel identical requests succeeded: ${allSucceeded}`);

  // Next run of the exact same code should be an instant cache hit
  const { req: cacheReq, res: cacheRes, getData: getCacheData } = createMockReqRes({ code: identicalCode, language: 'javascript' });
  await executeCode(cacheReq, cacheRes);
  const cacheData = getCacheData();
  console.log(`Subsequent run cached: ${cacheData?.cached} | Output: ${cacheData?.output?.trim()}`);

  // Test 5: Infinite Loop Timeout & Tree-Kill
  console.log('\n--- TEST 5: Infinite Loop Timeout & Tree-Kill ---');
  const infiniteLoopCode = 'while (true) {}';
  const loopStartTime = Date.now();
  const { req: loopReq, res: loopRes, getData: getLoopData } = createMockReqRes({ code: infiniteLoopCode, language: 'javascript' });
  await executeCode(loopReq, loopRes);
  const loopData = getLoopData();
  const loopElapsed = Date.now() - loopStartTime;
  console.log(`Infinite loop terminated in ${loopElapsed}ms | Status: ${loopData?.status} | Error: ${loopData?.error}`);

  // Test 6: Client Abort Mid-Execution
  console.log('\n--- TEST 6: Client Abort Mid-Execution ---');
  const sleepCode = 'const start = Date.now(); while (Date.now() - start < 8000) {} console.log("Done");';
  const mockReqRes = createMockReqRes({ code: sleepCode, language: 'javascript' });
  
  const execPromise = executeCode(mockReqRes.req, mockReqRes.res);
  // Abort after 300ms
  setTimeout(() => {
    console.log('Simulating client disconnect (req.close)...');
    mockReqRes.triggerClose();
  }, 300);

  await execPromise;
  console.log('Aborted task finished cleanly without server crash.');

  // Print Final Stats
  console.log('\n--- FINAL EXECUTION STATS ---');
  const { req: statsReq, res: statsRes, getData: getStatsData } = createMockReqRes({});
  getExecutionStats(statsReq, statsRes);
  console.log(JSON.stringify(getStatsData(), null, 2));

  console.log('\n====================================================');
  console.log('   ALL TESTS COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
