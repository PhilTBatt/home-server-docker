# 0027. More searches live in a catalogue file that the main list names

- Date: 2026-11-19
- Status: proposed

## Context
I wanted about ten times as many searches, across every kind of part, ready to switch on. `deals/searches.json` is mine to edit, and pasting 70 searches into it would bury my own.

## Options considered
- Replace `searches.json` with a bigger one: a whole-file swap, and my own edits get lost.
- Add the searches to `searches.example.json`: the example would no longer be a small place to start.
- A separate catalogue file, named from the main file with `"more": ["catalogue.json"]`: chosen.

## Decision
`searches.json` can name up to 5 other files in the deals folder. Each holds only a `searches` list. Limits, quiet hours and the postcode stay in the main file, ids can't repeat, and there can be 150 searches in all. Each search can have a `group` (the kind of part), which Claude's tools filter on. The repo ships `catalogue.example.json` with 70 searches, every one off.

## Confidence and the case against
High for the file arrangement. Low for many of the catalogue's guide prices, which are estimates; only RAM and storage have dated price evidence. Against: a second file is one more place to look when a search misbehaves. Problems name the file to help with that.

## Consequences
I switch searches on in the catalogue one at a time and set my own guide price first. A wrong category finds nothing silently, so only RAM has one; the rest wait for the category lookup.
