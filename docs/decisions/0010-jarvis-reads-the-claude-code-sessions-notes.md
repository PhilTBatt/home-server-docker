# 0010. Jarvis reads the Claude Code sessions' notes when he starts

- Date: 2026-11-18
- Status: accepted

## Context
Jarvis knows what's in the brain, but not what I've been doing lately. The two Claude Code sessions, one in `~/docker` and one in `~/hub-memory`, each keep their own notes for future sessions (auto memory), with a `MEMORY.md` index that Claude Code loads at the start of every session. On 15 Nov I chose for Jarvis to share those notes, with a weekly digest to come later. A decision was needed on how the notes reach him and what he's allowed to see.

## Options considered
- Mount each session's memory folder read-only, and add the first part of each `MEMORY.md` to his instructions when he starts: chosen. It's what Claude Code itself does with them, he never has to decide to look, and no tool of his has to reach outside the brain.
- Mount the whole `~/.claude/projects` folder: not chosen. It holds every session's full transcripts too, which is far more than he needs.
- A tool that reads the notes when he decides he needs them: not chosen for now. It would let him read the topic files as well, but it's a new tool reaching outside the brain, and loading the index at the start is what was chosen. It can follow if the index isn't enough.
- Copying the notes into the brain: not chosen. They'd go stale between copies, and the brain has its own way in (the inbox).

## Decision
With `JARVIS_SESSION_NOTES=on`, Jarvis reads `/notes/docker/MEMORY.md` and `/notes/brain/MEMORY.md` when he starts. He keeps only the first 200 lines or 25,000 characters of each, the limits Claude Code's docs give (they say 25KB), cut back to the end of a line, with hidden characters taken out. The notes are added to the end of his instructions, labelled by session and framed as information, never instructions, and any `notes` tag inside them is broken up so they can't close their own block. `host/jarvis.sh` mounts the two memory folders read-only, finding them the way Claude Code names them.

## Confidence and the case against
Fairly confident (Claude's estimate). The case against:
- The folder names come from Claude Code's naming as seen in a test (the full path with everything but letters and digits turned into `-`). The docs say the folder comes from the git repository, but don't give the format. If Claude Code changes it, Jarvis says he found none, rather than reading the wrong thing.
- The notes are written by Claude, not by me, so whatever a session decides to remember is shown to Jarvis too. That includes text from the internet a session has read, such as a torrent name, which could carry instructions; the framing and the broken-up tags make that less likely to work, not impossible.
- The cut isn't exactly Claude Code's. Reading the bundled Claude Code shows it also counts characters and cuts at a line end, but it adds a warning line where we say "cut short", and its handling of hidden characters may differ in small ways.

## Consequences
- Something like 12,000 to 17,000 tokens more in every request when both notes are full (Claude's estimate). The cache makes that cheaper while questions come within 5 minutes of each other. It also brings the chat-length warning closer.
- `host/jarvis.sh` mounts the folders whatever the setting says, so the script doesn't have to read `jarvis/.env` as well. They're read-only, and none of his tools can read outside the brain. The topic files are in the mounted folders too, but only `MEMORY.md` is read.
- The script doesn't know about Claude Code's `autoMemoryDirectory` setting. If that's ever set, he finds no notes.
- The notes are read once, when he starts. Typing `new` doesn't read them again; starting him again does.
- The log records whether any notes were loaded, so `npm run compare` keeps the two apart.
- The topic files next to `MEMORY.md`, and the weekly digest, are left for later.
