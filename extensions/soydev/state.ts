const COLORS = {
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
} as const;

/** Which tools a mode makes available to the agent. */
export enum ToolAccess {
  /** Every tool is permitted, including destructive ones. */
  Any = "any",
  /** Only non-destructive tools are permitted. */
  NonDestructive = "non-destructive",
  /** No tools are permitted at all. */
  None = "none",
}

/** Metadata associated with each operating mode. */
export interface ModeMetadata {
  /** Human-readable label with emoji (e.g. "⏸ Plan"). */
  label: string;
  /** ANSI escape code for the label colour. */
  color: string;
  /** The prompt for the mode. */
  prompt: string;
  /** Which tools the mode allows the agent to use. */
  allowedTools: ToolAccess;
  /** Short description of what the mode does, used for command registration. */
  description: string;
}

/** Map of every operating mode to its {@link ModeMetadata}. */
export const MODE_METADATA = {
  build: {
    label: "⏭ Build",
    color: COLORS.green,
    prompt: `Entered BUILD mode. Editing enabled.`,
    allowedTools: ToolAccess.Any,
    description: "Switch to build mode (editing enabled)",
  },
  plan: {
    label: "⏸ Plan",
    color: COLORS.yellow,
    prompt: `Entered PLAN mode. Editing disabled.

- Create a plan for the given task.
- Output a goal and a list of steps.
- Format: Under \`# Plan\`, have a Goal section and a Steps section. Optionally, add a Validation section.`,
    allowedTools: ToolAccess.NonDestructive,
    description: "Inject a planning prompt before the next message",
  },
  tdd: {
    label: "⏺ TDD",
    color: COLORS.magenta,
    prompt: `Entered PLAN mode. Editing disabled.

- Create a plan to implement unit tests for the given task.
- Output a list of unit test names.
- Guidance:
  - Test behaviors not methods.
  - Use the <scenario>_<expectation> naming convention`,
    allowedTools: ToolAccess.NonDestructive,
    description: "Inject a TDD prompt to design unit tests before implementation",
  },
  qa: {
    label: "⏹ Q&A",
    color: COLORS.cyan,
    prompt: `Entered Q&A mode. Editing disabled.

- Answer questions concisely.
- Research is allowed, but optional.`,
    allowedTools: ToolAccess.NonDestructive,
    description: "Switch to Q&A mode (ask questions, no edits)",
  },
  qq: {
    label: "⏹ QQ",
    color: COLORS.cyan,
    prompt: `Entered quick Q&A mode. Editing and tools disabled.

- Answer questions concisely.
- No research allowed. Be quick.`,
    allowedTools: ToolAccess.None,
    description: "Switch to concise Q&A mode (all tools disabled)",
  },
} satisfies Record<string, ModeMetadata>;

/** Operating-mode identifier — the keys of {@link MODE_METADATA}. */
export type Mode = keyof typeof MODE_METADATA;

/** Returns every mode with its metadata so extensions can register commands dynamically. */
export function getModes(): { name: Mode; metadata: ModeMetadata }[] {
  return Object.entries(MODE_METADATA).map(([name, metadata]) => ({
    name: name as Mode,
    metadata,
  }));
}

/** Tools that mutate the user's files. Comparison is case-sensitive and exact. */
const DESTRUCTIVE_TOOLS = new Set(["edit", "write"]);

/** Result of a tool-permission check. */
export interface ToolPermission {
  /** Whether the tool may run. */
  allowed: boolean;
  /** Human-readable explanation of why the tool is blocked, if `allowed` is false. */
  reason?: string;
}

/** Tracks the current operating mode and handles mode transitions for the SoyDev extension. */
export class SoyDevState {
  /**
   * The mode that will be used.
   */
  _next_mode: Mode = "build";

  /**
   * Modes of queued `soydev-mode` messages that have not been delivered yet,
   * in delivery order. The last element always equals {@link _next_mode}.
   * Drained from the front as each message is delivered (see {@link deliverMode}).
   */
  _pending_modes: Mode[] = [];

  /**
   * Whether an `autoplan` run is in flight: the plan-mode prompt has been sent
   * and `/lgtm` should be fired once the agent finishes generating the plan
   * (see the `agent_settled` handler in the extension).
   */
  _autoplan_pending: boolean = false;

  /**
   * Creates a new SoyDevState.
   */
  constructor() { }

