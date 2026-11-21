/* YSO Disk Explorer — vanilla JS front end; all data comes from data.js (window.YSO). */
'use strict';
const D = window.YSO;
const $ = s => document.querySelector(s);
const REG = Object.fromEntries(D.regions.map(r => [r.region, r]));
const CLASSES = ['0', 'I', 'FS', 'II', 'III', '?'];
const CLASS_COL = { '0': '#7b2cbf', I: '#d62828', FS: '#f77f00', II: '#2a9d8f', III: '#4361ee', '?': '#9a9a9a' };

const ROWS = D.rows.map((r, idx) => {
  const o = { idx };
  D.cols.forEach((c, i) => (o[c] = r[i]));
  const R = REG[o.region] || {};
  o.region_age = R.age_myr ?? null; o.region_dist = R.dist_pc ?? null;
  o.name = o.name || o.source_id; o.region = o.region || 'unassigned';
  o.cls = o.yso_class || '?';
  o.feat = o.features ? o.features.split(';') : [];
  o.prog = o.programs ? o.programs.split(';') : [];
  o.search = `${o.name};${o.aliases || ''};${o.source_id}`.toLowerCase();
  return o;
});
const NUMERIC = D.cols.filter(c => ROWS.some(r => typeof r[c] === 'number' && c !== 'census' && c !== 'proplyd'))
  .concat(['region_age', 'region_dist']);
const LABEL = {
  Mstar: 'M★ (M⊙)', R_dust: 'dust disk radius (au)', R_gas: 'gas disk radius (au)', n_rings: '# rings/gaps', Mdust_Mearth: 'M_dust (M⊕)', F_mm_mJy: 'F_mm (mJy, as published)', F_13_mJy: 'F_1.3mm (mJy, scaled)',
  lam_mm: 'λ (mm)', alma_best_res: 'ALMA best res (″)', region_age: 'region age (Myr)', region_dist: 'region distance (pc)',
  alpha: 'α (SED slope)', tbol: 'T_bol (K)', alma_n: '# ALMA programs', jwst_n: '# JWST programs', hst_n: '# HST programs',
  sphere_n: '# SPHERE programs',
};
const lab = c => LABEL[c] || c;

// ------------------------------------------------------------------ filters
const state = { classes: new Set(CLASSES), regions: new Set(), feats: new Set(), progs: new Set(), sort: ['region_age', 1], page: 0, tab: 'gallery' };
const regionsSorted = [...new Set(ROWS.map(r => r.region))]
  .sort((a, b) => ((REG[a]?.age_myr ?? 99) - (REG[b]?.age_myr ?? 99)) || a.localeCompare(b));
regionsSorted.forEach(r => state.regions.add(r));
const countBy = (arr, f) => arr.reduce((m, x) => { for (const k of [].concat(f(x))) m[k] = (m[k] || 0) + 1; return m; }, {});

function buildFilterUI() {
  const cc = countBy(ROWS, r => r.cls);
  $('#f-class').innerHTML = CLASSES.map(c =>
    `<label class="pill"><input type="checkbox" value="${c}" checked><span><span class="cls c${c === '?' ? 'X' : c}">${c}</span><span class="n">${cc[c] || 0}</span></span></label>`).join('');
  const rc = countBy(ROWS, r => r.region);
  $('#f-region').innerHTML = regionsSorted.map(r =>
    `<label title="${REG[r] ? `${REG[r].dist_pc} pc, ${REG[r].age_myr} Myr, ${REG[r].environment}` : ''}"><span><input type="checkbox" value="${r}" checked> ${r}</span><span class="n">${rc[r]}</span></label>`).join('');
  const fc = countBy(ROWS, r => r.feat);
  $('#f-feat').innerHTML = Object.keys(fc).sort().map(f =>
    `<label><span><input type="checkbox" value="${f}"> ${f}</span><span class="n">${fc[f]}</span></label>`).join('') || '<span class="hint">none yet</span>';
  const pc = countBy(ROWS, r => r.prog);
  $('#f-prog').innerHTML = Object.keys(pc).sort().map(f =>
    `<label><span><input type="checkbox" value="${f}"> ${f}</span><span class="n">${pc[f]}</span></label>`).join('') || '<span class="hint">none (run step 3 + 4)</span>';
  $('#f-prog').onchange = e => { e.target.checked ? state.progs.add(e.target.value) : state.progs.delete(e.target.value); refresh(); };
  $('#f-class').onchange = e => { e.target.checked ? state.classes.add(e.target.value) : state.classes.delete(e.target.value); refresh(); };
  $('#f-region').onchange = e => { e.target.checked ? state.regions.add(e.target.value) : state.regions.delete(e.target.value); refresh(); };
  $('#f-feat').onchange = e => { e.target.checked ? state.feats.add(e.target.value) : state.feats.delete(e.target.value); refresh(); };
  $('#reg-all').onclick = e => { e.preventDefault(); regionsSorted.forEach(r => state.regions.add(r)); document.querySelectorAll('#f-region input').forEach(i => (i.checked = true)); refresh(); };
  $('#reg-none').onclick = e => { e.preventDefault(); state.regions.clear(); document.querySelectorAll('#f-region input').forEach(i => (i.checked = false)); refresh(); };
  document.querySelectorAll('#filters input:not([type=search])').forEach(i => { if (!i.closest('#f-class,#f-region,#f-feat,#f-prog')) i.oninput = refresh; });
  $('#q').oninput = refresh;
}

function selection() {
  const q = $('#q').value.trim().toLowerCase();
  const chk = id => $(id).checked;
  const res = parseFloat($('#f-res').value);
  return ROWS.filter(r =>
    state.classes.has(r.cls) && state.regions.has(r.region) &&
    (!q || r.search.includes(q)) &&
    (!chk('#f-census') || r.census) && (!chk('#f-detailed') || r.tier === 'detailed') &&
    (!chk('#f-mm') || r.F_mm_mJy != null) && (!chk('#f-alma') || r.alma_n > 0) &&
    (!chk('#f-almapub') || r.alma_public) && (!chk('#f-almabib') || r.alma_published) &&
    (isNaN(res) || (r.alma_best_res != null && r.alma_best_res <= res)) &&
    (!chk('#f-jwst') || r.jwst_n > 0) && (!chk('#f-hst') || r.hst_n > 0) && (!chk('#f-sphere') || r.sphere_n > 0) &&
    (!chk('#f-img') || r.n_images > 0) &&
    (!state.feats.size || r.feat.some(f => state.feats.has(f))) &&
    (!state.progs.size || r.prog.some(f => state.progs.has(f))));
}

// ------------------------------------------------------------------ formatting
const fmtNum = v => (v == null ? '' : Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(2) : +v.toPrecision(3));
function cell(r, c) {
  const v = r[c];
  if (c === 'yso_class') return `<span class="cls c${r.cls === '?' ? 'X' : r.cls}">${r.cls}</span>`;
  if (c === 'programs') return r.prog.map(f => `<span class="tag">${f}</span>`).join('');
  if (c === 'features') return r.feat.map(f => `<span class="tag ${f.split(' ')[0].split('/')[0]}">${f}</span>`).join('');
  if (c === 'F_mm_mJy' || c === 'F_13_mJy') return v == null ? '' : `${r.F_mm_limit ? '&lt;' : ''}${fmtNum(v)}`;
  if (c === 'Mdust_Mearth') return v != null ? fmtNum(v) : r.Mdust_limit != null ? `&lt;${fmtNum(r.Mdust_limit)}` : '';
  if (typeof v === 'boolean') return v ? '<span class="yes">✓</span>' : '';
  if (typeof v === 'number') return fmtNum(v);
  return v == null ? '' : String(v).length > 60 ? String(v).slice(0, 57) + '…' : v;
}

