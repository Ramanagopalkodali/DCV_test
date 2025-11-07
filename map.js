/* map.js - final: disease key -> filename mapping, auto-fill years, scaled charts, tooltips */

const params = new URLSearchParams(window.location.search);
let diseaseKey = params.get('disease') || sessionStorage.getItem('lastDisease') || 'HIV';
let selectedYear = params.get('year') || sessionStorage.getItem('lastYear') || (new Date()).getFullYear()-1;

// mapping disease key -> filename(s) (prefer JSON if present)
const datasetsMap = {
  'HIV': 'HIV_data.xlsx',
  'TB': 'TB_data.xlsx',
  'Malaria': 'Malaria_data.xlsx',
  'Dengue': 'Dengue_data.xlsx'
};

const dsSelectHeader = document.getElementById('dsSelectHeader');
const yearSelectHeader = document.getElementById('yearSelectHeader');
const loadHeader = document.getElementById('loadHeader');
const downloadCSVHeader = document.getElementById('downloadCSVHeader');
const themeToggleHeader = document.getElementById('themeToggleHeader');

if (dsSelectHeader) dsSelectHeader.value = diseaseKey;

// theme persist
const setTheme = (t) => { document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); themeToggleHeader.textContent = t === 'dark' ? '☀️' : '🌙'; }
setTheme(localStorage.getItem('theme') || 'light');
themeToggleHeader.addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark') );

// helper — pick filename: if JSON exists prefer JSON (faster)
async function pickFilenameForKey(key) {
  const base = datasetsMap[key];
  if (!base) throw new Error('No dataset mapping for ' + key);
  const jsonCandidate = base.replace(/\.xlsx$/i, '.json');
  // check JSON first
  try {
    const r = await fetch(jsonCandidate, { method: 'HEAD' });
    if (r.ok) return jsonCandidate;
  } catch(_) {}
  return base;
}

// utility formatting
function formatTick(v){
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1).replace(/\.0$/,'') + 'k';
  return ''+v;
}
function roundUpNice(n){
  if (!isFinite(n)) return n;
  if (n <= 10) return Math.ceil(n);
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / p) * p;
}

// fetch rows from filename (json/csv or xlsx)
function isJSONFile(name){ return String(name).toLowerCase().endsWith('.json') || name.toLowerCase().endsWith('.csv'); }
async function fetchRowsFromFile(name){
  if (!name) throw new Error('No filename provided');
  if (isJSONFile(name)) {
    const r = await fetch(name);
    if (!r.ok) throw new Error(`Failed to fetch ${name}: ${r.status}`);
    if (name.toLowerCase().endsWith('.json')) return await r.json();
    // csv
    const txt = await r.text();
    const lines = txt.trim().split('\n');
    const headers = lines[0].split(',').map(h=>h.trim());
    return lines.slice(1).map(l => {
      const cols = l.split(',');
      const o = {}; headers.forEach((h,i)=>o[h]=cols[i]); return o;
    });
  } else {
    // XLSX
    const buf = await (await fetch(name)).arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  }
}

// UI elements
const totalCasesEl = document.getElementById('totalCases');
const selectedInfoEl = document.getElementById('selectedInfo');
const legendWrap = document.getElementById('legendWrap');
const matrixCanvas = document.getElementById('matrixHeatmap');

// chart globals
let barChart=null, lineChart=null, histChart=null, matrixChart=null, leafletMap=null;
let geoCache = null;

async function loadGeo(){
  if (geoCache) return geoCache;
  const r = await fetch('usa_states.geojson');
  if (!r.ok) throw new Error('Failed to load usa_states.geojson');
  geoCache = await r.json(); return geoCache;
}

function colorRamp(v,min,max){
  if (v==null) return '#efefef';
  const ratio = (v - min)/(max-min||1);
  const r = Math.round(220*ratio + 30*(1-ratio));
  const g = Math.round(230 - 180*ratio);
  const b = Math.round(80 + 120*(1-ratio));
  return `rgb(${r},${g},${b})`;
}

