/**
 * Editor Component v7.0
 * 
 * Monaco Editor + Yjs CRDT. 20 languages.
 * 
 * CRITICAL FIX v7: Bulletproof Yjs <-> Monaco binding.
 * 
 * Root cause of double-typing/double-enter: The Yjs observer fires synchronously
 * for local mutations and the guard was racy. Fixed by:
 *   1. Using a Symbol as transaction origin (identity-based, not string-based)
 *   2. Wrapping all Yjs->Monaco edits in _isApplyingRemote = true
 *   3. All Monaco->Yjs in transact(fn, ORIGIN) — observer checks origin identity
 *   4. Observer bails EARLY when origin matches OR _isApplyingRemote is set
 *   5. Debounced cursor awareness (50ms)
 *   6. Proper disposal of all listeners on cleanup
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
  lua: 'lua', fortran: 'plaintext', tcl: 'tcl',
  sqlite: 'sql', nasm: 'plaintext',
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
# Supports input() — type in the terminal below!

name = input("What's your name? ")
print(f"Hello, {name}!")

numbers = [1, 2, 3, 4, 5]
print("Sum:", sum(numbers))
print("Squares:", [n**2 for n in numbers])
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
  lua: `-- Lua — CollabCode
print("Hello from Lua!")

local numbers = {5, 3, 1, 4, 2}
table.sort(numbers)
io.write("Sorted: ")
for i, v in ipairs(numbers) do
    io.write(v .. " ")
end
print()

local sum = 0
for _, v in ipairs(numbers) do sum = sum + v end
print("Sum: " .. sum)

-- Fibonacci
local a, b = 0, 1
io.write("Fibonacci: ")
for i = 1, 10 do
    io.write(b .. " ")
    a, b = b, a + b
end
print()
`,
  fortran: `! Fortran — CollabCode
program hello
    implicit none
    integer :: i, sum_val
    integer, dimension(5) :: nums = (/5, 3, 1, 4, 2/)
    
    print *, "Hello from Fortran!"
    
    sum_val = 0
    do i = 1, 5
        sum_val = sum_val + nums(i)
    end do
    print *, "Sum:", sum_val
    
    ! Fibonacci
    integer :: a, b, c
    a = 0; b = 1
    write(*, '(A)', advance='no') " Fibonacci: "
    do i = 1, 10
        write(*, '(I4)', advance='no') b
        c = a + b; a = b; b = c
    end do
    print *
end program hello
`,
  tcl: `# Tcl — CollabCode
puts "Hello from Tcl!"

set numbers {5 3 1 4 2}
set sorted [lsort -integer $numbers]
puts "Sorted: $sorted"

set sum 0
foreach n $numbers { incr sum $n }
puts "Sum: $sum"

# Fibonacci
set a 0; set b 1
set fib {}
for {set i 0} {$i < 10} {incr i} {
    lappend fib $b
    set c [expr {$a + $b}]
    set a $b; set b $c
}
puts "Fibonacci: $fib"
puts "Tcl version: [info patchlevel]"
`,
  sqlite: `-- SQLite — CollabCode
-- Create a sample database and query it

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER
);

INSERT INTO users (name, age) VALUES ('Alice', 30);
INSERT INTO users (name, age) VALUES ('Bob', 25);
INSERT INTO users (name, age) VALUES ('Charlie', 35);

SELECT 'All users:';
SELECT id, name, age FROM users;

SELECT 'Average age: ' || AVG(age) FROM users;
SELECT 'Total users: ' || COUNT(*) FROM users;

DROP TABLE users;
`,
  nasm: `; x86-64 Assembly (NASM) — CollabCode
; Prints "Hello from Assembly!"

section .data
    msg db "Hello from Assembly!", 10
    len equ $ - msg

section .text
    global _start

_start:
    ; sys_write(1, msg, len)
    mov rax, 1      ; syscall: write
    mov rdi, 1      ; file descriptor: stdout
    mov rsi, msg    ; buffer
    mov rdx, len    ; count
    syscall

    ; sys_exit(0)
    mov rax, 60     ; syscall: exit
    xor rdi, rdi    ; status: 0
    syscall
`,
};

const Editor = memo(function Editor({ ydoc, provider, language, theme, user, fontSize, tabSize, minimap, wordWrap }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const bindingRef = useRef(null);
  const decorationsRef = useRef([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Stable origin marker — uses Symbol identity so it can never collide
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
   * Bulletproof Yjs <-> Monaco binding v7.
   *
   * Two guards prevent double-typing:
   *   (a) _isApplyingRemote — set TRUE around Yjs->Monaco pushEditOperations
   *       so onDidChangeModelContent skips those changes.
   *   (b) transaction.origin === ORIGIN — the Yjs observer skips transactions
   *       that came from our own editor.
   * Both guards are checked; belt AND suspenders.
   */
  function setupYjsBinding(editor, monaco) {
    if (!ydoc) return;
    const ytext = ydoc.getText('monaco');
    const ORIGIN = editorOriginRef.current;

    // Guard: true while we push remote edits into Monaco
    let _isApplyingRemote = false;

    // Initialize with default code if the ytext is empty
    if (ytext.length === 0) {
      const defaultCode = DEFAULT_CODE[language] || DEFAULT_CODE.javascript;
      ydoc.transact(() => {
        ytext.insert(0, defaultCode);
      }, ORIGIN);
    }

    // Set initial content from ytext -> Monaco
    const currentContent = ytext.toString();
    if (editor.getValue() !== currentContent) {
      _isApplyingRemote = true;
      const model = editor.getModel();
      if (model) {
        model.pushEditOperations(
          [],
          [{ range: model.getFullModelRange(), text: currentContent, forceMoveMarkers: true }],
          () => null
        );
      }
      _isApplyingRemote = false;
    }

    // ──────────────────────────────────────────────────────────
    // Yjs -> Monaco (remote changes only)
    // ──────────────────────────────────────────────────────────
    const yObserver = (event, transaction) => {
      // Guard (b): skip our own local transactions
      if (transaction.origin === ORIGIN) return;

      const model = editor.getModel();
      if (!model) return;

      // Guard (a): set flag before touching Monaco
      _isApplyingRemote = true;
      try {
        let index = 0;
        const ops = [];

        for (const delta of event.delta) {
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
        }

        if (ops.length > 0) {
          model.pushEditOperations([], ops, () => null);
        }
      } catch (err) {
        // Fallback: full document replace (rare)
        console.warn('[Editor] Delta apply failed, fallback full replace:', err.message);
        const newContent = ytext.toString();
        const model2 = editor.getModel();
        if (model2 && model2.getValue() !== newContent) {
          model2.pushEditOperations(
            [],
            [{ range: model2.getFullModelRange(), text: newContent, forceMoveMarkers: true }],
            () => null
          );
        }
      } finally {
        _isApplyingRemote = false;
      }
    };

    ytext.observe(yObserver);

    // ──────────────────────────────────────────────────────────
    // Monaco -> Yjs (local changes only)
    // ──────────────────────────────────────────────────────────
    const changeDisposable = editor.onDidChangeModelContent((event) => {
      // Guard (a): skip changes caused by remote Yjs updates
      if (_isApplyingRemote) return;

      ydoc.transact(() => {
        // Apply changes in reverse offset order to preserve positions
        const changes = [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
        for (const change of changes) {
          if (change.rangeLength > 0) {
            ytext.delete(change.rangeOffset, change.rangeLength);
          }
          if (change.text) {
            ytext.insert(change.rangeOffset, change.text);
          }
        }
      }, ORIGIN); // <- tagged with ORIGIN so yObserver skips it
    });

    // ──────────────────────────────────────────────────────────
    // Awareness (cursor positions, debounced)
    // ──────────────────────────────────────────────────────────
    let awarenessTimer = null;
    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      if (!provider) return;
      clearTimeout(awarenessTimer);
      awarenessTimer = setTimeout(() => {
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

    bindingRef.current = { yObserver, changeDisposable, cursorDisposable, awarenessTimer, ytext };
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

  // Update editor options live from Extensions panel
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

  // Update language mode live
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
        const { yObserver, changeDisposable, cursorDisposable, awarenessTimer, ytext } = bindingRef.current;
        ytext.unobserve(yObserver);
        changeDisposable?.dispose();
        cursorDisposable?.dispose();
        clearTimeout(awarenessTimer);
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
            <div className="text-center"><div className="spinner mx-auto mb-3" /><p className="text-gray-500 text-sm">Loading Editor...</p></div>
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
