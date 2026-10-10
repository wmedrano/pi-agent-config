/** Isolated, tool-free side questions using the current conversation's cached prefix. */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  getCurrentSystemMessage, type AssistantMessage, type Message, type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import {
  convertToLlm, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Scratchy } from "./scratch.js";

type Snapshot = {
  messages: Message[];
  model: NonNullable<ExtensionContext["model"]>;
  options: SimpleStreamOptions;
};

type Pending = {
  controller: AbortController;
};

const instruction = "This is a BTW side question. Answer it immediately using only the " +
  "conversation above and your existing knowledge. Do not use or request any tools. " +
  "Do not continue the main task.\n\n";

function answerText(message: AssistantMessage): string {
  return message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Btw {
  private latest?: Snapshot;
  private pending?: Pending;

  constructor(private pi: ExtensionAPI) {
    // This event includes prompt/tool transitions and context-handler changes.
    // Clone it: the main request and its tools keep running while BTW answers.
    pi.on("context_with_system", (event, ctx) => {
      if (ctx.model) this.latest = this.snapshot(convertToLlm(event.messages), ctx);
    });
    pi.on("session_start", () => this.reset());
    pi.on("session_shutdown", () => this.reset());
    pi.on("session_tree", () => { this.latest = undefined; });
    pi.on("session_compact", () => { this.latest = undefined; });
  }

  private reset() {
    this.latest = undefined;
    this.pending?.controller.abort();
    this.pending = undefined;
  }

  private snapshot(messages: Message[], ctx: ExtensionContext): Snapshot {
    const settings = this.pi.getSettings();
    return {
      messages: structuredClone(messages),
      model: structuredClone(ctx.model!),
      options: {
        sessionId: ctx.sessionManager.getSessionId(),
        reasoning: ctx.thinkingLevel === "off" ? undefined : ctx.thinkingLevel,
        thinkingBudgets: structuredClone(settings.thinkingBudgets),
        // Share cache affinity, but not a session-owned WebSocket connection.
        transport: "sse",
        // Leave cacheRetention and toolChoice unset, just like normal Pi requests.
      },
    };
  }

  private getSnapshot(ctx: ExtensionCommandContext): Snapshot | undefined {
    if (!ctx.isIdle()) return this.latest;
    const messages = convertToLlm(ctx.sessionManager.buildSessionProjection().messages);
    if (messages[0]?.role !== "system") {
      const hidden = new Set(ctx.getSystemPromptOptions().hiddenTools ?? []);
      const allTools = new Map(this.pi.getAllTools().map((tool) => [tool.name, tool]));
      // A fresh session has no recorded prompt/tools and no cache to reuse yet.
      messages.unshift({
        role: "system",
        content: ctx.getSystemPrompt(),
        toolsAdded: this.pi.getActiveTools().flatMap((name) => {
          const tool = allTools.get(name);
          return tool && !hidden.has(name)
            ? [{ name, description: tool.description, parameters: tool.parameters }]
            : [];
        }),
        timestamp: Date.now(),
      });
    }
    return this.snapshot(messages, ctx);
  }

  async answer(
    prompt: string, ctx: ExtensionCommandContext, scratchy: Scratchy,
  ): Promise<{ path: string; truncated: boolean } | undefined> {
    if (!prompt.trim()) {
      ctx.ui.notify("Usage: /btw <prompt>", "warning");
      return;
    }
    if (this.pending) {
      ctx.ui.notify("A BTW question is already open. Close it before asking another.", "warning");
      return;
    }
    if (!ctx.model) {
      ctx.ui.notify("No model selected for /btw", "error");
      return;
    }
    const snapshot = this.getSnapshot(ctx);
    if (!snapshot) {
      ctx.ui.notify("The main request is still preparing. Retry /btw shortly.", "warning");
      return;
    }

    const messages = structuredClone(snapshot.messages);
    // Pi applies hidden-declaration filtering after context_with_system. Match
    // that projection here so codemode's hidden tools don't change the prefix.
    const hidden = new Set(ctx.getSystemPromptOptions().hiddenTools ?? []);
    for (const message of messages) {
      if (message.role !== "system") continue;
      if (message.toolsAdded) {
        message.toolsAdded = message.toolsAdded.filter((tool) => !hidden.has(tool.name));
        if (!message.toolsAdded.length) delete message.toolsAdded;
      }
      if (message.toolsRemoved) {
        message.toolsRemoved = message.toolsRemoved.filter((tool) => !hidden.has(tool.name));
        if (!message.toolsRemoved.length) delete message.toolsRemoved;
      }
    }
    const forcedPrompt = ctx.getSystemPromptOptions().forceSystemPrompt;
    if (forcedPrompt !== undefined) {
      const current = getCurrentSystemMessage(messages);
      const conversation = messages.filter((message) => message.role !== "system");
      messages.splice(0, messages.length, {
        role: "system", content: forcedPrompt,
        toolsAdded: current?.toolsAdded, timestamp: current?.timestamp ?? Date.now(),
      }, ...conversation);
    }
    messages.push({ role: "user", content: instruction + prompt, timestamp: Date.now() });

    const pending: Pending = { controller: new AbortController() };
    this.pending = pending;
    const run = async (): Promise<{ path: string; truncated: boolean } | undefined> => {
      try {
        const stream = ctx.modelRegistry.streamSimple(snapshot.model, { messages }, {
          ...snapshot.options, signal: pending.controller.signal,
        });
        for await (const event of stream) {
          if (pending.controller.signal.aborted) return;
          if (event.type === "error") {
            throw new Error(event.error.errorMessage || `Provider stopped: ${event.reason}`);
          }
        }
        const response = await stream.result();
        if (pending.controller.signal.aborted) return;
        if (response.content.some((part) => part.type === "toolCall") || response.stopReason === "toolUse") {
          throw new Error("The model requested tools instead of answering. No tools were executed.");
        }
        if (response.stopReason !== "stop" && response.stopReason !== "length") {
          throw new Error(response.errorMessage || `Provider stopped: ${response.stopReason}`);
        }
        const answer = answerText(response);
        if (!answer.trim()) throw new Error("The model returned no answer.");
        const truncated = response.stopReason === "length";
        const document = `# BTW\n\n## Question\n\n${prompt}\n\n## Answer\n\n${answer}\n` +
          (truncated ? "\n> Response truncated by the model's output limit.\n" : "");
        try {
          await scratchy.ensureScratchDir();
          const path = scratchy.reserve("btw", "md");
          await mkdir(dirname(path), { recursive: true });
          if (pending.controller.signal.aborted) return;
          await writeFile(path, document, { flag: "wx", signal: pending.controller.signal });
          if (pending.controller.signal.aborted) return;
          return { path, truncated };
        } catch (error) {
          if (pending.controller.signal.aborted) return;
          ctx.ui.notify(`Could not save BTW answer: ${errorText(error)}`, "error");
          return;
        }
      } catch (error) {
        if (pending.controller.signal.aborted) return;
        ctx.ui.notify(`BTW failed: ${errorText(error)}`, "error");
        return;
      }
    };

    try {
      // Awaiting run() drains the stream, so no explicit abort is needed here.
      return await run();
    } finally {
      if (this.pending === pending) this.pending = undefined;
    }
  }
}
