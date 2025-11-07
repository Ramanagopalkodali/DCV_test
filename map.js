/* map.js - robust version with better error logging and fallback heatmap rendering */

const params = new URLSearchParams(window.location.search);
let fileParam = params.get('disease') || sessionStorage.getItem('lastDataset') || 'HIV_data.xlsx';
let yearParam = params.get('year') || sessionStorage.getItem('lastYear') || (new Date()).getFullYear()-1;

const dsSelectHeader = document.getElementById('dsSelectHeader');
const yearSelectHeader = document.getElementById('yearSelectHeader');
const loadHeader = document.getElementById('loadHeader');
const downloadCSVHeader = document.getElementById('downloadCSVHeader');
const themeToggleHeader = document.getElementById('themeToggleHeader');

if (dsSelectHeader) dsSelectHeader.value = fileParam;
if (yearSelectHeader) yearSelectHeader.value = yearParam;

const setTheme = (t) => { document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); if (themeToggleHeader) themeToggleHeader.textContent = t === 'dark' ? '☀️' : '🌙'; }
setTheme(localStorage.getItem('theme') || 'light');
if (themeToggleHeader) themeToggleHeader.addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

if (downloadCSVHeader) downloadCSVHeader.addEventListener('click', () => { if (typeof exportVisibleCSV === 'function') exportVisibleCSV(); else alert('No heatmap data yet'); });
if (loadHeader) loadHeader.addEventListener('click', () => {
  fileParam = dsSelectHeader.value || fileParam;
  yearParam = yearSelectHeader.value || yearParam;
  sessionStorage.setItem('lastDataset', fileParam);
  sessionStorage.setItem('lastYear', yearParam);
  loadAll();
});

function logErr(msg, err) {
  console.error('[map.js] ' + msg, err || '');
  const sel = document.getElementById('selectedInfo');
  if (sel) sel.textContent = msg + (err ? ` (see console)` : '');
}

function isJSONFile(name){ const s = (name||'').toLowerCase(); return s.endsWith('.json') || s.endsWith('.csv'); }
async function fetchRows(name) {
  if (!name) throw new Error('No dataset name provided');
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
      const obj = {};
      headers.forEach((h,i)=> obj[h] = cols[i]);
      return obj;
    });
  } else {
    const bufResp = await fetch(name);
    if (!bufResp.ok) throw new Error(`Failed to fetch ${name}: ${bufResp.status}`);
    const buf = await bufResp.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  }
}

let geoCache = null;
async function loadGeo() {
  if (geoCache) return geoCache;
  const r = await fetch('usa_states.geojson');
  if (!r.ok) throw new Error(`Failed to load usa_states.geojson (${r.status})`);
  geoCache = await r.json();
  return geoCache;
}

function colorRamp(value, min, max) {
  if (value == null) return '#efefef';
  const ratio = (value - min) / (max - min || 1);
  const r = Math.round(220 * ratio + 30 * (1 - ratio));
  const g = Math.round(230 - 180 * ratio);
  const b = Math.round(80 + 120 * (1 - ratio));
  return `rgb(${r},${g},${b})`;
}

function formatTick(v){
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1).replace(/\.0$/,'') + 'k';
  return ''+v;
}

let leafletMap = null;
let barChart=null,lineChart=null,histChart=null,matrixChart=null;

function restoreMapState(){
  try { return JSON.parse(sessionStorage.getItem('mapState')||'null'); } catch(e){ return null; }
}
function saveMapState(){
  if (!leafletMap) return;
  try {
    const c = leafletMap.getCenter();
    sessionStorage.setItem('mapState', JSON.stringify({center:[c.lat,c.lng], zoom:leafletMap.getZoom(), dataset:fileParam, year:yearParam}));
  } catch(e){/* ignore */ }
}

