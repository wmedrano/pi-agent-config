// ---- minimal test framework with grouping ----

// === ANSI colors ===
const RESET = "\x1b[0m";
const BOLD  = "\x1b[1m";
const RED   = "\x1b[31m";
const GREEN = "\x1b[32m";

// === Internal data structures ===

interface TestResult {
  passed: number;
  failed: number;
  failures: string[];
}

function createResult(): TestResult {
  return { passed: 0, failed: 0, failures: [] };
}

class Suite {
  name: string;
  parent: Suite | null;
  children: (Suite | TestCase)[];
  result: TestResult;

  constructor(name: string, parent: Suite | null) {
    this.name = name;
    this.parent = parent;
    this.children = [];
    this.result = createResult();
  }
}

class TestCase {
  name: string;
  fn: () => void | Promise<void>;
  parent: Suite;
  result: TestResult;

  constructor(name: string, fn: () => void | Promise<void>, parent: Suite) {
    this.name = name;
    this.fn = fn;
    this.parent = parent;
    this.result = createResult();
  }
}

// === Module state ===

const rootSuite = new Suite("", null);
let currentSuite: Suite = rootSuite;
let currentTest: TestCase | null = null;
let isExecuting = false;

// === Public API ===

/** Register a group of tests. Calls `fn` immediately to collect child tests/groups. */
export function describe(name: string, fn: () => void): void {
  if (isExecuting) {
    throw new Error("Cannot call describe() while tests are running");
  }
  const suite = new Suite(name, currentSuite);
  currentSuite.children.push(suite);
  const prev = currentSuite;
  currentSuite = suite;
  try {
    fn();
  } finally {
    currentSuite = prev;
  }
}

/** Register a test case. `fn` is *not* executed until {@link run} is called. */
export function test(name: string, fn: () => void | Promise<void>): void {
  if (isExecuting) {
    throw new Error("Cannot call test() while tests are running");
  }
  const tc = new TestCase(name, fn, currentSuite);
  currentSuite.children.push(tc);
}

/** Record a pass or failure on the currently executing test. */
export function assert(condition: boolean, msg: string): void {
  if (!currentTest) {
    throw new Error("assert() called outside of a running test");
  }
  if (condition) {
    currentTest.result.passed++;
  } else {
    currentTest.result.failed++;
    currentTest.result.failures.push(`FAIL: ${msg}`);
  }
}

function format(val: unknown): string {
  if (typeof val === "string") return JSON.stringify(val);
  if (typeof val === "number" || typeof val === "boolean" || val === null || val === undefined) {
    return String(val);
  }
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

/** Assert strict equality (===) with a diff on failure. */
export function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (!currentTest) {
    throw new Error("assertEqual() called outside of a running test");
  }
  if (actual === expected) {
    currentTest.result.passed++;
  } else {
    currentTest.result.failed++;
    currentTest.result.failures.push(
      `FAIL: ${msg} — expected ${format(expected)}, got ${format(actual)}`
    );
  }
}

/** Assert strict inequality (!==) with values on failure. */
export function assertNotEqual<T>(actual: T, expected: T, msg: string): void {
  if (!currentTest) {
    throw new Error("assertNotEqual() called outside of a running test");
  }
  if (actual !== expected) {
    currentTest.result.passed++;
  } else {
    currentTest.result.failed++;
    currentTest.result.failures.push(
      `FAIL: ${msg} — both are ${format(actual)}`
    );
  }
}

/** Assert that `needle` is a substring of `haystack`. */
export function assertIncludes(haystack: string, needle: string, msg: string): void {
  if (!currentTest) {
    throw new Error("assertIncludes() called outside of a running test");
  }
  if (haystack.includes(needle)) {
    currentTest.result.passed++;
  } else {
    currentTest.result.failed++;
    currentTest.result.failures.push(
      `FAIL: ${msg} — expected string to include ${format(needle)}, got ${format(haystack)}`
    );
  }
}

/**
 * Execute all registered tests, print hierarchical results, and return
 * `true` when every test passes.
 */
export async function run(): Promise<boolean> {
  isExecuting = true;
  try {
    resetResults(rootSuite);
    await runSuite(rootSuite);
  } finally {
    isExecuting = false;
  }

  printSuite(rootSuite, "");
  const stats = countTests(rootSuite);
  const suiteWord = stats.suites === 1 ? "suite" : "suites";
  const passStr = `${GREEN}${stats.passed}/${stats.total}${RESET}`;
  const failStr = stats.failed > 0 ? `, ${RED}${stats.failed} failed${RESET}` : "";
  console.log(`\n${stats.suites} ${suiteWord}, ${passStr} tests passed${failStr}`);

  return stats.failed === 0;
}

/**
 * Convenience wrapper around {@link run} that also calls `process.exit(1)`
 * when any test fails. Kept for backward compatibility.
 */
export async function summary(): Promise<void> {
  const ok = await run();
  if (!ok) process.exit(1);
}

// === Internal helpers ===

function resetResults(suite: Suite): void {
  suite.result = createResult();
  for (const child of suite.children) {
    if (child instanceof Suite) {
      resetResults(child);
    } else {
      child.result = createResult();
    }
  }
}

async function runSuite(suite: Suite): Promise<void> {
  for (const child of suite.children) {
    if (child instanceof Suite) {
      await runSuite(child);
    } else {
      await runTest(child);
    }
    // Aggregate child results into parent suite
    suite.result.passed += child.result.passed;
    suite.result.failed += child.result.failed;
    suite.result.failures.push(...child.result.failures);
  }
}

async function runTest(tc: TestCase): Promise<void> {
  currentTest = tc;
  try {
    await tc.fn();
  } catch (e) {
    tc.result.failed++;
    tc.result.failures.push(`FAIL: ${tc.name} — ${e}`);
  } finally {
    currentTest = null;
  }
}

function printSuite(suite: Suite, indent: string): void {
  if (suite.name) {
    console.log(`${indent}${BOLD}Suite: ${suite.name}${RESET}`);
  }
  const childIndent = suite.name ? indent + "  " : indent;

  for (const child of suite.children) {
    if (child instanceof Suite) {
      printSuite(child, childIndent);
    } else {
      printTest(child, childIndent);
    }
  }
}

function printTest(tc: TestCase, indent: string): void {
  if (tc.result.failed === 0) {
    console.log(`${indent}${GREEN}✓${RESET} ${tc.name}`);
  } else {
    console.log(`${indent}${RED}✗${RESET} ${tc.name}`);
    for (const f of tc.result.failures) {
      console.log(`${indent}  ${RED}${f}${RESET}`);
    }
  }
}

interface CountStats {
  suites: number;
  passed: number;
  failed: number;
  total: number;
}

function countTests(suite: Suite): CountStats {
  let suites = suite.name ? 1 : 0;
  let passed = 0;
  let failed = 0;

  for (const child of suite.children) {
    if (child instanceof Suite) {
      const sub = countTests(child);
      suites += sub.suites;
      passed += sub.passed;
      failed += sub.failed;
    } else {
      if (child.result.failed === 0) {
        passed++;
      } else {
        failed++;
      }
    }
  }

  return { suites, passed, failed, total: passed + failed };
}
