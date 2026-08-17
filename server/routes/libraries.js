/**
 * Libraries Route v1.0 — Language Library/Package Browser
 * 
 * Provides API endpoints to list available libraries per language,
 * with import snippets, descriptions, and categories.
 * 
 * - GET /api/libraries          → all languages and their libraries
 * - GET /api/libraries/:lang    → libraries for a specific language
 * - GET /api/libraries/search?q=xxx&lang=yyy → search libraries
 * 
 * made with <3 by Namish
 */

const express = require('express');
const { execSync } = require('child_process');
const router = express.Router();

// ─── Cache: detect once, serve fast ─────────────────────────────────────
let libraryCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 600000; // 10 minutes

// ─── Curated library metadata (import snippets, categories, descriptions) ─
// This is the brain of the feature — tells users WHAT each library does
// and HOW to import it in their code.

const PYTHON_LIBRARY_META = {
  // === Data Science & ML ===
  numpy:        { category: 'Data Science',   desc: 'N-dimensional array computing',          import: 'import numpy as np' },
  pandas:       { category: 'Data Science',   desc: 'DataFrames for data analysis',            import: 'import pandas as pd' },
  scipy:        { category: 'Data Science',   desc: 'Scientific & technical computing',        import: 'from scipy import stats' },
  'scikit-learn': { category: 'Machine Learning', desc: 'ML models, preprocessing, metrics',  import: 'from sklearn import datasets, model_selection, metrics' },
  sympy:        { category: 'Data Science',   desc: 'Symbolic mathematics',                    import: 'from sympy import symbols, solve, diff, integrate' },
  statsmodels:  { category: 'Data Science',   desc: 'Statistical modeling & tests',            import: 'import statsmodels.api as sm' },

  // === Visualization ===
  matplotlib:   { category: 'Visualization',  desc: 'Comprehensive plotting library',          import: 'import matplotlib.pyplot as plt' },
  seaborn:      { category: 'Visualization',  desc: 'Statistical data visualization',          import: 'import seaborn as sns' },
  plotly:       { category: 'Visualization',  desc: 'Interactive charts & graphs',              import: 'import plotly.express as px' },
  bokeh:        { category: 'Visualization',  desc: 'Interactive web-ready visualizations',     import: 'from bokeh.plotting import figure, show' },

  // === Image & Vision ===
  'opencv-python': { category: 'Image Processing', desc: 'Computer vision & image processing', import: 'import cv2' },
  pillow:       { category: 'Image Processing', desc: 'Image manipulation (PIL fork)',         import: 'from PIL import Image, ImageFilter, ImageDraw' },
  'scikit-image': { category: 'Image Processing', desc: 'Image processing algorithms',        import: 'from skimage import io, filters, transform' },

  // === Web & HTTP ===
  requests:     { category: 'Web & HTTP',     desc: 'HTTP requests made simple',               import: 'import requests' },
  aiohttp:      { category: 'Web & HTTP',     desc: 'Async HTTP client/server',                import: 'import aiohttp' },
  beautifulsoup4: { category: 'Web & HTTP',   desc: 'HTML/XML parsing & scraping',             import: 'from bs4 import BeautifulSoup' },
  lxml:         { category: 'Web & HTTP',     desc: 'Fast XML/HTML processing',                import: 'from lxml import etree' },

  // === NLP & Text ===
  spacy:        { category: 'NLP',            desc: 'Industrial-strength NLP',                  import: 'import spacy' },
  nltk:         { category: 'NLP',            desc: 'Natural language processing toolkit',      import: 'import nltk' },
  regex:        { category: 'NLP',            desc: 'Advanced regular expressions',             import: 'import regex' },

  // === Networking & Graphs ===
  networkx:     { category: 'Graphs',         desc: 'Graph/network analysis',                   import: 'import networkx as nx' },

  // === Utilities ===
  pydantic:     { category: 'Utilities',      desc: 'Data validation with type hints',          import: 'from pydantic import BaseModel, Field' },
  click:        { category: 'Utilities',      desc: 'CLI application framework',                import: 'import click' },
  tqdm:         { category: 'Utilities',      desc: 'Progress bars for loops',                  import: 'from tqdm import tqdm' },
  rich:         { category: 'Utilities',      desc: 'Rich text & formatting in terminal',       import: 'from rich import print' },
  python_dateutil: { category: 'Utilities',   desc: 'Date/time parsing & utilities',            import: 'from dateutil import parser, relativedelta' },
  pytz:         { category: 'Utilities',      desc: 'Timezone definitions',                     import: 'import pytz' },
  pyyaml:       { category: 'Utilities',      desc: 'YAML parser and emitter',                  import: 'import yaml' },
  toml:         { category: 'Utilities',      desc: 'TOML file parser',                         import: 'import toml' },
  jsonschema:   { category: 'Utilities',      desc: 'JSON Schema validation',                   import: 'from jsonschema import validate' },

  // === Crypto & Security ===
  cryptography: { category: 'Security',       desc: 'Cryptographic recipes & primitives',       import: 'from cryptography.fernet import Fernet' },

  // === Testing ===
  pytest:       { category: 'Testing',        desc: 'Testing framework',                        import: 'import pytest' },

  // === Standard Library (always available) ===
  json:         { category: 'Std Library',    desc: 'JSON encode/decode',                       import: 'import json', builtin: true },
  os:           { category: 'Std Library',    desc: 'OS interface',                              import: 'import os', builtin: true },
  sys:          { category: 'Std Library',    desc: 'System-specific parameters',                import: 'import sys', builtin: true },
  math:         { category: 'Std Library',    desc: 'Mathematical functions',                    import: 'import math', builtin: true },
  random:       { category: 'Std Library',    desc: 'Random number generation',                  import: 'import random', builtin: true },
  datetime:     { category: 'Std Library',    desc: 'Date and time handling',                    import: 'from datetime import datetime, timedelta', builtin: true },
  re:           { category: 'Std Library',    desc: 'Regular expressions',                       import: 'import re', builtin: true },
  collections:  { category: 'Std Library',    desc: 'Specialized container datatypes',           import: 'from collections import Counter, defaultdict, deque', builtin: true },
  itertools:    { category: 'Std Library',    desc: 'Iterator building blocks',                  import: 'from itertools import combinations, permutations, chain', builtin: true },
  functools:    { category: 'Std Library',    desc: 'Higher-order functions',                    import: 'from functools import lru_cache, reduce, partial', builtin: true },
  typing:       { category: 'Std Library',    desc: 'Type hints',                                import: 'from typing import List, Dict, Optional, Tuple', builtin: true },
  pathlib:      { category: 'Std Library',    desc: 'Object-oriented filesystem paths',          import: 'from pathlib import Path', builtin: true },
  hashlib:      { category: 'Std Library',    desc: 'Secure hash & message digests',             import: 'import hashlib', builtin: true },
  csv:          { category: 'Std Library',    desc: 'CSV file reading and writing',              import: 'import csv', builtin: true },
  io:           { category: 'Std Library',    desc: 'Core I/O operations',                       import: 'from io import StringIO, BytesIO', builtin: true },
  string:       { category: 'Std Library',    desc: 'String constants and templates',             import: 'import string', builtin: true },
  struct:       { category: 'Std Library',    desc: 'Binary data packing/unpacking',              import: 'import struct', builtin: true },
  threading:    { category: 'Std Library',    desc: 'Thread-based parallelism',                   import: 'import threading', builtin: true },
  multiprocessing: { category: 'Std Library', desc: 'Process-based parallelism',                 import: 'import multiprocessing', builtin: true },
  subprocess:   { category: 'Std Library',    desc: 'Subprocess management',                     import: 'import subprocess', builtin: true },
  socket:       { category: 'Std Library',    desc: 'Low-level networking',                       import: 'import socket', builtin: true },
  http:         { category: 'Std Library',    desc: 'HTTP modules',                               import: 'from http.server import HTTPServer, BaseHTTPRequestHandler', builtin: true },
  urllib:       { category: 'Std Library',    desc: 'URL handling modules',                       import: 'from urllib.parse import urlencode, urlparse', builtin: true },
  sqlite3:      { category: 'Std Library',    desc: 'SQLite database interface',                  import: 'import sqlite3', builtin: true },
  unittest:     { category: 'Std Library',    desc: 'Unit testing framework',                     import: 'import unittest', builtin: true },
  logging:      { category: 'Std Library',    desc: 'Logging facility',                           import: 'import logging', builtin: true },
  argparse:     { category: 'Std Library',    desc: 'CLI argument parser',                        import: 'import argparse', builtin: true },
  copy:         { category: 'Std Library',    desc: 'Shallow and deep copy',                      import: 'import copy', builtin: true },
  heapq:        { category: 'Std Library',    desc: 'Heap queue (priority queue)',                 import: 'import heapq', builtin: true },
  bisect:       { category: 'Std Library',    desc: 'Array bisection algorithm',                   import: 'import bisect', builtin: true },
  decimal:      { category: 'Std Library',    desc: 'Decimal fixed-point arithmetic',              import: 'from decimal import Decimal', builtin: true },
  fractions:    { category: 'Std Library',    desc: 'Rational numbers',                            import: 'from fractions import Fraction', builtin: true },
  statistics:   { category: 'Std Library',    desc: 'Mathematical statistics',                     import: 'import statistics', builtin: true },
  textwrap:     { category: 'Std Library',    desc: 'Text wrapping and filling',                   import: 'import textwrap', builtin: true },
  enum:         { category: 'Std Library',    desc: 'Enum support',                                import: 'from enum import Enum, auto', builtin: true },
  dataclasses:  { category: 'Std Library',    desc: 'Data classes decorator',                      import: 'from dataclasses import dataclass, field', builtin: true },
  abc:          { category: 'Std Library',    desc: 'Abstract base classes',                       import: 'from abc import ABC, abstractmethod', builtin: true },
  contextlib:   { category: 'Std Library',    desc: 'Context manager utilities',                   import: 'from contextlib import contextmanager', builtin: true },
};

