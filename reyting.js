const API = 'https://api.juz40-edu.kz';
const $ = (id) => document.getElementById(id);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('juz40:' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem('juz40:' + key);
      else localStorage.setItem('juz40:' + key, JSON.stringify(value));
    } catch (e) {}
  },
};

let auth = store.get('auth', null);
let weeks = [];
let lessons = [];
let progresses = {};
let result = null;
let excluded = null;
let reasons = {};
let loadToken = 0;

const TEXT_FIELDS = { tOffer: '-', tProblem: '-', tSolution: '-', tAchieve: '', tReason: '', tCurator: '' };

function setStatus(msg) {
  $('status').textContent = msg || '';
  $('statusPill').classList.toggle('hidden', !msg);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function showLogin(show, message) {
  $('loginView').classList.toggle('hidden', !show);
  $('appView').classList.toggle('hidden', show);
  $('logout').classList.toggle('hidden', show);
  $('loginError').textContent = message || '';
}

async function signIn(username, password) {
  const r = await fetch(API + '/v1/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, fcmToken: '' }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.token) {
    const msg = (data.messages && data.messages[0]) || data.message || `Кіру сәтсіз (${r.status})`;
    throw new Error(msg);
  }
  auth = { token: data.token, refreshToken: data.refreshToken, role: (data.roles || [])[0] || '' };
  store.set('auth', auth);
}

async function refresh() {
  if (!auth || !auth.refreshToken) return false;
  const r = await fetch(API + '/v1/auth/refreshtoken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: auth.refreshToken }),
  });
  if (!r.ok) return false;
  const data = await r.json().catch(() => ({}));
  if (!data.token) return false;
  auth = { ...auth, token: data.token, refreshToken: data.refreshToken || auth.refreshToken };
  store.set('auth', auth);
  return true;
}

class AuthError extends Error {}

async function api(path) {
  if (!auth) throw new AuthError('Кіру керек');
  const call = () => fetch(API + path, { headers: { Authorization: 'Bearer ' + auth.token } });
  let r = await call();
  if ((r.status === 401 || r.status === 403) && (await refresh())) r = await call();
  if (r.status === 401 || r.status === 403) {
    auth = null;
    store.set('auth', null);
    throw new AuthError('JUZ40 сессиясының мерзімі өтті — қайта кіріңіз.');
  }
  if (!r.ok) throw new Error(`JUZ40 API қатесі ${r.status}`);
  return r.json();
}

const asArray = (x) => (Array.isArray(x) ? x : (x && (x.content || x.lessons || Object.values(x).find(Array.isArray))) || []);

async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

async function loadGroups() {
  setStatus('Топтар жүктелуде…');
  const groups = await api('/v2/curator/groups');
  const sel = $('group');
  sel.innerHTML = '';
  for (const g of groups) sel.append(new Option(`${g.groupName} — ${g.courseName}`, g.groupId));
  const keep = store.get('group', '');
  if (groups.some((g) => String(g.groupId) === String(keep))) sel.value = keep;
  setStatus('');
  if (groups.length) await loadWeeks();
}

async function loadWeeks() {
  const groupId = $('group').value;
  if (!groupId) return;
  store.set('group', groupId);
  setStatus('Апталар жүктелуде…');
  const data = await api(`/v3/curator/groups/${groupId}/themes`);
  weeks = [];
  for (const m of data.months || []) {
    for (const w of m.weeks || []) {
      const themes = (w.themes || []).filter((t) => !/FOUNDATION|ПРОФОРИЕНТАЦИЯ/i.test(t.themeName || ''));
      if (!themes.length) continue;
      const start = Math.min(...themes.map((t) => Date.parse(t.startTime || '') || Infinity));
      weeks.push({ key: `${m.month}-${w.week}`, label: `${m.month}-ай ${w.week}-апта`, themes, start });
    }
  }
  const sel = $('week');
  sel.innerHTML = '';
  for (const w of weeks) sel.append(new Option(w.label, w.key));
  const now = Date.now();
  const started = weeks.filter((w) => w.start <= now);
  const pick = started.length >= 2 ? started[started.length - 2] : started[started.length - 1] || weeks[0];
  if (pick) sel.value = pick.key;
  setStatus('');
  await loadWeek();
}

