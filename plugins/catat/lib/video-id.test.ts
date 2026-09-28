import { describe, expect, it } from "vitest";
import { parseVideoId } from "./video-id";

describe("parseVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=kCc8FmEb1nY", "kCc8FmEb1nY"],
    ["https://youtube.com/watch?v=kCc8FmEb1nY&t=760s", "kCc8FmEb1nY"],
    ["https://m.youtube.com/watch?v=kCc8FmEb1nY", "kCc8FmEb1nY"],
    ["https://youtu.be/kCc8FmEb1nY?si=abc", "kCc8FmEb1nY"],
    ["https://www.youtube.com/shorts/kCc8FmEb1nY", "kCc8FmEb1nY"],
    ["https://www.youtube.com/embed/kCc8FmEb1nY", "kCc8FmEb1nY"],
    ["kCc8FmEb1nY", "kCc8FmEb1nY"],
    // zsh url-quote-magic escapes ? = & on paste; inside double quotes the backslashes stay.
    ["https://www.youtube.com/watch\\?v\\=reDRM0tqhNs", "reDRM0tqhNs"],
    ["https://www.youtube.com/watch\\?v\\=kCc8FmEb1nY\\&t\\=760s", "kCc8FmEb1nY"],
  ])("reads %s", (input, expected) => {
    expect(parseVideoId(input)).toBe(expected);
  });

  it.each(["https://vimeo.com/123", "https://www.youtube.com/@channel", "not a url"])(
    "rejects %s",
    (input) => {
      expect(() => parseVideoId(input)).toThrow("Not a YouTube video URL");
    },
  );
});