// ------------------------------------------------------------------ table
const COLSETS = {
  basic: ['name', 'region', 'yso_class', 'spt', 'alpha', 'tbol', 'features', 'programs', 'F_mm_mJy', 'alma_n', 'jwst_n', 'sphere_n'],
  mm: ['name', 'region', 'yso_class', 'F_mm_mJy', 'lam_mm', 'F_13_mJy', 'Mdust_Mearth', 'F_mm_ref', 'alma_best_res', 'alma_bands'],
  archive: ['name', 'region', 'yso_class', 'programs', 'alma_n', 'alma_best_res', 'alma_bands', 'alma_public', 'alma_published', 'jwst_n', 'jwst_instr', 'hst_n', 'sphere_n', 'naco_n'],
  all: D.cols.concat(['region_age', 'region_dist']),
};
const PAGE = 150;
function renderTable(sel) {
  const cols = COLSETS[$('#colset').value].filter(c => c in ROWS[0] || c === 'region_age');
  const [sc, dir] = state.sort;
  const key = r => (sc === 'yso_class' ? CLASSES.indexOf(r.cls) : r[sc]);
  const sorted = sel.slice().sort((a, b) => {
    const x = key(a), y = key(b);
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  });
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  state.page = Math.min(state.page, pages - 1);
  const part = sorted.slice(state.page * PAGE, (state.page + 1) * PAGE);
  $('#tbl thead').innerHTML = '<tr>' + cols.map(c => `<th data-c="${c}">${lab(c)}${c === sc ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr>';
  $('#tbl tbody').innerHTML = part.map(r => `<tr data-i="${r.idx}">` + cols.map(c =>
    `<td class="${typeof r[c] === 'number' ? 'num' : ''}">${cell(r, c)}</td>`).join('') + '</tr>').join('');
  $('#pageinfo').textContent = `page ${state.page + 1} / ${pages}`;
}
$('#tbl').onclick = e => {
  const th = e.target.closest('th');
  if (th) { const c = th.dataset.c; state.sort = [c, state.sort[0] === c ? -state.sort[1] : 1]; return refresh(); }
  const tr = e.target.closest('tr[data-i]'); if (tr) openDrawer(+tr.dataset.i);
};
$('#prev').onclick = () => { state.page = Math.max(0, state.page - 1); refresh(); };
$('#next').onclick = () => { state.page++; refresh(); };
$('#colset').onchange = refresh;

// ------------------------------------------------------------------ plot
const CATEG = ['yso_class', 'region', 'tier', 'programs', 'alma_public', 'alma_published', 'census', 'F_mm_ref', 'class_src'];
const RLAB = { r: 'radius r (au)', w: 'width Δr (au)', wr: 'fractional width Δr / r', depth: 'gap depth (1 − I_gap/I_ring)', contrast: 'ring/gap contrast',
  Mstar: 'M★ (M⊙)', R_dust: 'disk dust radius (au)', region_age: 'region age (Myr)', Mdust_Mearth: 'M_dust (M⊕)', kind: 'ring or gap', ref: 'paper', yso_class: 'class', region: 'region', phase: 'dust or gas', tracer: 'tracer (line)' };
const pm = { mode: 'src' };
function plotOptions() {
  const opt = (arr, d, L) => arr.map(c => `<option value="${c}" ${c === d ? 'selected' : ''}>${(L || {})[c] || lab(c)}</option>`).join('');
  if (pm.mode === 'ring') {
    const NUMR = ['r', 'w', 'wr', 'depth', 'contrast', 'Mstar', 'R_dust', 'region_age', 'Mdust_Mearth'];
    $('#px').innerHTML = opt(NUMR, 'r', RLAB); $('#py').innerHTML = opt(NUMR, 'w', RLAB);
    $('#pc').innerHTML = opt(['phase', 'kind', 'tracer', 'ref', 'yso_class', 'region'], 'phase', RLAB); $('#lx').checked = true; $('#ly').checked = true;
  } else {
    $('#px').innerHTML = opt(NUMERIC, pm.mode === 'src' && pm.px || 'region_age');
    $('#py').innerHTML = opt(NUMERIC, 'Mdust_Mearth');
    $('#pc').innerHTML = opt(CATEG.concat(NUMERIC), 'yso_class'); $('#lx').checked = false; $('#ly').checked = true;
  }
}
function initPlotUI() {
  plotOptions();
  ['#px', '#py', '#pc', '#lx', '#ly', '#plim', '#rd-sort', '#rd-radii', '#rd-log', '#rd-tr'].forEach(s => ($(s).onchange = refresh));
  $('#p-mode').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#p-mode button').forEach(x => x.classList.toggle('on', x === b));
    pm.mode = b.dataset.m; ['src', 'ring', 'diag'].forEach(m => $('#tab-plot').classList.toggle('m-' + m, pm.mode === m));
    $('#plot').style.minHeight = ''; plotOptions(); refresh(); };
  $('#tab-plot').classList.add('m-src');
}
const RINGS = (D.rings || []).map(r => ({ sid: r[0], label: r[1], kind: r[2], r: r[3], er: r[4], w: r[5], ew: r[6], depth: r[7], contrast: r[8], ref: r[9],
  tracer: r[10] || 'dust', phase: (r[10] || 'dust') === 'dust' ? 'dust' : 'gas' }));
const REFNAME = { Huang2018DSHARP: 'DSHARP (Huang+2018)', Long2018: 'Taurus (Long+2018)', Cieza2021: 'ODISEA (Cieza+2021)', Bae2023: 'Bae+2023 compilation',
  Curone2025: 'exoALMA (Curone+2025)', Law2021: 'MAPS (Law+2021)' };
const isCO = t => /^(13|)C(18|17|)O /.test(t);
function ringOk(x) {        // tracer selector shared by both ring plots
  const m = $('#rd-tr').value;
  return m === 'all' || (x.phase === 'dust' ? /dust/.test(m) : m === 'gas' || (/co/.test(m) && isCO(x.tracer)));
}
const ringTxt = (name, x) => `<b>${name}</b> ${x.label}${x.phase === 'gas' ? ` (${x.tracer})` : ''}: r = ${fmtNum(x.r)} au${x.w != null ? `, Δr = ${fmtNum(x.w)} au` : ''}${x.depth != null ? `, depth ${fmtNum(x.depth)}` : ''}<br>${REFNAME[x.ref] || x.ref}`;
function plotLayout(extra) {
  const dark = isDark();
  return { margin: { t: 24, r: 10 }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { color: dark ? '#ddd' : '#222' },
    legend: { x: 1.01, y: 1 }, hovermode: 'closest', ...extra };
}
function renderRingScatter(sel) {
  const ok = new Set(sel.map(r => r.source_id)), X = $('#px').value, Y = $('#py').value, C = $('#pc').value;
  const row = x => SID2ROW[x.sid] || {};
  const v = (x, k) => (['r', 'w', 'depth', 'contrast'].includes(k) ? x[k] : k === 'wr' ? (x.w && x.r ? x.w / x.r : null) : row(x)[k]);
  const pts = RINGS.filter(x => ok.has(x.sid) && ringOk(x)).map(x => ({ x, X: v(x, X), Y: v(x, Y) })).filter(p => p.X != null && p.Y != null && p.X > 0 === p.X > 0);
  const key = p => (['kind', 'phase', 'tracer'].includes(C) ? p.x[C] : C === 'ref' ? (REFNAME[p.x.ref] || p.x.ref) : C === 'yso_class' ? row(p.x).cls : row(p.x).region) || '?';
  const g = {}; pts.forEach(p => (g[key(p)] = g[key(p)] || []).push(p));
  const COL = { ring: '#3b82f6', gap: '#ef4444', dust: '#3b82f6', gas: '#f59e0b' };
  const tr = Object.keys(g).sort().map((k, i) => ({ type: 'scatter', mode: 'markers', name: k, x: g[k].map(p => p.X), y: g[k].map(p => p.Y),
    customdata: g[k].map(p => row(p.x).idx), hoverinfo: 'text',
    text: g[k].map(p => ringTxt(row(p.x).name, p.x)),
    error_x: X === 'r' ? { type: 'data', array: g[k].map(p => p.x.er || 0), visible: true, thickness: 1, width: 0, color: 'rgba(120,120,120,.5)' } : undefined,
    marker: { size: 8, color: ['kind', 'phase'].includes(C) ? COL[k] : (C === 'yso_class' ? CLASS_COL[k] : undefined), symbol: g[k].map(p => p.x.kind === 'gap' ? 'diamond-open' : 'circle'),
      line: { width: 1.2 }, opacity: 0.85 } }));
  Plotly.react('plot', tr, plotLayout({ xaxis: { title: RLAB[X] || lab(X), type: $('#lx').checked ? 'log' : 'linear', gridcolor: isDark() ? '#333' : '#eee' },
    yaxis: { title: RLAB[Y] || lab(Y), type: $('#ly').checked ? 'log' : 'linear', gridcolor: isDark() ? '#333' : '#eee' } }), { responsive: true, displaylogo: false });
  const elp = $('#plot'); if (!elp._bound) { elp.on('plotly_click', ev => { const c = ev.points[0].customdata; if (c != null) openDrawer(c); }); elp._bound = true; }
  $('#p-hint').textContent = `${pts.length} rings/gaps in ${new Set(pts.map(p => p.x.sid)).size} disks · ● ring  ◇ gap`;
}
function renderRingDiagram(sel) {
  const ok = new Set(sel.map(r => r.source_id)), by = {};
  RINGS.filter(x => ok.has(x.sid) && ringOk(x)).forEach(x => (by[x.sid] = by[x.sid] || []).push(x));
  const sk = $('#rd-sort').value, rowOf = sid => SID2ROW[sid] || {};
  const val = sid => sk === 'outer' ? Math.max(...by[sid].map(x => x.r)) : sk === 'name' ? rowOf(sid).name : rowOf(sid)[sk];
  const sids = Object.keys(by).sort((a, b) => { const x = val(a), y = val(b);
    if (x == null) return 1; if (y == null) return -1; return typeof x === 'string' ? x.localeCompare(y) : x - y; });
  const yl = sids.map(s => rowOf(s).name), Y = i => i;
  const segx = [], segy = [], segt = [], gx = [], gy = [], gt = [], gc = [], rx = [], ry = [], rt = [], rc = [], dx = [], dy = [], qx = [], qy = [];
  const Gs = { sx: [], sy: [], rx: [], ry: [], rt: [], rc: [], gx: [], gy: [], gt: [], gc: [] };   // gas features, drawn just below the dust row
  sids.forEach((sid, i) => by[sid].forEach(x => {
    const t = ringTxt(rowOf(sid).name, x);
    const idx = rowOf(sid).idx;
    if (x.phase === 'gas') { const y = i + 0.3;
      if (x.kind === 'gap') { Gs.gx.push(x.r); Gs.gy.push(y); Gs.gt.push(t); Gs.gc.push(idx); }
      else { if (x.w) { Gs.sx.push(Math.max(x.r - x.w / 2, 0.3), x.r + x.w / 2, null); Gs.sy.push(y, y, null); }
        Gs.rx.push(x.r); Gs.ry.push(y); Gs.rt.push(t); Gs.rc.push(idx); }
      return; }
    if (x.kind === 'gap') { gx.push(x.r); gy.push(i); gt.push(t); gc.push(idx); }
    else { if (x.w) { segx.push(Math.max(x.r - x.w / 2, 0.3), x.r + x.w / 2, null); segy.push(i, i, null); }
      rx.push(x.r); ry.push(i); rt.push(t); rc.push(idx); }
  }));
  if ($('#rd-radii').checked) sids.forEach((sid, i) => { const r = rowOf(sid);
    if (r.R_dust) { dx.push(r.R_dust); dy.push(i); } if (r.R_gas) { qx.push(r.R_gas); qy.push(i); } });
  const tr = [
    { type: 'scatter', mode: 'lines', x: segx, y: segy, name: 'ring (± FWHM/2)', line: { color: 'rgba(59,130,246,.55)', width: 7 }, hoverinfo: 'skip' },
    { type: 'scatter', mode: 'markers', x: rx, y: ry, name: 'ring centre', text: rt, hoverinfo: 'text', customdata: rc, marker: { color: '#1d4ed8', size: 6 } },
    { type: 'scatter', mode: 'markers', x: gx, y: gy, name: 'gap', text: gt, hoverinfo: 'text', customdata: gc, marker: { color: '#ef4444', size: 9, symbol: 'diamond-open', line: { width: 1.6 } } },
    { type: 'scatter', mode: 'lines', x: Gs.sx, y: Gs.sy, name: 'gas ring (± FWHM/2)', line: { color: 'rgba(245,158,11,.5)', width: 4 }, hoverinfo: 'skip' },
    { type: 'scatter', mode: 'markers', x: Gs.rx, y: Gs.ry, name: 'gas ring (line emission)', text: Gs.rt, hoverinfo: 'text', customdata: Gs.rc, marker: { color: '#d97706', size: 5 } },
    { type: 'scatter', mode: 'markers', x: Gs.gx, y: Gs.gy, name: 'gas gap', text: Gs.gt, hoverinfo: 'text', customdata: Gs.gc, marker: { color: '#d97706', size: 7, symbol: 'diamond-open', line: { width: 1.4 } } },
    { type: 'scatter', mode: 'markers', x: dx, y: dy, name: 'R_dust (disk)', hoverinfo: 'x', marker: { color: isDark() ? '#e5e7eb' : '#111827', size: 14, symbol: 'line-ns', line: { width: 2, color: isDark() ? '#e5e7eb' : '#111827' } } },
    { type: 'scatter', mode: 'markers', x: qx, y: qy, name: 'R_gas (CO)', hoverinfo: 'x', marker: { color: '#f59e0b', size: 10, symbol: 'triangle-left', line: { width: 0 } } }];
  const h = Math.max(420, 17 * sids.length + 110);
  $('#plot').style.minHeight = h + 'px';
  Plotly.react('plot', tr, plotLayout({ height: h, margin: { t: 24, r: 10, l: 120 },
    xaxis: { title: 'radius (au)', type: $('#rd-log').checked ? 'log' : 'linear', gridcolor: isDark() ? '#333' : '#eee', side: 'top' },
    yaxis: { tickvals: sids.map((_, i) => i), ticktext: yl, autorange: 'reversed', tickfont: { size: 10 }, gridcolor: 'rgba(0,0,0,0)' } }),
    { responsive: true, displaylogo: false });
  const elp = $('#plot'); if (!elp._bound) { elp.on('plotly_click', ev => { const c = ev.points[0].customdata; if (c != null) openDrawer(c); }); elp._bound = true; }
  $('#p-hint').textContent = `${sids.length} disks · dust: DSHARP, Long+2018, ODISEA III, exoALMA, Bae+2023 · gas (orange, row below): MAPS`;
}
function val(r, c, allowLim) {
  if (r[c] != null) {
    if (allowLim && (c === 'F_mm_mJy' || c === 'F_13_mJy') && r.F_mm_limit) return [r[c], true];
    return [r[c], false];
  }
  if (allowLim && c === 'Mdust_Mearth' && r.Mdust_limit != null) return [r.Mdust_limit, true];
  return [null, false];
}
function renderPlot(sel) {
  if (pm.mode === 'ring') return renderRingScatter(sel);
  if (pm.mode === 'diag') return renderRingDiagram(sel);
  $('#p-hint').textContent = '';
  const X = $('#px').value, Y = $('#py').value, Cc = $('#pc').value, lim = $('#plim').checked;
  const jitter = X === 'region_age' || X === 'region_dist';
  const pts = sel.map(r => {
    const [x, lx] = val(r, X, lim), [y, ly] = val(r, Y, lim);
    if (x == null || y == null) return null;
    const jx = jitter ? x * (1 + 0.12 * (((r.idx * 9301 + 49297) % 233280) / 233280 - 0.5)) : x;
    return { r, x: jx, y, lim: lx || ly };
  }).filter(Boolean);
  const traces = [];
  const TYPE = pts.length > 4000 && !!document.createElement('canvas').getContext('webgl') ? 'scattergl' : 'scatter';
  const hover = p => `${p.r.name}<br>${p.r.region} · class ${p.r.cls}${p.lim ? '<br>(upper limit)' : ''}`;
  if (CATEG.includes(Cc)) {
    const groups = {};
    pts.forEach(p => { const k = String(Cc === 'yso_class' ? p.r.cls : p.r[Cc] ?? '—'); (groups[k] = groups[k] || []).push(p); });
    const keys = Object.keys(groups).sort((a, b) => Cc === 'yso_class' ? CLASSES.indexOf(a) - CLASSES.indexOf(b) : a.localeCompare(b));
    for (const k of keys) for (const isLim of [false, true]) {
      const g = groups[k].filter(p => p.lim === isLim); if (!g.length) continue;
      traces.push({ type: TYPE, mode: 'markers', name: k + (isLim ? ' (limit)' : ''), legendgroup: k, showlegend: !isLim,
        x: g.map(p => p.x), y: g.map(p => p.y), customdata: g.map(p => p.r.idx), text: g.map(hover), hoverinfo: 'text',
        marker: { size: isLim ? 7 : 6, symbol: isLim ? 'triangle-down-open' : 'circle', opacity: isLim ? 0.5 : 0.8,
          color: Cc === 'yso_class' ? CLASS_COL[k] : undefined } });
    }
  } else {
    traces.push({ type: TYPE, mode: 'markers', x: pts.map(p => p.x), y: pts.map(p => p.y), customdata: pts.map(p => p.r.idx),
      text: pts.map(hover), hoverinfo: 'text',
      marker: { size: 6, color: pts.map(p => p.r[Cc]), colorscale: 'Viridis', showscale: true, colorbar: { title: lab(Cc) },
        symbol: pts.map(p => (p.lim ? 'triangle-down-open' : 'circle')) } });
  }
  const dark = isDark();
  Plotly.react('plot', traces, {
    margin: { t: 20, r: 10 }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { color: dark ? '#ddd' : '#222' },
    xaxis: { title: lab(X) + (jitter ? ' (jittered)' : ''), type: $('#lx').checked ? 'log' : 'linear', gridcolor: dark ? '#333' : '#eee' },
    yaxis: { title: lab(Y), type: $('#ly').checked ? 'log' : 'linear', gridcolor: dark ? '#333' : '#eee' },
    legend: { x: 1.01, y: 1 }, annotations: [{ text: `${pts.length} plotted`, xref: 'paper', yref: 'paper', x: 0, y: 1.04, xanchor: 'left', showarrow: false, font: { size: 11 } }],
  }, { responsive: true });
  const el = $('#plot');
  if (!el._bound) { el.on('plotly_click', ev => { const c = ev.points[0].customdata; if (c != null) openDrawer(c); }); el._bound = true; }
}

// ------------------------------------------------------------------ regions / completeness
function renderRegions(sel) {
  const by = {}; sel.forEach(r => (by[r.region] = by[r.region] || []).push(r));
  const regs = regionsSorted.filter(r => by[r]);
  const pct = (g, f) => g.length ? Math.round((100 * g.filter(f).length) / g.length) : 0;
  const metrics = [
    ['mm flux (survey)', r => r.F_mm_mJy != null], ['ALMA any', r => r.alma_n > 0], ['ALMA ≤0.1″', r => r.alma_best_res != null && r.alma_best_res <= 0.1],
    ['JWST imaging', r => r.jwst_n > 0], ['HST imaging', r => r.hst_n > 0], ['SPHERE', r => r.sphere_n > 0]];
  const dark = isDark();
  Plotly.react('regplot', metrics.map(([n, f]) => ({ type: 'bar', name: n, x: regs, y: regs.map(r => pct(by[r], f)) })), {
    barmode: 'group', margin: { t: 10, b: 90 }, yaxis: { title: '% of selection', range: [0, 100] },
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { color: dark ? '#ddd' : '#222' }, legend: { x: 1.01, y: 1 },
  }, { responsive: true });
  const hdr = ['region', 'dist (pc)', 'age (Myr)', 'environment', 'N', ...CLASSES.map(c => 'Cl ' + c), ...metrics.map(m => m[0] + ' %'), 'features'];
  $('#regtbl thead').innerHTML = '<tr>' + hdr.map(h => `<th>${h}</th>`).join('') + '</tr>';
  $('#regtbl tbody').innerHTML = regs.map(r => {
    const g = by[r], R = REG[r] || {}, cc = countBy(g, x => x.cls);
    return `<tr><td><b>${r}</b></td><td class="num">${R.dist_pc ?? ''}</td><td class="num">${R.age_myr ?? ''}</td><td>${R.environment ?? ''}</td>
      <td class="num">${g.length}</td>${CLASSES.map(c => `<td class="num">${cc[c] || ''}</td>`).join('')}
      ${metrics.map(([, f]) => `<td class="num">${pct(g, f)}</td>`).join('')}<td class="num">${g.filter(x => x.feat.length).length}</td></tr>`;
  }).join('');
}

// ------------------------------------------------------------------ sky: all-sky (Hammer) + per-region zoom
const DEG = Math.PI / 180;
const EQ2GAL = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.4448296300, 0.7469822445], [-0.8676661490, -0.1980763734, 0.4559837762]];
function rot(M, lon, lat, inv) {
  const v = [Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG)];
  const w = [0, 1, 2].map(i => [0, 1, 2].reduce((s, j) => s + (inv ? M[j][i] : M[i][j]) * v[j], 0));
  return [((Math.atan2(w[1], w[0]) / DEG) + 360) % 360, Math.asin(Math.max(-1, Math.min(1, w[2]))) / DEG];
}
const toGal = (ra, dec) => rot(EQ2GAL, ra, dec, false), toEq = (l, b) => rot(EQ2GAL, l, b, true);
const SKY = { gal: { lon0: 0 }, gal180: { lon0: 180 }, eq: { lon0: 180 }, eq0: { lon0: 0 } };   // must match FRAMES in 04_build_site.py
function hammer(lon, lat, lon0) {      // east (increasing lon) to the LEFT, as on the sky
  const lam = (((lon - lon0 + 180) % 360) + 360) % 360 - 180, l = lam * DEG, p = lat * DEG;
  const z = Math.sqrt(1 + Math.cos(p) * Math.cos(l / 2));
  return [-2 * Math.SQRT2 * Math.cos(p) * Math.sin(l / 2) / z, Math.SQRT2 * Math.sin(p) / z];
}
function polyline(pts, frame) {        // [[lon,lat],...] in display frame -> x,y with breaks at the wrap
  const x = [], y = []; let prev = null;
  for (const [lo, la] of pts) {
    const q = hammer(lo, la, SKY[frame].lon0);
    if (prev && Math.abs(q[0] - prev[0]) > 1) { x.push(null); y.push(null); }
    x.push(q[0]); y.push(q[1]); prev = q;
  }
  return { x, y };
}
const ageColor = a => { if (a == null) return '#bbbbbb'; const t = Math.min(1, Math.log10(Math.max(a, 0.3) / 0.3) / Math.log10(40));
  const c = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]], k = t * 4, i = Math.min(3, Math.floor(k)), f = k - i;
  return `rgb(${c[i].map((v, j) => Math.round(v + f * (c[i + 1][j] - v))).join(',')})`; };

function regionSummary(sel) {          // centre / radius / metadata for every region present in the data
  const by = {}; sel.forEach(r => (by[r.region] = by[r.region] || []).push(r));
  return regionsSorted.filter(r => r !== 'unassigned' && (by[r] || REG[r])).map(name => {
    const R = REG[name], g = by[name] || [];
    let ra, dec, rad;
    if (R) { ra = R.ra_deg; dec = R.dec_deg; rad = R.radius_deg; }
    else {  // cloud from a catalog (no row in regions.csv): median position
      const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
      ra = med(g.map(r => r.ra)); dec = med(g.map(r => r.dec)); rad = 1;
    }
    return { name, ra, dec, rad, d: R ? R.dist_pc : null, age: R ? R.age_myr : null, env: R ? R.environment : '', n: g.length };
  });
}

function skyControls() {
  const sr = $('#skyreg');
  if (!sr.options.length) {
    sr.innerHTML = '<option value="@gal">All sky — Galactic, centre l = 0°</option><option value="@gal180">All sky — Galactic, centre l = 180° (anticentre)</option>' +
      '<option value="@eq">All sky — Equatorial, centre α = 12h</option><option value="@eq0">All sky — Equatorial, centre α = 0h</option>' +
      regionsSorted.filter(r => REG[r]).map(r => `<option>${r}</option>`).join('');
    sr.onchange = () => { skyBg(); refresh(); };
    ['#skysurv', '#skysrc', '#skyguides'].forEach(s => ($(s).onchange = refresh));
    skyBg();
  }
}
function skyBg(hintOnly) {
  const all = $('#skyreg').value.startsWith('@');
  if (hintOnly) { $('#skyhint').textContent = 'Drag to pan, scroll to zoom, double-click to reset. Click a region label to zoom to it. Colour = age; label = distance · age.'; return; }
  const BGLABEL = { gaia: 'Gaia sky (ESA)', dust: 'Planck dust', optical: 'Mellinger optical', custom: 'custom image' };
  const have = [...new Set(Object.keys(D.allsky || {}).map(k => k.split('_')[0]))];
  const opts = all ? [...have.map(k => [k, BGLABEL[k] || k]), ['', 'none']]
                   : [['', 'none'], ['CDS/P/DSS2/color', 'DSS2 colour (download)'], ['CDS/P/2MASS/color', '2MASS (download)'], ['CDS/P/allWISE/color', 'AllWISE (download)']];
  $('#skysurv').innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  $('#skyhint').textContent = all ? 'Drag to pan, scroll to zoom, double-click to reset. Click a region label to zoom to it. Colour = age; label = distance · age.'
                                  : 'Drag to pan, scroll to zoom. Click a marker for details. East is left.';
}
function renderSky(sel) {
  skyControls();
  const v = $('#skyreg').value;
  return v.startsWith('@') ? renderAllSky(sel, v.slice(1)) : renderRegionSky(sel, v);
}

// all-sky background: CDS hips2fits renders it directly in the AIT (= Hammer-Aitoff) projection, so the
// browser only has to display it (no pixel access -> no CORS needed). With fov = 360 deg across the width
// and square pixels, the image spans x = ±180 deg, y = ±90 deg of the projection plane, i.e. ±pi, ±pi/2
// in the units used by hammer() below (radians); the sky ellipse fills the central 2*sqrt(2) x sqrt(2).
// alasky's https certificate is currently rejected by browsers -> try mirrors, then plain http
// (public sky images only, nothing private is sent)
const HIPS2FITS_HOSTS = ['https://alasky.cds.unistra.fr', 'https://alaskybis.cds.unistra.fr', 'http://alasky.cds.unistra.fr', 'http://alaskybis.cds.unistra.fr'];
const imgOK = url => new Promise(res => { const im = new Image(); const t = setTimeout(() => res(false), 20000);
  im.onload = () => { clearTimeout(t); res(true); }; im.onerror = () => { clearTimeout(t); res(false); }; im.src = url; });
let goodHost = null;
const SKYVIEW_SURVEY = { 'CDS/P/DSS2/color': 'DSS2 Red', 'CDS/P/2MASS/color': '2MASS-K', 'CDS/P/allWISE/color': 'WISE 12' };
async function firstLoadable(query) {           // query = URLSearchParams string for hips2fits
  for (const h of goodHost ? [goodHost, ...HIPS2FITS_HOSTS.filter(x => x !== goodHost)] : HIPS2FITS_HOSTS) {
    const url = `${h}/hips-image-services/hips2fits?${query}`;
    if (await imgOK(url)) { goodHost = h; return url; }
  }
  const q = Object.fromEntries(new URLSearchParams(query));   // last resort: NASA SkyView (slower)
  const sv = 'https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?' + new URLSearchParams({
    Position: `${q.ra},${q.dec}`, Coordinates: 'J2000', Survey: SKYVIEW_SURVEY[q.hips] || 'DSS2 Red', Projection: 'Tan',
    Pixels: '800', Size: q.fov, Scaling: 'Log', Return: 'JPEG' });
  return (await imgOK(sv)) ? sv : null;
}
const ALLSKY_HIPS = { dust: ['CDS/P/PLANCK/R2/HFI/color', 'CDS/P/IRIS/color'], optical: ['CDS/P/Mellinger/color', 'CDS/P/DSS2/color'] };
const bgCache = {};
function allskyQuery(hips, frame) {
  return new URLSearchParams({ hips, width: 2000, height: 1000, fov: 360, projection: 'AIT',
    coordsys: frame.startsWith('gal') ? 'galactic' : 'icrs', ra: SKY[frame].lon0, dec: 0, format: 'jpg' }).toString();
}
const allskyURL = (hips, frame) => `http://alasky.cds.unistra.fr/hips-image-services/hips2fits?${allskyQuery(hips, frame)}`;
function allskyBg(bg, frame) {
  const f = (D.allsky || {})[`${bg}_${frame}`];
  return f ? Promise.resolve(f) : Promise.reject(new Error('not built yet: run  python 04_build_site.py --allsky'));
}

function renderAllSky(sel, frame) {
  const L0 = SKY[frame].lon0, dark = isDark();
  const isGal = frame.startsWith('gal');
  const P = (ra, dec) => (isGal ? hammer(...toGal(ra, dec), L0) : hammer(ra, dec, L0));
  const traces = [];
  const grid = { type: 'scatter', mode: 'lines', hoverinfo: 'skip', showlegend: false, line: { color: 'rgba(160,160,160,.45)', width: 0.7 } };
  // graticule + outline
  const gx = [], gy = [];
  for (let lo = 0; lo < 360; lo += 30) { const q = polyline(Array.from({ length: 61 }, (_, i) => [lo + 1e-6, -90 + 3 * i]), frame); gx.push(...q.x, null); gy.push(...q.y, null); }
  for (let la = -60; la <= 60; la += 30) { const q = polyline(Array.from({ length: 121 }, (_, i) => [L0 - 179.999 + 3 * i, la]), frame); gx.push(...q.x, null); gy.push(...q.y, null); }
  for (const s of [-1, 1]) { const q = polyline(Array.from({ length: 61 }, (_, i) => [L0 + s * 179.999, -90 + 3 * i]), frame); gx.push(...q.x, null); gy.push(...q.y, null); }
  traces.push({ ...grid, x: gx, y: gy });
  if ($('#skyguides').checked) {
    const other = isGal
      ? { pts: Array.from({ length: 361 }, (_, i) => toGal(i, 0)), name: 'celestial equator' }
      : { pts: Array.from({ length: 361 }, (_, i) => toEq(i, 0)), name: 'Galactic plane' };
    const q1 = polyline(other.pts, frame);
    traces.push({ type: 'scatter', mode: 'lines', x: q1.x, y: q1.y, name: other.name, hoverinfo: 'name', line: { color: '#9ad', width: 1.2, dash: 'dot' } });
    const alma = Array.from({ length: 361 }, (_, i) => (isGal ? toGal(i, 40) : [i, 40]));
    const q2 = polyline(alma, frame);
    traces.push({ type: 'scatter', mode: 'lines', x: q2.x, y: q2.y, name: 'δ = +40° (ALMA practical north limit)', hoverinfo: 'name', line: { color: '#e76f51', width: 1.4, dash: 'dash' } });
  }
  if ($('#skysrc').checked) {
    const groups = {};
    sel.forEach(r => (groups[r.cls] = groups[r.cls] || []).push(r));
    const type = sel.length > 4000 && !!document.createElement('canvas').getContext('webgl') ? 'scattergl' : 'scatter';
    CLASSES.filter(c => groups[c]).forEach(c => {
      const xy = groups[c].map(r => P(r.ra, r.dec));
      traces.push({ type, mode: 'markers', name: 'Class ' + c, x: xy.map(q => q[0]), y: xy.map(q => q[1]),
        customdata: groups[c].map(r => r.idx), text: groups[c].map(r => `${r.name} (${r.region})`), hoverinfo: 'text',
        marker: { size: 3, color: CLASS_COL[c], opacity: 0.7 } });
    });
  }
  // regions: outline circle + labelled marker coloured by age
  const regs = regionSummary(sel), ann = [];
  window._skyRegs = regs; window._skyAnn = [];
  regs.forEach(R => {
    const ring = Array.from({ length: 49 }, (_, i) => {   // small circle of radius R.rad around the centre
      const t = (i / 48) * 2 * Math.PI, d = R.dec * DEG, r = R.rad * DEG;
      const dec2 = Math.asin(Math.sin(d) * Math.cos(r) + Math.cos(d) * Math.sin(r) * Math.cos(t));
      const ra2 = R.ra * DEG + Math.atan2(Math.sin(t) * Math.sin(r) * Math.cos(d), Math.cos(r) - Math.sin(d) * Math.sin(dec2));
      return P(ra2 / DEG, dec2 / DEG);
    });
    const fin = ring.filter(q => isFinite(q[0]));
    const span = Math.max(...fin.map(q => q[0])) - Math.min(...fin.map(q => q[0]));
    const ctr = P(R.ra, R.dec), half = span > 1 ? R.rad * DEG * 1.3 : Math.max(span, Math.max(...fin.map(q => q[1])) - Math.min(...fin.map(q => q[1]))) / 2;
    window._skyBox = window._skyBox || {};
    window._skyBox[R.name] = [ctr[0], ctr[1], Math.max(half * 1.4, 0.06)];
    const rx = [], ry = [];
    ring.forEach((q, i) => { if (i && Math.abs(q[0] - ring[i - 1][0]) > 1) { rx.push(null); ry.push(null); } rx.push(q[0]); ry.push(q[1]); });
    traces.push({ type: 'scatter', mode: 'lines', x: rx, y: ry, hoverinfo: 'skip', showlegend: false,
      line: { color: ageColor(R.age), width: 1.5 } });
  });
  const el0 = $('#sky'), pxPerUnit = Math.max(300, (el0.clientWidth || 1200)) / (4 * Math.SQRT2 * 1.04);
  const placed = [];
  const OFFS = [[0, -28], [0, 30], [-70, -22], [70, -22], [-70, 24], [70, 24], [0, -60], [0, 62], [-120, 0], [120, 0]];
  regs.filter(R => !(REG[R.name] && REG[R.name].parent) && R.name !== 'Orion (outskirts)')
    .sort((a, b) => (b.n - a.n))                       // big regions get first choice of position
    .forEach(R => {
      const c = P(R.ra, R.dec), cx = c[0] * pxPerUnit, cy = -c[1] * pxPerUnit;
      const text = `<b>${R.name}</b>` + (R.d ? `<br>${R.d} pc · ${R.age} Myr` : '');
      const w = 7 * Math.max(R.name.length, R.d ? 15 : 0) + 10, h = R.d ? 34 : 20;
      let best = OFFS[0];
      for (const o of OFFS) {
        const bx = cx + o[0], by = cy + o[1];
        if (!placed.some(p => Math.abs(p[0] - bx) < (p[2] + w) / 2 && Math.abs(p[1] - by) < (p[3] + h) / 2)) { best = o; break; }
      }
      placed.push([cx + best[0], cy + best[1], w, h]);
      ann.push({ x: c[0], y: c[1], text, showarrow: true, arrowhead: 0, arrowcolor: ageColor(R.age), ax: best[0], ay: best[1],
        font: { size: 10, color: dark ? '#eee' : '#111' }, bgcolor: dark ? 'rgba(20,20,25,.75)' : 'rgba(255,255,255,.8)',
        bordercolor: ageColor(R.age), borderpad: 2, captureevents: true, _region: R.name });
    });
  window._skyAnn = ann.map(a => a._region); ann.forEach(a => delete a._region);
  const ages = regs.filter(R => R.age != null);
  traces.push({ type: 'scatter', mode: 'markers', x: regs.map(R => P(R.ra, R.dec)[0]), y: regs.map(R => P(R.ra, R.dec)[1]), name: 'regions',
    customdata: regs.map(R => '@' + R.name), showlegend: false,
    text: regs.map(R => `<b>${R.name}</b><br>${R.d ? R.d + ' pc' : 'distance ?'} · ${R.age != null ? R.age + ' Myr' : 'age ?'}<br>${R.env || ''}<br>${R.n} sources in selection<br><i>click to zoom · detailed view in the 'view' menu</i>`), hoverinfo: 'text',
    marker: { size: 11, color: regs.map(R => R.age ?? null), colorscale: 'Viridis', cmin: Math.log10(0.3), cmax: Math.log10(12),
      line: { color: '#fff', width: 1 }, showscale: !!ages.length,
      colorbar: { title: 'age (Myr)', tickvals: [0.5, 1, 2, 5, 10].map(Math.log10), ticktext: ['0.5', '1', '2', '5', '10'], len: 0.6 } } });
  traces[traces.length - 1].marker.color = regs.map(R => (R.age != null ? Math.log10(R.age) : null));
  const bg = $('#skysurv').value;
  const W = 2 * Math.SQRT2, H = Math.SQRT2;
  const imgSpec = src => [{ source: src, xref: 'x', yref: 'y', x: -Math.PI, y: Math.PI / 2, sizex: 2 * Math.PI, sizey: Math.PI, xanchor: 'left', yanchor: 'top', sizing: 'stretch', layer: 'below' }];
  Plotly.react('sky', traces, {
    images: [], annotations: ann, margin: { t: 10, r: 10, l: 10, b: 10 }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: dark ? '#ddd' : '#222' }, legend: { x: 0, y: 0, bgcolor: 'rgba(255,255,255,.75)' }, hovermode: 'closest',
    xaxis: { range: [-W * 1.02, W * 1.02], visible: false, constrain: 'range' },
    yaxis: { range: [-H * 1.04, H * 1.04], visible: false, scaleanchor: 'x', constrain: 'range' },
    dragmode: 'pan', uirevision: frame,
  }, { responsive: true, scrollZoom: true, doubleClick: 'reset' });
  if (bg) {
    const want = `${$('#skyreg').value}|${bg}`;
    $('#skyhint').textContent = 'Loading background…';
    allskyBg(bg, frame).then(url => {
      if (`${$('#skyreg').value}|${$('#skysurv').value}` !== want) return;      // user moved on
      Plotly.relayout('sky', { images: imgSpec(url) });
      skyBg(true);
    }).catch(e => { $('#skyhint').textContent = `Background ${e.message}. The map works without it.`; });
  }
  bindSky();
}

function renderRegionSky(sel, name) {
  const R = REG[name], fov = Math.min(R.radius_deg * 2.2, 60), h = fov / 2;
  const tan = (ra, dec) => {             // gnomonic offsets (deg), east positive
    const d = dec * DEG, d0 = R.dec_deg * DEG, da = (ra - R.ra_deg) * DEG;
    const c = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(da);
    return c <= 0 ? null : [Math.cos(d) * Math.sin(da) / c / DEG, (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(da)) / c / DEG];
  };
  const groups = {};
  if ($('#skysrc').checked) for (const r of sel) {
    const p = tan(r.ra, r.dec);
    if (!p || Math.abs(p[0]) > h || Math.abs(p[1]) > h) continue;
    (groups[r.cls] = groups[r.cls] || []).push([-p[0], p[1], r]);
  }
  const traces = CLASSES.filter(c => groups[c]).map(c => ({
    type: 'scatter', mode: 'markers', name: 'Class ' + c, x: groups[c].map(g => g[0]), y: groups[c].map(g => g[1]),
    customdata: groups[c].map(g => g[2].idx), text: groups[c].map(g => `${g[2].name}<br>class ${c} · ${g[2].region}`), hoverinfo: 'text',
    marker: { size: 7, color: CLASS_COL[c], line: { width: 1, color: '#fff' } } }));
  const hips = $('#skysurv').value, dark = isDark();
  const query = new URLSearchParams({ hips, width: 1000, height: 1000, fov: fov.toFixed(4), projection: 'TAN', coordsys: 'icrs',
    ra: R.ra_deg, dec: R.dec_deg, format: 'jpg' }).toString();
  const img = [];
  if (hips) {
    const want = `${name}|${hips}`;
    $('#skyhint').textContent = 'Loading background…';
    firstLoadable(query).then(url => {
      if (`${$('#skyreg').value}|${$('#skysurv').value}` !== want) return;
      if (!url) { $('#skyhint').textContent = 'Background could not be loaded from CDS; markers still work.'; return; }
      Plotly.relayout('sky', { images: [{ source: url, xref: 'x', yref: 'y', x: -h, y: h, sizex: fov, sizey: fov, xanchor: 'left', yanchor: 'top', sizing: 'stretch', layer: 'below' }] });
      $('#skyhint').textContent = 'Click a marker for details. East is left.';
    });
  }
  Plotly.react('sky', traces, {
    images: img, margin: { t: 30, r: 10 }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: hips ? '#000' : 'rgba(0,0,0,0)',
    font: { color: dark ? '#ddd' : '#222' }, legend: { x: 1.01, y: 1 }, annotations: [{ text: `<b>${name}</b> — ${R.dist_pc} pc · ${R.age_myr} Myr (${R.age_range_myr}) · ${R.environment}`,
      xref: 'paper', yref: 'paper', x: 0, y: 1.04, xanchor: 'left', showarrow: false }],
    xaxis: { title: 'Δα cos δ (deg, east ←)', range: [-h, h], constrain: 'range', zeroline: false, showgrid: false },
    yaxis: { title: 'Δδ (deg)', range: [-h, h], scaleanchor: 'x', constrain: 'range', zeroline: false, showgrid: false },
    dragmode: 'pan', uirevision: name,
  }, { responsive: true, scrollZoom: true, doubleClick: 'reset' });
  bindSky();
}
function bindSky() {
  const el = $('#sky');
  if (el._bound) return;
  el._bound = true;
  const zoomTo = name => {
    const b = (window._skyBox || {})[name];
    if (!b || !$('#skyreg').value.startsWith('@')) return;
    const [x, y, h] = b, el2 = $('#sky'), asp = (el2.clientWidth || 1200) / (el2.clientHeight || 600);
    Plotly.relayout('sky', { 'xaxis.range': [x - h * asp, x + h * asp], 'yaxis.range': [y - h, y + h] });
  };
  el.on('plotly_click', ev => {
    const cd = ev.points[0].customdata;
    if (typeof cd === 'string' && cd.startsWith('@')) zoomTo(cd.slice(1)); else if (cd != null) openDrawer(cd);
  });
  el.on('plotly_clickannotation', ev => zoomTo(window._skyAnn[ev.index]));
}

// ------------------------------------------------------------------ gallery (one card per source, like the debris gallery)
const SLOTS = [
  { k: 'mm', label: 'mm continuum', tr: ['mm continuum', 'cm continuum'], cls: 't-mm', empty: 'no mm image' },
  { k: 'gas', label: 'gas / lines', tr: ['CO isotopologue', 'other line'], cls: 't-gas', empty: 'no line map' },
  { k: 'sca', label: 'scattered light / IR', tr: ['scattered light', 'IR/optical'], cls: 't-sca', empty: 'no scattered light' },
];
const TRCLS = t => (SLOTS.find(s => s.tr.includes(t)) || { cls: 't-oth' }).cls;
const SID2ROW = Object.fromEntries(ROWS.map(r => [r.source_id, r]));
const IMGS = {};
Object.entries(D.images || {}).forEach(([sid, list]) => (IMGS[sid] = list));
const gs = { hide: new Set(), mode: 'cards' };
const shortRef = ref => { const m = String(ref || '').match(/^([^,]+?)(?: et al\.| & [^,]+)?,?\s+(\d{4})/);
  return m ? `${m[1].trim().split(' ').pop()}+${m[2]}` : String(ref || '').slice(0, 18); };
const isDark = () => document.body.classList.contains('dark');

function initGallery() {
  const cnt = {}; Object.values(IMGS).flat().forEach(x => { const s = SLOTS.find(s => s.tr.includes(x.tracer)); cnt[s ? s.k : 'aux'] = (cnt[s ? s.k : 'aux'] || 0) + 1; });
  $('#g-slots').innerHTML = SLOTS.map(s => `<label class="pill pdot ${s.cls}"><input type="checkbox" value="${s.k}" checked><span>${s.label} <span class="n">${cnt[s.k] || 0}</span></span></label>`).join('')
    + `<label class="pill pdot t-oth"><input type="checkbox" value="aux" checked><span>more images</span></label>`;
  $('#g-slots').onchange = e => { const k = e.target.value; e.target.checked ? gs.hide.delete(k) : gs.hide.add(k);
    ['mm', 'gas', 'sca', 'aux'].forEach(s => $('#gallery').classList.toggle('hide-' + s, gs.hide.has(s))); slotVars(); };
  ['#g-sort', '#g-byregion', '#g-reqall', '#g-names'].forEach(s => ($(s).onchange = refresh));
  $('#g-cols').oninput = refresh;
  $('#g-slots').addEventListener('change', () => { if (gs.mode === 'wave') refresh(); });
  $('#g-mode').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#g-mode button').forEach(x => x.classList.toggle('on', x === b));
    gs.mode = b.dataset.m; $('#tab-gallery').classList.toggle('wave', gs.mode === 'wave'); refresh(); };
  $('#g-size').oninput = () => document.documentElement.style.setProperty('--s', $('#g-size').value + 'px');
  try { $('#g-zoom').checked = localStorage.getItem('yso-zoom') === '1'; } catch (e) {}   // default off; remembered
  $('#g-zoom').onchange = () => { document.body.classList.toggle('zoom', $('#g-zoom').checked);
    try { localStorage.setItem('yso-zoom', $('#g-zoom').checked ? '1' : '0'); } catch (e) {} };
  document.body.classList.toggle('zoom', $('#g-zoom').checked);
  $('#gallery').onclick = e => {                 // anywhere on a card or tile opens the details; an image also gets highlighted there
    if (e.target.closest('a')) return;
    const im = e.target.closest('figure, .wt'), card = e.target.closest('.card'), sid = (im && im.dataset.sid) || (card && card.dataset.sid);
    if (!sid || !SID2ROW[sid]) return;
    openDrawer(SID2ROW[sid].idx, im && im.dataset.k != null ? +im.dataset.k : undefined);
  };
}
// image order: papers.csv priority (DSHARP 5 > exoALMA/MAPS 4 > targeted high-res 3 > targeted 2 > survey 1), then tracer, then the newer paper
const imgYear = x => +((String(x.ref || '').match(/(19|20)\d\d/) || [0])[0]);
const imgPri = (a, b) => +(b.priority || 2) - +(a.priority || 2);
const imgRank = (a, b) => imgPri(a, b) || (imgYear(b) - imgYear(a));
function bestImg(sid, slot, used) {
  // headline image: highest-resolution source first (papers.csv 'priority': DSHARP/long baselines > targeted > survey snapshot),
  // then the most square single-disk panel
  const list = IMGS[sid] || [], sq = x => Math.abs(Math.log(x.aspect || 1));
  const c = list.map((x, i) => [x, i]).filter(([x, i]) => !(used && used.has(i)) && slot.tr.includes(x.tracer)).sort((a, b) => imgPri(a[0], b[0])
    || (slot.tr.indexOf(a[0].tracer) - slot.tr.indexOf(b[0].tracer))      // within a tier: CO before other lines, mm before cm
    || (imgYear(b[0]) - imgYear(a[0])) || (Math.abs(sq(a[0]) - sq(b[0])) < 0.05 ? 0 : sq(a[0]) - sq(b[0])));   // near-equal shapes: keep paper order
  return c.length ? c[0] : null;
}
function renderWave(list) {
  const shown = SLOTS.filter(sl => !gs.hide.has(sl.k)), T = +$('#g-cols').value;
  let L = list.filter(r => shown.some(sl => bestImg(r.source_id, sl)));
  if ($('#g-reqall').checked) L = L.filter(r => shown.every(sl => bestImg(r.source_id, sl)));
  $('#gallery').classList.toggle('nolab', !$('#g-names').checked);
  $('#gallery').innerHTML = shown.length ? `<div class="wgrids" style="grid-template-columns:repeat(${shown.length},minmax(0,1fr))">${shown.map(sl => {
    const n = L.filter(r => bestImg(r.source_id, sl)).length;
    return `<div class="wcol ${sl.cls}"><h3><i></i>${sl.label}<span>${n} of ${L.length} disks</span></h3><div class="wg" style="grid-template-columns:repeat(auto-fill,minmax(${T}px,1fr))">${L.map(r => {
      const b = bestImg(r.source_id, sl);
      return b ? `<div class="wt" data-sid="${r.source_id}" data-k="${b[1]}" title="${r.name} — ${(b[0].label || '').replace(/"/g, '')} (${shortRef(b[0].ref)})"><img loading="lazy" src="${b[0].file}"><b>${r.name}</b></div>`
               : `<div class="wt blank" data-sid="${r.source_id}" title="${r.name}: no ${sl.label} image — click for details"><b>${r.name}</b></div>`; }).join('')}</div></div>`; }).join('')}</div>`
    : '<p class="hint">Select at least one wavelength.</p>';
  $('#g-count').textContent = `${L.length} disks`;
}
function slotVars() {
  const g = $('#gallery');
  g.style.setProperty('--n', ['mm', 'gas', 'sca'].filter(k => !gs.hide.has(k)).length);
  g.style.setProperty('--aux', gs.hide.has('aux') ? 0 : 1);
}
function figHTML(sid, x, k, aux) {
  return `<figure class="${aux ? 'ax' : 'im'} ${TRCLS(x.tracer)}" data-sid="${sid}" data-k="${k}">
    <img loading="lazy" src="${x.file}" title="${(x.label || '').replace(/"/g, '')} — ${x.ref} ${x.figure || ''}">
    <figcaption><i class="dot"></i>${aux ? shortRef(x.ref) : `${shortRef(x.ref)} · ${(x.label || '').split(/[,(:]/)[0]}`}</figcaption></figure>`;
}
function cardHTML(r) {
  const list = IMGS[r.source_id] || [], used = new Set();
  const slots = SLOTS.map(s => {
    const best = bestImg(r.source_id, s, used), k = best ? best[1] : -1;     // prefer square single-disk panels
    if (k < 0) return `<div class="slot s-${s.k}"><div class="ph">${s.empty}</div></div>`;
    used.add(k); return `<div class="slot s-${s.k}">${figHTML(r.source_id, list[k], k)}</div>`;
  }).join('');
  const rest = list.map((x, i) => [x, i]).filter(([, i]) => !used.has(i)), more = rest.length - 4;
  const aux = `<div class="slot s-aux aux">${rest.slice(0, 4).map(([x, i], j) => figHTML(r.source_id, x, i, true)
    .replace('</figure>', j === 3 && more > 0 ? `<span class="more" data-i="${r.idx}">+${more}</span></figure>` : '</figure>')).join('')}</div>`;
  const R = REG[r.region] || {};
  const chips = [r.spt && `<span class="chip">${r.spt}</span>`,
    r.Mdust_Mearth != null && `<span class="chip" title="dust mass">${fmtNum(r.Mdust_Mearth)} M⊕</span>`,
    r.alma_best_res != null && `<span class="chip" title="best ALMA resolution in the archive">ALMA ${fmtNum(r.alma_best_res)}″</span>`,
    ...r.prog.map(p => `<span class="chip prog">${p}</span>`)].filter(Boolean).join('');
  const flag = r.feat.find(f => /streamer|infall/.test(f));
  return `<article class="card" data-sid="${r.source_id}"><div class="ch">
      <div class="nm" data-i="${r.idx}" title="open details"><b>${r.name}</b>${r.yso_class ? `<span class="cls c${r.cls === '?' ? 'X' : r.cls}">${r.cls}</span>` : ''}${flag ? `<span class="flag">${flag}</span>` : ''}</div>
      <div class="al">${r.region}${R.dist_pc ? ` · ${R.dist_pc} pc · ${R.age_myr} Myr` : ''}</div>
      <div class="chips">${chips}</div></div>
    <div class="row">${slots}${aux}</div></article>`;
}
function renderGallery(sel) {
  const withImg = sel.filter(r => (IMGS[r.source_id] || []).length);
  const srt = $('#g-sort').value, CI = c => CLASSES.indexOf(c);
  const key = { images: r => -(IMGS[r.source_id] || []).length, name: r => r.name.toLowerCase(), age: r => r.region_age ?? 99,
    mdust: r => -(r.Mdust_Mearth ?? -1), class: r => CI(r.cls), region: r => r.region }[srt];
  withImg.sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name); });
  if (gs.mode === 'wave') return renderWave(withImg);
  $('#gallery').classList.remove('nolab');
  let html;
  if ($('#g-byregion').checked) {
    const g = {}; withImg.forEach(r => (g[r.region] = g[r.region] || []).push(r));
    html = regionsSorted.filter(k => g[k]).map(k => { const R = REG[k] || {};
      return `<h4>${k} ${R.dist_pc ? `· ${R.dist_pc} pc · ${R.age_myr} Myr` : ''} <span class="n">(${g[k].length})</span></h4><div class="grid">${g[k].map(cardHTML).join('')}</div>`; }).join('');
  } else html = `<div class="grid">${withImg.map(cardHTML).join('')}</div>`;
  $('#gallery').innerHTML = withImg.length ? html : '<p class="hint">No images for the current selection. Images come from config/image_crops.csv and images/manual/ (scripts/05_images.py).</p>';
  ['mm', 'gas', 'sca', 'aux'].forEach(s => $('#gallery').classList.toggle('hide-' + s, gs.hide.has(s))); slotVars();
  $('#g-count').textContent = `${withImg.length} sources · ${withImg.reduce((n, r) => n + IMGS[r.source_id].length, 0)} images`;
}
let LBS = null;
document.addEventListener('keydown', e => {
  if (!$('#lb').classList.contains('on') || !LBS) return;
  const n = (IMGS[LBS.sid] || []).length;
  if (e.key === 'ArrowRight') openLightbox(LBS.sid, (LBS.k + 1) % n);
  if (e.key === 'ArrowLeft') openLightbox(LBS.sid, (LBS.k - 1 + n) % n);
  if (e.key === 'Escape') $('#lb').classList.remove('on');
});
function openLightbox(sid, k) {
  LBS = { sid, k };
  const x = (IMGS[sid] || [])[k], r = SID2ROW[sid]; if (!x) return;
  $('#lb-img').src = x.full || x.file;
  $('#lb-cap').innerHTML = `<b>${r ? r.name : x.source}</b> — ${x.label || ''}<br>${x.doi ? `<a target="_blank" href="https://doi.org/${x.doi}">${x.ref}</a>` : x.ref || ''} ${x.figure || ''}
    ${r ? ` · <a href="#" id="lb-open">source details</a>` : ''}<br><span style="opacity:.6">image ${k + 1} of ${(IMGS[sid] || []).length} · ← → to browse · Esc to close</span>`;
  $('#lb').classList.add('on');
  const o = $('#lb-open'); if (o) o.onclick = e => { e.preventDefault(); e.stopPropagation(); $('#lb').classList.remove('on'); openDrawer(r.idx); };
}
$('#lb').onclick = e => { if (!e.target.closest('a')) $('#lb').classList.remove('on'); };

