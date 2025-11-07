/* state.js - state detail charts */
const p = new URLSearchParams(window.location.search);
const stateParam = p.get('state');
const diseaseParam = p.get('disease');

if (!stateParam || !diseaseParam) {
  document.getElementById('stateTitle').textContent = 'Missing parameters';
  throw new Error('Missing state or disease');
}
document.getElementById('stateTitle').textContent = `${stateParam} — Detailed Report`;

async function loadState() {
  const [geoRes, dataBuf] = await Promise.all([ fetch('usa_states.geojson'), fetch(diseaseParam).then(r=>r.arrayBuffer()) ]);
  const geoJson = await geoRes.json();
  const wb = XLSX.read(dataBuf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  // Filter rows for state (case-insensitive)
  let stateRows = rows.filter(r => String(r.State).trim().toLowerCase() === String(stateParam).trim().toLowerCase());
  if (!stateRows.length) {
    stateRows = rows.filter(r => String(r.State).toLowerCase().includes(String(stateParam).toLowerCase()));
  }
  if (!stateRows.length) {
    document.getElementById('rawTable').innerHTML = '<tr><td>No data for state</td></tr>';
    return;
  }

  // raw table
  const cols = Object.keys(stateRows[0]);
  let th = '<tr>' + cols.map(c => `<th style="padding:8px">${c}</th>`).join('') + '</tr>';
  let body = '';
  stateRows.forEach(r => {
    body += '<tr>' + cols.map(c => `<td style="padding:8px">${r[c] ?? ''}</td>`).join('') + '</tr>';
  });
  document.getElementById('rawTable').innerHTML = th + body;

  // timeseries
  const ts = stateRows.map(r => ({ year: Number(r.Year), cases: Number(r.Cases) || 0 })).filter(x=>!isNaN(x.year)).sort((a,b)=>a.year-b.year);
  const years = ts.map(t=>t.year);
  const cases = ts.map(t=>t.cases);

  // Map: highlight state
  const map = L.map('stateMap', { scrollWheelZoom:false }).setView([37.8,-96],4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  L.geoJson(geoJson, {
    style: f => ({
      fillColor: f.properties.NAME.toLowerCase() === stateParam.toLowerCase()? '#ff6b6b' : '#d1d5db',
      weight:1, color:'#fff', fillOpacity: f.properties.NAME.toLowerCase() === stateParam.toLowerCase()?0.85:0.5
    }),
    onEachFeature: (feature, layer) => {
      if (feature.properties.NAME.toLowerCase() === stateParam.toLowerCase()) {
        map.fitBounds(layer.getBounds(), { maxZoom:7 });
        layer.bindPopup(`<b>${feature.properties.NAME}</b>`).openPopup();
      }
    }
  }).addTo(map);

  // summary
  const latest = ts.length ? ts[ts.length-1] : null;
  document.getElementById('stateSummary').textContent = latest ? `Latest (${latest.year}): ${latest.cases.toLocaleString()} cases` : '';

  // Charts
  // Line
  new Chart(document.getElementById('lineChart').getContext('2d'), {
    type:'line',
    data:{ labels: years, datasets: [{ label:'Cases', data:cases, borderColor:'#0f6ef6', backgroundColor:'rgba(15,110,246,0.08)', fill:true, tension:0.3 }]},
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } } }
  });

  // Scatter
  new Chart(document.getElementById('scatterChart').getContext('2d'), {
    type:'scatter',
    data:{ datasets:[{ label:'Cases', data: years.map((y,i)=>({x:y,y:cases[i]})), backgroundColor:'#06b6d4', pointRadius:6 }]},
    options:{ responsive:true, maintainAspectRatio:false, scales:{ x:{ title:{ display:true, text:'Year' } }, y:{ beginAtZero:true } } }
  });

  // Bar
  new Chart(document.getElementById('barChart').getContext('2d'), {
    type:'bar',
    data:{ labels:years, datasets:[{ label:'Yearly Cases', data:cases, backgroundColor:'rgba(16,185,129,0.8)' }]},
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } } }
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
      type:'bar', data:{ labels, datasets:[{ label:'Count', data:counts, backgroundColor:'rgba(99,102,241,0.8)' }] },
      options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } } }
    });
  })();

  // Box plot: simple canvas drawing
  (function(){
    const vals = cases.slice().sort((a,b)=>a-b);
    if (!vals.length) return;
    function quantile(arr,q){
      const pos = (arr.length - 1) * q, base = Math.floor(pos), rest = pos - base;
      return arr[base+1] !== undefined ? arr[base] + rest * (arr[base+1] - arr[base]) : arr[base];
    }
    const q1 = quantile(vals,0.25), q2 = quantile(vals,0.5), q3 = quantile(vals,0.75);
    const min = vals[0], max = vals[vals.length-1];

    const canvas = document.getElementById('boxCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.clientWidth * devicePixelRatio;
    const H = canvas.height = canvas.clientHeight * devicePixelRatio;
    ctx.clearRect(0,0,W,H);
    const pad = 40 * devicePixelRatio;
    const scale = v => pad + ((v - min) / (max - min || 1)) * (W - pad*2);
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 4;
    // whisker
    ctx.beginPath(); ctx.moveTo(scale(min), H/2); ctx.lineTo(scale(max), H/2); ctx.stroke();
    // box
    const left = scale(q1), right = scale(q3), boxH = 60 * devicePixelRatio;
    ctx.fillStyle = 'rgba(99,102,241,0.7)'; ctx.fillRect(left, H/2 - boxH/2, right-left, boxH);
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 3; ctx.strokeRect(left, H/2 - boxH/2, right-left, boxH);
    // median
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(scale(q2), H/2 - boxH/2); ctx.lineTo(scale(q2), H/2 + boxH/2); ctx.stroke();
    // labels
    ctx.fillStyle = '#0f1724'; ctx.font = `${12*devicePixelRatio}px Inter`;
    ctx.fillText(`q1: ${Math.round(q1)}`, left, H/2 + boxH/2 + 20*devicePixelRatio);
    ctx.fillText(`median: ${Math.round(q2)}`, scale(q2)-40*devicePixelRatio, H/2 - boxH/2 - 10*devicePixelRatio);
    ctx.fillText(`q3: ${Math.round(q3)}`, right-40*devicePixelRatio, H/2 + boxH/2 + 20*devicePixelRatio);
    ctx.fillText(`min: ${Math.round(min)}`, scale(min)-20*devicePixelRatio, H/2 + boxH/2 + 20*devicePixelRatio);
    ctx.fillText(`max: ${Math.round(max)}`, scale(max)-20*devicePixelRatio, H/2 + boxH/2 + 20*devicePixelRatio);
  })();

}

loadState().catch(err => { console.error(err); document.getElementById('rawTable').innerHTML = '<tr><td>Error: check console</td></tr>'; });



