/**
 * Editor Component v6.0
 * 
 * Monaco Editor + Yjs CRDT. 15 languages.
 * 
 * CRITICAL FIX: Eliminates double-typing and double-enter bugs.
 * The root cause was a feedback loop in the Yjs <-> Monaco binding:
 *   1. User types -> onDidChangeModelContent fires -> ytext.insert/delete
 *   2. ytext.observe fires immediately (synchronously) for the same edit
 *   3. Observer tries to apply the edit AGAIN to Monaco -> double character
 * 
 * Solution: Track the "origin" of each Yjs transaction. When the origin
 * is the Monaco editor instance itself, the observer skips the edit.
 * This is the same pattern used by y-monaco and y-codemirror.
 * 
 * made with <3 by Namish
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import MonacoEditor from '@monaco-editor/react';

const MONACO_LANGUAGES = {
  javascript: 'javascript', typescript: 'typescript', python: 'python',
  java: 'java', cpp: 'cpp', c: 'c', go: 'go', rust: 'rust',
  ruby: 'ruby', php: 'php', perl: 'perl', r: 'r',
  bash: 'shell', shell: 'shell', awk: 'plaintext',
};

const DEFAULT_CODE = {
  javascript: `// JavaScript — CollabCode
const numbers = [1, 2, 3, 4, 5];
const sum = numbers.reduce((a, b) => a + b, 0);
const squares = numbers.map(n => n * n);

console.log("Numbers:", numbers);
console.log("Sum:", sum);
console.log("Squares:", squares);
console.log("Hello from CollabCode!");
`,
  typescript: `// TypeScript — CollabCode
interface User {
  name: string;
  role: string;
  level: number;
}

const greet = (user: User): string =>
  \`Hello \${user.name}! You are a Level \${user.level} \${user.role}.\`;

const users: User[] = [
  { name: "Alice", role: "Developer", level: 5 },
  { name: "Bob", role: "Designer", level: 3 },
];

users.forEach(u => console.log(greet(u)));
console.log("TypeScript running on CollabCode!");
`,
  python: `# Python — CollabCode
# Tip: Use input() for interactive input - type in the terminal below

import math
from collections import Counter

numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
print("Numbers:", numbers)
print("Sum:", sum(numbers))
print("Average:", sum(numbers) / len(numbers))
print("Pi:", round(math.pi, 6))
print("Factorial of 10:", math.factorial(10))
print()
print("Hello from CollabCode!")
`,
  java: `// Java — CollabCode
import java.util.Arrays;
import java.util.stream.IntStream;

public class Main {
    public static void main(String[] args) {
        int[] nums = {5, 3, 1, 4, 2};
        Arrays.sort(nums);
        int sum = IntStream.of(nums).sum();
        System.out.println("Sorted: " + Arrays.toString(nums));
        System.out.println("Sum: " + sum);
        System.out.println("Hello from CollabCode!");
    }
}
`,
  cpp: `// C++ — CollabCode
#include <iostream>
#include <vector>
#include <algorithm>
#include <numeric>
using namespace std;

int main() {
    vector<int> v = {5, 3, 1, 4, 2};
    sort(v.begin(), v.end());
    int sum = accumulate(v.begin(), v.end(), 0);
    cout << "Sorted: ";
    for (int x : v) cout << x << " ";
    cout << endl;
    cout << "Sum: " << sum << endl;
    cout << "Hello from CollabCode!" << endl;
    return 0;
}
`,
  c: `// C — CollabCode
#include <stdio.h>
#include <math.h>

int main() {
    printf("Square root of 144: %.0f\\n", sqrt(144));
    int sum = 0;
    for (int i = 1; i <= 10; i++) sum += i;
    printf("Sum 1..10: %d\\n", sum);
    for (int i = 1; i <= 5; i++) printf("%d^2 = %d\\n", i, i * i);
    printf("Hello from CollabCode!\\n");
    return 0;
}
`,
  go: `// Go — CollabCode
package main

import (
    "fmt"
    "math"
    "sort"
)

func main() {
    nums := []int{5, 3, 1, 4, 2}
    sort.Ints(nums)
    sum := 0
    for _, n := range nums { sum += n }
    fmt.Println("Sorted:", nums)
    fmt.Println("Sum:", sum)
    fmt.Printf("Pi: %.6f\\n", math.Pi)
    fmt.Println("Hello from CollabCode!")
}
`,
  rust: `// Rust — CollabCode
fn main() {
    let mut numbers = vec![5, 3, 1, 4, 2];
    numbers.sort();
    let sum: i32 = numbers.iter().sum();
    let squares: Vec<i32> = numbers.iter().map(|&x| x * x).collect();
    println!("Sorted: {:?}", numbers);
    println!("Sum: {}", sum);
    println!("Squares: {:?}", squares);
    println!("Hello from CollabCode!");
}
`,
  ruby: `# Ruby — CollabCode
numbers = [5, 3, 1, 4, 2]
puts "Sorted: #{numbers.sort}"
puts "Sum: #{numbers.sum}"
puts "Squares: #{numbers.map { |n| n ** 2 }}"
puts "Factorial of 10: #{(1..10).reduce(:*)}"
puts "Hello from CollabCode!"
`,
  php: `<?php
// PHP — CollabCode
$numbers = [5, 3, 1, 4, 2];
sort($numbers);
echo "Sorted: " . implode(", ", $numbers) . "\\n";
echo "Sum: " . array_sum($numbers) . "\\n";
echo "Date: " . date('Y-m-d H:i:s') . "\\n";
echo "PHP version: " . PHP_VERSION . "\\n";
echo "Hello from CollabCode!\\n";
`,
  perl: `#!/usr/bin/perl
# Perl — CollabCode
use strict;
use warnings;

my @nums = (1..10);
my $sum = 0;
$sum += $_ for @nums;
print "Numbers: @nums\\n";
print "Sum: $sum\\n";

my @sorted = sort { $a <=> $b } (5, 3, 1, 4, 2);
print "Sorted: @sorted\\n";
print "Hello from CollabCode!\\n";
`,
  r: `# R — CollabCode
nums <- c(5, 3, 1, 4, 2)
cat("Numbers:", nums, "\\n")
cat("Mean:", mean(nums), "\\n")
cat("Sum:", sum(nums), "\\n")
cat("Sorted:", sort(nums), "\\n")

fib <- c(1, 1)
for (i in 3:10) fib[i] <- fib[i-1] + fib[i-2]
cat("Fibonacci:", fib, "\\n")
cat("Hello from CollabCode!\\n")
`,
  bash: `#!/bin/bash
# Bash — CollabCode

echo "Hello from Bash!"
echo "Date: $(date)"

nums=(5 3 1 4 2)
echo "Numbers: \${nums[@]}"

sorted=($(echo "\${nums[@]}" | tr ' ' '\\n' | sort -n))
echo "Sorted: \${sorted[@]}"

sum=0
for n in "\${nums[@]}"; do sum=$((sum + n)); done
echo "Sum: $sum"
`,
  shell: `#!/bin/sh
# Shell (POSIX sh) — CollabCode

echo "Hello from Shell!"
echo "Current directory: $(pwd)"
echo "System info:"
uname -a
echo "Hello from CollabCode!"
`,
  awk: `# AWK — CollabCode
BEGIN {
    print "Hello from AWK!"
    print "Fibonacci sequence:"
    a = 0; b = 1
    for (i = 1; i <= 10; i++) {
        printf "%d ", b
        c = a + b; a = b; b = c
    }
    print ""
    print "Powers of 2:"
    for (i = 0; i <= 10; i++) {
        printf "2^%d = %d\\n", i, 2^i
    }
}
`,
};

const Editor = memo(function Editor({ ydoc, provider, language, theme, user, fontSize, tabSize, minimap, wordWrap }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const bindingRef = useRef(null);
  const decorationsRef = useRef([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Stable ref for the "origin" marker — we use this object identity to mark
  // transactions that originate from Monaco so the Yjs observer can skip them.
  const editorOriginRef = useRef(Symbol('monaco-editor'));

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setIsLoaded(true);

    editor.updateOptions({
      fontSize: fontSize || 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      fontLigatures: true,
      minimap: { enabled: minimap !== false, scale: 1 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'all',
      bracketPairColorization: { enabled: true },
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      formatOnPaste: true,
      wordWrap: wordWrap !== false ? 'on' : 'off',
      tabSize: tabSize || 2,
      padding: { top: 12 },
    });

    setupYjsBinding(editor, monaco);
    editor.focus();
  }, [ydoc, provider, user, language]);

  /**
   * Core Yjs <-> Monaco binding.
   * 
   * KEY INSIGHT for eliminating double-typing:
   * 
   * When Monaco content changes (user types), we:
   *   1. Wrap ytext mutations in ydoc.transact(() => {...}, editorOriginRef.current)
   *   2. This sets the "origin" of the transaction to our editor symbol
   *   3. In the ytext observer, we check if event.transaction.origin === editorOriginRef.current
   *   4. If yes, we SKIP applying changes back to Monaco (they already happened there)
   *   5. If no (remote update), we apply changes to Monaco using delta operations
   */
  function setupYjsBinding(editor, monaco) {
    if (!ydoc) return;
    const ytext = ydoc.getText('monaco');
    const ORIGIN = editorOriginRef.current;

    // Initialize with default code if empty
    if (ytext.length === 0) {
      const defaultCode = DEFAULT_CODE[language] || DEFAULT_CODE.javascript;
      ytext.insert(0, defaultCode);
    }

    // Set initial content
    const currentContent = ytext.toString();
    if (editor.getValue() !== currentContent) {
      // Use executeEdits to set content without triggering onDidChangeModelContent
      const model = editor.getModel();
      if (model) {
        model.pushEditOperations(
          [],
          [{ range: model.getFullModelRange(), text: currentContent, forceMoveMarkers: true }],
          () => null
        );
      }
    }

    // ──────────────────────────────────────────────────────────
    // Yjs -> Monaco (remote changes)
    // 
    // This observer fires for ALL ytext mutations, both local and remote.
    // We only apply changes to Monaco when they come from a remote source.
    // ──────────────────────────────────────────────────────────
    const yObserver = (event, transaction) => {
      // CRITICAL: Skip if this transaction originated from our own editor.
      // This is what prevents double-typing.
      if (transaction.origin === ORIGIN) return;

      const model = editor.getModel();
      if (!model) return;

      try {
        let index = 0;
        const ops = [];

        event.delta.forEach(delta => {
          if (delta.retain !== undefined) {
            index += delta.retain;
          } else if (delta.insert !== undefined) {
            const pos = model.getPositionAt(index);
            ops.push({
              range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
              text: delta.insert,
              forceMoveMarkers: true,
            });
            index += delta.insert.length;
          } else if (delta.delete !== undefined) {
            const startPos = model.getPositionAt(index);
            const endPos = model.getPositionAt(index + delta.delete);
            ops.push({
              range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
              text: '',
              forceMoveMarkers: true,
            });
          }
        });

        if (ops.length > 0) {
          // Use pushEditOperations to apply remote changes without triggering
          // our onDidChangeModelContent handler (because we set _isApplyingRemote)
          _isApplyingRemote = true;
          model.pushEditOperations([], ops, () => null);
          _isApplyingRemote = false;
        }
      } catch (err) {
        console.warn('[Editor] Delta apply failed, falling back to full replace:', err.message);
        _isApplyingRemote = true;
        const newContent = ytext.toString();
        const model2 = editor.getModel();
        if (model2 && model2.getValue() !== newContent) {
          const fullRange = model2.getFullModelRange();
          model2.pushEditOperations([], [{ range: fullRange, text: newContent, forceMoveMarkers: true }], () => null);
        }
        _isApplyingRemote = false;
      }
    };

    // Flag to prevent Monaco -> Yjs feedback when applying remote changes
    let _isApplyingRemote = false;

    ytext.observe(yObserver);

    // ──────────────────────────────────────────────────────────
    // Monaco -> Yjs (local changes)
    //
    // When the user types in Monaco, we convert the change events
    // to ytext operations inside a transaction with our editor origin.
    // ──────────────────────────────────────────────────────────
    const changeDisposable = editor.onDidChangeModelContent((event) => {
      // Skip if we're applying remote changes to Monaco
      if (_isApplyingRemote) return;

      // Apply changes to Yjs with our origin marker
      ydoc.transact(() => {
        // Process changes in reverse offset order to maintain correct positions
        const changes = [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
        for (const change of changes) {
          if (change.rangeLength > 0) {
            ytext.delete(change.rangeOffset, change.rangeLength);
          }
          if (change.text) {
            ytext.insert(change.rangeOffset, change.text);
          }
        }
      }, ORIGIN); // <-- This origin is checked in yObserver above
    });

    // ──────────────────────────────────────────────────────────
    // Awareness (cursor positions)
    // ──────────────────────────────────────────────────────────
    let awarenessDebounce = null;
    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      if (!provider) return;
      clearTimeout(awarenessDebounce);
      awarenessDebounce = setTimeout(() => {
        const position = e.position;
        const selection = editor.getSelection();
        provider.setAwarenessState({
          cursor: { line: position.lineNumber, column: position.column },
          selection: selection ? {
            startLine: selection.startLineNumber, startColumn: selection.startColumn,
            endLine: selection.endLineNumber, endColumn: selection.endColumn,
          } : null,
        });
      }, 50);
    });

    if (provider) {
      provider.on('awareness-change', (states) => {
        updateRemoteCursors(editor, monaco, states, user?.userId);
      });
    }

    bindingRef.current = { yObserver, changeDisposable, cursorDisposable, awarenessDebounce, ytext };
  }

  function updateRemoteCursors(editor, monaco, awarenessStates, localUserId) {
    const newDecorations = [];
    awarenessStates.forEach((state, userId) => {
      if (userId === localUserId || !state.cursor) return;
      const { cursor, selection, username, color } = state;
      const safeId = (userId || '').replace(/[^a-zA-Z0-9]/g, '');
      newDecorations.push({
        range: new monaco.Range(cursor.line, cursor.column, cursor.line, cursor.column + 1),
        options: {
          className: 'yRemoteSelectionHead',
          beforeContentClassName: `remote-cursor-${safeId}`,
          stickiness: 1,
          hoverMessage: { value: `**${username || 'Anonymous'}**` },
        },
      });
      if (selection && (selection.startLine !== selection.endLine || selection.startColumn !== selection.endColumn)) {
        newDecorations.push({
          range: new monaco.Range(selection.startLine, selection.startColumn, selection.endLine, selection.endColumn),
          options: { className: 'yRemoteSelection', stickiness: 1 },
        });
      }
    });
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
    injectCursorStyles(awarenessStates, localUserId);
  }

  function injectCursorStyles(awarenessStates, localUserId) {
    let styleEl = document.getElementById('remote-cursor-styles');
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'remote-cursor-styles'; document.head.appendChild(styleEl); }
    let css = '';
    awarenessStates.forEach((state, userId) => {
      if (userId === localUserId) return;
      const color = state.color || '#3b82f6';
      const safeId = (userId || '').replace(/[^a-zA-Z0-9]/g, '');
      const safeName = (state.username || 'Anonymous').replace(/'/g, "\\'");
      css += `.remote-cursor-${safeId}::before{content:'';position:absolute;left:0;top:0;width:2px;height:100%;background:${color};}\n`;
      css += `.remote-cursor-${safeId}::after{content:'${safeName}';position:absolute;top:-18px;left:0;font-size:10px;padding:1px 4px;border-radius:3px 3px 3px 0;background:${color};color:white;white-space:nowrap;font-family:'Inter',sans-serif;pointer-events:none;z-index:999;}\n`;
    });
    styleEl.textContent = css;
  }

  // Update editor options when extension settings change
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        fontSize: fontSize || 14,
        tabSize: tabSize || 2,
        minimap: { enabled: minimap !== false },
        wordWrap: wordWrap !== false ? 'on' : 'off',
      });
    }
  }, [fontSize, tabSize, minimap, wordWrap]);

  // Update language mode
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) monacoRef.current.editor.setModelLanguage(model, MONACO_LANGUAGES[language] || 'plaintext');
    }
  }, [language]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (bindingRef.current) {
        const { yObserver, changeDisposable, cursorDisposable, awarenessDebounce, ytext } = bindingRef.current;
        ytext.unobserve(yObserver);
        changeDisposable?.dispose();
        cursorDisposable?.dispose();
        clearTimeout(awarenessDebounce);
      }
      decorationsRef.current = [];
    };
  }, []);

  return (
    <div className="h-full w-full">
      <MonacoEditor
        height="100%"
        language={MONACO_LANGUAGES[language] || 'plaintext'}
        theme={theme || 'vs-dark'}
        onMount={handleEditorDidMount}
        loading={
          <div className="h-full flex items-center justify-center bg-[#1e1e1e]">
            <div className="text-center"><div className="spinner mx-auto mb-3" /><p className="text-gray-500 text-sm">Loading Monaco Editor...</p></div>
          </div>
        }
        options={{
          automaticLayout: true,
          fontSize: fontSize || 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          minimap: { enabled: minimap !== false },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          renderLineHighlight: 'all',
          bracketPairColorization: { enabled: true },
          wordWrap: wordWrap !== false ? 'on' : 'off',
          tabSize: tabSize || 2,
          padding: { top: 12 },
        }}
      />
    </div>
  );
});

export default Editor;
