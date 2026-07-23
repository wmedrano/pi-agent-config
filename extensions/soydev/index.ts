import type {
  ExtensionAPI, ExtensionContext,
  SessionStartEvent,
  BeforeAgentStartEvent,
  MessageStartEvent,
  ToolCallEvent, ToolCallEventResult,
  AgentSettledEvent,
} from "@earendil-works/pi-coding-agent";
import { SoyDevState, type Mode, getModes } from "./state";

export default function soydev(pi: ExtensionAPI) {
  let state = new SoyDevState();

  function updateStatus(ctx: ExtensionContext) {
    ctx.ui.setStatus('soydev', state.status(state.intermediateModes()));
  }

  async function onSessionStart(_event: SessionStartEvent, ctx: ExtensionContext) {
    updateStatus(ctx);
  }

  pi.on("session_start", onSessionStart);

  function onToolCall(event: ToolCallEvent): undefined | ToolCallEventResult {
    const result = state.toolIsAllowed(event.toolName);
    if (result.allowed) return;
    return {
      block: true,
      reason: result.reason,
    };
  }

  pi.on("tool_call", onToolCall);

  async function onBeforeAgentStart(_: BeforeAgentStartEvent, ctx: ExtensionContext) {
    updateStatus(ctx);
  }

  pi.on("before_agent_start", onBeforeAgentStart);

  // When an autoplan plan run settles, automatically fire /lgtm. `agent_settled`
  // fires only after the run fully settles (retries, compactions, and queued
  // follow-ups are drained first), and the build/lgtm run it starts will see the
  // flag already cleared, so this fires exactly once.
  function onAgentSettled(_event: AgentSettledEvent, ctx: ExtensionContext) {
    if (!state.isAutoplanPending()) return;
    state.setAutoplanPending(false);
    queueModeCommand("build", "lgtm", ctx);
  }

  pi.on("agent_settled", onAgentSettled);

  // Reset the autoplan flag on session shutdown so a flag left armed by an
  // interrupted run can't fire an unexpected lgtm in a later session.
  pi.on("session_shutdown", () => {
    state.setAutoplanPending(false);
  });

  function onMessageStart(event: MessageStartEvent, ctx: ExtensionContext) {
    const msg = event.message;
    if (msg.role === "custom" && msg.customType === "soydev-mode") {
      const details = msg.details as { mode?: Mode } | undefined;
      state.deliverMode(details?.mode);
      updateStatus(ctx);
    }
  }

  pi.on("message_start", onMessageStart);

  function queueModeCommand(mode: Mode, args: string, ctx: ExtensionContext) {
    const transition = state.setNextMode(mode);
    if (transition) {
      const content = args ? `${transition.prompt}\n\n${args}` : transition.prompt;
      pi.sendMessage(
        {
          customType: "soydev-mode",
          content,
          display: true,
          details: { mode, previousMode: transition.previousMode },
        },
        { deliverAs: "followUp", triggerTurn: !!args },
      );
    } else if (args) {
      // Mode unchanged, but the user still gave a task — send it as a prompt.
      pi.sendUserMessage(args, { deliverAs: "followUp" });
    }

    updateStatus(ctx);
  }

  for (const { name, metadata } of getModes()) {
    pi.registerCommand(name, {
      description: metadata.description,
      handler: async (args, ctx) => { queueModeCommand(name, args, ctx); },
    });
  }

  pi.registerCommand("lgtm", {
    description: "Alias for /build lgtm (switch to build mode with task 'lgtm')",
    handler: async (_args, ctx) => { queueModeCommand("build", "lgtm", ctx); },
  });

  pi.registerCommand("autoplan", {
    description: "Plan the given task, then automatically run /lgtm once the plan is generated",
    handler: async (args, ctx) => {
      // Only arm the /lgtm when there is an item to plan. Empty args behave like
      // a plain /plan (mode switch only, no turn), so there is nothing to wait for.
      if (args.trim()) {
        state.setAutoplanPending(true);
      }
      queueModeCommand("plan", args, ctx);
    },
  });
}
