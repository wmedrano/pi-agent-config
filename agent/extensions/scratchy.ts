/**
 * scratchy - Per-session scratch directory for temporary files.
 */

import { mkdir } from "node:fs/promises";
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
      const { code } = await pi.exec("xdg-open", [dir], { timeout: 1000 });
      // pi.exec resolves with a non-zero code instead of rejecting when the binary is missing.
      const notification = code === 0 ? `Opened ${dir}` : `Scratch: ${dir}`;
      ctx.ui.notify(notification, "info");
    },
  });
}
