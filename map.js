/* map.js - updated: sessionStorage restore, header controls, CSV download, formatting ticks */
const urlParams = new URLSearchParams(window.location.search);
let initialFile = urlParams.get('disease') || sessionStorage.getItem('lastDataset') || 'HIV_data.xlsx';
let initialYear = urlParams.get('year') || sessionStorage.getItem('lastYear') || (new Date()).getFullYear() - 1;

// Header controls
const dsSelectHeader = document.getElementById('dsSelectHeader');
const yearSelectHeader = document.getElementById('yearSelectHeader');
const loadHeader = document.getElementById('loadHeader');
const downloadCSVHeader = document.getElementById('downloadCSVHeader');
const themeToggleHeader = document.getElementById('themeToggleHeader');

dsSelectHeader.value = initialFile;
yearSelectHeader.value = initialYear;

// theme toggle (persist)
const setTheme = (t) => { document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); themeToggleHeader.textContent = t === 'dark' ? '☀️' : '🌙'; }
const savedTheme = localStorage.getItem('theme') || 'light';
setTheme(savedTheme);
themeToggleHeader.addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark') );

// expose header download button to call export (map.js defines function later)
downloadCSVHeader.addEventListener('click', () => { if (typeof exportVisibleCSV === 'function') exportVisibleCSV(); else alert('No data yet'); });
loadHeader.addEventListener('click', () => {
  initialFile = dsSelectHeader.value;
  initialYear = yearSelectHeader.value;
  sessionStorage.setItem('lastDataset', initialFile);
  sessionStorage.setItem('lastYear', initialYear);
  loadAll();
});

// helper: SI formatting for ticks
function formatTick(val) {
  if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(1).replace(/\.0$/,'') + 'k';
  return ''+val;
}

// load geo (cached)
let geoCache = null;
async function loadGeo() {
  if (geoCache) return geoCache;
  const r = await fetch('usa_states.geojson'); geoCache = await r.json(); return geoCache;
}

// detect JSON vs XLSX
function isJSON(name){ return name.toLowerCase().endsWith('.json') || name.toLowerCase().endsWith('.csv'); }
async function loadRows(name) {
  if (isJSON(name)) {
    if (name.toLowerCase().endsWith('.json')) return await (await fetch(name)).json();
    // CSV
    const txt = await (await fetch(name)).text();
    const lines = txt.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(l => {
      const cols = l.split(',');
      const obj = {}; headers.forEach((h,i)=>obj[h]=cols[i]); return obj;
    });
  } else {
    const buf = await (await fetch(name)).arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  }
}

// color ramp
function colorRamp(v, min, max) {
  if (v == null) return '#efefef';
  const ratio = (v - min) / (max - min || 1);
  const r = Math.round(220 * ratio + 30 * (1 - ratio));
  const g = Math.round(230 - 180 * ratio);
  const b = Math.round(80 + 120 * (1 - ratio));
  return `rgb(${r},${g},${b})`;
}

/* Chart instances (global so we can update/destroy) */
let barChart = null, lineChart = null, histChart = null, matrixChart = null;
let leafletMap = null;

// restore map state from sessionStorage if present
function restoreMapState() {
  const s = sessionStorage.getItem('mapState');
  if (!s) return null;
  try { return JSON.parse(s); } catch(e){ return null; }
}

// save map state before navigation
function saveMapState() {
  if (!leafletMap) return;
  const c = leafletMap.getCenter();
  const zoom = leafletMap.getZoom();
  const state = { center: [c.lat, c.lng], zoom, dataset: initialFile, year: initialYear };
  sessionStorage.setItem('mapState', JSON.stringify(state));
}

// draw choropleth and restore view if available
async function drawChoropleth(geo, stateValues, minV, maxV) {
  if (!leafletMap) {
    leafletMap = L.map('map', { scrollWheelZoom:false }).setView([37.8, -96], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(leafletMap);
  } else {
    // remove existing geojson layers
    leafletMap.eachLayer(l => { if (l && l instanceof L.GeoJSON) leafletMap.removeLayer(l); });
  }

  function style(f) {
    const name = f.properties.NAME;
    const v = stateValues[name];
    return { fillColor: colorRamp(v, minV, maxV), weight:1, color:'#fff', fillOpacity:0.92 };
  }
  function onEach(f, layer) {
    const name = f.properties.NAME;
    const v = stateValues[name] != null ? stateValues[name] : 'No data';
    layer.bindTooltip(`<strong>${name}</strong><br/>Cases: ${v}`, { direction:'auto' });
    layer.on('click', () => {
      // save map state before navigation
      saveMapState();
      // navigate with query params
      window.location.href = `state.html?state=${encodeURIComponent(name)}&disease=${encodeURIComponent(initialFile)}&year=${encodeURIComponent(initialYear)}`;
    });
  }
  L.geoJson(geo, { style, onEachFeature: onEach }).addTo(leafletMap);

  // restore previous view if dataset/year match
  const st = restoreMapState();
  if (st && st.dataset === initialFile && String(st.year) === String(initialYear)) {
    leafletMap.setView(st.center, st.zoom);
  }
}

// utility: nice round up for suggestedMax
function roundUpNice(n) {
  if (n <= 10) return Math.ceil(n);
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / p) * p;
}

