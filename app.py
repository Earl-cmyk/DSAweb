import os
import sqlite3
from flask import (
    Flask, request, jsonify, render_template,
    send_from_directory, g
)
from werkzeug.utils import secure_filename
from datetime import datetime

# Configuration
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, "backend", "dsa.db")
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB limit


# Database Helpers
def get_db():
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        g.db = conn
    return g.db

@app.teardown_appcontext
def close_db(error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()

def query_db(query, args=(), one=False, commit=False):
    db = get_db()
    cur = db.execute(query, args)
    if commit:
        db.commit()
        return cur.lastrowid
    rv = cur.fetchall()
    cur.close()
    return (rv[0] if rv else None) if one else rv


# CORS (for easy local testing)
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response


# Template Routes
@app.route("/")
def home():
    return render_template("home.html")

@app.route("/lectures")
def lectures():
    return render_template("lectures.html")

@app.route("/collaborators")
def collaborators_page():
    return render_template("collaborators.html")

# File Serving Routes
@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


# API Endpoints

# --- Posts ---

@app.route("/api/posts", methods=["GET"])
def get_posts():
    q = request.args.get("q", "").strip().lower()
    if q:
        posts = query_db("""
            SELECT * FROM posts
            WHERE deleted = 0
            AND (LOWER(title) LIKE ? OR LOWER(caption) LIKE ?)
            ORDER BY created_at DESC
        """, (f"%{q}%", f"%{q}%"))
    else:
        posts = query_db("""
            SELECT * FROM posts
            WHERE deleted = 0
            ORDER BY created_at DESC
        """)
    return jsonify({
        "total": len(posts),
        "posts": [dict(row) for row in posts]
    })


@app.route("/api/posts/<int:post_id>", methods=["GET"])
def get_post(post_id):
    post = query_db("SELECT * FROM posts WHERE id = ?", (post_id,), one=True)
    if not post:
        return jsonify({"error": "Post not found"}), 404
    comments = query_db("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC", (post_id,))
    data = dict(post)
    data["comments"] = [dict(c) for c in comments]
    return jsonify(data)


@app.route("/api/posts", methods=["POST"])
def create_post():
    title = request.form.get("title")
    caption = request.form.get("caption", "")
    author = request.form.get("author", "Anonymous")
    file = request.files.get("file")

    if not title:
        return jsonify({"error": "Title is required"}), 400

    filename = None
    mime = None
    if file:
        filename = secure_filename(file.filename)
        mime = file.mimetype
        save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(save_path)

    post_id = query_db("""
        INSERT INTO posts (title, caption, filename, mime, author, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (title, caption, filename, mime, author), commit=True)

    new_post = query_db("SELECT * FROM posts WHERE id = ?", (post_id,), one=True)
    return jsonify(dict(new_post)), 201


@app.route("/api/posts/<int:post_id>", methods=["PUT"])
def update_post(post_id):
    data = request.get_json()
    title = data.get("title")
    caption = data.get("caption")

    query_db("""
        UPDATE posts SET title = ?, caption = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (title, caption, post_id), commit=True)

    updated = query_db("SELECT * FROM posts WHERE id = ?", (post_id,), one=True)
    return jsonify(dict(updated)) if updated else (jsonify({"error": "Post not found"}), 404)


@app.route("/api/posts/<int:post_id>", methods=["DELETE"])
def delete_post(post_id):
    result = query_db("DELETE FROM posts WHERE id = ?", (post_id,), commit=True)
    return jsonify({"status": "deleted", "post_id": post_id})


@app.route("/api/posts/<int:post_id>/vote", methods=["POST"])
def vote_post(post_id):
    data = request.get_json()
    vtype = data.get("type")
    if vtype not in ("up", "down"):
        return jsonify({"error": "Invalid vote type"}), 400

    field = "upvotes" if vtype == "up" else "downvotes"
    query_db(f"UPDATE posts SET {field} = {field} + 1 WHERE id = ?", (post_id,), commit=True)
    updated = query_db("SELECT upvotes, downvotes FROM posts WHERE id = ?", (post_id,), one=True)
    return jsonify(dict(updated))


# --- Comments ---

@app.route("/api/posts/<int:post_id>/comments", methods=["GET"])
def get_comments(post_id):
    comments = query_db("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC", (post_id,))
    return jsonify([dict(c) for c in comments])


@app.route("/api/posts/<int:post_id>/comments", methods=["POST"])
def add_comment(post_id):
    content = request.form.get("content") or (request.json.get("content") if request.is_json else None)
    author = request.form.get("author") or (request.json.get("author") if request.is_json else "Anonymous")

    if not content:
        return jsonify({"error": "Content is required"}), 400

    cid = query_db("""
        INSERT INTO comments (post_id, content, author)
        VALUES (?, ?, ?)
    """, (post_id, content, author), commit=True)

    comment = query_db("SELECT * FROM comments WHERE id = ?", (cid,), one=True)
    return jsonify(dict(comment)), 201


# --- Collaborators ---

@app.route("/api/collaborators", methods=["GET"])
def get_collaborators():
    collabs = query_db("SELECT * FROM collaborators ORDER BY id ASC")
    return jsonify([dict(c) for c in collabs])


# Run Server
if __name__ == "__main__":
    app.run(debug=True)
