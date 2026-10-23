// The api's database: one SQLite file (Node's built-in node:sqlite), copied to S3 by Litestream in production (ONLINE.md section 4).
// Every change of shape is a numbered step in MIGRATIONS, applied once, in order, on start.
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  // 1: accounts, sign-ins, sessions, email codes, matches and who played them, reported names
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     username TEXT UNIQUE COLLATE NOCASE,            -- NULL until the player picks one
     email TEXT,                                     -- lower case; NULL after the account is deleted
     created INTEGER NOT NULL,
     deleted INTEGER
   );
   CREATE TABLE identities (
     provider TEXT NOT NULL,                         -- email | google | discord | github
     subject TEXT NOT NULL,                          -- the provider's own id for the person (for email: the address)
     user_id INTEGER NOT NULL REFERENCES users(id),
     email TEXT,                                     -- a verified address the provider gave, if any
     created INTEGER NOT NULL,
     PRIMARY KEY (provider, subject)
   );
   CREATE INDEX identities_email ON identities(email);
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,                            -- sha256 of the cookie's value (the value itself is never stored)
     user_id INTEGER NOT NULL REFERENCES users(id),
     created INTEGER NOT NULL,
     expires INTEGER NOT NULL
   );
   CREATE TABLE email_codes (
     email TEXT PRIMARY KEY,
     hash TEXT NOT NULL,                             -- sha256 of the code with a server secret
     expires INTEGER NOT NULL,
     tries INTEGER NOT NULL DEFAULT 0,
     sent INTEGER NOT NULL DEFAULT 0,                -- codes sent in the current window
     window INTEGER NOT NULL                         -- when that window began
   );
   CREATE TABLE matches (
     id TEXT PRIMARY KEY,                            -- 8 lowercase letters or digits (also the name of its Kubernetes Job)
     starts_at INTEGER NOT NULL UNIQUE,              -- ms since 1970, on the hour
     status TEXT NOT NULL,                           -- scheduled | live | finished | empty | missed | abandoned | stopped | failed
     seed INTEGER NOT NULL,
     config TEXT NOT NULL,
     launched INTEGER,
     ended INTEGER,
     result TEXT
   );
   CREATE TABLE match_players (
     match_id TEXT NOT NULL REFERENCES matches(id),
     user_id INTEGER NOT NULL REFERENCES users(id),
     seat INTEGER NOT NULL,
     joined_at INTEGER NOT NULL,
     showed INTEGER NOT NULL DEFAULT 0,              -- 1 once the match reports they connected
     place INTEGER,
     points INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (match_id, user_id),
     UNIQUE (match_id, seat)
   );
   CREATE INDEX match_players_user ON match_players(user_id);
   CREATE TABLE name_reports (
     id INTEGER PRIMARY KEY,
     reporter INTEGER NOT NULL,
     user_id INTEGER NOT NULL,
     at INTEGER NOT NULL
   );`,
];

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');   // (WAL: what Litestream copies)
  db.exec('PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)');
  const row = db.prepare('SELECT v FROM schema_version').get();
  let v = row ? row.v : 0;
  if (!row) db.prepare('INSERT INTO schema_version (v) VALUES (0)').run();
  for (; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try { db.exec(MIGRATIONS[v]); db.prepare('UPDATE schema_version SET v = ?').run(v + 1); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return db;
}

// run fn inside one transaction (all or nothing)
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
