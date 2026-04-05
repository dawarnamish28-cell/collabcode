/**
 * Editor Component
 * 
 * Monaco Editor integrated with Yjs CRDT for real-time collaboration.
 * Features:
 * - Multi-user concurrent editing via Yjs
 * - Remote cursor/selection awareness
 * - Language-aware syntax highlighting
 * - VS Code-like keyboard shortcuts
 * - Change listener for awareness broadcasting
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import MonacoEditor from '@monaco-editor/react';

// Language to Monaco language ID mapping
const MONACO_LANGUAGES = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  go: 'go',
  rust: 'rust',
  ruby: 'ruby',
  php: 'php',
};

// Default code templates per language
const DEFAULT_CODE = {
  javascript: `// Welcome to CollabCode!
// Start coding together in real-time

function greet(name) {
  return \`Hello, \${name}! Welcome to CollabCode.\`;
}

console.log(greet("World"));
`,
  typescript: `// TypeScript - CollabCode
interface User {
  name: string;
  role: string;
}

function greet(user: User): string {
  return \`Hello, \${user.name}! You are a \${user.role}.\`;
}

console.log(greet({ name: "World", role: "Developer" }));
`,
  python: `# Python - CollabCode
# Start coding together in real-time

def greet(name: str) -> str:
    return f"Hello, {name}! Welcome to CollabCode."

print(greet("World"))
`,
  java: `// Java - CollabCode
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World! Welcome to CollabCode.");
    }
}
`,
  cpp: `// C++ - CollabCode
#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World! Welcome to CollabCode." << endl;
    return 0;
}
`,
  c: `// C - CollabCode
#include <stdio.h>

int main() {
    printf("Hello, World! Welcome to CollabCode.\\n");
    return 0;
}
`,
  go: `// Go - CollabCode
package main

import "fmt"

func main() {
    fmt.Println("Hello, World! Welcome to CollabCode.")
}
`,
  rust: `// Rust - CollabCode
fn main() {
    println!("Hello, World! Welcome to CollabCode.");
}
`,
  ruby: `# Ruby - CollabCode

def greet(name)
  "Hello, #{name}! Welcome to CollabCode."
end

puts greet("World")
`,
  php: `<?php
// PHP - CollabCode

function greet($name) {
    return "Hello, $name! Welcome to CollabCode.";
}

echo greet("World") . "\\n";
`,
};

const Editor = memo(function Editor({ ydoc, provider, language, theme, user }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const bindingRef = useRef(null);
  const decorationsRef = useRef([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // ─── Monaco Editor Mount Handler ──────────────────────────────
  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setIsLoaded(true);

    // Configure editor defaults
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

    // Bind Yjs to Monaco
    bindYjsToMonaco(editor, monaco);

    // Focus editor
    editor.focus();
  }, [ydoc, provider, user, language]);

  // ─── Yjs <-> Monaco Binding ───────────────────────────────────
  function bindYjsToMonaco(editor, monaco) {
    if (!ydoc) return;

    const ytext = ydoc.getText('monaco');

    // If document is empty and we're the first one, set default code
    if (ytext.length === 0) {
      const defaultCode = DEFAULT_CODE[language] || DEFAULT_CODE.javascript;
      ytext.insert(0, defaultCode);
    }

    // Set initial content in editor
    const currentContent = ytext.toString();
    if (editor.getValue() !== currentContent) {
      editor.setValue(currentContent);
    }

    // Yjs -> Monaco: Apply remote changes
    let isApplyingRemote = false;

    const yObserver = (event) => {
      if (isApplyingRemote) return;
      isApplyingRemote = true;

      const model = editor.getModel();
      if (!model) { isApplyingRemote = false; return; }

      // Rebuild the editor content from Yjs
      const newContent = ytext.toString();
      const currentValue = model.getValue();

      if (newContent !== currentValue) {
        // Calculate minimal edits
        const edits = computeEdits(currentValue, newContent, model);
        if (edits.length > 0) {
          model.pushEditOperations([], edits, () => null);
        }
      }

      isApplyingRemote = false;
    };

    ytext.observe(yObserver);

    // Monaco -> Yjs: Send local changes
    const changeDisposable = editor.onDidChangeModelContent((event) => {
      if (isApplyingRemote) return;

      ydoc.transact(() => {
        // Sort changes in reverse order to apply from end to start
        const changes = [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
        for (const change of changes) {
          if (change.rangeLength > 0) {
            ytext.delete(change.rangeOffset, change.rangeLength);
          }
          if (change.text) {
            ytext.insert(change.rangeOffset, change.text);
          }
        }
      }, editor);
    });

    // Awareness: Track cursor position changes
    let awarenessDebounce = null;
    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      if (!provider) return;
      clearTimeout(awarenessDebounce);
      awarenessDebounce = setTimeout(() => {
        const position = e.position;
        const selection = editor.getSelection();
        provider.setAwarenessState({
          cursor: {
            line: position.lineNumber,
            column: position.column,
          },
          selection: selection ? {
            startLine: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLine: selection.endLineNumber,
            endColumn: selection.endColumn,
          } : null,
        });
      }, 50); // Debounce awareness updates
    });

    // Remote cursor decorations
    if (provider) {
      provider.on('awareness-change', (states) => {
        updateRemoteCursors(editor, monaco, states, user?.userId);
      });
    }

    // Store binding ref for cleanup
    bindingRef.current = {
      yObserver,
      changeDisposable,
      cursorDisposable,
      awarenessDebounce,
      ytext,
    };
  }

  // ─── Compute Minimal Edits ────────────────────────────────────
  function computeEdits(oldContent, newContent, model) {
    // Simple approach: full replacement when content differs
    // In production, you'd use a diff algorithm
    const fullRange = model.getFullModelRange();
    return [{
      range: fullRange,
      text: newContent,
      forceMoveMarkers: true,
    }];
  }

  // ─── Remote Cursor Rendering ──────────────────────────────────
  function updateRemoteCursors(editor, monaco, awarenessStates, localUserId) {
    const newDecorations = [];

    awarenessStates.forEach((state, userId) => {
      if (userId === localUserId) return;
      if (!state.cursor) return;

      const { cursor, selection, username, color } = state;

      // Cursor line decoration
      newDecorations.push({
        range: new monaco.Range(
          cursor.line, cursor.column,
          cursor.line, cursor.column + 1
        ),
        options: {
          className: `yRemoteSelectionHead`,
          beforeContentClassName: `remote-cursor-${userId}`,
          stickiness: 1,
          hoverMessage: { value: `**${username || 'Anonymous'}**` },
        },
      });

      // Selection highlight
      if (selection && (selection.startLine !== selection.endLine || selection.startColumn !== selection.endColumn)) {
        newDecorations.push({
          range: new monaco.Range(
            selection.startLine, selection.startColumn,
            selection.endLine, selection.endColumn
          ),
          options: {
            className: 'yRemoteSelection',
            stickiness: 1,
          },
        });
      }
    });

    // Apply decorations
    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );

    // Inject dynamic cursor styles
    injectCursorStyles(awarenessStates, localUserId);
  }

  // ─── Dynamic Cursor Color Styles ──────────────────────────────
  function injectCursorStyles(awarenessStates, localUserId) {
    let styleEl = document.getElementById('remote-cursor-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'remote-cursor-styles';
      document.head.appendChild(styleEl);
    }

    let css = '';
    awarenessStates.forEach((state, userId) => {
      if (userId === localUserId) return;
      const color = state.color || '#3b82f6';
      css += `
        .remote-cursor-${userId}::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          width: 2px;
          height: 100%;
          background: ${color};
        }
        .remote-cursor-${userId}::after {
          content: '${state.username || 'Anonymous'}';
          position: absolute;
          top: -18px;
          left: 0;
          font-size: 10px;
          padding: 1px 4px;
          border-radius: 3px 3px 3px 0;
          background: ${color};
          color: white;
          white-space: nowrap;
          font-family: 'Inter', sans-serif;
          pointer-events: none;
          z-index: 999;
        }
      `;
    });
    styleEl.textContent = css;
  }

  // ─── Language Change Effect ───────────────────────────────────
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        monacoRef.current.editor.setModelLanguage(model, MONACO_LANGUAGES[language] || 'plaintext');
      }
    }
  }, [language]);

  // ─── Cleanup ──────────────────────────────────────────────────
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

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="h-full w-full">
      <MonacoEditor
        height="100%"
        language={MONACO_LANGUAGES[language] || 'plaintext'}
        theme={theme || 'vs-dark'}
        onMount={handleEditorDidMount}
        loading={
          <div className="h-full flex items-center justify-center bg-[#1e1e1e]">
            <div className="text-center">
              <div className="spinner mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Loading Monaco Editor...</p>
            </div>
          </div>
        }
        options={{
          automaticLayout: true,
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          renderLineHighlight: 'all',
          bracketPairColorization: { enabled: true },
          wordWrap: 'on',
          padding: { top: 12 },
        }}
      />
    </div>
  );
});

export default Editor;
