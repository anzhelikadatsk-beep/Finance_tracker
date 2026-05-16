'use strict';

// ==================== КОНСТАНТИ ====================

const CATEGORIES = [
  { id: 'grocery',       name: 'Продукти',                emoji: '🛒' },
  { id: 'alcohol',       name: 'Алкоголь та тютюн',       emoji: '🍷' },
  { id: 'restaurant',    name: 'Ресторани, кафе',         emoji: '🍽' },
  { id: 'digital',       name: 'Цифрові товари',          emoji: '💻' },
  { id: 'clothes',       name: 'Одяг та взуття',          emoji: '👗' },
  { id: 'education',     name: 'Освіта',                  emoji: '📚' },
  { id: 'entertainment', name: 'Розваги',                 emoji: '🎭' },
  { id: 'leisure',       name: 'Відпочинок',              emoji: '🏖️' },
  { id: 'pets',          name: 'Тварини',                 emoji: '🐾' },
  { id: 'services',      name: 'Послуги',                 emoji: '📦' },
  { id: 'beauty',        name: 'Краса',                   emoji: '💄' },
  { id: 'health',        name: "Здоров'я",                emoji: '💊' },
  { id: 'car',           name: 'Авто',                    emoji: '🚗' },
  { id: 'transport',     name: 'Транспорт',               emoji: '🚌' },
  { id: 'home',          name: 'Дім та побут',            emoji: '🏠' },
  { id: 'books',         name: 'Книги та канцтовари',     emoji: '📖' },
  { id: 'mobile',        name: 'Поповнення мобільного',   emoji: '📱' },
  { id: 'utilities',     name: 'Комуналка та інтернет',   emoji: '💡' },
  { id: 'rent',          name: 'Оплата оренди',           emoji: '🔑' },
  { id: 'debt',          name: 'Заборгованість/кредити',  emoji: '💳' },
  { id: 'sport',         name: 'Спорт',                   emoji: '🏋️' },
  { id: 'charity',       name: 'Благодійність',           emoji: '❤️' },
  { id: 'gifts',         name: 'Подарунки',               emoji: '🎁' },
  { id: 'other',         name: 'Інше',                    emoji: '✏️' }
];

const CATEGORY_BY_NAME = Object.fromEntries(CATEGORIES.map(c => [c.name, c]));

const PIE_COLORS = [
  '#d97757','#6b8e23','#e3a43a','#7fa9a3','#b85d40','#a3936b','#5a8a3a',
  '#cf8b6d','#7a8c5e','#d6b27a','#a07b5c','#8aa1bf','#c2a1a8','#6f7e91',
  '#d4a86a','#857a6c','#9b8a78','#bda37c','#7d8970','#b5896d','#9c9889'
];

const MONTHS_UA = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];

// ==================== СТАН ====================

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const LS = { AUTH: 'fft_auth' };

const State = {
  auth: null,
  today: null,    // get_today_summary response
  analytics: { mode: 'week', current: null, monthStr: null, view: 'me' },
  addSheet: { categoryName: null },
  listSheet: { categoryName: null },
  debts: { list: [], editingId: null, payingId: null }
};

// ==================== УТИЛІТИ ====================

function pad2(n) { return String(n).padStart(2, '0'); }
function dateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function monthStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function todayStr() { return dateStr(new Date()); }
function fmtUAH(n) { return Math.round(Number(n) || 0).toLocaleString('uk-UA').replace(/,/g, ' ') + ' грн'; }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showToast(msg, ms = 2000) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  // Перезапустити анімацію
  t.style.animation = 'none';
  void t.offsetHeight; // reflow
  t.style.animation = '';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function userName() { return State.auth?.user_name || 'друже'; }

function setScreen(name) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
  window.scrollTo(0, 0);
}

function lockButton(btn, fn) {
  return async (...args) => {
    if (btn.disabled) return;
    btn.disabled = true;
    try { return await fn(...args); }
    finally { btn.disabled = false; }
  };
}

async function api(action, payload = {}) {
  const cfg = window.APP_CONFIG || {};
  if (!cfg.API_URL || cfg.API_URL.indexOf('REPLACE_') === 0) {
    throw new Error('API_URL не налаштовано в config.js');
  }
  const body = JSON.stringify(Object.assign({ action, secret_token: cfg.SECRET_TOKEN }, payload));
  const res = await fetch(cfg.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
    redirect: 'follow'
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('Неочікувана відповідь сервера'); }
  if (data.ok === false) throw new Error(data.error || 'server_error');
  return data;
}

// ==================== AUTH ====================

function loadAuth() {
  try { State.auth = JSON.parse(localStorage.getItem(LS.AUTH) || 'null'); }
  catch (e) { State.auth = null; }
}
function saveAuth(a) { State.auth = a; localStorage.setItem(LS.AUTH, JSON.stringify(a)); }
function clearAuth() { State.auth = null; localStorage.removeItem(LS.AUTH); }

async function tryPin() {
  const pin = $('#pin-input').value.trim();
  const err = $('#pin-error');
  err.classList.add('hidden');
  if (!/^\d{4}$/.test(pin)) { err.textContent = 'PIN — 4 цифри'; err.classList.remove('hidden'); return; }
  try {
    const res = await api('verify_pin', { pin });
    if (!res.ok) throw new Error('bad_pin');
    saveAuth({ user_id: res.user_id, user_name: res.user_name, pin });
    enterApp();
  } catch (e) {
    err.textContent = 'Невірний PIN, спробуй ще раз';
    err.classList.remove('hidden');
    $('#pin-input').value = '';
    $('#pin-input').focus();
  }
}