// fill years into header select from dataset rows
async function populateYearSelectForDisease(key) {
  try {
    const fname = await pickFilenameForKey(key);
    const rows = await fetchRowsFromFile(fname);
    const years = Array.from(new Set(rows.map(r=>Number(r.Year)).filter(Boolean))).sort((a,b)=>a-b);
    yearSelectHeader.innerHTML = '';
    years.forEach(y => { const opt = document.createElement('option'); opt.value = y; opt.textContent = y; yearSelectHeader.appendChild(opt); });
    // if selectedYear present, set
    if (selectedYear && years.includes(Number(selectedYear))) yearSelectHeader.value = selectedYear;
    else if (years.length) yearSelectHeader.value = years[years.length-1];
  } catch(err){
    console.warn('populateYearSelect error', err);
    yearSelectHeader.innerHTML = '<option value="">No years</option>';
  }
}

// draw map
function restoreMapState(){
  try { return JSON.parse(sessionStorage.getItem('mapState')||'null'); } catch(e){ return null; }
}
function saveMapState(){
  if (!leafletMap) return;
  const c = leafletMap.getCenter();
  sessionStorage.setItem('mapState', JSON.stringify({ center:[c.lat,c.lng], zoom:leafletMap.getZoom(), disease:diseaseKey, year:selectedYear }));
}

async function drawChoropleth(geo,stateValues,minV,maxV){
  if (!leafletMap) {
    leafletMap = L.map('map', { scrollWheelZoom:false }).setView([37.8, -96], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(leafletMap);
  } else {
    leafletMap.eachLayer(l => { if (l && l instanceof L.GeoJSON) leafletMap.removeLayer(l); });
  }
  function style(f){
    const v = stateValues[f.properties.NAME]; return { fillColor: colorRamp(v,minV,maxV), weight:1, color:'#fff', fillOpacity:0.92 };
  }
  function onEach(f, layer){
    const name = f.properties.NAME;
    const v = stateValues[name] != null ? stateValues[name] : 'No data';
    layer.bindTooltip(`<strong>${name}</strong><br/>Cases: ${v.toLocaleString()}`, { direction:'auto' });
    layer.on('click', () => {
      saveMapState();
      window.location.href = `state.html?state=${encodeURIComponent(name)}&disease=${encodeURIComponent(diseaseKey)}&year=${encodeURIComponent(selectedYear)}`;
    });
  }
  L.geoJson(geo, { style, onEachFeature:onEach }).addTo(leafletMap);

  const st = restoreMapState();
  if (st && st.disease === diseaseKey && String(st.year) === String(selectedYear)) leafletMap.setView(st.center, st.zoom);
}

// safe destroy chart
function safeDestroy(c){ try { if (c && typeof c.destroy === 'function') c.destroy(); } catch(e){} }

// draw bar chart
function drawBar(stateValues, year, minV, maxV){
  const ctx = document.getElementById('casesBar').getContext('2d');
  const labels = Object.keys(stateValues);
  const data = Object.values(stateValues);
  const bg = data.map(v=>colorRamp(v,minV,maxV));
  safeDestroy(barChart);
  const sugg = roundUpNice(Math.max(...data || [0]) * 1.08 || 10);
  barChart = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ label:`Cases (${year})`, data, backgroundColor:bg, maxBarThickness:48 }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ title: items => items[0].label, label: it => `${labels[it.dataIndex]} — ${it.raw.toLocaleString()} cases` } } },
      scales:{ x:{ ticks:{ maxRotation:45, autoSkip:true, maxTicksLimit:14 }, grid:{ display:false } }, y:{ beginAtZero:true, suggestedMax:sugg, ticks:{ callback:formatTick } } }
    }
  });
}

