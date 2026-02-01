import Database from 'better-sqlite3';

const db = new Database('rag-clip.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT,
    url TEXT,
    file_path TEXT,
    content TEXT,
    excerpt TEXT,
    chroma_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_user_type ON items(user_id, type);
  CREATE INDEX IF NOT EXISTS idx_user_date ON items(user_id, created_at);
`);

export default db;