const JS_LIBRARY_META = {
  // === Built-in Node.js Modules ===
  fs:           { category: 'Std Library',    desc: 'File system operations',                      import: "const fs = require('fs');", builtin: true },
  path:         { category: 'Std Library',    desc: 'File & directory paths',                      import: "const path = require('path');", builtin: true },
  http:         { category: 'Std Library',    desc: 'HTTP server & client',                        import: "const http = require('http');", builtin: true },
  https:        { category: 'Std Library',    desc: 'HTTPS server & client',                       import: "const https = require('https');", builtin: true },
  url:          { category: 'Std Library',    desc: 'URL parsing',                                 import: "const { URL, URLSearchParams } = require('url');", builtin: true },
  crypto:       { category: 'Std Library',    desc: 'Cryptographic functionality',                 import: "const crypto = require('crypto');", builtin: true },
  os:           { category: 'Std Library',    desc: 'Operating system info',                       import: "const os = require('os');", builtin: true },
  util:         { category: 'Std Library',    desc: 'Utility functions',                           import: "const util = require('util');", builtin: true },
  events:       { category: 'Std Library',    desc: 'Event emitter',                               import: "const { EventEmitter } = require('events');", builtin: true },
  stream:       { category: 'Std Library',    desc: 'Stream interface',                            import: "const { Readable, Writable, Transform } = require('stream');", builtin: true },
  readline:     { category: 'Std Library',    desc: 'Read lines from input',                       import: "const readline = require('readline');", builtin: true },
  child_process:{ category: 'Std Library',    desc: 'Spawn child processes',                       import: "const { exec, spawn } = require('child_process');", builtin: true },
  buffer:       { category: 'Std Library',    desc: 'Binary data handling',                        import: "const { Buffer } = require('buffer');", builtin: true },
  assert:       { category: 'Std Library',    desc: 'Assertion testing',                           import: "const assert = require('assert');", builtin: true },
  querystring:  { category: 'Std Library',    desc: 'Query string parsing',                        import: "const querystring = require('querystring');", builtin: true },
  zlib:         { category: 'Std Library',    desc: 'Compression (gzip, deflate)',                  import: "const zlib = require('zlib');", builtin: true },
  timers:       { category: 'Std Library',    desc: 'Timer functions',                             import: "const { setTimeout, setInterval } = require('timers/promises');", builtin: true },
  worker_threads: { category: 'Std Library',  desc: 'Multi-threading',                             import: "const { Worker, isMainThread, parentPort } = require('worker_threads');", builtin: true },

  // === Global APIs ===
  JSON:         { category: 'Global API',     desc: 'JSON parse & stringify',                      import: '// JSON is globally available\n// JSON.parse(str), JSON.stringify(obj)', builtin: true },
  Math:         { category: 'Global API',     desc: 'Mathematical constants & functions',          import: '// Math is globally available\n// Math.random(), Math.floor(), Math.PI', builtin: true },
  Promise:      { category: 'Global API',     desc: 'Asynchronous operations',                    import: '// Promises are globally available\n// new Promise((resolve, reject) => { ... })', builtin: true },
  Map:          { category: 'Global API',     desc: 'Key-value collection',                       import: '// Map is globally available\n// const map = new Map();', builtin: true },
  Set:          { category: 'Global API',     desc: 'Unique value collection',                    import: '// Set is globally available\n// const set = new Set([1, 2, 3]);', builtin: true },
  RegExp:       { category: 'Global API',     desc: 'Regular expressions',                        import: '// RegExp is globally available\n// const re = /pattern/gi;', builtin: true },
  Date:         { category: 'Global API',     desc: 'Date and time',                              import: '// Date is globally available\n// const now = new Date();', builtin: true },
  Array:        { category: 'Global API',     desc: 'Array methods',                              import: '// Array methods: map, filter, reduce, find, sort, etc.\n// const arr = [1,2,3].map(x => x * 2);', builtin: true },
};

