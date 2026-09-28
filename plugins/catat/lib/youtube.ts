import { CommandError } from "@eaiku/core";
import { YoutubeTranscript } from "youtube-transcript";
import { parseChapters } from "./chapters";
import { toSegments, type Chapter, type Segment } from "./transcript";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
  "Accept-Language": "en",
};

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// Maps youtube-transcript error class names to stable codes for the agent.
const ERROR_CODES: Record<string, string> = {
  YoutubeTranscriptNotAvailableLanguageError: "NO_ENGLISH_CAPTIONS",
  YoutubeTranscriptDisabledError: "NO_CAPTIONS",
  YoutubeTranscriptNotAvailableError: "NO_CAPTIONS",
  YoutubeTranscriptVideoUnavailableError: "VIDEO_UNAVAILABLE",
  YoutubeTranscriptTooManyRequestError: "BLOCKED",
};

export async function fetchCaptions(videoId: string, lang = "en"): Promise<Segment[]> {
  let raw;
  try {
    // Always pass lang: without it, the package can return another language (seen: Arabic).
    raw = await YoutubeTranscript.fetchTranscript(videoId, { lang });
  } catch (error) {
    const name = (error as Error)?.constructor?.name ?? "Error";
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(message, { cause: name }, ERROR_CODES[name] ?? "FETCH_FAILED");
  }
  if (raw.length === 0) {
    throw new CommandError(
      "YouTube returned an empty transcript. YouTube may be blocking this request.",
      undefined,
      "EMPTY_TRANSCRIPT",
    );
  }
  return toSegments(raw);
}

export async function fetchOEmbed(videoId: string): Promise<{ title: string; channel?: string }> {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(videoId))}`;
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { title: `YouTube video ${videoId}` };
    const data = (await res.json()) as { title?: string; author_name?: string };
    return { title: data.title ?? `YouTube video ${videoId}`, channel: data.author_name };
  } catch {
    return { title: `YouTube video ${videoId}` };
  }
}

export async function fetchChapters(videoId: string): Promise<Chapter[]> {
  try {
    const res = await fetch(watchUrl(videoId), {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    return parseChapters(await res.text());
  } catch {
    return [];
  }
}
