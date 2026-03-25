// ── Auth / per-user storage ─────────────────────────────────────────────────
const _currentUser = getCurrentUser();
const BOOKS_KEY = _currentUser ? 'readingNotes_books_' + _currentUser.id : 'readingNotes_books';
const GOAL_KEY = _currentUser ? 'nexa_goal_' + _currentUser.id : 'nexa_goal';

// Show user name and wire logout
if (_currentUser) {
  const nameEl = document.getElementById('userDisplayName');
  if (nameEl) nameEl.textContent = _currentUser.name;
}
const _logoutBtn = document.getElementById('logoutBtn');
if (_logoutBtn) _logoutBtn.addEventListener('click', logout);

// ── State ──────────────────────────────────────────────────────────────────
let books = JSON.parse(localStorage.getItem(BOOKS_KEY) || '[]');
let currentFilter = 'all';
let activeTag = null;
let currentBookId = null;
let editingRating = 0;
let notesDirty = false;
let searchQuery = '';

// ── Persistence ────────────────────────────────────────────────────────────
function saveBooks() {
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Theme ───────────────────────────────────────────────────────────────────
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
let darkMode = localStorage.getItem('readingNotes_theme') === 'dark' ||
  (!localStorage.getItem('readingNotes_theme') && prefersDark.matches);

function applyTheme() {
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  document.getElementById('themeIcon').textContent = darkMode ? '○' : '◑';
}

document.getElementById('themeToggle').addEventListener('click', () => {
  darkMode = !darkMode;
  localStorage.setItem('readingNotes_theme', darkMode ? 'dark' : 'light');
  applyTheme();
});

applyTheme();

// ── Helpers ─────────────────────────────────────────────────────────────────
function starsHtml(rating) {
  if (!rating) return '';
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function statusLabel(s) {
  return { reading: 'Reading', finished: 'Finished', 'to-read': 'To Read' }[s] || s;
}

function statusClass(s) {
  return { reading: 'status-reading', finished: 'status-finished', 'to-read': 'status-to-read' }[s] || '';
}

function parseTags(str) {
  return str.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Filter / Sort / Search ──────────────────────────────────────────────────
function getFilteredBooks() {
  const sort = document.getElementById('sortSelect').value;
  let list = [...books];

  // status filter
  if (currentFilter !== 'all') list = list.filter(b => b.status === currentFilter);
  // tag filter
  if (activeTag) list = list.filter(b => b.tags && b.tags.includes(activeTag));
  // search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(b =>
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      (b.tags && b.tags.some(t => t.includes(q))) ||
      (b.notes && b.notes.toLowerCase().includes(q))
    );
  }

  // sort
  list.sort((a, b) => {
    switch (sort) {
      case 'date-added-asc': return a.dateAdded.localeCompare(b.dateAdded);
      case 'title-asc': return a.title.localeCompare(b.title);
      case 'title-desc': return b.title.localeCompare(a.title);
      case 'rating-desc': return (b.rating || 0) - (a.rating || 0);
      default: return b.dateAdded.localeCompare(a.dateAdded); // date-added-desc
    }
  });

  return list;
}

// ── Stats Bar ────────────────────────────────────────────────────────────────
function updateStatsBar() {
  document.getElementById('statTotal').textContent = books.length + ' book' + (books.length !== 1 ? 's' : '');
  document.getElementById('statReading').textContent = books.filter(b => b.status === 'reading').length + ' reading';
  document.getElementById('statFinished').textContent = books.filter(b => b.status === 'finished').length + ' finished';
}

// ── Counts ──────────────────────────────────────────────────────────────────
function updateCounts() {
  document.getElementById('countAll').textContent     = books.length;
  document.getElementById('countReading').textContent = books.filter(b => b.status === 'reading').length;
  document.getElementById('countFinished').textContent= books.filter(b => b.status === 'finished').length;
  document.getElementById('countToRead').textContent  = books.filter(b => b.status === 'to-read').length;
}

// ── Tag Cloud ───────────────────────────────────────────────────────────────
function renderTagCloud() {
  const freq = {};
  books.forEach(b => (b.tags || []).forEach(t => { freq[t] = (freq[t] || 0) + 1; }));
  const cloud = document.getElementById('tagCloud');
  cloud.innerHTML = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => `<button class="tag-chip${activeTag === tag ? ' active' : ''}" data-tag="${tag}">${tag}</button>`)
    .join('');
  cloud.querySelectorAll('.tag-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTag = activeTag === btn.dataset.tag ? null : btn.dataset.tag;
      renderAll();
    });
  });
}

