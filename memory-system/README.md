# Claude Memory System

A portable, file-based memory system for Claude. It works in two environments,
with two different levels of automation — read this before you set it up so
you know what to expect from each.

## What this actually does

Claude has no persistent memory of its own between separate conversations
(outside of Anthropic's own opt-in "memory" feature, if you have that turned
on). This kit fakes durable memory by keeping one structured file,
`MEMORY.md`, that Claude reads at the start of every conversation and rewrites
at the end of every response. As long as the file stays current, Claude
behaves as if it remembers you and your projects — no re-explaining, no
reminders.

**The honest limitation:** in a normal Claude.ai chat, Claude cannot save
files by itself. There is no tool call it can make to write back to your
Project's Knowledge base. So "real-time auto-save" only exists literally in
an agentic environment with file access — Claude Cowork / Claude Code (this
kind of session). In plain Claude.ai chat, the best available approximation
is: Claude prints the full, updated `MEMORY.md` at the end of every reply,
and you do one copy → replace-file action. That's the only way the memory
in Project Knowledge actually changes, because only you can change it there.

If your Claude.ai plan has the native "memory across chats" feature enabled,
that one *does* auto-save with zero action from you — but it's account-wide,
not project-scoped, and you can't inspect/edit it as a plain file. Use this
kit instead when you want memory that's portable, per-project, human-readable,
and inspectable/editable by you at any time.

## Files in this kit

| File | Where it goes | Purpose |
|---|---|---|
| `MEMORY_TEMPLATE.md` | Copy → rename to `MEMORY.md`, upload to Project Knowledge (chat) or commit to the repo root (Cowork) | The actual memory store |
| `PROJECT_INSTRUCTIONS.md` | Paste into the Project's "Instructions" field (Claude.ai chat) | Tells Claude how to read/update memory each turn |
| `COWORK_MEMORY_PROTOCOL.md` | Save as `CLAUDE.md` (or append to an existing one) in a Cowork/Claude Code repo | Tells Claude to auto-write `MEMORY.md` with real file tools, no copy/paste needed |

## Setup — Claude.ai chat (Projects)

1. Create (or open) a Project.
2. Copy `MEMORY_TEMPLATE.md` → rename your copy to `MEMORY.md`, fill in
   whatever you already know about yourself/your work, and upload it to
   **Project Knowledge** (the "files" area).
3. Open **Project → Instructions** (sometimes called "custom instructions")
   and paste in the full contents of `PROJECT_INSTRUCTIONS.md`.
4. Start chatting. At the end of every response Claude will output a section
   titled `## MEMORY.md — updated`. Copy that block, open the `MEMORY.md`
   file in Project Knowledge, and replace its contents. That's the "auto-save"
   step — it takes one paste, and Claude will remind you if the file is
   getting stale (i.e. if you haven't updated it in a while and new facts
   have piled up).
5. Every new chat in that Project now starts with full context: no reminders,
   no re-explaining.

## Setup — Claude Cowork / Claude Code (this kind of session)

This is the environment where "real-time, no manual step" is actually true,
because Claude has Read/Write/Edit tools against real files.

1. Put `MEMORY_TEMPLATE.md` at the root of the repo/workspace as `MEMORY.md`.
2. Put `COWORK_MEMORY_PROTOCOL.md` at the root as `CLAUDE.md` (or append its
   contents to an existing `CLAUDE.md` — Claude Code reads that file
   automatically at the start of every session).
3. From then on, in every session in this workspace, Claude will: read
   `MEMORY.md` before doing anything else, and update it with `Edit` after
   every response — new facts, decisions, open threads, project status —
   then commit the change if the workspace is a git repo. No reminders
   needed; it's a standing instruction, not something you re-ask for.

## Using both together

Point Cowork/Claude Code at the same repo that holds your Project's
`MEMORY.md` (export it from Project Knowledge, or keep the canonical copy in
git and re-upload to Project Knowledge periodically). Whichever surface you
used last has the freshest file — treat `MEMORY.md` as the single source of
truth and move it between the two rather than keeping two forks.

## What NOT to store in MEMORY.md

Don't put passwords, API keys, financial account numbers, or anything you
wouldn't want sitting in a plaintext file you're pasting into a chat window
repeatedly. Reference "where it's stored" instead of the secret itself.