const JAVA_LIBRARY_META = {
  'java.util':       { category: 'Collections', desc: 'Collections, Lists, Maps, Sets',          import: 'import java.util.*;', builtin: true },
  'java.util.stream': { category: 'Streams',    desc: 'Stream API for functional processing',    import: 'import java.util.stream.*;', builtin: true },
  'java.io':         { category: 'I/O',         desc: 'Input/output streams & files',             import: 'import java.io.*;', builtin: true },
  'java.nio':        { category: 'I/O',         desc: 'Non-blocking I/O',                         import: 'import java.nio.file.*;', builtin: true },
  'java.net':        { category: 'Networking',   desc: 'HTTP clients, URLs, sockets',             import: 'import java.net.*;', builtin: true },
  'java.math':       { category: 'Math',         desc: 'BigInteger, BigDecimal',                  import: 'import java.math.*;', builtin: true },
  'java.text':       { category: 'Text',         desc: 'Text formatting & parsing',               import: 'import java.text.*;', builtin: true },
  'java.time':       { category: 'Date/Time',    desc: 'Modern date/time API',                    import: 'import java.time.*;', builtin: true },
  'java.util.regex': { category: 'Text',         desc: 'Regular expressions',                     import: 'import java.util.regex.*;', builtin: true },
  'java.util.concurrent': { category: 'Concurrency', desc: 'Concurrent utilities',               import: 'import java.util.concurrent.*;', builtin: true },
  'java.util.function': { category: 'Functional', desc: 'Functional interfaces',                 import: 'import java.util.function.*;', builtin: true },
  'java.security':   { category: 'Security',     desc: 'Security framework',                      import: 'import java.security.*;', builtin: true },
  'javax.crypto':    { category: 'Security',     desc: 'Cryptographic operations',                import: 'import javax.crypto.*;', builtin: true },
  'java.sql':        { category: 'Database',      desc: 'JDBC database access',                   import: 'import java.sql.*;', builtin: true },
};