// draw USA aggregate trend line
function drawLine(rows){
  const yearAgg = {};
  rows.forEach(r => { const y = Number(r.Year); if (!y) return; yearAgg[y] = (yearAgg[y] || 0) + (Number(r.Cases)||0); });
  const yrs = Object.keys(yearAgg).map(Number).sort((a,b)=>a-b);
  const vals = yrs.map(y=>yearAgg[y]);
  safeDestroy(lineChart);
  const ctx = document.getElementById('casesLine').getContext('2d');
  lineChart = new Chart(ctx, {
    type:'line',
    data:{ labels: yrs, datasets:[{ label:'USA total', data: vals, borderColor:'#0f6ef6', backgroundColor:'rgba(15,110,246,0.08)', fill:true, tension:0.3 }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ label: it => `${it.raw.toLocaleString()} cases` } } }, scales:{ y:{ beginAtZero:true, suggestedMax: roundUpNice(Math.max(...vals||[0])*1.08), ticks:{ callback:formatTick } } } }
  });
}

// histogram
function drawHist(values){
  safeDestroy(histChart);
  const ctx = document.getElementById('casesHist').getContext('2d');
  const buckets = Math.min(10, Math.max(4, Math.round(Math.sqrt(values.length||1))));
  const minV = Math.min(...values||[0]), maxV = Math.max(...values||[0]);
  const size = (maxV - minV) / (buckets || 1) || 1;
  const counts = new Array(buckets).fill(0);
  values.forEach(v => { const idx = Math.min(buckets-1, Math.floor((v-minV)/size)); counts[idx] += 1; });
  const labels = new Array(buckets).fill(0).map((_,i)=>`${Math.round(minV+i*size)}–${Math.round(minV+(i+1)*size)}`);
  histChart = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ label:'Count', data:counts, backgroundColor:'rgba(79,70,229,0.75)', maxBarThickness:40 }]}, options:{ responsive:true, maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ label: it => `${it.raw} states` } } }, scales:{ y:{ beginAtZero:true } } }});
}

// matrix heatmap (matrix plugin) with fallback handled in drawMatrixHeatmap function
let matrixChartRef = null;
async function drawMatrixHeatmap(pivot, years, states, minV, maxV) {
  // same logic as previous robust version: try matrix plugin; fallback to small html table
  // (I'll reuse the robust fallback approach provided earlier)
  // For brevity here we call the robust helper from earlier code by invoking drawMatrixHeatmapFallback if plugin missing.
  try {
    // if matrix plugin not present, throw
    if (!window.Chart || !Chart.defaults || !Chart.controllers || !Chart.registry.getController('matrix')) throw new Error('matrix plugin not loaded');
    // prepare data
    const xLabels = years.map(String), yLabels = states.slice();
    const data = [];
    years.forEach((yr, xi) => states.forEach((st, yi) => data.push({ x: xi, y: yi, v: pivot[st][yr] || 0 })));
    // destroy old
    if (matrixChartRef) matrixChartRef.destroy();
    const ctx = document.getElementById('matrixHeatmap').getContext('2d');
    matrixChartRef = new Chart(ctx, {
      type: 'matrix',
      data: { datasets:[{ label:'State×Year', data, width: ({chart}) => (chart.chartArea.width / xLabels.length) - 1, height: ({chart}) => (chart.chartArea.height / yLabels.length) - 1, backgroundColor: ctx => colorRamp(ctx.dataset.data[ctx.dataIndex].v, minV, maxV) }]},
      options: {
        maintainAspectRatio:false,
        plugins: {
          tooltip: { callbacks: {
            title: items => { const it = items[0]; const dp = it.dataset.data[it.dataIndex]; return `${yLabels[dp.y]} — ${xLabels[dp.x]}`; },
            label: items => `Cases: ${items.raw ? items.raw.v : items.dataset.data[items.dataIndex].v}`
          } }
        },
        scales: {
          x: { type:'category', labels:xLabels, position:'bottom', grid:{ display:false }, ticks:{ maxRotation:45, autoSkip:true, maxTicksLimit:10 } },
          y: { type:'category', labels:yLabels, grid:{ display:false }, ticks:{ autoSkip:true, maxTicksLimit:20 } }
        },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const el = elements[0];
          const dp = matrixChartRef.data.datasets[el.datasetIndex].data[el.index];
          const year = xLabels[dp.x], state = yLabels[dp.y];
          saveMapState();
          window.location.href = `state.html?state=${encodeURIComponent(state)}&disease=${encodeURIComponent(diseaseKey)}&year=${year}`;
        }
      }
    });
    return;
  } catch(err) {
    console.warn('matrix plugin missing or error, falling back to table:', err);
    // fallback — show a compact pivot table (last 8 years)
    const wrapper = document.querySelector('.heatmap-wrapper');
    const canvas = document.getElementById('matrixHeatmap');
    if (canvas) canvas.style.display = 'none';
    let fb = document.querySelector('.heatmap-fallback');
    if (!fb) { fb = document.createElement('div'); fb.className = 'heatmap-fallback card'; wrapper.appendChild(fb); }
    const yearsToShow = years.slice(-8);
    let html = '<div style="font-weight:700;margin-bottom:8px;">Heatmap (fallback)</div>';
    html += '<div style="overflow:auto;"><table style="border-collapse:collapse;width:100%"><thead><tr><th style="padding:6px;text-align:left">State</th>';
    yearsToShow.forEach(y => html += `<th style="padding:6px">${y}</th>`);
    html += '</tr></thead><tbody>';
    states.forEach(s => { html += `<tr><td style="padding:6px;font-weight:600">${s}</td>`; yearsToShow.forEach(y => { const v = pivot[s][y] || 0; const bg = colorRamp(v,minV,maxV); html += `<td style="padding:6px;text-align:center;background:${bg}">${v}</td>`; }); html += '</tr>'; });
    html += '</tbody></table></div>';
    fb.innerHTML = html;
  }
}

