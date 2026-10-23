(() => {
  const SITE = '__SITE__';
  const HOST_ID = 'wa-rassylka-host';

  if (location.hostname !== 'web.whatsapp.com') {
    if (confirm('Бұл батырма WhatsApp Web ішінде жұмыс істейді. WhatsApp Web ашылсын ба?')) window.open('https://web.whatsapp.com/', '_blank');
    return;
  }
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.__toggle && existing.__toggle();
    return;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').toLocaleUpperCase('kk').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const compact = (s) => (s || '').toLocaleUpperCase('kk').replace(/[^\p{L}\p{N}]+/gu, '');

  async function waOpenContact(query, mustInclude, prefer, startsWith = false) {
    const wanted = mustInclude.map(norm);
    const fits = (t) => (startsWith ? norm(t).startsWith(wanted[0]) : wanted.every((w) => norm(t).includes(w)));
    if (!(await waSearch(query))) return { ok: false, reason: 'WhatsApp іздеу жолы табылмады' };
    let matches = [];
    for (let i = 0; i < 10 && !matches.length; i++) {
      await sleep(600);
      const seen = new Set();
      matches = [...document.querySelectorAll('#pane-side span[title]')].filter((el) => {
        const t = el.getAttribute('title');
        if (seen.has(t)) return false;
        seen.add(t);
        return fits(t);
      });
    }
    if (!matches.length) return { ok: false, reason: 'контакт табылмады' };
    const pick = (prefer && matches.find((el) => norm(el.getAttribute('title')).includes(norm(prefer)))) || matches[0];
    if (matches.length > 1 && !(prefer && norm(pick.getAttribute('title')).includes(norm(prefer)))) {
      return { ok: false, reason: 'бірнеше контакт сәйкес келді: ' + matches.map((m) => m.getAttribute('title')).join(' / ') };
    }
    clickRow(pick.closest('[role="listitem"], [role="row"], [role="gridcell"]') || pick);
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      const header = document.querySelector('#main header');
      const compose = document.querySelector('#main footer [contenteditable="true"]');
      if (header && compose && fits(header.innerText)) return { ok: true, title: pick.getAttribute('title') };
    }
    return { ok: false, reason: 'чат ашылмады немесе басқа чат ашылды' };
  }

  async function waSearch(query) {
    const side = document.querySelector('#side') || document;
    const box = side.querySelector('input[type="text"], [contenteditable="true"][role="textbox"], [contenteditable="true"]');
    if (!box) return false;
    box.focus();
    if (box.tagName === 'INPUT') {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(box, query);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, query);
    }
    return true;
  }

  async function waClearSearch() {
    const side = document.querySelector('#side');
    const box = side && side.querySelector('input[type="text"], [contenteditable="true"][role="textbox"], [contenteditable="true"]');
    if (!box) return;
    const value = box.tagName === 'INPUT' ? box.value : box.innerText.trim();
    if (!value) return;
    await waSearch('');
    await sleep(400);
  }

  async function waOpenByPhone(digits) {
    const header0 = (document.querySelector('#main header')?.innerText || '').split('\n')[0];
    if (!(await waSearch('+' + digits))) return { ok: false, reason: 'WhatsApp іздеу жолы табылмады' };
    let row = null;
    for (let i = 0; i < 12 && !row; i++) {
      await sleep(500);
      row = [...document.querySelectorAll('#pane-side [role="row"], #pane-side [role="listitem"]')].find((r) => r.querySelector('span[title]'));
    }
    if (!row) return { ok: false, reason: 'нөмір бойынша контакт табылмады' };
    const title = row.querySelector('span[title]').getAttribute('title');
    clickRow(row.querySelector('span[title]').closest('[role="gridcell"]') || row);
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      const header = (document.querySelector('#main header')?.innerText || '').split('\n')[0];
      const compose = document.querySelector('#main footer [contenteditable="true"]');
      if (compose && header && (norm(header).includes(norm(title)) || header !== header0)) return { ok: true, title: header.trim() };
    }
    return { ok: false, reason: 'нөмір бойынша чат ашылмады' };
  }

  function clickRow(target) {
    for (const type of ['mousedown', 'mouseup', 'click']) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }

  async function waSendInOpenChat(text, expectHeader, startsWith = false) {
    const headerOk = () => {
      const h = document.querySelector('#main header');
      if (!expectHeader) return true;
      return !!h && (startsWith ? norm(h.innerText).startsWith(norm(expectHeader)) : norm(h.innerText).includes(norm(expectHeader)));
    };
    const getCompose = () => document.querySelector('#main footer [contenteditable="true"]');
    const clear = (el) => {
      el.focus();
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
    };
    if (!headerOk()) return { ok: false, reason: 'ашық чат басқа адамдікі, жіберілмеді' };
    await sleep(250);
    let compose = getCompose();
    if (!compose || !headerOk()) return { ok: false, reason: 'хабарлама жолы табылмады' };
    compose.focus();
    await sleep(60);
    if (!compose.contains(document.activeElement)) return { ok: false, reason: 'хабарлама жолына кіру мүмкін болмады' };
    for (let i = 0; i < 3 && compose.innerText.trim(); i++) {
      clear(compose);
      await sleep(80);
    }
    if (compose.innerText.trim()) return { ok: false, reason: 'чатта бұрыннан жазылған мәтін тұр, жіберілмеді' };
    document.execCommand('insertText', false, text);
    await sleep(120);
    compose = getCompose();
    if (!compose || compact(compose.innerText) !== compact(text)) {
      if (compose) clear(compose);
      return { ok: false, reason: 'мәтін дұрыс жазылмады, жіберілмеді' };
    }
    if (!headerOk()) {
      clear(compose);
      return { ok: false, reason: 'чат ауысып кетті, жіберілмеді' };
    }
    const rowsBefore = document.querySelectorAll('#main [role="row"]').length;
    const sendIcon = document.querySelector('#main footer [data-icon="send"], #main footer [data-icon="wds-ic-send-filled"], #main footer button[aria-label="Отправить"], #main footer button[aria-label="Send"], #main footer button[aria-label="Жіберу"]');
    if (sendIcon) (sendIcon.closest('button') || sendIcon).click();
    else compose.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    const head = compact(text).slice(0, 30);
    for (let i = 0; i < 80; i++) {
      await sleep(75);
      const rows = document.querySelectorAll('#main [role="row"]');
      const last = rows[rows.length - 1];
      if (!getCompose()?.innerText.trim() && last && compact(last.innerText).includes(head) && rows.length >= rowsBefore) return { ok: true };
    }
    return { ok: false, reason: 'жіберілгені расталмады — чатты тексеріңіз' };
  }


  const nameOf = (b) => [...b.querySelectorAll('span')].filter((s) => !s.children.length).map((s) => s.textContent.trim()).find(Boolean);

  async function waGetLists() {
    await waClearSearch();
    const all = document.getElementById('all-filter');
    if (all && all.getAttribute('aria-selected') !== 'true') {
      all.click();
      await sleep(800);
    }
    const out = [];
    document.querySelectorAll('[aria-label="chat-list-filters"] button[id^="label_item"]').forEach((b) => {
      if (!b.querySelector('[style*="background-color"]')) return;
      const name = nameOf(b);
      if (name && !out.includes(name)) out.push(name);
    });
    return out;
  }

  async function waSelectList(name, force = false) {
    const selected = () => {
      const s = document.querySelector('[aria-label="chat-list-filters"] [aria-selected="true"]');
      return s && nameOf(s) === name;
    };
    await waClearSearch();
    if (selected() && !force) return { ok: true };
    const rowCount = () => document.querySelector('#pane-side [role="grid"]')?.getAttribute('aria-rowcount');
    const all = document.getElementById('all-filter');
    if (all && all.getAttribute('aria-selected') !== 'true') {
      all.click();
      for (let i = 0; i < 10 && all.getAttribute('aria-selected') !== 'true'; i++) await sleep(200);
      await sleep(500);
    }
    const allCount = rowCount();
    const chip = [...document.querySelectorAll('[aria-label="chat-list-filters"] button[role="tab"]')].find((b) => nameOf(b) === name);
    if (chip) {
      chip.click();
    } else {
      const more = document.getElementById('additional-filters');
      if (!more) return { ok: false, reason: 'тізімдер мәзірі табылмады' };
      more.click();
      let item;
      for (let i = 0; i < 10 && !item; i++) {
        await sleep(300);
        item = [...document.querySelectorAll('[role="menuitemcheckbox"]')].find((b) => nameOf(b) === name);
      }
      if (!item) return { ok: false, reason: `«${name}» тізімі табылмады` };
      item.click();
    }
    for (let i = 0; i < 15 && !selected(); i++) await sleep(300);
    if (!selected()) return { ok: false, reason: `«${name}» тізімі ашылмады` };
    if (force) {
      for (let i = 0; i < 20 && rowCount() === allCount; i++) await sleep(200);
      await sleep(500);
    }
    return { ok: true };
  }

  async function waListMembers(name) {
    const pane = document.querySelector('#pane-side');
    if (!pane) return [];
    const found = new Map();
    pane.scrollTop = 0;
    await sleep(600);
    for (let i = 0; i < 200; i++) {
      pane.querySelectorAll('[role="row"]').forEach((row) => {
        const t = row.querySelector('span[title][dir="auto"]');
        if (!t) return;
        const title = t.getAttribute('title').trim();
        if (!found.has(title)) {
          const labels = [...row.querySelectorAll('span[title]')].map((e) => e.getAttribute('title').trim());
          found.set(title, { title, labeled: labels.includes(name) });
        }
      });
      const before = pane.scrollTop;
      pane.scrollTop += pane.clientHeight * 0.7;
      await sleep(450);
      if (pane.scrollTop === before) break;
    }
    pane.scrollTop = 0;
    const list = [...found.values()];
    const labeled = list.filter((m) => m.labeled);
    return labeled.length ? labeled : list;
  }

  async function waOpenFromList(title) {
    const pane = document.querySelector('#pane-side');
    if (!pane) return { ok: false, reason: 'чаттар тізімі табылмады' };
    const findRow = () => [...pane.querySelectorAll('[role="row"]')].find((r) => {
      const t = r.querySelector('span[title][dir="auto"]');
      return t && t.getAttribute('title').trim() === title;
    });
    let row = findRow();
    for (const wait of [150, 450]) {
      if (row) break;
      pane.scrollTop = 1;
      pane.scrollTop = 0;
      pane.dispatchEvent(new Event('scroll'));
      await sleep(wait + 150);
      for (let i = 0; i < 200; i++) {
        row = findRow();
        if (row) break;
        const before = pane.scrollTop;
        pane.scrollTop += pane.clientHeight * 0.7;
        await sleep(wait);
        if (pane.scrollTop === before) {
          row = findRow();
          break;
        }
      }
    }
    if (!row) return { ok: false, reason: 'тізімнен чат табылмады' };
    row.scrollIntoView({ block: 'nearest' });
    await sleep(30);
    const titleEl = row.querySelector('span[title][dir="auto"]');
    clickRow((titleEl && titleEl.closest('[role="gridcell"]')) || row);
    for (let i = 0; i < 80; i++) {
      await sleep(75);
      const header = document.querySelector('#main header');
      const compose = document.querySelector('#main footer [contenteditable="true"]');
      if (header && norm(header.innerText).includes(norm(title))) {
        return compose ? { ok: true } : { ok: false, reason: 'бұл чатқа жазу мүмкін емес' };
      }
    }
    return { ok: false, reason: 'чат ашылмады' };
  }

  const DEFAULT_TEMPLATE = 'Қайырлы кеш☺️ Балаңыз {аты} мына тапсырманы тапсырмаған: №7 Конспект (дедлайн өткеніне 1 күн). Тапсырманы бүгіннен қалдырмай орындауы қажет, әйтпесе басқа оқушылардан артта қалып, тақырыпты дұрыс түсінбей қалуы мүмкін. Тапсырманы бүгіннен қалдырмай орындауын қадағалап жіберсеңіз!';
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('wa-rassylka:' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('wa-rassylka:' + key, JSON.stringify(value));
      } catch (e) {}
    },
  };
  let rows = [];
  let mode = store.get('mode', 'wa') === 'juz' ? 'juz' : 'wa';
  let membersList = '';
  let running = false;
  let stopRequested = false;

  function kzDate(d) {
    return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function hash(s) {
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.codePointAt(0)) | 0;
    return Math.abs(h);
  }
  function titleCase(s) {
    return s.toLocaleLowerCase('kk').replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('kk'));
  }
  function nameFromTitle(title) {
    let s = title.split('|')[0].replace(/[^\p{L}\p{N}\s-]+/gu, ' ').trim();
    s = s.replace(/^(\p{Lu}{1,2}\s+)(?=\p{L}+\s+\p{L})/u, '');
    s = s.replace(/\s+/g, ' ').trim();
    if (s && s === s.toLocaleUpperCase('kk')) s = titleCase(s);
    return s;
  }
  function render(template, p) {
    let s = template.replace(/\{([^{}|]*\|[^{}]*)\}/g, (_, opts) => {
      const list = opts.split('|');
      return list[Math.floor(Math.random() * list.length)];
    });
    s = s.replace(/\{аты\}|\{толық аты\}/gi, p.name || '');
    s = s.replace(/\{есімі\}/gi, p.first || '');
    s = s.replace(/\{контакт\}/gi, p.title || '');
    s = s.replace(/\{нөмір\}/gi, p.phone ? '+' + p.phone : '');
    s = s.replace(/\{(\d+)\}/g, (_, n) => (p.cells || [])[+n - 1] || '');
    return s.replace(/[ \t]+([,.!?])/g, '$1').replace(/ {2,}/g, ' ').trim();
  }

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  --bg: #0b1411; --card: #111d19; --card-2: #15241f; --field: rgba(255,255,255,.05); --field-border: rgba(255,255,255,.1);
  --text: #e9f1ee; --muted: #93a7a0; --faint: #64776f; --line: rgba(255,255,255,.07);
  --brand: #00a884; --brand-2: #25d366; --brand-ink: #3ee08f; --brand-soft: rgba(37,211,102,.13);
  --ok: #3ddc84; --ok-soft: rgba(61,220,132,.13); --fail: #ff6b6f; --fail-soft: rgba(255,107,111,.13); --warn: #ffbe4d; --warn-soft: rgba(255,190,77,.13);
  --spring: cubic-bezier(.34,1.56,.64,1); --ease: cubic-bezier(.2,.8,.2,1);
  font: 13.5px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  color: var(--text); -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: light) {
  .wrap { --bg: #f3f7f5; --card: #ffffff; --card-2: #f6faf8; --field: #f2f6f4; --field-border: #d9e4df; --text: #10201a; --muted: #5d6f68; --faint: #8c9a94; --line: rgba(0,0,0,.07);
    --brand-ink: #007a60; --brand-soft: rgba(0,168,132,.12); --ok: #12a150; --ok-soft: rgba(18,161,80,.12); --fail: #e5484d; --fail-soft: rgba(229,72,77,.12); --warn: #b97300; --warn-soft: rgba(245,166,35,.16); }
}
.panel {
  position: fixed; top: 12px; right: 12px; bottom: 12px; z-index: 2147483000;
  width: 440px; max-width: calc(100vw - 24px);
  display: flex; flex-direction: column;
  background: var(--bg); border: 1px solid var(--line); border-radius: 20px;
  box-shadow: 0 30px 80px -20px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.08);
  overflow: hidden;
  animation: slide .45s var(--ease) both;
}
.panel.hidden { display: none; }
.head {
  display: flex; align-items: center; gap: 12px; padding: 14px 14px 12px 16px;
  background: radial-gradient(120% 140% at 0% 0%, rgba(37,211,102,.28), transparent 55%), var(--card);
  border-bottom: 1px solid var(--line);
}
.logo { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; flex: none;
  background: linear-gradient(160deg, #5cf08a, #25d366 45%, #1ebe5d); box-shadow: 0 8px 18px -6px rgba(37,211,102,.7), inset 0 1px 0 rgba(255,255,255,.35); }
.logo svg { width: 23px; height: 23px; }
.wa-bubble { fill: none; stroke: #fff; stroke-width: 1.9; stroke-linejoin: round; }
.wa-phone { fill: #fff; }
.title { flex: 1; font-size: 16px; font-weight: 750; letter-spacing: -.02em; }
.hbtn { width: 32px; height: 32px; padding: 0; border-radius: 10px; background: var(--field); border: 1px solid var(--field-border); color: var(--muted); }
.hbtn:hover { color: var(--text); border-color: var(--brand); }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 12px 14px 0; }
.stat { padding: 7px 8px; border-radius: 12px; background: var(--card); border: 1px solid var(--line); text-align: center; }
.stat b { display: block; font-size: 18px; font-weight: 800; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.stat span { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 650; }
.stat.ok b { color: var(--ok); } .stat.fail b { color: var(--fail); }
.bump { animation: bump .45s var(--spring); }
.body { flex: 1; overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
.body::-webkit-scrollbar { width: 8px; } .body::-webkit-scrollbar-thumb { background: var(--field-border); border-radius: 99px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 12px; }
.seg { display: flex; gap: 4px; padding: 4px; background: var(--field); border: 1px solid var(--field-border); border-radius: 13px; }
.seg button { flex: 1; padding: 8px 6px; border-radius: 9px; background: transparent; border: 0; color: var(--muted); font-size: 12.5px; }
.seg button.on { background: var(--card-2); color: var(--brand-ink); box-shadow: 0 2px 8px rgba(0,0,0,.18), 0 0 0 1px var(--line); }
.row { display: flex; gap: 8px; align-items: center; }
.mt { margin-top: 10px; }
.hint { font-size: 11.5px; color: var(--muted); margin-top: 8px; line-height: 1.5; }
.hidden { display: none !important; }
select, input, textarea {
  width: 100%; padding: 9px 12px; font: inherit; color: var(--text);
  background: var(--field); border: 1px solid var(--field-border); border-radius: 11px; outline: none;
  transition: border-color .2s, box-shadow .2s;
}
select:focus, input:focus, textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
select { appearance: none; font-weight: 650; cursor: pointer; padding-right: 30px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2325d366' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center; background-size: 14px; }
option { background: var(--card); color: var(--text); }
textarea { resize: vertical; line-height: 1.5; }
button {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  padding: 9px 14px; font: 650 13px/1.2 inherit; font-family: inherit; color: var(--text);
  border: 1px solid transparent; border-radius: 11px; cursor: pointer;
  transition: transform .2s var(--spring), box-shadow .25s, background .2s, border-color .2s, color .2s, opacity .2s;
}
button:active:not(:disabled) { transform: scale(.96); }
button:disabled { opacity: .4; cursor: not-allowed; }
.primary { color: #fff; background: linear-gradient(135deg, var(--brand-2), var(--brand) 55%, #018a6d); box-shadow: 0 8px 18px -6px rgba(0,168,132,.6), inset 0 1px 0 rgba(255,255,255,.25); }
.primary:hover:not(:disabled) { box-shadow: 0 12px 26px -8px rgba(0,168,132,.8), inset 0 1px 0 rgba(255,255,255,.25); }
.ghost { background: var(--field); border-color: var(--field-border); }
.ghost:hover:not(:disabled) { border-color: var(--brand); color: var(--brand-ink); }
.danger { color: #fff; background: linear-gradient(135deg, #ff6b6f, #e5484d); }
.danger:disabled { background: var(--field); color: var(--muted); border-color: var(--field-border); }
.wide { width: 100%; }
.icon { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.spin { animation: spin .9s linear infinite; }
.vars { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.vars button { padding: 4px 10px; border-radius: 99px; font-size: 11.5px; color: var(--brand-ink); background: var(--brand-soft); border-color: rgba(37,211,102,.2); }
.vars button:hover { background: var(--brand); color: #fff; }
.label { font-size: 11px; font-weight: 750; text-transform: uppercase; letter-spacing: .07em; color: var(--faint); margin: 2px 2px 8px; display: flex; align-items: center; gap: 8px; }
.label .count:empty { display: none; }
.label .count { margin-left: auto; text-transform: none; letter-spacing: 0; padding: 2px 9px; border-radius: 99px; background: var(--brand-soft); color: var(--brand-ink); font-weight: 700; }
.search { position: relative; flex: 1; }
.search .icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--faint); }
.search input { padding-left: 32px; border-radius: 99px; }
.people { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.person {
  display: grid; grid-template-columns: 22px 36px 1fr; gap: 10px; align-items: center;
  padding: 9px 10px; border-radius: 13px; background: var(--card-2); border: 1px solid transparent; cursor: pointer;
  transition: background .2s, border-color .2s, opacity .2s; animation: rise .35s var(--ease) both;
}
.person:hover { border-color: var(--line); }
.person.off { opacity: .45; }
.person.active { border-color: rgba(37,211,102,.5); background: var(--brand-soft); }
.person.filtered { display: none; }
.av { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 750; color: #fff;
  background: linear-gradient(135deg, hsl(var(--h) 70% 55%), hsl(calc(var(--h) + 40) 70% 42%)); }
.pname { font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.psub { font-size: 11.5px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pmsg { grid-column: 3; font-size: 12px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; }
.person:hover .pmsg { -webkit-line-clamp: 10; }
.chip { grid-column: 3; justify-self: start; display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 650; animation: pop .3s var(--spring) both; }
.chip .icon { width: 12px; height: 12px; }
.chip.ok { background: var(--ok-soft); color: var(--ok); } .chip.fail { background: var(--fail-soft); color: var(--fail); }
.chip.warn { background: var(--warn-soft); color: var(--warn); } .chip.run { background: var(--brand-soft); color: var(--brand-ink); }
.tag { display: inline-block; margin-left: 6px; padding: 0 7px; border-radius: 99px; font-size: 10.5px; font-weight: 700; vertical-align: 1px; }
.tag.parent { background: rgba(80,120,255,.15); color: #8ea8ff; } .tag.student { background: rgba(160,80,230,.15); color: #cf9bff; }
input[type=checkbox] { appearance: none; width: 20px; height: 20px; padding: 0; margin: 0; border-radius: 6px; border: 2px solid var(--field-border); background: var(--card); display: grid; place-items: center; cursor: pointer; transition: background .2s, border-color .2s; }
input[type=checkbox]::after { content: ""; width: 5px; height: 10px; border: solid #fff; border-width: 0 2.4px 2.4px 0; transform: translateY(-1px) rotate(45deg) scale(0); transition: transform .25s var(--spring); }
input[type=checkbox]:checked { background: linear-gradient(135deg, var(--brand-2), var(--brand)); border-color: var(--brand); }
input[type=checkbox]:checked::after { transform: translateY(-1px) rotate(45deg) scale(1); }
.empty { text-align: center; color: var(--muted); padding: 28px 10px; border: 1.5px dashed var(--field-border); border-radius: 14px; font-size: 12.5px; }
.empty b { display: block; color: var(--text); font-size: 14px; margin-bottom: 4px; }
.dock { padding: 12px 14px 14px; border-top: 1px solid var(--line); background: var(--card); }
.bar { height: 8px; border-radius: 99px; background: var(--field); overflow: hidden; margin-bottom: 10px; }
.bar div { height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, var(--brand), var(--brand-2), #34b7f1, var(--brand-2), var(--brand)); background-size: 300% 100%; animation: shimmer 2.4s linear infinite; transition: width .5s var(--ease); }
.ptext { display: flex; justify-content: space-between; font-size: 12px; font-weight: 650; margin-bottom: 6px; color: var(--muted); }
.actions { display: grid; grid-template-columns: auto auto 1fr; gap: 8px; }
.send { padding: 11px 14px; font-size: 14px; }
.toast { position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); padding: 8px 14px; border-radius: 99px; background: rgba(10,20,17,.94); color: #fff; font-size: 12.5px; font-weight: 650; white-space: nowrap; box-shadow: 0 10px 30px rgba(0,0,0,.4); transition: opacity .25s, transform .3s var(--spring); }
.toast.hidden { display: block !important; opacity: 0; transform: translate(-50%, 10px); pointer-events: none; }
.fab { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000; width: 56px; height: 56px; padding: 0; border-radius: 50%;
  background: linear-gradient(160deg, #5cf08a, #25d366 45%, #1ebe5d); box-shadow: 0 12px 30px -8px rgba(37,211,102,.8); animation: pop .35s var(--spring) both; }
.fab svg { width: 30px; height: 30px; }
@keyframes slide { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: none; } }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes pop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
@keyframes bump { 40% { transform: scale(1.3); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { to { background-position: -300% 0; } }
`;

  const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="wa-bubble" d="M7.9 20.6A9.2 9.2 0 1 0 3.5 16.3L2.3 21.7Z"/><path class="wa-phone" transform="translate(7.1 7.1) scale(.41)" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  const ICONS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    skip: '<path d="m5 4 10 8-10 8V4z"/><path d="M19 5v14"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    min: '<path d="M5 12h14"/>',
    ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    gear: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  };
  const ic = (n, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

  const host = document.createElement('div');
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  ['keydown', 'keyup', 'keypress', 'input', 'paste', 'copy', 'cut', 'beforeinput', 'compositionstart', 'compositionend', 'focusin', 'focusout'].forEach((ev) =>
    host.addEventListener(ev, (e) => e.stopPropagation())
  );

  root.innerHTML = `<style>${CSS}</style>
<div class="wrap">
  <button class="fab hidden" id="fab" title="Ватсап рассылка">${LOGO}</button>
  <div class="panel" id="panel">
    <div class="head">
      <div class="logo">${LOGO}</div>
      <div class="title">Ватсап рассылка</div>
      <button class="hbtn" id="minimize" title="Жасыру">${ic('min')}</button>
      <button class="hbtn" id="close" title="Жабу">${ic('x')}</button>
    </div>
    <div class="stats">
      <div class="stat"><b id="sSel">0</b><span>белгіленген</span></div>
      <div class="stat ok"><b id="sOk">0</b><span>жіберілді</span></div>
      <div class="stat fail"><b id="sFail">0</b><span>қате</span></div>
    </div>
    <div class="body">
      <div class="card">
        <div class="seg" id="modes">
          <button data-mode="wa">WhatsApp тізімі</button>
          <button data-mode="juz">JUZ40</button>
        </div>
        <div data-pane="wa" class="mt">
          <div class="row"><select id="waList"><option value="">— тізімдерді жүктеңіз —</option></select><button class="ghost" id="loadLists" title="Тізімдерді жүктеу">${ic('refresh')}</button></div>
          <button class="primary wide mt" id="loadMembers">${ic('users')}Адамдарды көрсету</button>
        </div>
        <div data-pane="juz" class="mt">
          <button class="primary wide" id="openJuz">${ic('ext')}JUZ40-ты ашу</button>
          <div class="hint">Жаңа терезеде JUZ40-қа кіріп, «Тапсырмағандар» немесе «Еске салу» режимін таңдайсыз. «WhatsApp панеліне жіберу» басқанда тізім осында шығады.</div>
        </div>
      </div>

      <div class="card" id="msgCard">
        <div class="label">Хабарлама<span class="count" id="msgLen"></span></div>
        <div class="vars">
          <button data-var="{есімі}">+ есімі</button>
          <button data-var="{аты}">+ аты-жөні</button>
          <button data-var="{Сәлем|Сәлеметсіз бе}">+ нұсқа</button>
        </div>
        <textarea id="template" rows="4" placeholder="Сәлем, {есімі}! …"></textarea>
      </div>

      <div>
        <div class="label">Адамдар<span class="count" id="count"></span></div>
        <div class="row">
          <div class="search">${ic('search')}<input id="search" placeholder="Іздеу…"></div>
          <button class="ghost" id="all" title="Барлығын белгілеу">${ic('check')}</button>
          <button class="ghost" id="none" title="Белгіні алу">${ic('x')}</button>
        </div>
        <div class="people" id="people"><div class="empty"><b>Әзірге ешкім жоқ</b>Жоғарыдан тізімді таңдап, «Адамдарды көрсету» басыңыз.</div></div>
      </div>

    </div>
    <div class="dock">
      <div id="progress" class="hidden">
        <div class="ptext"><span id="pText"></span><span id="pNum"></span></div>
        <div class="bar"><div id="pBar"></div></div>
      </div>
      <div class="actions">
        <button class="ghost" id="dry" title="Әр чатты тауып ашады, бірақ жібермейді">${ic('search')}Тексеру</button>
        <button class="danger" id="stop" disabled>${ic('stop')}</button>
        <button class="primary send" id="send">${ic('send')}<span id="sendLabel">Жіберу</span></button>
      </div>
    </div>
    <div class="toast hidden" id="toast"></div>
  </div>
</div>`;

  const $ = (id) => root.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  let toastTimer;
  function toast(msg, ms = 2200) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }
  function bump(id, v) {
    const e = $(id);
    if (e.textContent === String(v)) return;
    e.textContent = v;
    e.classList.remove('bump');
    void e.offsetWidth;
    e.classList.add('bump');
  }

  function setMode(m) {
    mode = m;
    store.set('mode', m);
    root.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    root.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== m));
    $('msgCard').classList.toggle('hidden', m === 'juz');
  }

  function initials(name) {
    const w = (name || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toLocaleUpperCase('kk');
  }

  function sentLog() {
    return store.get('sent', []);
  }
  function addSent(key) {
    const log = sentLog();
    log.unshift({ key, date: kzDate(new Date()) });
    store.set('sent', log.slice(0, 3000));
  }

  function rowKey(r) {
    return r.kind + ':' + r.target + ':' + hash(r.kind === 'juz' ? r.key || r.message : $('template').value.trim());
  }

  function setRows(list) {
    const today = kzDate(new Date());
    const sent = new Set(sentLog().filter((e) => e.date === today).map((e) => e.key));
    rows = list.map((r) => {
      const row = { ...r, state: '', cls: '', icon: '' };
      if (row.kind !== 'juz') row.message = render($('template').value.trim(), row);
      row.sentKey = rowKey(row);
      row.checked = row.checked !== false && !sent.has(row.sentKey);
      if (sent.has(row.sentKey)) Object.assign(row, { state: 'бүгін жіберілген', cls: 'warn', icon: 'skip' });
      return row;
    });
    renderPeople();
  }

  function renderPeople() {
    const box = $('people');
    box.innerHTML = '';
    if (!rows.length) {
      box.innerHTML = '<div class="empty"><b>Әзірге ешкім жоқ</b>Жоғарыдан тізімді таңдап, «Адамдарды көрсету» басыңыз.</div>';
      updateCount();
      return;
    }
    rows.forEach((r, i) => {
      const p = el('div', 'person' + (r.checked ? '' : ' off'));
      p.id = 'p-' + i;
      p.style.animationDelay = Math.min(i, 25) * 15 + 'ms';
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = r.checked;
      cb.onchange = () => {
        r.checked = cb.checked;
        p.classList.toggle('off', !cb.checked);
        updateCount();
      };
      const av = el('div', 'av', initials(r.label));
      av.style.setProperty('--h', hash(r.label) % 360);
      const info = el('div');
      const nm = el('div', 'pname', r.label);
      if (r.who) nm.append(el('span', 'tag ' + r.who, r.who === 'student' ? 'оқушы' : 'ата-ана'));
      info.append(nm, el('div', 'psub', r.sub || ''));
      p.append(cb, av, info, el('div', 'pmsg', r.message));
      const st = el('div', 'chip hidden');
      st.id = 's-' + i;
      p.append(st);
      p.onclick = (e) => {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        cb.onchange();
      };
      box.append(p);
      if (r.state) setState(i, r.state, r.cls, r.icon, true);
    });
    applySearch();
    updateCount();
  }

  function refreshMessages() {
    if (running || mode === 'juz') return;
    const tpl = $('template').value.trim();
    rows.forEach((r, i) => {
      if (r.kind === 'juz') return;
      r.message = render(tpl, r);
      r.sentKey = rowKey(r);
      const m = root.querySelector(`#p-${i} .pmsg`);
      if (m) m.textContent = r.message;
    });
  }

  function applySearch() {
    const q = $('search').value.toLocaleLowerCase('kk').trim();
    rows.forEach((r, i) => {
      const p = $('p-' + i);
      if (p) p.classList.toggle('filtered', !!q && !`${r.label} ${r.sub || ''}`.toLocaleLowerCase('kk').includes(q));
    });
  }

  function updateCount() {
    const n = rows.filter((r) => r.checked).length;
    $('count').textContent = rows.length ? `${n} / ${rows.length}` : '';
    $('sendLabel').textContent = n ? `Жіберу (${n})` : 'Жіберу';
    bump('sSel', n);
  }

  function setState(i, text, cls, iconName, silent) {
    Object.assign(rows[i], { state: text, cls, icon: iconName });
    const s = $('s-' + i);
    if (s) {
      s.className = 'chip ' + (cls || 'run');
      s.innerHTML = (iconName ? ic(iconName, iconName === 'loader' ? 'spin' : '') : '') + '<span></span>';
      s.lastChild.textContent = text;
    }
    if (silent) return;
    root.querySelectorAll('.person.active').forEach((p) => p.classList.remove('active'));
    const p = $('p-' + i);
    if (p && !cls) {
      p.classList.add('active');
      p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    if (p) p.classList.toggle('off', !rows[i].checked);
  }

  function setProgress(done, total, ok, fail, label) {
    $('progress').classList.remove('hidden');
    $('pText').textContent = label;
    $('pNum').textContent = `✓ ${ok}  ✕ ${fail}`;
    $('pBar').style.width = total ? Math.round((done / total) * 100) + '%' : '0';
    bump('sOk', ok);
    bump('sFail', fail);
  }

  async function loadLists() {
    toast('Тізімдер жүктелуде…', 0);
    const lists = await waGetLists();
    const sel = $('waList');
    const keep = sel.value || store.get('waList', '');
    sel.innerHTML = '';
    if (!lists.length) sel.append(new Option('— тізім табылмады —', ''));
    lists.forEach((n) => sel.append(new Option(n, n)));
    if (lists.includes(keep)) sel.value = keep;
    toast(lists.length ? `${lists.length} тізім табылды` : 'WhatsApp Business-те тізім табылмады');
  }

  async function loadMembers() {
    const name = $('waList').value;
    if (!name) return toast('Алдымен тізімді таңдаңыз');
    store.set('waList', name);
    $('loadMembers').disabled = true;
    toast(`«${name}» жиналуда…`, 0);
    try {
      const sel = await waSelectList(name, true);
      if (!sel.ok) return toast(sel.reason);
      const members = await waListMembers(name);
      membersList = name;
      setRows(members.map((m) => {
        const nm = nameFromTitle(m.title);
        const words = nm.split(' ');
        return { kind: 'list', target: m.title, list: name, label: nm || m.title, sub: m.title, title: m.title, name: nm, first: words.length > 1 ? words[words.length - 1] : words[0] };
      }));
      toast(`«${name}»: ${members.length} чат`);
    } finally {
      $('loadMembers').disabled = false;
    }
  }

  function openJuz() {
    const w = window.open(SITE + 'juz40.html', 'juz40-rassylka', 'width=1240,height=880');
    if (!w) toast('Браузер терезені бұғаттады — рұқсат беріңіз');
  }

  window.addEventListener('message', (e) => {
    if (!SITE.startsWith(e.origin) || !e.data || e.data.type !== 'wa-rassylka:items') return;
    setMode('juz');
    setRows(e.data.items.map((it) => ({ ...it, kind: 'juz', target: it.contact || it.phone, checked: true })));
    showPanel();
    toast(`JUZ40-тан ${e.data.items.length} хабарлама келді`);
    try {
      e.source.postMessage({ type: 'wa-rassylka:received', count: e.data.items.length }, e.origin);
    } catch (err) {}
  });

  async function sendOne(r, dry) {
    if (r.kind === 'list') {
      const sel = await waSelectList(r.list);
      if (!sel.ok) return sel;
      let opened = await waOpenFromList(r.target);
      let via = `«${r.list}» тізімінен`;
      if (!opened.ok && /табылмады/.test(opened.reason)) {
        const core = r.target.replace(/[^\p{L}\p{N}\s|-]+/gu, ' ').replace(/\s+/g, ' ').trim();
        opened = await waOpenContact(core, [core], core);
        via = 'іздеу арқылы';
      }
      if (!opened.ok) return opened;
      if (dry) return { ok: true, via };
      return { ...(await waSendInOpenChat(r.message, r.target)), via };
    }
    if (r.kind === 'contact') {
      const opened = await waOpenContact(r.target, [r.target], r.target);
      if (!opened.ok) return opened;
      if (dry) return { ok: true, via: `«${opened.title}»` };
      return { ...(await waSendInOpenChat(r.message, r.target)), via: `«${opened.title}»` };
    }
    if (r.kind === 'phone') {
      const opened = await waOpenByPhone(r.target);
      if (!opened.ok) return opened;
      if (dry) return { ok: true, via: `«${opened.title}»` };
      return { ...(await waSendInOpenChat(r.message, null)), via: `«${opened.title}»` };
    }
    let res = { ok: false, reason: 'контакт та, нөмір де жоқ' };
    if (r.contact && r.method !== 'phone-only') {
      res = await waOpenContact(r.contact, [r.contact], r.prefer || null, !!r.startsWith);
      if (res.ok) {
        const via = `«${res.title}»`;
        if (dry) return { ok: true, via };
        return { ...(await waSendInOpenChat(r.message, r.contact, !!r.startsWith)), via };
      }
    }
    if (r.phone && r.method !== 'contact-only') {
      const first = res.reason;
      const opened = await waOpenByPhone(r.phone);
      if (!opened.ok) return { ok: false, reason: r.contact ? `${first}; ${opened.reason}` : opened.reason };
      const via = `нөмір ${'…' + r.phone.slice(-4)}`;
      if (dry) return { ok: true, via };
      return { ...(await waSendInOpenChat(r.message, null)), via };
    }
    return res;
  }

  async function sendAll(dry) {
    if (running) return;
    if (mode !== 'juz' && !$('template').value.trim()) return toast('Хабарлама мәтінін жазыңыз');
    refreshMessages();
    const todo = rows.map((r, i) => [r, i]).filter(([r]) => r.checked);
    if (!todo.length) return toast('Ешкім белгіленбеген');
    if (!dry && !confirm(`${todo.length} адамға хабарлама жіберілсін бе?`)) return;
    running = true;
    stopRequested = false;
    ['dry', 'send', 'loadMembers'].forEach((id) => ($(id).disabled = true));
    $('stop').disabled = false;
    let ok = 0;
    let fail = 0;
    setProgress(0, todo.length, 0, 0, dry ? 'Тексерілуде…' : 'Жіберілуде…');
    try {
      for (let k = 0; k < todo.length && !stopRequested; k++) {
        const [r, i] = todo[k];
        setProgress(k, todo.length, ok, fail, `${k + 1} / ${todo.length} · ${r.label}`);
        setState(i, dry ? 'тексерілуде…' : 'жіберілуде…', '', 'loader');
        let res;
        try {
          res = await sendOne(r, dry);
        } catch (e) {
          res = { ok: false, reason: e.message };
        }
        if (res.ok && dry) {
          ok++;
          setState(i, 'табылды: ' + res.via, 'ok', 'search');
        } else if (res.ok) {
          ok++;
          r.checked = false;
          addSent(r.sentKey);
          setState(i, 'жіберілді: ' + res.via, 'ok', 'check');
        } else if (!dry && /расталмады/.test(res.reason || '')) {
          fail++;
          r.checked = false;
          addSent(r.sentKey);
          setState(i, 'кеткен болуы мүмкін — чатты тексеріңіз', 'warn', 'skip');
        } else {
          fail++;
          setState(i, res.reason, 'fail', 'x');
        }
        setProgress(k + 1, todo.length, ok, fail, `${k + 1} / ${todo.length}`);
      }
    } finally {
      running = false;
      ['dry', 'send', 'loadMembers'].forEach((id) => ($(id).disabled = false));
      $('stop').disabled = true;
      root.querySelectorAll('.person.active').forEach((p) => p.classList.remove('active'));
      $('pText').textContent = `${stopRequested ? 'Тоқтатылды' : 'Аяқталды'}: ${dry ? 'табылды' : 'жіберілді'} ${ok}, қате ${fail}`;
      updateCount();
      await waClearSearch();
    }
  }


  function showPanel() {
    $('panel').classList.remove('hidden');
    $('fab').classList.add('hidden');
  }
  function hidePanel() {
    $('panel').classList.add('hidden');
    $('fab').classList.remove('hidden');
  }
  host.__toggle = () => ($('panel').classList.contains('hidden') ? showPanel() : hidePanel());

  root.querySelectorAll('#modes button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  root.querySelectorAll('.vars button').forEach((b) => {
    b.onclick = () => {
      const t = $('template');
      const v = b.dataset.var;
      const s = t.selectionStart ?? t.value.length;
      t.value = t.value.slice(0, s) + v + t.value.slice(t.selectionEnd ?? s);
      t.focus();
      t.selectionStart = t.selectionEnd = s + v.length;
      t.dispatchEvent(new Event('input'));
    };
  });
  let tplTimer;
  $('template').addEventListener('input', () => {
    $('msgLen').textContent = $('template').value.length ? $('template').value.length + ' таңба' : '';
    clearTimeout(tplTimer);
    tplTimer = setTimeout(() => {
      store.set('template', $('template').value);
      refreshMessages();
    }, 250);
  });
  $('search').oninput = applySearch;
  $('all').onclick = () => {
    rows.forEach((r) => (r.checked = true));
    renderPeople();
  };
  $('none').onclick = () => {
    rows.forEach((r) => (r.checked = false));
    renderPeople();
  };
  $('loadLists').onclick = loadLists;
  $('loadMembers').onclick = loadMembers;
  $('openJuz').onclick = openJuz;
  $('dry').onclick = () => sendAll(true);
  $('send').onclick = () => sendAll(false);
  $('stop').onclick = () => {
    stopRequested = true;
    toast('Тоқтатылуда…');
  };
  $('minimize').onclick = hidePanel;
  $('fab').onclick = showPanel;
  $('close').onclick = () => {
    if (running && !confirm('Жіберу жүріп жатыр. Панель жабылсын ба?')) return;
    stopRequested = true;
    host.remove();
  };

  $('template').value = store.get('template', '') || DEFAULT_TEMPLATE;
  $('msgLen').textContent = $('template').value.length ? $('template').value.length + ' таңба' : '';
  setMode(mode);
  renderPeople();
  if (document.querySelector('#pane-side')) loadLists();
  else toast('WhatsApp-қа QR-кодпен кіріп, батырманы қайта басыңыз', 5000);
})();
