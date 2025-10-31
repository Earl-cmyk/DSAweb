(() => {
  'use strict';
/*     Utilities  */

  function debounce(fn, ms = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function formatDate(sqlDatetime) {
    // Expect "YYYY-MM-DD HH:MM:SS" or ISO — produce a friendly string
    try {
      const d = new Date(sqlDatetime);
      if (isNaN(d)) return sqlDatetime;
      return d.toLocaleString();
    } catch (e) {
      return sqlDatetime;
    }
  }

  async function safeFetchJSON(url, opts = {}) {
    // wrapper that tries fetch and JSON parse; throws or returns {error}
    try {
      const res = await fetch(url, opts);
      if (!res.ok) {
        let bodyText;
        try { bodyText = await res.text(); } catch (e) { bodyText = ''; }
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        err.body = bodyText;
        throw err;
      }
      // allow no-content
      if (res.status === 204) return null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await res.json();
      } else {
        // not JSON (for file downloads, etc)
        return null;
      }
    } catch (err) {
      console.error('Network/API error:', err);
      toast(`Network error: ${err.status || ''} ${err.message}`, 'error');
      throw err;
    }
  }

  // Simple toast/snackbar
  const TOAST_TIMEOUT = 3500;
  function toast(message = '', kind = 'info') {
    // create ephemeral toast in top-right
    const containerId = '__toast_container__';
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      Object.assign(container.style, {
        position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.5rem'
      });
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    Object.assign(el.style, {
      padding: '0.6rem 0.9rem', borderRadius: '8px', background: 'rgba(0,0,0,0.6)',
      color: 'white', boxShadow: '0 6px 20px rgba(0,0,0,0.6)', fontWeight: 600
    });
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 260);
    }, TOAST_TIMEOUT);
  }
/*     DOM helpers / templates  */

  function createElementFromHTML(html) {
    const tmpl = document.createElement('template');
    tmpl.innerHTML = html.trim();
    return tmpl.content.firstChild;
  }

  /**
   * Build a post card element from a post object.
   * Post object expected fields: id, title, caption, filename, mime, created_at,
   * upvotes, downvotes, author, deleted, and optionally file_url/file_mime (server can return either)
   */
  function buildPostCard(post) {
    const fileUrl = post.filename ? (post.file_url || `/uploads/${post.filename}`) : null;
    const fileMime = post.mime || post.file_mime || (fileUrl ? '' : '');
    const id = post.id;

    const el = document.createElement('article');
    el.className = 'post-card';
    el.dataset.id = id;
    el.innerHTML = `
      <header>
        <h3 class="post-title"></h3>
        <div class="post-menu three-dots" data-id="${id}" tabindex="0" role="button" aria-label="Post menu">⋯</div>
      </header>
      <div class="post-body">
        <p class="post-caption"></p>
      </div>
      <footer>
        <button class="vote-up" data-id="${id}" aria-label="Upvote">▲ <span class="count">0</span></button>
        <button class="vote-down" data-id="${id}" aria-label="Downvote">▼ <span class="count">0</span></button>
        <button class="comment-toggle" data-id="${id}" aria-expanded="false">💬 Comments</button>
      </footer>
      <section class="comments" data-id="${id}" style="display:none">
        <div class="comments-list"></div>
        <textarea class="comment-input" placeholder="Add a comment..." aria-label="Comment input"></textarea>
        <button class="comment-send">Send</button>
      </section>
    `;

    // fill in content
    el.querySelector('.post-title').textContent = post.title || 'Untitled';
    const captionEl = el.querySelector('.post-caption');
    captionEl.textContent = post.caption || '';

    // file preview logic
    if (fileUrl) {
      const body = el.querySelector('.post-body');
      const wrapper = document.createElement('div');
      wrapper.className = 'post-attachment';
      if (fileMime && fileMime.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = fileUrl;
        img.alt = post.title || 'Post image';
        img.className = 'post-media';
        wrapper.appendChild(img);
      } else if (fileMime === 'application/pdf' || (fileUrl && fileUrl.endsWith('.pdf'))) {
        // small embed frame (optional)
        const iframe = document.createElement('iframe');
        iframe.src = fileUrl;
        iframe.className = 'post-media pdf-viewer';
        iframe.setAttribute('title', 'PDF preview');
        iframe.style.height = '320px';
        wrapper.appendChild(iframe);
      } else if (fileMime && fileMime.startsWith('audio/')) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = fileUrl;
        wrapper.appendChild(audio);
      } else {
        const a = document.createElement('a');
        a.href = fileUrl;
        a.textContent = 'Download attachment';
        a.setAttribute('download', '');
        wrapper.appendChild(a);
      }
      body.appendChild(wrapper);
    }

    // footer counts
    const upBtn = el.querySelector('.vote-up .count');
    const downBtn = el.querySelector('.vote-down .count');
    upBtn.textContent = String(post.upvotes || 0);
    downBtn.textContent = String(post.downvotes || 0);

    // small fade-in
    el.style.animation = 'fadeIn 260ms ease both';
    el.style.transformOrigin = 'top center';

    return el;
  }
