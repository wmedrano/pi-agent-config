/**
 * otto - Functionality for directing a chat session and its scratch workspace.
 *
 * Commands: /steer, /scratch, /artifact, /plan
 */

import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Sessions whose directory has been created in this process. */
const ensured = new Set<string>();

async function ensureScratchDir(ctx: ExtensionContext): Promise<string> {
  // TODO: Handle the case where sessionId is not a valid path name.
  const dir = join("/tmp/pi/scratch", ctx.sessionManager.getSessionId());
  if (ensured.has(dir)) {
    return dir;
  }
  // mkdir -p on every run: /tmp can be wiped between runs.
  await mkdir(dir, { recursive: true });
  ensured.add(dir);
  return dir;
}

export default function otto(pi: ExtensionAPI) {
  async function xdgOpen(file: string): Promise<boolean> {
    const { code } = await pi.exec("xdg-open", [file], { timeout: 1000 });
    // pi.exec resolves with a non-zero code instead of rejecting when the binary is missing.
    return code === 0;
  }

  /** Send text into the current run and notify only if steering was required. */
  async function steer(text: string, ctx: ExtensionContext, notification: string): Promise<void> {
    const steering = !ctx.isIdle();
    pi.sendUserMessage(text, { deliverAs: "steer" });
    if (steering) ctx.ui.notify(notification, "info");
  }

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
      await steer(text, ctx, "Steered into current run");
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

  pi.registerCommand("plan", {
    description: "Create a plan.",
    handler: async (args, ctx) => {
      const dir = await ensureScratchDir(ctx);
      const id = randomBytes(9).toString("base64url");
      const planPath = join(dir, `plan-${id}.md`);
      const planPrompt = `# Instructions

Create a plan for the task and write it to ${planPath}

- Do not edit any files in the workspace.
- The plan must contain the following sections: [Goal, Steps]`;

      const userPrompt = args.trim();
      let text = planPrompt;
      if (userPrompt) {
        text = `${planPrompt}\n\n# Task\n\n${userPrompt}`;
      }
      await steer(text, ctx, "Steered planning into current run");
    },
  });
}