// ── Book Grid ───────────────────────────────────────────────────────────────
function renderLibrary() {
  const list = getFilteredBooks();
  const grid = document.getElementById('libraryView');
  const empty = document.getElementById('emptyState');

  if (list.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = list.map(book => {
    const coverHtml = book.cover
      ? `<img class="card-cover" src="${escHtml(book.cover)}" alt="${escHtml(book.title)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    return `
    <article class="book-card" data-id="${book.id}">
      ${coverHtml}
      <div class="card-cover-placeholder" style="${book.cover ? 'display:none' : ''}"></div>
      <div class="card-body">
        <div class="card-title">${escHtml(book.title)}</div>
        <div class="card-author">${escHtml(book.author)}</div>
        <div class="card-footer">
          <span class="card-stars">${starsHtml(book.rating)}</span>
          <span class="card-status ${statusClass(book.status)}">${statusLabel(book.status)}</span>
        </div>
        ${(book.status === 'reading' && book.totalPages > 0) ? `<div class="card-progress-track"><div class="card-progress-fill" style="width:${Math.min(100,Math.round((book.currentPage||0)/book.totalPages*100))}%"></div></div>` : ''}
      </div>
    </article>`;
  }).join('');

  grid.querySelectorAll('.book-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
  });
}

function renderAll() {
  updateStatsBar();
  updateCounts();
  renderTagCloud();
  renderLibrary();
  updateGoalWidget();
}

// ── Detail View ─────────────────────────────────────────────────────────────
function openDetail(id) {
  const book = books.find(b => b.id === id);
  if (!book) return;
  currentBookId = id;

  // Cover
  const coverEl = document.getElementById('detailCover');
  if (book.cover) {
    coverEl.innerHTML = `<img src="${escHtml(book.cover)}" alt="${escHtml(book.title)}" onerror="this.parentElement.innerHTML='<div class=cover-large-placeholder></div>'">`;
  } else {
    coverEl.innerHTML = `<div class="cover-large-placeholder"></div>`;
  }

  document.getElementById('detailTitle').textContent  = book.title;
  document.getElementById('detailAuthor').textContent = book.author;
  document.getElementById('detailRating').textContent  = book.rating ? starsHtml(book.rating) : '';

  const statusEl = document.getElementById('detailStatus');
  statusEl.textContent  = statusLabel(book.status);
  statusEl.className    = `status-badge ${statusClass(book.status)}`;

  const tagsEl = document.getElementById('detailTags');
  tagsEl.innerHTML = (book.tags || []).map(t => `<span class="meta-tag">${escHtml(t)}</span>`).join('');

  const dateEl = document.getElementById('detailDate');
  const parts = [];
  if (book.dateStarted)  parts.push('Started: '  + formatDate(book.dateStarted));
  if (book.dateFinished) parts.push('Finished: ' + formatDate(book.dateFinished));
  dateEl.textContent = parts.join(' · ');

  // Progress bar
  const progressEl = document.getElementById('detailProgress');
  if (book.totalPages && book.totalPages > 0) {
    const cur = parseInt(book.currentPage) || 0;
    const tot = parseInt(book.totalPages);
    const pct = Math.min(100, Math.round(cur / tot * 100));
    document.getElementById('progressText').textContent = `${cur} / ${tot} pages · ${pct}%`;
    document.getElementById('progressFill').style.width = pct + '%';
    progressEl.classList.remove('hidden');
  } else {
    progressEl.classList.add('hidden');
  }

  // Google book link
  const googleBookEl = document.getElementById('googleBookLink');
  googleBookEl.href = `https://www.google.com/search?q=${encodeURIComponent(book.title + ' ' + book.author)}`;

  // Make sure inline edit form is hidden, meta is visible
  document.getElementById('inlineEditForm').classList.add('hidden');
  document.getElementById('detailMeta').classList.remove('hidden');

  // Load notes and quotes
  loadNotesIntoQuill(book);
  renderQuotes(book);

  document.getElementById('detailOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  if (notesDirty && !confirm('You have unsaved notes. Discard changes?')) return;
  notesDirty = false;
  currentBookId = null;
  if (quill) quill.clipboard.dangerouslyPasteHTML('');
  document.getElementById('detailOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Quill rich-text editor ───────────────────────────────────────────────────
let quill = null;
let autoSaveTimer = null;

function setAutoSaveStatus(state) {
  const el = document.getElementById('autoSaveStatus');
  if (!el) return;
  if (state === 'pending') {
    el.textContent = 'Saving…';
    el.className = 'autosave-status pending';
  } else if (state === 'saved') {
    el.textContent = '✓ Saved';
    el.className = 'autosave-status saved';
    setTimeout(() => { if (el.classList.contains('saved')) { el.textContent = ''; el.className = 'autosave-status'; } }, 2500);
  }
}

function initQuill() {
  quill = new Quill('#quillEditor', {
    theme: 'snow',
    placeholder: 'Start writing your notes…',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ align: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
        [{ indent: '-1' }, { indent: '+1' }],
        ['blockquote', 'code-block'],
        ['link'],
        ['clean']
      ]
    }
  });

  quill.on('text-change', () => {
    if (!currentBookId) return;
    notesDirty = true;
    document.getElementById('cancelNotesBtn').classList.remove('hidden');
    setAutoSaveStatus('pending');
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      const book = books.find(b => b.id === currentBookId);
      if (book && quill) {
        book.notes = quill.root.innerHTML === '<p><br></p>' ? '' : quill.root.innerHTML;
        saveBooks();
        notesDirty = false;
        document.getElementById('cancelNotesBtn').classList.add('hidden');
        setAutoSaveStatus('saved');
      }
    }, 1500);
  });
}

function loadNotesIntoQuill(book) {
  if (!quill) return;
  const notes = book?.notes || '';
  quill.clipboard.dangerouslyPasteHTML(notes);
  notesDirty = false;
  document.getElementById('cancelNotesBtn').classList.add('hidden');
}

document.getElementById('saveNotesBtn').addEventListener('click', () => {
  const book = books.find(b => b.id === currentBookId);
  if (!book || !quill) return;
  book.notes = quill.root.innerHTML === '<p><br></p>' ? '' : quill.root.innerHTML;
  saveBooks();
  notesDirty = false;
  document.getElementById('cancelNotesBtn').classList.add('hidden');
});

document.getElementById('cancelNotesBtn').addEventListener('click', () => {
  if (!confirm('Discard unsaved changes?')) return;
  const book = books.find(b => b.id === currentBookId);
  loadNotesIntoQuill(book);
});

document.getElementById('backBtn').addEventListener('click', closeDetail);

document.getElementById('editBookBtn').addEventListener('click', () => {
  closeDetail();
  openBookForm(currentBookId);
});

document.getElementById('deleteBookBtn').addEventListener('click', () => {
  if (!confirm('Delete this book and all its notes? This cannot be undone.')) return;
  books = books.filter(b => b.id !== currentBookId);
  saveBooks();
  closeDetail();
  renderAll();
});

// ── Add / Edit Form ─────────────────────────────────────────────────────────
function openBookForm(id = null) {
  const book = id ? books.find(b => b.id === id) : null;
  editingRating = book?.rating || 0;

  document.getElementById('formTitle').textContent = book ? 'Edit Book' : 'Add Book';
  document.getElementById('bookId').value           = book?.id || '';
  document.getElementById('bookTitle').value        = book?.title || '';
  document.getElementById('bookAuthor').value       = book?.author || '';
  document.getElementById('bookCover').value        = book?.cover || '';
  document.getElementById('bookCoverFile').value    = '';
  document.getElementById('bookStatus').value       = book?.status || 'to-read';
  document.getElementById('bookTags').value         = (book?.tags || []).join(', ');
  document.getElementById('bookDateFinished').value = book?.dateFinished || '';
  document.getElementById('bookDateStarted').value  = book?.dateStarted || '';
  document.getElementById('bookCurrentPage').value  = book?.currentPage || '';
  document.getElementById('bookTotalPages').value   = book?.totalPages || '';

  updateStarInput(editingRating);
  document.getElementById('formOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.getElementById('bookTitle').focus();
}

function closeBookForm() {
  document.getElementById('formOverlay').classList.add('hidden');
  document.body.style.overflow = '';
  document.getElementById('bookForm').reset();
  editingRating = 0;
  updateStarInput(0);
}

// Star input (form modal only — targets #ratingInput stars)
function updateStarInput(val) {
  document.querySelectorAll('#ratingInput .si-star').forEach(s => {
    s.classList.toggle('lit', parseInt(s.dataset.value) <= val);
  });
}

document.querySelectorAll('#ratingInput .si-star').forEach(star => {
  star.addEventListener('mouseover', () => {
    document.querySelectorAll('#ratingInput .si-star').forEach(s => {
      s.classList.toggle('lit', parseInt(s.dataset.value) <= parseInt(star.dataset.value));
    });
  });
  star.addEventListener('mouseout', () => updateStarInput(editingRating));
  star.addEventListener('click',    () => {
    editingRating = parseInt(star.dataset.value);
    updateStarInput(editingRating);
  });
});

document.getElementById('clearRating').addEventListener('click', () => {
  editingRating = 0;
  updateStarInput(0);
});

// ── finalizeSave ─────────────────────────────────────────────────────────────
function finalizeSave(id, data) {
  if (id) {
    const idx = books.findIndex(b => b.id === id);
    books[idx] = { ...books[idx], ...data };
  } else {
    books.unshift({ id: generateId(), dateAdded: new Date().toISOString(), notes: '', ...data });
  }
  saveBooks();
  closeBookForm();
  renderAll();
}

// Form submit
document.getElementById('bookForm').addEventListener('submit', e => {
  e.preventDefault();
  const id    = document.getElementById('bookId').value;
  const title = document.getElementById('bookTitle').value.trim();
  const author= document.getElementById('bookAuthor').value.trim();
  if (!title || !author) return;

  const data = {
    title,
    author,
    cover:        document.getElementById('bookCover').value.trim(),
    status:       document.getElementById('bookStatus').value,
    rating:       editingRating || null,
    tags:         parseTags(document.getElementById('bookTags').value),
    dateFinished:  document.getElementById('bookDateFinished').value,
    dateStarted:   document.getElementById('bookDateStarted').value,
    currentPage:   parseInt(document.getElementById('bookCurrentPage').value) || 0,
    totalPages:    parseInt(document.getElementById('bookTotalPages').value) || 0,
  };

  // Handle file upload (async: wait for FileReader)
  const fileInput = document.getElementById('bookCoverFile');
  const file = fileInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      data.cover = e.target.result;
      finalizeSave(id, data);
    };
    reader.readAsDataURL(file);
    return; // wait for async
  }
  finalizeSave(id, data);
});

document.getElementById('addBookBtn').addEventListener('click', () => openBookForm());
document.getElementById('closeFormBtn').addEventListener('click', closeBookForm);
document.getElementById('cancelFormBtn').addEventListener('click', closeBookForm);

// Close form on backdrop click
document.getElementById('formOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeBookForm();
});