/*     Search behavior  */

  function attachSearchHandlers() {
    const navSearch = document.getElementById('nav-search');
    const heroSearch = document.getElementById('hero-search');
    const suggestionsContainers = document.querySelectorAll('#search-suggestions');
    const suggestionContainer = suggestionsContainers.length ? suggestionsContainers[0] : null;

    async function doSuggest(q) {
      if (!q || q.trim().length === 0) {
        if (suggestionContainer) suggestionContainer.innerHTML = '';
        return;
      }
      try {
        const data = await safeFetchJSON(`/api/posts?q=${encodeURIComponent(q.trim())}`);
        if (!suggestionContainer) return;
        suggestionContainer.innerHTML = '';
        if (!Array.isArray(data.posts)) {
          // older /api might return array directly
          const arr = Array.isArray(data) ? data : [];
          renderSuggestions(arr, suggestionContainer);
        } else {
          renderSuggestions(data.posts, suggestionContainer);
        }
      } catch (err) {
        // error already handled in safeFetchJSON
      }
    }

    function renderSuggestions(posts, container) {
      container.innerHTML = '';
      if (!posts || posts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'item';
        empty.textContent = 'No results';
        container.appendChild(empty);
        return;
      }
      posts.slice(0, 8).forEach(p => {
        const item = document.createElement('div');
        item.className = 'item';
        item.tabIndex = 0;
        item.innerHTML = `<strong>${escapeHtml(p.title)}</strong><div style="font-size:0.9rem;color:var(--muted)">${escapeHtml(p.caption || '')}</div>`;
        item.addEventListener('click', () => {
          // navigate to lectures and filter/scroll to post
          window.location.href = `/lectures?q=${encodeURIComponent(p.title)}`;
        });
        item.addEventListener('keydown', e => {
          if (e.key === 'Enter') item.click();
        });
        container.appendChild(item);
      });
    }

    const debouncedSuggest = debounce(q => doSuggest(q), 250);

    [navSearch, heroSearch].forEach(inp => {
      if (!inp) return;
      inp.addEventListener('input', (e) => {
        const q = e.target.value;
        debouncedSuggest(q);
      });
      // keyboard: esc hides
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && suggestionContainer) suggestionContainer.innerHTML = '';
      });
    });
  }
