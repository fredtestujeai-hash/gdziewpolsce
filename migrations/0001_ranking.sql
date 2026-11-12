CREATE TABLE IF NOT EXISTS scores (day TEXT NOT NULL, device TEXT NOT NULL, nick TEXT, score INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (day, device));
CREATE INDEX IF NOT EXISTS scores_rank ON scores (day, score DESC, created_at) WHERE nick IS NOT NULL;
CREATE INDEX IF NOT EXISTS scores_device ON scores (device);
CREATE TABLE IF NOT EXISTS day_stats (day TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0);
