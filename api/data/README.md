# The API's own data

The API keeps small files of its own here, mounted into its container at `/data`. Only this README is tracked; everything else is git-ignored.

- `mode.json`: the mode the hub is in (`MODES`, record 0068), so a restart keeps it. It holds the mode, when it started and ends, how it was set, how many phone alerts were being held (a count only, never the alerts) and the London day bedtime last started on its timer.
- `reminders.json`: the reminders, timers and timed mode switches (`REMINDERS`, record 0070), and the last day of reminders that went off, for Jarvis's feed. It holds what each reminder says, so keep it general. An unreadable one is moved aside to `reminders.json.bad`.
