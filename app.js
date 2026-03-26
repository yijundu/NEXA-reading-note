// ── Auth / per-user storage ─────────────────────────────────────────────────
const _currentUser = getCurrentUser();
const uid = _currentUser ? _currentUser.id : 'local';
const BOOKS_KEY    = 'nexa_books_'    + uid;
const MEETINGS_KEY = 'nexa_meetings_' + uid;
const IDEAS_KEY    = 'nexa_ideas_'    + uid;
const GOAL_KEY     = 'nexa_goal_'     + uid;

if (_currentUser) {
  const nameEl = document.getElementById('userDisplayName');
  if (nameEl) nameEl.textContent = _currentUser.name;
}
document.getElementById('logoutBtn').addEventListener('click', logout);

// ── State ────────────────────────────────────────────────────────────────────
let books    = JSON.parse(localStorage.getItem(BOOKS_KEY)    || '[]');
let meetings = JSON.parse(localStorage.getItem(MEETINGS_KEY) || '[]');
let ideas    = JSON.parse(localStorage.getItem(IDEAS_KEY)    || '[]');

let currentSection   = 'library';
let currentFilter    = 'all';
let activeTag        = null;
let currentBookId    = null;
let currentMeetingId = null;
let currentIdeaId    = null;
let editingRating    = 0;
let notesDirty       = false;
let searchQuery      = '';

// section-specific filters
let meetingFilter     = 'all';
let meetingActiveTag  = null;
let ideaCatFilter     = 'all';
let ideaStatusFilter  = 'all';
let ideaActiveTag     = null;

// ── Persistence ──────────────────────────────────────────────────────────────
function saveBooks()    { localStorage.setItem(BOOKS_KEY,    JSON.stringify(books));    }
function saveMeetings() { localStorage.setItem(MEETINGS_KEY, JSON.stringify(meetings)); }
function saveIdeas()    { localStorage.setItem(IDEAS_KEY,    JSON.stringify(ideas));    }
function generateId()   { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── Escape HTML ──────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Theme ────────────────────────────────────────────────────────────────────
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
let darkMode = localStorage.getItem('nexa_theme') === 'dark' ||
  (!localStorage.getItem('nexa_theme') && prefersDark.matches);

function applyTheme() {
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  document.getElementById('themeIcon').textContent = darkMode ? '○' : '◑';
}
document.getElementById('themeToggle').addEventListener('click', () => {
  darkMode = !darkMode;
  localStorage.setItem('nexa_theme', darkMode ? 'dark' : 'light');
  applyTheme();
});
applyTheme();

// ── Helpers ──────────────────────────────────────────────────────────────────
function starsHtml(r) { return r ? '★'.repeat(r) + '☆'.repeat(5-r) : ''; }
function statusLabel(s) { return {reading:'Reading',finished:'Finished','to-read':'To Read',upcoming:'Upcoming',done:'Done',spark:'⚡ Spark',exploring:'Exploring',shelved:'Shelved'}[s] || s; }
function statusClass(s) { return {reading:'status-reading',finished:'status-finished','to-read':'status-to-read',upcoming:'status-upcoming',done:'status-done',spark:'status-spark',exploring:'status-exploring',shelved:'status-shelved'}[s] || ''; }
function categoryLabel(c) { return {work:'Work',personal:'Personal',creative:'Creative',tech:'Tech',other:'Other'}[c] || c; }
function categoryClass(c) { return 'cat-' + (c || 'other'); }
function parseTags(s) { return s.split(',').map(t=>t.trim().toLowerCase()).filter(Boolean); }
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'});
}
function formatDateTime(date, time) {
  const parts = [];
  if (date) parts.push(formatDate(date));
  if (time) parts.push(time);
  return parts.join(' · ');
}

// ── Section switching ────────────────────────────────────────────────────────
function switchSection(section) {
  currentSection = section;

  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.section === section)
  );

  // Sidebar panes
  document.getElementById('sidebarLibrary').classList.toggle('hidden', section !== 'library');
  document.getElementById('sidebarMeetings').classList.toggle('hidden', section !== 'meetings');
  document.getElementById('sidebarIdeas').classList.toggle('hidden', section !== 'ideas');
  document.getElementById('sidebarBin').classList.toggle('hidden', section !== 'bin');

  // Main sections
  document.getElementById('librarySection').classList.toggle('hidden', section !== 'library');
  document.getElementById('meetingsSection').classList.toggle('hidden', section !== 'meetings');
  document.getElementById('ideasSection').classList.toggle('hidden', section !== 'ideas');
  document.getElementById('binSection').classList.toggle('hidden', section !== 'bin');

  // Add button — hide on Bin
  const labels = { library: '+ Add Book', meetings: '+ Add Meeting', ideas: '+ Add Idea', bin: '' };
  const addBtn = document.getElementById('addEntryBtn');
  addBtn.textContent = labels[section] || '';
  addBtn.style.display = section === 'bin' ? 'none' : '';

  // Surprise btn visibility (only library)
  document.getElementById('surpriseBtn').style.display = section === 'library' ? '' : 'none';

  // Search placeholder
  const placeholders = { library: 'Search books…', meetings: 'Search meetings…', ideas: 'Search ideas…', bin: 'Bin' };
  document.getElementById('searchInput').placeholder = placeholders[section] || 'Search…';

  // Clear search
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearch').classList.add('hidden');
  document.getElementById('searchDropdown').classList.add('hidden');

  renderAll();
}

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => switchSection(tab.dataset.section));
});

// ── Stats bar ────────────────────────────────────────────────────────────────
function updateStatsBar() {
  const a = document.getElementById('statA');
  const b = document.getElementById('statB');
  const c = document.getElementById('statC');
  if (currentSection === 'library') {
    a.textContent = books.length + ' book' + (books.length !== 1 ? 's' : '');
    b.textContent = books.filter(x => x.status === 'reading').length + ' reading';
    c.textContent = books.filter(x => x.status === 'finished').length + ' finished';
  } else if (currentSection === 'meetings') {
    a.textContent = meetings.length + ' meeting' + (meetings.length !== 1 ? 's' : '');
    b.textContent = meetings.filter(x => x.status === 'upcoming').length + ' upcoming';
    c.textContent = meetings.filter(x => x.status === 'done').length + ' done';
  } else {
    a.textContent = ideas.length + ' idea' + (ideas.length !== 1 ? 's' : '');
    b.textContent = ideas.filter(x => x.status === 'spark').length + ' sparks';
    c.textContent = ideas.filter(x => x.status === 'exploring').length + ' exploring';
  }
}

// ── renderAll ────────────────────────────────────────────────────────────────
function updateNavCounts() {
  document.getElementById('navCountLibrary').textContent  = books.filter(b=>!b.deleted).length;
  document.getElementById('navCountMeetings').textContent = meetings.filter(m=>!m.deleted).length;
  document.getElementById('navCountIdeas').textContent    = ideas.filter(i=>!i.deleted).length;
  const binCount = books.filter(b=>b.deleted).length + meetings.filter(m=>m.deleted).length + ideas.filter(i=>i.deleted).length;
  const binBadge = document.getElementById('navCountBin');
  binBadge.textContent = binCount;
  binBadge.classList.toggle('bin-has-items', binCount > 0);
}