// ------------------------------------------------------------------ programs: who observed what, where
const PALETTE = ['#4f46e5', '#e11d48', '#059669', '#d97706', '#0891b2', '#7c3aed', '#db2777', '#65a30d', '#ea580c', '#2563eb', '#0d9488', '#9333ea', '#ca8a04', '#475569'];
const PSYM = ['circle', 'square', 'diamond', 'triangle-up', 'triangle-down', 'star', 'hexagon', 'cross', 'x', 'pentagon', 'circle-open', 'square-open', 'diamond-open', 'star-open'];
const PROG = {};   // fac -> code -> {fac, code, pi, years, sids:Set, res:{sid:best}}
Object.entries(D.obs || {}).forEach(([sid, list]) => list.forEach(o => {
  const fac = o[0], code = String(o[2]);
  const p = ((PROG[fac] = PROG[fac] || {})[code] = PROG[fac][code] || { fac, code, pi: o[8] || '', years: new Set(), sids: new Set(), res: {} });
  p.sids.add(sid); if (o[7]) p.years.add(o[7]);
  if (o[4] != null) p.res[sid] = Math.min(p.res[sid] ?? 1e9, o[4]);
}));
const PNAME = D.programs || {};   // 'FAC|code' -> {name, focus, reference}
const pst = { fac: 'ALMA', sel: null };
function progLabel(p) { const n = PNAME[`${p.fac}|${p.code}`]; return n ? n.name : `${p.pi ? p.pi.split(',')[0] : '?'} ${[...p.years].sort()[0] || ''}`; }
function progList(selIds) {
  const all = Object.values(PROG[pst.fac] || {});
  const named = all.filter(p => PNAME[`${p.fac}|${p.code}`] || (p.fac === 'ALMA' && p.code.endsWith('.L')));
  const base = $('#p-list').value === 'named' && named.length ? named : all;
  return base.map(p => ({ p, n: [...p.sids].filter(s => selIds.has(s)).length })).filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n).slice(0, $('#p-list').value === 'named' && named.length ? 60 : 24);
}
function initPrograms() {
  $('#p-fac').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#p-fac button').forEach(x => x.classList.toggle('on', x === b)); pst.fac = b.dataset.f; pst.sel = null; refresh(); };
  $('#p-list').onchange = () => { pst.sel = null; refresh(); };
  $('#p-frame').onchange = refresh;
  $('#p-cards').onclick = e => { const c = e.target.closest('.pc'); if (!c) return;
    const k = c.dataset.k; pst.sel.has(k) ? pst.sel.delete(k) : pst.sel.add(k); refresh(); };
}
function renderPrograms(sel) {
  const ids = new Set(sel.map(r => r.source_id));
  const yr = p => (/^\d{4}\./.test(p.code) ? +p.code.slice(0, 4) : Math.min(...[...p.years, 9999]));
  const items = progList(ids).sort((a, b) => yr(a.p) - yr(b.p) || b.n - a.n);           // oldest program first
  if (!pst.sel) {
    const DEF = ['DSHARP', 'MAPS', 'exoALMA', 'DECO', 'AGE-PRO'];
    const d = pst.fac === 'ALMA' ? items.filter(x => DEF.includes(progLabel(x.p))) : [];
    pst.sel = new Set((d.length ? d : items.slice(0, 8)).map(x => x.p.code));
  }
  const color = {}; items.forEach((x, i) => (color[x.p.code] = PALETTE[i % PALETTE.length]));
  const mixBar = sids => { const c = countBy(sids.map(s => SID2ROW[s]).filter(Boolean), r => r.cls), n = sids.length || 1;
    return CLASSES.map(k => c[k] ? `<i style="width:${100 * c[k] / n}%;background:${getComputedStyle(document.body).getPropertyValue('--c' + (k === '?' ? 'X' : k))}" title="Class ${k}: ${c[k]}"></i>` : '').join(''); };
  $('#p-cards').innerHTML = items.map(({ p, n }) => { const nm = PNAME[`${p.fac}|${p.code}`] || {}, yrs = [...p.years].sort();
    const sids = [...p.sids].filter(s => ids.has(s));
    return `<div class="pc ${pst.sel.has(p.code) ? '' : 'off'}" data-k="${p.code}" style="--pc:${color[p.code]}">
      <div class="t"><b>${progLabel(p)}</b><span class="k">${n} sources</span></div>
      ${nm.category ? `<span class="chip ${nm.category === 'disks' ? 'prog' : ''}">${nm.category}</span>` : ''}
      <div class="k">${p.code} · PI ${p.pi || '?'} · ${yrs[0] || ''}${yrs.length > 1 ? '–' + yrs[yrs.length - 1] : ''}</div>
      ${nm.focus ? `<div class="f">${nm.focus}${nm.reference ? ` — <i>${nm.reference}</i>` : ''}</div>` : ''}<div class="mix">${mixBar(sids)}</div></div>`; }).join('')
    || '<p class="hint">No programs for this facility in the current selection.</p>';
  const chosen = items.filter(x => pst.sel.has(x.p.code));
  const font = { color: isDark() ? '#e5e7eb' : '#111827', size: 11 }, transparent = { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)' };
  // --- sky map
  const frame = $('#p-frame').value, L0 = SKY[frame].lon0, isGal = frame.startsWith('gal');
  const P = (ra, dec) => (isGal ? hammer(...toGal(ra, dec), L0) : hammer(ra, dec, L0));
  const gx = [], gy = [];
  for (let lo = 0; lo < 360; lo += 30) { const q = polyline(Array.from({ length: 61 }, (_, i) => [lo + 1e-6, -90 + 3 * i]), frame); gx.push(...q.x, null); gy.push(...q.y, null); }
  for (let la = -60; la <= 60; la += 30) { const q = polyline(Array.from({ length: 121 }, (_, i) => [L0 - 179.999 + 3 * i, la]), frame); gx.push(...q.x, null); gy.push(...q.y, null); }
  for (const s of [-1, 1]) { const q = polyline(Array.from({ length: 61 }, (_, i) => [L0 + s * 179.999, -90 + 3 * i]), frame); gx.push(...q.x, null); gy.push(...q.y, null); }
  const tr = [{ type: 'scatter', mode: 'lines', x: gx, y: gy, hoverinfo: 'skip', showlegend: false, line: { color: 'rgba(160,160,160,.45)', width: 0.7 } }];
  const regs = regionSummary(sel).filter(R => !(REG[R.name] && REG[R.name].parent));
  const rc = regs.map(R => P(R.ra, R.dec));
  tr.push({ type: 'scatter', mode: 'text', x: rc.map(q => q[0]), y: rc.map(q => q[1] + 0.07), text: regs.map(R => R.name), hoverinfo: 'skip', showlegend: false,
    textfont: { size: 10, color: isDark() || D.allsky?.[`gaia_${frame}`] ? 'rgba(255,255,255,.75)' : 'rgba(60,60,60,.7)' } });
  chosen.forEach(({ p }, i) => { const pts = [...p.sids].filter(s => ids.has(s)).map(s => SID2ROW[s]).filter(Boolean);
    const xy = pts.map(r => P(r.ra, r.dec));
    tr.push({ type: 'scatter', mode: 'markers', name: progLabel(p), x: xy.map(q => q[0]), y: xy.map(q => q[1]), customdata: pts.map(r => r.idx),
      text: pts.map(r => `${r.name}<br>${progLabel(p)} · ${r.region}`), hoverinfo: 'text',
      marker: { size: 8, color: color[p.code], symbol: PSYM[i % PSYM.length], line: { color: '#fff', width: 0.6 }, opacity: 0.9 } }); });
  const W = 2 * Math.SQRT2, H = Math.SQRT2, bg = D.allsky?.[`gaia_${frame}`];
  Plotly.react('p-sky', tr, { ...transparent, font, margin: { t: 6, b: 6, l: 6, r: 6 }, dragmode: 'pan', hovermode: 'closest', uirevision: frame,
    images: bg ? [{ source: bg, xref: 'x', yref: 'y', x: -Math.PI, y: Math.PI / 2, sizex: 2 * Math.PI, sizey: Math.PI, xanchor: 'left', yanchor: 'top', sizing: 'stretch', layer: 'below', opacity: 0.85 }] : [],
    legend: { orientation: 'h', y: -0.02, font: { size: 10 } },
    xaxis: { range: [-W * 1.02, W * 1.02], visible: false }, yaxis: { range: [-H * 1.04, H * 1.04], visible: false, scaleanchor: 'x' } },
    { responsive: true, scrollZoom: true, displaylogo: false });
  const el = $('#p-sky'); if (!el._b) { el.on('plotly_click', ev => { const c = ev.points[0].customdata; if (c != null) openDrawer(c); }); el._b = true; }
  // --- class mix (stacked, %)
  const names = chosen.map(x => progLabel(x.p)).reverse(), rows = chosen.slice().reverse();
  const clsCol = k => getComputedStyle(document.body).getPropertyValue('--c' + (k === '?' ? 'X' : k)).trim();
  Plotly.react('p-class', CLASSES.map(k => ({ type: 'bar', orientation: 'h', name: 'Class ' + k, y: names, marker: { color: clsCol(k) },
    x: rows.map(({ p }) => { const s = [...p.sids].filter(i => ids.has(i)); return s.length ? 100 * s.filter(i => SID2ROW[i]?.cls === k).length / s.length : 0; }) })),
    { ...transparent, font, barmode: 'stack', title: { text: 'What evolutionary stage? (% of targets by class)', font: { size: 12 } },
      margin: { t: 30, l: 120, r: 10, b: 30 }, xaxis: { range: [0, 100], ticksuffix: '%' }, legend: { orientation: 'h', y: -0.15, font: { size: 10 } } },
    { responsive: true, displaylogo: false });
  // --- region mix (heatmap of counts)
  const regNames = [...new Set(chosen.flatMap(({ p }) => [...p.sids].filter(s => ids.has(s)).map(s => SID2ROW[s]?.region)))].filter(Boolean)
    .sort((a, b) => ((REG[a]?.age_myr ?? 99) - (REG[b]?.age_myr ?? 99)));
  const z = rows.map(({ p }) => regNames.map(rg => [...p.sids].filter(s => ids.has(s) && SID2ROW[s]?.region === rg).length || null));
  Plotly.react('p-region', [{ type: 'heatmap', x: regNames, y: names, z, colorscale: 'Purples', showscale: false, hoverongaps: false,
    text: z.map(r => r.map(v => v || '')), texttemplate: '%{text}', hovertemplate: '%{y}<br>%{x}: %{z} sources<extra></extra>' }],
    { ...transparent, font, title: { text: 'Which regions? (number of targets; regions ordered by age)', font: { size: 12 } },
      margin: { t: 30, l: 120, r: 10, b: 70 }, xaxis: { tickangle: -40 } }, { responsive: true, displaylogo: false });
  // --- dust mass & (ALMA) resolution / (others) distance
  const box = (vals, i, p) => ({ type: 'box', name: progLabel(p), y: vals, boxpoints: 'all', jitter: 0.5, pointpos: 0, marker: { color: color[p.code], size: 4 },
    line: { color: color[p.code], width: 1 }, fillcolor: 'rgba(0,0,0,0)', showlegend: false });
  Plotly.react('p-mdust', chosen.map(({ p }, i) => box([...p.sids].filter(s => ids.has(s)).map(s => SID2ROW[s]?.Mdust_Mearth).filter(v => v != null), i, p)),
    { ...transparent, font, title: { text: 'How massive are the disks? M_dust (M⊕, from survey fluxes)', font: { size: 12 } },
      margin: { t: 30, l: 50, r: 10, b: 80 }, yaxis: { type: 'log' }, xaxis: { tickangle: -30 } }, { responsive: true, displaylogo: false });
  const alma = pst.fac === 'ALMA';
  Plotly.react('p-res', chosen.map(({ p }, i) => box(alma ? Object.entries(p.res).filter(([s]) => ids.has(s)).map(([, v]) => v)
      : [...p.sids].filter(s => ids.has(s)).map(s => SID2ROW[s]?.region_dist).filter(v => v != null), i, p)),
    { ...transparent, font, title: { text: alma ? 'How sharp? best angular resolution per target (″)' : 'How far? region distance (pc)', font: { size: 12 } },
      margin: { t: 30, l: 50, r: 10, b: 80 }, yaxis: { type: alma ? 'log' : 'linear' }, xaxis: { tickangle: -30 } }, { responsive: true, displaylogo: false });
}

