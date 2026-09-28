---
name: catat
description: Turn a YouTube video into an eaiku note that explains the content — hook, key takeaway, sections with analogies, key concepts, and open questions — with verified timestamp citations. Use when the user runs /catat or asks to take notes on a YouTube video.
---

# Catat: YouTube → eaiku note

Arguments: `<youtube-url> [--from m:ss --to m:ss] [--style friendly|textbook]`. Default style: `friendly`.

You do the thinking. The `eaiku` CLI does all YouTube access, validation, and saving. Never fetch YouTube yourself. Every CLI command prints JSON on stdout. On failure it prints `{"error": {code, message, details}}` on stderr and exits with code 1.

## 0. Preflight

Run `eaiku doctor`. If the command is not found, tell the user to run this once in the eaiku repo, then stop:

```
cd <eaiku-repo>/packages/cli && npm link
```

## 1. Fetch

Run `eaiku catat fetch "<url>"`. Keep `videoId`, `title`, `durationLabel`, and `draftsDir` from the output.

On error, explain it in one or two sentences and stop:
- `NO_CAPTIONS`: the video has no captions.
- `NO_ENGLISH_CAPTIONS`: show the available languages from the message. v0.1 supports English only.
- `BAD_URL`, `BLOCKED`, `EMPTY_TRANSCRIPT`, `FETCH_FAILED`: show the message.

## 2. Plan

- If the user gave `--from`/`--to`: make one note for that range, with **no** `series`. Go to step 3.
- Otherwise run `eaiku catat plan <videoId>`. Never read the whole transcript to plan.
  - `mode: "single"`: make one note for `parts[0]`, with **no** `series`. Go to step 3.
  - `mode: "chapters"` or `"grid"`: show the plan and wait for the user's choice:
    ```
    "<title>" is <durationLabel> long. I split it into <total> parts:
      1. 0:00–10:10  <title if any>  ✓ saved
      2. 10:10–19:55
      ...
    Make notes for: all / 1,2 / 1-3?
    ```
    Mark parts that have `savedNoteId` with ✓ and skip them unless the user asks to redo them. If there are more than 12 parts, show the first 10 and the last one. Suggest 3 parts or fewer for each run.

## 3. Write each note

Do the chosen parts **one at a time, in order**. For each part:

1. Read only this part: `eaiku catat read <videoId> --from <startLabel> --to <readUntilLabel>`. (For `--from`/`--to` notes, use the user's range.)
2. Set `source.range.startSec` to the part's `startSec`.
3. Set `source.range.endSec`:
   - `grid` mode: where the topic really ends. Pick the `[m:ss]` of the first line of the next topic, at or after `endSec` and not after `readUntilSec`. If the topic is still going at `readUntilSec`, use `readUntilSec`.
   - `chapters` and `single` modes: the part's `endSec`.
4. Set `series` for `chapters` and `grid` parts: `{ "id": "<videoId>", "part": <part>, "total": <total>, "partTitle": "<chapter title, or a short title you choose>" }`.
5. Write the draft with the Write tool to `<draftsDir>/<noteId>.json`, then save it (step 4).
6. Before the next part, run `eaiku catat plan <videoId>` again. The saved end moves the start of the next part.

### Writing guide: explain, do not compress

- **Hook** (max 280 chars): why should the reader care? Talk to the reader. No "In this video...".
- **Key takeaway** (max 280 chars): the one idea to remember, in plain words.
- **Sections** (3–8): each section teaches one idea. Explain *why*, not only *what*. Add an `analogy` where a real-world picture helps; skip it where it would feel forced. Body is Markdown (no HTML), 80–250 words.
- **Concepts** (3–12): terms a learner must know, each with a one or two sentence definition.
- **Open questions** (0–5): things the source *mentions but does not explain*. Each needs a `why`. Do not invent gaps. An empty list is fine.
- **Tags** (max 8): lowercase topic words.
- Auto-captions have no punctuation and have errors ("pie torch" = "PyTorch"). Fix words in your prose. **Never fix words inside a `quote`.**

Styles:
- `friendly`: warm, curious, short sentences, "you", everyday analogies, a little humor.
- `textbook`: neutral and precise, defined terms, no humor, analogies only when they help precision.

### Citations (checked by `save`)

- Every section and every concept needs at least one ref: `{ "kind": "timestamp", "startSec": <number>, "quote": "<exact words>" }`.
- `startSec` must be inside the note range. Use the `[m:ss]` of the transcript line you quote, converted to seconds.
- `quote`: 4–15 words copied **exactly** from the transcript, within 30 seconds of `startSec`. Case and punctuation do not matter; words do.

### Draft shape

- `id`: `<yyyy-mm-dd>-<kebab-title>`, and add `-p<part>` for series parts. Lowercase letters, digits, and dashes only.
- `createdAt`: current time in ISO 8601.
- `source`: `type: "youtube"`, `url`, `videoId`, `title`, `channel`, `durationSec`, `captionLang: "en"`, and `range: { startSec, endSec }`.
- `series` (only for a video split into parts): `{ id: <videoId>, part, total, partTitle }`.
- `generator`: `{ "agent": "claude-code", "model": "<your model id>", "promptVersion": "catat-v1" }`.

```json
{
  "schemaVersion": 1,
  "id": "2026-09-28-intro-to-llms-p2",
  "createdAt": "2026-09-28T10:00:00.000Z",
  "style": "friendly",
  "source": { "type": "youtube", "url": "https://www.youtube.com/watch?v=zjkBMFhNj_g", "videoId": "zjkBMFhNj_g", "title": "...", "channel": "...", "durationSec": 3588, "captionLang": "en", "range": { "startSec": 760, "endSec": 1445 } },
  "series": { "id": "zjkBMFhNj_g", "part": 2, "total": 6, "partTitle": "..." },
  "title": "...",
  "hook": "...",
  "keyTakeaway": "...",
  "sections": [{ "id": "kebab-id", "heading": "...", "body": "...", "analogy": "...", "refs": [{ "kind": "timestamp", "startSec": 772, "quote": "..." }] }],
  "concepts": [{ "term": "...", "definition": "...", "refs": [{ "kind": "timestamp", "startSec": 790, "quote": "..." }] }],
  "openQuestions": [{ "question": "...", "why": "..." }],
  "tags": ["..."],
  "generator": { "agent": "claude-code", "model": "...", "promptVersion": "catat-v1" }
}
```

## 4. Save

Run `eaiku catat save "<draft path>"`.

- `SCHEMA_INVALID`, `PLAN_MISMATCH`, or `CITATIONS_INVALID`: read the message and `details`, fix **only** the listed problems in the draft, and run `save` again. After **3** failed attempts, stop and show the remaining errors to the user.
- Success: tell the user the note title and the `url` from the output. For a series, list every saved part.