/* Draw charts with formatted ticks */
function drawBar(stateValues, year, minV, maxV) {
  const ctx = document.getElementById('casesBar').getContext('2d');
  const labels = Object.keys(stateValues);
  const data = Object.values(stateValues);
  const bg = data.map(v => colorRamp(v, minV, maxV));

  const suggestedMax = roundUpNice(Math.max(...data) * 1.08);

  if (barChart) barChart.destroy();
  barChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label:`Cases (${year})`, data, backgroundColor: bg, maxBarThickness: 48 }]},
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{ display:false }, tooltip:{ callbacks:{ label: (ctx) => `Cases: ${ctx.raw.toLocaleString()}` } } },
      scales: {
        x: { ticks:{ maxRotation:45, minRotation:30, autoSkip:true, maxTicksLimit:14 }, grid:{ display:false } },
        y: { beginAtZero:true, suggestedMax, ticks:{ callback: val => formatTick(val) }, title:{ display:false } }
      }
    }
  });
}

function drawLine(rows) {
  const yearAgg = {};
  rows.forEach(r => { const y = Number(r.Year); if (!y) return; yearAgg[y] = (yearAgg[y] || 0) + (Number(r.Cases) || 0); });
  const yrs = Object.keys(yearAgg).map(Number).sort((a,b)=>a-b);
  const vals = yrs.map(y => yearAgg[y]);
  const ctx = document.getElementById('casesLine').getContext('2d');
  const suggestedMax = roundUpNice(Math.max(...vals) * 1.08);
  if (lineChart) lineChart.destroy();
  lineChart = new Chart(ctx, {
    type: 'line',
    data: { labels: yrs, datasets: [{ label:'USA total', data: vals, borderColor:'#0f6ef6', backgroundColor:'rgba(15,110,246,0.08)', fill:true, tension:0.3 }]},
    options: {
      responsive:true, maintainAspectRatio:false,
      scales: { y:{ beginAtZero:true, suggestedMax, ticks:{ callback: v => formatTick(v) } }, x:{ title:{ display:true, text:'Year' } } }
    }
  });
}

function drawHist(values) {
  const buckets = Math.min(10, Math.max(4, Math.round(Math.sqrt(values.length))));
  const minV = Math.min(...values), maxV = Math.max(...values);
  const size = (maxV - minV) / (buckets || 1) || 1;
  const counts = new Array(buckets).fill(0);
  values.forEach(v => { const idx = Math.min(buckets-1, Math.floor((v-minV)/size)); counts[idx] += 1; });
  const labels = new Array(buckets).fill(0).map((_,i)=>`${Math.round(minV+i*size)}–${Math.round(minV+(i+1)*size)}`);
  const ctx = document.getElementById('casesHist').getContext('2d');
  if (histChart) histChart.destroy();
  histChart = new Chart(ctx, {
    type:'bar',
    data: { labels, datasets: [{ label:'States', data: counts, backgroundColor:'rgba(79,70,229,0.75)', maxBarThickness: 40 }] },
    options: { responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true, ticks:{ callback: v => v } } } }
  });
}

/* Matrix heatmap */
let matrixCanvas = document.getElementById('matrixHeatmap');
function drawMatrixHeatmap(pivot, years, states, minV, maxV) {
  // build data array with x = year index, y = state index, v = value
  const xLabels = years.map(String);
  const yLabels = states.slice();
  const data = [];
  years.forEach((yr, xi) => {
    states.forEach((st, yi) => {
      const v = pivot[st][yr] || 0;
      data.push({ x: xi, y: yi, v });
    });
  });

  if (matrixChart) matrixChart.destroy();
  const ctx = matrixCanvas.getContext('2d');

  matrixChart = new Chart(ctx, {
    type: 'matrix',
    data: {
      datasets: [{
        label: 'State×Year',
        data,
        width: ({chart}) => (chart.chartArea.width / xLabels.length) - 1,
        height: ({chart}) => (chart.chartArea.height / yLabels.length) - 1,
        backgroundColor: ctx => colorRamp(ctx.dataset.data[ctx.dataIndex].v, minV, maxV),
      }]
    },
    options: {
      maintainAspectRatio:false,
      plugins: {
        tooltip: {
          callbacks: {
            title: items => {
              const it = items[0];
              const dp = it.dataset.data[it.dataIndex];
              return `${yLabels[dp.y]} — ${xLabels[dp.x]}`;
            },
            label: item => `Cases: ${item.dataset.data[item.dataIndex].v.toLocaleString()}`
          }
        }
      },
      scales: {
        x: { type:'category', labels: xLabels, position:'bottom', grid:{ display:false }, ticks:{ maxRotation:45, minRotation:30, autoSkip:true, maxTicksLimit:10 } },
        y: { type:'category', labels: yLabels, grid:{ display:false }, ticks:{ autoSkip:true, maxTicksLimit:20 } }
      },
      onClick: (evt, elems) => {
        if (!elems.length) return;
        const el = elems[0];
        const dp = matrixChart.data.datasets[el.datasetIndex].data[el.index];
        const year = xLabels[dp.x];
        const state = yLabels[dp.y];
        saveMapState();
        window.location.href = `state.html?state=${encodeURIComponent(state)}&disease=${encodeURIComponent(initialFile)}&year=${year}`;
      }
    }
  });
}

