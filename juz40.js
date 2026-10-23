const API = 'https://api.juz40-edu.kz';
const KZ_OFFSET_MS = 5 * 3600 * 1000;
const DAY_MS = 86400 * 1000;
const RECENT_DAYS = 21;
const LEFT_COMMENT_RE = /шыққан|шықты|кетті|ушел|ушла/i;

const DEFAULT_SETTINGS = {
  prefix: 'АА',
  method: 'contact-then-phone',
  template:
    'Қайырлы кеш☺️ Балаңыз {оқушы} {тапсырмалар}. ' +
    'Тапсырманы бүгіннен қалдырмай орындауы қажет, әйтпесе басқа оқушылардан артта қалып, тақырыпты дұрыс түсінбей қалуы мүмкін. ' +
    'Тапсырманы бүгіннен қалдырмай орындауын қадағалап жіберсеңіз!',
  studentPrefix: '',
  studentTemplate:
    'Сәлем, {аты}! Сен {тапсырмалар}. Ертеңге дейін міндетті түрде тапсыр. ' +
    'Компания ережесі бойынша себепсіз 3 тапсырманы орындамасаң, курсты жалғастыра алмайсың. ' +
    'Барлық мүмкіндік пен материалдар берілген, соларды пайдалан 💪',
  remindTemplate:
    'Қайырлы кеш☺️ Еске саламын: балаңыз {оқушы} {тапсырмалар}. ' +
    'Тапсырманы уақытында орындауын қадағалап жіберсеңіз!',
  remindStudentTemplate:
    'Сәлем, {аты}! Еске саламын: сен {тапсырмалар}. Дедлайн өтпей тұрып тапсыруды ұмытпа 💪',
  recipients: 'parents',
  jmode: 'overdue',
};

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

const OLD_TEMPLATE = 'Сәлеметсіз бе! Балаңыз {оқушы} {тапсырмалар}. Ертеңге дейін тапсыруы қажет. Компания ережесі бойынша себепсіз 3 тапсырманы орындамаса, оқушы курсты жалғастыра алмайды. Барлық мүмкіндік пен материалдар берілген, бірақ оқушы оларды пайдаланбай жатыр.';
let settings = { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };
if (settings.template === OLD_TEMPLATE) settings.template = DEFAULT_SETTINGS.template;
let auth = store.get('auth', null);
let lessons = [];
let allLessons = [];
let rows = [];
let found = null;

function setStatus(msg) {
  $('status').textContent = msg || '';
  $('statusPill').classList.toggle('hidden', !msg);
}

const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
};

function icon(name) {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  return wrap.firstChild;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function kzDate(date) {
  return new Date(date.getTime() + KZ_OFFSET_MS).toISOString().slice(0, 10);
}

function parseDeadline(s) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
}

function daysLate(deadline) {
  return Math.round((Date.parse(kzDate(new Date())) - Date.parse(kzDate(parseDeadline(deadline)))) / DAY_MS);
}

function prettyLessonName(name) {
  const lower = name.toLocaleLowerCase('kk');
  const i = lower.search(/\p{L}/u);
  return i < 0 ? lower : lower.slice(0, i) + lower[i].toLocaleUpperCase('kk') + lower.slice(i + 1);
}

function cleanName(s) {
  return (s || '').split(/\s+/).filter((w) => w && !/\d/.test(w)).join(' ');
}

const WHO = {
  parent: { label: 'ата-ана', verb: 'тапсырмаған' },
  student: { label: 'оқушы', verb: 'тапсырмадың' },
};

function tasksPhrase(items, who = 'parent') {
  const part = (it, first) => {
    const d = it.days;
    const when = d <= 0 ? 'дедлайн бүгін өтті' : first ? `дедлайн өткеніне ${d} күн` : `${d} күн`;
    return `${prettyLessonName(it.name)} (${when})`;
  };
  const verb = WHO[who].verb;
  if (items.length === 1) return `мына тапсырманы ${verb}: ${part(items[0], true)}`;
  return `мына тапсырмаларды ${verb}: ${items.map((it, i) => part(it, i === 0)).join(', ')}`;
}

