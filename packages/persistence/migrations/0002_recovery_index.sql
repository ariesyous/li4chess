-- Additive upgrade: v1 reader accepts this version; canonical record format unchanged.
CREATE INDEX games_quarantine ON games(quarantine) WHERE quarantine IS NOT NULL;
UPDATE persistence_schema SET version = 2 WHERE id = 1;
