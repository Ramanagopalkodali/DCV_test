/* state.js - fixed scaling and ticks formatting (uses boxplot plugin) */
const p = new URLSearchParams(window.location.search);
const stateParam = p.get('state');
const diseaseParam = p.get('disease');

if (!stateParam || !diseaseParam) {
  document.getElementById('stateTitle').textContent = 'Missing parameters';
  throw new Error('Missing state or disease');
}
document.getElementById('stateTitle').textContent = `${stateParam} — Detailed Report`;

function formatTick(val) {
  if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(1).replace(/\.0$/,'') + 'k';
  return ''+val;
}
function roundUpNice(n) {
  if (n <= 10) return Math.ceil(n);
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / p) * p;
}

async function loadState() {
  const [geoRes, dataBuf] = await Promise.all([ fetch('usa_states.geojson'), fetch(diseaseParam).then(r=>r.arrayBuffer()) ]);
  const geoJson = await geoRes.json();
  const wb = XLSX.read(dataBuf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  let stateRows = rows.filter(r => String(r.State).trim().toLowerCase() === String(stateParam).trim().toLowerCase());
  if (!stateRows.length) stateRows = rows.filter(r => String(r.State).toLowerCase().includes(String(stateParam).toLowerCase()));
  if (!stateRows.length) {
    document.getElementById('rawTable').innerHTML = '<tr><td>No data for state</td></tr>';
    return;
  }

  // raw table
  const cols = Object.keys(stateRows[0]);
  let th = '<tr>' + cols.map(c => `<th style="padding:8px">${c}</th>`).join('') + '</tr>';
  let body = '';
  stateRows.forEach(r => body += '<tr>' + cols.map(c => `<td style="padding:8px">${r[c] ?? ''}</td>`).join('') + '</tr>');
  document.getElementById('rawTable').innerHTML = th + body;

  const ts = stateRows.map(r => ({ year: Number(r.Year), cases: Number(r.Cases) || 0 })).filter(x=>!isNaN(x.year)).sort((a,b)=>a.year-b.year);
  const years = ts.map(t=>t.year);
  const cases = ts.map(t=>t.cases);

  // Map: highlight state
  const map = L.map('stateMap', { scrollWheelZoom:false }).setView([37.8,-96],4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  L.geoJson(geoJson, {
    style: f => ({ fillColor: f.properties.NAME.toLowerCase() === stateParam.toLowerCase()? '#ff6b6b' : '#d1d5db', weight:1, color:'#fff', fillOpacity: f.properties.NAME.toLowerCase() === stateParam.toLowerCase()?0.85:0.5 }),
    onEachFeature: (feature, layer) => {
      if (feature.properties.NAME.toLowerCase() === stateParam.toLowerCase()) {
        map.fitBounds(layer.getBounds(), { maxZoom:7 });
        layer.bindPopup(`<b>${feature.properties.NAME}</b>`).openPopup();
      }
    }
  }).addTo(map);

  const latest = ts.length ? ts[ts.length-1] : null;
  document.getElementById('stateSummary').textContent = latest ? `Latest (${latest.year}): ${latest.cases.toLocaleString()} cases` : '';

  // Line chart
  const lineCtx = document.getElementById('lineChart').getContext('2d');
  new Chart(lineCtx, {
    type:'line',
    data:{ labels: years, datasets: [{ label:'Cases', data:cases, borderColor:'#0f6ef6', backgroundColor:'rgba(15,110,246,0.08)', fill:true, tension:0.3 }]},
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true, suggestedMax: roundUpNice(Math.max(...cases)*1.08), ticks:{ callback: v => formatTick(v) } } } }
  });

  // Scatter
  const scatterCtx = document.getElementById('scatterChart').getContext('2d');
  new Chart(scatterCtx, {
    type:'scatter',
    data:{ datasets:[{ label:'Cases', data: years.map((y,i)=>({x:y,y:cases[i]})), backgroundColor:'#06b6d4', pointRadius:6 }]},
    options:{ responsive:true, maintainAspectRatio:false, scales:{ x:{ title:{ display:true, text:'Year' } }, y:{ beginAtZero:true, ticks:{ callback: v => formatTick(v) } } } }
  });

  // Bar
  const barCtx = document.getElementById('barChart').getContext('2d');
  new Chart(barCtx, {
    type:'bar',
    data:{ labels: years, datasets:[{ label:'Yearly Cases', data:cases, backgroundColor:'rgba(16,185,129,0.8)', maxBarThickness: 48 }]},
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true, suggestedMax: roundUpNice(Math.max(...cases)*1.08), ticks:{ callback: v => formatTick(v) } } } }
  });

  // Histogram
  (function(){
    const vals = cases.slice();
    const buckets = Math.min(8, Math.max(3, Math.round(Math.sqrt(vals.length))));
    const minV = Math.min(...vals), maxV=Math.max(...vals);
    const size = (maxV-minV)/(buckets||1) || 1;
    const counts = new Array(buckets).fill(0);
    vals.forEach(v => { const idx = Math.min(buckets-1, Math.floor((v-minV)/size)); counts[idx] += 1; });
    const labels = new Array(buckets).fill(0).map((_,i)=>`${Math.round(minV+i*size)}–${Math.round(minV+(i+1)*size)}`);
    new Chart(document.getElementById('histChart').getContext('2d'), {
      type:'bar', data:{ labels, datasets:[{ label:'Count', data:counts, backgroundColor:'rgba(99,102,241,0.8)', maxBarThickness:40 }] },
      options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } } }
    });
  })();

  // Boxplot via plugin
  (function(){
    const vals = cases.slice().sort((a,b)=>a-b);
    if (!vals.length) return;
    function q(arr,qv){ const pos=(arr.length-1)*qv, b=Math.floor(pos), r=pos-b; return arr[b+1] !== undefined ? arr[b] + r*(arr[b+1]-arr[b]) : arr[b]; }
    const q1 = q(vals,0.25), median = q(vals,0.5), q3 = q(vals,0.75), min = vals[0], max = vals[vals.length-1];

    const ctx = document.getElementById('boxChart').getContext('2d');
    new Chart(ctx, {
      type: 'boxplot',
      data: {
        labels: [stateParam],
        datasets: [{
          label: 'Distribution',
          backgroundColor: 'rgba(79,70,229,0.7)',
          borderColor: '#4f46e5',
          data: [{ min, q1, median, q3, max }]
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: (ctx) => {
          const d = ctx.raw; if (!d) return ''; return `min:${d.min} q1:${d.q1} median:${d.median} q3:${d.q3} max:${d.max}` } } } },
        scales:{ y:{ beginAtZero:true, ticks:{ callback: v => formatTick(v) } } }
      }
    });
  })();
}

loadState().catch(err => { console.error(err); document.getElementById('rawTable').innerHTML = '<tr><td>Error: check console</td></tr>'; });



