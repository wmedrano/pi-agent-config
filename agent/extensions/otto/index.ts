/**
 * otto - Functionality for directing a chat session and its scratch workspace.
 */

import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import {
  type AgentEndEvent, type BeforeAgentStartEvent, type ExtensionAPI,
  type ExtensionContext, type ToolResultEvent
} from "@earendil-works/pi-coding-agent";
import { ensureScratchDir, scratchLink, isScratchPath } from "./scratch.js";

enum PlanStatus { None, InProgress, Drafted };
type Mode = "auto" | "normal";

const MODE_INFO: Record<Mode, { icon: string; label: string }> = {
  auto: { icon: "🐇", label: "auto" },
  normal: { icon: "🐢", label: "normal" },
};

export default function otto(pi: ExtensionAPI) {
  let planPath = "";
  let planStatus = PlanStatus.None;
  let mode: Mode = "normal";

  function updateStatus(ctx: ExtensionContext) {
    const theme = ctx.ui.theme;
    let parts = [];

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
    }

    const separator = theme.fg("dim", "  ┆  ");
    ctx.ui.setStatus("otto", parts.join(separator));
  }

  function setMode(newMode: Mode, ctx: ExtensionContext) {
    mode = newMode;
    const { icon, label } = MODE_INFO[mode];
    ctx.ui.notify(`${icon} Mode: ${label}`, "info");
    updateStatus(ctx);
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

  pi.on("tool_result", onToolResult);
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


  pi.on("agent_end", onAgentEnd);
  function onAgentEnd(_event: AgentEndEvent, ctx: ExtensionContext) {
    if (mode !== "auto" || planStatus !== PlanStatus.Drafted) { return; }
    planPath = "";
    planStatus = PlanStatus.None;
    updateStatus(ctx);
    ctx.ui.notify("🐇 Plan drafted — auto-approving", "info");
    pi.sendUserMessage("lgtm, execute the plan", { deliverAs: "followUp" });
  }

  pi.on("before_agent_start", onBeforeAgentStart);
  async function onBeforeAgentStart(event: BeforeAgentStartEvent, ctx: ExtensionContext) {
    const dir = await ensureScratchDir(ctx);
    event.systemPromptOptions.sections["scratch"] = [
      `Scratch directory: ${dir}`,
      "- Use it for temporary files: drafts, reports, intermediate output, throwaway logs, one-off scripts.",
      "- It already exists; make subdirectories with mkdir -p as needed.",
      "- Common use case: Store markdown files for requested plans, reviews, or reports."
    ].join("\n");
    updateStatus(ctx);
  }

  pi.registerCommand("queue", {
    description: `Inject a message to be sent after the current run.`,
    handler: onCommandQueue
  })
  async function onCommandQueue(args: string, ctx: ExtensionContext) {
    const text = args.trim();
    if (text === "") {
      ctx.ui.notify(`⚠️ No message was provided to /queue`, "warning");
      return;
    }
    pi.sendUserMessage(text, { deliverAs: "followUp" });
  }


  pi.registerCommand("mode", {
    description: `Switch otto mode: auto (auto-approve drafted plans) or normal. Toggles when no argument is given.`,
    handler: onCommandMode,
  });

  function onShortcutToggleMode(ctx: ExtensionContext) {
    setMode(mode === "auto" ? "normal" : "auto", ctx);
  }

  async function onCommandMode(args: string, ctx: ExtensionContext) {
    const arg = args.trim().toLowerCase();
    if (arg === "") {
      setMode(mode === "auto" ? "normal" : "auto", ctx);
      return;
    }
    if (arg === "auto" || arg === "normal") {
      setMode(arg as Mode, ctx);
      return;
    }
    ctx.ui.notify(`⚠️ Unknown mode "${arg}". Expected "auto" or "normal".`, "warning");
  }

  pi.registerCommand("scratch", {
    description: "Open the session scratch directory",
    handler: onCommandScratch,
  });
  async function onCommandScratch(_args: string, ctx: ExtensionContext) {
    const dir = await ensureScratchDir(ctx);
    const ok = await xdgOpen(dir);
    const notification = ok ? `Opened ${dir}` : `Scratch: ${dir}`;
    ctx.ui.notify(notification, "info");
  }

  pi.registerCommand("artifact", {
    description: "Open an artifact.",
    handler: onCommandArtifact,
  });
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

  pi.registerCommand("plan", {
    description: "Create a plan.",
    handler: onCommandPlan,
  });
  async function onCommandPlan(args: string, ctx: ExtensionContext) {
    const dir = await ensureScratchDir(ctx);
    const id = randomBytes(9).toString("base64url");
    const path = join(dir, `plan/${id}.md`);
    startPlan(ctx, path);
    const userPrompt = args.trim();
    const planPrompt = `# Instructions

Create a plan for the task and write it to ${path}

- Do not edit any files in the workspace.
- The plan must contain the following sections: [Goal, Steps]
- Work on the plan once the user gives explicit approval.`;
    const text = userPrompt ? `${planPrompt}\n\n# Task\n\n${userPrompt}` : planPrompt;
    pi.sendUserMessage(text, { deliverAs: "steer" });
  }

  pi.registerShortcut("ctrl+i", {
    description: "Toggle otto mode: auto (auto-approve drafted plans) or normal.",
    handler: onShortcutToggleMode,
  });

  pi.registerShortcut("ctrl+r", {
    description: "Open an artifact.",
    handler: onShortcutArtifact,
  });
  function onShortcutArtifact(ctx: ExtensionContext) {
    return onCommandArtifact("", ctx);
  }
}
