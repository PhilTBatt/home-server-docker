# projector

The projector module's own folder, mounted into the API container at `/projector`. Git ignores everything in it except this file.

- `remote.json`: written by the API when you pair the projector from the hub app. It holds the hub's own certificate and private key for the Android TV Remote protocol, which the projector trusts once paired: anyone with this file on your network can press the projector's buttons as the hub can. The API writes it readable only by its own user (mode 600). Never copy it, print it or commit it, and Claude Code is told not to read this folder.
- `remote.json.saving`: only there for a moment while the API writes `remote.json`. A leftover one is a save that was cut off, and is safe to delete while the API is stopped.
- `remote.json.bad-<time>`: a pairing file the API couldn't read, moved aside rather than lost. It's safe to delete.

The hub app's Forget button (tapped twice) unpairs the hub and deletes `remote.json`, any copies moved aside and a half-written one; deleting them yourself while the API is stopped does the same. The projector itself may still list the hub as a paired remote; its own settings can remove it (where they are depends on its software, not checked).
