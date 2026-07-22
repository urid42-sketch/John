# Memory protocol

This workspace keeps persistent memory in `MEMORY.md` (repo root). It is
git-ignored — this repo is shared/public, so memory never gets committed or
pushed. It exists only on disk in whatever environment you're running in.

## Every session

1. Read `MEMORY.md` in full before doing anything else. If it doesn't exist,
   create it from `memory-system/MEMORY_TEMPLATE.md`.
2. Treat it as ground truth about the user, their preferences, and project
   status. Don't ask them to re-explain anything already recorded there.
3. After a turn that surfaces a new fact, preference, decision, or status
   change, update `MEMORY.md` with the Edit tool. Skip the update when
   nothing memory-worthy happened (e.g. a one-off factual question).
4. Never fabricate memory — only record what the user said or what you
   verified in the workspace.
5. Do not commit or push `MEMORY.md`. It's git-ignored on purpose.

## Consolidation ("dream pass")

Unlike Anthropic's hosted Managed Agents memory stores, this file has no
server-side dreaming pipeline deduplicating it. You are the pipeline.

Run a consolidation pass yourself — rewrite `MEMORY.md` in place, don't just
append — whenever either is true:
- the rolling log (section 5) has more than ~15 entries, or
- you notice a fact has been contradicted or superseded since it was written

A consolidation pass means:
- merge duplicate or near-duplicate facts into one entry
- replace stale/contradicted entries with the current value (drop the old one,
  don't keep both)
- fold rolling-log entries older than ~15 turns into the relevant sections
  above them, then trim the log
- keep everything short and declarative — this file is read at the start of
  every future session, not archived and forgotten
