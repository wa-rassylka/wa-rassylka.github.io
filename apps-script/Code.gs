var PROTECTED_TABS = /^(ҮЛГІ|ULGI|Form Responses)/i;

function doGet() {
  return json_({ ok: true, service: 'juz40-reyting' });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.action === 'tabs') return json_({ ok: true, result: listTabs_(req.url) });
    if (req.action === 'names') return json_({ ok: true, result: listNames_(req.url, req.tab) });
    if (req.action === 'write') return json_({ ok: true, result: write_(req) });
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function open_(url) {
  var m = String(url || '').match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!m) throw new Error('Google Sheets сілтемесі дұрыс емес');
  return SpreadsheetApp.openById(m[1]);
}

function sheet_(ss, tab) {
  var sh = ss.getSheetByName(tab);
  if (!sh) throw new Error('«' + tab + '» беті табылмады: ' + ss.getName());
  return sh;
}

function listTabs_(url) {
  var ss = open_(url);
  return {
    title: ss.getName(),
    tabs: ss.getSheets().map(function (s) { return s.getName(); }).filter(function (n) { return !PROTECTED_TABS.test(n); }),
  };
}

function listNames_(url, tab) {
  var sh = sheet_(open_(url), tab);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); }).filter(String);
}

function parse_(v) {
  if (typeof v === 'number') return { v: v, f: null };
  var s = String(v == null ? '' : v).trim();
  var pct = s.match(/^(-?\d+(?:[.,]\d+)?)%$/);
  if (pct) return { v: Number(pct[1].replace(',', '.')) / 100, f: '0.00%' };
  if (/^-?\d+(?:[.,]\d+)?$/.test(s)) {
    var dec = s.indexOf(',') >= 0 || s.indexOf('.') >= 0;
    return { v: Number(s.replace(',', '.')), f: dec ? '0.0' : null };
  }
  return { v: s, f: '@' };
}

function writeTable_(sh, t) {
  var rows = t.values.length;
  var cols = t.values[0].length;
  var clearRows = Math.max(sh.getMaxRows(), rows);
  var area = sh.getRange(1, 1, clearRows, cols);
  area.clearContent();
  area.setBackground(null).setBorder(false, false, false, false, false, false);
  var values = [], formats = [];
  for (var r = 0; r < rows; r++) {
    var vr = [], fr = [];
    for (var c = 0; c < cols; c++) {
      var p = parse_(t.values[r][c]);
      vr.push(p.v);
      fr.push(p.f || '0');
    }
    values.push(vr);
    formats.push(fr);
  }
  var rng = sh.getRange(1, 1, rows, cols);
  rng.setNumberFormats(formats);
  rng.setValues(values);
  rng.setBackgrounds(t.bg);
  rng.setFontColors(t.fg);
  rng.setFontWeights(t.bold.map(function (row) { return row.map(function (b) { return b ? 'bold' : 'normal'; }); }));
  rng.setFontFamily('Montserrat').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle');
  rng.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  (t.blankRows || []).forEach(function (r) {
    sh.getRange(r + 1, 1, 1, cols).setBackground(null).setBorder(false, false, false, false, false, false);
  });
  sh.getRange(1, 1, 1, cols).setWrap(true);
  SpreadsheetApp.flush();
  sh.autoResizeColumn(2);
  sh.setColumnWidth(2, sh.getColumnWidth(2) + 24);
}

function norm_(s) {
  return String(s || '').toLocaleLowerCase().replace(/[^a-zа-яәіңғүұқөһё0-9]+/gi, ' ').trim();
}

function findRow_(sh, name) {
  var want = norm_(name);
  if (!want) throw new Error('Куратордың аты-жөнін жазыңыз');
  var last = sh.getLastRow();
  var col = sh.getRange(1, 1, last, 1).getDisplayValues();
  var parts = want.split(' ');
  for (var i = 0; i < col.length; i++) if (norm_(col[i][0]) === want) return i + 1;
  for (var j = 0; j < col.length; j++) {
    var have = norm_(col[j][0]);
    if (have && parts.every(function (p) { return have.indexOf(p) >= 0; })) return j + 1;
  }
  throw new Error('Отчетта «' + name + '» деген жол табылмады');
}

function write_(req) {
  var done = [];
  if (req.general) {
    if (PROTECTED_TABS.test(req.general.tab)) throw new Error('Үлгі бетке жазуға болмайды');
    writeTable_(sheet_(open_(req.general.url), req.general.tab), req.general);
    done.push('general');
  }
  if (req.st) {
    if (PROTECTED_TABS.test(req.st.tab)) throw new Error('Үлгі бетке жазуға болмайды');
    writeTable_(sheet_(open_(req.st.url), req.st.tab), req.st);
    done.push('st');
  }
  if (req.report) {
    var sh = sheet_(open_(req.report.url), req.report.tab);
    var row = findRow_(sh, req.report.name);
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    var col = 14;
    for (var h = 0; h < head.length; h++) if (/ТЕОРИЯЛЫҚ/i.test(head[h])) { col = h + 1; break; }
    var vals = [], fmts = [];
    req.report.values.forEach(function (v) {
      var p = parse_(v);
      vals.push(p.v);
      fmts.push(p.f || '0');
    });
    var rng = sh.getRange(row, col, 1, vals.length);
    rng.setNumberFormats([fmts]);
    rng.setValues([vals]);
    done.push('report:' + row);
  }
  return done;
}