const CPP_LIBRARY_META = {
  iostream:  { category: 'I/O',          desc: 'Standard input/output streams',       import: '#include <iostream>', builtin: true },
  string:    { category: 'Containers',   desc: 'String class',                        import: '#include <string>', builtin: true },
  vector:    { category: 'Containers',   desc: 'Dynamic array',                       import: '#include <vector>', builtin: true },
  map:       { category: 'Containers',   desc: 'Ordered key-value map',               import: '#include <map>', builtin: true },
  unordered_map: { category: 'Containers', desc: 'Hash-based key-value map',          import: '#include <unordered_map>', builtin: true },
  set:       { category: 'Containers',   desc: 'Ordered unique elements',             import: '#include <set>', builtin: true },
  unordered_set: { category: 'Containers', desc: 'Hash-based unique elements',        import: '#include <unordered_set>', builtin: true },
  queue:     { category: 'Containers',   desc: 'FIFO queue & priority queue',         import: '#include <queue>', builtin: true },
  stack:     { category: 'Containers',   desc: 'LIFO stack',                          import: '#include <stack>', builtin: true },
  deque:     { category: 'Containers',   desc: 'Double-ended queue',                  import: '#include <deque>', builtin: true },
  list:      { category: 'Containers',   desc: 'Doubly-linked list',                  import: '#include <list>', builtin: true },
  array:     { category: 'Containers',   desc: 'Fixed-size array',                    import: '#include <array>', builtin: true },
  algorithm: { category: 'Algorithms',   desc: 'sort, find, binary_search, etc.',     import: '#include <algorithm>', builtin: true },
  numeric:   { category: 'Algorithms',   desc: 'Numeric operations (accumulate)',      import: '#include <numeric>', builtin: true },
  cmath:     { category: 'Math',         desc: 'Math functions (sqrt, sin, pow)',      import: '#include <cmath>', builtin: true },
  cstdlib:   { category: 'Utilities',    desc: 'General utilities (rand, atoi)',       import: '#include <cstdlib>', builtin: true },
  cstring:   { category: 'Utilities',    desc: 'C-style string functions',             import: '#include <cstring>', builtin: true },
  fstream:   { category: 'I/O',          desc: 'File streams',                         import: '#include <fstream>', builtin: true },
  sstream:   { category: 'I/O',          desc: 'String streams',                       import: '#include <sstream>', builtin: true },
  iomanip:   { category: 'I/O',          desc: 'I/O manipulation (setw, setprecision)', import: '#include <iomanip>', builtin: true },
  regex:     { category: 'Text',         desc: 'Regular expressions',                  import: '#include <regex>', builtin: true },
  chrono:    { category: 'Time',         desc: 'Time utilities & clocks',              import: '#include <chrono>', builtin: true },
  thread:    { category: 'Concurrency',  desc: 'Multi-threading',                      import: '#include <thread>', builtin: true },
  mutex:     { category: 'Concurrency',  desc: 'Mutual exclusion',                     import: '#include <mutex>', builtin: true },
  memory:    { category: 'Memory',       desc: 'Smart pointers (unique_ptr, shared_ptr)', import: '#include <memory>', builtin: true },
  functional:{ category: 'Functional',   desc: 'Function objects & bind',               import: '#include <functional>', builtin: true },
  tuple:     { category: 'Utilities',    desc: 'Fixed-size heterogeneous values',       import: '#include <tuple>', builtin: true },
  optional:  { category: 'Utilities',    desc: 'Optional value wrapper (C++17)',        import: '#include <optional>', builtin: true },
  variant:   { category: 'Utilities',    desc: 'Type-safe union (C++17)',               import: '#include <variant>', builtin: true },
  any:       { category: 'Utilities',    desc: 'Type-safe any value (C++17)',           import: '#include <any>', builtin: true },
  bitset:    { category: 'Utilities',    desc: 'Bit array',                             import: '#include <bitset>', builtin: true },
  cassert:   { category: 'Utilities',    desc: 'Assertions',                            import: '#include <cassert>', builtin: true },
  climits:   { category: 'Utilities',    desc: 'Numeric limits',                        import: '#include <climits>', builtin: true },
  random:    { category: 'Math',         desc: 'Random number generators',              import: '#include <random>', builtin: true },
};

