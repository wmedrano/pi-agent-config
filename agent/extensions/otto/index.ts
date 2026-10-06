/**
 * otto - Functionality for directing a chat session and its scratch workspace.
 */

import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import {
  type AgentEndEvent, type BeforeAgentStartEvent, type ExtensionAPI,
  type ExtensionContext, type ToolResultEvent, type SessionStartEvent
} from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { ensureScratchDir, scratchLink, scratchDirLink, isScratchPath } from "./scratch.js";
import { executePlanMessage, planPrompt as buildPlanPrompt, scratchSystemPrompt } from "./prompts.js";

enum PlanStatus { None, InProgress, Drafted, Executing };
type Mode = "auto" | "normal";

const MODE_INFO: Record<Mode, { icon: string; label: string }> = {
  auto: { icon: "🐇", label: "auto" },
  normal: { icon: "🐢", label: "normal" },
};

export default function otto(pi: ExtensionAPI) {
  pi.on("before_agent_start", onBeforeAgentStart);
  pi.on("session_start", onSessionStart);
  pi.on("agent_end", onAgentEnd);
  pi.on("tool_result", onToolResult);
  pi.registerCommand("queue", {
    description: `Inject a message to be sent after the current run.`,
    handler: onCommandQueue
  })
  pi.registerCommand("mode", {
    description: `Switch otto mode: auto (auto-approve drafted plans) or normal. Toggles when no argument is given.`,
    handler: onCommandMode,
  });
  pi.registerShortcut(Key.alt("m"), {
    description: "Toggle otto mode (auto/normal)",
    handler: toggleMode,
  });
  pi.registerCommand("scratch", {
    description: "Open the session scratch directory",
    handler: onCommandScratch,
  });
  pi.registerCommand("artifact", {
    description: "Open an artifact.",
    handler: onCommandArtifact,
  });
  pi.registerCommand("plan", {
    description: "Create a plan.",
    handler: onCommandPlan,
  });
  pi.registerCommand("autoplan", {
    description: `Switch to auto mode and create a plan (drafted plans are auto-approved).`,
    handler: onCommandAutoplan,
  });

  let planPath = "";
  let planStatus = PlanStatus.None;
  let mode: Mode = "normal";

  function updateStatus(ctx: ExtensionContext) {
    const theme = ctx.ui.theme;
    let parts = [];

    // Scratch dir
    parts.push(theme.fg("muted", scratchDirLink(ctx)));

    // Mode
    const modeInfo = MODE_INFO[mode];
    parts.push(ctx.ui.theme.fg("muted", `${modeInfo.icon} ${modeInfo.label}`));

    // Plan
    const link = scratchLink(ctx, planPath);
    switch (planStatus) {
      case PlanStatus.None:
        break;
      case PlanStatus.InProgress:
        parts.push(theme.fg("muted", "📝 planning…"));
        break;
      case PlanStatus.Drafted:
        parts.push(theme.fg("accent", `📝 ${link}`));
        break;
      case PlanStatus.Executing:
        parts.push(theme.fg("accent", `🚀 ${link}`));
    }

    const separator = theme.fg("dim", "  |  ");
    ctx.ui.setStatus("otto", parts.join(separator));
  }

  function setMode(newMode: Mode, ctx: ExtensionContext) {
    mode = newMode;
    const { icon, label } = MODE_INFO[mode];
    ctx.ui.notify(`${icon} Mode: ${label}`, "info");
    updateStatus(ctx);
  }

  function toggleMode(ctx: ExtensionContext) {
    setMode(mode === "auto" ? "normal" : "auto", ctx);
  }

  function startPlan(ctx: ExtensionContext, path: string) {
    planPath = path;
    planStatus = PlanStatus.InProgress;
    updateStatus(ctx);
  }

  async function xdgOpen(file: string): Promise<boolean> {
    const { code } = await pi.exec("xdg-open", [file], { timeout: 1000 });
    // pi.exec resolves with a non-zero code instead of rejecting when the binary is missing.
    return code === 0;
  }

  function onToolResult(event: ToolResultEvent, ctx: ExtensionContext) {
    // Nested calls (e.g. from codemode scripts) re-emit tool_result; only report
    // model-issued calls, so notifications don't duplicate.
    if (event.parentToolCallId !== undefined) { return; }
    if (event.isError) { return; }
    if (event.toolName !== "edit" && event.toolName !== "write") { return; }
    if (typeof event.input.path !== "string") { return; }
    if (!isScratchPath(ctx, event.input.path)) { return; }

    const path = event.input.path;
    if (planPath !== "" && resolve(ctx.cwd, path) === resolve(planPath)) {
      if (planStatus === PlanStatus.InProgress) {
        planStatus = PlanStatus.Drafted;
      }
      updateStatus(ctx);
    }
    const verb = event.toolName === "edit" ? "Updated" : "Wrote";
    ctx.ui.notify(`🕵️ ${verb} scratch file ${scratchLink(ctx, path)}`, "info");
  }

  function onAgentEnd(_event: AgentEndEvent, ctx: ExtensionContext) {
    if (planStatus === PlanStatus.Executing) {
      // The run that executed the plan just finished; reset the lifecycle.
      planStatus = PlanStatus.None;
      updateStatus(ctx);
      return;
    }
    if (mode !== "auto" || planStatus !== PlanStatus.Drafted) { return; }
    planStatus = PlanStatus.Executing;
    updateStatus(ctx);
    const link = scratchLink(ctx, planPath);
    ctx.ui.notify(`${MODE_INFO["auto"].icon} Plan ${link} drafted — auto-approving`, "info");
    pi.sendUserMessage(executePlanMessage(), { deliverAs: "followUp" });
  }

  function onSessionStart(event: SessionStartEvent, ctx: ExtensionContext) {
    updateStatus(ctx);
  }

  async function onBeforeAgentStart(event: BeforeAgentStartEvent, ctx: ExtensionContext) {
    const dir = await ensureScratchDir(ctx);
    event.systemPromptOptions.sections["scratch"] = scratchSystemPrompt(dir);
  }

  async function onCommandQueue(args: string, ctx: ExtensionContext) {
    const text = args.trim();
    if (text === "") {
      ctx.ui.notify(`⚠️ No message was provided to /queue`, "warning");
      return;
    }
    pi.sendUserMessage(text, { deliverAs: "followUp" });
  }

  async function onCommandMode(args: string, ctx: ExtensionContext) {
    const arg = args.trim().toLowerCase();
    if (arg === "") {
      toggleMode(ctx);
      return;
    }
    if (arg === "auto" || arg === "normal") {
      setMode(arg as Mode, ctx);
      return;
    }
    ctx.ui.notify(`⚠️ Unknown mode "${arg}". Expected "auto" or "normal".`, "warning");
  }

  async function onCommandScratch(_args: string, ctx: ExtensionContext) {
    const dir = await ensureScratchDir(ctx);
    const ok = await xdgOpen(dir);
    const notification = ok ? `Opened ${dir}` : `Scratch: ${dir}`;
    ctx.ui.notify(notification, "info");
  }

  async function onCommandArtifact(_args: string, ctx: ExtensionContext) {
    const dir = await ensureScratchDir(ctx);
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    // With recursive readdir, entry.name is only the base name, so rebuild the
    // full path from the directory the entry was read from.
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name));
    if (files.length === 0) {
      ctx.ui.notify(`No files in ${dir}`, "warning");
      return;
    }
    const file = await ctx.ui.select("Open artifact", files);
    if (file) {
      await xdgOpen(file);
    }
  }

  async function onCommandAutoplan(args: string, ctx: ExtensionContext) {
    // Set the mode first so the auto-approve path in onAgentEnd fires when the
    // planning run finishes.
    setMode("auto", ctx);
    await onCommandPlan(args, ctx);
  }

  async function onCommandPlan(args: string, ctx: ExtensionContext) {
    const dir = await ensureScratchDir(ctx);
    const id = randomBytes(9).toString("base64url");
    const path = join(dir, `plan/${id}.md`);
    startPlan(ctx, path);
    const userPrompt = args.trim();
    const planPrompt = buildPlanPrompt(path);
    const text = userPrompt ? `${planPrompt}\n\n# Task\n\n${userPrompt}` : planPrompt;
    pi.sendUserMessage(text, { deliverAs: "steer" });
  }
}
