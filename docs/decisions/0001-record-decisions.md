# 0001. Record significant decisions in the repo

- Date: 2026-11-13
- Status: accepted

## Context
This repo's decisions so far (Fastify, ntfy, Healthchecks.io, cookie login and others) were written up in private notes outside the repo. Anyone reading the code can see what was built but not why, or what was turned down.

## Options considered
- Keep them in private notes: not chosen. They aren't versioned with the code and nobody else can see them.
- GitHub issues or wiki: not chosen. They sit outside the code's history and are easy to lose track of.
- Markdown records in `docs/decisions/`: chosen. They're versioned with the code, reviewed in the same diffs, and readable by anyone.

## Decision
Each significant decision gets a numbered record in `docs/decisions/`, from `template.md`. Records start now; earlier decisions aren't back-filled.

## Confidence and the case against
Confident. The case against: writing records takes time, and it's easy to start writing them for trivial choices. The README limits them to decisions that are costly to reverse or likely to be questioned.

## Consequences
Every big decision comes with a short written record. Claude Code drafts them, and Phil reviews and commits them like any other change.