async function loadWeek() {
  const groupId = $('group').value;
  const week = weeks.find((w) => w.key === $('week').value);
  if (!groupId || !week) return;
  const token = ++loadToken;
  setStatus('Сабақтар жүктелуде…');
  const list = [];
  await pool(week.themes, 4, async (t) => {
    const items = asArray(await api(`/v3/curator/groups/${groupId}/themes/${t.themeId}/lessons/summary`));
    const walk = (l) => {
      if (l.lessonType !== 'LECTURE') list.push({ ...l, themeName: l.themeName || t.themeName, themeOrder: week.themes.indexOf(t) });
      (l.children || []).forEach(walk);
    };
    items.forEach(walk);
  });
  if (token !== loadToken) return;
  list.sort((a, b) => RT.kindRank(RT.kindOf(a)) - RT.kindRank(RT.kindOf(b)) || a.themeOrder - b.themeOrder);
  lessons = list;
  progresses = {};
  setStatus('Бағалар жүктелуде…');
  let done = 0;
  await pool(lessons, 4, async (l) => {
    progresses[l.id] = asArray(await api(`/v2/curator/groups/${groupId}/lessons/${l.id}/progresses`));
    setStatus(`Бағалар жүктелуде… ${++done}/${lessons.length}`);
  });
  if (token !== loadToken) return;
  excluded = null;
  reasons = {};
  renderLessons();
  recompute();
  setStatus('');
}

function renderLessons() {
  const box = $('lessons');
  box.innerHTML = '';
  if (!lessons.length) {
    box.append(el('div', 'empty', 'Бұл аптада сабақ жоқ.'));
    return;
  }
  const off = new Set(store.get('offKinds', []));
  lessons.forEach((l, i) => {
    const card = el('label', 'lesson');
    card.style.setProperty('--i', i);
    const cb = el('input');
    cb.type = 'checkbox';
    cb.value = l.id;
    const kind = RT.kindOf(l);
    cb.checked = kind !== 'other' && !off.has(kind);
    cb.addEventListener('change', () => {
      const kinds = new Set(store.get('offKinds', []));
      if (cb.checked) kinds.delete(kind);
      else if (kind !== 'other') kinds.add(kind);
      store.set('offKinds', [...kinds]);
      recompute();
    });
    const tick = el('span', 'tick');
    tick.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
    card.append(cb, tick, el('div', 'title', l.name), el('div', 'meta', `${l.submittedCount ?? '?'} тапсырды · макс ${l.maxScore ?? '?'}`));
    box.append(card);
  });
}

function chosenLessons() {
  const on = new Set([...$('lessons').querySelectorAll('input:checked')].map((c) => c.value));
  return lessons.filter((l) => on.has(String(l.id)));
}

function recompute() {
  const chosen = chosenLessons();
  if (!chosen.length) {
    result = null;
    render();
    return;
  }
  result = RT.build({ lessons: chosen, progresses, excluded });
  excluded = result.excluded;
  render();
}

function renderExcluded() {
  const box = $('excluded');
  box.innerHTML = '';
  if (!result) return;
  const sorted = [...result.all].sort((a, b) => (excluded.has(b.id) - excluded.has(a.id)) || a.name.localeCompare(b.name, 'kk'));
  for (const s of sorted) {
    const row = el('label', 'ex-item');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = excluded.has(s.id);
    cb.addEventListener('change', () => {
      if (cb.checked) excluded.add(s.id);
      else excluded.delete(s.id);
      recompute();
    });
    row.append(cb, el('span', null, s.name + (s.leftHint ? ' · «шыққан»' : '')));
    box.append(row);
  }
}

function cell(tr, v, cls) {
  const td = el('td', cls, v);
  tr.append(td);
  return td;
}

function renderGeneral() {
  const g = result.general;
  const t = $('generalTable');
  t.innerHTML = '';
  const head = el('tr');
  g.headers.forEach((h) => cell(head, h, 'h'));
  t.append(head);
  for (const r of g.rows) {
    const tr = el('tr');
    r.cells.forEach((c, i) => cell(tr, c, i === 0 ? 'h' : r.league + (i === 1 ? ' nm' : '')));
    t.append(tr);
  }
  const foot = el('tr');
  g.footer.forEach((c) => cell(foot, c, 'h'));
  t.append(foot);
  const s = $('generalSummary');
  s.innerHTML = '';
  s.append(
    el('span', 'chip gold', `Алтын ${g.counts.gold} · ${g.thresholds.gold}+`),
    el('span', 'chip silver', `Күміс ${g.counts.silver} · ${g.thresholds.silver}–${g.thresholds.gold - 1}`),
    el('span', 'chip bronze', `Қола ${g.counts.bronze} · 0–${g.thresholds.silver - 1}`),
    el('span', 'chip brand', `Максимум ${g.maxTotal}`)
  );
}

