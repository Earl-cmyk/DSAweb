-- DSAWebLectures Database Schema

PRAGMA foreign_keys = ON;

-- Table: users (optional, for authentication or profile data)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table: posts
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    caption TEXT,
    filename TEXT,
    mime TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    author TEXT DEFAULT 'Anonymous',
    deleted INTEGER DEFAULT 0
);

-- Indexes for faster search and sorting on posts
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at);
CREATE INDEX IF NOT EXISTS idx_posts_title ON posts (title);

-- Table: comments
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author TEXT DEFAULT 'Anonymous',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table: collaborators
CREATE TABLE IF NOT EXISTS collaborators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    student_id TEXT,
    github TEXT,
    avatar TEXT
);

-- Optional: Index for collaborator name searches
CREATE INDEX IF NOT EXISTS idx_collaborators_name ON collaborators (name);