const C_LIBRARY_META = {
  stdio:     { category: 'I/O',          desc: 'Standard input/output',            import: '#include <stdio.h>', builtin: true },
  stdlib:    { category: 'Utilities',    desc: 'Memory, conversion, random',       import: '#include <stdlib.h>', builtin: true },
  string:    { category: 'Strings',      desc: 'String manipulation',              import: '#include <string.h>', builtin: true },
  math:      { category: 'Math',         desc: 'Math functions',                   import: '#include <math.h>', builtin: true },
  ctype:     { category: 'Characters',   desc: 'Character classification',         import: '#include <ctype.h>', builtin: true },
  time:      { category: 'Time',         desc: 'Date and time',                    import: '#include <time.h>', builtin: true },
  stdbool:   { category: 'Types',        desc: 'Boolean type',                     import: '#include <stdbool.h>', builtin: true },
  stdint:    { category: 'Types',        desc: 'Fixed-width integer types',        import: '#include <stdint.h>', builtin: true },
  assert:    { category: 'Debug',        desc: 'Assertions',                       import: '#include <assert.h>', builtin: true },
  errno:     { category: 'Error',        desc: 'Error codes',                      import: '#include <errno.h>', builtin: true },
  limits:    { category: 'Types',        desc: 'Numeric limits',                   import: '#include <limits.h>', builtin: true },
  float:     { category: 'Types',        desc: 'Floating-point limits',            import: '#include <float.h>', builtin: true },
  pthread:   { category: 'Concurrency',  desc: 'POSIX threads',                    import: '#include <pthread.h>', builtin: true },
};

