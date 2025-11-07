/* map.js - choropleth + national charts with improved layout */
const params = new URLSearchParams(window.location.search);
let fileParam = params.get('disease') || 'HIV_data.xlsx';
let yearParam = params.get('year') || null;

// UI elements
const dsSelect = document.getElementById('dsSelect');
const yearInput = document.getElementById('yearSelect');
const reloadBtn = document.getElementById('reloadBtn');
const downloadCSVBtn = document.getElementById('downloadCSV');
const totalCasesEl = document.getElementById('totalCases');
const selectedInfoEl = document.getElementById('selectedInfo');
const heatmapWrap = document.getElementById('heatmapWrap');
const legendWrap = document.getElementById('legendWrap');

// example dataset list (update as needed)
const datasets = [
  'HIV_data.xlsx',
  'TB_data.xlsx',
  'Malaria_data.xlsx',
  'Dengue_data.xlsx'
];
datasets.forEach(d => {
  const o = document.createElement('option'); o.value = d; o.textContent = d;
  dsSelect.appendChild(o);
});
dsSelect.value = fileParam;
yearInput.value = yearParam || 2019;

reloadBtn.addEventListener('click', () => {
  fileParam = dsSelect.value; yearParam = Number(yearInput.value);
  loadAll();
});
downloadCSVBtn.addEventListener('click', exportVisibleCSV);

let geoDataGlobal = null;

async function loadGeo() {
  if (geoDataGlobal) return geoDataGlobal;
  const res = await fetch('usa_states.geojson');
  geoDataGlobal = await res.json();
  return geoDataGlobal;
}

function getColorRamp(value, min, max) {
  if (value == null) return '#efefef';
  const ratio = (value - min) / (max - min || 1);
  const r = Math.round(255 * ratio);
  const g = Math.round(200 - 150 * ratio);
  const b = Math.round(50 + 100 * (1 - ratio));
  return `rgb(${r},${g},${b})`;
}

async function loadAll() {
  const ds = fileParam;
  const year = Number(yearParam);

  selectedInfoEl.textContent = `Dataset: ${ds} · Year: ${year}`;
  totalCasesEl.textContent = 'Loading...';

  const [geo, excelBuf] = await Promise.all([ loadGeo(), fetch(ds).then(r => r.arrayBuffer()) ]);
  const wb = XLSX.read(excelBuf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  // pivot and aggregates
  const years = Array.from(new Set(rows.map(r => Number(r.Year)).filter(Boolean))).sort((a,b)=>a-b);
  const states = Array.from(new Set(rows.map(r => String(r.State).trim()))).sort();

  // pivot: state->year->cases
  const pivot = {};
  states.forEach(s => pivot[s] = {});
  rows.forEach(r => {
    const s = String(r.State).trim();
    const y = Number(r.Year);
    const c = Number(r.Cases) || 0;
    pivot[s][y] = (pivot[s][y] || 0) + c;
  });

  // compute per-state for selected year
  const stateValues = {};
  states.forEach(s => stateValues[s] = pivot[s][year] || 0);

  const valuesArr = Object.values(stateValues);
  const minV = Math.min(...valuesArr);
  const maxV = Math.max(...valuesArr);

  // total USA
  const totalUSA = valuesArr.reduce((a,b)=>a+(b||0),0);
  totalCasesEl.textContent = `Total USA Cases (${year}): ${totalUSA.toLocaleString()}`;

  // draw map
  drawChoropleth(geo, stateValues, minV, maxV);

  // charts
  drawBar(stateValues, year, minV, maxV);
  drawLine(rows);
  drawHist(valuesArr);
  renderHeatmap(pivot, years, states, minV, maxV);

  // legend
  renderLegend(minV, maxV);
}

let leafletMap = null;
function drawChoropleth(geo, stateValues, minV, maxV) {
  if (!leafletMap) {
    leafletMap = L.map('map', { scrollWheelZoom:false }).setView([37.8, -96], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(leafletMap);
  }
  // clear previous layers
  leafletMap.eachLayer(layer => {
    if (layer && layer.options && !layer.options.attribution) leafletMap.removeLayer(layer);
  });
  // re-add tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(leafletMap);

  function style(feature) {
    const name = feature.properties.NAME;
    const v = stateValues[name];
    return {
      fillColor: getColorRamp(v, minV, maxV),
      weight: 1,
      color: '#ffffff',
      fillOpacity: 0.92
    };
  }

  function onEach(feature, layer) {
    const name = feature.properties.NAME;
    const v = stateValues[name] != null ? stateValues[name] : 'No data';
    layer.bindTooltip(`<strong>${name}</strong><br/>Cases: ${v}`, { direction: 'auto' });
    layer.on('click', () => {
      window.location.href = `state.html?state=${encodeURIComponent(name)}&disease=${encodeURIComponent(fileParam)}&year=${yearInput.value}`;
    });
  }

  L.geoJson(geo, { style, onEachFeature: onEach }).addTo(leafletMap);
}

let barChart = null;
function drawBar(stateValues, year, minV, maxV) {
  const ctx = document.getElementById('casesBar').getContext('2d');
  const labels = Object.keys(stateValues);
  const data = Object.values(stateValues);
  const bg = data.map(v => getColorRamp(v, minV, maxV));

  if (barChart) barChart.destroy();
  barChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets:[{ label:`Cases (${year})`, data, backgroundColor:bg }]},
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top' }},
      scales: {
        x: { ticks:{ maxRotation:45, minRotation:30, autoSkip:true, maxTicksLimit:12 }, grid:{ display:false }},
        y: { beginAtZero:true, title:{ display:true, text:'Cases' } }
      }
    }
  });
}

