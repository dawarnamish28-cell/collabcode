/**
 * Adaptive Multi-Lane Concurrency Queue v10.0
 * 
 * Features:
 *  - Differentiated Concurrency Lanes:
 *      * Fast Lane: Lightweight interpreted scripts (JS, TS, Py, Bash, Lua, etc.) - up to 16 concurrent
 *      * Compile Lane: Heavy compilations (C, C++, Java, Rust, Go, Fortran, NASM) - up to 4 concurrent
 *  - Dynamic Backpressure:
 *      * Monitors Node.js Event Loop Lag via perf_hooks
 *      * Monitors Process Memory Heap Headroom
 *      * Sheds load (HTTP 503) gracefully when saturated to prevent fatal OOM crashes
 *  - Client Disconnect / AbortSignal Support:
 *      * Automatically dequeues abandoned requests
 *      * Triggers onAbort callback for running tasks to tree-kill processes
 *  - Bounded FIFO with Queue Wait Timeout (30s)
 */

const { monitorEventLoopDelay } = require('perf_hooks');

const MAX_FAST_CONCURRENT = parseInt(process.env.EXEC_FAST_CONCURRENT) || 16;
const MAX_COMPILE_CONCURRENT = parseInt(process.env.EXEC_COMPILE_CONCURRENT) || 4;
const MAX_QUEUE_LENGTH = parseInt(process.env.EXEC_MAX_QUEUE) || 100;
const QUEUE_WAIT_TIMEOUT_MS = parseInt(process.env.EXEC_QUEUE_TIMEOUT_MS) || 30000;
const MAX_EVENT_LOOP_LAG_MS = parseInt(process.env.EXEC_MAX_EVENT_LOOP_LAG_MS) || 600;
const MAX_HEAP_MB = parseInt(process.env.EXEC_MAX_HEAP_MB) || 420; // safe headroom for 512MB container

// Initialize event loop delay histogram
let elHistogram = null;
try {
  elHistogram = monitorEventLoopDelay({ resolution: 20 });
  elHistogram.enable();
} catch (e) {
  // perf_hooks histogram fallback
}

class AdaptiveQueue {
  constructor() {
    this.fastQueue = [];
    this.compileQueue = [];
    this.activeFast = 0;
    this.activeCompile = 0;
    this.metrics = {
      enqueuedTotal: 0,
      completedTotal: 0,
      queueRejections: 0,
      queueTimeouts: 0,
      abortedCount: 0,
      saturationEvents: 0,
    };
  }

  getEventLoopLag() {
    if (!elHistogram) return 0;
    // p99 in milliseconds (histogram values are in nanoseconds)
    const p99Ms = elHistogram.percentile(99) / 1e6;
    elHistogram.reset();
    return p99Ms;
  }

  isSystemSaturated() {
    const lag = this.getEventLoopLag();
    const mem = process.memoryUsage();
    const heapUsedMb = mem.heapUsed / 1024 / 1024;

    if (lag > MAX_EVENT_LOOP_LAG_MS) {
      this.metrics.saturationEvents++;
      console.warn(`[Queue Backpressure] Event loop lag high: ${lag.toFixed(1)}ms > ${MAX_EVENT_LOOP_LAG_MS}ms`);
      return { saturated: true, reason: `Server busy (Event loop lag ${lag.toFixed(0)}ms)` };
    }

    if (heapUsedMb > MAX_HEAP_MB) {
      this.metrics.saturationEvents++;
      console.warn(`[Queue Backpressure] Heap memory high: ${heapUsedMb.toFixed(1)}MB > ${MAX_HEAP_MB}MB`);
      return { saturated: true, reason: 'Server busy (Memory pressure)' };
    }

    return { saturated: false };
  }

