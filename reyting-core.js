const RT = (() => {
  const LEFT_RE = /шыққан|шықты|кетті|ушел|ушла/i;
  const COLORS = { gold: '#FFD966', silver: '#BFBFBF', bronze: '#ED7D31', white: '#FFFFFF', head: '#1F3F4E', headText: '#FFFFFF' };

  const KINDS = [
    { key: 'konspekt', re: /КОНСПЕКТ/i, short: null },
    { key: 'prac', re: /ПРАКТИКАЛЫҚ/i, short: null },
    { key: 'quiz', re: /QUIZ|КУИЗ|КВИЗ/i, short: null },
    { key: 'uzh', re: /ҮЙ\s*ЖҰМЫС/i, short: null },
    { key: 'kzh', re: /ҚАТЕМЕН/i, short: null },
    { key: 'live', re: /LIVE|ЛАЙВ/i, short: 'LIVE САБАҚ' },
    { key: 'st', re: /САБАҚ\s*ТАПСЫРУ/i, short: 'СТ' },
  ];

  function kindOf(lesson) {
    const hay = `${lesson.name || ''} | ${lesson.themeName || ''}`;
    if (/КОНСПЕКТ/i.test(lesson.name || '')) return 'konspekt';
    if (/ҚАТЕМЕН/i.test(lesson.name || '')) return 'kzh';
    for (const k of KINDS) if (k.re.test(lesson.name || '')) return k.key;
    for (const k of KINDS) if (k.re.test(hay)) return k.key;
    return 'other';
  }

  function kindRank(kind) {
    const i = KINDS.findIndex((k) => k.key === kind);
    return i < 0 ? KINDS.length : i;
  }

  function headerOf(lesson) {
    const k = KINDS.find((x) => x.key === lesson.kind);
    if (k && k.short) return k.short;
    return (lesson.name || '').replace(/^\s*\d+\s*-\s*АЙ\s*\d+\s*-\s*АПТА\s*\|\s*/i, '').trim().toUpperCase();
  }

  function cleanName(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function submitted(p) {
    if (!p) return false;
    return p.status === 'SUCCESS' || p.status === 'IN_REVIEW' || !!p.finishTime;
  }

  function fmtNum(n, digits = 1) {
    return n.toFixed(digits).replace('.', ',');
  }

  function fmtPct(part, whole) {
    if (!whole) return '0,00%';
    return fmtNum((part / whole) * 100, 2) + '%';
  }

  function fmtCountPct(part, whole) {
    const v = whole ? (part / whole) * 100 : 0;
    const s = String(Math.round(v * 100) / 100).replace('.', ',');
    return `${part}(${s}%)`;
  }

  function leagueOf(total, max, goldRatio, silverRatio) {
    if (total >= Math.ceil(max * goldRatio - 1e-9)) return 'gold';
    if (total >= Math.ceil(max * silverRatio - 1e-9)) return 'silver';
    return 'bronze';
  }

  function build({ lessons, progresses, excluded }) {
    const cols = lessons
      .map((l, i) => ({ ...l, kind: l.kind || kindOf(l), order: i }))
      .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || (a.order ?? 0) - (b.order ?? 0));

    const students = new Map();
    const pending = [];
    for (const l of cols) {
      for (const p of progresses[l.id] || []) {
        if (!p.studentId) continue;
        if (!students.has(p.studentId)) {
          students.set(p.studentId, {
            id: p.studentId,
            name: cleanName(`${p.studentLastname || ''} ${p.studentFirstname || ''}`),
            byLesson: {},
            leftHint: false,
          });
        }
        const s = students.get(p.studentId);
        s.byLesson[l.id] = p;
        const texts = [p.comment, ...(p.comments || []).map((c) => c.commentText)].filter(Boolean).join(' ');
        if (LEFT_RE.test(texts)) s.leftHint = true;
        if (p.status === 'IN_REVIEW' && p.score == null) pending.push({ lesson: l.name, student: s.name });
      }
    }

    const all = [...students.values()].sort((a, b) => a.name.localeCompare(b.name, 'kk'));
    const ex = excluded || new Set(all.filter((s) => s.leftHint).map((s) => s.id));
    const active = all.filter((s) => !ex.has(s.id));

    const colMax = cols.map((l) => {
      let m = Number(l.maxScore) || 0;
      for (const s of active) {
        const p = s.byLesson[l.id];
        if (p && p.score != null) m = Math.max(m, Number(p.score));
      }
      return m;
    });
    const maxTotal = colMax.reduce((a, b) => a + b, 0);

    const rows = active.map((s) => {
      const vals = cols.map((l) => {
        const p = s.byLesson[l.id];
        return p && p.score != null ? Number(p.score) : 0;
      });
      const total = vals.reduce((a, b) => a + b, 0);
      return { ...s, vals, total };
    });
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'kk'));
    rows.forEach((r) => (r.league = leagueOf(r.total, maxTotal, 0.85, 0.65)));

    const avg = cols.map((_, i) => (rows.length ? rows.reduce((a, r) => a + r.vals[i], 0) / rows.length : 0));
    const avgTotal = rows.length ? rows.reduce((a, r) => a + r.total, 0) / rows.length : 0;

    const general = {
      headers: ['№', 'Оқушының толық аты', ...cols.map(headerOf), 'ЖАЛПЫ'],
      rows: rows.map((r, i) => ({ cells: [i + 1, r.name, ...r.vals, r.total], league: r.league })),
      footer: ['', 'Орташа ұпайы', ...avg.map((v) => fmtNum(v)), fmtNum(avgTotal)],
      maxTotal,
      thresholds: { gold: Math.ceil(maxTotal * 0.85 - 1e-9), silver: Math.ceil(maxTotal * 0.65 - 1e-9) },
      counts: countLeagues(rows),
    };

    const stCol = cols.find((l) => l.kind === 'st');
    let st = null;
    if (stCol) {
      const stMax = Math.max(Number(stCol.maxScore) || 0, ...active.map((s) => Number((s.byLesson[stCol.id] || {}).score) || 0));
      const done = [];
      const missing = [];
      for (const s of active) {
        const p = s.byLesson[stCol.id];
        if (submitted(p)) done.push({ name: s.name, score: Number(p.score) || 0 });
        else missing.push({ name: s.name });
      }
      done.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'kk'));
      done.forEach((d) => (d.league = leagueOf(d.score, stMax, 0.8, 0.55)));
      const avgSt = done.length ? done.reduce((a, d) => a + d.score, 0) / done.length : 0;
      st = {
        lesson: stCol.name,
        max: stMax,
        thresholds: { gold: Math.ceil(stMax * 0.8 - 1e-9), silver: Math.ceil(stMax * 0.55 - 1e-9) },
        rows: done,
        missing,
        avg: avgSt,
        counts: countLeagues(done),
      };
    }

    const n = active.length;
    const pctOf = (kind) => {
      const l = cols.find((c) => c.kind === kind);
      if (!l) return null;
      const k = active.filter((s) => submitted(s.byLesson[l.id])).length;
      return { k, pct: n ? (k / n) * 100 : 0, text: fmtPct(k, n) };
    };
    const parts = ['konspekt', 'prac', 'uzh', 'kzh', 'quiz', 'live'].map(pctOf);
    const present = parts.filter(Boolean);
    const overall = present.length ? present.reduce((a, p) => a + p.pct, 0) / present.length : 0;
    const stDone = st ? st.rows.length : 0;
    const stMiss = st ? st.missing.length : 0;

    const report = {
      current: n,
      cells: [
        ...parts.map((p) => (p ? p.text : '-')),
        fmtNum(overall, 2) + '%',
        st ? fmtPct(stDone, n) : '-',
        st ? String(stDone) : '-',
        st ? String(stMiss) : '-',
        st ? fmtPct(stMiss, n) : '-',
        st ? fmtNum(st.avg) : '-',
        st ? fmtCountPct(st.counts.gold, stDone) : '-',
        st ? fmtCountPct(st.counts.silver, stDone) : '-',
        st ? fmtCountPct(st.counts.bronze, stDone) : '-',
        fmtCountPct(general.counts.gold, n),
        fmtCountPct(general.counts.silver, n),
        fmtCountPct(general.counts.bronze, n),
      ],
      labels: [
        'ТЕОРИЯЛЫҚ САБАҚ КӨРДІ', 'ПРАКТИКАЛЫҚ САБАҚ КӨРДІ', 'ҮЖ САЛДЫ', 'ҚЖ САЛДЫ', 'КУИЗ САЛДЫ', 'LIVE САБАҚ ҚАТЫСТЫ', 'ЖАЛПЫ',
        'СТ ТАПСЫРДЫ ПАЙЫЗЫ', 'СТ ТАПСЫРДЫ САНЫ', 'СТ ТАПСЫРМАДЫ САНЫ', 'СТ ТАПСЫРМАДЫ ПАЙЫЗЫ', 'СТ БАЛЛЫ',
        'СТ АЛТЫН', 'СТ КҮМІС', 'СТ ҚОЛА', 'ЖАЛПЫ РТ АЛТЫН', 'ЖАЛПЫ РТ КҮМІС', 'ЖАЛПЫ РТ ҚОЛА',
      ],
    };

    return { cols, all, excluded: ex, general, st, report, pending };
  }

  function countLeagues(list) {
    const c = { gold: 0, silver: 0, bronze: 0 };
    for (const r of list) c[r.league]++;
    return c;
  }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const BASE = 'font-family:Montserrat,Arial,sans-serif;font-size:10pt;border:1px solid #000000;text-align:center;vertical-align:middle;';

  function td(v, bg, opts = {}) {
    const color = opts.color || '#000000';
    const bold = opts.bold ? 'font-weight:bold;' : '';
    return `<td style="${BASE}background-color:${bg};color:${color};${bold}">${esc(v)}</td>`;
  }

  function headRow(cells) {
    return '<tr>' + cells.map((c) => td(c, COLORS.head, { color: COLORS.headText, bold: true })).join('') + '</tr>';
  }

  function generalClip(g) {
    const html = [
      '<table style="border-collapse:collapse">',
      headRow(g.headers),
      ...g.rows.map((r) =>
        '<tr>' + r.cells.map((c, i) => (i === 0 ? td(c, COLORS.head, { color: COLORS.headText, bold: true }) : td(c, COLORS[r.league]))).join('') + '</tr>'
      ),
      headRow(g.footer),
      '</table>',
    ].join('');
    const text = [g.headers, ...g.rows.map((r) => r.cells), g.footer].map((r) => r.join('\t')).join('\n');
    return { html, text };
  }

  function stClip(st) {
    const avgRow = ['', 'ОРТАҚ БАЛЛ', fmtNum(st.avg)];
    const lines = [
      headRow(['№', 'ОҚУШЫНЫҢ АТЫ-ЖӨНІ', 'НӘТИЖЕ']),
      ...st.rows.map((r, i) => '<tr>' + td(i + 1, COLORS.head, { color: COLORS.headText, bold: true }) + td(r.name, COLORS[r.league]) + td(r.score, COLORS[r.league]) + '</tr>'),
      headRow(avgRow),
    ];
    const text = [['№', 'ОҚУШЫНЫҢ АТЫ-ЖӨНІ', 'НӘТИЖЕ'], ...st.rows.map((r, i) => [i + 1, r.name, r.score]), avgRow];
    if (st.missing.length) {
      lines.push('<tr><td></td><td></td><td></td></tr>');
      lines.push(headRow(['№', 'ТАПСЫРМАҒАН ОҚУШЫ', 'СЕБЕБІ']));
      st.missing.forEach((m, i) => {
        lines.push('<tr>' + td(i + 1, COLORS.head, { color: COLORS.headText, bold: true }) + td(m.name, COLORS.white) + td(m.reason || '', COLORS.white) + '</tr>');
      });
      text.push(['', '', ''], ['№', 'ТАПСЫРМАҒАН ОҚУШЫ', 'СЕБЕБІ'], ...st.missing.map((m, i) => [i + 1, m.name, m.reason || '']));
    }
    return {
      html: '<table style="border-collapse:collapse">' + lines.join('') + '</table>',
      text: text.map((r) => r.join('\t')).join('\n'),
    };
  }

  function reportClip(report, extra) {
    const cells = [...report.cells, ...extra];
    return {
      html: '<table><tr>' + cells.map((c) => `<td style="font-family:Montserrat,Arial,sans-serif;font-size:10pt;text-align:center">${esc(c)}</td>`).join('') + '</tr></table>',
      text: cells.map((c) => String(c).replace(/[\t\n]+/g, ' ')).join('\t'),
    };
  }

  function tableOf(rows) {
    return {
      values: rows.map((r) => r.cells.map((c) => (c == null ? '' : c))),
      bg: rows.map((r) => r.cells.map((_, i) => (r.blank ? null : r.head || (i === 0 && r.numHead) ? COLORS.head : COLORS[r.league]))),
      fg: rows.map((r) => r.cells.map((_, i) => (r.blank ? '#000000' : r.head || (i === 0 && r.numHead) ? COLORS.headText : '#000000'))),
      bold: rows.map((r) => r.cells.map((_, i) => !r.blank && (r.head || (i === 0 && r.numHead)))),
      blankRows: rows.map((r, i) => (r.blank ? i : -1)).filter((i) => i >= 0),
    };
  }

  function generalTable(g) {
    return tableOf([
      { cells: g.headers, head: true },
      ...g.rows.map((r) => ({ cells: r.cells, league: r.league, numHead: true })),
      { cells: g.footer, head: true },
    ]);
  }

  function stTable(st) {
    const rows = [
      { cells: ['№', 'ОҚУШЫНЫҢ АТЫ-ЖӨНІ', 'НӘТИЖЕ'], head: true },
      ...st.rows.map((r, i) => ({ cells: [i + 1, r.name, r.score], league: r.league, numHead: true })),
      { cells: ['', 'ОРТАҚ БАЛЛ', fmtNum(st.avg)], head: true },
    ];
    if (st.missing.length) {
      rows.push({ cells: ['', '', ''], blank: true });
      rows.push({ cells: ['№', 'ТАПСЫРМАҒАН ОҚУШЫ', 'СЕБЕБІ'], head: true });
      st.missing.forEach((m, i) => rows.push({ cells: [i + 1, m.name, m.reason || ''], league: 'white', numHead: true }));
    }
    return tableOf(rows);
  }

  return { build, kindOf, kindRank, headerOf, generalClip, stClip, reportClip, generalTable, stTable, COLORS, submitted };
})();

if (typeof module !== 'undefined') module.exports = RT;
