import { type Mode, SoyDevState } from "./state";
import { assert, assertEqual, assertIncludes, assertNotEqual, describe, test, summary } from "./test-framework";

// ---- helpers ----

/** Create a SoyDevState pre-switched to the given mode. */
function stateInMode(mode: Mode): SoyDevState {
  const state = new SoyDevState();
  state.setMode(mode);
  state.pollModePrompt();
  return state;
}

// ---- tests ----

describe("toolIsAllowed", () => {
  describe("in Build mode", () => {
    const state = stateInMode("build");

    test("build_allows_edit_tool", () => {
      const result = state.toolIsAllowed("edit");
      assert(result.allowed, "edit should be allowed in Build mode");
      assertEqual(result.reason, undefined, "should have no reason when allowed");
    });

    test("build_allows_write_tool", () => {
      const result = state.toolIsAllowed("write");
      assert(result.allowed, "write should be allowed in Build mode");
      assertEqual(result.reason, undefined, "should have no reason when allowed");
    });

    test("build_allows_read_tool", () => {
      const result = state.toolIsAllowed("read");
      assert(result.allowed, "read should be allowed in Build mode");
      assertEqual(result.reason, undefined, "should have no reason when allowed");
    });

    test("build_allows_bash_tool", () => {
      const result = state.toolIsAllowed("bash");
      assert(result.allowed, "bash should be allowed in Build mode");
      assertEqual(result.reason, undefined, "should have no reason when allowed");
    });

    test("build_allows_unknown_tool", () => {
      const result = state.toolIsAllowed("some_future_tool");
      assert(result.allowed, "unknown tools should be allowed in Build mode");
      assertEqual(result.reason, undefined, "should have no reason when allowed");
    });
  });

  describe("in Plan mode", () => {
    const state = stateInMode("plan");

    test("plan_blocks_edit_with_reason", () => {
      const result = state.toolIsAllowed("edit");
      assert(!result.allowed, "edit should be blocked in Plan mode");
      assertNotEqual(result.reason, undefined, "reason should be defined");
      assertIncludes(result.reason!, "Edits are disabled", "reason should mention edits are disabled");
      assertIncludes(result.reason!, "Plan", "reason should mention Plan mode");
    });

    test("plan_blocks_write_with_reason", () => {
      const result = state.toolIsAllowed("write");
      assert(!result.allowed, "write should be blocked in Plan mode");
      assertNotEqual(result.reason, undefined, "reason should be defined");
      assertIncludes(result.reason!, "Edits are disabled", "reason should mention edits are disabled");
    });

    test("plan_allows_read_tool", () => {
      const result = state.toolIsAllowed("read");
      assert(result.allowed, "read should be allowed in Plan mode");
      assertEqual(result.reason, undefined, "should have no reason when allowed");
    });

    test("plan_allows_bash_tool", () => {
      const result = state.toolIsAllowed("bash");
      assert(result.allowed, "bash should be allowed in Plan mode");
      assertEqual(result.reason, undefined, "should have no reason when allowed");
    });
  });

  describe("in TDD mode", () => {
    const state = stateInMode("tdd");

    test("tdd_blocks_edit_with_reason", () => {
      const result = state.toolIsAllowed("edit");
      assert(!result.allowed, "edit should be blocked in TDD mode");
      assertNotEqual(result.reason, undefined, "reason should be defined");
      assertIncludes(result.reason!, "Edits are disabled", "reason should mention edits are disabled");
      assertIncludes(result.reason!, "TDD", "reason should mention TDD mode");
    });

    test("tdd_blocks_write_with_reason", () => {
      const result = state.toolIsAllowed("write");
      assert(!result.allowed, "write should be blocked in TDD mode");
      assertNotEqual(result.reason, undefined, "reason should be defined");
      assertIncludes(result.reason!, "Edits are disabled", "reason should mention edits are disabled");
    });

    test("tdd_allows_read_tool", () => {
      const result = state.toolIsAllowed("read");
      assert(result.allowed, "read should be allowed in TDD mode");
      assertEqual(result.reason, undefined, "should have no reason when allowed");
    });

    test("tdd_allows_bash_tool", () => {
      const result = state.toolIsAllowed("bash");
      assert(result.allowed, "bash should be allowed in TDD mode");
      assertEqual(result.reason, undefined, "should have no reason when allowed");
    });
  });

  // -- QA mode --
  describe("in QA mode", () => {
    const state = stateInMode("qa");

    test("qa_blocks_edit_with_reason", () => {
      const result = state.toolIsAllowed("edit");
      assert(!result.allowed, "edit should be blocked in QA mode");
      assertNotEqual(result.reason, undefined, "reason should be defined");
      assertIncludes(result.reason!, "Edits are disabled", "reason should mention edits are disabled");
      assertIncludes(result.reason!, "Q&A", "reason should mention QA mode");
    });

    test("qa_blocks_write_with_reason", () => {
      const result = state.toolIsAllowed("write");
      assert(!result.allowed, "write should be blocked in QA mode");
      assertNotEqual(result.reason, undefined, "reason should be defined");
      assertIncludes(result.reason!, "Edits are disabled", "reason should mention edits are disabled");
    });

    test("qa_allows_read_tool", () => {
      const result = state.toolIsAllowed("read");
      assert(result.allowed, "read should be allowed in QA mode");
      assertEqual(result.reason, undefined, "should have no reason when allowed");
    });

    test("qa_allows_bash_tool", () => {
      const result = state.toolIsAllowed("bash");
      assert(result.allowed, "bash should be allowed in QA mode");
      assertEqual(result.reason, undefined, "should have no reason when allowed");
    });
  });

  describe("in QQ mode", () => {
    const state = stateInMode("qq");

    test("qq_blocks_edit_with_reason", () => {
      const result = state.toolIsAllowed("edit");
      assert(!result.allowed, "edit should be blocked in QQ mode");
      assertNotEqual(result.reason, undefined, "reason should be defined");
      assertIncludes(result.reason!, "All tools are disabled", "reason should mention all tools are disabled");
      assertIncludes(result.reason!, "QQ", "reason should mention QQ mode");
    });

    test("qq_blocks_write_with_reason", () => {
      const result = state.toolIsAllowed("write");
      assert(!result.allowed, "write should be blocked in QQ mode");
      assertNotEqual(result.reason, undefined, "reason should be defined");
      assertIncludes(result.reason!, "All tools are disabled", "reason should mention all tools are disabled");
    });

    test("qq_blocks_read_with_reason", () => {
      const result = state.toolIsAllowed("read");
      assert(!result.allowed, "read should be blocked in QQ mode");
      assertNotEqual(result.reason, undefined, "reason should be defined");
      assertIncludes(result.reason!, "All tools are disabled", "reason should mention all tools are disabled");
    });

    test("qq_blocks_bash_with_reason", () => {
      const result = state.toolIsAllowed("bash");
      assert(!result.allowed, "bash should be blocked in QQ mode");
      assertNotEqual(result.reason, undefined, "reason should be defined");
      assertIncludes(result.reason!, "All tools are disabled", "reason should mention all tools are disabled");
    });

    test("qq_blocks_unknown_tool_with_reason", () => {
      const result = state.toolIsAllowed("some_future_tool");
      assert(!result.allowed, "unknown tools should be blocked in QQ mode");
      assertNotEqual(result.reason, undefined, "reason should be defined");
      assertIncludes(result.reason!, "All tools are disabled", "reason should mention all tools are disabled");
    });
  });

  describe("edge cases", () => {
    test("plan_allows_tool_differing_only_in_case_Edit", () => {
      const state = stateInMode("plan");
      const result = state.toolIsAllowed("Edit");
      assert(result.allowed, '"Edit" (capital E) should be allowed — comparison is case-sensitive');
    });

    test("plan_allows_empty_string_tool_name", () => {
      const state = stateInMode("plan");
      const result = state.toolIsAllowed("");
      assert(result.allowed, "empty string should be allowed — it matches neither edit nor write");
    });
  });
});

summary();
