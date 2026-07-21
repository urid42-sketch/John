# Memory Protocol (Cowork / Claude Code)

<!--
Save this as CLAUDE.md at the repo root (or append it to an existing
CLAUDE.md). Claude Code reads CLAUDE.md automatically at the start of every
session in this workspace, so this protocol runs with no setup step per
session and no reminders needed.
-->

## Persistent memory

This workspace keeps a persistent memory file at `MEMORY.md` (repo root).
Follow this protocol automatically, every session, without being asked:

1. **At the start of every session**, read `MEMORY.md` in full before doing
   anything else. If it doesn't exist, create it from
   `memory-system/MEMORY_TEMPLATE.md`.

2. **Treat it as ground truth** about the user, their preferences, and the
   status of every project in this workspace. Don't ask the user to
   re-explain anything already recorded there.

3. **After every response you give in this session**, update `MEMORY.md`
   directly with the Edit tool (not by printing it in chat — you have real
   file access here, use it):
   - Update `Last updated` / `Updated by` at the top
   - Record new facts, preferences, decisions surfaced this turn
   - Update project status / next steps under section 2 if they changed
   - Update open threads (section 4): add new ones, remove resolved ones
   - Append one line to the rolling summary (section 6); fold entries older
     than ~15 into the relevant sections above and trim the log
   - Append one line to the changelog (section 7)

4. **If this workspace is a git repo**, commit the `MEMORY.md` change after
   updating it — a small commit per meaningful update (e.g.
   `memory: record decision on X`) is fine; don't batch many turns into one
   commit, since the point is the file staying current in real time. Don't
   push unless the user has already told you pushes are fine in this
   session, or ask if unsure — committing is local and safe, pushing is not
   yours to decide silently.

5. **Skip the update** only when truly nothing memory-worthy happened this
   turn (e.g. you just answered a one-off factual question with no bearing
   on ongoing work). Default to updating when in doubt — a stale memory file
   is the failure mode this protocol exists to prevent.

6. **Never fabricate memory.** Only record what the user actually said or
   what you verified in the workspace — don't guess and write it down as
   fact.

7. Keep entries short and declarative. This file is meant to be read by you
   at the start of every future session, not archived and forgotten.
