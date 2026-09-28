import fs from "node:fs/promises";
import path from "node:path";
import { CommandError, type PluginCommand } from "@eaiku/core";
import { getSeriesParts, indexNote } from "../db";
import { checkCitations } from "../lib/citations";
import { checkSeriesRange, computePlan } from "../lib/plan";
import { Note } from "../schema/note";
import { loadTranscript } from "./shared";

export const WEB_BASE_URL = "http://localhost:3000";

export const saveCommand: PluginCommand = async (args, ctx) => {
  const input = args[0];
  if (!input) throw new CommandError("Usage: eaiku catat save <draft.json>", undefined, "USAGE");
  const draftPath = path.resolve(input);

  let json: unknown;
  try {
    json = JSON.parse(await fs.readFile(draftPath, "utf8"));
  } catch (error) {
    throw new CommandError(
      `Cannot read the draft as JSON: ${(error as Error).message}`,
      undefined,
      "INVALID_JSON",
    );
  }

  const parsed = Note.safeParse(json);
  if (!parsed.success) {
    throw new CommandError(
      "The note does not match the schema. Fix each issue and run save again.",
      { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      "SCHEMA_INVALID",
    );
  }
  const note = parsed.data;
  if (note.source.type !== "youtube") {
    throw new CommandError("v0.1 supports YouTube notes only.", undefined, "UNSUPPORTED_SOURCE");
  }

  const transcript = await loadTranscript(ctx, note.source.videoId);

  if (note.series) {
    const part = note.series.part;
    const plan = computePlan(transcript, getSeriesParts(ctx.db, note.series.id, note.id));
    const problem = checkSeriesRange(note, plan);
    if (problem) {
      throw new CommandError(
        problem,
        { plannedPart: plan.parts.find((p) => p.part === part) ?? null },
        "PLAN_MISMATCH",
      );
    }
  }

  const errors = checkCitations(note, transcript);
  if (errors.length > 0) {
    throw new CommandError(
      "Citation check failed. Fix each ref and run save again.",
      { errors },
      "CITATIONS_INVALID",
    );
  }

  const rel = `notes/${note.id}/note.json`;
  await ctx.storage.writeJson(rel, note);
  indexNote(ctx.db, note, ctx.storage.path(rel));

  // Only delete drafts that live in our drafts folder, never a user's file elsewhere.
  if (draftPath.startsWith(ctx.storage.path("drafts") + path.sep)) await fs.rm(draftPath);

  return { noteId: note.id, path: ctx.storage.path(rel), url: `${WEB_BASE_URL}/p/catat/${note.id}` };
};