function renderAll() {
  updateStatsBar();
  updateNavCounts();
  if (currentSection === 'library') {
    updateBookCounts();
    renderTagCloud();
    renderLibrary();
    updateGoalWidget();
  } else if (currentSection === 'meetings') {
    updateMeetingCounts();
    renderMeetingTagCloud();
    renderMeetings();
  } else if (currentSection === 'ideas') {
    updateIdeaCounts();
    renderIdeaTagCloud();
    renderIdeas();
  } else if (currentSection === 'bin') {
    renderBin();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LIBRARY SECTION
// ════════════════════════════════════════════════════════════════════════════

function updateBookCounts() {
  document.getElementById('countAll').textContent      = books.length;
  document.getElementById('countReading').textContent  = books.filter(b => b.status === 'reading').length;
  document.getElementById('countFinished').textContent = books.filter(b => b.status === 'finished').length;
  document.getElementById('countToRead').textContent   = books.filter(b => b.status === 'to-read').length;
}

function renderTagCloud() {
  const freq = {};
  books.forEach(b => (b.tags || []).forEach(t => { freq[t] = (freq[t]||0)+1; }));
  const cloud = document.getElementById('tagCloud');
  cloud.innerHTML = Object.entries(freq).sort((a,b)=>b[1]-a[1])
    .map(([tag]) => `<button class="tag-chip${activeTag===tag?' active':''}" data-tag="${tag}">${tag}</button>`).join('');
  cloud.querySelectorAll('.tag-chip').forEach(btn => {
    btn.addEventListener('click', () => { activeTag = activeTag === btn.dataset.tag ? null : btn.dataset.tag; renderAll(); });
  });
}

function getFilteredBooks() {
  const sort = document.getElementById('sortSelect').value;
  let list = books.filter(b => !b.deleted);
  if (currentFilter !== 'all') list = list.filter(b => b.status === currentFilter);
  if (activeTag) list = list.filter(b => b.tags && b.tags.includes(activeTag));
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(b =>
      b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) ||
      (b.tags||[]).some(t=>t.includes(q)) || (b.notes||'').toLowerCase().includes(q)
    );
  }
  list.sort((a,b) => {
    switch(sort) {
      case 'date-added-asc': return a.dateAdded.localeCompare(b.dateAdded);
      case 'title-asc':  return a.title.localeCompare(b.title);
      case 'title-desc': return b.title.localeCompare(a.title);
      case 'rating-desc': return (b.rating||0)-(a.rating||0);
      default: return b.dateAdded.localeCompare(a.dateAdded);
    }
  });
  return list;
}

// ── Row action buttons (shared across all 3 sections) ───────────────────────
const PENCIL_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const TRASH_SVG  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

function rowActionsHtml(id, type) {
  return `<div class="row-actions">
    <button class="row-action-btn rn-btn" data-id="${id}" data-type="${type}" title="Rename">${PENCIL_SVG}</button>
    <button class="row-action-btn rd-btn" data-id="${id}" data-type="${type}" title="Delete">${TRASH_SVG}</button>
  </div>`;
}

function attachRowActions(gridEl) {
  // Only attach once per grid element — re-renders replace innerHTML but keep the element
  if (gridEl._rowActionsAttached) return;
  gridEl._rowActionsAttached = true;

  gridEl.addEventListener('click', e => {
    const rnBtn = e.target.closest('.rn-btn');
    const rdBtn = e.target.closest('.rd-btn');
    if (rnBtn) {
      e.stopPropagation();
      startRowRename(rnBtn.dataset.id, rnBtn.dataset.type, rnBtn);
      return;
    }
    if (rdBtn) {
      e.stopPropagation();
      if (rdBtn.classList.contains('confirming')) {
        performRowDelete(rdBtn.dataset.id, rdBtn.dataset.type);
      } else {
        gridEl.querySelectorAll('.rd-btn.confirming').forEach(b => { clearTimeout(b._timer); b.classList.remove('confirming'); });
        rdBtn.classList.add('confirming');
        rdBtn._timer = setTimeout(() => rdBtn.classList.remove('confirming'), 3000);
      }
      return;
    }
    // click elsewhere resets confirming state
    gridEl.querySelectorAll('.rd-btn.confirming').forEach(b => { clearTimeout(b._timer); b.classList.remove('confirming'); });
  }, true); // ← capture phase: fires BEFORE the card's bubble-phase listener
}

function startRowRename(id, type, btn) {
  const card = btn.closest('[data-id]');
  const titleEl = card.querySelector('.card-title, .entry-card-title');
  if (!titleEl) return;
  const original = titleEl.textContent.trim();
  titleEl.style.visibility = 'hidden';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = original;
  input.className = 'row-rename-input';
  titleEl.parentNode.insertBefore(input, titleEl);
  input.focus(); input.select();
  let done = false;
  const save = () => {
    if (done) return; done = true;
    const newTitle = input.value.trim() || original;
    if (type === 'book')    { const it = books.find(b=>b.id===id);    if(it){ it.title=newTitle; saveBooks(); } }
    else if(type==='meeting'){ const it = meetings.find(m=>m.id===id); if(it){ it.title=newTitle; saveMeetings(); } }
    else                    { const it = ideas.find(i=>i.id===id);    if(it){ it.title=newTitle; saveIdeas(); } }
    renderAll();
  };
  const cancel = () => { if(done) return; done=true; renderAll(); };
  input.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();save();} if(e.key==='Escape') cancel(); });
  input.addEventListener('blur', save);
}

// ── Bin / soft-delete ────────────────────────────────────────────────────────
let _pendingDelete = null;

function performRowDelete(id, type) {
  // Show confirmation modal instead of deleting immediately
  const arr = type==='book' ? books : type==='meeting' ? meetings : ideas;
  const item = arr.find(x => x.id === id);
  if (!item) return;
  _pendingDelete = { id, type };
  document.getElementById('confirmItemName').textContent = item.title || 'This item';
  document.getElementById('deleteConfirmOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

document.getElementById('confirmCancelBtn').addEventListener('click', () => {
  _pendingDelete = null;
  document.getElementById('deleteConfirmOverlay').classList.add('hidden');
  document.body.style.overflow = '';
});

document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
  if (!_pendingDelete) return;
  const { id, type } = _pendingDelete;
  _pendingDelete = null;
  document.getElementById('deleteConfirmOverlay').classList.add('hidden');
  document.body.style.overflow = '';
  moveItemToBin(id, type);
});

// Close confirm on backdrop click
document.getElementById('deleteConfirmOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) {
    _pendingDelete = null;
    e.currentTarget.classList.add('hidden');
    document.body.style.overflow = '';
  }
});

function moveItemToBin(id, type) {
  const arr = type==='book' ? books : type==='meeting' ? meetings : ideas;
  const item = arr.find(x => x.id === id);
  if (!item) return;
  item.deleted = true;
  item.deletedAt = new Date().toISOString();
  if (type==='book') saveBooks();
  else if (type==='meeting') saveMeetings();
  else saveIdeas();
  renderAll();
}

function restoreFromBin(id, type) {
  const arr = type==='book' ? books : type==='meeting' ? meetings : ideas;
  const item = arr.find(x => x.id === id);
  if (!item) return;
  delete item.deleted;
  delete item.deletedAt;
  if (type==='book') saveBooks();
  else if (type==='meeting') saveMeetings();
  else saveIdeas();
  renderAll();
}

function permanentlyDelete(id, type) {
  if (type==='book')     { books    = books.filter(b=>b.id!==id);    saveBooks(); }
  else if(type==='meeting'){ meetings = meetings.filter(m=>m.id!==id); saveMeetings(); }
  else                   { ideas    = ideas.filter(i=>i.id!==id);    saveIdeas(); }
  renderAll();
}

function renderBin() {
  const binView  = document.getElementById('binView');
  const binEmpty = document.getElementById('binEmpty');
  const all = [
    ...books.filter(b=>b.deleted).map(b=>({...b,_type:'book'})),
    ...meetings.filter(m=>m.deleted).map(m=>({...m,_type:'meeting'})),
    ...ideas.filter(i=>i.deleted).map(i=>({...i,_type:'idea'}))
  ].sort((a,b)=> new Date(b.deletedAt)-new Date(a.deletedAt));

  if (!all.length) { binView.innerHTML=''; binEmpty.classList.remove('hidden'); return; }
  binEmpty.classList.add('hidden');

  binView.innerHTML = all.map(item => `
    <div class="bin-item">
      <span class="bin-type-badge bin-type-${item._type}">${item._type==='book'?'Book':item._type==='meeting'?'Meeting':'Idea'}</span>
      <div class="bin-item-body">
        <div class="bin-item-title">${escHtml(item.title)}</div>
        <div class="bin-item-date">Deleted ${item.deletedAt ? formatDate(item.deletedAt.split('T')[0]) : ''}</div>
      </div>
      <div class="bin-item-actions">
        <button class="btn-restore"  data-id="${item.id}" data-type="${item._type}">Restore</button>
        <button class="btn-delete-forever" data-id="${item.id}" data-type="${item._type}">Delete Forever</button>
      </div>
    </div>`).join('');

  binView.querySelectorAll('.btn-restore').forEach(btn =>
    btn.addEventListener('click', () => restoreFromBin(btn.dataset.id, btn.dataset.type))
  );
  binView.querySelectorAll('.btn-delete-forever').forEach(btn =>
    btn.addEventListener('click', () => {
      if (confirm(`Permanently delete "${btn.closest('.bin-item').querySelector('.bin-item-title').textContent}"?\nThis cannot be undone.`)) {
        permanentlyDelete(btn.dataset.id, btn.dataset.type);
      }
    })
  );
}

