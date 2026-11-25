-- Teams own resources through a non-login principal; existing ownership is unchanged.
ALTER TABLE users ADD COLUMN access_role TEXT NOT NULL DEFAULT 'member' CHECK(access_role IN ('member','admin','team'));
CREATE TABLE teams (
 id TEXT PRIMARY KEY REFERENCES users(id),
 name TEXT NOT NULL UNIQUE COLLATE NOCASE,
 leader_id TEXT NOT NULL REFERENCES users(id),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL
);
CREATE TABLE team_members (
 team_id TEXT NOT NULL REFERENCES teams(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN ('editor','viewer')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(team_id,user_id)
);
CREATE INDEX team_member_user ON team_members(user_id,team_id);
CREATE TABLE access_audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, target_id TEXT NOT NULL, team_id TEXT,
 detail TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX access_audit_team ON access_audit(team_id,created_at);
-- Keep the leader active even when two administration requests race.
CREATE TRIGGER team_leader_insert BEFORE INSERT ON teams
WHEN NEW.enabled=1 AND NOT EXISTS(SELECT 1 FROM users u JOIN accounts a ON a.user_id=u.id WHERE u.id=NEW.leader_id AND u.enabled=1)
BEGIN SELECT RAISE(ABORT,'TEAM_LEADER_REQUIRED'); END;
CREATE TRIGGER team_sync AFTER UPDATE ON teams
BEGIN
 UPDATE users SET name=NEW.name,enabled=NEW.enabled WHERE id=NEW.id;
 UPDATE api_keys SET enabled=0 WHERE owner_id=NEW.id AND (NEW.enabled=0 OR NEW.leader_id!=OLD.leader_id);
 UPDATE partner_tokens SET revoked=1 WHERE owner_id=NEW.id AND (NEW.enabled=0 OR NEW.leader_id!=OLD.leader_id);
END;
CREATE TRIGGER team_leader_update BEFORE UPDATE ON teams
WHEN NEW.enabled=1 AND NOT EXISTS(SELECT 1 FROM users u JOIN accounts a ON a.user_id=u.id WHERE u.id=NEW.leader_id AND u.enabled=1)
BEGIN SELECT RAISE(ABORT,'TEAM_LEADER_REQUIRED'); END;
CREATE TRIGGER team_leader_disable BEFORE UPDATE OF enabled ON users
WHEN NEW.enabled=0 AND EXISTS(SELECT 1 FROM teams WHERE leader_id=NEW.id AND enabled=1)
BEGIN SELECT RAISE(ABORT,'TEAM_LEADER_REQUIRED'); END;
