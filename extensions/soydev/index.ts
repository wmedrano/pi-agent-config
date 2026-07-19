import type {
  ExtensionAPI, ExtensionCommandContext, ExtensionContext,
  SessionStartEvent,
  BeforeAgentStartEvent,
  ToolCallEvent, ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { SoyDevState, type Mode, getModes } from "./state";

export default function soydev(pi: ExtensionAPI) {
  let state = new SoyDevState();

  function updateStatus(ctx: ExtensionContext) {
    const status = state.status([]);
    ctx.ui.setStatus('soydev', status);
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

  function queueModeCommand(mode: Mode, args: string, ctx: ExtensionCommandContext) {
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
}
