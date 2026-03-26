// ── NEXA Auth ── localStorage-based accounts (per-browser) ─────────────────
const USERS_KEY   = 'nexa_users';
const SESSION_KEY = 'nexa_session';

// ── Password hashing (Web Crypto SHA-256) ───────────────────────────────────
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'nexa-salt-v1');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── User store ──────────────────────────────────────────────────────────────
function getUsers() {
  return JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
}
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// ── Session ─────────────────────────────────────────────────────────────────
function setSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}
function getCurrentUser() {
  const s = sessionStorage.getItem(SESSION_KEY);
  return s ? JSON.parse(s) : null;
}
function isLoggedIn() {
  return !!getCurrentUser();
}

// ── Register ────────────────────────────────────────────────────────────────
async function register(name, email, password) {
  name  = name.trim();
  email = email.toLowerCase().trim();
  if (!name)     throw new Error('Please enter your name.');
  if (!email || !email.includes('@')) throw new Error('Please enter a valid email.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');

  const users = getUsers();
  if (users[email]) throw new Error('An account with this email already exists.');

  const hash   = await hashPassword(password);
  const userId = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  users[email] = { id: userId, name, email, hash, createdAt: Date.now() };
  saveUsers(users);
  setSession({ id: userId, name, email });
}

// ── Login ───────────────────────────────────────────────────────────────────
async function login(email, password) {
  email = email.toLowerCase().trim();
  const users = getUsers();
  const user  = users[email];
  if (!user) throw new Error('No account found with this email.');
  const hash = await hashPassword(password);
  if (hash !== user.hash) throw new Error('Incorrect password. Please try again.');
  setSession({ id: user.id, name: user.name, email: user.email });
}

// ── Logout ──────────────────────────────────────────────────────────────────
function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
}

// ── Auth guard (call on protected pages) ────────────────────────────────────
function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = 'index.html';
  }
}
