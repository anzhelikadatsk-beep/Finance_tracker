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
  analytics: { mode: 'week', weekOffset: 0, monthStr: null },
  addSheet: { categoryName: null },
  listSheet: { categoryName: null }
};

// ==================== УТИЛІТИ ====================

function pad2(n) { return String(n).padStart(2, '0'); }
function dateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function monthStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function todayStr() { return dateStr(new Date()); }
function fmtUAH(n) { return Math.round(Number(n) || 0).toLocaleString('uk-UA').replace(/,/g, ' ') + ' грн'; }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showToast(msg, ms = 1800) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

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
  const t = State.today || {};
  const tile = $('#no-expenses-tile');
  const closed = t.expenses_submitted || t.no_expenses;
  if (closed) {
    tile.classList.add('disabled');
    tile.setAttribute('aria-disabled', 'true');
    tile.querySelector('.tile-emoji').textContent = '✓';
    tile.querySelector('.tile-label').textContent = 'Звіт дня закрито';
  } else {
    tile.classList.remove('disabled');
    tile.removeAttribute('aria-disabled');
    tile.querySelector('.tile-emoji').textContent = '✅';
    tile.querySelector('.tile-label').textContent = 'Витрат сьогодні не було';
  }
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
    showToast(date === todayStr() ? 'Додано' : `Збережено за ${date}`);
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
    showToast('Видалено');
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
    showToast('Звіт дня закрито');
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
    showToast('Записано: витрат не було');
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
    showToast('Дохід збережено');
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
    showToast('Записано: надходжень не було');
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
    renderAnalytics(data);
  } catch (e) {
    showToast('Помилка: ' + e.message);
  }
}

function computeWeekPeriod() {
  const today = new Date();
  const offset = State.analytics.weekOffset || 0;
  const baseWeek = Math.ceil(today.getDate() / 7);
  const refDate = new Date(today.getFullYear(), today.getMonth(), 1 + (baseWeek - 1) * 7 + offset * 7);
  return `week:${monthStr(refDate)}:${Math.ceil(refDate.getDate() / 7)}`;
}

function setWeekLabel() {
  const today = new Date();
  const offset = State.analytics.weekOffset || 0;
  const baseWeek = Math.ceil(today.getDate() / 7);
  const refDate = new Date(today.getFullYear(), today.getMonth(), 1 + (baseWeek - 1) * 7 + offset * 7);
  const month = refDate.getMonth();
  const week = Math.ceil(refDate.getDate() / 7);
  const startDay = (week - 1) * 7 + 1;
  const lastDay = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
  const endDay = Math.min(week * 7, lastDay);
  $('#week-label').textContent = `Тиждень ${week}: ${startDay}–${endDay} ${MONTHS_UA[month]}`;
}

function renderAnalytics(data) {
  const personal = data.personal || { total: 0, byCategory: {}, byWeek: {}, income: 0, balance: 0 };
  $('#t-expenses').textContent = fmtUAH(personal.total);
  $('#t-income').textContent = fmtUAH(personal.income);
  $('#t-balance').textContent = fmtUAH(personal.balance);

  renderPie(personal.byCategory, personal.total);
  renderCatList(personal.byCategory, personal.total);

  if (State.analytics.mode === 'month') {
    $('#weeks-bar-wrap').classList.remove('hidden');
    renderWeeksBar(personal.byWeek);
  } else {
    $('#weeks-bar-wrap').classList.add('hidden');
  }
}

function renderPie(byCat, total) {
  const wrap = $('#pie-wrap');
  wrap.innerHTML = '';
  if (!total) {
    wrap.innerHTML = '<p style="text-align:center; color: var(--text-muted);">Даних немає</p>';
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
    list.innerHTML = '<p class="hint" style="margin-top:8px;">Сьогодні ще нічого не вносили.</p>';
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

async function sendReportToTelegram() {
  const btn = $('#report-tg');
  btn.disabled = true;
  try {
    await api('send_today_to_telegram', { user_id: State.auth.user_id });
    showToast('Надіслано в Telegram ✓');
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
    State.analytics.weekOffset = 0;
    setScreen('analytics');
    setWeekLabel();
    loadAnalytics();
  } else if (to === 'report') {
    setScreen('report');
    renderReport();
    refreshToday();
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

  $('#no-expenses-tile').addEventListener('click', () => {
    if ($('#no-expenses-tile').classList.contains('disabled')) return;
    markNoExpenses();
  });
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
    closeAddSheet(); closeListSheet();
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
  $('#week-prev').addEventListener('click', () => { State.analytics.weekOffset--; setWeekLabel(); loadAnalytics(); });
  $('#week-next').addEventListener('click', () => { State.analytics.weekOffset++; setWeekLabel(); loadAnalytics(); });
  $('#month-select').addEventListener('change', e => { State.analytics.monthStr = e.target.value; loadAnalytics(); });

  // Проміжний звіт
  $('#report-tg').addEventListener('click', sendReportToTelegram);

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