let lineChart = null;
function drawLine(rows) {
  const yearAgg = {};
  rows.forEach(r => { const y=Number(r.Year); if (!y) return; yearAgg[y] = (yearAgg[y]||0) + (Number(r.Cases)||0) });
  const yrs = Object.keys(yearAgg).map(Number).sort((a,b)=>a-b);
  const vals = yrs.map(y => yearAgg[y]);
  const ctx = document.getElementById('casesLine').getContext('2d');
  if (lineChart) lineChart.destroy();
  lineChart = new Chart(ctx, {
    type: 'line',
    data: { labels: yrs, datasets: [{ label:'USA total', data: vals, borderWidth:2, fill:true, tension:0.3 }]},
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }},
      scales:{ y:{ beginAtZero:true }, x:{ title:{ display:true, text:'Year' } } }
    }
  });
}

let histChart = null;
function drawHist(values) {
  const buckets = 7;
  const minV = Math.min(...values); const maxV = Math.max(...values);
  const size = (maxV-minV)/(buckets||1) || 1;
  const counts = new Array(buckets).fill(0);
  values.forEach(v => {
    const idx = Math.min(buckets-1, Math.floor((v-minV)/size));
    counts[idx] += 1;
  });
  const labels = new Array(buckets).fill(0).map((_,i)=>`${Math.round(minV+i*size)}–${Math.round(minV+(i+1)*size)}`);
  const ctx = document.getElementById('casesHist').getContext('2d');
  if (histChart) histChart.destroy();
  histChart = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ label:'States', data:counts, backgroundColor:'rgba(79,70,229,0.75)'}] },
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } } }
  });
}

function renderHeatmap(pivot, years, states, minV, maxV) {
  // build table quickly
  let html = `<table class="heatmap-table"><thead><tr><th>State</th>`;
  years.forEach(y => html += `<th>${y}</th>`);
  html += `</tr></thead><tbody>`;
  states.forEach(s => {
    html += `<tr><td style="text-align:left; font-weight:600;">${s}</td>`;
    years.forEach(y => {
      const v = pivot[s][y] || 0;
      const bg = getColorRamp(v, minV, maxV);
      html += `<td data-s="${s}" data-y="${y}" style="background:${bg}; cursor:pointer;">${v}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  heatmapWrap.innerHTML = html;

  // click handler
  heatmapWrap.querySelectorAll('td[data-s]').forEach(td => {
    td.addEventListener('click', e => {
      const s = td.dataset.s; const y = td.dataset.y;
      window.location.href = `state.html?state=${encodeURIComponent(s)}&disease=${encodeURIComponent(fileParam)}&year=${y}`;
    });
  });
}

function renderLegend(minV, maxV) {
  const steps = 5;
  let html = `<div class="info legend"><strong>Cases</strong><div style="margin-top:8px; display:flex; gap:8px; align-items:center;">`;
  for (let i=0;i<=steps;i++){
    const v = Math.round(minV + (i/(steps||1))*(maxV-minV));
    html += `<span style="display:flex; gap:8px; align-items:center;"><span style="width:20px;height:12px;background:${getColorRamp(v,minV,maxV)};display:inline-block;border-radius:3px;"></span><small style="color:var(--muted)">${v}</small></span>`;
  }
  html += `</div></div>`;
  legendWrap.innerHTML = html;
}

function exportVisibleCSV() {
  // export current pivot (heatmap table) to CSV
  const rows = heatmapWrap.querySelectorAll('table tr');
  if (!rows.length) return alert('No data to export');
  const arr = [];
  rows.forEach(tr => {
    const cols = Array.from(tr.querySelectorAll('th,td')).map(cell => `"${String(cell.textContent).replace(/"/g,'""')}"`);
    arr.push(cols.join(','));
  });
  const csv = arr.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'heatmap_export.csv'; a.click();
  URL.revokeObjectURL(url);
}

// init
loadAll().catch(err => {
  console.error(err);
  selectedInfoEl.textContent = 'Error loading dataset — check console.';
});