/*     Lectures page behavior  */

  const POSTS_PAGE = {
    offset: 0,
    limit: 8,
    loading: false,
    finished: false,
  };

  async function initLecturesPage() {
    // Attach modal controls
    const btnCreate = document.getElementById('btn-create-post');
    const modal = document.getElementById('post-modal');
    const postForm = document.getElementById('post-form');
    const publishBtn = document.getElementById('post-publish');
    const cancelBtn = document.getElementById('post-cancel');
    const postsList = document.getElementById('posts-list');
    const loadMoreBtn = document.getElementById('load-more');

    if (btnCreate && modal) {
      btnCreate.addEventListener('click', () => openPostModal());
    }
    if (cancelBtn && modal) {
      cancelBtn.addEventListener('click', () => closePostModal());
    }

    // modal state for editing
    let editingPostId = null;
    function openPostModal(post = null) {
      editingPostId = post ? post.id : null;
      // fill if editing
      if (post) {
        document.getElementById('post-title').value = post.title || '';
        document.getElementById('post-caption').value = post.caption || '';
        document.getElementById('post-author').value = post.author || 'Anonymous';
      } else {
        document.getElementById('post-form').reset();
      }
      modal.setAttribute('aria-hidden', 'false');
      modal.classList.add('show');
    }
    function closePostModal() {
      editingPostId = null;
      modal.setAttribute('aria-hidden', 'true');
      modal.classList.remove('show');
      // reset file input
      const file = document.getElementById('post-file');
      if (file) file.value = '';
    }

    // Publish handler (create or edit)
    if (publishBtn && postForm) {
      publishBtn.addEventListener('click', async () => {
        try {
          publishBtn.disabled = true;
          publishBtn.classList.add('btn-ghost');
          const title = document.getElementById('post-title').value.trim();
          const caption = document.getElementById('post-caption').value.trim();
          const author = document.getElementById('post-author').value.trim() || 'Anonymous';
          const fileInput = document.getElementById('post-file');
          if (!title) {
            toast('Title is required', 'error');
            publishBtn.disabled = false;
            return;
          }
          if (editingPostId) {
            // edit flow
            const payload = { title, caption, author };
            const updated = await safeFetchJSON(`/api/posts/${editingPostId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            // update DOM
            const existing = postsList.querySelector(`.post-card[data-id="${editingPostId}"]`);
            if (existing) {
              const newEl = buildPostCard(updated);
              postsList.replaceChild(newEl, existing);
              toast('Post updated', 'info');
            }
            closePostModal();
            publishBtn.disabled = false;
            return;
          }

          // create flow (FormData)
          const fd = new FormData();
          fd.append('title', title);
          fd.append('caption', caption);
          fd.append('author', author);
          if (fileInput && fileInput.files && fileInput.files[0]) {
            fd.append('file', fileInput.files[0]);
          }

          const res = await fetch('/api/posts', { method: 'POST', body: fd });
          if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt || `HTTP ${res.status}`);
          }
          const created = await res.json();
          // prepend into DOM
          const el = buildPostCard(created);
          postsList.insertBefore(el, postsList.firstChild);
          toast('Post published', 'info');
          closePostModal();
        } catch (err) {
          console.error('Publish error', err);
          toast('Failed to publish post', 'error');
        } finally {
          publishBtn.disabled = false;
        }
      });
    }

    // Load initial posts
    await loadPosts({ reset: true });

    // Load more handler
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', async () => {
        await loadPosts();
      });
    }

    // Delegated click handlers for post actions
    if (postsList) {
      postsList.addEventListener('click', async (e) => {
        const up = e.target.closest('.vote-up');
        const down = e.target.closest('.vote-down');
        const commentToggle = e.target.closest('.comment-toggle');
        const menuBtn = e.target.closest('.post-menu');
        const commentSend = e.target.closest('.comment-send');

        if (up) {
          const id = up.dataset.id;
          await votePost(id, 'up', up);
        } else if (down) {
          const id = down.dataset.id;
          await votePost(id, 'down', down);
        } else if (commentToggle) {
          const id = commentToggle.dataset.id;
          toggleComments(id);
        } else if (menuBtn) {
          const id = menuBtn.dataset.id;
          openContextMenu(e, id);
        } else if (commentSend) {
          // find related post id
          const section = e.target.closest('.comments');
          if (!section) return;
          const pid = section.dataset.id;
          const input = section.querySelector('.comment-input');
          const content = input.value.trim();
          if (!content) {
            toast('Comment cannot be empty', 'error');
            return;
          }
          try {
            const payload = new URLSearchParams();
            // server accepts JSON or form-data; use JSON
            const created = await safeFetchJSON(`/api/posts/${pid}/comments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content, author: 'Anonymous' })
            });
            // append to comments-list
            const list = section.querySelector('.comments-list');
            const item = document.createElement('div');
            item.className = 'comment-item';
            item.textContent = `${created.author || 'Anonymous'} — ${created.content}`;
            list.appendChild(item);
            input.value = '';
            toast('Comment added', 'info');
          } catch (err) {
            console.error('Add comment', err);
          }
        }
      });
    }

    /* --------------------------
       Helper functions (inside initLecturesPage)
       -------------------------- */

    async function loadPosts({ reset = false } = {}) {
      if (POSTS_PAGE.loading) return;
      POSTS_PAGE.loading = true;
      if (reset) {
        POSTS_PAGE.offset = 0;
        POSTS_PAGE.finished = false;
        const el = document.getElementById('posts-list');
        if (el) el.innerHTML = '';
      }
      try {
        const url = `/api/posts?offset=${POSTS_PAGE.offset}&limit=${POSTS_PAGE.limit}`;
        // /api may ignore offset/limit; fallback to fetch all and slice if necessary
        const data = await safeFetchJSON(url);
        let posts = [];
        if (Array.isArray(data)) posts = data;
        else if (data && Array.isArray(data.posts)) posts = data.posts;
        else if (data && data.length) posts = data;

        // if API returns full dataset, we simulate offset/limit
        const slice = posts.slice(POSTS_PAGE.offset, POSTS_PAGE.offset + POSTS_PAGE.limit);
        if (!slice.length) {
          POSTS_PAGE.finished = true;
        } else {
          const list = document.getElementById('posts-list');
          slice.forEach(p => {
            const node = buildPostCard(p);
            // append
            list.appendChild(node);
          });
          POSTS_PAGE.offset += slice.length;
          if (slice.length < POSTS_PAGE.limit) POSTS_PAGE.finished = true;
        }
      } catch (err) {
        console.error('Load posts failed', err);
      } finally {
        POSTS_PAGE.loading = false;
      }
    }

    async function votePost(postId, type, btnEl) {
      try {
        const updated = await safeFetchJSON(`/api/posts/${postId}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type })
        });
        // update counts in DOM for this post
        const postEl = document.querySelector(`.post-card[data-id="${postId}"]`);
        if (postEl && updated) {
          const up = postEl.querySelector('.vote-up .count');
          const down = postEl.querySelector('.vote-down .count');
          if (updated.upvotes != null) up.textContent = String(updated.upvotes);
          if (updated.downvotes != null) down.textContent = String(updated.downvotes);
        }
      } catch (err) {
        console.error('Vote failed', err);
      }
    }

    async function toggleComments(postId) {
      const section = document.querySelector(`.comments[data-id="${postId}"]`);
      if (!section) return;
      const isVisible = section.style.display !== 'none';
      if (isVisible) {
        section.style.display = 'none';
        return;
      }
      // show & fetch comments
      section.style.display = 'block';
      const list = section.querySelector('.comments-list');
      list.innerHTML = '<div class="muted">Loading comments…</div>';
      try {
        const comments = await safeFetchJSON(`/api/posts/${postId}/comments`);
        list.innerHTML = '';
        if (!comments || comments.length === 0) {
          list.innerHTML = '<div class="muted">No comments yet.</div>';
        } else {
          comments.forEach(c => {
            const it = document.createElement('div');
            it.className = 'comment-item';
            it.textContent = `${c.author || 'Anonymous'} — ${c.content}`;
            list.appendChild(it);
          });
        }
      } catch (err) {
        list.innerHTML = '<div class="muted">Failed to load comments.</div>';
      }
    }

    // Context menu for edit/delete
    function openContextMenu(clickEvent, postId) {
      // remove any existing menu
      const existing = document.querySelector('.context-menu');
      if (existing) existing.remove();

      const menu = document.createElement('div');
      menu.className = 'context-menu';
      menu.innerHTML = `
        <button data-action="edit">Edit</button>
        <button data-action="delete">Delete</button>
      `;
      document.body.appendChild(menu);

      // position near click
      const rect = clickEvent.target.getBoundingClientRect();
      menu.style.left = `${rect.right - 8}px`;
      menu.style.top = `${rect.bottom + window.scrollY}px`;

      function cleanup() { menu.remove(); document.removeEventListener('click', onDocClick); }

      function onDocClick(ev) {
        if (!menu.contains(ev.target)) cleanup();
      }
      document.addEventListener('click', onDocClick);

      menu.addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        if (action === 'edit') {
          // fetch post and open modal pre-filled
          try {
            const post = await safeFetchJSON(`/api/posts/${postId}`);
            openPostModal(post);
            cleanup();
          } catch (err) { /* handled by safeFetchJSON */ }
        } else if (action === 'delete') {
          cleanup();
          promptDeleteWithCountdown(postId);
        }
      });
    }

    // Delete countdown / snackbar
    function promptDeleteWithCountdown(postId) {
      // create or select snackbar
      let snackbar = document.getElementById('snackbar');
      if (!snackbar) {
        snackbar = document.createElement('div');
        snackbar.id = 'snackbar';
        snackbar.className = 'snackbar';
        snackbar.innerHTML = `<span id="snackbar-msg">Deleting in 5…</span> <button id="snackbar-cancel">Cancel</button>`;
        document.body.appendChild(snackbar);
      } else {
        snackbar.style.display = 'flex';
      }

      const msg = document.getElementById('snackbar-msg');
      const cancelBtn = document.getElementById('snackbar-cancel');

      let countdown = 5;
      msg.textContent = `Deleting in ${countdown}…`;
      let timer = setInterval(() => {
        countdown -= 1;
        if (countdown <= 0) {
          clearInterval(timer);
          performDelete(postId).finally(() => {
            snackbar.style.display = 'none';
          });
        } else {
          msg.textContent = `Deleting in ${countdown}…`;
        }
      }, 1000);

      function cancelHandler() {
        clearInterval(timer);
        snackbar.style.display = 'none';
        cancelBtn.removeEventListener('click', cancelHandler);
        toast('Delete cancelled', 'info');
      }
      cancelBtn.addEventListener('click', cancelHandler);
    }

    async function performDelete(postId) {
      try {
        await safeFetchJSON(`/api/posts/${postId}`, { method: 'DELETE' });
        // remove DOM element
        const el = document.querySelector(`.post-card[data-id="${postId}"]`);
        if (el) el.remove();
        toast('Post deleted', 'info');
      } catch (err) {
        console.error('Delete failed', err);
        toast('Failed to delete post', 'error');
      }
    }
  } // end initLecturesPage
/*     Collaborators page behavior  */

  async function initCollaboratorsPage() {
    // When page loads, fetch collaborators and populate the six buttons/cards if possible
    try {
      const collabs = await safeFetchJSON('/api/collaborators');
      if (!Array.isArray(collabs) || collabs.length === 0) return;
      // Map to available cards/buttons by index
      const ids = [
        'btn-lead-engineer', 'btn-senior-developer', 'btn-junior-developer',
        'btn-db-engineer', 'btn-graphics-designer', 'btn-manager'
      ];
      ids.forEach((btnId, idx) => {
        const btn = document.getElementById(btnId);
        const cardId = 'card-' + btnId.slice(4); // e.g., btn-lead-engineer -> card-lead-engineer
        const card = document.getElementById(cardId);
        const data = collabs[idx] || {};
        if (btn && data.role) {
          btn.textContent = data.role;
        }
        if (card && data) {
          // populate card fields
          const content = card.querySelector('.modal-content');
          if (content) {
            // replace name, student_id, github
            const h3 = content.querySelector('h3');
            if (h3) h3.textContent = data.role || h3.textContent;
            const pEls = content.querySelectorAll('p');
            if (pEls.length >= 3) {
              // p[0] Name, p[1] Student ID, p[2] GitHub
              pEls[0].innerHTML = `<strong>Name:</strong> ${escapeHtml(data.name || '')}`;
              pEls[1].innerHTML = `<strong>Student ID:</strong> ${escapeHtml(data.student_id || '')}`;
              const gh = data.github || '';
              pEls[2].innerHTML = `<strong>GitHub:</strong> <a href="https://github.com/${encodeURIComponent(gh)}" target="_blank">${escapeHtml(gh)}</a>`;
            }
            // update copy button
            const copyBtn = content.querySelector('.copy-btn');
            if (copyBtn) copyBtn.dataset.username = data.github || '';
          }
        }
      });
    } catch (err) {
      console.warn('Could not fetch collaborators; using placeholders', err);
    }

    // Attach modal toggle behavior & copy buttons (some of this might be in-page already)
    const buttonsConfig = [
      { btn: 'btn-lead-engineer', card: 'card-lead-engineer' },
      { btn: 'btn-senior-developer', card: 'card-senior-developer' },
      { btn: 'btn-junior-developer', card: 'card-junior-developer' },
      { btn: 'btn-db-engineer', card: 'card-db-engineer' },
      { btn: 'btn-graphics-designer', card: 'card-graphics-designer' },
      { btn: 'btn-manager', card: 'card-manager' },
    ];
    buttonsConfig.forEach(cfg => {
      const trigger = document.getElementById(cfg.btn);
      const modal = document.getElementById(cfg.card);
      if (!trigger || !modal) return;
      trigger.addEventListener('click', () => {
        modal.style.display = 'block';
        modal.setAttribute('aria-hidden', 'false');
      });
      const closeBtn = modal.querySelector('.close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          modal.style.display = 'none';
          modal.setAttribute('aria-hidden', 'true');
        });
      }
    });

    // copy-to-clipboard
    document.addEventListener('click', (e) => {
      const copy = e.target.closest('.copy-btn');
      if (!copy) return;
      const username = copy.dataset.username || '';
      if (!username) {
        toast('No GitHub username available', 'error');
        return;
      }
      navigator.clipboard.writeText(username).then(() => {
        toast(`Copied ${username}`, 'info');
      }).catch(err => {
        console.error('Clipboard error', err);
        toast('Failed to copy', 'error');
      });
    });
  }
/*     Helper: escapeHtml  */
  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
/*     Initialization on DOM ready  */
  document.addEventListener('DOMContentLoaded', () => {
    // Attach search across pages (if inputs present)
    attachSearchHandlers();

    // Initialize lectures page if present
    if (document.getElementById('posts-list')) {
      initLecturesPage().catch(err => console.error('initLecturesPage error', err));
    }

    // Initialize collaborators page if buttons exist
    if (document.getElementById('btn-lead-engineer')) {
      initCollaboratorsPage().catch(err => console.error('initCollaboratorsPage error', err));
    }

    // Generic click handler: close context menus on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // close any open modal
        document.querySelectorAll('.modal[aria-hidden="false"]').forEach(m => {
          m.setAttribute('aria-hidden', 'true');
          m.style.display = 'none';
        });
        // remove context menus
        document.querySelectorAll('.context-menu').forEach(cm => cm.remove());
      }
    });
  });
/*     Small CSS keyframes injection for fadeIn used in buildPostCard
     (We avoid needing to edit CSS files from JS; but ensure animation exists.)  */
  (function injectKeyframes() {
    const styleId = '__mainjs_keyframes__';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(6px) scale(.995) }
        to { opacity: 1; transform: translateY(0) scale(1) }
      }
    `;
    document.head.appendChild(style);
  })();

})();