document.getElementById('emptyBinBtn').addEventListener('click', () => {
  const total = books.filter(b=>b.deleted).length + meetings.filter(m=>m.deleted).length + ideas.filter(i=>i.deleted).length;
  if (!total) return;
  if (!confirm(`Permanently delete all ${total} item(s) in the Bin? This cannot be undone.`)) return;
  books    = books.filter(b=>!b.deleted);    saveBooks();
  meetings = meetings.filter(m=>!m.deleted); saveMeetings();
  ideas    = ideas.filter(i=>!i.deleted);    saveIdeas();
  renderAll();
});

// ── Library list ─────────────────────────────────────────────────────────────
function renderLibrary() {
  const list = getFilteredBooks();
  const grid  = document.getElementById('libraryView');
  const empty = document.getElementById('libraryEmpty');
  if (!list.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = list.map(book => {
    const pct = (book.status==='reading'&&book.totalPages>0)
      ? Math.min(100,Math.round((book.currentPage||0)/book.totalPages*100)) : null;
    return `
    <article class="book-card" data-id="${book.id}">
      ${book.cover
        ? `<img class="card-cover" src="${escHtml(book.cover)}" alt="${escHtml(book.title)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="card-cover-placeholder" style="display:none"></div>`
        : `<div class="card-cover-placeholder"></div>`}
      <div class="card-body">
        <div class="card-title">${escHtml(book.title)}</div>
        <div class="card-author">${escHtml(book.author)}</div>
        <div class="card-footer">
          ${book.rating?`<span class="card-stars">${starsHtml(book.rating)}</span>`:''}
          <span class="card-status ${statusClass(book.status)}">${statusLabel(book.status)}</span>
        </div>
        ${pct!==null?`<div class="card-progress-track"><div class="card-progress-fill" style="width:${pct}%"></div></div>`:''}
      </div>
      ${rowActionsHtml(book.id,'book')}
    </article>`;
  }).join('');
  grid.querySelectorAll('.book-card').forEach(card =>
    card.addEventListener('click', e => {
      if (e.target.closest('.row-actions')) return;
      openDetail(card.dataset.id);
    })
  );
  attachRowActions(grid);
}

// Book Detail
function openDetail(id) {
  const book = books.find(b => b.id === id);
  if (!book) return;
  currentBookId = id;
  const coverEl = document.getElementById('detailCover');
  if (book.cover) {
    coverEl.innerHTML = `<img src="${escHtml(book.cover)}" alt="${escHtml(book.title)}" onerror="this.parentElement.innerHTML='<div class=cover-large-placeholder></div>'">`;
  } else {
    coverEl.innerHTML = `<div class="cover-large-placeholder"></div>`;
  }
  document.getElementById('detailTitle').textContent  = book.title;
  document.getElementById('detailAuthor').textContent = book.author;
  document.getElementById('detailRating').textContent = book.rating ? starsHtml(book.rating) : '';
  const statusEl = document.getElementById('detailStatus');
  statusEl.textContent = statusLabel(book.status);
  statusEl.className   = `status-badge ${statusClass(book.status)}`;
  document.getElementById('detailTags').innerHTML = (book.tags||[]).map(t=>`<span class="meta-tag">${escHtml(t)}</span>`).join('');
  const parts = [];
  if (book.dateStarted)  parts.push('Started: '  + formatDate(book.dateStarted));
  if (book.dateFinished) parts.push('Finished: ' + formatDate(book.dateFinished));
  document.getElementById('detailDate').textContent = parts.join(' · ');
  const progressEl = document.getElementById('detailProgress');
  if (book.totalPages > 0) {
    const cur = parseInt(book.currentPage)||0, tot = parseInt(book.totalPages), pct = Math.min(100,Math.round(cur/tot*100));
    document.getElementById('progressText').textContent = `${cur} / ${tot} pages · ${pct}%`;
    document.getElementById('progressFill').style.width = pct + '%';
    progressEl.classList.remove('hidden');
  } else { progressEl.classList.add('hidden'); }
  document.getElementById('googleBookLink').href = `https://www.google.com/search?q=${encodeURIComponent(book.title+' '+book.author)}`;
  document.getElementById('inlineEditForm').classList.add('hidden');
  document.getElementById('detailMeta').classList.remove('hidden');
  loadNotesIntoQuill(book);
  renderQuotes(book);
  document.getElementById('detailOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  if (notesDirty && !confirm('You have unsaved notes. Discard changes?')) return;
  notesDirty = false; currentBookId = null;
  if (quill) quill.clipboard.dangerouslyPasteHTML('');
  document.getElementById('detailOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

// Book Quill
let quill = null, autoSaveTimer = null;

function setAutoSaveStatus(state, elId='autoSaveStatus') {
  const el = document.getElementById(elId);
  if (!el) return;
  if (state === 'pending') { el.textContent='Saving…'; el.className='autosave-status pending'; }
  else if (state === 'saved') {
    el.textContent='✓ Saved'; el.className='autosave-status saved';
    setTimeout(()=>{ if(el.classList.contains('saved')){el.textContent='';el.className='autosave-status';} }, 2500);
  }
}

function initQuill() {
  quill = new Quill('#quillEditor', {
    theme: 'snow',
    placeholder: 'Start writing your notes…',
    modules: { toolbar: [
      [{header:[1,2,3,false]}],
      ['bold','italic','underline','strike'],
      [{color:[]},{background:[]}],
      [{align:[]}],
      [{list:'ordered'},{list:'bullet'},{list:'check'}],
      [{indent:'-1'},{indent:'+1'}],
      ['blockquote','code-block'],['link'],['clean']
    ]}
  });
  quill.on('text-change', () => {
    if (!currentBookId) return;
    notesDirty = true;
    document.getElementById('cancelNotesBtn').classList.remove('hidden');
    setAutoSaveStatus('pending');
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      const book = books.find(b=>b.id===currentBookId);
      if (book && quill) {
        book.notes = quill.root.innerHTML === '<p><br></p>' ? '' : quill.root.innerHTML;
        saveBooks(); notesDirty = false;
        document.getElementById('cancelNotesBtn').classList.add('hidden');
        setAutoSaveStatus('saved');
      }
    }, 1500);
  });
}

function loadNotesIntoQuill(book) {
  if (!quill) return;
  quill.clipboard.dangerouslyPasteHTML(book?.notes || '');
  notesDirty = false;
  document.getElementById('cancelNotesBtn').classList.add('hidden');
}

document.getElementById('saveNotesBtn').addEventListener('click', () => {
  const book = books.find(b=>b.id===currentBookId);
  if (!book||!quill) return;
  book.notes = quill.root.innerHTML==='<p><br></p>' ? '' : quill.root.innerHTML;
  saveBooks(); notesDirty = false;
  document.getElementById('cancelNotesBtn').classList.add('hidden');
  setAutoSaveStatus('saved');
});
document.getElementById('cancelNotesBtn').addEventListener('click', () => {
  if (!confirm('Discard unsaved changes?')) return;
  loadNotesIntoQuill(books.find(b=>b.id===currentBookId));
});
document.getElementById('backBtn').addEventListener('click', closeDetail);
document.getElementById('editBookBtn').addEventListener('click', () => { const id=currentBookId; closeDetail(); openBookForm(id); });
document.getElementById('deleteBookBtn').addEventListener('click', () => {
  if (!confirm('Delete this book and all its notes?')) return;
  books = books.filter(b=>b.id!==currentBookId); saveBooks(); closeDetail(); renderAll();
});

// Book form
function openBookForm(id=null) {
  const book = id ? books.find(b=>b.id===id) : null;
  editingRating = book?.rating || 0;
  document.getElementById('formTitle').textContent = book ? 'Edit Book' : 'Add Book';
  document.getElementById('bookId').value          = book?.id || '';
  document.getElementById('bookTitle').value       = book?.title || '';
  document.getElementById('bookAuthor').value      = book?.author || '';
  document.getElementById('bookCover').value       = book?.cover || '';
  document.getElementById('bookCoverFile').value   = '';
  document.getElementById('bookStatus').value      = book?.status || 'to-read';
  document.getElementById('bookTags').value        = (book?.tags||[]).join(', ');
  document.getElementById('bookDateFinished').value= book?.dateFinished || '';
  document.getElementById('bookDateStarted').value = book?.dateStarted || '';
  document.getElementById('bookCurrentPage').value = book?.currentPage || '';
  document.getElementById('bookTotalPages').value  = book?.totalPages || '';
  updateStarInput(editingRating);
  document.getElementById('formOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.getElementById('bookTitle').focus();
}
function closeBookForm() {
  document.getElementById('formOverlay').classList.add('hidden');
  document.body.style.overflow = '';
  document.getElementById('bookForm').reset();
  editingRating = 0; updateStarInput(0);
}
function updateStarInput(val) {
  document.querySelectorAll('#ratingInput .si-star').forEach(s=>s.classList.toggle('lit',parseInt(s.dataset.value)<=val));
}
document.querySelectorAll('#ratingInput .si-star').forEach(star => {
  star.addEventListener('mouseover', ()=>document.querySelectorAll('#ratingInput .si-star').forEach(s=>s.classList.toggle('lit',parseInt(s.dataset.value)<=parseInt(star.dataset.value))));
  star.addEventListener('mouseout', ()=>updateStarInput(editingRating));
  star.addEventListener('click',    ()=>{ editingRating=parseInt(star.dataset.value); updateStarInput(editingRating); });
});
document.getElementById('clearRating').addEventListener('click', ()=>{ editingRating=0; updateStarInput(0); });

function finalizeSave(id, data) {
  if (id) { const idx=books.findIndex(b=>b.id===id); books[idx]={...books[idx],...data}; }
  else books.unshift({id:generateId(), dateAdded:new Date().toISOString(), notes:'', ...data});
  saveBooks(); closeBookForm(); renderAll();
}
document.getElementById('bookForm').addEventListener('submit', e => {
  e.preventDefault();
  const id=document.getElementById('bookId').value;
  const title=document.getElementById('bookTitle').value.trim();
  const author=document.getElementById('bookAuthor').value.trim();
  if (!title||!author) return;
  const data = {
    title, author,
    cover: document.getElementById('bookCover').value.trim(),
    status: document.getElementById('bookStatus').value,
    rating: editingRating||null,
    tags: parseTags(document.getElementById('bookTags').value),
    dateFinished: document.getElementById('bookDateFinished').value,
    dateStarted:  document.getElementById('bookDateStarted').value,
    currentPage:  parseInt(document.getElementById('bookCurrentPage').value)||0,
    totalPages:   parseInt(document.getElementById('bookTotalPages').value)||0,
  };
  const file = document.getElementById('bookCoverFile').files[0];
  if (file) { const r=new FileReader(); r.onload=e=>{data.cover=e.target.result; finalizeSave(id,data);}; r.readAsDataURL(file); return; }
  finalizeSave(id, data);
});
document.getElementById('closeFormBtn').addEventListener('click', closeBookForm);
document.getElementById('cancelFormBtn').addEventListener('click', closeBookForm);
document.getElementById('formOverlay').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeBookForm(); });

// Inline book editing
let inlineRating = 0;
document.getElementById('editInlineBtn').addEventListener('click', () => {
  const book=books.find(b=>b.id===currentBookId); if(!book) return;
  document.getElementById('inlineTitle').value=book.title;
  document.getElementById('inlineAuthor').value=book.author;
  document.getElementById('inlineStatus').value=book.status;
  document.getElementById('inlineTags').value=(book.tags||[]).join(', ');
  document.getElementById('inlineCover').value=book.cover||'';
  document.getElementById('inlineCoverFile').value='';
  document.getElementById('inlineCurrentPage').value=book.currentPage||'';
  document.getElementById('inlineTotalPages').value=book.totalPages||'';
  inlineRating=book.rating||0; updateInlineStars(inlineRating);
  document.getElementById('detailMeta').classList.add('hidden');
  document.getElementById('inlineEditForm').classList.remove('hidden');
});
document.getElementById('cancelInlineBtn').addEventListener('click', ()=>{
  document.getElementById('inlineEditForm').classList.add('hidden');
  document.getElementById('detailMeta').classList.remove('hidden');
});
document.getElementById('saveInlineBtn').addEventListener('click', ()=>{
  const book=books.find(b=>b.id===currentBookId); if(!book) return;
  const doSave=(coverUrl)=>{
    book.title=document.getElementById('inlineTitle').value.trim()||book.title;
    book.author=document.getElementById('inlineAuthor').value.trim()||book.author;
    book.status=document.getElementById('inlineStatus').value;
    book.rating=inlineRating||null;
    book.tags=parseTags(document.getElementById('inlineTags').value);
    book.currentPage=parseInt(document.getElementById('inlineCurrentPage').value)||0;
    book.totalPages=parseInt(document.getElementById('inlineTotalPages').value)||0;
    if(coverUrl) book.cover=coverUrl;
    saveBooks(); renderAll(); openDetail(currentBookId);
    document.getElementById('inlineEditForm').classList.add('hidden');
    document.getElementById('detailMeta').classList.remove('hidden');
  };
  const file=document.getElementById('inlineCoverFile').files[0];
  if(file){const r=new FileReader();r.onload=e=>doSave(e.target.result);r.readAsDataURL(file);}
  else doSave(document.getElementById('inlineCover').value.trim()||book.cover);
});
function updateInlineStars(val) {
  document.querySelectorAll('#inlineRatingInput .si-star').forEach(s=>s.classList.toggle('lit',parseInt(s.dataset.value)<=val));
}
document.querySelectorAll('#inlineRatingInput .si-star').forEach(star=>{
  star.addEventListener('mouseover',()=>document.querySelectorAll('#inlineRatingInput .si-star').forEach(s=>s.classList.toggle('lit',parseInt(s.dataset.value)<=parseInt(star.dataset.value))));
  star.addEventListener('mouseout',()=>updateInlineStars(inlineRating));
  star.addEventListener('click',()=>{inlineRating=parseInt(star.dataset.value);updateInlineStars(inlineRating);});
});
document.getElementById('inlineClearRating').addEventListener('click',()=>{inlineRating=0;updateInlineStars(0);});

// Reading Goal
function updateGoalWidget() {
  const goal=parseInt(localStorage.getItem(GOAL_KEY)||'0',10);
  const year=new Date().getFullYear();
  const done=books.filter(b=>b.status==='finished'&&b.dateFinished&&b.dateFinished.startsWith(String(year))).length;
  const pct=goal>0?Math.min(100,Math.round(done/goal*100)):0;
  const input=document.getElementById('goalInput');
  const fill=document.getElementById('goalFill');
  const text=document.getElementById('goalProgressText');
  if(input&&document.activeElement!==input) input.value=goal||'';
  if(fill) fill.style.width=pct+'%';
  if(text) text.textContent=goal>0?`${done} / ${goal} finished this year`:'Set a goal above';
}
document.getElementById('goalInput').addEventListener('input',e=>{
  const val=parseInt(e.target.value,10);
  if(val>0) localStorage.setItem(GOAL_KEY,String(val)); else localStorage.removeItem(GOAL_KEY);
  updateGoalWidget();
});

// Highlights / Quotes
function renderQuotes(book) {
  const list=document.getElementById('quotesList');
  const quotes=book.quotes||[];
  if(!quotes.length){list.innerHTML='<p class="quotes-empty">No highlights yet — add a memorable passage.</p>';return;}
  list.innerHTML=quotes.map(q=>`
    <div class="quote-card">
      <button class="quote-delete" data-qid="${q.id}" title="Remove">✕</button>
      <p class="quote-text">"${escHtml(q.text)}"</p>
      ${q.page?`<span class="quote-page">p. ${escHtml(String(q.page))}</span>`:''}
    </div>`).join('');
  list.querySelectorAll('.quote-delete').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const b=books.find(b=>b.id===currentBookId); if(!b) return;
      b.quotes=(b.quotes||[]).filter(q=>q.id!==btn.dataset.qid);
      saveBooks(); renderQuotes(b);
    });
  });
}
document.getElementById('addQuoteBtn').addEventListener('click',()=>{
  document.getElementById('quoteAddForm').classList.toggle('hidden');
  document.getElementById('quoteText').focus();
});
document.getElementById('cancelQuoteBtn').addEventListener('click',()=>{
  document.getElementById('quoteAddForm').classList.add('hidden');
  document.getElementById('quoteText').value=''; document.getElementById('quotePage').value='';
});
document.getElementById('saveQuoteBtn').addEventListener('click',()=>{
  const text=document.getElementById('quoteText').value.trim(); if(!text) return;
  const book=books.find(b=>b.id===currentBookId); if(!book) return;
  if(!book.quotes) book.quotes=[];
  book.quotes.unshift({id:generateId(),text,page:document.getElementById('quotePage').value.trim(),addedAt:new Date().toISOString()});
  saveBooks(); renderQuotes(book);
  document.getElementById('quoteAddForm').classList.add('hidden');
  document.getElementById('quoteText').value=''; document.getElementById('quotePage').value='';
});

