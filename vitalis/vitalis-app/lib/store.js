'use strict';
// JSON-file user store. Fine for a demo or review; on Render's free tier the
// disk is wiped on every deploy, so move to a real database before real users.
const fs = require('fs');
const path = require('path');

const FILE = process.env.USERS_FILE || path.join(__dirname, '..', 'data', 'users.json');
let users = null;
let queue = Promise.resolve();

function load() {
  if (users) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    users = Array.isArray(parsed) ? parsed : [];
  } catch {
    users = [];
  }
}

// Writes are queued so two requests never write the file at the same time,
// and go through a temp file so a crash can't leave half a file behind.
function save() {
  queue = queue
    .then(async () => {
      await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
      const tmp = FILE + '.tmp';
      await fs.promises.writeFile(tmp, JSON.stringify(users, null, 2));
      await fs.promises.rename(tmp, FILE);
    })
    .catch((err) => console.error('Could not save users file:', err.message));
  return queue;
}

const normEmail = (e) => String(e || '').trim().toLowerCase();

module.exports = {
  normEmail,
  findByEmail(email) {
    load();
    const e = normEmail(email);
    return users.find((u) => u.email === e) || null;
  },
  findById(id) {
    load();
    return users.find((u) => u.id === id) || null;
  },
  findByGoogleId(gid) {
    load();
    return users.find((u) => u.googleId === gid) || null;
  },
  findByResetHash(hash) {
    load();
    return users.find((u) => u.resetTokenHash === hash) || null;
  },
  async create(user) {
    load();
    users.push(user);
    await save();
    return user;
  },
  // Mutate the user object you got from a find*() call, then call this.
  async persist() {
    load();
    await save();
  },
  count() {
    load();
    return users.length;
  },
};
