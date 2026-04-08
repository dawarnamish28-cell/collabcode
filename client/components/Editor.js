/**
 * Editor Component v3.0
 * 
 * Monaco Editor integrated with Yjs CRDT for real-time collaboration.
 * 
 * Improvements:
 * - Better default templates that work out of the box (no input() in defaults)
 * - Smoother Yjs binding with proper origin tracking
 * - Improved remote cursor decorations
 * - Language change preserves cursor position
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import MonacoEditor from '@monaco-editor/react';

const MONACO_LANGUAGES = {
  javascript: 'javascript', typescript: 'typescript', python: 'python',
  java: 'java', cpp: 'cpp', c: 'c', go: 'go', rust: 'rust', ruby: 'ruby', php: 'php',
};

// Default code templates — work WITHOUT stdin so "Run" always succeeds on first try
const DEFAULT_CODE = {
  javascript: `// JavaScript — CollabCode
// All standard libraries: readline, crypto, path, etc.
// For interactive input: use the "Input" tab below

const numbers = [1, 2, 3, 4, 5];
const sum = numbers.reduce((a, b) => a + b, 0);
const squares = numbers.map(n => n * n);

console.log("Numbers:", numbers);
console.log("Sum:", sum);
console.log("Squares:", squares);
console.log("Hello from CollabCode! 🚀");
`,
  typescript: `// TypeScript — CollabCode
// Full TypeScript support via tsx

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
console.log("TypeScript running on CollabCode! 🚀");
`,
  python: `# Python — CollabCode
# All standard libraries: math, json, os, collections, etc.
# 
# ✨ TIP: To use input(), switch to the "Input" tab below
#    and type your values there before clicking "Run with Input"

import math
from collections import Counter

# Demo without input (just press Ctrl+Enter)
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
print("Numbers:", numbers)
print("Sum:", sum(numbers))
print("Average:", sum(numbers) / len(numbers))
print("Pi:", round(math.pi, 6))
print("Factorial of 10:", math.factorial(10))
print()
print("Hello from CollabCode! 🚀")

# Uncomment below and use the Input tab to provide stdin:
# name = input("Enter your name: ")
# print(f"Hello, {name}!")
`,
  java: `// Java — CollabCode
// Full JDK: Scanner, Arrays, Collections, etc.
// For Scanner input: use the "Input" tab below

import java.util.Arrays;
import java.util.stream.IntStream;

public class Main {
    public static void main(String[] args) {
        int[] nums = {5, 3, 1, 4, 2};
        Arrays.sort(nums);
        
        int sum = IntStream.of(nums).sum();
        
        System.out.println("Sorted: " + Arrays.toString(nums));
        System.out.println("Sum: " + sum);
        System.out.println("Hello from CollabCode! 🚀");
    }
}
`,
  cpp: `// C++ — CollabCode
// Full STL: iostream, vector, algorithm, string, etc.
// For cin input: use the "Input" tab below

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
    cout << "Hello from CollabCode! 🚀" << endl;
    return 0;
}
`,
  c: `// C — CollabCode
// Full standard library: stdio, math, string, stdlib
// For scanf input: use the "Input" tab below

#include <stdio.h>
#include <math.h>

int main() {
    printf("Square root of 144: %.0f\\n", sqrt(144));
    
    int sum = 0;
    for (int i = 1; i <= 10; i++) {
        sum += i;
    }
    printf("Sum 1..10: %d\\n", sum);
    
    for (int i = 1; i <= 5; i++) {
        printf("%d^2 = %d\\n", i, i * i);
    }
    printf("Hello from CollabCode! 🚀\\n");
    return 0;
}
`,
  go: `// Go — CollabCode
// Full standard library: fmt, math, sort, strings
// For Scan input: use the "Input" tab below

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
    for _, n := range nums {
        sum += n
    }
    
    fmt.Println("Sorted:", nums)
    fmt.Println("Sum:", sum)
    fmt.Printf("Pi: %.6f\\n", math.Pi)
    fmt.Println("Hello from CollabCode! 🚀")
}
`,
  rust: `// Rust — CollabCode
// std library: io, collections, iter
// For stdin input: use the "Input" tab below

fn main() {
    let mut numbers = vec![5, 3, 1, 4, 2];
    numbers.sort();
    
    let sum: i32 = numbers.iter().sum();
    let squares: Vec<i32> = numbers.iter().map(|&x| x * x).collect();
    
    println!("Sorted: {:?}", numbers);
    println!("Sum: {}", sum);
    println!("Squares: {:?}", squares);
    println!("Hello from CollabCode! 🚀");
}
`,
  ruby: `# Ruby — CollabCode
# Full standard library: Comparable, Enumerable, Math
# For gets input: use the "Input" tab below

numbers = [5, 3, 1, 4, 2]
puts "Sorted: #{numbers.sort}"
puts "Sum: #{numbers.sum}"
puts "Squares: #{numbers.map { |n| n ** 2 }}"
puts "Factorial of 10: #{(1..10).reduce(:*)}"
puts "Hello from CollabCode! 🚀"
`,
  php: `<?php
// PHP — CollabCode
// Full standard library: array functions, math, date
// For fgets(STDIN) input: use the "Input" tab below

$numbers = [5, 3, 1, 4, 2];
sort($numbers);

echo "Sorted: " . implode(", ", $numbers) . "\\n";
echo "Sum: " . array_sum($numbers) . "\\n";
echo "Date: " . date('Y-m-d H:i:s') . "\\n";
echo "PHP version: " . PHP_VERSION . "\\n";
echo "Hello from CollabCode! 🚀\\n";
`,
};

const Editor = memo(function Editor({ ydoc, provider, language, theme, user }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const bindingRef = useRef(null);
  const decorationsRef = useRef([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setIsLoaded(true);

    editor.updateOptions({
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      fontLigatures: true,
      minimap: { enabled: true, scale: 1 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'all',
      bracketPairColorization: { enabled: true },
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      formatOnPaste: true,
      wordWrap: 'on',
      tabSize: 2,
      padding: { top: 12 },
    });

    bindYjsToMonaco(editor, monaco);
    editor.focus();
  }, [ydoc, provider, user, language]);

  function bindYjsToMonaco(editor, monaco) {
    if (!ydoc) return;
    const ytext = ydoc.getText('monaco');

    if (ytext.length === 0) {
      const defaultCode = DEFAULT_CODE[language] || DEFAULT_CODE.javascript;
      ytext.insert(0, defaultCode);
    }

    const currentContent = ytext.toString();
    if (editor.getValue() !== currentContent) {
      editor.setValue(currentContent);
    }

    let isApplyingRemote = false;

    const yObserver = () => {
      if (isApplyingRemote) return;
      isApplyingRemote = true;
      const model = editor.getModel();
      if (!model) { isApplyingRemote = false; return; }
      const newContent = ytext.toString();
      const currentValue = model.getValue();
      if (newContent !== currentValue) {
        const fullRange = model.getFullModelRange();
        model.pushEditOperations([], [{ range: fullRange, text: newContent, forceMoveMarkers: true }], () => null);
      }
      isApplyingRemote = false;
    };
    ytext.observe(yObserver);

    const changeDisposable = editor.onDidChangeModelContent((event) => {
      if (isApplyingRemote) return;
      ydoc.transact(() => {
        const changes = [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
        for (const change of changes) {
          if (change.rangeLength > 0) ytext.delete(change.rangeOffset, change.rangeLength);
          if (change.text) ytext.insert(change.rangeOffset, change.text);
        }
      }, editor);
    });

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

  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) monacoRef.current.editor.setModelLanguage(model, MONACO_LANGUAGES[language] || 'plaintext');
    }
  }, [language]);

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
          automaticLayout: true, fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          minimap: { enabled: true }, scrollBeyondLastLine: false,
          smoothScrolling: true, cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on', renderLineHighlight: 'all',
          bracketPairColorization: { enabled: true }, wordWrap: 'on', padding: { top: 12 },
        }}
      />
    </div>
  );
});

export default Editor;
