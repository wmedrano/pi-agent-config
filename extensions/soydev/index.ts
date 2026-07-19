import type {
  ExtensionAPI, ExtensionCommandContext, ExtensionContext,
  SessionStartEvent,
  ToolCallEvent, ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { SoyDevState, type Mode, getModes } from "./state";

export default function soydev(pi: ExtensionAPI) {
  let state = new SoyDevState();

  function updateStatus(ctx: ExtensionContext) {
    ctx.ui.setStatus('soydev', state.status());
  }

  async function onSessionStart(_event: SessionStartEvent, ctx: ExtensionContext) {
    updateStatus(ctx);
  }

  pi.on("session_start", onSessionStart);

  function queueModeCommand(mode: Mode, args: string, ctx: ExtensionCommandContext) {
    if (args) {
      pi.sendUserMessage(
        [{ type: "text" as const, text: args }],
        { deliverAs: "steer" });
    }

    const transition = state.setMode(mode);
    if (transition) {
      pi.sendMessage(
        {
          customType: "soydev-mode",
          content: transition.prompt,
          display: true,
          details: { mode, previousMode: transition.previousMode },
        },
        { deliverAs: "steer", triggerTurn: !args },
      );
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

  for (const { name, metadata } of getModes()) {
    pi.registerCommand(name, {
      description: metadata.description,
      handler: async (args, ctx) => { queueModeCommand(name, args, ctx); },
    });
  }
}