  /**
   * Transitions to the specified mode, returning the mode's prompt and the
   * previous mode. If the new mode matches the current one, no transition
   * occurs and null is returned.
   *
   * @param mode - The target operating mode.
   * @returns The prompt and previous mode, or null if unchanged.
   */
  setNextMode(mode: Mode): { prompt: string; previousMode: Mode } | null {
    if (this._next_mode == mode) return null;
    const previousMode = this._next_mode;
    this._next_mode = mode;
    this._pending_modes.push(mode);
    return { prompt: MODE_METADATA[mode].prompt, previousMode };
  }

  /**
   * Retrieves and clears the prompt for the most recent mode transition. Useful
   * for tests that need to drain the prompt injected by {@link setNextMode}.
   */
  pollModePrompt(): void {
    // No-op: `setMode` returns the prompt directly rather than queuing it, so
    // there is nothing buffered here to drain. The method exists primarily so
    // test helpers can mirror that contract without special-casing.
  }

  /**
   * Arms or disarms the pending-autoplan flag.
   *
   * @param pending - Whether an autoplan plan run is awaiting its `/lgtm`.
   */
  setAutoplanPending(pending: boolean): void {
    this._autoplan_pending = pending;
  }

  /**
   * Returns whether an autoplan plan run is awaiting its `/lgtm`.
   */
  isAutoplanPending(): boolean {
    return this._autoplan_pending;
  }

  /**
   * Returns the queued modes preceding the final (next) mode, i.e. everything
   * in {@link _pending_modes} except the tail. Pass this to {@link status} so
   * the active/next mode (the tail) is appended exactly once by `status`.
   *
   * Example: with `_pending_modes = [plan, build, qq]` and `_next_mode = qq`,
   * returns `[plan, build]` and `status(...)` renders `plan -> build -> qq`.
   */
  intermediateModes(): Mode[] {
    return this._pending_modes.length > 0
      ? this._pending_modes.slice(0, -1)
      : [];
  }

  /**
   * Returns a copy of every queued, undelivered mode in delivery order. The
   * last element equals {@link _next_mode}. Primarily for inspection/tests.
   */
  pendingModes(): Mode[] {
    return [...this._pending_modes];
  }

  /**
   * Marks the next queued mode as delivered, removing it from the front of
   * {@link _pending_modes}. Call this from a `soydev-mode` message event so
   * the status display advances (e.g. `plan -> build -> qq` → `build -> qq`).
   *
   * Does not mutate {@link _next_mode}: once the queue is fully drained it
   * remains as the active display mode.
   *
   * @param mode - When provided, removes the first queued entry matching it
   *   (FIFO). When omitted, removes the front of the queue.
   */
  deliverMode(mode?: Mode): void {
    if (this._pending_modes.length === 0) return;
    if (mode === undefined) {
      this._pending_modes.shift();
      return;
    }
    const index = this._pending_modes.indexOf(mode);
    if (index !== -1) this._pending_modes.splice(index, 1);
  }

  /**
   * Determines whether the named tool may execute under the current mode.
   *
   * Only the `edit` and `write` tools are considered destructive; any other
   * tool name (including unknown and future tools) is treated as
   * non-destructive. Tool-name matching is case-sensitive, so `"Edit"` is
   * distinct from `"edit"`.
   *
   * @param toolName - The name of the tool the agent wants to run.
   * @returns An object with {@link ToolPermission.allowed} and, when blocked,
   *   a human-readable {@link ToolPermission.reason} for the block.
   */
  toolIsAllowed(toolName: string): ToolPermission {
    const metadata = MODE_METADATA[this._next_mode];
    switch (metadata.allowedTools) {
      case ToolAccess.Any:
        return { allowed: true };
      case ToolAccess.NonDestructive:
        if (DESTRUCTIVE_TOOLS.has(toolName)) {
          return {
            allowed: false,
            reason: `Edits are disabled in ${metadata.label} mode.`,
          };
        }
        return { allowed: true };
      case ToolAccess.None:
        return {
          allowed: false,
          reason: `All tools are disabled in ${metadata.label} mode.`,
        };
    }
  }

  status(modes: Mode[]): string {
    const modeSequence: Mode[] = [...modes, this._next_mode];
    let statusItems: string[] = [];
    for (const mode of modeSequence) {
      const metadata: ModeMetadata = MODE_METADATA[mode];
      const s: string = `${metadata.color}${metadata.label}${COLORS.reset}`;
      statusItems.push(s);
    }
    return statusItems.join(' -> ');
  }
}