// Surprise Me
document.getElementById('surpriseBtn').addEventListener('click',()=>{
  if(!books.length) return;
  const pool=books.filter(b=>b.status==='to-read');
  const random=(pool.length?pool:books)[Math.floor(Math.random()*(pool.length||books.length))];
  openDetail(random.id);
});

// Book filter buttons
document.querySelectorAll('[data-section="library"][data-filter]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-section="library"][data-filter]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); currentFilter=btn.dataset.filter; renderAll();
  });
});
document.getElementById('sortSelect').addEventListener('change', renderLibrary);

// ════════════════════════════════════════════════════════════════════════════
// MEETINGS SECTION
// ════════════════════════════════════════════════════════════════════════════

function updateMeetingCounts() {
  document.getElementById('countMeetingsAll').textContent     = meetings.length;
  document.getElementById('countMeetingsUpcoming').textContent= meetings.filter(m=>m.status==='upcoming').length;
  document.getElementById('countMeetingsDone').textContent    = meetings.filter(m=>m.status==='done').length;
}

function renderMeetingTagCloud() {
  const freq={};
  meetings.forEach(m=>(m.tags||[]).forEach(t=>{freq[t]=(freq[t]||0)+1;}));
  const cloud=document.getElementById('meetingTagCloud');
  cloud.innerHTML=Object.entries(freq).sort((a,b)=>b[1]-a[1])
    .map(([tag])=>`<button class="tag-chip${meetingActiveTag===tag?' active':''}" data-tag="${tag}">${tag}</button>`).join('');
  cloud.querySelectorAll('.tag-chip').forEach(btn=>{
    btn.addEventListener('click',()=>{meetingActiveTag=meetingActiveTag===btn.dataset.tag?null:btn.dataset.tag; renderAll();});
  });
}

