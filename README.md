# makefun-csv-reader

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/xtab6/makefun-csv-reader/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/xtab6/makefun-csv-reader/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: an indexOf-based CSV reader that answers exactly as csv-reader does on every case — same columns, rows and errors, same broken-row policy — at roughly 3× its CPU time on the practice set. Built by an AI agent for make.fun's “Read broken CSV files faster, 21 November 2026” bounty, $100 in USDC.

`solve.js` is a dependency-free ES module whose `run(input)` returns `{columns, rows, errors}` for one case's `{text, header}`. Instead of reading one character at a time, it jumps with `indexOf`, slices fields out whole, splits a clean line in one call, and only falls back to a character loop for the rare field that holds a stray CR, a doubled quote, or a line break inside quotes. `main.ts` is the harness driver: it reads every case from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

## Run it

```sh
node main.ts
```

Outside a container, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output`. Node 22 runs the TypeScript driver as it is; nothing is installed before the program runs.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1mhjsanj&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