async function drawChoropleth(geo, stateValues, minV, maxV){
  if (!leafletMap) {
    leafletMap = L.map('map', { scrollWheelZoom:false }).setView([37.8,-96],4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(leafletMap);
  } else {
    leafletMap.eachLayer(l => { if (l && l instanceof L.GeoJSON) leafletMap.removeLayer(l); });
  }

  function style(f){ const v = stateValues[f.properties.NAME]; return { fillColor: colorRamp(v,minV,maxV), weight:1, color:'#fff', fillOpacity:0.92 }; }
  function onEach(f, layer){
    const name = f.properties.NAME;
    const v = stateValues[name] != null ? stateValues[name] : 'No data';
    layer.bindTooltip(`<strong>${name}</strong><br/>Cases: ${v}`, { direction:'auto' });
    layer.on('click', () => { saveMapState(); window.location.href = `state.html?state=${encodeURIComponent(name)}&disease=${encodeURIComponent(fileParam)}&year=${encodeURIComponent(yearParam)}`; });
  }
  L.geoJson(geo, { style, onEachFeature:onEach }).addTo(leafletMap);

  const st = restoreMapState();
  if (st && st.dataset === fileParam && String(st.year) === String(yearParam)) {
    leafletMap.setView(st.center, st.zoom);
  }
}

function safeDestroyChart(c){ try { if (c && typeof c.destroy==='function') c.destroy(); } catch(e){} }

function drawBar(stateValues, year, minV, maxV){
  const ctx = document.getElementById('casesBar') && document.getElementById('casesBar').getContext('2d');
  if (!ctx) return;
  const labels = Object.keys(stateValues);
  const data = Object.values(stateValues);
  const bg = data.map(v=>colorRamp(v,minV,maxV));
  safeDestroyChart(barChart);
  const suggestedMax = Math.max( Math.ceil(Math.max(...data)*1.05), 10 );
  barChart = new Chart(ctx, {
    type:'bar', data:{ labels, datasets:[{ label:`Cases (${year})`, data, backgroundColor:bg, maxBarThickness:48 }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ label: it => `Cases: ${it.raw.toLocaleString()}` } } }, scales:{ y:{ beginAtZero:true, suggestedMax, ticks:{ callback:formatTick } }, x:{ ticks:{ maxRotation:45, autoSkip:true, maxTicksLimit:12 } } } }
  });
}

function drawLine(rows){
  const yearAgg = {};
  rows.forEach(r=>{ const y=Number(r.Year); if (!y) return; yearAgg[y] = (yearAgg[y]||0) + (Number(r.Cases)||0); });
  const yrs = Object.keys(yearAgg).map(Number).sort((a,b)=>a-b);
  const vals = yrs.map(y=>yearAgg[y]);
  const ctx = document.getElementById('casesLine') && document.getElementById('casesLine').getContext('2d');
  safeDestroyChart(lineChart);
  lineChart = new Chart(ctx, {
    type:'line', data:{ labels:yrs, datasets:[{ label:'USA total', data:vals, borderColor:'#0f6ef6', backgroundColor:'rgba(15,110,246,0.08)', fill:true, tension:0.3 }]},
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true, suggestedMax: Math.max(...vals)*1.05, ticks:{ callback:formatTick } }, x:{ title:{ display:true, text:'Year' } } } }
  });
}

function drawHist(values){
  const ctx = document.getElementById('casesHist') && document.getElementById('casesHist').getContext('2d');
  if (!ctx) return;
  const buckets = Math.min(10, Math.max(4, Math.round(Math.sqrt(values.length))));
  const minV = Math.min(...values), maxV = Math.max(...values);
  const size = (maxV-minV)/(buckets||1) || 1;
  const counts = new Array(buckets).fill(0);
  values.forEach(v => { const idx = Math.min(buckets-1, Math.floor((v-minV)/size)); counts[idx] += 1; });
  const labels = new Array(buckets).fill(0).map((_,i)=>`${Math.round(minV+i*size)}–${Math.round(minV+(i+1)*size)}`);
  safeDestroyChart(histChart);
  histChart = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ label:'States', data:counts, backgroundColor:'rgba(79,70,229,0.75)', maxBarThickness:40 }]}, options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } } }});
}