function getFilteredMeetings() {
  const sort=document.getElementById('meetingSortSelect').value;
  let list=meetings.filter(m=>!m.deleted);
  if(meetingFilter!=='all') list=list.filter(m=>m.status===meetingFilter);
  if(meetingActiveTag) list=list.filter(m=>m.tags&&m.tags.includes(meetingActiveTag));
  if(searchQuery){
    const q=searchQuery.toLowerCase();
    list=list.filter(m=>
      m.title.toLowerCase().includes(q)||
      (m.attendees||[]).some(a=>a.toLowerCase().includes(q))||
      (m.tags||[]).some(t=>t.includes(q))||
      (m.notes||'').toLowerCase().includes(q)
    );
  }
  list.sort((a,b)=>{
    if(sort==='date-asc') return (a.date||'').localeCompare(b.date||'');
    if(sort==='title-asc') return a.title.localeCompare(b.title);
    return (b.date||'').localeCompare(a.date||'');
  });
  return list;
}

function renderMeetings() {
  const list=getFilteredMeetings();
  const grid=document.getElementById('meetingsView');
  const empty=document.getElementById('meetingsEmpty');
  if(!list.length){grid.innerHTML='';empty.classList.remove('hidden');return;}
  empty.classList.add('hidden');
  const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  grid.innerHTML=list.map(m=>{
    const d = m.date ? new Date(m.date+'T00:00:00') : null;
    const mon = d ? monthNames[d.getMonth()] : '';
    const day = d ? d.getDate() : '';
    const actionsDone=(m.actionItems||[]).filter(a=>a.done).length;
    const actionsTotal=(m.actionItems||[]).length;
    const sub=[m.time, (m.attendees||[]).slice(0,3).join(', ')+(m.attendees?.length>3?` +${m.attendees.length-3}`:'')].filter(Boolean).join(' · ');
    return `
    <article class="entry-card" data-id="${m.id}">
      <div class="entry-card-left">
        <div class="list-date-box">
          <span class="date-box-month">${mon}</span>
          <span class="date-box-day">${day}</span>
        </div>
      </div>
      <div class="entry-card-body">
        <div class="entry-card-title">${escHtml(m.title)}</div>
        ${sub?`<div class="entry-card-sub">${escHtml(sub)}</div>`:''}
      </div>
      <div class="entry-card-meta">
        ${actionsTotal?`<span class="actions-chip">${actionsDone}/${actionsTotal}</span>`:''}
        <span class="status-badge ${statusClass(m.status)}">${statusLabel(m.status)}</span>
      </div>
      ${rowActionsHtml(m.id,'meeting')}
    </article>`;
  }).join('');
  grid.querySelectorAll('.entry-card').forEach(card=>
    card.addEventListener('click', e => {
      if (e.target.closest('.row-actions')) return;
      openMeetingDetail(card.dataset.id);
    })
  );
  attachRowActions(grid);
}

// Meeting detail
let quillMeeting=null, meetingAutoSaveTimer=null, meetingNotesDirty=false;

function initMeetingQuill() {
  if(quillMeeting) return;
  quillMeeting=new Quill('#meetingQuillEditor',{
    theme:'snow', placeholder:'Take meeting notes here…',
    modules:{toolbar:[[{header:[1,2,3,false]}],['bold','italic','underline','strike'],[{list:'ordered'},{list:'bullet'},{list:'check'}],['blockquote','link'],['clean']]}
  });
  quillMeeting.on('text-change',()=>{
    if(!currentMeetingId) return;
    meetingNotesDirty=true; setAutoSaveStatus('pending','meetingAutoSave');
    clearTimeout(meetingAutoSaveTimer);
    meetingAutoSaveTimer=setTimeout(()=>{
      const m=meetings.find(m=>m.id===currentMeetingId);
      if(m&&quillMeeting){
        m.notes=quillMeeting.root.innerHTML==='<p><br></p>'?'':quillMeeting.root.innerHTML;
        saveMeetings(); meetingNotesDirty=false; setAutoSaveStatus('saved','meetingAutoSave');
      }
    },1500);
  });
}

function openMeetingDetail(id) {
  const m=meetings.find(x=>x.id===id); if(!m) return;
  currentMeetingId=id;
  const statusEl=document.getElementById('meetingDetailStatus');
  statusEl.textContent=statusLabel(m.status); statusEl.className=`status-badge ${statusClass(m.status)}`;
  document.getElementById('meetingDetailTitle').textContent=m.title;
  document.getElementById('meetingDetailDateTime').textContent=formatDateTime(m.date,m.time);
  const attEl=document.getElementById('meetingDetailAttendees');
  attEl.innerHTML=(m.attendees||[]).length
    ? `<div class="attendees-list">${(m.attendees||[]).map(a=>`<span class="attendee-chip">${escHtml(a)}</span>`).join('')}</div>` : '';
  document.getElementById('meetingDetailTags').innerHTML=(m.tags||[]).map(t=>`<span class="meta-tag">${escHtml(t)}</span>`).join('');
  renderActionItems(m);
  document.getElementById('meetingInlineEditForm').classList.add('hidden');
  document.getElementById('meetingDetailMeta').classList.remove('hidden');
  initMeetingQuill();
  quillMeeting.clipboard.dangerouslyPasteHTML(m.notes||'');
  meetingNotesDirty=false;
  document.getElementById('meetingDetailOverlay').classList.remove('hidden');
  document.body.style.overflow='hidden';
}

function closeMeetingDetail() {
  currentMeetingId=null; meetingNotesDirty=false;
  if(quillMeeting) quillMeeting.clipboard.dangerouslyPasteHTML('');
  document.getElementById('meetingDetailOverlay').classList.add('hidden');
  document.body.style.overflow='';
}