function renderSt() {
  const st = result.st;
  const t = $('stTable');
  t.innerHTML = '';
  const s = $('stSummary');
  s.innerHTML = '';
  if (!st) {
    t.innerHTML = '<tr><td>Бұл аптада «САБАҚ ТАПСЫРУ» жоқ немесе белгіленбеген.</td></tr>';
    return;
  }
  const head = el('tr');
  ['№', 'ОҚУШЫНЫҢ АТЫ-ЖӨНІ', 'НӘТИЖЕ'].forEach((h) => cell(head, h, 'h'));
  t.append(head);
  st.rows.forEach((r, i) => {
    const tr = el('tr');
    cell(tr, i + 1, 'h');
    cell(tr, r.name, r.league + ' nm');
    cell(tr, r.score, r.league);
    t.append(tr);
  });
  const avg = el('tr');
  ['', 'ОРТАҚ БАЛЛ', st.avg.toFixed(1).replace('.', ',')].forEach((c) => cell(avg, c, 'h'));
  t.append(avg);
  if (st.missing.length) {
    t.append(el('tr'));
    const mh = el('tr');
    ['№', 'ТАПСЫРМАҒАН ОҚУШЫ', 'СЕБЕБІ'].forEach((h) => cell(mh, h, 'h'));
    t.append(mh);
    st.missing.forEach((m, i) => {
      const tr = el('tr');
      cell(tr, i + 1, 'h');
      cell(tr, m.name, 'white nm');
      const td = cell(tr, '', 'white');
      const inp = el('input');
      inp.placeholder = 'себебі…';
      inp.value = reasons[m.name] || '';
      inp.addEventListener('input', () => (reasons[m.name] = inp.value));
      td.append(inp);
      t.append(tr);
    });
  }
  s.append(
    el('span', 'chip gold', `Алтын ${st.counts.gold} · ${st.thresholds.gold}+`),
    el('span', 'chip silver', `Күміс ${st.counts.silver} · ${st.thresholds.silver}–${st.thresholds.gold - 1}`),
    el('span', 'chip bronze', `Қола ${st.counts.bronze} · 0–${st.thresholds.silver - 1}`),
    el('span', 'chip ' + (st.missing.length ? 'fail' : 'ok'), `Тапсырмаған ${st.missing.length}`)
  );
}

function reportExtra() {
  return Object.keys(TEXT_FIELDS).map((id) => $(id).value.trim() || TEXT_FIELDS[id]);
}

function renderReport() {
  const t = $('reportTable');
  t.innerHTML = '';
  const rep = result.report;
  const labels = [...rep.labels, 'ҰСЫНЫС', 'ПРОБЛЕМА', 'ШЕШІМ', 'ЖЕТІСТІК', 'СЕБЕПТЕРІ', 'КУРАТОР'];
  const values = [...rep.cells, ...reportExtra()];
  const head = el('tr');
  labels.forEach((h) => cell(head, h, 'h'));
  const row = el('tr');
  values.forEach((v) => cell(row, v.length > 24 ? v.slice(0, 22) + '…' : v));
  t.append(head, row);
}

function render() {
  const has = !!result && result.general.rows.length > 0;
  $('emptyState').classList.toggle('hidden', has);
  document.querySelectorAll('.rt-pane').forEach((p) => p.classList.toggle('hidden', !has));
  $('heroStudents').textContent = has ? result.general.rows.length : 0;
  $('heroAvg').textContent = has ? result.general.footer[result.general.footer.length - 1] : '—';
  renderExcluded();
  const warn = $('pendingWarn');
  if (has && result.pending.length) {
    const byLesson = {};
    for (const p of result.pending) byLesson[p.lesson] = (byLesson[p.lesson] || 0) + 1;
    warn.innerHTML = '<b>Тексерілмеген жұмыстар бар:</b> ' + Object.entries(byLesson).map(([l, n]) => `${l} — ${n}`).join(', ') + '. Олар 0 болып есептеледі — алдымен платформада бағалап, бетті жаңартыңыз.';
    warn.classList.remove('hidden');
  } else warn.classList.add('hidden');
  if (!has) return;
  renderGeneral();
  renderSt();
  renderReport();
}

