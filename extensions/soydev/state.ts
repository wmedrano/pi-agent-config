const COLORS = {
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
} as const;

/** Operating mode for the SoyDev extension. */
export enum Mode {
  /** Full access — tools are unrestricted. */
  Build = "build",
  /** Planning-only — edit/write tools are blocked. */
  Plan = "plan",
  /** TDD cycle — edit/write tools are blocked; tests are expected. */
  Tdd = "tdd",
  /** Question-and-answer — edit/write tools are blocked. */
  Qa = "qa",
  /** Concise Q&A — all tools are blocked. */
  Qq = "qq",
}

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
}

/** Map of each {@link Mode} to its {@link ModeMetadata}. */
export const MODE_METADATA: Record<Mode, ModeMetadata> = {
  [Mode.Build]: {
    label: "⏭ Build",
    color: COLORS.green,
    prompt: `Entered BUILD mode. Editing enabled.`,
    allowedTools: ToolAccess.Any,
  },
  [Mode.Plan]: {
    label: "⏸ Plan",
    color: COLORS.yellow,
    prompt: `Entered PLAN mode. Editing disabled.

- Create a plan for the given task.
- Output a goal and a list of steps.
Example:

# Plan

## Goal

...

## Steps

...`,
    allowedTools: ToolAccess.NonDestructive,
  },
  [Mode.Tdd]: {
    label: "⏺ TDD",
    color: COLORS.magenta,
    prompt: `Entered PLAN mode. Editing disabled.

- Create a plan to implement unit tests for the given task.
- Output a list of unit test names.
- Guidance:
  - Test behaviors not methods.
  - Use the <scenario>_<expectation> naming convention`,
    allowedTools: ToolAccess.NonDestructive,
  },
  [Mode.Qa]: {
    label: "⏹ Q&A",
    color: COLORS.cyan,
    prompt: `Entered Q&A mode. Editing disabled.

- Answer questions concisely.
- Research is allowed, but optional.`,
    allowedTools: ToolAccess.NonDestructive,
  },
  [Mode.Qq]: {
    label: "⏹ QQ",
    color: COLORS.cyan,
    prompt: `Entered quick Q&A mode. Editing and tools disabled.

- Answer questions concisely.
- No research allowed. Be quick.`,
    allowedTools: ToolAccess.None,
  },
};

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
  _mode: Mode = Mode.Build;
  /**
   * Creates a new SoyDevState.
   */
  constructor() { }

  /**
   * Transitions to the specified mode, returning the mode's prompt to inject
   * into the conversation. If the new mode matches the current one, no
   * transition occurs and an empty string is returned.
   *
   * @param mode - The target operating mode.
   * @returns The prompt for the new mode, or an empty string if unchanged.
   */
  setMode(mode: Mode): string {
    if (this._mode == mode) return "";
    this._mode = mode;
    return MODE_METADATA[mode].prompt;
  }

  /**
   * Retrieves and clears the prompt for the most recent mode transition. Useful
   * for tests that need to drain the prompt injected by {@link setMode}.
   */
  pollModePrompt(): void {
    // No-op: `setMode` returns the prompt directly rather than queuing it, so
    // there is nothing buffered here to drain. The method exists primarily so
    // test helpers can mirror that contract without special-casing.
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
    const metadata = MODE_METADATA[this._mode];
    switch (metadata.allowedTools) {
      case ToolAccess.Any:
        return { allowed: true };
      case ToolAccess.NonDestructive:
        if (DESTRUCTIVE_TOOLS.has(toolName)) {
          return {
            allowed: false,
            reason: `Edits are disabled in ${this._mode} mode.`,
          };
        }
        return { allowed: true };
      case ToolAccess.None:
        return {
          allowed: false,
          reason: `All tools are disabled in ${this._mode} mode.`,
        };
    }
  }

  status(): string {
    const metadata = MODE_METADATA[this._mode];
    return `${metadata.color}${metadata.label}${COLORS.reset}`;
  }
}
