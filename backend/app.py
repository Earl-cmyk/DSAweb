import os
import sqlite3
from flask import (
    Flask, g, jsonify, request, send_from_directory,
    render_template
)
from werkzeug.utils import secure_filename
from pathlib import Path

# === Paths & Config ===
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_FOLDER = BASE_DIR.parent / 'static' / 'uploads'
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
DB_PATH = BASE_DIR / 'dsa.db'

ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'mp4'}

app = Flask(
    __name__,
    template_folder=str(BASE_DIR.parent / 'templates'),
    static_folder=str(BASE_DIR.parent / 'static')
)

app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024


# === Database ===
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(str(DB_PATH))
        db.row_factory = sqlite3.Row
    return db


@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT


def init_db():
    with app.app_context():
        db = get_db()
        schema = (BASE_DIR / 'schema.sql').read_text()
        db.executescript(schema)

        # seed collaborators if empty
        cur = db.execute('SELECT COUNT(*) as c FROM collaborators')
        count = cur.fetchone()['c']
        if count == 0:
            collaborators = [
                ('lead engineer', 'Earl Jhon D. Dimla', '2024-03779-MN-O', 'Earl-cmyk'),
                ('senior developer', 'Placeholder 2', '', 'ghuser2'),
                ('junior developer', 'Placeholder 3', '' 'ghuser3'),
                ('database engineer', 'Placeholder 4', '', 'ghuser4'),
                ('graphics designer', 'Franzen D. Baluyot', '2024-03740-MN-0', 'K4thars15'),
                ('manager', 'Placeholder 6', '', 'ghuser6'),
            ]
            for r in collaborators:
                db.execute(
                    'INSERT INTO collaborators(role, name, student_id, github) VALUES (?,?,?,?)', r
                )
            db.commit()


# === Routes ===
@app.route('/')
def index():
    return render_template('home.html')


@app.route('/lectures')
def lectures_page():
    return render_template('lectures.html')


@app.route('/collaborators')
def collab_page():
    return render_template('collaborators.html')


# === API: Posts ===
@app.route('/api/posts', methods=['GET', 'POST'])
def posts():
    db = get_db()

    if request.method == 'GET':
        q = request.args.get('q', '')
        if q:
            rows = db.execute(
                "SELECT * FROM posts WHERE title LIKE ? OR caption LIKE ? ORDER BY created_at DESC",
                (f'%{q}%', f'%{q}%')
            ).fetchall()
        else:
            rows = db.execute(
                'SELECT * FROM posts ORDER BY created_at DESC'
            ).fetchall()
        return jsonify([dict(r) for r in rows])

    # POST (create)
    title = request.form.get('title', '')
    caption = request.form.get('caption', '')
    filename = None

    if 'file' in request.files:
        f = request.files['file']
        if f and allowed_file(f.filename):
            name = secure_filename(f.filename)
            dest = Path(app.config['UPLOAD_FOLDER']) / name
            f.save(str(dest))
            filename = name

    cur = db.execute(
        'INSERT INTO posts (title, caption, filename) VALUES (?, ?, ?)',
        (title, caption, filename)
    )
    db.commit()
    pid = cur.lastrowid
    return jsonify({'id': pid}), 201


@app.route('/api/posts/<int:post_id>', methods=['PUT', 'DELETE'])
def posts_modify(post_id):
    db = get_db()

    if request.method == 'PUT':
        title = request.form.get('title')
        caption = request.form.get('caption')
        db.execute(
            'UPDATE posts SET title=?, caption=? WHERE id=?',
            (title, caption, post_id)
        )
        db.commit()
        return jsonify({'status': 'ok'})

    if request.method == 'DELETE':
        db.execute('DELETE FROM comments WHERE post_id=?', (post_id,))
        db.execute('DELETE FROM posts WHERE id=?', (post_id,))
        db.commit()
        return jsonify({'status': 'deleted'})


@app.route('/api/posts/<int:post_id>/vote', methods=['POST'])
def post_vote(post_id):
    data = request.get_json() or {}
    delta = int(data.get('delta', 0))
    db = get_db()
    db.execute('UPDATE posts SET votes = votes + ? WHERE id=?', (delta, post_id))
    db.commit()
    votes = db.execute('SELECT votes FROM posts WHERE id=?', (post_id,)).fetchone()['votes']
    return jsonify({'votes': votes})


@app.route('/api/posts/<int:post_id>/comments', methods=['GET', 'POST'])
def comments(post_id):
    db = get_db()

    if request.method == 'GET':
        rows = db.execute(
            'SELECT * FROM comments WHERE post_id=? ORDER BY created_at',
            (post_id,)
        ).fetchall()
        return jsonify([dict(r) for r in rows])

    content = request.json.get('content')
    author = request.json.get('author', 'anonymous')
    db.execute(
        'INSERT INTO comments (post_id, author, content) VALUES (?, ?, ?)',
        (post_id, author, content)
    )
    db.commit()
    return jsonify({'status': 'ok'})


# === API: Collaborators ===
@app.route('/api/collaborators')
def get_collaborators():
    db = get_db()
    rows = db.execute('SELECT * FROM collaborators').fetchall()
    return jsonify([dict(r) for r in rows])


# === File serving ===
@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# === Run ===
if __name__ == '__main__':
    init_db()
    app.run(debug=True)
