/**
 * Test All 20 Languages against Execution Controller v10.0
 */

const { executeCode, LANGUAGES } = require('./controllers/executionController');

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

  return {
    req,
    res,
    getData: () => resData,
    getStatusCode: () => resStatusCode,
  };
}

const SNIPPETS = {
  javascript: 'console.log("Hello JS!");',
  typescript: 'const x: number = 42; console.log("Hello TS:", x);',
  python: 'print("Hello Python!")',
  java: 'public class Main { public static void main(String[] args) { System.out.println("Hello Java!"); } }',
  c: '#include <stdio.h>\nint main(){ printf("Hello C!\\n"); return 0; }',
  cpp: '#include <iostream>\nint main(){ std::cout << "Hello C++!" << std::endl; return 0; }',
  go: 'package main\nimport "fmt"\nfunc main(){ fmt.Println("Hello Go!") }',
  rust: 'fn main(){ println!("Hello Rust!"); }',
  ruby: 'puts "Hello Ruby!"',
  php: '<?php echo "Hello PHP!\n";',
  perl: 'print "Hello Perl!\n";',
  r: 'cat("Hello R!\n")',
  bash: 'echo "Hello Bash!"',
  shell: 'echo "Hello Shell!"',
  awk: 'BEGIN { print "Hello AWK!" }',
  lua: 'print("Hello Lua!")',
  fortran: 'program hello\n    implicit none\n    print *, "Hello Fortran!"\nend program hello',
  tcl: 'puts "Hello Tcl!"',
  sqlite: 'SELECT "Hello SQLite!";',
  nasm: `section .data\n    msg db "Hello NASM!", 10\n    len equ $ - msg\nsection .text\n    global _start\n_start:\n    mov rax, 1\n    mov rdi, 1\n    mov rsi, msg\n    mov rdx, len\n    syscall\n    mov rax, 60\n    xor rdi, rdi\n    syscall\n`,
};

async function main() {
  console.log('Testing all 20 languages...\n');
  const allLangs = Object.keys(LANGUAGES);
  let passed = 0;
  let failed = 0;

  for (const lang of allLangs) {
    const code = SNIPPETS[lang];
    if (!code) {
      console.warn(`[SKIP] No snippet for ${lang}`);
      continue;
    }

    const { req, res, getData, getStatusCode } = createMockReqRes({ code, language: lang });
    try {
      await executeCode(req, res);
      const data = getData();
      if (data?.success) {
        passed++;
        console.log(`[PASS] ${lang.padEnd(12)} -> (${data.engine}) [${data.executionTime}] Output: ${data.output.trim().replace(/\n/g, ' ')}`);
      } else {
        failed++;
        console.error(`[FAIL] ${lang.padEnd(12)} -> Status: ${getStatusCode()}, Error: ${data?.error || data?.message}`);
      }
    } catch (err) {
      failed++;
      console.error(`[EXCP] ${lang.padEnd(12)} -> ${err.message}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`TOTAL: ${allLangs.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`========================================`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