// ------------------------------------------------------------------ detail drawer
const ADS = b => `<a target="_blank" href="https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(b)}">${b}</a>`;
function progLink(fac, p) {
  if (fac === 'ALMA') return `<a target="_blank" href="https://almascience.eso.org/asax/?result_view=observations&projectCode=${p}">${p}</a>`;
  if (fac === 'JWST' || fac === 'HST') return `<a target="_blank" href="https://www.stsci.edu/cgi-bin/get-proposal-info?id=${p}&observatory=${fac}">${p}</a>`;
  return `<a target="_blank" href="https://archive.eso.org/wdb/wdb/eso/sched_rep_arc/query?progid=${encodeURIComponent(p)}">${p}</a>`;
}
function openDrawer(i, focusK) {
  const r = ROWS[i], R = REG[r.region] || {};
  if (window.gtag) gtag('event', 'view_disk', { disk: r.name });
  const coo = `${r.ra.toFixed(5)} ${r.dec >= 0 ? '+' : ''}${r.dec.toFixed(5)}`;
  const kv = (k, v) => (v === '' || v == null ? '' : `<tr><td>${k}</td><td>${v}</td></tr>`);
  let h = `<h2>${r.name}</h2><div class="hint">${r.source_id} · ${coo} · ${(r.aliases || '').split(';').filter(a => a !== r.name).join(' · ')}</div>`;
  const im = (D.images[r.source_id] || []).map((x, k) => ({ ...x, k })).sort(imgRank);
  if (im.length) {
    const groups = SLOTS.map(sl => [sl, im.filter(x => sl.tr.includes(x.tracer))]).concat([[{ label: 'other', cls: 't-oth' }, im.filter(x => !SLOTS.some(sl => sl.tr.includes(x.tracer)))]]);
    h += `<h3>Images (${im.length})</h3>` + groups.filter(([, l]) => l.length).map(([sl, l]) =>
      `<div class="dgrp ${sl.cls}"><div class="dlab"><i class="dot"></i>${sl.label} <span class="n">${l.length}</span></div><div class="imgs">${l.map(x =>
        `<figure class="${x.k === focusK ? 'focus' : ''}" data-sid="${r.source_id}" data-k="${x.k}"><img src="${x.file}" loading="lazy"><figcaption>${x.label || ''}<br>${x.doi ? `<a target="_blank" href="https://doi.org/${x.doi}">${x.ref}</a>` : (x.ref || '')} ${x.figure || ''}</figcaption></figure>`).join('')}</div></div>`).join('');
  } else h += `<h3>Images</h3><p class="hint">None yet — add a screenshot to images/manual/ or a crop to config/image_crops.csv.</p>`;
  h += `<table class="kv">${kv('Region', `${r.region}${R.dist_pc ? ` — ${R.dist_pc} pc, ~${R.age_myr} Myr (${R.age_range_myr}); ${R.environment}` : ''}`)}
    ${kv('Class', `${cell(r, 'yso_class')} <span class="hint">from ${r.class_src || '—'}</span>`)}
    ${kv('α / T_bol', [r.alpha != null ? 'α = ' + fmtNum(r.alpha) : '', r.tbol != null ? 'T_bol = ' + fmtNum(r.tbol) + ' K' : ''].filter(Boolean).join(', '))}
    ${kv('SpT', r.spt)}
    ${kv('mm flux', r.F_mm_mJy != null ? `${r.F_mm_limit ? '&lt;' : ''}${fmtNum(r.F_mm_mJy)}${r.eF_mm_mJy ? ' ± ' + fmtNum(r.eF_mm_mJy) : ''} mJy at ${r.lam_mm} mm (${r.F_mm_ref})` : '')}
    ${kv('M_dust', r.Mdust_Mearth != null ? fmtNum(r.Mdust_Mearth) + ' M⊕' : r.Mdust_limit != null ? '&lt;' + fmtNum(r.Mdust_limit) + ' M⊕' : '')}
    ${kv('ALMA large programs', r.prog.join(', '))}
    ${kv('Catalogs', (r.catalogs || '').split(';').map(k => `<span title="${(D.refs[k] || {}).citation || ''}">${k}</span>`).join(', '))}</table>`;
  h += `<div class="hint" style="margin-top:6px">
    <a target="_blank" href="https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${encodeURIComponent(coo)}&Radius=5&Radius.unit=arcsec">SIMBAD</a> ·
    <a target="_blank" href="https://almascience.eso.org/asax/?result_view=observations&raDec=${encodeURIComponent(r.ra + ' ' + r.dec)}">ALMA archive</a> ·
    <a target="_blank" href="https://mast.stsci.edu/portal/Mashup/Clients/Mast/Portal.html?searchQuery=${encodeURIComponent(r.ra + ' ' + r.dec)}">MAST</a> ·
    <a target="_blank" href="https://archive.eso.org/scienceportal/home?pos=${r.ra},${r.dec}&r=0.003">ESO</a> ·
    <a target="_blank" href="https://ui.adsabs.harvard.edu/search/q=object%3A%22${encodeURIComponent(r.name)}%22&sort=date%20desc">ADS (object)</a></div>`;
  const fe = D.feats[r.source_id] || [];
  if (fe.length) h += `<h3>Features</h3><table>${fe.map(f => `<tr><td><span class="tag ${f[0].split(' ')[0]}">${f[0]}</span></td><td>${f[1]} (${f[2]})</td><td>${f[3]}<br><span class="hint">${f[5]} · confidence ${f[4]}</span></td></tr>`).join('')}</table>`;
  const ob = D.obs[r.source_id] || [];
  h += `<h3>Archive (${ob.length})</h3>`;
  if (ob.length) h += `<table><tr><th>facility</th><th>program</th><th>band / filters</th><th>res ″</th><th>year</th><th>public</th><th>papers</th></tr>${ob.map(o =>
    `<tr><td>${o[0]}${o[1] !== o[0] ? ' ' + o[1] : ''}</td><td>${progLink(o[0], o[2])}</td><td>${o[3] || ''}</td><td class="num">${fmtNum(o[4])}</td><td>${o[7] || ''}</td>
     <td>${o[5] ? '<span class="yes">✓</span>' : 'prop.'}</td><td>${o[6].slice(0, 4).map(ADS).join('<br>')}${o[6].length > 4 ? `<br>+${o[6].length - 4}` : ''}</td></tr>`).join('')}</table>`;
  else h += '<p class="hint">No archive matches (or step 3 not run yet).</p>';
  const me = D.meas[r.source_id] || [];
  if (me.length) h += `<h3>Catalog measurements (${me.length})</h3><table><tr><th>param</th><th>value</th><th>unit</th><th>ref</th><th>note</th></tr>${me.map(m =>
    `<tr><td>${m[0]}</td><td class="num">${m[3]}${fmtNum(m[1])}${m[2] != null ? ' ± ' + fmtNum(m[2]) : ''}</td><td>${m[4]}</td><td title="${(D.refs[m[5]] || {}).citation || ''}">${m[5]}</td><td class="hint">${m[6]}</td></tr>`).join('')}</table>`;
  $('#dcontent').innerHTML = h;
  $('#dcontent').onclick = e => { const f = e.target.closest('figure[data-k]'); if (f && !e.target.closest('a')) openLightbox(f.dataset.sid, +f.dataset.k); };
  const fc = $('#dcontent figure.focus'); $('#drawer').scrollTop = 0; if (fc) setTimeout(() => fc.scrollIntoView({ block: 'nearest' }), 30);
  $('#drawer').classList.remove('hidden');
}
$('#close').onclick = () => $('#drawer').classList.add('hidden');
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#drawer').classList.add('hidden'); });

