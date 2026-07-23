import { type Mode, SoyDevState } from "./state";
import { assert, assertEqual, assertIncludes, assertNotEqual, describe, test, summary } from "./test-framework";

// ---- helpers ----

/** Create a SoyDevState pre-switched to the given mode. */
function stateInMode(mode: Mode): SoyDevState {
  const state = new SoyDevState();
  state.setNextMode(mode);
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

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("autoplan pending flag", () => {
  test("defaults_to_not_pending", () => {
    const state = new SoyDevState();
    assert(!state.isAutoplanPending(), "autoplan should not be pending by default");
  });

  test("setAutoplanPending_arms_and_disarms", () => {
    const state = new SoyDevState();
    state.setAutoplanPending(true);
    assert(state.isAutoplanPending(), "flag should be armed after set(true)");
    state.setAutoplanPending(false);
    assert(!state.isAutoplanPending(), "flag should be disarmed after set(false)");
  });

  test("flag_survives_mode_transitions", () => {
    const state = new SoyDevState();
    state.setAutoplanPending(true);
    state.setNextMode("plan");
    state.deliverMode("plan");
    state.setNextMode("build");
    assert(state.isAutoplanPending(), "mode transitions should not clear the autoplan flag");
  });
});

describe("pending mode status", () => {
  // Queue plan → build → qq (starting from the default Build mode).
  function queuedState(): SoyDevState {
    const state = new SoyDevState();
    state.setNextMode("plan");
    state.setNextMode("build");
    state.setNextMode("qq");
    return state;
  }

  test("setNextMode_records_pending_modes_in_order", () => {
    const state = queuedState();
    assertEqual(state.pendingModes().join(","), "plan,build,qq", "pending modes tracked in delivery order");
  });

  test("intermediateModes_excludes_tail", () => {
    const state = queuedState();
    assertEqual(state.intermediateModes().join(","), "plan,build", "intermediate modes are everything except the tail");
  });

  test("next_mode_is_the_queued_tail", () => {
    const state = queuedState();
    assertEqual(stripAnsi(state.status([])), "⏹ QQ", "next mode advances to the last queued mode");
  });

  test("status_renders_full_pending_chain", () => {
    const state = queuedState();
    assertIncludes(
      stripAnsi(state.status(state.intermediateModes())),
      "⏸ Plan -> ⏭ Build -> ⏹ QQ",
      "three pending modes render as a chain",
    );
  });

  test("deliverMode_plan_advances_to_build_qq", () => {
    const state = queuedState();
    state.deliverMode("plan");
    assertEqual(state.pendingModes().join(","), "build,qq", "front mode drained");
    assertEqual(state.intermediateModes().join(","), "build", "intermediate advances");
    assertIncludes(
      stripAnsi(state.status(state.intermediateModes())),
      "⏭ Build -> ⏹ QQ",
      "status reflects remaining pending chain",
    );
  });

  test("deliverMode_build_advances_to_qq", () => {
    const state = queuedState();
    state.deliverMode("plan");
    state.deliverMode("build");
    assertEqual(state.pendingModes().join(","), "qq", "only tail remains");
    assertEqual(state.intermediateModes().length, 0, "no intermediate once single pending");
    assertEqual(stripAnsi(state.status([])), "⏹ QQ", "next mode stays at tail");
  });

  test("deliverMode_qq_drains_queue_but_keeps_next_mode", () => {
    const state = queuedState();
    state.deliverMode("plan");
    state.deliverMode("build");
    state.deliverMode("qq");
    assertEqual(state.pendingModes().length, 0, "queue fully drained");
    assertEqual(state.intermediateModes().length, 0, "no intermediate once drained");
    assertEqual(stripAnsi(state.status([])), "⏹ QQ", "next mode persists as active display");
  });

  test("deliverMode_noop_on_empty_queue", () => {
    const state = new SoyDevState();
    state.deliverMode("plan");
    state.deliverMode();
    assertEqual(state.pendingModes().length, 0, "empty queue stays empty");
  });

  test("deliverMode_without_arg_removes_front", () => {
    const state = new SoyDevState();
    state.setNextMode("plan");
    state.setNextMode("build");
    state.deliverMode();
    assertEqual(state.pendingModes().join(","), "build", "front removed by default");
    assertEqual(state.intermediateModes().length, 0, "single pending has no intermediate");
    assertIncludes(stripAnsi(state.status(state.intermediateModes())), "⏭ Build", "status shows remaining mode");
  });

  test("single_pending_shows_only_that_mode", () => {
    const state = new SoyDevState();
    state.setNextMode("plan");
    assertEqual(state.pendingModes().join(","), "plan", "single pending mode tracked");
    assertEqual(state.intermediateModes().length, 0, "tail excluded when single pending");
    assertEqual(stripAnsi(state.status(state.intermediateModes())), "⏸ Plan", "single pending renders as the mode itself");
    state.deliverMode("plan");
    assertEqual(state.pendingModes().length, 0, "drained after delivery");
    assertEqual(stripAnsi(state.status([])), "⏸ Plan", "mode persists as active after delivery");
  });

  test("setNextMode_same_mode_does_not_queue", () => {
    const state = new SoyDevState();
    state.setNextMode("plan");
    assert(state.setNextMode("plan") === null, "re-queuing the current mode is a no-op (returns null)");
    assertEqual(state.pendingModes().join(","), "plan", "duplicate mode not queued");
  });

  test("deliverMode_matches_front_most_mode_FIFO", () => {
    const state = new SoyDevState();
    state.setNextMode("plan");
    state.setNextMode("build");
    state.setNextMode("plan");
    assertEqual(state.pendingModes().join(","), "plan,build,plan", "non-consecutive re-queue appends");
    assertEqual(state.intermediateModes().join(","), "plan,build", "intermediate excludes tail (plan)");
    // first delivery removes the FRONT plan, not the tail
    state.deliverMode("plan");
    assertEqual(state.pendingModes().join(","), "build,plan", "front-most matching mode removed (FIFO)");
    assertEqual(state.intermediateModes().join(","), "build", "intermediate advances past first plan");
    state.deliverMode("build");
    assertEqual(state.pendingModes().join(","), "plan", "build drained");
    state.deliverMode("plan");
    assertEqual(state.pendingModes().length, 0, "final plan drained");
    assertEqual(stripAnsi(state.status([])), "⏸ Plan", "tail plan persists as active");
  });
});

summary();
