/**
 * Prompt text used by the otto extension, kept separate from event wiring.
 */

/** The prompt sent to the agent for the /plan command. */
export function planPrompt(path: string): string {
  return `# Instructions

Create a plan for the task and write it to ${path}

- Do not edit any files in the workspace.
- The plan must contain the following sections: [Goal, Steps]
- Work on the plan once the user gives explicit approval.`;
}

/** System prompt section describing the session scratch directory. */
export function scratchSystemPrompt(dir: string): string {
  return [
    `Scratch directory: ${dir}`,
    "- The scratch directory may be shared, prefer unique names for files to avoid clobbering.",
    "- Use it for temporary files: drafts, reports, intermediate output, throwaway logs, one-off scripts.",
    "- It already exists; make subdirectories with mkdir -p as needed.",
    "- Common use case: Store markdown files for requested plans, reviews, or reports."
  ].join("\n");
}

/** Follow-up message injected after a plan is drafted and auto-approved. */
export function executePlanMessage(): string {
  return "Execute the plan if it is ready. If not, ask me clarifying questions.";
}