// ── Inline editing ───────────────────────────────────────────────────────────
let inlineRating = 0;

document.getElementById('editInlineBtn').addEventListener('click', () => {
  const book = books.find(b => b.id === currentBookId);
  if (!book) return;
  document.getElementById('inlineTitle').value = book.title;
  document.getElementById('inlineAuthor').value = book.author;
  document.getElementById('inlineStatus').value = book.status;
  document.getElementById('inlineTags').value = (book.tags || []).join(', ');
  document.getElementById('inlineCover').value = book.cover || '';
  document.getElementById('inlineCoverFile').value = '';
  document.getElementById('inlineCurrentPage').value = book.currentPage || '';
  document.getElementById('inlineTotalPages').value  = book.totalPages || '';
  inlineRating = book.rating || 0;
  updateInlineStars(inlineRating);
  document.getElementById('detailMeta').classList.add('hidden');
  document.getElementById('inlineEditForm').classList.remove('hidden');
});

document.getElementById('cancelInlineBtn').addEventListener('click', () => {
  document.getElementById('inlineEditForm').classList.add('hidden');
  document.getElementById('detailMeta').classList.remove('hidden');
});

document.getElementById('saveInlineBtn').addEventListener('click', () => {
  const book = books.find(b => b.id === currentBookId);
  if (!book) return;
  const doSave = (coverUrl) => {
    book.title = document.getElementById('inlineTitle').value.trim() || book.title;
    book.author = document.getElementById('inlineAuthor').value.trim() || book.author;
    book.status = document.getElementById('inlineStatus').value;
    book.rating = inlineRating || null;
    book.tags = parseTags(document.getElementById('inlineTags').value);
    book.currentPage = parseInt(document.getElementById('inlineCurrentPage').value) || 0;
    book.totalPages  = parseInt(document.getElementById('inlineTotalPages').value) || 0;
    if (coverUrl) book.cover = coverUrl;
    saveBooks();
    renderAll();
    openDetail(currentBookId);
    document.getElementById('inlineEditForm').classList.add('hidden');
    document.getElementById('detailMeta').classList.remove('hidden');
  };
  const file = document.getElementById('inlineCoverFile').files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = e => doSave(e.target.result);
    reader.readAsDataURL(file);
  } else {
    const urlVal = document.getElementById('inlineCover').value.trim();
    doSave(urlVal || book.cover);
  }
});