// ==================== TODAY DATA ====================

async function refreshToday() {
  try {
    State.today = await api('get_today_summary', { user_id: State.auth.user_id });
    renderForCurrentScreen();
  } catch (e) {
    console.error('refreshToday failed', e);
  }
}

function renderForCurrentScreen() {
  const cur = document.querySelector('.screen.active')?.dataset?.screen;
  if (cur === 'menu') renderMenu();
  if (cur === 'expenses') renderCatGrid();
  if (cur === 'income') renderIncomeToday();
  if (cur === 'report') renderReport();
}

// ==================== MENU ====================

async function enterApp() {
  $('#hello').textContent = `Привіт, ${State.auth.user_name}! 👋`;
  $('#set-user').textContent = State.auth.user_name;
  setScreen('menu');
  await refreshToday();
}

function renderMenu() {
  renderBalance();
}

function renderBalance() {
  const card = $('#balance-card');
  const rows = $('#balance-rows');
  const b = State.today && State.today.balance;
  if (!b || !b.byUser) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const sign = (n) => (n >= 0 ? 'positive' : 'negative');
  const fmtSigned = (n) => (n >= 0 ? '+' : '−') + fmtUAH(Math.abs(n));
  const users = Object.keys(b.byUser);
  let html = '';
  users.forEach(name => {
    const v = b.byUser[name];
    html += `<div class="balance-row"><span>${escapeHtml(name)}</span><span class="balance-amt ${sign(v.balance)}">${fmtSigned(v.balance)}</span></div>`;
  });
  html += `<div class="balance-row total"><span>Сімейне</span><span class="balance-amt ${sign(b.family.balance)}">${fmtSigned(b.family.balance)}</span></div>`;
  rows.innerHTML = html;
}

// ==================== ВИТРАТИ ====================

function renderCatGrid() {
  const grid = $('#cat-grid');
  grid.innerHTML = '';
  const byCat = (State.today && State.today.personal && State.today.personal.expenses.by_category) || {};
  CATEGORIES.forEach(c => {
    const slot = byCat[c.name];
    const has = slot && slot.total > 0;
    const btn = document.createElement('button');
    btn.className = 'cat-tile' + (has ? ' filled' : '');
    btn.innerHTML = `
      <span class="cat-emoji">${c.emoji}</span>
      <span class="cat-name">${escapeHtml(c.name)}</span>
      ${has ? `<span class="cat-amount">${fmtUAH(slot.total)}</span>` : ''}
      ${has && slot.items.length > 1 ? `<span class="cat-count">×${slot.items.length}</span>` : ''}
    `;
    btn.addEventListener('click', () => {
      if (has) openListSheet(c.name);
      else openAddSheet(c.name);
    });
    grid.appendChild(btn);
  });
}

function openAddSheet(categoryName) {
  State.addSheet.categoryName = categoryName;
  $('#add-title').textContent = 'Нова покупка: ' + categoryName;
  $('#add-amount').value = '';
  $('#add-comment').value = '';
  const dateEl = $('#add-date');
  if (dateEl) dateEl.value = todayStr();
  $('#add-sheet').classList.remove('hidden');
  setTimeout(() => $('#add-amount').focus(), 60);
}

function closeAddSheet() {
  $('#add-sheet').classList.add('hidden');
  State.addSheet.categoryName = null;
}

