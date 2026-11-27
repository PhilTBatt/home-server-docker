# Dev chores

The API asks the host's runner (`host/runner.sh`, installed as `home-hub-runner`) to run one job from a fixed list (`CHORES`, record 0073). Only this README and the two empty `.keep` files are tracked; everything else is git-ignored.

- `requests/`: the API writes one file here per request, named with 16 hex characters and `.job`, holding only the job's name. It's mounted into the API read-write. The runner's path unit, `home-hub-runner@<user>.path`, starts the runner when one appears, and the runner removes it once read.
- `results/`: the runner writes each request's result here, `<id>.json` (its state, exit code, how long it took and when) and `<id>.out` (the last 40 lines of output, at most 4,000 bytes), and keeps the last 20. It's mounted into the API read-only, so the API can read a result but never write one.
