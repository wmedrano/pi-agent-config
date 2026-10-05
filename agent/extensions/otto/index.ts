/**
 * otto - Functionality for directing a chat session and its scratch workspace.
 *
 * Commands: /steer, /scratch, /artifact, /plan
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { type ExtensionAPI, type ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { ensureScratchDir, scratchRelPath } from "./scratch.js";

export default function otto(pi: ExtensionAPI) {
  async function xdgOpen(file: string): Promise<boolean> {
    const { code } = await pi.exec("xdg-open", [file], { timeout: 1000 });
    // pi.exec resolves with a non-zero code instead of rejecting when the binary is missing.
    return code === 0;
  }

  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "edit" && event.toolName !== "write") {
      return;
    }
    const path = event.input.path;
    if (typeof path !== "string") {
      return;
    }
    const label = scratchRelPath(ctx, path);
    if (label === undefined) {
      return;
    }
    const verb = event.toolName === "edit" ? "Updated" : "Wrote";
    ctx.ui.notify(`🕵️ ${verb} scratch file ${label}`, "info");
  });

  // Add the scratch section to the system prompt. The path is fixed per session, so the
  // text is stable across turns and Pi patches the prompt only on the first run.
  pi.on("before_agent_start", async (event, ctx) => {
    const dir = await ensureScratchDir(ctx);
    // Name of the system prompt section (must match ^[a-z][a-z0-9_-]*$).
    const section = "scratch";
    event.systemPromptOptions.sections[section] = [
      `Scratch directory: ${dir}`,
      "- Use it for temporary files: drafts, reports, intermediate output, throwaway logs, one-off scripts.",
      "- It already exists; make subdirectories with mkdir -p as needed.",
      "- Common use case: Store markdown files for requested plans, reviews, or reports."
    ].join("\n");
  });

  pi.registerCommand("steer", {
    description: `Inject a message into the current run. If no message is specified, the default fallback is used: "You have enough information, finalize your work")`,
    handler: async (args, ctx) => {
      const text = args?.trim() || "You have enough information, finalize your work";
      pi.sendUserMessage(text, { deliverAs: "steer" });
    },
  });

  pi.registerCommand("scratch", {
    description: "Open the session scratch directory",
    handler: async (_args, ctx) => {
      const dir = await ensureScratchDir(ctx);
      const ok = await xdgOpen(dir);
      const notification = ok ? `Opened ${dir}` : `Scratch: ${dir}`;
      ctx.ui.notify(notification, "info");
    },
  });

  pi.registerCommand("artifact", {
    description: "Open an artifact.",
    handler: async (_args, ctx) => {
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
    },
  });

  function createPlanPrompt(planPath: string, userPrompt: string): string {
    const planPrompt = `# Instructions

Create a plan for the task and write it to ${planPath}

- Do not edit any files in the workspace.
- The plan must contain the following sections: [Goal, Steps]`;

    return userPrompt ? `${planPrompt}\n\n# Task\n\n${userPrompt}` : planPrompt;
  }

  pi.registerCommand("plan", {
    description: "Create a plan.",
    handler: async (args, ctx) => {
      const dir = await ensureScratchDir(ctx);
      const id = randomBytes(9).toString("base64url");
      const planPath = join(dir, `plan-${id}.md`);
      const text = createPlanPrompt(planPath, args.trim());
      pi.sendUserMessage(text, { deliverAs: "steer" });
    },
  });
}
