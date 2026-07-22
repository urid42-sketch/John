# Memory system

Gives Claude Code persistent memory across sessions in this repo, via a
git-ignored `MEMORY.md` at the repo root plus the protocol in `CLAUDE.md`.

## Why this shape

An earlier version of this (commit 8f93d11) committed `MEMORY.md` straight
into git on every update. That's wrong for a shared/public repo like this
one: the file accumulates personal notes about the user and project
internals, and auto-committing it means that eventually gets pushed. This
version keeps `MEMORY.md` git-ignored instead — it lives only on the disk of
whatever environment the session is running in.

## Why consolidation instead of pure append

Anthropic's Managed Agents API has a hosted feature called
[Dreams](https://platform.claude.com/docs/en/managed-agents/dreams): given a
memory store and a batch of past session transcripts, it produces a
deduplicated, reorganized memory store — merging duplicates, replacing stale
entries with current values, surfacing new insights.

A plain append-only `MEMORY.md` has the same failure mode the Dreams doc
describes for memory stores in general: "over many sessions a memory store
accumulates duplicates, contradictions, and stale entries." There's no API
to offload that cleanup to here, so `CLAUDE.md` asks Claude to do it inline:
periodically rewrite `MEMORY.md` in place — merge duplicates, drop
superseded facts, fold and trim the rolling log — rather than only ever
appending to it.

## Files

- `MEMORY_TEMPLATE.md` — the empty starting shape of `MEMORY.md`, created on
  first use.
- `local/` — git-ignored scratch space for anything else session-local that
  shouldn't be committed.
