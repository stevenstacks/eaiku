CREATE TABLE catat_notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  video_id TEXT NOT NULL,
  channel TEXT,
  style TEXT NOT NULL,
  start_sec REAL NOT NULL,
  end_sec REAL NOT NULL,
  series_id TEXT,
  part INTEGER,
  total INTEGER,
  hook TEXT NOT NULL,
  key_takeaway TEXT NOT NULL,
  created_at TEXT NOT NULL,
  path TEXT NOT NULL
);

CREATE INDEX catat_notes_series_idx ON catat_notes (series_id, part);

CREATE TABLE catat_note_tags (
  note_id TEXT NOT NULL REFERENCES catat_notes (id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (note_id, tag)
);

CREATE VIRTUAL TABLE catat_notes_fts USING fts5 (
  note_id UNINDEXED,
  title,
  hook,
  key_takeaway,
  sections_text,
  concepts_text
);