async function saveAddSheet() {
  const cat = State.addSheet.categoryName;
  if (!cat) return;
  const amount = Number($('#add-amount').value);
  const comment = $('#add-comment').value.trim();
  const date = ($('#add-date') && $('#add-date').value) || todayStr();
  if (!(amount > 0)) { showToast('Сума має бути > 0'); return; }
  const btn = $('#add-save');
  btn.disabled = true;
  try {
    await api('add_expense', { user_id: State.auth.user_id, category: cat, amount, comment, date });
    closeAddSheet();
    await refreshToday();
    showToast(date === todayStr() ? `Готово, ${userName()} 💚` : `Збережено за ${date} ✓`);
  } catch (e) {
    showToast('Помилка: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

function openListSheet(categoryName) {
  State.listSheet.categoryName = categoryName;
  $('#list-title').textContent = categoryName;
  renderListSheet();
  $('#list-sheet').classList.remove('hidden');
}

function closeListSheet() {
  $('#list-sheet').classList.add('hidden');
  State.listSheet.categoryName = null;
}

function renderListSheet() {
  const cat = State.listSheet.categoryName;
  if (!cat) return;
  const slot = (State.today && State.today.personal.expenses.by_category[cat]) || { total: 0, items: [] };
  $('#list-summary').textContent = `Сьогодні: ${slot.items.length} покупок на ${fmtUAH(slot.total)}`;
  const list = $('#list-items');
  list.innerHTML = '';
  if (!slot.items.length) {
    list.innerHTML = '<p class="hint">Ще немає покупок у цій категорії.</p>';
    return;
  }
  slot.items.slice().sort((a, b) => (a.time || '').localeCompare(b.time || '')).forEach(it => {
    const row = document.createElement('div');
    row.className = 'tx-item';
    row.innerHTML = `
      <span class="tx-time">${escapeHtml(it.time || '—')}</span>
      <span class="tx-main">
        <span class="tx-cat">${fmtUAH(it.amount)}</span>
        ${it.comment ? `<span class="tx-comment">${escapeHtml(it.comment)}</span>` : ''}
      </span>
      <span></span>
      <button class="tx-del" data-tx="${escapeHtml(it.tx_id)}" title="Видалити">✕</button>
    `;
    list.appendChild(row);
  });
  list.querySelectorAll('.tx-del').forEach(b => b.addEventListener('click', () => {
    const txId = b.dataset.tx;
    if (!confirm('Видалити цю покупку?')) return;
    deleteExpenseTx(txId);
  }));
}

async function deleteExpenseTx(txId) {
  try {
    await api('delete_expense', { user_id: State.auth.user_id, tx_id: txId });
    await refreshToday();
    // Якщо в категорії більше нічого не лишилось — закриваємо лист, інакше перерендер
    const cat = State.listSheet.categoryName;
    const slot = State.today && State.today.personal.expenses.by_category[cat];
    if (!slot || !slot.items.length) closeListSheet();
    else renderListSheet();
    showToast('Видалено ✓');
  } catch (e) {
    showToast('Помилка: ' + e.message);
  }
}

async function finishDay() {
  const total = State.today && State.today.personal.expenses.total_count;
  if (!total) {
    // Жодної транзакції — еквівалент «Витрат сьогодні не було»
    await markNoExpenses();
    return;
  }
  const btn = $('#finish-day');
  btn.disabled = true;
  try {
    await api('mark_expenses_done', { user_id: State.auth.user_id });
    await refreshToday();
    setScreen('report');
    showToast(`Чудово, ${userName()}! День закрито 🎉`);
  } catch (e) {
    showToast('Помилка: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function markNoExpenses() {
  try {
    await api('no_expenses', { user_id: State.auth.user_id });
    await refreshToday();
    setScreen('menu');
    showToast('Сьогодні без витрат — добре 💚');
  } catch (e) {
    showToast('Помилка: ' + e.message);
  }
}

// ==================== ДОХІД ====================

function renderIncomeToday() {
  const wrap = $('#income-today');
  const items = (State.today && State.today.personal.income.items) || [];
  if (!items.length) { wrap.innerHTML = ''; return; }
  let html = '<h3>Сьогодні</h3>';
  items.slice().sort((a, b) => (a.time || '').localeCompare(b.time || '')).forEach(it => {
    html += `
      <div class="tx-item">
        <span class="tx-time">${escapeHtml(it.time || '—')}</span>
        <span class="tx-main">
          <span class="tx-cat">${fmtUAH(it.amount)}</span>
          ${it.comment ? `<span class="tx-comment">${escapeHtml(it.comment)}</span>` : ''}
        </span>
        <span></span>
        <button class="tx-del" data-tx="${escapeHtml(it.tx_id)}" title="Видалити">✕</button>
      </div>`;
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('.tx-del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Видалити цей запис?')) return;
    try {
      await api('delete_income', { user_id: State.auth.user_id, tx_id: b.dataset.tx });
      await refreshToday();
      showToast('Видалено');
    } catch (e) { showToast('Помилка: ' + e.message); }
  }));
}

async function saveIncome() {
  const amount = Number($('#income-amount').value);
  const comment = $('#income-comment').value.trim();
  const date = $('#income-date').value || todayStr();
  if (!(amount > 0)) { showToast('Сума має бути > 0'); return; }
  const btn = $('#income-save');
  btn.disabled = true;
  try {
    await api('save_income', { user_id: State.auth.user_id, amount, comment, date });
    $('#income-amount').value = '';
    $('#income-comment').value = '';
    await refreshToday();
    showToast(`Прийшло! +${fmtUAH(amount)} 💰`);
  } catch (e) {
    showToast('Помилка: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function markNoIncome() {
  try {
    await api('no_income', { user_id: State.auth.user_id });
    await refreshToday();
    showToast('Сьогодні без надходжень — ОК');
    setTimeout(() => setScreen('menu'), 600);
  } catch (e) {
    showToast('Помилка: ' + e.message);
  }
}

// ==================== АНАЛІТИКА ====================

async function loadAnalytics() {
  let period;
  if (State.analytics.mode === 'week') period = computeWeekPeriod();
  else period = 'month:' + (State.analytics.monthStr || monthStr(new Date()));
  try {
    const data = await api('get_analytics', { user_id: State.auth.user_id, period });
    State.analytics.lastData = data;
    setupViewSeg(data);
    renderAnalytics(data);
  } catch (e) {
    showToast('Помилка: ' + e.message);
  }
}

function ensureCurrentWeek() {
  if (!State.analytics.current) {
    const t = new Date();
    State.analytics.current = { monthStr: monthStr(t), week: Math.ceil(t.getDate() / 7) };
  }
}

function shiftWeek(delta) {
  ensureCurrentWeek();
  const cur = State.analytics.current;
  let [y, m] = cur.monthStr.split('-').map(Number);
  m -= 1; // 0-indexed
  let week = cur.week + delta;

  while (true) {
    const lastInMonth = new Date(y, m + 1, 0).getDate();
    const maxWeek = Math.ceil(lastInMonth / 7);
    if (week > maxWeek) {
      week -= maxWeek;
      m += 1;
      if (m === 12) { y += 1; m = 0; }
      continue;
    }
    if (week < 1) {
      m -= 1;
      if (m === -1) { y -= 1; m = 11; }
      const prevLast = new Date(y, m + 1, 0).getDate();
      week += Math.ceil(prevLast / 7);
      continue;
    }
    break;
  }
  State.analytics.current = { monthStr: `${y}-${pad2(m + 1)}`, week };
}

function computeWeekPeriod() {
  ensureCurrentWeek();
  const { monthStr: ms, week } = State.analytics.current;
  return `week:${ms}:${week}`;
}

function setWeekLabel() {
  ensureCurrentWeek();
  const { monthStr: ms, week } = State.analytics.current;
  let [y, m] = ms.split('-').map(Number);
  m -= 1;
  const lastInMonth = new Date(y, m + 1, 0).getDate();
  const startDay = (week - 1) * 7 + 1;
  const endDay = Math.min(week * 7, lastInMonth);
  $('#week-label').textContent = `Тиждень ${week}: ${startDay}–${endDay} ${MONTHS_UA[m]}`;
}

function setupViewSeg(data) {
  const me = State.auth.user_name;
  const names = Object.keys(data.byUser || {});
  const other = names.find(n => n !== me) || '';
  const meBtn = document.querySelector('#view-seg [data-view="me"]');
  const otherBtn = document.querySelector('#view-seg [data-view="other"]');
  const famBtn = document.querySelector('#view-seg [data-view="family"]');
  if (meBtn) meBtn.textContent = me || 'Я';
  if (otherBtn) {
    otherBtn.textContent = other || '—';
    otherBtn.disabled = !other;
    otherBtn.style.opacity = other ? '' : '0.4';
  }
  // sync active state
  document.querySelectorAll('#view-seg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.view === State.analytics.view));
}

function pickViewBucket(data) {
  const view = State.analytics.view || 'me';
  if (view === 'family') return data.family;
  const me = State.auth.user_name;
  if (view === 'me') return (data.byUser && data.byUser[me]) || data.personal;
  // 'other'
  const otherName = Object.keys(data.byUser || {}).find(n => n !== me);
  return (data.byUser && otherName && data.byUser[otherName]) || { total: 0, byCategory: {}, byWeek: {}, byDay: {}, income: 0, balance: 0 };
}

function renderAnalytics(data) {
  const bucket = pickViewBucket(data);
  $('#t-expenses').textContent = fmtUAH(bucket.total || 0);
  $('#t-income').textContent = fmtUAH(bucket.income || 0);
  $('#t-balance').textContent = fmtUAH(bucket.balance || 0);

  renderPie(bucket.byCategory || {}, bucket.total || 0);
  renderCatList(bucket.byCategory || {}, bucket.total || 0);

  if (State.analytics.mode === 'month') {
    $('#weeks-bar-wrap').classList.remove('hidden');
    renderWeeksBar(bucket.byWeek || {});
  } else {
    $('#weeks-bar-wrap').classList.add('hidden');
  }

  renderDaysList(bucket.byDay || {});
}

function renderDaysList(byDay) {
  const wrap = $('#days-list');
  wrap.innerHTML = '';
  const dates = Object.keys(byDay).sort((a, b) => b.localeCompare(a)); // нові згори
  if (!dates.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">📊</span>
        <div class="empty-title">Тут поки що порожньо</div>
        <div class="empty-subtitle">Накопичуємо історію — повернись після кількох транзакцій</div>
      </div>`;
    return;
  }
  const max = Math.max(1, ...dates.map(d => byDay[d].total));
  const dayNames = ['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];
  const months = ['січ','лют','бер','кві','тра','чер','лип','сер','вер','жов','лис','гру'];

  dates.forEach(d => {
    const slot = byDay[d];
    const date = new Date(d + 'T00:00:00');
    const label = `${date.getDate()} ${months[date.getMonth()]} (${dayNames[date.getDay()]})`;
    const pct = Math.round((slot.total / max) * 100);

    const row = document.createElement('div');
    row.className = 'day-row';
    row.innerHTML = `
      <span class="day-label">${label}</span>
      <span class="day-bar"><span class="day-bar-fill" style="width:${pct}%"></span></span>
      <span class="day-amt">${fmtUAH(slot.total)}</span>
    `;
    const items = document.createElement('div');
    items.className = 'day-items hidden';
    items.innerHTML = renderDayItems(slot.items);

    row.addEventListener('click', () => {
      items.classList.toggle('hidden');
    });
    wrap.appendChild(row);
    wrap.appendChild(items);
  });
}

function renderDayItems(items) {
  if (!items || !items.length) return '<p class="hint" style="margin:6px 0;">Немає покупок</p>';
  return items.slice().sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(it => {
    const c = CATEGORY_BY_NAME[it.category];
    const cm = it.comment ? `<span class="tx-comment">${escapeHtml(it.comment)}</span>` : '';
    return `
      <div class="tx-item">
        <span class="tx-time">${escapeHtml(it.time || '—')}</span>
        <span class="tx-main">
          <span class="tx-cat">${c ? c.emoji : '•'} ${escapeHtml(it.category)}</span>
          ${cm}
        </span>
        <span class="tx-amt">${fmtUAH(it.amount)}</span>
        <span></span>
      </div>`;
  }).join('');
}

function renderPie(byCat, total) {
  const wrap = $('#pie-wrap');
  wrap.innerHTML = '';
  if (!total) {
    wrap.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">🍃</span>
        <div class="empty-title">За цей період ще нічого</div>
        <div class="empty-subtitle">Як з'являться витрати — побудується графік</div>
      </div>`;
    return;
  }
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const cx = 130, cy = 130, r = 100;
  let acc = 0;
  const svg = ['<svg class="pie-svg" viewBox="0 0 260 260" xmlns="http://www.w3.org/2000/svg">'];
  entries.forEach(([cat, val], i) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += val;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    const color = PIE_COLORS[i % PIE_COLORS.length];
    if (entries.length === 1) {
      svg.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`);
    } else {
      svg.push(`<path d="M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z" fill="${color}"/>`);
    }
  });
  svg.push('</svg>');
  wrap.innerHTML = svg.join('');
}

function renderCatList(byCat, total) {
  const list = $('#cat-list');
  list.innerHTML = '';
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return;
  entries.forEach(([cat, val], i) => {
    const c = CATEGORY_BY_NAME[cat];
    const pct = total ? Math.round(val * 1000 / total) / 10 : 0;
    const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>`;
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `${dot}<span>${c ? c.emoji : '•'} ${escapeHtml(cat)}</span><span class="amt">${fmtUAH(val)}</span><span class="pct">${pct}%</span>`;
    list.appendChild(row);
  });
}

function renderWeeksBar(byWeek) {
  const wrap = $('#weeks-bar');
  wrap.innerHTML = '';
  const max = Math.max(1, ...Object.values(byWeek));
  for (let w = 1; w <= 5; w++) {
    const v = Number(byWeek[w] || 0);
    const h = Math.round((v / max) * 110) + 4;
    const bar = document.createElement('div');
    bar.className = 'week-bar';
    bar.style.height = h + 'px';
    bar.innerHTML = `<span class="week-amt">${v ? fmtUAH(v).replace(' грн', '') : ''}</span><span class="week-label">тжд ${w}</span>`;
    wrap.appendChild(bar);
  }
}

function fillMonthSelect() {
  const sel = $('#month-select');
  const today = new Date();
  const months = [];
  for (let i = -11; i <= 0; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    months.push(monthStr(d));
  }
  months.reverse();
  sel.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('');
  sel.value = State.analytics.monthStr || monthStr(today);
  State.analytics.monthStr = sel.value;
}

// ==================== ПРОМІЖНИЙ ЗВІТ ====================

function renderReport() {
  const t = State.today;
  if (!t) return;
  const d = new Date(t.date + 'T00:00:00');
  $('#report-date').textContent = `${d.getDate()} ${MONTHS_UA[d.getMonth()]} ${d.getFullYear()}`;

  $('#rp-exp').textContent = fmtUAH(t.personal.expenses.total);
  $('#rp-inc').textContent = fmtUAH(t.personal.income.total);
  $('#rp-cnt').textContent = String(t.personal.expenses.total_count);

  const items = [];
  Object.entries(t.personal.expenses.by_category).forEach(([cat, slot]) => {
    slot.items.forEach(it => items.push(Object.assign({ category: cat, type: 'exp' }, it)));
  });
  t.personal.income.items.forEach(it => items.push(Object.assign({ type: 'inc' }, it)));
  items.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const list = $('#rp-tx-list');
  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">💚</span>
        <div class="empty-title">Сьогодні поки чисто</div>
        <div class="empty-subtitle">Додай першу транзакцію — і тут з'явиться твоя історія</div>
      </div>`;
  } else {
    list.innerHTML = items.map(it => {
      const isIncome = it.type === 'inc';
      const cat = isIncome ? '💰 Дохід' : ((CATEGORY_BY_NAME[it.category]?.emoji || '•') + ' ' + it.category);
      return `
        <div class="tx-item">
          <span class="tx-time">${escapeHtml(it.time || '—')}</span>
          <span class="tx-main">
            <span class="tx-cat">${escapeHtml(cat)}</span>
            ${it.comment ? `<span class="tx-comment">${escapeHtml(it.comment)}</span>` : ''}
          </span>
          <span class="tx-amt" style="${isIncome ? 'color:var(--success)' : ''}">${fmtUAH(it.amount)}</span>
          <span></span>
        </div>`;
    }).join('');
  }

  $('#rf-exp').textContent = fmtUAH(t.family.expenses.total);
  $('#rf-inc').textContent = fmtUAH(t.family.income.total);
  $('#rf-bal').textContent = fmtUAH(t.family.income.total - t.family.expenses.total);
}

// ==================== БОРГИ І КРЕДИТИ ====================

const DEBT_TYPES = {
  credit_card: 'Кредитка',
  installment: 'Частинами',
  loan: 'Кредит'
};

async function loadDebts() {
  try {
    const res = await api('get_debts', { user_id: State.auth.user_id });
    State.debts.list = res.debts || [];
    renderDebtsScreen();
  } catch (e) {
    showToast('Помилка: ' + e.message);
  }
}

function getOtherUsers() {
  const balance = State.today && State.today.balance && State.today.balance.byUser;
  return balance ? Object.keys(balance) : [];
}

function renderDebtsScreen() {
  const list = $('#debts-list');
  list.innerHTML = '';
  const active = State.debts.list.filter(d => d.is_active === true || d.is_active === 'TRUE' || d.is_active === 1);
  const closed = State.debts.list.filter(d => !(d.is_active === true || d.is_active === 'TRUE' || d.is_active === 1));

  if (!active.length && !closed.length) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">💚</span>
        <div class="empty-title">Жодних боргів — чудово!</div>
        <div class="empty-subtitle">Якщо з'явиться кредит чи покупка частинами — додай через кнопку нижче</div>
      </div>`;
  } else {
    active.forEach(d => list.appendChild(renderDebtCard(d, false)));
    if (closed.length) {
      const h = document.createElement('h3');
      h.style.cssText = 'margin: 22px 0 6px; font-size: 0.92rem; color: var(--text-muted); text-transform: uppercase;';
      h.textContent = 'Закриті';
      list.appendChild(h);
      closed.forEach(d => list.appendChild(renderDebtCard(d, true)));
    }
  }

  // Зведення (тоталі залишків по власниках)
  const totals = {};
  let famTotal = 0;
  active.forEach(d => {
    const remaining = Math.max(0, (Number(d.total_amount) || 0) - (Number(d.paid_amount) || 0));
    totals[d.owner] = (totals[d.owner] || 0) + remaining;
    famTotal += remaining;
  });
  const totalsCard = $('#debts-totals');
  const totalsRows = $('#debts-totals-rows');
  if (Object.keys(totals).length === 0) {
    totalsCard.classList.add('hidden');
  } else {
    totalsCard.classList.remove('hidden');
    let html = '';
    Object.keys(totals).forEach(name => {
      html += `<div class="balance-row"><span>${escapeHtml(name)}</span><span class="balance-amt negative">−${fmtUAH(totals[name])}</span></div>`;
    });
    html += `<div class="balance-row total"><span>Загалом сім'я</span><span class="balance-amt negative">−${fmtUAH(famTotal)}</span></div>`;
    totalsRows.innerHTML = html;
  }
}

function renderDebtCard(d, isClosed) {
  const card = document.createElement('div');
  card.className = 'debt-card' + (isClosed ? ' inactive' : '');
  const total = Number(d.total_amount) || 0;
  const paid = Number(d.paid_amount) || 0;
  const remaining = Math.max(0, total - paid);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const monthly = Number(d.monthly_payment) || 0;
  const typeLabel = DEBT_TYPES[d.type] || d.type;
  const dayStr = d.payment_day ? `${d.payment_day} число` : '—';

  card.innerHTML = `
    <div class="debt-header">
      <span class="debt-name">${escapeHtml(d.name)} <span class="debt-type-badge">${typeLabel}</span></span>
      <span class="debt-owner">${escapeHtml(d.owner)}</span>
    </div>
    <div class="debt-progress">
      <div class="debt-bar"><div class="debt-bar-fill" style="width:${pct}%"></div></div>
      <div class="debt-stat">
        Сплачено <b>${fmtUAH(paid)}</b> з ${fmtUAH(total)} (${pct}%) ·
        Залишок: <span class="debt-remaining">${fmtUAH(remaining)}</span>
      </div>
    </div>
    <div class="debt-meta">
      ${monthly ? `Місячний платіж: ${fmtUAH(monthly)} ·` : ''} День платежу: ${dayStr}
      ${d.notes ? `<br>📝 ${escapeHtml(d.notes)}` : ''}
    </div>
    ${isClosed ? '' : `
      <div class="debt-actions">
        <button class="btn btn-primary" data-pay="${escapeHtml(d.id)}">💳 Сплатити</button>
        <button class="btn btn-ghost" data-edit="${escapeHtml(d.id)}">✏️ Деталі</button>
      </div>`}
  `;
  card.querySelector('[data-pay]')?.addEventListener('click', () => openDebtPaySheet(d));
  card.querySelector('[data-edit]')?.addEventListener('click', () => openDebtFormSheet(d));
  return card;
}

function openDebtFormSheet(debt) {
  State.debts.editingId = debt ? debt.id : null;
  $('#debt-form-title').textContent = debt ? 'Редагувати кредит' : 'Новий кредит';
  $('#debt-form-id').value = debt ? debt.id : '';
  $('#debt-form-name').value = debt ? debt.name : '';
  $('#debt-form-type').value = debt ? debt.type : 'credit_card';
  // Owner dropdown
  const ownerSel = $('#debt-form-owner');
  ownerSel.innerHTML = getOtherUsers().concat([State.auth.user_name])
    .filter((v, i, a) => a.indexOf(v) === i)
    .map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  ownerSel.value = debt ? debt.owner : State.auth.user_name;

  $('#debt-form-total').value = debt ? debt.total_amount : '';
  $('#debt-form-paid').value = debt ? debt.paid_amount : 0;
  $('#debt-form-monthly').value = debt && debt.monthly_payment ? debt.monthly_payment : '';
  $('#debt-form-payday').value = debt && debt.payment_day ? debt.payment_day : '';
  $('#debt-form-end').value = debt && debt.end_date ? String(debt.end_date).slice(0, 10) : '';
  $('#debt-form-notes').value = debt ? debt.notes : '';

  $('#debt-form-close-btn').classList.toggle('hidden', !debt);
  $('#debt-form-sheet').classList.remove('hidden');
}

function closeDebtFormSheet() {
  $('#debt-form-sheet').classList.add('hidden');
  State.debts.editingId = null;
}

async function saveDebtForm() {
  const data = {
    name: $('#debt-form-name').value.trim(),
    type: $('#debt-form-type').value,
    owner: $('#debt-form-owner').value,
    total_amount: Number($('#debt-form-total').value) || 0,
    paid_amount: Number($('#debt-form-paid').value) || 0,
    monthly_payment: Number($('#debt-form-monthly').value) || 0,
    payment_day: Number($('#debt-form-payday').value) || 0,
    end_date: $('#debt-form-end').value || '',
    notes: $('#debt-form-notes').value.trim()
  };
  if (!data.name) { showToast('Введи назву'); return; }
  if (!data.total_amount && data.type === 'installment') { showToast('Вкажи загальну суму'); return; }

  const btn = $('#debt-form-save');
  btn.disabled = true;
  try {
    if (State.debts.editingId) {
      await api('update_debt', Object.assign({ user_id: State.auth.user_id, debt_id: State.debts.editingId }, data));
      showToast('Збережено ✓');
    } else {
      await api('add_debt', Object.assign({ user_id: State.auth.user_id }, data));
      showToast('Додано борг 💳');
    }
    closeDebtFormSheet();
    await loadDebts();
  } catch (e) {
    showToast('Помилка: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function closeDebt() {
  const id = State.debts.editingId;
  if (!id) return;
  if (!confirm('Закрити цей борг? (помітимо як виплачений)')) return;
  try {
    await api('close_debt', { user_id: State.auth.user_id, debt_id: id });
    closeDebtFormSheet();
    await loadDebts();
    showToast('Борг закрито 🎉');
  } catch (e) {
    showToast('Помилка: ' + e.message);
  }
}

function openDebtPaySheet(debt) {
  State.debts.payingId = debt.id;
  $('#debt-pay-title').textContent = `Сплата: ${debt.name}`;
  const total = Number(debt.total_amount) || 0;
  const paid = Number(debt.paid_amount) || 0;
  const remaining = Math.max(0, total - paid);
  $('#debt-pay-info').textContent = `Власник: ${debt.owner} · Залишок боргу: ${fmtUAH(remaining)}`;
  $('#debt-pay-amount').value = debt.monthly_payment || remaining || '';
  $('#debt-pay-comment').value = '';
  // Payer dropdown
  const payerSel = $('#debt-pay-payer');
  const names = Array.from(new Set([State.auth.user_name].concat(getOtherUsers())));
  payerSel.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  payerSel.value = State.auth.user_name;
  $('#debt-pay-sheet').classList.remove('hidden');
}

function closeDebtPaySheet() {
  $('#debt-pay-sheet').classList.add('hidden');
  State.debts.payingId = null;
}

async function saveDebtPayment() {
  const id = State.debts.payingId;
  if (!id) return;
  const amount = Number($('#debt-pay-amount').value);
  const payer = $('#debt-pay-payer').value;
  const comment = $('#debt-pay-comment').value.trim();
  if (!(amount > 0)) { showToast('Сума має бути > 0'); return; }

  // Якщо платник ≠ власник боргу — попереджаємо що буде створено переказ
  const debt = State.debts.list.find(d => d.id === id);
  if (debt && payer !== debt.owner) {
    const isCreditCard = debt.type === 'credit_card';
    const extra = isCreditCard ? '' : ` + витрата ${debt.owner} в "Заборгованість/кредити"`;
    if (!confirm(`Сплатити від імені ${payer}? Це створить переказ ${payer} → ${debt.owner}${extra}.`)) return;
  }

  const btn = $('#debt-pay-save');
  btn.disabled = true;
  try {
    await api('pay_debt', { user_id: State.auth.user_id, debt_id: id, amount, comment, payer_name: payer });
    closeDebtPaySheet();
    await loadDebts();
    await refreshToday();
    showToast(`Сплачено ${fmtUAH(amount)} 💳`);
  } catch (e) {
    showToast('Помилка: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

// ==================== ПЕРЕКАЗ ====================

function fillTransferRecipients() {
  const sel = $('#transfer-to');
  const me = State.auth?.user_name;
  const names = (State.today && State.today.balance && State.today.balance.byUser)
    ? Object.keys(State.today.balance.byUser) : [];
  const others = names.filter(n => n !== me);
  if (!others.length) {
    sel.innerHTML = '<option value="">Немає інших користувачів</option>';
  } else {
    sel.innerHTML = others.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  }
}

async function saveTransfer() {
  const to = $('#transfer-to').value;
  const amount = Number($('#transfer-amount').value);
  const comment = $('#transfer-comment').value.trim();
  if (!to) { showToast('Обери отримувача'); return; }
  if (!(amount > 0)) { showToast('Сума має бути > 0'); return; }
  const btn = $('#transfer-save');
  btn.disabled = true;
  try {
    await api('transfer', { user_id: State.auth.user_id, to_user_name: to, amount, comment });
    await refreshToday();
    showToast(`Перекинуто ${fmtUAH(amount)} → ${to} 🔄`);
    setTimeout(() => navigate('menu'), 700);
  } catch (e) {
    showToast('Помилка: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function sendReportToTelegram() {
  const btn = $('#report-tg');
  btn.disabled = true;
  try {
    await api('send_today_to_telegram', { user_id: State.auth.user_id });
    showToast('Полетіло в Telegram 📨');
  } catch (e) {
    showToast('Помилка: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

// ==================== РОУТЕР ====================

function navigate(to) {
  if (to === 'expenses') {
    setScreen('expenses');
    renderCatGrid();
  } else if (to === 'income') {
    $('#income-date').value = todayStr();
    $('#income-amount').value = '';
    $('#income-comment').value = '';
    setScreen('income');
    renderIncomeToday();
  } else if (to === 'analytics') {
    fillMonthSelect();
    State.analytics.current = null;
    ensureCurrentWeek();
    setScreen('analytics');
    setWeekLabel();
    loadAnalytics();
  } else if (to === 'report') {
    setScreen('report');
    renderReport();
    refreshToday();
  } else if (to === 'transfer') {
    fillTransferRecipients();
    $('#transfer-amount').value = '';
    $('#transfer-comment').value = '';
    setScreen('transfer');
  } else if (to === 'debts') {
    setScreen('debts');
    loadDebts();
  } else if (to === 'menu') {
    setScreen('menu');
    refreshToday();
  } else if (to === 'settings') {
    setScreen('settings');
  } else {
    setScreen(to);
  }
}

// ==================== ІНІЦІАЛІЗАЦІЯ ====================

function bindEvents() {
  $('#pin-submit').addEventListener('click', tryPin);
  $('#pin-input').addEventListener('keydown', e => { if (e.key === 'Enter') tryPin(); });

  $$('[data-go]').forEach(el => el.addEventListener('click', () => {
    if (el.classList.contains('disabled')) return;
    navigate(el.dataset.go);
  }));
  $$('[data-back]').forEach(el => el.addEventListener('click', () => navigate('menu')));
  $('#settings-btn').addEventListener('click', () => navigate('settings'));

  $('#no-expenses-bottom').addEventListener('click', markNoExpenses);
  $('#finish-day').addEventListener('click', finishDay);

  $('#income-save').addEventListener('click', saveIncome);
  $('#no-income-btn').addEventListener('click', markNoIncome);

  // Add sheet
  $('#add-save').addEventListener('click', saveAddSheet);
  $('#add-amount').addEventListener('keydown', e => { if (e.key === 'Enter') saveAddSheet(); });
  $('#add-comment').addEventListener('keydown', e => { if (e.key === 'Enter') saveAddSheet(); });

  // List sheet
  $('#list-add-more').addEventListener('click', () => {
    const cat = State.listSheet.categoryName;
    closeListSheet();
    openAddSheet(cat);
  });

  // Generic sheet close
  $$('[data-sheet-close]').forEach(el => el.addEventListener('click', () => {
    closeAddSheet(); closeListSheet(); closeDebtFormSheet(); closeDebtPaySheet();
  }));

  // Аналітика
  $$('.seg-btn').forEach(b => b.addEventListener('click', () => {
    $$('.seg-btn').forEach(x => x.classList.toggle('active', x === b));
    State.analytics.mode = b.dataset.period;
    $('#week-controls').classList.toggle('hidden', State.analytics.mode !== 'week');
    $('#month-controls').classList.toggle('hidden', State.analytics.mode !== 'month');
    if (State.analytics.mode === 'week') setWeekLabel();
    loadAnalytics();
  }));
  $('#week-prev').addEventListener('click', () => { shiftWeek(-1); setWeekLabel(); loadAnalytics(); });
  $('#week-next').addEventListener('click', () => { shiftWeek(+1); setWeekLabel(); loadAnalytics(); });

  document.querySelectorAll('#view-seg .seg-btn').forEach(b => b.addEventListener('click', () => {
    if (b.disabled) return;
    State.analytics.view = b.dataset.view;
    document.querySelectorAll('#view-seg .seg-btn').forEach(x => x.classList.toggle('active', x === b));
    if (State.analytics.lastData) renderAnalytics(State.analytics.lastData);
  }));
  $('#month-select').addEventListener('change', e => { State.analytics.monthStr = e.target.value; loadAnalytics(); });

  // Проміжний звіт
  $('#report-tg').addEventListener('click', sendReportToTelegram);

  // Переказ
  $('#transfer-save').addEventListener('click', saveTransfer);

  // Борги
  $('#debts-add-btn').addEventListener('click', () => openDebtFormSheet(null));
  $('#debt-form-save').addEventListener('click', saveDebtForm);
  $('#debt-form-close-btn').addEventListener('click', closeDebt);
  $('#debt-pay-save').addEventListener('click', saveDebtPayment);

  // Logout
  $('#logout-btn').addEventListener('click', () => {
    clearAuth();
    $('#pin-input').value = '';
    setScreen('pin');
    setTimeout(() => $('#pin-input').focus(), 50);
  });
}

function init() {
  bindEvents();
  loadAuth();
  if (State.auth && State.auth.user_id) {
    enterApp();
  } else {
    setScreen('pin');
    setTimeout(() => $('#pin-input').focus(), 80);
  }
}

document.addEventListener('DOMContentLoaded', init);