function timeLeft(deadline) {
  const mins = Math.max(0, Math.round((parseDeadline(deadline).getTime() - Date.now()) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts = [];
  if (d) parts.push(`${d} күн`);
  if (h) parts.push(`${h} сағат`);
  if (m || !parts.length) parts.push(`${m} минут`);
  return parts.join(' ');
}

function shortLeft(deadline) {
  return timeLeft(deadline).replace(' сағат', ' сағ').replace(' минут', ' мин');
}

function remindPhrase(items, who = 'parent') {
  const verb = who === 'student' ? 'әлі тапсырмадың' : 'әлі тапсырмаған';
  const part = (it) => `${prettyLessonName(it.name)} (дедлайнға ${it.left} қалды)`;
  if (items.length === 1) return `мына тапсырманы ${verb}: ${part(items[0])}`;
  return `мына тапсырмаларды ${verb}: ${items.map(part).join(', ')}`;
}

function renderMessage(r) {
  const remind = r.mode === 'remind';
  const template = remind
    ? (r.who === 'student' ? settings.remindStudentTemplate : settings.remindTemplate)
    : (r.who === 'student' ? settings.studentTemplate : settings.template);
  return template
    .replaceAll('{оқушы}', `${r.lastname} ${r.firstname}`.trim())
    .replaceAll('{аты}', r.firstname.split(' ')[0] || r.lastname)
    .replaceAll('{тапсырмалар}', remind ? remindPhrase(r.items, r.who) : tasksPhrase(r.items, r.who));
}

function recipientList() {
  return { parents: ['parent'], students: ['student'], both: ['parent', 'student'] }[settings.recipients] || ['parent'];
}

function normPhone(p) {
  let d = (p || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return d.length >= 11 ? d : '';
}

function maskPhone(p) {
  const d = (p || '').replace(/\D/g, '');
  return d.length >= 4 ? '…' + d.slice(-4) : '—';
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
  if (!r.ok) throw new Error(`JUZ40 API қатесі ${r.status}: ${path}`);
  return r.json();
}

const asArray = (x) => (Array.isArray(x) ? x : (x && (x.content || x.lessons || Object.values(x).find(Array.isArray))) || []);

async function loadGroups() {
  setStatus('Топтар жүктелуде…');
  const groups = await api('/v2/curator/groups');
  const sel = $('group');
  sel.innerHTML = '';
  for (const g of groups) sel.append(new Option(`${g.groupName} — ${g.courseName}`, g.groupId));
  const keep = store.get('group', '');
  if (groups.some((g) => String(g.groupId) === String(keep))) sel.value = keep;
  setStatus('');
  if (!groups.length) {
    $('lessons').innerHTML = '';
    $('lessons').append(el('div', 'empty', 'Бұл аккаунтта куратор топтары жоқ.'));
    return;
  }
  await loadLessons();
}

async function loadLessons() {
  const groupId = $('group').value;
  if (!groupId) return;
  store.set('group', groupId);
  setStatus('Тапсырмалар жүктелуде…');
  $('lessons').innerHTML = '';
  const data = await api(`/v3/curator/groups/${groupId}/themes`);
  const themes = [];
  for (const m of data.months || []) for (const w of m.weeks || []) for (const t of w.themes || []) themes.push(t);

  const all = [];
  const queue = [...themes];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const t = queue.shift();
        try {
          const list = asArray(await api(`/v3/curator/groups/${groupId}/themes/${t.themeId}/lessons/summary`));
          for (const l of list) {
            all.push(l);
            for (const c of l.children || []) all.push(c);
          }
        } catch (e) {
          if (e instanceof AuthError) throw e;
        }
      }
    })
  );

  allLessons = all.filter((l) => l.deadline);
  renderLessons();
  setStatus('');
}