function updateInlineStars(val) {
  document.querySelectorAll('#inlineRatingInput .si-star').forEach(s => {
    s.classList.toggle('lit', parseInt(s.dataset.value) <= val);
  });
}

document.querySelectorAll('#inlineRatingInput .si-star').forEach(star => {
  star.addEventListener('mouseover', () => {
    document.querySelectorAll('#inlineRatingInput .si-star').forEach(s => {
      s.classList.toggle('lit', parseInt(s.dataset.value) <= parseInt(star.dataset.value));
    });
  });
  star.addEventListener('mouseout', () => updateInlineStars(inlineRating));
  star.addEventListener('click', () => {
    inlineRating = parseInt(star.dataset.value);
    updateInlineStars(inlineRating);
  });
});

document.getElementById('inlineClearRating').addEventListener('click', () => {
  inlineRating = 0;
  updateInlineStars(0);
});

// ── Reading Goal ─────────────────────────────────────────────────────────────
function updateGoalWidget() {
  const goal = parseInt(localStorage.getItem(GOAL_KEY) || '0', 10);
  const year  = new Date().getFullYear();
  const done  = books.filter(b => b.status === 'finished' &&
    b.dateFinished && b.dateFinished.startsWith(String(year))).length;
  const pct   = goal > 0 ? Math.min(100, Math.round(done / goal * 100)) : 0;
  const input = document.getElementById('goalInput');
  const fill  = document.getElementById('goalFill');
  const text  = document.getElementById('goalProgressText');
  if (input && !document.activeElement !== input) input.value = goal || '';
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = goal > 0 ? `${done} / ${goal} finished this year` : 'Set a goal above';
}