document.getElementById('meetingBackBtn').addEventListener('click', closeMeetingDetail);
document.getElementById('deleteMeetingBtn').addEventListener('click',()=>{
  if(!confirm('Delete this meeting and all its notes?')) return;
  meetings=meetings.filter(m=>m.id!==currentMeetingId);
  saveMeetings(); closeMeetingDetail(); renderAll();
});
document.getElementById('saveMeetingNotesBtn').addEventListener('click',()=>{
  const m=meetings.find(x=>x.id===currentMeetingId); if(!m||!quillMeeting) return;
  m.notes=quillMeeting.root.innerHTML==='<p><br></p>'?'':quillMeeting.root.innerHTML;
  saveMeetings(); setAutoSaveStatus('saved','meetingAutoSave');
});

// Action items
function renderActionItems(m) {
  const list=document.getElementById('actionItemsList');
  const items=m.actionItems||[];
  list.innerHTML=items.length
    ? items.map(item=>`
      <label class="action-item-row">
        <input type="checkbox" class="action-checkbox" data-aid="${item.id}" ${item.done?'checked':''}>
        <span class="action-text ${item.done?'done':''}">${escHtml(item.text)}</span>
        <button class="action-delete" data-aid="${item.id}" title="Remove">✕</button>
      </label>`).join('')
    : '<p class="action-items-empty">No action items yet.</p>';
  list.querySelectorAll('.action-checkbox').forEach(cb=>{
    cb.addEventListener('change',()=>{
      const item=(m.actionItems||[]).find(i=>i.id===cb.dataset.aid);
      if(item){item.done=cb.checked; saveMeetings(); renderActionItems(m);}
    });
  });
  list.querySelectorAll('.action-delete').forEach(btn=>{
    btn.addEventListener('click',()=>{
      m.actionItems=(m.actionItems||[]).filter(i=>i.id!==btn.dataset.aid);
      saveMeetings(); renderActionItems(m);
    });
  });
}
document.getElementById('addActionItemBtn').addEventListener('click',()=>{
  document.getElementById('addActionItemForm').classList.toggle('hidden');
  document.getElementById('actionItemInput').focus();
});
document.getElementById('cancelActionItemBtn').addEventListener('click',()=>{
  document.getElementById('addActionItemForm').classList.add('hidden');
  document.getElementById('actionItemInput').value='';
});
document.getElementById('saveActionItemBtn').addEventListener('click',()=>{
  const text=document.getElementById('actionItemInput').value.trim(); if(!text) return;
  const m=meetings.find(x=>x.id===currentMeetingId); if(!m) return;
  if(!m.actionItems) m.actionItems=[];
  m.actionItems.push({id:generateId(),text,done:false});
  saveMeetings(); renderActionItems(m);
  document.getElementById('addActionItemForm').classList.add('hidden');
  document.getElementById('actionItemInput').value='';
});
document.getElementById('actionItemInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();document.getElementById('saveActionItemBtn').click();}
});

// Meeting inline edit
document.getElementById('editMeetingInlineBtn').addEventListener('click',()=>{
  const m=meetings.find(x=>x.id===currentMeetingId); if(!m) return;
  document.getElementById('inlineMeetingTitle').value=m.title;
  document.getElementById('inlineMeetingDate').value=m.date||'';
  document.getElementById('inlineMeetingTime').value=m.time||'';
  document.getElementById('inlineMeetingAttendees').value=(m.attendees||[]).join(', ');
  document.getElementById('inlineMeetingStatus').value=m.status;
  document.getElementById('inlineMeetingTags').value=(m.tags||[]).join(', ');
  document.getElementById('meetingDetailMeta').classList.add('hidden');
  document.getElementById('meetingInlineEditForm').classList.remove('hidden');
});
document.getElementById('cancelMeetingInlineBtn').addEventListener('click',()=>{
  document.getElementById('meetingInlineEditForm').classList.add('hidden');
  document.getElementById('meetingDetailMeta').classList.remove('hidden');
});
document.getElementById('saveMeetingInlineBtn').addEventListener('click',()=>{
  const m=meetings.find(x=>x.id===currentMeetingId); if(!m) return;
  m.title=document.getElementById('inlineMeetingTitle').value.trim()||m.title;
  m.date=document.getElementById('inlineMeetingDate').value;
  m.time=document.getElementById('inlineMeetingTime').value;
  m.attendees=parseTags(document.getElementById('inlineMeetingAttendees').value);
  m.status=document.getElementById('inlineMeetingStatus').value;
  m.tags=parseTags(document.getElementById('inlineMeetingTags').value);
  saveMeetings(); renderAll(); openMeetingDetail(currentMeetingId);
  document.getElementById('meetingInlineEditForm').classList.add('hidden');
  document.getElementById('meetingDetailMeta').classList.remove('hidden');
});

// Meeting form
function openMeetingForm(id=null) {
  const m=id?meetings.find(x=>x.id===id):null;
  document.getElementById('meetingFormHeading').textContent=m?'Edit Meeting':'Add Meeting';
  document.getElementById('meetingFormId').value=m?.id||'';
  document.getElementById('meetingFormTitle').value=m?.title||'';
  document.getElementById('meetingFormDate').value=m?.date||new Date().toISOString().slice(0,10);
  document.getElementById('meetingFormTime').value=m?.time||'';
  document.getElementById('meetingFormAttendees').value=(m?.attendees||[]).join(', ');
  document.getElementById('meetingFormTags').value=(m?.tags||[]).join(', ');
  document.getElementById('meetingFormStatus').value=m?.status||'upcoming';
  document.getElementById('meetingFormOverlay').classList.remove('hidden');
  document.body.style.overflow='hidden';
  document.getElementById('meetingFormTitle').focus();
}
function closeMeetingForm() {
  document.getElementById('meetingFormOverlay').classList.add('hidden');
  document.body.style.overflow='';
  document.getElementById('meetingForm').reset();
}
document.getElementById('meetingForm').addEventListener('submit',e=>{
  e.preventDefault();
  const id=document.getElementById('meetingFormId').value;
  const title=document.getElementById('meetingFormTitle').value.trim();
  if(!title) return;
  const data={
    title,
    date:document.getElementById('meetingFormDate').value,
    time:document.getElementById('meetingFormTime').value,
    attendees:parseTags(document.getElementById('meetingFormAttendees').value),
    tags:parseTags(document.getElementById('meetingFormTags').value),
    status:document.getElementById('meetingFormStatus').value,
  };
  if(id){const idx=meetings.findIndex(m=>m.id===id);meetings[idx]={...meetings[idx],...data};}
  else meetings.unshift({id:generateId(),dateAdded:new Date().toISOString(),notes:'',actionItems:[],...data});
  saveMeetings(); closeMeetingForm(); renderAll();
});
document.getElementById('closeMeetingFormBtn').addEventListener('click',closeMeetingForm);
document.getElementById('cancelMeetingFormBtn').addEventListener('click',closeMeetingForm);
document.getElementById('meetingFormOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeMeetingForm();});

// Meeting filters
document.querySelectorAll('[data-section="meetings"][data-filter]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-section="meetings"][data-filter]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); meetingFilter=btn.dataset.filter; renderAll();
  });
});
document.getElementById('meetingSortSelect').addEventListener('change',renderMeetings);

// Meeting Google search
document.getElementById('meetingGoogleBtn').addEventListener('click',()=>{
  const q=document.getElementById('meetingGoogleInput').value.trim();
  if(q) window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`,'_blank','noopener');
});
document.getElementById('meetingGoogleInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){const q=e.target.value.trim();if(q)window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`,'_blank','noopener');}
});

// ════════════════════════════════════════════════════════════════════════════
// IDEAS SECTION
// ════════════════════════════════════════════════════════════════════════════

function updateIdeaCounts() {
  document.getElementById('countIdeasAll').textContent     = ideas.length;
  document.getElementById('countIdeasWork').textContent    = ideas.filter(i=>i.category==='work').length;
  document.getElementById('countIdeasPersonal').textContent= ideas.filter(i=>i.category==='personal').length;
  document.getElementById('countIdeasCreative').textContent= ideas.filter(i=>i.category==='creative').length;
  document.getElementById('countIdeasTech').textContent    = ideas.filter(i=>i.category==='tech').length;
}

function renderIdeaTagCloud() {
  const freq={};
  ideas.forEach(i=>(i.tags||[]).forEach(t=>{freq[t]=(freq[t]||0)+1;}));
  const cloud=document.getElementById('ideaTagCloud');
  cloud.innerHTML=Object.entries(freq).sort((a,b)=>b[1]-a[1])
    .map(([tag])=>`<button class="tag-chip${ideaActiveTag===tag?' active':''}" data-tag="${tag}">${tag}</button>`).join('');
  cloud.querySelectorAll('.tag-chip').forEach(btn=>{
    btn.addEventListener('click',()=>{ideaActiveTag=ideaActiveTag===btn.dataset.tag?null:btn.dataset.tag; renderAll();});
  });
}