function renderLessons() {
  const box = $('lessons');
  box.innerHTML = '';
  const showAll = $('showAll').checked;
  const remind = settings.jmode === 'remind';
  const now = Date.now();
  lessons = remind
    ? allLessons.filter((l) => parseDeadline(l.deadline).getTime() > now).sort((a, b) => parseDeadline(a.deadline) - parseDeadline(b.deadline))
    : allLessons.filter((l) => parseDeadline(l.deadline).getTime() < now).sort((a, b) => parseDeadline(b.deadline) - parseDeadline(a.deadline));
  $('showAllLabel').textContent = remind ? 'Алыстағылары' : 'Ескілері';
  $('findLabel').textContent = remind ? 'Әлі тапсырмағандарды табу' : 'Тапсырмағандарды табу';
  const visible = lessons.filter((l) => showAll || (remind ? parseDeadline(l.deadline).getTime() - now <= 7 * DAY_MS : daysLate(l.deadline) <= RECENT_DAYS));
  if (!visible.length) {
    box.append(el('div', 'empty', remind ? 'Алдағы 7 күнде дедлайны бар тапсырма жоқ.' : 'Дедлайны өткен тапсырма жоқ.'));
    return;
  }
  visible.forEach((l, i) => {
    const card = el('label', 'lesson');
    card.style.setProperty('--i', i);
    const cb = el('input');
    cb.type = 'checkbox';
    cb.value = l.id;
    const dl = new Date(parseDeadline(l.deadline).getTime() + KZ_OFFSET_MS).toISOString();
    const days = daysLate(l.deadline);
    const tick = el('span', 'tick');
    tick.append(icon('check'));
    const badges = el('div', 'badges');
    if (remind) {
      const soon = parseDeadline(l.deadline).getTime() - now < DAY_MS;
      badges.append(el('span', 'chip ' + (soon ? 'warn' : 'brand'), `қалды: ${shortLeft(l.deadline)}`));
    } else {
      badges.append(el('span', 'chip ' + (days <= 2 ? 'warn' : ''), days <= 0 ? 'бүгін' : `${days} күн бұрын`));
    }
    if (l.notSubmittedCount != null) {
      badges.append(el('span', 'chip ' + (l.notSubmittedCount ? 'fail' : 'ok'), `тапсырмаған: ${l.notSubmittedCount}`));
    }
    card.append(cb, tick, el('div', 'title', l.name), el('div', 'meta', `дедлайн ${dl.slice(8, 10)}.${dl.slice(5, 7)} ${dl.slice(11, 16)}`), badges);
    box.append(card);
  });
}

function sentKey(groupId, studentId, items) {
  return [groupId, studentId, items.map((i) => i.id).sort().join(',')].join('|');
}

async function findStudents() {
  const groupId = $('group').value;
  const selected = [...$('lessons').querySelectorAll('input:checked')].map((cb) => lessons.find((l) => String(l.id) === cb.value));
  if (!selected.length) {
    alert('Кемінде бір тапсырманы белгілеңіз.');
    return;
  }
  setStatus('Тапсырмағандар ізделуде…');
  const students = await api(`/v2/curator/groups/${groupId}/students`);
  const byId = new Map(students.map((s) => [s.id, s]));

  const map = new Map();
  for (const l of selected) {
    const progresses = asArray(await api(`/v2/curator/groups/${groupId}/lessons/${l.id}/progresses`));
    for (const p of progresses) {
      if (p.finishTime) continue;
      const comments = (p.comments || []).map((c) => c.commentText || '').join(' ');
      const entry = map.get(p.studentId) || {
        studentId: p.studentId,
        lastname: cleanName(p.studentLastname),
        firstname: cleanName(p.studentFirstname),
        left: false,
        items: [],
      };
      if (LEFT_COMMENT_RE.test(comments)) entry.left = true;
      entry.items.push({ id: l.id, name: l.name, days: daysLate(l.deadline), left: timeLeft(l.deadline), short: shortLeft(l.deadline) });
      map.set(p.studentId, entry);
    }
  }

  found = { groupId, byId, mode: settings.jmode, entries: [...map.values()].sort((a, b) => a.lastname.localeCompare(b.lastname, 'kk')) };
  buildRows();
  setStatus('');
}

function buildRows() {
  if (!found) return;
  const { groupId, byId, entries, mode } = found;
  const previous = new Map(rows.map((r) => [r.key, r]));
  rows = [];
  for (const e of entries) {
    const s = byId.get(e.studentId) || {};
    for (const who of recipientList()) {
      const key = sentKey(groupId, e.studentId, e.items) + (who === 'student' ? '|student' : '') + (mode === 'remind' ? '|remind' : '');
      const row = {
        ...e,
        who,
        key,
        mode,
        phone: normPhone(who === 'student' ? s.phoneNumber : s.parentPhoneNumber),
        checked: !e.left,
        note: e.left ? 'шыққан оқушы (пікірі бойынша)' : '',
      };
      row.message = renderMessage(row);
      const old = previous.get(key);
      if (old) Object.assign(row, { message: old.message, checked: old.checked });
      rows.push(row);
    }
  }
  renderPreview();
}

function hash(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.codePointAt(0)) | 0;
  return Math.abs(h);
}