// Toggle post menu
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("three-dots")) {
    const id = e.target.dataset.id;
    const menu = document.getElementById(`menu-${id}`);
    document.querySelectorAll(".post-menu-dropdown").forEach(m => m.classList.add("hidden"));
    if (menu) menu.classList.toggle("hidden");
  } else {
    // Hide menu when clicking outside
    document.querySelectorAll(".post-menu-dropdown").forEach(m => m.classList.add("hidden"));
  }
});

// Handle edit
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("menu-edit")) {
    const postId = e.target.dataset.id;
    openEditModal(postId);
  }
});

// Handle delete + undo timer
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("menu-delete")) {
    const postId = e.target.dataset.id;
    showDeleteSnackbar(postId);
  }
});

function showDeleteSnackbar(postId) {
  const snackbar = document.createElement("div");
  snackbar.className = "snackbar";
  snackbar.innerHTML = `
    <span>Deleting post in <b id="countdown">5</b> seconds...</span>
    <button id="undo-delete">Cancel</button>
  `;
  document.body.appendChild(snackbar);

  let countdown = 5;
  const timer = setInterval(() => {
    countdown--;
    document.getElementById("countdown").textContent = countdown;
    if (countdown <= 0) {
      clearInterval(timer);
      deletePost(postId);
      snackbar.remove();
    }
  }, 1000);

  document.getElementById("undo-delete").onclick = () => {
    clearInterval(timer);
    snackbar.remove();
  };
}