function getFilteredIdeas() {
  const sort=document.getElementById('ideaSortSelect').value;
  let list=ideas.filter(i=>!i.deleted);
  if(ideaCatFilter!=='all') list=list.filter(i=>i.category===ideaCatFilter);
  if(ideaStatusFilter!=='all') list=list.filter(i=>i.status===ideaStatusFilter);
  if(ideaActiveTag) list=list.filter(i=>i.tags&&i.tags.includes(ideaActiveTag));
  if(searchQuery){
    const q=searchQuery.toLowerCase();
    list=list.filter(i=>
      i.title.toLowerCase().includes(q)||
      (i.tags||[]).some(t=>t.includes(q))||
      (i.notes||'').toLowerCase().includes(q)
    );
  }
  list.sort((a,b)=>{
    if(sort==='date-asc') return a.dateAdded.localeCompare(b.dateAdded);
    if(sort==='title-asc') return a.title.localeCompare(b.title);
    return b.dateAdded.localeCompare(a.dateAdded);
  });
  return list;
}

function renderIdeas() {
  const list=getFilteredIdeas();
  const grid=document.getElementById('ideasView');
  const empty=document.getElementById('ideasEmpty');
  if(!list.length){grid.innerHTML='';empty.classList.remove('hidden');return;}
  empty.classList.add('hidden');
  grid.innerHTML=list.map(idea=>{
    const excerpt=idea.notes?idea.notes.replace(/<[^>]+>/g,'').slice(0,80)+(idea.notes.replace(/<[^>]+>/g,'').length>80?'…':''):'';
    return `
    <article class="entry-card" data-id="${idea.id}">
      <div class="entry-card-left">
        <div class="list-cat-dot ${categoryClass(idea.category)}"></div>
      </div>
      <div class="entry-card-body">
        <div class="entry-card-title">${escHtml(idea.title)}</div>
        ${excerpt?`<div class="entry-card-excerpt">${escHtml(excerpt)}</div>`:''}
      </div>
      <div class="entry-card-meta">
        <span class="category-badge ${categoryClass(idea.category)}">${categoryLabel(idea.category)}</span>
        <span class="status-badge ${statusClass(idea.status)}">${statusLabel(idea.status)}</span>
        <span class="entry-card-date">${formatDate(idea.dateAdded)}</span>
      </div>
      ${rowActionsHtml(idea.id,'idea')}
    </article>`;
  }).join('');
  grid.querySelectorAll('.entry-card').forEach(card=>
    card.addEventListener('click', e => {
      if (e.target.closest('.row-actions')) return;
      openIdeaDetail(card.dataset.id);
    })
  );
  attachRowActions(grid);
}

// Idea detail
let quillIdea=null, ideaAutoSaveTimer=null, ideaNotesDirty=false;

function initIdeaQuill() {
  if(quillIdea) return;
  quillIdea=new Quill('#ideaQuillEditor',{
    theme:'snow', placeholder:'Develop your idea here…',
    modules:{toolbar:[[{header:[1,2,3,false]}],['bold','italic','underline','strike'],[{list:'ordered'},{list:'bullet'},{list:'check'}],['blockquote','link'],['clean']]}
  });
  quillIdea.on('text-change',()=>{
    if(!currentIdeaId) return;
    ideaNotesDirty=true; setAutoSaveStatus('pending','ideaAutoSave');
    clearTimeout(ideaAutoSaveTimer);
    ideaAutoSaveTimer=setTimeout(()=>{
      const idea=ideas.find(i=>i.id===currentIdeaId);
      if(idea&&quillIdea){
        idea.notes=quillIdea.root.innerHTML==='<p><br></p>'?'':quillIdea.root.innerHTML;
        saveIdeas(); ideaNotesDirty=false; setAutoSaveStatus('saved','ideaAutoSave');
      }
    },1500);
  });
}

function openIdeaDetail(id) {
  const idea=ideas.find(i=>i.id===id); if(!idea) return;
  currentIdeaId=id;
  const catEl=document.getElementById('ideaDetailCategory');
  catEl.textContent=categoryLabel(idea.category); catEl.className=`category-badge ${categoryClass(idea.category)}`;
  const statusEl=document.getElementById('ideaDetailStatus');
  statusEl.textContent=statusLabel(idea.status); statusEl.className=`status-badge ${statusClass(idea.status)}`;
  document.getElementById('ideaDetailTitle').textContent=idea.title;
  document.getElementById('ideaDetailDate').textContent=formatDate(idea.dateAdded);
  document.getElementById('ideaDetailTags').innerHTML=(idea.tags||[]).map(t=>`<span class="meta-tag">${escHtml(t)}</span>`).join('');
  document.getElementById('ideaInlineEditForm').classList.add('hidden');
  document.getElementById('ideaDetailMeta').classList.remove('hidden');
  initIdeaQuill();
  quillIdea.clipboard.dangerouslyPasteHTML(idea.notes||'');
  ideaNotesDirty=false;
  document.getElementById('ideaDetailOverlay').classList.remove('hidden');
  document.body.style.overflow='hidden';
}

function closeIdeaDetail() {
  currentIdeaId=null; ideaNotesDirty=false;
  if(quillIdea) quillIdea.clipboard.dangerouslyPasteHTML('');
  document.getElementById('ideaDetailOverlay').classList.add('hidden');
  document.body.style.overflow='';
}

document.getElementById('ideaBackBtn').addEventListener('click', closeIdeaDetail);
document.getElementById('deleteIdeaBtn').addEventListener('click',()=>{
  if(!confirm('Delete this idea and all its notes?')) return;
  ideas=ideas.filter(i=>i.id!==currentIdeaId);
  saveIdeas(); closeIdeaDetail(); renderAll();
});
document.getElementById('saveIdeaNotesBtn').addEventListener('click',()=>{
  const idea=ideas.find(i=>i.id===currentIdeaId); if(!idea||!quillIdea) return;
  idea.notes=quillIdea.root.innerHTML==='<p><br></p>'?'':quillIdea.root.innerHTML;
  saveIdeas(); setAutoSaveStatus('saved','ideaAutoSave');
});

// Idea inline edit
document.getElementById('editIdeaInlineBtn').addEventListener('click',()=>{
  const idea=ideas.find(i=>i.id===currentIdeaId); if(!idea) return;
  document.getElementById('inlineIdeaTitle').value=idea.title;
  document.getElementById('inlineIdeaCategory').value=idea.category;
  document.getElementById('inlineIdeaStatus').value=idea.status;
  document.getElementById('inlineIdeaTags').value=(idea.tags||[]).join(', ');
  document.getElementById('ideaDetailMeta').classList.add('hidden');
  document.getElementById('ideaInlineEditForm').classList.remove('hidden');
});
document.getElementById('cancelIdeaInlineBtn').addEventListener('click',()=>{
  document.getElementById('ideaInlineEditForm').classList.add('hidden');
  document.getElementById('ideaDetailMeta').classList.remove('hidden');
});
document.getElementById('saveIdeaInlineBtn').addEventListener('click',()=>{
  const idea=ideas.find(i=>i.id===currentIdeaId); if(!idea) return;
  idea.title=document.getElementById('inlineIdeaTitle').value.trim()||idea.title;
  idea.category=document.getElementById('inlineIdeaCategory').value;
  idea.status=document.getElementById('inlineIdeaStatus').value;
  idea.tags=parseTags(document.getElementById('inlineIdeaTags').value);
  saveIdeas(); renderAll(); openIdeaDetail(currentIdeaId);
  document.getElementById('ideaInlineEditForm').classList.add('hidden');
  document.getElementById('ideaDetailMeta').classList.remove('hidden');
});

