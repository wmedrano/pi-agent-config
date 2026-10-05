/**
 * Scratch-workspace path helpers for the otto extension.
 */

import { mkdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const ensured = new Set<string>();

export function scratchDir(ctx: ExtensionContext): string {
  // TODO: Handle the case where sessionId is not a valid path name.
  return join("/tmp/pi/scratch", ctx.sessionManager.getSessionId());
}

export async function ensureScratchDir(ctx: ExtensionContext): Promise<string> {
  const dir = scratchDir(ctx);
  if (ensured.has(dir)) {
    return dir;
  }
  // mkdir -p on every run: /tmp can be wiped between runs.
  await mkdir(dir, { recursive: true });
  ensured.add(dir);
  return dir;
}

export function scratchRelPath(ctx: ExtensionContext, target: string): string | undefined {
  if (target === "") {
    return undefined;
  }
  const base = resolve(scratchDir(ctx));
  const abs = resolve(ctx.cwd, target);
  // The trailing separator stops /scratch/abc from also matching /scratch/abcd. The target has
  // to be strictly inside so the scratch dir itself has no name to show. No filesystem check:
  // tool_call fires before the tool runs, so a write target may not exist yet.
  return abs.startsWith(base + sep) ? relative(base, abs) : undefined;
}
