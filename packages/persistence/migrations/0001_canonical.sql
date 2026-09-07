-- Append-only canonical history. Application code never runs initialization DDL.
CREATE TABLE persistence_schema (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL);
INSERT INTO persistence_schema VALUES (1, 1);
CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL, created_at INTEGER NOT NULL CHECK (created_at >= 0)) STRICT;
CREATE TABLE identities (
  issuer TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (issuer, subject)
) STRICT;
CREATE TABLE games (
  id TEXT PRIMARY KEY NOT NULL,
  header_json TEXT NOT NULL CHECK (json_valid(header_json)), header_hash TEXT NOT NULL,
  owner_namespace TEXT NOT NULL, owner_generation INTEGER NOT NULL CHECK (owner_generation > 0),
  command_seq INTEGER NOT NULL DEFAULT 0 CHECK (command_seq >= 0),
  event_seq INTEGER NOT NULL DEFAULT 0 CHECK (event_seq >= 0),
  state_hash TEXT NOT NULL, chain_hash TEXT NOT NULL,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('active', 'terminal')),
  quarantine TEXT
) STRICT;
CREATE TABLE commands (
  game_id TEXT NOT NULL REFERENCES games(id), id TEXT NOT NULL,
  seq INTEGER NOT NULL CHECK (seq > 0), first_event INTEGER NOT NULL, last_event INTEGER NOT NULL,
  before_hash TEXT NOT NULL, after_hash TEXT NOT NULL, previous_chain TEXT NOT NULL,
  owner_namespace TEXT NOT NULL, owner_generation INTEGER NOT NULL,
  command_hash TEXT NOT NULL, commit_hash TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
  PRIMARY KEY (game_id, id), UNIQUE (game_id, seq),
  CHECK (first_event > 0 AND last_event >= first_event AND last_event - first_event < 32)
) STRICT;
CREATE TABLE events (
  game_id TEXT NOT NULL, seq INTEGER NOT NULL, command_seq INTEGER NOT NULL,
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  PRIMARY KEY (game_id, seq),
  FOREIGN KEY (game_id, command_seq) REFERENCES commands(game_id, seq)
) STRICT;
CREATE INDEX events_command ON events(game_id, command_seq, seq);
CREATE TABLE checkpoints (
  game_id TEXT NOT NULL REFERENCES games(id), command_seq INTEGER NOT NULL,
  event_seq INTEGER NOT NULL, state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  state_hash TEXT NOT NULL, chain_hash TEXT NOT NULL,
  PRIMARY KEY (game_id, command_seq)
) STRICT;
CREATE TABLE results (
  game_id TEXT PRIMARY KEY NOT NULL REFERENCES games(id), command_seq INTEGER NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)), result_hash TEXT NOT NULL
) STRICT;

-- Raising a constraint error is essential: a conditional INSERT/UPDATE with
-- zero affected rows is not an error and would allow other batch writes.
CREATE TRIGGER command_fence BEFORE INSERT ON commands BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM games g WHERE g.id = NEW.game_id AND g.quarantine IS NULL AND g.lifecycle = 'active'
    AND g.owner_namespace = NEW.owner_namespace AND g.owner_generation = NEW.owner_generation
    AND g.command_seq + 1 = NEW.seq AND g.event_seq + 1 = NEW.first_event
    AND g.state_hash = NEW.before_hash AND g.chain_hash = NEW.previous_chain
    AND g.header_hash = json_extract(NEW.record_json, '$.headerHash')
  ) THEN RAISE(ABORT, 'canonical fence') END;
END;
CREATE TRIGGER event_boundary BEFORE INSERT ON events BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM commands c JOIN games g ON g.id = c.game_id
    WHERE c.game_id = NEW.game_id AND c.seq = NEW.command_seq
    AND c.seq = g.command_seq + 1 AND NEW.seq BETWEEN c.first_event AND c.last_event
    AND json_extract(NEW.event_json, '$.sequence') = NEW.seq
  ) THEN RAISE(ABORT, 'event boundary') END;
END;
CREATE TRIGGER head_boundary BEFORE UPDATE OF command_seq, event_seq, state_hash, chain_hash, lifecycle ON games
WHEN NEW.command_seq != OLD.command_seq OR NEW.event_seq != OLD.event_seq OR NEW.state_hash != OLD.state_hash
  OR NEW.chain_hash != OLD.chain_hash OR NEW.lifecycle != OLD.lifecycle
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM commands c WHERE c.game_id = OLD.id AND c.seq = OLD.command_seq + 1
    AND NEW.command_seq = c.seq AND NEW.event_seq = c.last_event
    AND NEW.state_hash = c.after_hash AND NEW.chain_hash = c.commit_hash
    AND c.previous_chain = OLD.chain_hash AND c.before_hash = OLD.state_hash
    AND c.owner_namespace = OLD.owner_namespace AND c.owner_generation = OLD.owner_generation
    AND OLD.quarantine IS NULL AND OLD.lifecycle = 'active'
    AND (SELECT count(*) FROM events e WHERE e.game_id = c.game_id AND e.command_seq = c.seq) = c.last_event - c.first_event + 1
    AND (json_extract(c.record_json, '$.checkpointHash') IS NULL OR EXISTS (
      SELECT 1 FROM checkpoints p WHERE p.game_id = c.game_id AND p.command_seq = c.seq
      AND p.event_seq = c.last_event AND p.state_hash = json_extract(c.record_json, '$.checkpointHash') AND p.chain_hash = c.commit_hash))
    AND ((NEW.lifecycle = 'active' AND json_extract(c.record_json, '$.resultHash') IS NULL
      AND NOT EXISTS (SELECT 1 FROM results r WHERE r.game_id = c.game_id))
      OR (NEW.lifecycle = 'terminal' AND EXISTS (SELECT 1 FROM results r WHERE r.game_id = c.game_id
        AND r.command_seq = c.seq AND r.result_hash = json_extract(c.record_json, '$.resultHash'))))
  ) THEN RAISE(ABORT, 'incomplete canonical batch') END;
END;
CREATE TRIGGER immutable_game BEFORE UPDATE OF id, header_json, header_hash ON games BEGIN SELECT RAISE(ABORT, 'immutable game'); END;
CREATE TRIGGER immutable_commands BEFORE UPDATE ON commands BEGIN SELECT RAISE(ABORT, 'immutable commands'); END;
CREATE TRIGGER retain_commands BEFORE DELETE ON commands BEGIN SELECT RAISE(ABORT, 'retain commands'); END;
CREATE TRIGGER immutable_events BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'immutable events'); END;
CREATE TRIGGER retain_events BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'retain events'); END;
CREATE TRIGGER immutable_results BEFORE UPDATE ON results BEGIN SELECT RAISE(ABORT, 'immutable results'); END;
CREATE TRIGGER retain_results BEFORE DELETE ON results BEGIN SELECT RAISE(ABORT, 'retain results'); END;
CREATE TRIGGER immutable_checkpoints BEFORE UPDATE ON checkpoints BEGIN SELECT RAISE(ABORT, 'immutable checkpoint'); END;
CREATE TRIGGER retain_recovery BEFORE DELETE ON checkpoints
WHEN OLD.command_seq = 0 OR OLD.command_seq = (SELECT max(command_seq) FROM checkpoints WHERE game_id = OLD.game_id)
BEGIN SELECT RAISE(ABORT, 'retain recovery checkpoint'); END;
