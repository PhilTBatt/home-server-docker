# Restoring from a backup

How to get files back from the restic backups. The parts marked "tested" were done for real on 15 Nov 2026, against a test store at `/srv/backup-test` on the server's own disk. The rest is the plan for a bigger restore, such as moving to new hardware, and needs checking the first time it's done.

## What's in a backup
- `~/docker`, including every `.env` file and Caddy's `caddy/data` (so the HTTPS root certificate comes back too, and devices keep trusting it).
- `~/hub-memory`, `~/.claude` and `~/.claude.json`.
- Not media, and not `jellyfin/cache`.

## What you need
- restic: `sudo apt install restic`.
- Where the backups are: `RESTIC_REPOSITORY` in `/etc/home-hub/backup.env`.
- The password. On the server it's in `/etc/home-hub/restic-password`. If the server is gone, use the copy kept off the server: without the `--password-file` option, restic asks for it. Without the password nothing can be restored.

## See which backups exist
```
sudo restic snapshots --repo <repository> --password-file /etc/home-hub/restic-password
```
Each line is one backup, with its ID, time and the folders it holds. `latest` in the commands below means the newest one.

## Restore one folder or file (tested)
Restore into a temporary folder first, never straight over the live copy:
```
sudo restic restore latest --repo /srv/backup-test --password-file /etc/home-hub/restic-password --target /tmp/restore-test --include /home/phil/hub-memory --include /home/phil/docker/api/.env
```
- Each file comes back under its full path inside the target, so `~/hub-memory` lands in `/tmp/restore-test/home/phil/hub-memory`.
- Owners and permissions come back as they were: the restored notes belonged to uid 1000, like the originals.
- On the test it printed `Restored 439 / 435 files/dirs (177.729 KiB / 177.729 KiB)` and took under a second.

Check it against the original without showing any contents:
```
sudo diff -rq ~/hub-memory /tmp/restore-test/home/phil/hub-memory
sudo cmp ~/docker/api/.env /tmp/restore-test/home/phil/docker/api/.env
```
Both print nothing when the files match. Copy back what you need, then delete the restored copy, because it can hold secrets: `sudo rm -rf /tmp/restore-test`.

## Restore an app's data (not tested yet)
1. Stop the app: `docker compose stop jellyfin`.
2. Restore its folder to `/tmp/restore-test` as above, with `--include /home/phil/docker/jellyfin/config`.
3. Move the live folder aside, move the restored one into its place, and start the app: `docker compose start jellyfin`.
4. Once it works, delete the old copy and `/tmp/restore-test`.

## Rebuild the whole server (not tested yet)
1. Install Ubuntu Server, Docker and restic, with the same user name, so the paths match.
2. Make `/etc/home-hub/` again: the folder, the password from the copy kept off the server, and `backup.env`.
3. Restore everything to its original place, with nothing running yet: the same restore command with `--target /` and no `--include`.
4. Reinstall the files that live outside Docker from `host/` (the Wi-Fi watchdog and the backup script and units), as CLAUDE.md describes.
5. `docker compose up -d`, then sign Claude Code in again.

## The first real backup (15 Nov 2026)
- 8,807 files and 684 MiB read; 257 MiB stored after compression.
- The backup itself took about 2 seconds. The eight apps it stops were down for around 10 seconds.