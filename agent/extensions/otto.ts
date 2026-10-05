/**
 * otto - Functionality for directing a chat session.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function otto(pi: ExtensionAPI) {
  pi.registerCommand("steer", {
    description: `Inject a message into the current run. If no message is specified, the default fallback is used: "You have enough information, finalize your work")`,
    handler: async (args, ctx) => {
      const text = args?.trim() || "You have enough information, finalize your work";
      const steering = !ctx.isIdle();
      pi.sendUserMessage(text, { deliverAs: "steer" });
      // Only notify if steering was required.
      if (steering) ctx.ui.notify("Steered into current run", "info");
    },
  });
}
