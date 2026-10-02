CREATE TABLE IF NOT EXISTS user_state (
  user_email TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS user_state_updated_at_idx
ON user_state (updated_at);
