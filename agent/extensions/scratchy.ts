/**
 * scratchy - Per-session scratch directory for temporary files.
 */

import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Sessions whose directory has been created in this process. */
const ensured = new Set<string>();

function scratchDir(ctx: ExtensionContext): string {
  const scratchRoot = "/tmp/pi/scratch";
  // TODO: Handle the case where sessionId is not a valid path name.
  const sessionId = ctx.sessionManager.getSessionId();
  return join(scratchRoot, sessionId);
}

async function ensureScratchDir(ctx: ExtensionContext): Promise<string> {
  const dir = scratchDir(ctx);
  if (!ensured.has(dir)) {
    // mkdir -p on every run: /tmp can be wiped between runs.
    await mkdir(dir, { recursive: true });
    ensured.add(dir);
  }
  return dir;
}

async function xdgOpen(pi: ExtensionAPI, file: string): Promise<boolean> {
  const { code } = await pi.exec("xdg-open", [file], { timeout: 1000 });
  // pi.exec resolves with a non-zero code instead of rejecting when the binary is missing.
  return code === 0;
}

export default function scratchy(pi: ExtensionAPI) {
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

  pi.registerCommand("scratch", {
    description: "Open the session scratch directory",
    handler: async (_args, ctx) => {
      const dir = await ensureScratchDir(ctx);
      const ok = await xdgOpen(pi, dir);
      const notification = ok ? `Opened ${dir}` : `Scratch: ${dir}`;
      ctx.ui.notify(notification, "info");
    },
  });

  pi.registerCommand("artifact", {
    description: "Open an artifact.",
    handler: async (_args, ctx) => {
      const dir = await ensureScratchDir(ctx);
      const entries = await readdir(dir, { withFileTypes: true, recursive: true });
      const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
      if (files.length === 0) {
        ctx.ui.notify(`No files in ${dir}`, "info");
        return;
      }
      const file = await ctx.ui.select("Open artifact", files);
      if (file) {
        await xdgOpen(pi, file);
      }
    },
  });
}
