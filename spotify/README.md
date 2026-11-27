# spotify

The Spotify module's own folder, mounted into the API container at `/spotify`. Git ignores everything in it except this file.

- `tokens.json`: written by the API when you sign in on the hub's Spotify page (`hub.home/spotify.html`), and again each time it renews the sign-in. It holds the refresh token, a secret that lets the hub control your Spotify until you sign out or remove the app's access in your Spotify account, plus the permissions granted and when it was signed in and last renewed. The API writes it readable only by its own user (mode 600). Never copy it, print it or commit it, and Claude Code is told not to read this folder.
- `tokens.json.saving`: only there for a moment while the API writes `tokens.json`. A leftover one is a save that was cut off, and is safe to delete while the API is stopped.

Deleting `tokens.json` while the API is stopped signs the hub out; the Spotify page's "Sign out" button does the same while it's running. To stop the hub's access for good, also remove the app under "Manage apps" in your Spotify account.