  /**
   * Enqueue a task
   * @param {Object} options
   * @param {'fast'|'compile'} options.lane
   * @param {Function} options.executeFn - async function to execute
   * @param {AbortSignal} [options.abortSignal] - optional client AbortSignal
   * @param {Function} [options.onAbort] - callback if task is aborted while running
   */
  enqueue({ lane = 'fast', executeFn, abortSignal = null, onAbort = null }) {
    return new Promise((resolve, reject) => {
      // 1. Check dynamic backpressure
      const health = this.isSystemSaturated();
      if (health.saturated) {
        this.metrics.queueRejections++;
        return reject(new Error('SERVER_SATURATED'));
      }

      // 2. Check queue capacity
      const totalQueued = this.fastQueue.length + this.compileQueue.length;
      if (totalQueued >= MAX_QUEUE_LENGTH) {
        this.metrics.queueRejections++;
        return reject(new Error('QUEUE_FULL'));
      }

      const queue = lane === 'compile' ? this.compileQueue : this.fastQueue;

      const task = {
        id: Math.random().toString(36).substring(2, 9),
        lane,
        executeFn,
        onAbort,
        resolve,
        reject,
        enqueuedAt: Date.now(),
        timeoutTimer: null,
        abortListener: null,
        started: false,
      };

      // 3. Client Abort Handling
      if (abortSignal) {
        if (abortSignal.aborted) {
          this.metrics.abortedCount++;
          return reject(new Error('REQUEST_ABORTED'));
        }

        task.abortListener = () => {
          if (!task.started) {
            // Remove from waiting queue
            this._removeFromQueue(queue, task);
            this.metrics.abortedCount++;
            task.reject(new Error('REQUEST_ABORTED'));
          } else if (task.onAbort) {
            // Task is currently running, notify to kill subprocess
            try { task.onAbort(); } catch (e) {}
            this.metrics.abortedCount++;
          }
        };

        abortSignal.addEventListener('abort', task.abortListener, { once: true });
      }

      // 4. Queue Wait Timeout
      task.timeoutTimer = setTimeout(() => {
        if (!task.started) {
          this._removeFromQueue(queue, task);
          this.metrics.queueTimeouts++;
          this._cleanupTask(task, abortSignal);
          task.reject(new Error('QUEUE_TIMEOUT'));
        }
      }, QUEUE_WAIT_TIMEOUT_MS);

      this.metrics.enqueuedTotal++;

      // 5. Try running immediately or push to queue
      if (lane === 'compile') {
        if (this.activeCompile < MAX_COMPILE_CONCURRENT) {
          this._runTask(task, abortSignal);
        } else {
          this.compileQueue.push(task);
        }
      } else {
        if (this.activeFast < MAX_FAST_CONCURRENT) {
          this._runTask(task, abortSignal);
        } else {
          this.fastQueue.push(task);
        }
      }
    });
  }

  _removeFromQueue(queue, task) {
    const idx = queue.indexOf(task);
    if (idx !== -1) {
      queue.splice(idx, 1);
    }
  }

  _cleanupTask(task, abortSignal) {
    if (task.timeoutTimer) {
      clearTimeout(task.timeoutTimer);
      task.timeoutTimer = null;
    }
    if (abortSignal && task.abortListener) {
      abortSignal.removeEventListener('abort', task.abortListener);
      task.abortListener = null;
    }
  }

  async _runTask(task, abortSignal) {
    task.started = true;
    if (task.timeoutTimer) {
      clearTimeout(task.timeoutTimer);
      task.timeoutTimer = null;
    }

    if (task.lane === 'compile') this.activeCompile++;
    else this.activeFast++;

    try {
      const result = await task.executeFn();
      this.metrics.completedTotal++;
      this._cleanupTask(task, abortSignal);
      task.resolve(result);
    } catch (err) {
      this._cleanupTask(task, abortSignal);
      task.reject(err);
    } finally {
      if (task.lane === 'compile') this.activeCompile--;
      else this.activeFast--;

      // Process next waiting tasks
      this._drainQueues();
    }
  }

  _drainQueues() {
    // 1. Drain compile lane if slot available
    while (this.compileQueue.length > 0 && this.activeCompile < MAX_COMPILE_CONCURRENT) {
      const next = this.compileQueue.shift();
      if (next) {
        this._runTask(next, null);
      }
    }

    // 2. Drain fast lane if slot available
    while (this.fastQueue.length > 0 && this.activeFast < MAX_FAST_CONCURRENT) {
      const next = this.fastQueue.shift();
      if (next) {
        this._runTask(next, null);
      }
    }
  }

  getStats() {
    const mem = process.memoryUsage();
    return {
      activeFastWorkers: this.activeFast,
      maxFastConcurrent: MAX_FAST_CONCURRENT,
      activeCompileWorkers: this.activeCompile,
      maxCompileConcurrent: MAX_COMPILE_CONCURRENT,
      fastQueueLength: this.fastQueue.length,
      compileQueueLength: this.compileQueue.length,
      totalQueueLength: this.fastQueue.length + this.compileQueue.length,
      maxQueueLength: MAX_QUEUE_LENGTH,
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
      metrics: this.metrics,
    };
  }

  clear() {
    for (const task of [...this.fastQueue, ...this.compileQueue]) {
      if (task.timeoutTimer) clearTimeout(task.timeoutTimer);
      task.reject(new Error('Server shutting down'));
    }
    this.fastQueue = [];
    this.compileQueue = [];
  }
}

const adaptiveQueue = new AdaptiveQueue();

module.exports = {
  adaptiveQueue,
  MAX_FAST_CONCURRENT,
  MAX_COMPILE_CONCURRENT,
};
