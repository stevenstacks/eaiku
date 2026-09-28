import { CommandError } from "@eaiku/core";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseVideoId(input: string): string {
  if (VIDEO_ID.test(input)) return input;

  let id: string | null = null;
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^(www|m)\./, "");
    if (host === "youtu.be") {
      id = url.pathname.split("/")[1] ?? null;
    } else if (host === "youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else id = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null;
    }
  } catch {
    id = null;
  }

  if (!id || !VIDEO_ID.test(id)) {
    throw new CommandError(`Not a YouTube video URL: ${input}`, undefined, "BAD_URL");
  }
  return id;
}