document.getElementById('goalInput').addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  if (val > 0) localStorage.setItem(GOAL_KEY, String(val));
  else localStorage.removeItem(GOAL_KEY);
  updateGoalWidget();
});

// ── Surprise Me ──────────────────────────────────────────────────────────────
document.getElementById('surpriseBtn').addEventListener('click', () => {
  if (books.length === 0) return;
  const toRead = books.filter(b => b.status === 'to-read');
  const pool   = toRead.length > 0 ? toRead : books;
  const random = pool[Math.floor(Math.random() * pool.length)];
  openDetail(random.id);
});

// ── Highlights / Quotes ──────────────────────────────────────────────────────
function renderQuotes(book) {
  const list = document.getElementById('quotesList');
  const quotes = book.quotes || [];
  if (quotes.length === 0) {
    list.innerHTML = '<p class="quotes-empty">No highlights yet — add a memorable passage.</p>';
    return;
  }
  list.innerHTML = quotes.map(q => `
    <div class="quote-card">
      <button class="quote-delete" data-qid="${q.id}" title="Remove">✕</button>
      <p class="quote-text">"${escHtml(q.text)}"</p>
      ${q.page ? `<span class="quote-page">p. ${escHtml(String(q.page))}</span>` : ''}
    </div>
  `).join('');
  list.querySelectorAll('.quote-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = books.find(b => b.id === currentBookId);
      if (!b) return;
      b.quotes = (b.quotes || []).filter(q => q.id !== btn.dataset.qid);
      saveBooks();
      renderQuotes(b);
    });
  });
}

document.getElementById('addQuoteBtn').addEventListener('click', () => {
  document.getElementById('quoteAddForm').classList.toggle('hidden');
  document.getElementById('quoteText').focus();
});

document.getElementById('cancelQuoteBtn').addEventListener('click', () => {
  document.getElementById('quoteAddForm').classList.add('hidden');
  document.getElementById('quoteText').value = '';
  document.getElementById('quotePage').value = '';
});

document.getElementById('saveQuoteBtn').addEventListener('click', () => {
  const text = document.getElementById('quoteText').value.trim();
  if (!text) return;
  const book = books.find(b => b.id === currentBookId);
  if (!book) return;
  if (!book.quotes) book.quotes = [];
  book.quotes.unshift({
    id: generateId(),
    text,
    page: document.getElementById('quotePage').value.trim(),
    addedAt: new Date().toISOString()
  });
  saveBooks();
  renderQuotes(book);
  document.getElementById('quoteAddForm').classList.add('hidden');
  document.getElementById('quoteText').value = '';
  document.getElementById('quotePage').value = '';
});