const GO_LIBRARY_META = {
  fmt:       { category: 'I/O',          desc: 'Formatted I/O',                    import: 'import "fmt"', builtin: true },
  strings:   { category: 'Strings',      desc: 'String manipulation',              import: 'import "strings"', builtin: true },
  strconv:   { category: 'Strings',      desc: 'String conversions',               import: 'import "strconv"', builtin: true },
  math:      { category: 'Math',         desc: 'Mathematical functions',           import: 'import "math"', builtin: true },
  sort:      { category: 'Algorithms',   desc: 'Sorting algorithms',               import: 'import "sort"', builtin: true },
  os:        { category: 'System',       desc: 'OS functions',                     import: 'import "os"', builtin: true },
  io:        { category: 'I/O',          desc: 'I/O primitives',                   import: 'import "io"', builtin: true },
  bufio:     { category: 'I/O',          desc: 'Buffered I/O',                     import: 'import "bufio"', builtin: true },
  net:       { category: 'Networking',   desc: 'Networking interfaces',            import: 'import "net"', builtin: true },
  'net/http':{ category: 'Networking',   desc: 'HTTP client & server',             import: 'import "net/http"', builtin: true },
  encoding:  { category: 'Encoding',     desc: 'JSON, XML, CSV encoding',          import: 'import "encoding/json"', builtin: true },
  regexp:    { category: 'Text',         desc: 'Regular expressions',              import: 'import "regexp"', builtin: true },
  time:      { category: 'Time',         desc: 'Time measurement & display',       import: 'import "time"', builtin: true },
  sync:      { category: 'Concurrency',  desc: 'Synchronization primitives',       import: 'import "sync"', builtin: true },
  errors:    { category: 'Error',        desc: 'Error handling',                   import: 'import "errors"', builtin: true },
  crypto:    { category: 'Security',     desc: 'Cryptographic functions',          import: 'import "crypto/sha256"', builtin: true },
  reflect:   { category: 'Runtime',      desc: 'Runtime reflection',               import: 'import "reflect"', builtin: true },
  context:   { category: 'Concurrency',  desc: 'Cancellation & deadlines',         import: 'import "context"', builtin: true },
};

