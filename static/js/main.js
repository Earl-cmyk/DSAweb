// === DSALectures main.js ===
// Handles: search, post loading, create popup, votes, comments, collaborators

// Utility function to simplify element selection
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// === SEARCH BAR ===
async function performSearch(query) {
  const res = await fetch(`/api/posts?q=${encodeURIComponent(query)}`);
  const posts = await res.json();
  renderPosts(posts);
}

function setupSearch() {
  const searchInput = $("#global-search");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      performSearch(e.target.value);
    });
  }
}

// === LOAD POSTS ===
async function loadPosts() {
  const res = await fetch("/api/posts");
  const posts = await res.json();
  renderPosts(posts);
}

// === RENDER POSTS ===
function renderPosts(posts) {
  const container = $("#posts-container");
  if (!container) return;
  container.innerHTML = "";

  if (posts.length === 0) {
    container.innerHTML = `<p class="no-results">No posts found.</p>`;
    return;
  }

  posts.forEach((p) => {
    const card = document.createElement("div");
    card.className = "post-card";

    card.innerHTML = `
      <h3>${p.title}</h3>
      <p>${p.caption || ""}</p>
      ${p.filename ? `<img src="/uploads/${p.filename}" alt="${p.title}" class="post-image">` : ""}
      <div class="post-footer">
        <button class="vote-btn" data-id="${p.id}" data-delta="1">▲</button>
        <span class="vote-count">${p.votes}</span>
        <button class="vote-btn" data-id="${p.id}" data-delta="-1">▼</button>
      </div>
      <button class="comment-toggle" data-id="${p.id}">💬 Comments</button>
      <div class="comments-section" id="comments-${p.id}" style="display:none;"></div>
    `;
    container.appendChild(card);
  });

  setupVoteButtons();
  setupCommentToggles();
}

// === VOTE BUTTONS ===
function setupVoteButtons() {
  $$(".vote-btn").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const delta = parseInt(btn.dataset.delta);
      const res = await fetch(`/api/posts/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });
      const data = await res.json();
      const parent = btn.closest(".post-footer");
      parent.querySelector(".vote-count").textContent = data.votes;
    };
  });
}

// === COMMENT SECTION ===
function setupCommentToggles() {
  $$(".comment-toggle").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const section = $(`#comments-${id}`);
      if (section.style.display === "none") {
        section.style.display = "block";
        await loadComments(id);
      } else {
        section.style.display = "none";
      }
    };
  });
}

async function loadComments(postId) {
  const res = await fetch(`/api/posts/${postId}/comments`);
  const comments = await res.json();
  const section = $(`#comments-${postId}`);
  section.innerHTML = "";

  comments.forEach((c) => {
    const div = document.createElement("div");
    div.className = "comment";
    div.innerHTML = `<b>${c.author}:</b> ${c.content}`;
    section.appendChild(div);
  });

  const form = document.createElement("form");
  form.innerHTML = `
    <input type="text" name="author" placeholder="Your name" required>
    <input type="text" name="content" placeholder="Add a comment..." required>
    <button type="submit">Post</button>
  `;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const author = form.author.value.trim();
    const content = form.content.value.trim();
    if (!content) return;

    await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author, content }),
    });

    form.reset();
    await loadComments(postId);
  };
  section.appendChild(form);
}

// === CREATE POST POPUP ===
function setupCreatePost() {
  const btn = $("#create-post-btn");
  const modal = $("#create-modal");
  const close = $("#close-modal");
  const form = $("#create-form");

  if (!btn || !modal || !form) return;

  btn.onclick = () => modal.style.display = "block";
  close.onclick = () => modal.style.display = "none";

  window.onclick = (e) => {
    if (e.target === modal) modal.style.display = "none";
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const res = await fetch("/api/posts", { method: "POST", body: data });
    if (res.ok) {
      modal.style.display = "none";
      form.reset();
      loadPosts();
    }
  };
}

// === LOAD COLLABORATORS ===
async function loadCollaborators() {
  const container = $("#collaborators-list");
  if (!container) return;

  const res = await fetch("/api/collaborators");
  const collabs = await res.json();

  container.innerHTML = "";
  collabs.forEach((c) => {
    const div = document.createElement("div");
    div.className = "collaborator-card";
    div.innerHTML = `
      <h3>${c.name}</h3>
      <p>${c.role}</p>
      <small>${c.student_id}</small><br>
      <a href="https://github.com/${c.github}" target="_blank">@${c.github}</a>
    `;
    container.appendChild(div);
  });
}

// === INIT ===
document.addEventListener("DOMContentLoaded", () => {
  setupSearch();
  setupCreatePost();
  loadPosts();
  loadCollaborators();
});