// Idea form
function openIdeaForm(id=null) {
  const idea=id?ideas.find(i=>i.id===id):null;
  document.getElementById('ideaFormHeading').textContent=idea?'Edit Idea':'Add Idea';
  document.getElementById('ideaFormId').value=idea?.id||'';
  document.getElementById('ideaFormTitle').value=idea?.title||'';
  document.getElementById('ideaFormCategory').value=idea?.category||'work';
  document.getElementById('ideaFormStatus').value=idea?.status||'spark';
  document.getElementById('ideaFormTags').value=(idea?.tags||[]).join(', ');
  document.getElementById('ideaFormOverlay').classList.remove('hidden');
  document.body.style.overflow='hidden';
  document.getElementById('ideaFormTitle').focus();
}
function closeIdeaForm() {
  document.getElementById('ideaFormOverlay').classList.add('hidden');
  document.body.style.overflow='';
  document.getElementById('ideaForm').reset();
}
document.getElementById('ideaForm').addEventListener('submit',e=>{
  e.preventDefault();
  const id=document.getElementById('ideaFormId').value;
  const title=document.getElementById('ideaFormTitle').value.trim();
  if(!title) return;
  const data={
    title,
    category:document.getElementById('ideaFormCategory').value,
    status:document.getElementById('ideaFormStatus').value,
    tags:parseTags(document.getElementById('ideaFormTags').value),
  };
  if(id){const idx=ideas.findIndex(i=>i.id===id);ideas[idx]={...ideas[idx],...data};}
  else ideas.unshift({id:generateId(),dateAdded:new Date().toISOString(),notes:'',...data});
  saveIdeas(); closeIdeaForm(); renderAll();
});
document.getElementById('closeIdeaFormBtn').addEventListener('click',closeIdeaForm);
document.getElementById('cancelIdeaFormBtn').addEventListener('click',closeIdeaForm);
document.getElementById('ideaFormOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeIdeaForm();});

// Idea filters
document.querySelectorAll('[data-section="ideas"][data-filter-cat]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-section="ideas"][data-filter-cat]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); ideaCatFilter=btn.dataset.filterCat; renderAll();
  });
});
document.querySelectorAll('[data-section="ideas"][data-filter-status]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-section="ideas"][data-filter-status]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); ideaStatusFilter=btn.dataset.filterStatus; renderAll();
  });
});
document.getElementById('ideaSortSelect').addEventListener('change',renderIdeas);

// Idea Google search
document.getElementById('ideaGoogleBtn').addEventListener('click',()=>{
  const q=document.getElementById('ideaGoogleInput').value.trim();
  if(q) window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`,'_blank','noopener');
});
document.getElementById('ideaGoogleInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){const q=e.target.value.trim();if(q)window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`,'_blank','noopener');}
});

// ════════════════════════════════════════════════════════════════════════════
// ADD BUTTON (section-aware)
// ════════════════════════════════════════════════════════════════════════════
document.getElementById('addEntryBtn').addEventListener('click',()=>{
  if(currentSection==='library') openBookForm();
  else if(currentSection==='meetings') openMeetingForm();
  else openIdeaForm();
});
document.getElementById('emptyAddBookBtn').addEventListener('click',()=>openBookForm());
document.getElementById('emptyAddMeetingBtn').addEventListener('click',()=>openMeetingForm());
document.getElementById('emptyAddIdeaBtn').addEventListener('click',()=>openIdeaForm());

// ════════════════════════════════════════════════════════════════════════════
// SEARCH (section-aware)
// ════════════════════════════════════════════════════════════════════════════
const searchInput    = document.getElementById('searchInput');
const searchDropdown = document.getElementById('searchDropdown');
const searchResults  = document.getElementById('searchResults');

function highlight(text, query) {
  if(!query) return escHtml(text);
  const escaped=escHtml(text);
  const re=new RegExp(`(${escHtml(query).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return escaped.replace(re,'<mark>$1</mark>');
}

function renderSearchDropdown(q) {
  if(!q){searchDropdown.classList.add('hidden');return;}
  const lower=q.toLowerCase();
  let matches=[];
  if(currentSection==='library') {
    matches=books.filter(b=>
      b.title.toLowerCase().includes(lower)||b.author.toLowerCase().includes(lower)||
      (b.tags||[]).some(t=>t.includes(lower))||(b.notes||'').toLowerCase().includes(lower)
    ).slice(0,6).map(b=>({id:b.id,title:b.title,sub:b.author,section:'library'}));
  } else if(currentSection==='meetings') {
    matches=meetings.filter(m=>
      m.title.toLowerCase().includes(lower)||
      (m.attendees||[]).some(a=>a.toLowerCase().includes(lower))||
      (m.tags||[]).some(t=>t.includes(lower))||(m.notes||'').toLowerCase().includes(lower)
    ).slice(0,6).map(m=>({id:m.id,title:m.title,sub:formatDate(m.date),section:'meetings'}));
  } else {
    matches=ideas.filter(i=>
      i.title.toLowerCase().includes(lower)||
      (i.tags||[]).some(t=>t.includes(lower))||(i.notes||'').toLowerCase().includes(lower)
    ).slice(0,6).map(i=>({id:i.id,title:i.title,sub:categoryLabel(i.category),section:'ideas'}));
  }
  searchResults.innerHTML=matches.length
    ? matches.map(m=>`<button class="sr-item" data-id="${m.id}" data-section="${m.section}">
        <span class="sr-title">${highlight(m.title,q)}</span>
        <span class="sr-author">${escHtml(m.sub)}</span>
      </button>`).join('')
    : `<div class="sr-empty">No results for "<strong>${escHtml(q)}</strong>"</div>`;
  searchResults.querySelectorAll('.sr-item').forEach(btn=>{
    btn.addEventListener('click',()=>{
      searchDropdown.classList.add('hidden');
      const s=btn.dataset.section, id=btn.dataset.id;
      if(s==='library') openDetail(id);
      else if(s==='meetings') openMeetingDetail(id);
      else openIdeaDetail(id);
    });
  });
  searchDropdown.classList.remove('hidden');
}

searchInput.addEventListener('input',e=>{
  searchQuery=e.target.value.trim();
  document.getElementById('clearSearch').classList.toggle('hidden',!searchQuery);
  renderSearchDropdown(searchQuery);
  renderAll();
});
searchInput.addEventListener('focus',()=>{if(searchQuery)renderSearchDropdown(searchQuery);});
document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))searchDropdown.classList.add('hidden');});
document.getElementById('clearSearch').addEventListener('click',()=>{
  searchInput.value=''; searchQuery='';
  document.getElementById('clearSearch').classList.add('hidden');
  searchDropdown.classList.add('hidden'); renderAll();
});

// ════════════════════════════════════════════════════════════════════════════
// BOOK GOOGLE SEARCH (notes area)
// ════════════════════════════════════════════════════════════════════════════
document.getElementById('notesGoogleBtn').addEventListener('click',()=>{
  const q=document.getElementById('notesGoogleInput').value.trim();
  if(q) window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`,'_blank','noopener');
});
document.getElementById('notesGoogleInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){const q=e.target.value.trim();if(q)window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`,'_blank','noopener');}
});

// ════════════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════════════════════════════════
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(!document.getElementById('formOverlay').classList.contains('hidden')) closeBookForm();
    else if(!document.getElementById('meetingFormOverlay').classList.contains('hidden')) closeMeetingForm();
    else if(!document.getElementById('ideaFormOverlay').classList.contains('hidden')) closeIdeaForm();
    else if(!document.getElementById('detailOverlay').classList.contains('hidden')) closeDetail();
    else if(!document.getElementById('meetingDetailOverlay').classList.contains('hidden')) closeMeetingDetail();
    else if(!document.getElementById('ideaDetailOverlay').classList.contains('hidden')) closeIdeaDetail();
  }
  if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();document.getElementById('searchInput').focus();}
});

// ════════════════════════════════════════════════════════════════════════════
// MOBILE SIDEBAR
// ════════════════════════════════════════════════════════════════════════════
const sidebarEl  = document.querySelector('.sidebar');
const backdropEl = document.getElementById('sidebarBackdrop');
const sidebarBtn = document.getElementById('sidebarToggle');
function openSidebar()  { sidebarEl.classList.add('open');    backdropEl.classList.add('visible'); }
function closeSidebar() { sidebarEl.classList.remove('open'); backdropEl.classList.remove('visible'); }
sidebarBtn.addEventListener('click',()=>sidebarEl.classList.contains('open')?closeSidebar():openSidebar());
backdropEl.addEventListener('click', closeSidebar);
document.querySelectorAll('.filter-btn').forEach(btn=>
  btn.addEventListener('click',()=>{ if(window.innerWidth<=768) closeSidebar(); })
);

// ════════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════════
initQuill();
switchSection('library');
window.openBookForm = openBookForm;
