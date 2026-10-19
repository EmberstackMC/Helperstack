-- Ticket system tables. Every table carries guild_id so more servers can be added later.

CREATE TABLE IF NOT EXISTS ticket_types (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id            TEXT    NOT NULL,
  name                TEXT    NOT NULL,
  emoji               TEXT    NOT NULL DEFAULT '',
  description         TEXT    NOT NULL DEFAULT '',
  button_label        TEXT    NOT NULL DEFAULT '',
  button_style        TEXT    NOT NULL DEFAULT 'primary',
  category_id         TEXT    NOT NULL DEFAULT '',
  staff_role_ids      TEXT    NOT NULL DEFAULT '[]',
  inherit_staff       INTEGER NOT NULL DEFAULT 1,
  naming_pattern      TEXT    NOT NULL DEFAULT 'ticket-{number}',
  welcome_title       TEXT    NOT NULL DEFAULT 'Ticket #{ticket-number}',
  welcome_description TEXT    NOT NULL DEFAULT 'Hi {user}, thanks for opening a **{ticket-type}** ticket. {staff-role} will be with you shortly. Please describe what you need.',
  welcome_color       TEXT    NOT NULL DEFAULT '',
  max_open_per_user   INTEGER NOT NULL DEFAULT 0,
  form_questions      TEXT    NOT NULL DEFAULT '[]',
  close_with_reason   INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ticket_types_guild ON ticket_types (guild_id);

CREATE TABLE IF NOT EXISTS ticket_panels (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id           TEXT    NOT NULL,
  name               TEXT    NOT NULL,
  channel_id         TEXT    NOT NULL DEFAULT '',
  message_id         TEXT    NOT NULL DEFAULT '',
  style              TEXT    NOT NULL DEFAULT 'button',
  type_ids           TEXT    NOT NULL DEFAULT '[]',
  embed_title        TEXT    NOT NULL DEFAULT '',
  embed_description  TEXT    NOT NULL DEFAULT '',
  embed_color        TEXT    NOT NULL DEFAULT '',
  embed_image        TEXT    NOT NULL DEFAULT '',
  embed_thumbnail    TEXT    NOT NULL DEFAULT '',
  embed_footer       TEXT    NOT NULL DEFAULT '',
  select_placeholder TEXT    NOT NULL DEFAULT 'Choose a ticket type',
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ticket_panels_guild ON ticket_panels (guild_id);

CREATE TABLE IF NOT EXISTS tickets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id          TEXT    NOT NULL,
  number            INTEGER NOT NULL,
  channel_id        TEXT    NOT NULL,
  type_id           INTEGER,
  type_name         TEXT    NOT NULL,
  user_id           TEXT    NOT NULL,
  user_name         TEXT    NOT NULL DEFAULT '',
  status            TEXT    NOT NULL DEFAULT 'open',      -- open | closed | deleted
  priority          TEXT    NOT NULL DEFAULT 'normal',    -- low | normal | high | urgent
  claimed_by        TEXT,
  form_answers      TEXT    NOT NULL DEFAULT '[]',
  created_at        INTEGER NOT NULL,
  first_response_at INTEGER,
  last_activity_at  INTEGER NOT NULL,
  warned_at         INTEGER,
  closed_at         INTEGER,
  closed_by         TEXT,
  close_reason      TEXT,
  reopened_count    INTEGER NOT NULL DEFAULT 0,
  rating            INTEGER,
  rating_comment    TEXT,
  UNIQUE (guild_id, number)
);
CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets (guild_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets (channel_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets (guild_id, user_id, status);

CREATE TABLE IF NOT EXISTS ticket_transcripts (
  ticket_id     INTEGER PRIMARY KEY REFERENCES tickets (id) ON DELETE CASCADE,
  html          TEXT    NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_counters (
  guild_id    TEXT PRIMARY KEY,
  next_number INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ticket_blacklist (
  guild_id   TEXT    NOT NULL,
  user_id    TEXT    NOT NULL,
  user_name  TEXT    NOT NULL DEFAULT '',
  reason     TEXT    NOT NULL DEFAULT '',
  added_by   TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