// ------------------------------------------------------------------ export, tabs, refresh
$('#export').onclick = () => {
  const sel = selection(), cols = D.cols.concat(['region_age', 'region_dist']);
  const esc = v => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const csv = [cols.join(',')].concat(sel.map(r => cols.map(c => esc(r[c])).join(','))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'yso_selection.csv'; a.click();
};
document.querySelectorAll('#tabs button').forEach(b => (b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
  state.tab = b.dataset.tab; refresh();
  if (window.gtag) gtag('event', 'tab_view', { tab: b.dataset.tab });      // which tabs visitors use (Google Analytics)
}));
function refresh() {
  if (typeof Plotly === 'undefined' && ['plot', 'regions', 'sky', 'programs'].includes(state.tab)) {
    document.querySelector({ plot: '#plot', regions: '#regplot', sky: '#sky', programs: '#p-sky' }[state.tab]).innerHTML = '<p class="hint">Plotly not found: run scripts/04_build_site.py (it copies plotly.min.js into site/).</p>';
  }
  const sel = selection();
  $('#count').innerHTML = `<b>${sel.length.toLocaleString()}</b> of ${ROWS.length.toLocaleString()} sources`;
  if (state.tab === 'table') renderTable(sel);
  if (typeof Plotly !== 'undefined' && state.tab === 'plot') renderPlot(sel);
  if (typeof Plotly !== 'undefined' && state.tab === 'regions') renderRegions(sel);
  if (state.tab === 'gallery') renderGallery(sel);
  if (typeof Plotly !== 'undefined' && state.tab === 'sky') renderSky(sel);
  if (typeof Plotly !== 'undefined' && state.tab === 'programs') renderPrograms(sel);
}
try { if (localStorage.getItem('yso-dark') === '1' || (localStorage.getItem('yso-dark') == null && matchMedia('(prefers-color-scheme: dark)').matches)) { document.body.classList.add('dark'); $('#darkmode').checked = true; } } catch (e) {}
$('#darkmode').onchange = () => { document.body.classList.toggle('dark', $('#darkmode').checked);
  try { localStorage.setItem('yso-dark', $('#darkmode').checked ? '1' : '0'); } catch (e) {} refresh(); };
$('#meta').textContent = `${ROWS.length} sources · ${regionsSorted.length} regions · built ${D.generated}`;
buildFilterUI(); initPlotUI(); initGallery(); initPrograms(); refresh();
