/* state.js - scaled charts, tooltips, picks dataset by disease key */

const p = new URLSearchParams(window.location.search);
const stateParam = p.get('state');
const diseaseKey = p.get('disease');
const selectedYear = p.get('year');

if (!stateParam || !diseaseKey) {
  document.getElementById('stateTitle').textContent = 'Missing parameters';
  throw new Error('Missing parameters');
}
document.getElementById('stateTitle').textContent = `${stateParam} — Detailed Report`;

// mapping same as map.js
const datasetsMap = {
  'HIV': 'HIV_data.xlsx',
  'TB': 'TB_data.xlsx',
  'Malaria': 'Malaria_data.xlsx',
  'Dengue': 'Dengue_data.xlsx'
};
function formatTick(v){
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1).replace(/\.0$/,'') + 'k';
  return ''+v;
}
function roundUpNice(n){ if (n<=10) return Math.ceil(n); const p=Math.pow(10,Math.floor(Math.log10(n))); return Math.ceil(n/p)*p; }

async function pickFilenameForKey(key) {
  const base = datasetsMap[key];
  if (!base) throw new Error('No dataset mapping for ' + key);
  const jsonCandidate = base.replace(/\.xlsx$/i, '.json');
  try {
    const r = await fetch(jsonCandidate, { method: 'HEAD' });
    if (r.ok) return jsonCandidate;
  } catch(_) {}
  return base;
}

async function fetchRows(name){
  if (!name) throw new Error('No filename');
  if (name.toLowerCase().endsWith('.json') || name.toLowerCase().endsWith('.csv')) {
    const r = await fetch(name);
    if (!r.ok) throw new Error(`Failed to fetch ${name}`);
    return name.toLowerCase().endsWith('.json') ? await r.json() : (await r.text()).split('\n').slice(1).map(l => {
      const cols = l.split(','); return { Year: cols[0], State: cols[1], Cases: cols[2] };
    });
  } else {
    const buf = await (await fetch(name)).arrayBuffer();
    const wb = XLSX.read(buf); const sheet = wb.Sheets[wb.SheetNames[0]]; return XLSX.utils.sheet_to_json(sheet);
  }
}

async function loadState() {
  try {
    const fname = await pickFilenameForKey(diseaseKey);
    const rows = await fetchRows(fname);
    let stateRows = rows.filter(r => String(r.State).trim().toLowerCase() === String(stateParam).trim().toLowerCase());
    if (!stateRows.length) stateRows = rows.filter(r => String(r.State).toLowerCase().includes(String(stateParam).toLowerCase()));
    if (!stateRows.length) { document.getElementById('rawTable').innerHTML = '<tr><td>No data for state</td></tr>'; return; }

    // render raw table
    const cols = Object.keys(stateRows[0]);
    const th = '<tr>' + cols.map(c=>`<th style="padding:8px">${c}</th>`).join('') + '</tr>';
    const body = stateRows.map(r => '<tr>' + cols.map(c=>`<td style="padding:8px">${r[c] ?? ''}</td>`).join('') + '</tr>').join('');
    document.getElementById('rawTable').innerHTML = th + body;

    // timeseries
    const ts = stateRows.map(r=>({ year: Number(r.Year), cases: Number(r.Cases)||0 })).filter(x=>!isNaN(x.year)).sort((a,b)=>a.year-b.year);
    const years = ts.map(t=>t.year); const cases = ts.map(t=>t.cases);

    // map highlight
    const geo = await (await fetch('usa_states.geojson')).json();
    const map = L.map('stateMap', { scrollWheelZoom:false }).setView([37.8, -96],4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.geoJson(geo, {
      style: f => ({ fillColor: f.properties.NAME.toLowerCase() === stateParam.toLowerCase() ? '#ff6b6b' : '#d1d5db', weight:1, color:'#fff', fillOpacity: f.properties.NAME.toLowerCase()===stateParam.toLowerCase()?0.85:0.5 }),
      onEachFeature: (feature, layer) => { if (feature.properties.NAME.toLowerCase()===stateParam.toLowerCase()){ map.fitBounds(layer.getBounds(), { maxZoom:7 }); layer.bindPopup(`<b>${feature.properties.NAME}</b>`).openPopup(); } }
    }).addTo(map);

    const latest = ts.length ? ts[ts.length-1] : null;
    document.getElementById('stateSummary').textContent = latest ? `Latest (${latest.year}): ${latest.cases.toLocaleString()} cases` : '';

    // Line chart
    const lineCtx = document.getElementById('lineChart').getContext('2d');
    new Chart(lineCtx, {
      type:'line',
      data:{ labels: years, datasets:[{ label:'Cases', data: cases, borderColor:'#0f6ef6', backgroundColor:'rgba(15,110,246,0.08)', fill:true, tension:0.3 }]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ label: it => `${it.raw.toLocaleString()} cases` } } }, scales:{ y:{ beginAtZero:true, suggestedMax: roundUpNice(Math.max(...cases||[0])*1.08), ticks:{ callback: formatTick } } } }
    });

    // Scatter
    new Chart(document.getElementById('scatterChart').getContext('2d'), {
      type:'scatter',
      data:{ datasets:[{ label:'Cases', data: years.map((y,i)=>({x:y, y:cases[i]})), backgroundColor:'#06b6d4', pointRadius:6 }]},
      options:{ responsive:true, maintainAspectRatio:false, scales:{ x:{ title:{ display:true, text:'Year' } }, y:{ beginAtZero:true, ticks:{ callback: formatTick } } }, plugins:{ tooltip:{ callbacks:{ label: ctx => `${ctx.raw.y.toLocaleString()} cases (${ctx.raw.x})` } } } }
    });

   /* Helper used in state.js too */