function initials(name) {
  const w = (name || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toLocaleUpperCase('kk');
}

function avatar(name) {
  const a = el('span', 'avatar', initials(name));
  a.style.setProperty('--h', hash(name || '') % 360);
  return a;
}

function applySearch() {
  const q = ($('search').value || '').toLocaleLowerCase('kk').trim();
  rows.forEach((r, i) => {
    const tr = $('row-' + i);
    if (!tr) return;
    const hay = `${r.lastname} ${r.firstname} ${r.items.map((it) => it.name).join(' ')}`.toLocaleLowerCase('kk');
    tr.classList.toggle('filtered', !!q && !hay.includes(q));
  });
}

function bumpNum(id, value) {
  const e = $(id);
  if (e.textContent === String(value)) return;
  e.textContent = value;
  e.classList.remove('bump');
  void e.offsetWidth;
  e.classList.add('bump');
}

function renderPreview() {
  const tbody = $('preview').querySelector('tbody');
  tbody.innerHTML = '';
  $('emptyPreview').classList.toggle('hidden', rows.length > 0);
  $('preview').parentElement.classList.toggle('hidden', rows.length === 0);
  rows.forEach((r, i) => {
    const tr = el('tr', r.checked ? '' : 'off');
    tr.id = 'row-' + i;
    tr.style.setProperty('--i', Math.min(i, 20));

    const tdCb = el('td');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = r.checked;
    cb.onchange = () => {
      r.checked = cb.checked;
      tr.classList.toggle('off', !cb.checked);
      updateCount();
    };
    tdCb.append(cb);

    const tdName = el('td');
    const fullName = `${r.lastname} ${r.firstname}`;
    const who = el('div', 'who');
    const text = el('div', 'who-text');
    text.append(el('div', 'name', fullName));
    text.append(el('div', 'sub', `нөмір: ${maskPhone(r.phone)}`));
    const chips = el('div', 'chips');
    chips.append(el('span', 'chip ' + r.who, WHO[r.who].label));
    if (r.note) chips.append(el('span', 'chip warn', r.note));
    text.append(chips);
    who.append(avatar(fullName), text);
    tdName.append(who);

    const tdTasks = el('td', 'tasks');
    for (const it of r.items) tdTasks.append(el('span', 'chip ' + (r.mode === 'remind' ? 'warn' : 'brand'), r.mode === 'remind' ? `${prettyLessonName(it.name)} · ${it.short} қалды` : `${prettyLessonName(it.name)} · ${it.days} күн`));

    const tdMsg = el('td', 'msg');
    const ta = el('textarea');
    ta.value = r.message;
    ta.oninput = () => {
      r.message = ta.value;
    };
    tdMsg.append(ta);

    tr.append(tdCb, tdName, tdTasks, tdMsg);
    tr.onclick = (e) => {
      if (e.target === cb || e.target === ta) return;
      cb.checked = !cb.checked;
      cb.onchange();
    };
    tbody.append(tr);
  });
  applySearch();
  updateCount();
}

function updateCount() {
  const n = rows.filter((r) => r.checked).length;
  $('previewCount').textContent = rows.length ? `${n} / ${rows.length} белгіленген` : '';
  $('sendLabel').textContent = n ? `WhatsApp панеліне жіберу (${n})` : 'WhatsApp панеліне жіберу';
  bumpNum('heroSel', n);
  bumpNum('heroAll', rows.length);
}

function hasOpener() {
  try {
    return !!(window.opener && !window.opener.closed);
  } catch (e) {
    return false;
  }
}

function sendToPanel() {
  const items = rows
    .filter((r) => r.checked)
    .map((r) => {
      const prefix = (r.who === 'student' ? settings.studentPrefix : settings.prefix).trim();
      return {
        key: r.key,
        who: r.who,
        label: `${r.lastname} ${r.firstname}`.trim(),
        sub: r.items.map((it) => prettyLessonName(it.name)).join(', '),
        contact: settings.method === 'phone-only' ? '' : `${prefix} ${r.lastname}`.trim(),
        startsWith: r.who === 'student',
        prefer: r.firstname.split(' ')[0] || null,
        phone: settings.method === 'contact-only' ? '' : r.phone,
        method: settings.method,
        message: r.message,
      };
    });
  if (!items.length) return alert('Ешкім белгіленбеген.');
  if (!hasOpener()) {
    $('noOpener').classList.remove('hidden');
    $('noOpener').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  window.opener.postMessage({ type: 'wa-rassylka:items', items }, 'https://web.whatsapp.com');
  setStatus('WhatsApp панеліне жіберілді…');
}

window.addEventListener('message', (e) => {
  if (e.origin !== 'https://web.whatsapp.com' || !e.data || e.data.type !== 'wa-rassylka:received') return;
  setStatus(`Панель ${e.data.count} хабарламаны қабылдады ✓`);
  setTimeout(() => window.close(), 900);
});

function fillSettings() {
  $('prefix').value = settings.prefix;
  $('studentPrefix').value = settings.studentPrefix;
  $('method').value = settings.method;
  $('template').value = settings.template;
  $('studentTemplate').value = settings.studentTemplate;
  $('remindTemplate').value = settings.remindTemplate;
  $('remindStudentTemplate').value = settings.remindStudentTemplate;
  const jm = document.querySelector(`input[name="jmode"][value="${settings.jmode}"]`);
  if (jm) jm.checked = true;
  const radio = document.querySelector(`input[name="recipients"][value="${settings.recipients}"]`);
  if (radio) radio.checked = true;
}

function saveSettings() {
  settings = {
    ...settings,
    prefix: $('prefix').value.trim(),
    studentPrefix: $('studentPrefix').value.trim(),
    method: $('method').value,
    template: $('template').value.trim() || DEFAULT_SETTINGS.template,
    studentTemplate: $('studentTemplate').value.trim() || DEFAULT_SETTINGS.studentTemplate,
    remindTemplate: $('remindTemplate').value.trim() || DEFAULT_SETTINGS.remindTemplate,
    remindStudentTemplate: $('remindStudentTemplate').value.trim() || DEFAULT_SETTINGS.remindStudentTemplate,
  };
  store.set('settings', settings);
  for (const r of rows) r.message = renderMessage(r);
  renderPreview();
  setStatus('Сақталды');
  setTimeout(() => setStatus(''), 1200);
}

const guard = (fn) => async (...a) => {
  try {
    await fn(...a);
  } catch (e) {
    setStatus('');
    if (e instanceof AuthError) showLogin(true, e.message);
    else alert(e.message);
  }
};

$('loginForm').onsubmit = guard(async (e) => {
  e.preventDefault();
  const btn = $('loginBtn');
  btn.disabled = true;
  $('loginError').textContent = '';
  try {
    await signIn($('username').value.trim(), $('password').value);
    $('password').value = '';
    showLogin(false);
    await loadGroups();
  } catch (err) {
    if (err instanceof AuthError) throw err;
    $('loginError').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});
$('logout').onclick = () => {
  auth = null;
  store.set('auth', null);
  rows = [];
  found = null;
  renderPreview();
  showLogin(true);
};
$('reloadGroups').onclick = guard(loadGroups);
$('group').onchange = guard(loadLessons);
$('showAll').onchange = renderLessons;
$('findStudents').onclick = guard(findStudents);
$('selectAll').onclick = () => {
  rows.forEach((r) => (r.checked = true));
  renderPreview();
};
$('selectNone').onclick = () => {
  rows.forEach((r) => (r.checked = false));
  renderPreview();
};
$('search').oninput = applySearch;
$('send').onclick = sendToPanel;
$('saveSettings').onclick = saveSettings;
$('resetTemplate').onclick = () => {
  $('template').value = DEFAULT_SETTINGS.template;
  $('studentTemplate').value = DEFAULT_SETTINGS.studentTemplate;
  $('remindTemplate').value = DEFAULT_SETTINGS.remindTemplate;
  $('remindStudentTemplate').value = DEFAULT_SETTINGS.remindStudentTemplate;
};
document.querySelectorAll('input[name="jmode"]').forEach((radio) => {
  radio.onchange = () => {
    settings.jmode = radio.value;
    store.set('settings', settings);
    rows = [];
    found = null;
    renderPreview();
    renderLessons();
  };
});
document.querySelectorAll('input[name="recipients"]').forEach((radio) => {
  radio.onchange = () => {
    settings.recipients = radio.value;
    store.set('settings', settings);
    buildRows();
  };
});

fillSettings();
$('noOpener').classList.toggle('hidden', true);
$('openerHint').classList.toggle('hidden', hasOpener());
if (auth) {
  showLogin(false);
  guard(loadGroups)();
} else {
  showLogin(true);
}