/* Small legend builder */
function renderLegend(minV, maxV) {
  const wrap = document.getElementById('legendWrap');
  let html = '<div class="info legend"><strong>Cases</strong><div style="display:flex; gap:8px; margin-top:8px; align-items:center;">';
  const steps = 5;
  for (let i=0;i<=steps;i++){
    const v = Math.round(minV + (i/steps)*(maxV-minV));
    html += `<span style="display:flex; gap:8px; align-items:center;"><span style="width:20px;height:12px;background:${colorRamp(v,minV,maxV)};display:inline-block;border-radius:3px;"></span><small style="color:var(--muted)">${formatTick(v)}</small></span>`;
  }
  html += '</div></div>';
  wrap.innerHTML = html;
}

/* CSV export for matrix (uses matrixChart data) */
function exportVisibleCSV() {
  if (!matrixChart) { alert('No heatmap loaded yet'); return; }
  const xLabels = matrixChart.options.scales.x.labels;
  const yLabels = matrixChart.options.scales.y.labels;
  const data = matrixChart.data.datasets[0].data;
  // build grid
  const grid = {};
  data.forEach(d => {
    const yr = xLabels[d.x]; const st = yLabels[d.y];
    grid[st] = grid[st] || {}; grid[st][yr] = d.v;
  });
  const header = ['State', ...xLabels];
  const rows = [header.join(',')];
  yLabels.forEach(st => {
    const row = [ `"${st.replace(/"/g,'""')}"` ];
    xLabels.forEach(yr => row.push( String(grid[st] && grid[st][yr] ? grid[st][yr] : 0) ));
    rows.push(row.join(','));
  });
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download = 'heatmap_export.csv'; a.click(); URL.revokeObjectURL(url);
}

/* MAIN load function */
async function loadAll() {
  // use header controls values
  initialFile = dsSelectHeader.value || initialFile;
  initialYear = yearSelectHeader.value || initialYear;
  sessionStorage.setItem('lastDataset', initialFile);
  sessionStorage.setItem('lastYear', initialYear);

  document.getElementById('selectedInfo').textContent = `Dataset: ${initialFile} · Year: ${initialYear}`;
  document.getElementById('totalCases').textContent = 'Loading...';

  try {
    const [geo, rows] = await Promise.all([ loadGeo(), loadRows(initialFile) ]);
    // normalize
    const yrs = Array.from(new Set(rows.map(r=>Number(r.Year)).filter(Boolean))).sort((a,b)=>a-b);
    const states = Array.from(new Set(rows.map(r=>String(r.State).trim()))).sort();
    // pivot
    const pivot = {}; states.forEach(s=>pivot[s]={});
    rows.forEach(r => { const s = String(r.State).trim(); const y = Number(r.Year); const c = Number(r.Cases)||0; pivot[s][y] = (pivot[s][y]||0) + c; });

    const stateValues = {}; states.forEach(s=>stateValues[s]=pivot[s][initialYear]||0);
    const vals = Object.values(stateValues);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const totalUSA = vals.reduce((a,b)=>a+(b||0),0);
    document.getElementById('totalCases').textContent = `Total USA Cases (${initialYear}): ${totalUSA.toLocaleString()}`;

    // draw map, charts, heatmap
    drawChoropleth(geo, stateValues, minV, maxV);
    drawBar(stateValues, initialYear, minV, maxV);
    drawLine(rows);
    drawHist(vals);
    drawMatrixHeatmap(pivot, yrs, states, minV, maxV);
    renderLegend(minV, maxV);

    // after charts created, ensure they resize properly
    [barChart, lineChart, histChart, matrixChart].forEach(ch => { if (ch && typeof ch.resize === 'function') ch.resize(); });
  } catch (err) {
    console.error(err);
    document.getElementById('selectedInfo').textContent = 'Failed to load data (see console)';
  }
}

// restore header controls from session or query
(function initFromSession() {
  const st = restoreMapState();
  if (st) {
    if (!dsSelectHeader.value) dsSelectHeader.value = st.dataset;
    if (!yearSelectHeader.value) yearSelectHeader.value = st.year;
  }
})();

// load on open
loadAll();

// Expose export function to header's CSV download
window.exportVisibleCSV = exportVisibleCSV;