function niceSuggestedMaxForArr(arr) {
  const maxVal = Math.max(...(arr||[0]));
  if (!isFinite(maxVal) || maxVal <= 0) return 10;
  const raw = maxVal * 1.15;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  return Math.ceil(raw / p) * p;
}

/* --- Bar chart (replace existing) --- */
safeDestroy(window._stateBarChart); // optional if you tracked charts globally
const barCtx = document.getElementById('barChart').getContext('2d');
const barSuggestedMax = niceSuggestedMaxForArr(cases);
window._stateBarChart = new Chart(barCtx, {
  type:'bar',
  data:{ labels: years, datasets:[{ label:'Yearly Cases', data: cases, backgroundColor:'rgba(16,185,129,0.9)', maxBarThickness:48, borderWidth:1, borderColor:'rgba(255,255,255,0.06)'}] },
  options:{
    responsive:true, maintainAspectRatio:false,
    plugins: {
      legend:{ display:false },
      tooltip: {
        callbacks: {
          title: (items) => items && items.length ? `Year ${items[0].label}` : '',
          label: (ctx) => `${ctx.raw.toLocaleString()} cases`
        }
      }
    },
    scales: {
      y: { beginAtZero:true, suggestedMax: barSuggestedMax, ticks:{ callback: formatTick } },
      x: { ticks:{ autoSkip:true, maxRotation:30 } }
    }
  }
});

/* --- Histogram (replace existing) --- */
(function(){
  const vals = cases.slice();
  const n = vals.length || 1;
  // Freedman-Diaconis-inspired bin count
  const sorted = vals.slice().sort((a,b)=>a-b);
  const q1 = sorted[Math.floor((sorted.length-1)*0.25)] || 0;
  const q3 = sorted[Math.floor((sorted.length-1)*0.75)] || 0;
  const iqr = Math.max(0, q3 - q1);
  let bins;
  if (iqr > 0) {
    const h = 2 * iqr / Math.cbrt(n);
    const range = Math.max(...vals) - Math.min(...vals) || 1;
    bins = Math.max(4, Math.min(12, Math.round(range / h) || Math.round(Math.sqrt(n))));
  } else {
    bins = Math.max(4, Math.min(12, Math.round(Math.sqrt(n))));
  }

  const minV = Math.min(...vals) || 0, maxV = Math.max(...vals) || 0;
  const width = (maxV - minV) / (bins || 1) || 1;
  const counts = new Array(bins).fill(0);
  vals.forEach(v => { const idx = Math.min(bins-1, Math.floor((v-minV)/width)); counts[idx] += 1; });
  const labels = new Array(bins).fill(0).map((_,i) => `${Math.round(minV + i*width)}–${Math.round(minV + (i+1)*width)}`);

  safeDestroy(window._stateHistChart);
  const histCtx = document.getElementById('histChart').getContext('2d');
  window._stateHistChart = new Chart(histCtx, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Count', data:counts, backgroundColor:'rgba(99,102,241,0.9)', maxBarThickness:40 }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins: { tooltip:{ callbacks:{ title: (items)=> items && items.length ? items[0].label : '', label: (ctx)=> `${ctx.raw} states` } } },
      scales: { y: { beginAtZero:true }, x:{ ticks:{ autoSkip:true, maxRotation:30 } } }
    }
  });
})();


    // Box plot using plugin
    (function(){
      const vals = cases.slice().sort((a,b)=>a-b);
      if (!vals.length) return;
      const quantile = (arr,q) => {
        const pos = (arr.length-1)*q, base = Math.floor(pos), rest = pos-base;
        return arr[base+1] !== undefined ? arr[base] + rest*(arr[base+1]-arr[base]) : arr[base];
      };
      const q1 = quantile(vals,0.25), median = quantile(vals,0.5), q3 = quantile(vals,0.75), min = vals[0], max = vals[vals.length-1];
      new Chart(document.getElementById('boxChart').getContext('2d'), {
        type:'boxplot',
        data:{ labels:[stateParam], datasets:[{ label:'Distribution', backgroundColor:'rgba(79,70,229,0.7)', borderColor:'#4f46e5', data:[{min,q1,median,q3,max}] }]},
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ label: ctx => {
          const d = ctx.raw; return `min:${d.min} q1:${d.q1} median:${d.median} q3:${d.q3} max:${d.max}`;
        } } } }, scales:{ y:{ beginAtZero:true, ticks:{ callback: formatTick } } } }
      });
    })();

  } catch(err){
    console.error('state load error', err);
    document.getElementById('rawTable').innerHTML = `<tr><td>Error loading state data: ${err.message}</td></tr>`;
  }
}

// theme button on state page
const tbtn = document.getElementById('themeToggleState');
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
if (tbtn) { tbtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙'; tbtn.addEventListener('click', () => {
  const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); tbtn.textContent = t === 'dark' ? '☀️' : '🌙';
}); }

loadState();