async function copyRich({ html, text }, btn) {
  const msg = btn.parentElement.querySelector('.ok-msg');
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
    } else {
      const host = $('clipHost');
      host.innerHTML = html;
      const range = document.createRange();
      range.selectNodeContents(host);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
      sel.removeAllRanges();
      host.innerHTML = '';
    }
    msg.textContent = 'Көшірілді ✓ Енді кестеге Cmd+V / Ctrl+V';
  } catch (e) {
    msg.textContent = 'Көшіру сәтсіз: ' + e.message;
  }
  setTimeout(() => (msg.textContent = ''), 6000);
}

function bind() {
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginBtn').disabled = true;
    try {
      await signIn($('username').value.trim(), $('password').value);
      $('password').value = '';
      showLogin(false);
      await loadGroups();
    } catch (err) {
      $('loginError').textContent = err.message;
    } finally {
      $('loginBtn').disabled = false;
    }
  });
  $('logout').addEventListener('click', () => {
    auth = null;
    store.set('auth', null);
    showLogin(true);
  });
  $('group').addEventListener('change', () => guard(loadWeeks));
  $('reloadGroups').addEventListener('click', () => guard(loadGroups));
  $('week').addEventListener('change', () => guard(loadWeek));
  document.querySelectorAll('.rt-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.rt-tabs button').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('.rt-pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === b.dataset.tab));
    })
  );
  $('copyGeneral').addEventListener('click', (e) => result && copyRich(RT.generalClip(result.general), e.currentTarget));
  $('copySt').addEventListener('click', (e) => {
    if (!result || !result.st) return;
    const st = { ...result.st, missing: result.st.missing.map((m) => ({ ...m, reason: reasons[m.name] || '' })) };
    copyRich(RT.stClip(st), e.currentTarget);
  });
  $('copyReport').addEventListener('click', (e) => result && copyRich(RT.reportClip(result.report, reportExtra()), e.currentTarget));
  const saved = store.get('reportTexts', {});
  for (const id of Object.keys(TEXT_FIELDS)) {
    $(id).value = saved[id] != null ? saved[id] : TEXT_FIELDS[id];
    $(id).addEventListener('input', () => {
      const all = store.get('reportTexts', {});
      all[id] = $(id).value;
      store.set('reportTexts', all);
      if (result) renderReport();
    });
  }
}

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbznysCb7ku-pQKPlR8UvySGD4byUdkQU6cKIt4vqYfVjrz97_T53Om9Jl49T1y-sFCA/exec';

