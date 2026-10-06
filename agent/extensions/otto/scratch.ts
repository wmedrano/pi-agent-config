/**
 * Scratch-workspace path helpers for the otto extension.
 */

import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getCapabilities, hyperlink } from "@earendil-works/pi-tui";

const ensured = new Set<string>();

// Scratch directories are per-project, derived from the working directory, so
// multiple sessions in the same project share one scratch dir.
function scratchDirName(cwd: string): string {
  const hash = createHash("sha256").update(cwd).digest("hex").slice(0, 12);
  // basename("/") is "", so fall back to "root" to keep the name non-empty.
  // Strip leading dots so hidden dirs like .pi don't produce hidden dir names.
  const name = basename(cwd).replace(/^\.+/, "") || "root";
  return `${name}-${hash}`;
}

export function scratchDir(ctx: ExtensionContext): string {
  return join("/tmp/pi/scratch/", scratchDirName(resolve(ctx.cwd)));
}

export async function ensureScratchDir(ctx: ExtensionContext): Promise<string> {
  const dir = scratchDir(ctx);
  if (ensured.has(dir)) {
    return dir;
  }
  // mkdir -p on every run: /tmp can be wiped between runs. Concurrent sessions
  // sharing the dir are fine: mkdir recursive is idempotent.
  await mkdir(dir, { recursive: true });
  ensured.add(dir);
  return dir;
}

export function scratchDirLink(ctx: ExtensionContext): string {
  const display = `📁 ${scratchDirName(resolve(ctx.cwd))}`;
  const { hyperlinks } = getCapabilities();
  if (!hyperlinks) {
    return display;
  }
  // The dir need not exist for the link to work.
  return hyperlink(display, pathToFileURL(scratchDir(ctx)).href);
}

export function isScratchPath(ctx: ExtensionContext, target: string): boolean {
  if (target === "") {
    return false;
  }
  const base = resolve(scratchDir(ctx));
  const abs = resolve(ctx.cwd, target);
  return abs.startsWith(base + sep);
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

export function scratchLink(ctx: ExtensionContext, target: string): string {
  // Shorten to the scratch-relative path when possible, regardless of hyperlink
  // support; the hyperlink only makes it clickable.
  const relPath = scratchRelPath(ctx, target);
  const displayPath = relPath === undefined ? target : relPath;
  const { hyperlinks } = getCapabilities();
  if (!hyperlinks) {
    return displayPath;
  }
  // Use a file:// URL: some terminals require a scheme in the OSC 8 target.
  return hyperlink(displayPath, pathToFileURL(resolve(ctx.cwd, target)).href);
}