// ── Notes area Google search ─────────────────────────────────────────────────
const notesGoogleInput = document.getElementById('notesGoogleInput');
const notesGoogleBtn   = document.getElementById('notesGoogleBtn');

function doNotesGoogleSearch() {
  const q = notesGoogleInput.value.trim();
  if (q) window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank', 'noopener');
}

notesGoogleBtn.addEventListener('click', doNotesGoogleSearch);
notesGoogleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doNotesGoogleSearch();
});

// ── Search with dropdown ─────────────────────────────────────────────────────
const searchInput    = document.getElementById('searchInput');
const searchDropdown = document.getElementById('searchDropdown');
const searchResults  = document.getElementById('searchResults');

function renderSearchDropdown(q) {
  if (!q) { searchDropdown.classList.add('hidden'); return; }

  // Full-text search: title, author, tags, notes content
  const lower = q.toLowerCase();
  const matches = books.filter(b =>
    b.title.toLowerCase().includes(lower) ||
    b.author.toLowerCase().includes(lower) ||
    (b.tags || []).some(t => t.includes(lower)) ||
    (b.notes || '').toLowerCase().includes(lower)
  ).slice(0, 6);

  // Build result rows
  searchResults.innerHTML = matches.length
    ? matches.map(b => {
        const inNotes = (b.notes || '').toLowerCase().includes(lower);
        const snippet = inNotes ? getSnippet(b.notes, lower) : '';
        return `<button class="sr-item" data-id="${b.id}">
          <span class="sr-title">${highlight(b.title, q)}</span>
          <span class="sr-author">${highlight(b.author, q)}</span>
          ${snippet ? `<span class="sr-snippet">${snippet}</span>` : ''}
        </button>`;
      }).join('')
    : `<div class="sr-empty">No results for "<strong>${escHtml(q)}</strong>"</div>`;

  // Wire up clicks
  searchResults.querySelectorAll('.sr-item').forEach(btn => {
    btn.addEventListener('click', () => {
      closeDropdown();
      openDetail(btn.dataset.id);
    });
  });

  searchDropdown.classList.remove('hidden');
}

function getSnippet(text, query) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return '';
  const start = Math.max(0, i - 30);
  const end   = Math.min(text.length, i + query.length + 50);
  const raw   = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  return highlight(escHtml(raw), query);
}

function highlight(text, query) {
  if (!query) return escHtml(text);
  const escaped = escHtml(text);
  const re = new RegExp(`(${escHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(re, '<mark>$1</mark>');
}

function closeDropdown() {
  searchDropdown.classList.add('hidden');
}

searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  document.getElementById('clearSearch').classList.toggle('hidden', !searchQuery);
  renderSearchDropdown(searchQuery);
  renderLibrary();
});

searchInput.addEventListener('focus', () => {
  if (searchQuery) renderSearchDropdown(searchQuery);
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) closeDropdown();
});

document.getElementById('clearSearch').addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  document.getElementById('clearSearch').classList.add('hidden');
  closeDropdown();
  renderLibrary();
});

// ── Filter buttons ──────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderAll();
  });
});

document.getElementById('sortSelect').addEventListener('change', renderLibrary);

// ── Keyboard shortcuts ──────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!document.getElementById('formOverlay').classList.contains('hidden')) closeBookForm();
    else if (!document.getElementById('detailOverlay').classList.contains('hidden')) closeDetail();
  }
  // Cmd/Ctrl+K → focus search
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
  }
});

// ── Escape HTML ─────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Mobile sidebar drawer ────────────────────────────────────────────────────
const sidebarEl   = document.querySelector('.sidebar');
const backdropEl  = document.getElementById('sidebarBackdrop');
const sidebarBtn  = document.getElementById('sidebarToggle');

function openSidebar()  { sidebarEl.classList.add('open');    backdropEl.classList.add('visible'); }
function closeSidebar() { sidebarEl.classList.remove('open'); backdropEl.classList.remove('visible'); }

sidebarBtn.addEventListener('click', () =>
  sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar()
);
backdropEl.addEventListener('click', closeSidebar);

// Close sidebar when a filter is picked on mobile
document.querySelectorAll('.filter-btn, .tag-chip, .sort-select').forEach(el =>
  el.addEventListener('change', closeSidebar)
);
document.querySelectorAll('.filter-btn').forEach(btn =>
  btn.addEventListener('click', () => { if (window.innerWidth <= 768) closeSidebar(); })
);

// ── Init ────────────────────────────────────────────────────────────────────
initQuill();
renderAll();

// Expose for inline onclick
window.openBookForm = openBookForm;
