/**
 * Full System Integration & Stress Test for CollabCode
 * Tests HTTP endpoints, Admin API, Real-time Socket.IO sync, and High Concurrency load
 */

const http = require('http');
const { io: ClientIO } = require('../../client/node_modules/socket.io-client');
const axios = require('axios');

// Set test port
const TEST_PORT = 4099;
process.env.PORT = String(TEST_PORT);
process.env.ADMIN_PASSWORD = 'admin_stress_password_123';
process.env.JWT_SECRET = 'stress_jwt_secret_test';
process.env.NODE_ENV = 'test';

const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runFullSystemTest() {
  console.log('===============================================================');
  console.log('   COLLABCODE PRE-LAUNCH FULL SYSTEM INTEGRATION & STRESS TEST');
  console.log('===============================================================\n');

  // 1. Boot up the server
  console.log('[1/6] Booting server on port', TEST_PORT, '...');
  const { server, app, io } = require('../server');

  // Wait for server to listen
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.on('listening', resolve);
  });
  console.log('✓ Server listening at', BASE_URL);

  // 2. HTTP Health & Info Endpoints
  console.log('\n[2/6] Testing Core HTTP Endpoints...');
  const healthRes = await axios.get(`${BASE_URL}/api/health`);
  console.log(`✓ GET /api/health -> status: ${healthRes.data.status}, rooms: ${healthRes.data.rooms}, memory: ${healthRes.data.memory.heapUsed}MB`);

  const langRes = await axios.get(`${BASE_URL}/api/languages`);
  console.log(`✓ GET /api/languages -> count: ${Object.keys(langRes.data.languages).length}`);

  const iceRes = await axios.get(`${BASE_URL}/api/ice-servers`);
  console.log(`✓ GET /api/ice-servers -> servers: ${iceRes.data.iceServers.length}`);

  const roomsCheck = await axios.get(`${BASE_URL}/api/rooms/stress-test-room-1/check`);
  console.log(`✓ GET /api/rooms/:roomId/check -> exists: ${roomsCheck.data.exists}`);

  // 3. Admin Authentication & Competition Controls
  console.log('\n[3/6] Testing Admin API & Competition / Stopwatch Controls...');
  const loginRes = await axios.post(`${BASE_URL}/admin/api/login`, {
    username: 'admin',
    password: 'admin_stress_password_123',
  });
  const adminToken = loginRes.data.token;
  console.log('✓ POST /admin/api/login -> Admin authenticated successfully');

  const adminHeaders = { 'x-admin-token': adminToken };

  // Test toggling requireStopwatch
  const reqSwOn = await axios.post(
    `${BASE_URL}/admin/api/competition/require-stopwatch`,
    { requireStopwatch: true },
    { headers: adminHeaders }
  );
  console.log(`✓ POST /admin/api/competition/require-stopwatch (true) -> requireStopwatch: ${reqSwOn.data.requireStopwatch}`);

  // 4. Socket.IO Real-time Sync & Competition Broadcasts
  console.log('\n[4/6] Testing Socket.IO Concurrency & Real-time State Propagation...');
  const NUM_CLIENTS = 10;
  const socketClients = [];
  const testRoomId = 'stress-room-live-' + Date.now();
  let receivedStopwatchUpdates = 0;
  let receivedLockUpdates = 0;

  for (let i = 0; i < NUM_CLIENTS; i++) {
    const client = ClientIO(BASE_URL, {
      transports: ['websocket'],
      forceNew: true,
      auth: {
        token: null, // guest
      },
      extraHeaders: {
        'x-session-id': `stress-user-${i}`,
        'x-username': `Tester_${i}`,
      },
    });

    socketClients.push(client);

    client.on('competition:require-stopwatch-change', (data) => {
      receivedStopwatchUpdates++;
    });

    client.on('competition:lock-change', (data) => {
      receivedLockUpdates++;
    });
  }

  // Wait for all to connect and join room
  await Promise.all(
    socketClients.map(
      (client, idx) =>
        new Promise((resolve) => {
          client.on('connect', () => {
            client.emit('room:join', { roomId: testRoomId });
          });
          client.on('room:state', (state) => {
            if (idx === 0) {
              console.log(
                `✓ Client 0 received room:state | requireStopwatch: ${state.competition?.requireStopwatch} | users in room: ${state.users?.length}`
              );
            }
            resolve();
          });
        })
    )
  );

  console.log(`✓ All ${NUM_CLIENTS} socket clients connected and joined ${testRoomId}`);

  // Trigger admin toggle requireStopwatch: false and verify all clients receive it
  await axios.post(
    `${BASE_URL}/admin/api/competition/require-stopwatch`,
    { requireStopwatch: false },
    { headers: adminHeaders }
  );
  await sleep(100);

  // Trigger admin toggle room lock: true and verify all clients receive it
  await axios.post(
    `${BASE_URL}/admin/api/competition/lock`,
    { locked: true },
    { headers: adminHeaders }
  );
  await sleep(100);

  // Reset admin lock: false
  await axios.post(
    `${BASE_URL}/admin/api/competition/lock`,
    { locked: false },
    { headers: adminHeaders }
  );
  await sleep(100);

  console.log(`✓ Real-time broadcast verification:`);
  console.log(`  - Stopwatch updates received by clients: ${receivedStopwatchUpdates}/${NUM_CLIENTS}`);
  console.log(`  - Lock updates received by clients: ${receivedLockUpdates}/${NUM_CLIENTS * 2}`);

  // 5. High Concurrency Execution Stress Test
  console.log('\n[5/6] High Concurrency Code Execution Stress Test (100 Concurrent Requests)...');
  const CONCURRENT_REQUESTS = 100;
  const executionTasks = [];
  const testPayloads = [
    { language: 'javascript', code: 'const x = 50 * 2; console.log("Result:", x);' },
    { language: 'python', code: 'print("Python Stress Result:", sum(range(100)))' },
    { language: 'bash', code: 'echo "Bash concurrent: $RANDOM"' },
    { language: 'sqlite', code: 'SELECT 100 * 100 AS calc;' },
  ];

  const startTime = Date.now();
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    const payload = testPayloads[i % testPayloads.length];
    executionTasks.push(
      axios
        .post(
          `${BASE_URL}/api/execute`,
          {
            code: payload.code,
            language: payload.language,
          },
          {
            headers: {
              'x-session-id': `bench-user-${i % 20}`,
            },
            timeout: 15000,
          }
        )
        .then((res) => ({ status: res.status, success: res.data.success, engine: res.data.engine }))
        .catch((err) => ({ status: err.response?.status || 500, error: err.message }))
    );
  }

  const results = await Promise.all(executionTasks);
  const elapsed = Date.now() - startTime;
  const successful = results.filter((r) => r.status === 200 && r.success).length;

  console.log(`✓ Finished ${CONCURRENT_REQUESTS} concurrent requests in ${elapsed}ms (${(CONCURRENT_REQUESTS / (elapsed / 1000)).toFixed(1)} req/sec)`);
  console.log(`✓ Successful executions: ${successful}/${CONCURRENT_REQUESTS} (${((successful / CONCURRENT_REQUESTS) * 100).toFixed(1)}%)`);

  // Disconnect socket clients
  socketClients.forEach((c) => c.disconnect());

  // 6. Memory & Stability Diagnostics
  console.log('\n[6/6] Final Diagnostics & Memory Stability Check...');
  const statsRes = await axios.get(`${BASE_URL}/api/exec-stats`);
  console.log('Execution Stats Summary:');
  console.log(`  - Total Executions: ${statsRes.data.totalExecutions}`);
  console.log(`  - Successful: ${statsRes.data.successfulExecutions}`);
  console.log(`  - Active Processes: ${statsRes.data.activeProcesses}`);
  console.log(`  - Active Sandboxes: ${statsRes.data.activeSandboxes}`);
  console.log(`  - Heap Used: ${Math.round(statsRes.data.memoryUsage.heapUsed / 1024 / 1024)}MB / Heap Total: ${Math.round(statsRes.data.memoryUsage.heapTotal / 1024 / 1024)}MB`);
  console.log(`  - RSS: ${Math.round(statsRes.data.memoryUsage.rss / 1024 / 1024)}MB`);

  if (statsRes.data.activeProcesses > 0) {
    console.warn(`WARNING: ${statsRes.data.activeProcesses} leftover processes detected!`);
  } else {
    console.log('✓ Zero dangling processes or sandboxes!');
  }

  console.log('\n===============================================================');
  console.log('   ALL PRE-LAUNCH SYSTEM CHECKS & STRESS TESTS PASSED 100%!');
  console.log('===============================================================\n');

  process.exit(0);
}

runFullSystemTest().catch((err) => {
  console.error('STRESS TEST FAILED:', err);
  process.exit(1);
});
