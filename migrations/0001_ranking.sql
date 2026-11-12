-- Ranking dnia. Jeden wpis na urządzenie na dzień (liczy się pierwszy).
-- `device` to skrót SHA-256 losowego identyfikatora z przeglądarki; adresów IP nie zapisujemy.
-- `nick` = NULL oznacza wpis usunięty na prośbę gracza (zostaje tylko blokada ponownego zgłoszenia tego dnia).
CREATE TABLE IF NOT EXISTS scores (
  day        TEXT    NOT NULL,
  device     TEXT    NOT NULL,
  nick       TEXT,
  score      INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (day, device)
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (day, score DESC, created_at) WHERE nick IS NOT NULL;
CREATE INDEX IF NOT EXISTS scores_device ON scores (device);

-- Licznik wpisów na dzień (żeby nie liczyć wierszy przy każdym odczycie rankingu).
CREATE TABLE IF NOT EXISTS day_stats (
  day TEXT PRIMARY KEY,
  n   INTEGER NOT NULL DEFAULT 0
);
