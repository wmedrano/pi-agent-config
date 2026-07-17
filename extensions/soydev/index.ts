import type {
  ExtensionAPI, ExtensionCommandContext, ExtensionContext,
  SessionStartEvent,
  ToolCallEvent, ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { SoyDevState, Mode } from "./state";

export default function soydev(pi: ExtensionAPI) {
  let state = new SoyDevState();

  function updateStatus(ctx: ExtensionContext) {
    ctx.ui.setStatus('soydev', state.status());
  }

  async function onSessionStart(_event: SessionStartEvent, ctx: ExtensionContext) {
    updateStatus(ctx);
  }

  pi.on("session_start", onSessionStart);

  function setModeCommand(mode: Mode, args: string, ctx: ExtensionCommandContext) {
    let content = [];
    if (args) {
      content.push({ type: "text" as const, text: args });
    }
    // TODO: The mode should be set once the message executes, not when its
    // queued.
    const prompt = state.setMode(mode);
    if (prompt) {
      content.push({ type: "text" as const, text: prompt });
    }
    if (content.length > 0) {
      pi.sendUserMessage(content, { deliverAs: "steer" });
    }
    updateStatus(ctx);
  }

  function onToolCall(event: ToolCallEvent): undefined | ToolCallEventResult {
    const result = state.toolIsAllowed(event.toolName);
    if (!result.allowed) {
      return {
        block: true,
        reason: result.reason,
      };
    }
    return;
  }

  pi.on("tool_call", onToolCall);

  pi.registerCommand("plan", {
    description: "Inject a planning prompt before the next message",
    handler: async (args, ctx) => { setModeCommand(Mode.Plan, args, ctx); },
  });

  pi.registerCommand("tdd", {
    description: "Inject a TDD prompt to design unit tests before implementation",
    handler: async (args, ctx) => { setModeCommand(Mode.Tdd, args, ctx); },
  });

  pi.registerCommand("build", {
    description: "Switch to build mode (editing enabled)",
    handler: async (args, ctx) => { setModeCommand(Mode.Build, args, ctx); },
  });

  pi.registerCommand("qa", {
    description: "Switch to Q&A mode (ask questions, no edits)",
    handler: async (args, ctx) => { setModeCommand(Mode.Qa, args, ctx); },
  });

  pi.registerCommand("qq", {
    description: "Switch to concise Q&A mode (all tools disabled)",
    handler: async (args, ctx) => { setModeCommand(Mode.Qq, args, ctx); },
  });
}