async function gs(payload) {
  if (!SCRIPT_URL) throw new Error('Google Sheets байланысы әлі бапталмаған.');
  const r = await fetch(SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  const data = await r.json().catch(() => ({ ok: false, error: `Жауап оқылмады (${r.status})` }));
  if (!data.ok) throw new Error(data.error || 'Қате');
  return data.result;
}

const GS = {
  general: { url: 'gsGeneralUrl', tab: 'gsGeneralTab' },
  st: { url: 'gsStUrl', tab: 'gsStTab' },
  report: { url: 'gsReportUrl', tab: 'gsReportTab' },
};

function normTab(s) {
  return (s || '').toLocaleUpperCase('kk').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function guessTab(kind, tabs) {
  const saved = store.get('gsTab:' + kind, '');
  if (tabs.includes(saved)) return saved;
  if (kind === 'report') {
    const week = weeks.find((w) => w.key === $('week').value);
    if (week) {
      const [m, w] = week.key.split('-');
      const hit = tabs.find((t) => normTab(t) === `${m} АЙ ${w} АПТА`);
      if (hit) return hit;
    }
    return tabs[0] || '';
  }
  const first = normTab(($('gsName').value || '').split(/\s+/)[1] || '').slice(0, 4);
  return (first && tabs.find((t) => normTab(t).startsWith(first))) || '';
}

async function loadTabs(kind) {
  const { url, tab } = GS[kind];
  const sel = $(tab);
  const link = $(url).value.trim();
  store.set('gsUrl:' + kind, link);
  sel.innerHTML = '';
  sel.classList.add('hidden');
  if (!link) return;
  try {
    const res = await gs({ action: 'tabs', url: link });
    sel.append(new Option('— бетті таңдаңыз —', ''));
    for (const t of res.tabs) sel.append(new Option(t, t));
    sel.value = guessTab(kind, res.tabs);
    sel.classList.remove('hidden');
    if (kind === 'report') await loadNames();
  } catch (e) {
    $('gsResult').innerHTML = `<span class="bad">${e.message}</span>`;
  }
}

async function loadNames() {
  const link = $(GS.report.url).value.trim();
  const tab = $(GS.report.tab).value;
  const list = $('gsNames');
  list.innerHTML = '';
  if (!link || !tab) return;
  try {
    for (const n of await gs({ action: 'names', url: link, tab })) list.append(new Option(n));
  } catch (e) {}
}

async function writeSheets() {
  const out = $('gsResult');
  if (!result) {
    out.innerHTML = '<span class="bad">Алдымен аптаны таңдаңыз.</span>';
    return;
  }
  const req = { action: 'write' };
  const gUrl = $(GS.general.url).value.trim();
  const sUrl = $(GS.st.url).value.trim();
  const rUrl = $(GS.report.url).value.trim();
  if (gUrl) {
    if (!$(GS.general.tab).value) return void (out.innerHTML = '<span class="bad">ЖАЛПЫ РЕЙТИНГ: өз тобыңыздың бетін таңдаңыз.</span>');
    req.general = { url: gUrl, tab: $(GS.general.tab).value, ...RT.generalTable(result.general) };
  }
  if (sUrl && result.st) {
    if (!$(GS.st.tab).value) return void (out.innerHTML = '<span class="bad">СТ РЕЙТИНГ: өз тобыңыздың бетін таңдаңыз.</span>');
    const st = { ...result.st, missing: result.st.missing.map((m) => ({ ...m, reason: reasons[m.name] || '' })) };
    req.st = { url: sUrl, tab: $(GS.st.tab).value, ...RT.stTable(st) };
  }
  if (rUrl) {
    if (!$(GS.report.tab).value) return void (out.innerHTML = '<span class="bad">ОТЧЕТ: аптаның бетін таңдаңыз.</span>');
    if (!$('gsName').value.trim()) return void (out.innerHTML = '<span class="bad">Куратордың аты-жөнін жазыңыз.</span>');
    req.report = { url: rUrl, tab: $(GS.report.tab).value, name: $('gsName').value.trim(), values: [...result.report.cells, ...reportExtra()] };
  }
  if (!req.general && !req.st && !req.report) return void (out.innerHTML = '<span class="bad">Кемінде бір сілтеме қойыңыз.</span>');
  for (const kind of Object.keys(GS)) if ($(GS[kind].tab).value) store.set('gsTab:' + kind, $(GS[kind].tab).value);
  $('gsWrite').disabled = true;
  out.textContent = 'Жазылуда…';
  try {
    const done = await gs(req);
    const parts = [];
    if (done.includes('general')) parts.push(`<a href="${gUrl}" target="_blank" rel="noopener">жалпы рейтинг</a>`);
    if (done.includes('st')) parts.push(`<a href="${sUrl}" target="_blank" rel="noopener">СТ рейтинг</a>`);
    const rep = done.find((d) => d.startsWith('report:'));
    if (rep) parts.push(`<a href="${rUrl}" target="_blank" rel="noopener">отчет (${rep.split(':')[1]}-жол)</a>`);
    out.innerHTML = `<span class="ok">Жазылды ✓</span> ${parts.join(', ')}`;
  } catch (e) {
    out.innerHTML = `<span class="bad">${e.message}</span>`;
  } finally {
    $('gsWrite').disabled = false;
  }
}

function bindSheets() {
  $('gsName').value = store.get('gsName', '');
  $('gsName').addEventListener('input', () => store.set('gsName', $('gsName').value));
  for (const kind of Object.keys(GS)) {
    const inp = $(GS[kind].url);
    inp.value = store.get('gsUrl:' + kind, '');
    inp.addEventListener('change', () => loadTabs(kind));
    $(GS[kind].tab).addEventListener('change', () => kind === 'report' && loadNames());
    if (inp.value) loadTabs(kind);
  }
  $('gsWrite').addEventListener('click', writeSheets);
}

async function guard(fn) {
  try {
    await fn();
  } catch (e) {
    setStatus('');
    if (e instanceof AuthError) showLogin(true, e.message);
    else alert(e.message);
  }
}

bind();
bindSheets();
render();
if (auth) {
  showLogin(false);
  guard(loadGroups);
} else {
  showLogin(true);
}
