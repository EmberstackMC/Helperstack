'use strict';
/** Stores login sessions in the same SQLite database, so you stay logged in across restarts. */
const session = require('express-session');

class SqliteSessionStore extends session.Store {
  constructor(db, { ttlMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
    super();
    this.ttlMs = ttlMs;
    this.q = {
      get: db.prepare('SELECT data FROM sessions WHERE sid = ? AND expires > ?'),
      set: db.prepare(`
        INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires
      `),
      del: db.prepare('DELETE FROM sessions WHERE sid = ?'),
      touch: db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?'),
      purge: db.prepare('DELETE FROM sessions WHERE expires <= ?'),
    };
    this.q.purge.run(Date.now());
    this.timer = setInterval(() => this.q.purge.run(Date.now()), 60 * 60 * 1000);
    this.timer.unref();
  }

  _expiry(sess) {
    const raw = sess?.cookie?.expires;
    const time = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(time) ? time : Date.now() + this.ttlMs;
  }

  get(sid, cb) {
    try {
      const row = this.q.get.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.data) : null);
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      this.q.set.run(sid, JSON.stringify(sess), this._expiry(sess));
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.q.del.run(sid);
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      this.q.touch.run(this._expiry(sess), sid);
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  }
}

module.exports = { SqliteSessionStore };
