#!/usr/bin/env python3
"""
Unit tests for DSAWebLectures Flask app.
Run with:  python -m unittest test_app.py
"""

import os
import tempfile
import unittest
import sqlite3
from app import app


# ---------------------------------------
# Test Configuration
# ---------------------------------------
class DSAWebLecturesTestCase(unittest.TestCase):
    def setUp(self):
        # Create a temporary database file
        self.db_fd, self.temp_db = tempfile.mkstemp()
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False

        # Patch DB_PATH to use our temp database
        global DB_PATH
        DB_PATH = self.temp_db

        # Initialize a minimal schema for testing
        with sqlite3.connect(self.temp_db) as conn:
            conn.executescript("""
            CREATE TABLE posts (
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
            CREATE TABLE comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                author TEXT DEFAULT 'Anonymous',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE collaborators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                name TEXT NOT NULL,
                student_id TEXT,
                github TEXT,
                avatar TEXT
            );
            INSERT INTO collaborators (role, name, student_id, github)
            VALUES ('lead engineer', 'Franzen D. Baluyot', '2024-03740-MN-0', 'K4thars15');
            """)

        self.client = app.test_client()

    def tearDown(self):
        os.close(self.db_fd)
        os.unlink(self.temp_db)


    # ---------------------------------------
    # Template route tests
    # ---------------------------------------
    def test_home_route(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b"<!DOCTYPE", resp.data)

    def test_lectures_route(self):
        resp = self.client.get("/lectures")
        self.assertEqual(resp.status_code, 200)

    def test_collaborators_page(self):
        resp = self.client.get("/collaborators")
        self.assertEqual(resp.status_code, 200)

    # ---------------------------------------
    # API route tests
    # ---------------------------------------
    def test_get_collaborators(self):
        resp = self.client.get("/api/collaborators")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIsInstance(data, list)
        self.assertEqual(data[0]["name"], "Franzen D. Baluyot")

    def test_create_and_get_post(self):
        # Create post
        data = {
            "title": "Test Lecture",
            "caption": "A simple test post",
            "author": "Tester"
        }
        resp = self.client.post("/api/posts", data=data)
        self.assertEqual(resp.status_code, 201)
        post = resp.get_json()
        self.assertEqual(post["title"], "Test Lecture")

        # Retrieve post
        post_id = post["id"]
        resp = self.client.get(f"/api/posts/{post_id}")
        self.assertEqual(resp.status_code, 200)
        retrieved = resp.get_json()
        self.assertEqual(retrieved["title"], "Test Lecture")

    def test_comment_flow(self):
        # Create a post
        post_id = self.client.post("/api/posts", data={"title": "Commented"}).get_json()["id"]

        # Add a comment
        comment_data = {"content": "Nice post!", "author": "Student"}
        resp = self.client.post(f"/api/posts/{post_id}/comments", json=comment_data)
        self.assertEqual(resp.status_code, 201)
        comment = resp.get_json()
        self.assertEqual(comment["content"], "Nice post!")

        # Get comments
        resp = self.client.get(f"/api/posts/{post_id}/comments")
        self.assertEqual(resp.status_code, 200)
        comments = resp.get_json()
        self.assertEqual(len(comments), 1)
        self.assertEqual(comments[0]["author"], "Student")

    def test_vote_post(self):
        # Create post
        post_id = self.client.post("/api/posts", data={"title": "VoteMe"}).get_json()["id"]

        # Upvote
        resp = self.client.post(f"/api/posts/{post_id}/vote", json={"type": "up"})
        self.assertEqual(resp.status_code, 200)
        votes = resp.get_json()
        self.assertIn("upvotes", votes)
        self.assertEqual(votes["upvotes"], 1)

        # Downvote
        resp = self.client.post(f"/api/posts/{post_id}/vote", json={"type": "down"})
        self.assertEqual(resp.status_code, 200)
        votes = resp.get_json()
        self.assertEqual(votes["downvotes"], 1)

    def test_delete_post(self):
        # Create and delete post
        post_id = self.client.post("/api/posts", data={"title": "Temp"}).get_json()["id"]
        resp = self.client.delete(f"/api/posts/{post_id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["status"], "deleted")


if __name__ == "__main__":
    unittest.main(verbosity=2)
