# otto

A single Pi extension for directing a chat session and working with its scratch workspace:
steer a run that is already streaming, keep throwaway artifacts out of the repo, and kick off
planning runs with a fixed prompt.

## Install

Drop the file in your user extensions directory — Pi discovers it automatically, no `package.json`
and no build step (Pi loads TypeScript through `jiti`):

```text
~/.pi/agent/extensions/otto.ts
```

Run `/reload` in an active session after editing it, or restart Pi.

## Commands

| Command | Description |
|---|---|
| `/steer [message]` | Inject a message into the current run. With no argument, sends `"You have enough information, finalize your work"`. |
| `/scratch` | Open the session scratch directory with `xdg-open`. |
| `/artifact` | List the files in the scratch directory (recursively) and open the one you pick. |
| `/plan [task]` | Start a planning run that writes a plan with `Goal` and `Steps` sections to a fresh file in the scratch directory. |

Examples:

```text
/steer                                   # nudge the agent to wrap up
/steer use the second approach, not the first
/plan refactor the parser to drop the global state
/artifact                                # pick plan-*.md from the list
```

`/steer` and `/plan` both deliver their message with `deliverAs: "steer"`, so they work while the
agent is streaming. When the agent is idle the message simply starts a turn and nothing is
announced; when it is busy you get an "Steered …" notification.

`/plan` names each file `plan-<random>.md` in the scratch directory, so plans from different
sessions and different runs never collide.

## Scratch directory

Each session gets a private directory:

```text
/tmp/pi/scratch/<sessionId>/
```

otto adds a `scratch` section to the system prompt telling the model the path exists, that it may
create subdirectories with `mkdir -p`, and that plans, reviews, and reports belong there. Because
the path is fixed per session, the section text is stable across turns and Pi only patches the
prompt on the first run instead of invalidating the prompt cache every turn.

The directory is created on demand (`mkdir -p` on the first run of a session) because `/tmp` is
wiped between boots.

## Requirements

`xdg-open` must be on `PATH` for `/scratch` and `/artifact`. When it is missing or fails, `/scratch`
falls back to a notification that prints the path instead of opening it. This extension targets
Linux.

## Design notes

- **One extension, one file.** Everything registers on the same `ExtensionAPI` instance: one
  `before_agent_start` handler plus four commands. Command names are unique, so merging the
  original `otto` (session direction) and `scratchy` (scratch directory) extensions was additive.
- **Shared steer helper.** `/steer` and `/plan` both use the same "send as steer, notify only if the
  agent was busy" helper.
- **Artifact paths are rebuilt.** `readdir(dir, { recursive: true, withFileTypes: true })` reports
  only base names, so the full path is reconstructed from `entry.parentPath` before handing it to
  `xdg-open`.
- **Known gap.** The session id is used as a path segment without sanitising it
  (see the `TODO` in `ensureScratchDir`).