const RUST_LIBRARY_META = {
  std:       { category: 'Std Library',  desc: 'Standard library',                 import: 'use std::collections::HashMap;', builtin: true },
  io:        { category: 'I/O',          desc: 'Input/output operations',          import: 'use std::io::{self, Read, Write};', builtin: true },
  fs:        { category: 'I/O',          desc: 'Filesystem operations',            import: 'use std::fs;', builtin: true },
  collections: { category: 'Containers', desc: 'HashMap, HashSet, BTreeMap, VecDeque', import: 'use std::collections::{HashMap, HashSet, VecDeque};', builtin: true },
  fmt:       { category: 'Formatting',   desc: 'String formatting',                import: 'use std::fmt;', builtin: true },
  str:       { category: 'Strings',      desc: 'String slices & manipulation',     import: '// &str and String are in prelude', builtin: true },
  thread:    { category: 'Concurrency',  desc: 'Threading support',                import: 'use std::thread;', builtin: true },
  sync:      { category: 'Concurrency',  desc: 'Arc, Mutex, RwLock',               import: 'use std::sync::{Arc, Mutex};', builtin: true },
  env:       { category: 'System',       desc: 'Environment variables & args',      import: 'use std::env;', builtin: true },
  process:   { category: 'System',       desc: 'Process management',                import: 'use std::process::Command;', builtin: true },
  time:      { category: 'Time',         desc: 'Time measurement',                  import: 'use std::time::{Duration, Instant};', builtin: true },
  net:       { category: 'Networking',   desc: 'TCP/UDP networking',                 import: 'use std::net::{TcpListener, TcpStream};', builtin: true },
  path:      { category: 'I/O',          desc: 'Filesystem paths',                   import: 'use std::path::{Path, PathBuf};', builtin: true },
  cmp:       { category: 'Utilities',    desc: 'Ordering and comparison',             import: 'use std::cmp::{min, max, Ordering};', builtin: true },
  convert:   { category: 'Utilities',    desc: 'Type conversions',                    import: 'use std::convert::{From, Into, TryFrom};', builtin: true },
  iter:      { category: 'Iterators',    desc: 'Iterator adaptors',                   import: '// Iterators are in prelude', builtin: true },
};

const RUBY_LIBRARY_META = {
  json:      { category: 'Data',         desc: 'JSON parsing/generation',            import: "require 'json'", builtin: true },
  yaml:      { category: 'Data',         desc: 'YAML parsing/generation',            import: "require 'yaml'", builtin: true },
  csv:       { category: 'Data',         desc: 'CSV parsing/generation',             import: "require 'csv'", builtin: true },
  net_http:  { category: 'Networking',   desc: 'HTTP client',                        import: "require 'net/http'", builtin: true },
  uri:       { category: 'Networking',   desc: 'URI parsing',                        import: "require 'uri'", builtin: true },
  fileutils: { category: 'I/O',          desc: 'File utility methods',               import: "require 'fileutils'", builtin: true },
  date:      { category: 'Time',         desc: 'Date handling',                      import: "require 'date'", builtin: true },
  time:      { category: 'Time',         desc: 'Time class',                         import: "require 'time'", builtin: true },
  set:       { category: 'Containers',   desc: 'Set data structure',                 import: "require 'set'", builtin: true },
  digest:    { category: 'Security',     desc: 'Message digests (MD5, SHA)',          import: "require 'digest'", builtin: true },
  base64:    { category: 'Encoding',     desc: 'Base64 encoding/decoding',           import: "require 'base64'", builtin: true },
  erb:       { category: 'Templates',    desc: 'Embedded Ruby templates',            import: "require 'erb'", builtin: true },
  optparse:  { category: 'CLI',          desc: 'Option parser for CLI',              import: "require 'optparse'", builtin: true },
  ostruct:   { category: 'Utilities',    desc: 'OpenStruct for dynamic attrs',       import: "require 'ostruct'", builtin: true },
  minitest:  { category: 'Testing',      desc: 'Testing framework',                  import: "require 'minitest/autorun'", builtin: true },
};

const ALL_LANGUAGE_META = {
  python: PYTHON_LIBRARY_META,
  javascript: JS_LIBRARY_META,
  typescript: JS_LIBRARY_META, // TypeScript shares JS libs
  java: JAVA_LIBRARY_META,
  c: C_LIBRARY_META,
  cpp: CPP_LIBRARY_META,
  go: GO_LIBRARY_META,
  rust: RUST_LIBRARY_META,
  ruby: RUBY_LIBRARY_META,
};

// ─── Detect installed Python packages dynamically ──────────────────────
function detectPythonPackages() {
  try {
    const output = execSync('pip3 list --format=json 2>/dev/null', { timeout: 10000, encoding: 'utf-8' });
    return JSON.parse(output);
  } catch (e) {
    return [];
  }
}