async function deletePost(postId) {
  try {
    const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    if (res.ok) {
      document.querySelector(`.post-card[data-id="${postId}"]`).remove();
      showToast("Post deleted successfully");
    } else {
      showToast("Error deleting post");
    }
  } catch (err) {
    showToast("Network error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const postsList = document.getElementById("posts-list");
  const snackbar = document.getElementById("snackbar");
  const snackbarCancel = document.getElementById("snackbar-cancel");
  let deleteTimeout;
  let pendingDeleteId = null;

  // Toggle 3-dot dropdown
  postsList.addEventListener("click", (e) => {
    if (e.target.classList.contains("three-dots")) {
      const id = e.target.dataset.id;
      // Hide all open menus first
      document.querySelectorAll(".dropdown-menu").forEach(menu => menu.style.display = "none");

      const menu = document.getElementById(`menu-${id}`);
      if (menu) {
        menu.style.display = "flex";
        e.stopPropagation();
      }
    }
  });

  // Hide dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown-menu") && !e.target.classList.contains("three-dots")) {
      document.querySelectorAll(".dropdown-menu").forEach(menu => menu.style.display = "none");
    }
  });

  // --- EDIT POST ---
  postsList.addEventListener("click", (e) => {
    if (e.target.classList.contains("edit-post")) {
      const id = e.target.dataset.id;
      const postCard = document.querySelector(`.post-card[data-id='${id}']`);
      const title = postCard.querySelector(".post-title").textContent;
      const caption = postCard.querySelector(".post-body p").textContent;

      document.getElementById("modal-title").textContent = "Edit Post";
      document.getElementById("edit-post-id").value = id;
      document.getElementById("post-title").value = title;
      document.getElementById("post-caption").value = caption;
      document.getElementById("post-modal").style.display = "block";

      // Hide dropdown
      document.querySelectorAll(".dropdown-menu").forEach(menu => menu.style.display = "none");
    }
  });

  // --- DELETE POST ---
  postsList.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-post")) {
      const id = e.target.dataset.id;
      pendingDeleteId = id;
      snackbar.style.display = "flex";

      deleteTimeout = setTimeout(() => {
        fetch(`/delete_post/${id}`, { method: "DELETE" })
          .then(res => res.json())
          .then(() => {
            document.querySelector(`.post-card[data-id='${id}']`)?.remove();
            snackbar.style.display = "none";
          });
      }, 5000);
    }
  });

  // --- UNDO DELETE ---
  snackbarCancel.addEventListener("click", () => {
    clearTimeout(deleteTimeout);
    snackbar.style.display = "none";
    pendingDeleteId = null;
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const postsList = document.getElementById("posts-list");

  // Toggle dropdown visibility
  postsList.addEventListener("click", (e) => {
    if (e.target.classList.contains("three-dots")) {
      const id = e.target.dataset.id;

      // Close all open menus first
      document.querySelectorAll(".dropdown-menu").forEach(menu => menu.style.display = "none");

      // Open the clicked one
      const menu = document.getElementById(`menu-${id}`);
      if (menu) {
        menu.style.display = "flex";
        e.stopPropagation(); // prevent closing immediately
      }
    }
  });

  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".post-menu-wrapper")) {
      document.querySelectorAll(".dropdown-menu").forEach(menu => menu.style.display = "none");
    }
  });
});