function renderLegend(minV,maxV){
  const wrap = document.getElementById('legendWrap');
  if (!wrap) return;
  let html = '<div class="info legend"><strong>Cases</strong><div style="display:flex;gap:8px;margin-top:8px;align-items:center">';
  for (let i=0;i<=5;i++){ const v=Math.round(minV + (i/5)*(maxV-minV)); html += `<span style="display:flex;gap:6px;align-items:center"><span style="width:20px;height:12px;background:${colorRamp(v,minV,maxV)};display:inline-block;border-radius:3px;"></span><small style="color:var(--muted)">${formatTick(v)}</small></span>`; }
  html += '</div></div>';
  wrap.innerHTML = html;
}

// CSV export (matrixChart or fallback table)
function exportVisibleCSV(){
  // try matrix chart
  if (matrixChartRef && matrixChartRef.data && matrixChartRef.data.datasets && matrixChartRef.data.datasets[0]) {
    const xLabels = matrixChartRef.options.scales.x.labels;
    const yLabels = matrixChartRef.options.scales.y.labels;
    const data = matrixChartRef.data.datasets[0].data;
    const grid = {};
    data.forEach(d => { const yr = xLabels[d.x], st = yLabels[d.y]; grid[st] = grid[st] || {}; grid[st][yr] = d.v; });
    const header = ['State', ...xLabels]; const rows=[header.join(',')];
    yLabels.forEach(st => { const row=['"'+st.replace(/"/g,'""')+'"']; xLabels.forEach(yr=>row.push(String(grid[st] && grid[st][yr] ? grid[st][yr] : 0))); rows.push(row.join(',')); });
    const blob = new Blob([rows.join('\n')], { type:'text/csv;charset=utf-8;' }); const u=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=u; a.download='heatmap_export.csv'; a.click(); URL.revokeObjectURL(u); return;
  }
  // fallback table
  const fbTable = document.querySelector('.heatmap-fallback table');
  if (fbTable) {
    const rows = []; fbTable.querySelectorAll('tr').forEach(tr => { const cols = Array.from(tr.querySelectorAll('th,td')).map(td => `"${td.textContent.replace(/"/g,'""')}"`); rows.push(cols.join(',')); });
    const blob = new Blob([rows.join('\n')], { type:'text/csv' }); const u=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=u; a.download='heatmap_export.csv'; a.click(); URL.revokeObjectURL(u); return;
  }
  alert('No heatmap data to export');
}

// main load (populate year select first then draw)
async function loadAll() {
  diseaseKey = dsSelectHeader.value || diseaseKey;
  selectedYear = yearSelectHeader.value || selectedYear;
  sessionStorage.setItem('lastDisease', diseaseKey);
  sessionStorage.setItem('lastYear', selectedYear);
  selectedInfoEl.textContent = `Dataset: ${diseaseKey} · Year: ${selectedYear}`;
  totalCasesEl.textContent = 'Loading...';

  try {
    const fname = await pickFilenameForKey(diseaseKey);
    // fetch rows
    const rows = await fetchRowsFromFile(fname);
    // years & states
    const years = Array.from(new Set(rows.map(r=>Number(r.Year)).filter(Boolean))).sort((a,b)=>a-b);
    const states = Array.from(new Set(rows.map(r=>String(r.State).trim()))).sort();
    // ensure header year select shows available years
    yearSelectHeader.innerHTML = ''; years.forEach(y => { const o=document.createElement('option'); o.value=y; o.textContent=y; yearSelectHeader.appendChild(o); });
    if (years.includes(Number(selectedYear))) yearSelectHeader.value = selectedYear; else { selectedYear = years[years.length-1]; yearSelectHeader.value = selectedYear; }
    // pivot
    const pivot = {}; states.forEach(s=>pivot[s]={});
    rows.forEach(r => { const s = String(r.State).trim(); const y = Number(r.Year); const c = Number(r.Cases)||0; pivot[s][y] = (pivot[s][y]||0) + c; });
    // state values selected year
    const stateValues = {}; states.forEach(s=>stateValues[s] = pivot[s][selectedYear] || 0);
    const vals = Object.values(stateValues);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const total = vals.reduce((a,b)=>a+(b||0),0);
    totalCasesEl.textContent = `Total USA Cases (${selectedYear}): ${total.toLocaleString()}`;

    // draw map & charts
    const geo = await loadGeo();
    await drawChoropleth(geo, stateValues, minV, maxV);
    drawBar(stateValues, selectedYear, minV, maxV);
    drawLine(rows);
    drawHist(vals);
    await drawMatrixHeatmap(pivot, years, states, minV, maxV);
    renderLegend(minV, maxV);

    // ensure charts resized
    setTimeout(()=>{ [barChart, lineChart, histChart, matrixChartRef].forEach(ch => { try { ch && ch.resize && ch.resize(); } catch(e){} }); }, 200);
  } catch(err){
    console.error('loadAll error', err);
    selectedInfoEl.textContent = 'Failed to load data (see console)';
    totalCasesEl.textContent = '—';
    // show fallback message in heatmap area
    const wrapper = document.querySelector('.heatmap-wrapper');
    if (wrapper) wrapper.innerHTML = `<div class="card" style="padding:12px;">Heatmap unavailable: ${err.message || 'error'}</div>`;
  }
}

// wire up header load/export
loadHeader.addEventListener('click', () => { loadAll(); });
downloadCSVHeader.addEventListener('click', () => exportVisibleCSV());

// on initial load: set select and populate years then load
(async () => {
  try {
    // set disease dropdown if missing
    if (dsSelectHeader) dsSelectHeader.value = diseaseKey;
    await populateYearSelectForDisease(diseaseKey);
    // if the select populates, set selectedYear if present
    if (yearSelectHeader && selectedYear) {
      const opt = Array.from(yearSelectHeader.options).find(o => o.value === String(selectedYear));
      if (opt) yearSelectHeader.value = selectedYear;
    }
    // when user changes disease in header, repopulate years automatically
    dsSelectHeader && dsSelectHeader.addEventListener('change', async () => {
      diseaseKey = dsSelectHeader.value;
      await populateYearSelectForDisease(diseaseKey);
    });
    // when user changes year in header store selection
    yearSelectHeader && yearSelectHeader.addEventListener('change', () => { selectedYear = yearSelectHeader.value; sessionStorage.setItem('lastYear', selectedYear); });
    await loadAll();
  } catch(e){ console.error('init error', e); loadAll(); }
})();