// ─── Build complete library catalog ────────────────────────────────────
function buildLibraryCatalog() {
  const now = Date.now();
  if (libraryCache && (now - cacheTimestamp) < CACHE_TTL) {
    return libraryCache;
  }

  const installedPython = detectPythonPackages();
  const installedPythonNames = new Set(installedPython.map(p => p.name.toLowerCase()));

  const catalog = {};

  for (const [lang, meta] of Object.entries(ALL_LANGUAGE_META)) {
    const libraries = [];
    for (const [name, info] of Object.entries(meta)) {
      const pyPkg = lang === 'python' ? installedPython.find(p => p.name.toLowerCase() === name.toLowerCase()) : null;
      libraries.push({
        name,
        displayName: name.replace(/_/g, '-'),
        category: info.category,
        description: info.desc,
        importStatement: info.import,
        builtin: !!info.builtin,
        installed: info.builtin || (lang === 'python' ? installedPythonNames.has(name.toLowerCase()) || installedPythonNames.has(name.replace(/_/g, '-').toLowerCase()) : true),
        version: pyPkg ? pyPkg.version : null,
      });
    }
    // Sort: installed first, then alphabetical within categories
    libraries.sort((a, b) => {
      if (a.category !== b.category) {
        // Std Library last
        if (a.category === 'Std Library') return 1;
        if (b.category === 'Std Library') return -1;
        if (a.category === 'Global API') return 1;
        if (b.category === 'Global API') return -1;
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });

    // Get unique categories
    const categories = [...new Set(libraries.map(l => l.category))];

    catalog[lang] = {
      language: lang,
      totalLibraries: libraries.length,
      categories,
      libraries,
    };
  }

  // Add note for languages without curated metadata
  const supportedLangs = ['python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'go', 'rust', 'ruby'];
  const otherLangs = ['php', 'perl', 'r', 'bash', 'shell', 'awk', 'lua', 'fortran', 'tcl', 'sqlite', 'nasm'];
  for (const lang of otherLangs) {
    catalog[lang] = {
      language: lang,
      totalLibraries: 0,
      categories: [],
      libraries: [],
      note: 'Built-in standard library available. Use language-native import syntax.',
    };
  }

  libraryCache = catalog;
  cacheTimestamp = now;
  return catalog;
}

// ─── Routes ────────────────────────────────────────────────────────────

// GET /api/libraries — All languages
router.get('/', (req, res) => {
  const catalog = buildLibraryCatalog();
  const summary = {};
  for (const [lang, data] of Object.entries(catalog)) {
    summary[lang] = {
      totalLibraries: data.totalLibraries,
      categories: data.categories,
      note: data.note || null,
    };
  }
  res.json({ languages: summary });
});

// GET /api/libraries/:lang — Libraries for a specific language
router.get('/:lang', (req, res) => {
  const { lang } = req.params;
  const catalog = buildLibraryCatalog();
  const langData = catalog[lang] || catalog[lang.toLowerCase()];
  if (!langData) {
    return res.status(404).json({ error: true, message: `Language '${lang}' not found` });
  }
  res.json(langData);
});

// GET /api/libraries/search?q=xxx&lang=yyy — Search libraries
router.get('/search', (req, res) => {
  const { q, lang } = req.query;
  if (!q) return res.status(400).json({ error: true, message: 'Query parameter q is required' });

  const query = q.toLowerCase();
  const catalog = buildLibraryCatalog();
  const results = [];

  const languagesToSearch = lang ? [lang.toLowerCase()] : Object.keys(catalog);

  for (const language of languagesToSearch) {
    const data = catalog[language];
    if (!data || !data.libraries) continue;
    for (const lib of data.libraries) {
      if (
        lib.name.toLowerCase().includes(query) ||
        lib.description.toLowerCase().includes(query) ||
        lib.category.toLowerCase().includes(query)
      ) {
        results.push({ ...lib, language });
      }
    }
  }

  res.json({ query: q, results, count: results.length });
});

module.exports = router;
