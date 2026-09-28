# eaiku

A local-first, forkable AI hub. Your own agent does the AI work; eaiku gives it plugins and a home for the results.

## Plugins

- **Catat**: `/catat <youtube-url>` turns a video into a note that explains, not compresses.

## Setup

Requirements: Node 22, pnpm, and Claude Code.

```bash
git clone git@github.com:stevenstacks/eaiku.git && cd eaiku
pnpm install
cd packages/cli && npm link && cd ../..   # puts `eaiku` on your PATH
eaiku doctor
```

In Claude Code, add this repo as a plugin marketplace and install Catat:

```
/plugin marketplace add /absolute/path/to/eaiku
/plugin install catat@eaiku
```

Then run `/catat https://www.youtube.com/watch?v=...`.

Notes are saved in `~/eaiku` (change it with `EAIKU_HOME`). If the database ever breaks, run `eaiku reindex`.

## Troubleshooting

- `better-sqlite3` fails to install: use Node 22 (`nvm use`) and run `pnpm rebuild better-sqlite3`.