/* Matrix heatmap with fallback */
async function drawMatrixHeatmap(pivot, years, states, minV, maxV){
  const canvas = document.getElementById('matrixHeatmap');
  const wrapper = canvas ? canvas.parentElement : document.querySelector('.heatmap-wrapper');
  // remove any previous fallback content
  if (wrapper) {
    wrapper.querySelectorAll('.fallback-msg').forEach(n=>n.remove());
    // keep canvas; ensure visible
  }
  try {
    // sanity checks
    if (!canvas) throw new Error('Matrix canvas (id="matrixHeatmap") not found in DOM');
    if (typeof Chart === 'undefined' || typeof Chart.controllers === 'undefined') throw new Error('Chart.js not loaded');
    if (typeof Chart.controllers.matrix === 'undefined' && typeof Chart.elements.Matrix === 'undefined' && !(Chart.registry && Chart.registry.getController('matrix'))) {
      // plugin not present
      throw new Error('Matrix plugin (chartjs-chart-matrix) not loaded');
    }

    // build data for matrix plugin
    const xLabels = years.map(String);
    const yLabels = states.slice();
    const data = [];
    years.forEach((yr, xi) => states.forEach((st, yi) => data.push({ x: xi, y: yi, v: pivot[st][yr] || 0 })));

    safeDestroyChart(matrixChart);
    const ctx = canvas.getContext('2d');
    matrixChart = new Chart(ctx, {
      type: 'matrix',
      data: { datasets:[{ label:'State×Year', data, width:({chart})=> (chart.chartArea.width/xLabels.length)-1, height:({chart})=> (chart.chartArea.height/yLabels.length)-1, backgroundColor: ctx => colorRamp(ctx.dataset.data[ctx.dataIndex].v, minV, maxV) }]},
      options: {
        maintainAspectRatio:false,
        plugins:{ tooltip:{ callbacks:{ title:items=>{ const it=items[0]; const dp=it.dataset.data[it.dataIndex]; return `${yLabels[dp.y]} — ${xLabels[dp.x]}`; }, label: item => `Cases: ${item.dataset.data[item.dataIndex].v.toLocaleString()}` } } },
        scales:{ x:{ type:'category', labels:xLabels, grid:{display:false}, ticks:{ maxRotation:45,minRotation:30,autoSkip:true,maxTicksLimit:12 } }, y:{ type:'category', labels:yLabels, grid:{display:false}, ticks:{ autoSkip:true, maxTicksLimit:20 } } },
        onClick: (ev, elems) => {
          if (!elems.length) return;
          const el = elems[0];
          const dp = matrixChart.data.datasets[el.datasetIndex].data[el.index];
          const year = xLabels[dp.x], state = yLabels[dp.y];
          saveMapState();
          window.location.href = `state.html?state=${encodeURIComponent(state)}&disease=${encodeURIComponent(fileParam)}&year=${year}`;
        }
      }
    });
    return;
  } catch (err) {
    // log and show fallback table
    logErr('Heatmap plugin or data unavailable — rendering fallback table', err);
    // build fallback HTML table in the wrapper
    try {
      // ensure wrapper exists
      const target = wrapper || document.querySelector('main .container') || document.body;
      // remove canvas if present to avoid invisible area
      const existingCanvas = document.getElementById('matrixHeatmap');
      if (existingCanvas && existingCanvas.parentElement) existingCanvas.style.display = 'none';
      // create fallback container
      let fb = target.querySelector('.heatmap-fallback');
      if (!fb) {
        fb = document.createElement('div'); fb.className = 'heatmap-fallback';
        fb.style.padding = '8px'; fb.style.borderRadius = '8px'; fb.style.background = 'var(--card-bg)';
        target.appendChild(fb);
      }
      // build small pivot table with limited years (to avoid very wide tables)
      const yearsToShow = years.slice(-8); // last 8 years
      let html = '<div class="fallback-msg" style="font-weight:700;margin-bottom:8px;">Heatmap (fallback)</div>';
      html += '<div style="overflow:auto;"><table style="border-collapse:collapse; width:100%"><thead><tr><th style="padding:6px;text-align:left">State</th>';
      yearsToShow.forEach(y => html += `<th style="padding:6px">${y}</th>`);
      html += '</tr></thead><tbody>';
      states.forEach(s => {
        html += `<tr><td style="padding:6px;font-weight:600">${s}</td>`;
        yearsToShow.forEach(y => {
          const v = pivot[s][y] || 0;
          const bg = colorRamp(v, minV, maxV);
          html += `<td style="padding:6px;text-align:center;background:${bg};">${v}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      fb.innerHTML = html;
    } catch(e2){
      console.error('Failed to render fallback heatmap table', e2);
    }
  }
}

function renderLegend(minV, maxV){
  const wrap = document.getElementById('legendWrap');
  if (!wrap) return;
  let html = '<div class="info legend"><strong>Cases</strong><div style="margin-top:8px;display:flex;gap:8px;align-items:center;">';
  for (let i=0;i<=5;i++){
    const v = Math.round(minV + (i/5)*(maxV-minV));
    html += `<span style="display:flex;gap:8px;align-items:center"><span style="width:20px;height:12px;background:${colorRamp(v,minV,maxV)};display:inline-block;border-radius:3px"></span><small style="color:var(--muted)">${formatTick(v)}</small></span>`;
  }
  html += '</div></div>';
  wrap.innerHTML = html;
}

function exportVisibleCSV(){
  try {
    if (matrixChart && matrixChart.data && matrixChart.data.datasets && matrixChart.data.datasets[0]) {
      const xLabels = matrixChart.options.scales.x.labels;
      const yLabels = matrixChart.options.scales.y.labels;
      const data = matrixChart.data.datasets[0].data;
      const grid = {};
      data.forEach(d => { const yr = xLabels[d.x], st = yLabels[d.y]; grid[st] = grid[st]||{}; grid[st][yr]=d.v; });
      const header = ['State', ...xLabels]; const rows=[header.join(',')];
      yLabels.forEach(st=>{ const row=['"'+st.replace(/"/g,'""')+'"']; xLabels.forEach(yr=>row.push(String(grid[st] && grid[st][yr] ? grid[st][yr] : 0))); rows.push(row.join(',')); });
      const blob = new Blob([rows.join('\n')], { type:'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='heatmap_export.csv'; a.click(); URL.revokeObjectURL(url);
      return;
    }
    // fallback: look for generated heatmap-fallback table
    const fb = document.querySelector('.heatmap-fallback table');
    if (fb) {
      const rows = [];
      fb.querySelectorAll('tr').forEach(tr => {
        const cols = Array.from(tr.querySelectorAll('th,td')).map(td=>`"${td.textContent.replace(/"/g,'""')}"`);
        rows.push(cols.join(','));
      });
      const blob = new Blob([rows.join('\n')], { type:'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='heatmap_export.csv'; a.click(); URL.revokeObjectURL(url);
      return;
    }
    alert('No heatmap data available to export');
  } catch(e){ console.error('exportVisibleCSV error', e); alert('Export failed (console)'); }
}

async function loadAll(){
  document.getElementById('selectedInfo') && (document.getElementById('selectedInfo').textContent = `Dataset: ${fileParam} · Year: ${yearParam}`);
  document.getElementById('totalCases') && (document.getElementById('totalCases').textContent = 'Loading...');
  try {
    const [geo, rows] = await Promise.all([ loadGeo(), fetchRows(fileParam) ]);
    // normalize rows
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('No rows found in dataset');
    const years = Array.from(new Set(rows.map(r => Number(r.Year)).filter(Boolean))).sort((a,b)=>a-b);
    const states = Array.from(new Set(rows.map(r => String(r.State).trim()))).sort();
    const pivot = {}; states.forEach(s=>pivot[s]={});
    rows.forEach(r => {
      const s = String(r.State).trim();
      const y = Number(r.Year);
      const c = Number(r.Cases) || 0;
      pivot[s][y] = (pivot[s][y] || 0) + c;
    });
    const stateValues = {}; states.forEach(s=>stateValues[s] = pivot[s][yearParam] || 0);
    const vals = Object.values(stateValues);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const totalUSA = vals.reduce((a,b)=>a+(b||0),0);
    document.getElementById('totalCases') && (document.getElementById('totalCases').textContent = `Total USA Cases (${yearParam}): ${totalUSA.toLocaleString()}`);

    // draw everything (map + charts + heatmap)
    await drawChoropleth(geo, stateValues, minV, maxV);
    drawBar(stateValues, yearParam, minV, maxV);
    drawLine(rows);
    drawHist(vals);
    await drawMatrixHeatmap(pivot, years, states, minV, maxV);
    renderLegend(minV, maxV);

    // resize charts after small delay to ensure container sizes stable
    setTimeout(()=>{ [barChart,lineChart,histChart,matrixChart].forEach(ch => { try{ ch && ch.resize && ch.resize(); }catch(e){} }); }, 200);
  } catch (err) {
    logErr('Failed to load data (see console)', err);
    // display fallback note in heatmap area
    const fb = document.querySelector('.heatmap-fallback') || (() => {
      const wrap = document.querySelector('.heatmap-wrapper') || document.querySelector('main .container') || document.body;
      const el = document.createElement('div'); el.className = 'heatmap-fallback'; el.style.padding = '12px'; el.style.borderRadius='8px'; el.style.background='var(--card-bg)'; wrap.appendChild(el); return el;
    })();
    fb.innerHTML = `<div class="fallback-msg" style="font-weight:700;color:var(--muted)">Heatmap unavailable: ${err.message || 'error'}</div><div style="color:var(--muted)">Open console for details.</div>`;
  }
}

// initial load
loadAll().catch(e => console.error('initial loadAll error', e));

// expose CSV export to header buttons
window.exportVisibleCSV = exportVisibleCSV;



