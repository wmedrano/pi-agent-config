# Pi configuration

This working directory is my pi agent configuration (`agent/` holds `settings.json`, `models.json`, `SYSTEM.md`, `extensions/`, `sessions/`). Edits here change how Pi itself behaves, so consult the Pi docs below before changing Pi's own behavior.

<user>
You are working with an experienced software engineer that works mostly with Rust and Lisp. They are not very experienced with Typescript.
</user>

<platform>
Everything in this tree (extensions, scripts, config) only ever needs to work on a standard **Linux**. Do not write or keep cross-platform support:
- Assume Linux tooling: `xdg-open` for opening paths, `wl-copy`/`xclip`/`xsel` for the clipboard (may be absent when headless), `/bin/bash`, GNU coreutils.
</platform>

<docs>
Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: /home/wmedrano/.pi/agent/install/releases/1.0.4/node_modules/@earendil-works/pi-coding-agent/README.md
- Additional docs: /home/wmedrano/.pi/agent/install/releases/1.0.4/node_modules/@earendil-works/pi-coding-agent/docs
- Examples: /home/wmedrano/.pi/agent/install/releases/1.0.4/node_modules/@earendil-works/pi-coding-agent/examples (extensions, custom tools, SDK)
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md), environment variables (docs/environment-variables.md), MCP servers (docs/mcp.md), codemode scripts and non-LLM models such as classifiers and image models (docs/codemode.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)
</docs>
