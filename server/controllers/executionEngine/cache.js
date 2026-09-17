/**
 * Multi-Tier Execution & Compilation Cache v10.0
 * 
 * Features:
 *  1. In-Flight Singleflight Deduplication:
 *     Merges simultaneous identical executions into a single running promise.
 *     Eliminates thundering herd spikes when multiple users run identical code simultaneously.
 *  2. Execution Result Cache (LRU + TTL):
 *     Short-lived (60s) idempotent cache for identical code + language + stdin.
 *     Returns responses in <1ms without touching CPU or subprocesses.
 *  3. Compilation Binary Cache with Singleflight Lock:
 *     Avoids parallel re-compilation of identical C, C++, Java, Rust code.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const RESULT_CACHE_MAX_SIZE = parseInt(process.env.EXEC_RESULT_CACHE_SIZE) || 200;
const RESULT_CACHE_TTL_MS = parseInt(process.env.EXEC_RESULT_CACHE_TTL_MS) || 60000; // 60s
const COMPILE_CACHE_MAX_SIZE = parseInt(process.env.EXEC_COMPILE_CACHE_SIZE) || 50;
const COMPILE_CACHE_TTL_MS = parseInt(process.env.EXEC_COMPILE_CACHE_TTL_MS) || 3600000; // 1 hour
const CACHE_DIR_PREFIX = 'collabcache-';

// ─── 1. Execution Result Cache (LRU + TTL) ──────────────────────────────
class ResultCache {
  constructor(maxSize = RESULT_CACHE_MAX_SIZE, ttlMs = RESULT_CACHE_TTL_MS) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  hash(language, code, stdin = '') {
    return crypto.createHash('sha256').update(`${language}:${code}:${stdin}`).digest('hex').slice(0, 24);
  }

  get(language, code, stdin = '') {
    const key = this.hash(language, code, stdin);
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // LRU touch
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(language, code, stdin = '', value) {
    // Only cache valid execution outcomes (don't cache internal timeouts/crashes)
    if (!value || value.status === 'Time Limit Exceeded' || value.status === 'Queue Timeout') return;

    const key = this.hash(language, code, stdin);

    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      createdAt: Date.now(),
      value: { ...value, cached: true },
    });
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

// ─── 2. Singleflight Deduplicator ──────────────────────────────────────
class Singleflight {
  constructor() {
    this.inFlight = new Map(); // key -> Promise
  }

  hash(language, code, stdin = '') {
    return crypto.createHash('sha256').update(`${language}:${code}:${stdin}`).digest('hex').slice(0, 24);
  }

  /**
   * Execute fn with singleflight deduplication
   * If a matching execution is already in flight, await and share its result.
   */
  async do(language, code, stdin = '', fn) {
    const key = this.hash(language, code, stdin);

    if (this.inFlight.has(key)) {
      // Re-use active promise
      return this.inFlight.get(key);
    }

    const promise = (async () => {
      try {
        return await fn();
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  get activeCount() {
    return this.inFlight.size;
  }
}

// ─── 3. Compilation Binary Cache with Singleflight ─────────────────────
class CompilationCache {
  constructor(maxSize = COMPILE_CACHE_MAX_SIZE, ttlMs = COMPILE_CACHE_TTL_MS) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.inFlightCompiles = new Map();
  }

  hash(language, code) {
    return crypto.createHash('sha256').update(`${language}:${code}`).digest('hex').slice(0, 20);
  }

  get(language, code) {
    const key = this.hash(language, code);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.createdAt > this.ttlMs) {
      this._evict(key, entry);
      return null;
    }

    if (!fs.existsSync(entry.binaryPath)) {
      this.cache.delete(key);
      return null;
    }

    // LRU update
    this.cache.delete(key);
    this.cache.set(key, { ...entry, lastAccess: Date.now() });
    return entry;
  }

  set(language, code, binaryPath, sandboxDir) {
    const key = this.hash(language, code);

    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this._evict(oldestKey, this.cache.get(oldestKey));
    }

    this.cache.set(key, {
      language,
      binaryPath,
      sandboxDir,
      createdAt: Date.now(),
      lastAccess: Date.now(),
    });
  }

  _evict(key, entry) {
    if (entry?.sandboxDir) {
      try { fs.rmSync(entry.sandboxDir, { recursive: true, force: true }); } catch (e) {}
    }
    this.cache.delete(key);
  }

  /**
   * Singleflight compile lock: if identical code is being compiled concurrently,
   * await the single compilation rather than launching multiple compiler processes.
   */
  async lockAndCompile(language, code, compileFn) {
    const key = this.hash(language, code);

    if (this.inFlightCompiles.has(key)) {
      return this.inFlightCompiles.get(key);
    }

    const compilePromise = (async () => {
      try {
        return await compileFn();
      } finally {
        this.inFlightCompiles.delete(key);
      }
    })();

    this.inFlightCompiles.set(key, compilePromise);
    return compilePromise;
  }

  gcExpired() {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > this.ttlMs) {
        this._evict(key, entry);
        count++;
      }
    }
    return count;
  }

  clear() {
    for (const [key, entry] of this.cache) {
      this._evict(key, entry);
    }
  }

  get size() {
    return this.cache.size;
  }
}

const resultCache = new ResultCache();
const singleflight = new Singleflight();
const compilationCache = new CompilationCache();

module.exports = {
  resultCache,
  singleflight,
  compilationCache,
  CACHE_DIR_PREFIX,
};
