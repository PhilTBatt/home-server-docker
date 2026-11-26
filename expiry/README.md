# expiry

The expiry checker's own folder, mounted into the API container at `/expiry`. Git ignores everything in it except this file.

- `items.json`: your list of things that expire. Copy `api/src/modules/expiry/items.example.json` here to start, and edit it in VS Code. Each item has a `name`, a `date` written `YYYY-MM-DD`, and an optional `note`. The API reads it again before every check, so a change needs no restart.
- It holds names and dates only, never a key, token or password. A name (up to 40 characters) or note (up to 100) is refused if it has anything but letters, digits, spaces and `' - . , ( ) & / + : _`, a word over 20 characters, or a word of 12 or more mixing letters and digits, since that could be a key pasted in by mistake. The error says which entry, by its number, and never repeats what was refused. Names and notes go to your phone through ntfy.sh, so keep them general.
- `sent.json`: written by the API. It holds, for each item, the date and the last warning sent for it, so a restart doesn't send one again. Deleting it while the API is stopped is safe: each item within 30 days, or overdue, gets one warning for where it is now.
