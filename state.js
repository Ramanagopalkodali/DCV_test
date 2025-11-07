// state.js (updated)
// Reads: ?state=StateName&disease=...&year=YYYY (year optional)
// Displays state map highlighted, a table of values, and charts:
// Line (trend), Scatter (cases vs year), Bar (yearly counts), Histogram, Box-like summary.

const params = new URLSearchParams(window.location.search);
const diseaseFile = params.get('disease');
const state = params.get('state');
const selectedYear = params.get('year') ? Number(params.get('year')) : null;

if (!state || !diseaseFile) {
  document.getElementById('state-title').textContent = 'Missing state or disease in URL.';
  throw new Error('Missing state or disease param');
}

document.getElementById('state-title').textContent = `Disease Trends for ${state}`;

// Back button
document.getElementById("backBtn").addEventListener("click", () => {
  window.history.back();
});

async function loadState() {
  const [geoRes, excelRes] = await Promise.all([
    fetch("usa_states.geojson"),
    fetch(diseaseFile)
  ]);
  const geoData = await geoRes.json();
  const excelData = await excelRes.arrayBuffer();
  const wb = XLSX.read(excelData);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);

  // Filter rows for this state
  const stateData = data.filter(r => {
    // match with simple string normalized comparison
    return ( (r["State"] === state) || (String(r["State"]).trim() === String(state).trim()) );
  });

  // If the uploaded excel uses slightly different names, try case-insensitive match
  if (stateData.length === 0) {
    const stateLower = state.toLowerCase();
    const alt = data.filter(r => String(r["State"]).toLowerCase().includes(stateLower));
    if (alt.length) stateData.push(...alt);
  }

  if (stateData.length === 0) {
    document.getElementById("detail-table").innerHTML = "<tr><td>No data found for this state.</td></tr>";
    return;
  }

  // Extract sorted years & cases
  const sorted = stateData
    .map(r => ({ Year: Number(r["Year"]), Cases: Number(r["Cases"] || 0) }))
    .filter(x => !isNaN(x.Year))
    .sort((a,b)=>a.Year - b.Year);

  const years = sorted.map(r => r.Year);
  const cases = sorted.map(r => r.Cases);

  // Show detail table (original rows)
  const columns = Object.keys(stateData[0]);
  let tableHTML = "<tr>" + columns.map(c => `<th>${c}</th>`).join("") + "</tr>";
  stateData.forEach(row => {
    tableHTML += "<tr>" + columns.map(c => `<td>${row[c] ?? ''}</td>`).join("") + "</tr>";
  });
  document.getElementById("detail-table").innerHTML = tableHTML;

  // === Draw state map ===
  const map = L.map('state-map').setView([37.8, -96], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  // Add geojson and highlight the state
  const stateLayer = L.geoJson(geoData, {
    style: feature => ({
      fillColor: feature.properties.NAME === state ? "#e74c3c" : "#ccc",
      weight: 1,
      color: "white",
      fillOpacity: feature.properties.NAME === state ? 0.8 : 0.3
    }),
    onEachFeature: (feature, layer) => {
      if (feature.properties.NAME === state) {
        map.fitBounds(layer.getBounds());
        layer.bindPopup(`<strong>${feature.properties.NAME}</strong>`).openPopup();
      }
    }
  }).addTo(map);

  // If user passed year, show case count for that year (if exists)
  if (selectedYear) {
    const rowForYear = stateData.find(r => Number(r.Year) === selectedYear || Number(r["Year"]) === selectedYear);
    const count = rowForYear ? Number(rowForYear.Cases || rowForYear["Cases"] || 0) : 'No data';
    // insert a small summary under the title
    const summary = document.createElement('div');
    summary.style.margin = '10px 0';
    summary.style.fontWeight = '700';
    summary.textContent = `Cases in ${state} for ${selectedYear}: ${count}`;
    document.querySelector('.dashboard-main-content').insertBefore(summary, document.getElementById('state-map'));
  }

  // === Charts ===

  // Bar chart (yearly counts)
  const barCtx = document.getElementById("barChart").getContext('2d');
  new Chart(barCtx, {
    type: "bar",
    data: {
      labels: years,
      datasets: [{
        label: "Cases",
        data: cases,
        backgroundColor: "rgba(54, 162, 235, 0.6)",
        borderColor: "rgba(54, 162, 235, 1)",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: `${state} - Cases by Year` } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Cases" } },
        x: { title: { display: true, text: "Year" } }
      }
    }
  });

  // Line chart (trend)
  const lineCtx = document.getElementById("lineChart").getContext('2d');
  new Chart(lineCtx, {
    type: "line",
    data: {
      labels: years,
      datasets: [{
        label: "Trend Line",
        data: cases,
        fill: false,
        borderColor: "rgba(255, 99, 132, 1)",
        backgroundColor: "rgba(255, 99, 132, 0.2)",
        tension: 0.3,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: `${state} - Trend Over Time` } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Cases" } },
        x: { title: { display: true, text: "Year" } }
      }
    }
  });

  // Scatter plot (cases vs year)
  const scatterCanvas = document.createElement('canvas');
  scatterCanvas.id = 'scatterChart';
  scatterCanvas.height = 120;
  document.querySelector('.dashboard-main-content').appendChild(document.createElement('hr'));
  const scatterTitle = document.createElement('h3');
  scatterTitle.textContent = 'Scatter: Case distribution over Time';
  scatterTitle.style.textAlign = 'center';
  document.querySelector('.dashboard-main-content').appendChild(scatterTitle);
  document.querySelector('.dashboard-main-content').appendChild(scatterCanvas);

  new Chart(scatterCanvas.getContext('2d'), {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Cases',
        data: years.map((y,i) => ({ x: y, y: cases[i] })),
        pointRadius: 6
      }]
    },
    options: {
      scales: {
        x: { title: { display: true, text: 'Year' } },
        y: { title: { display: true, text: 'Cases' }, beginAtZero: true }
      }
    }
  });

  // Histogram (distribution of all yearly case counts for this state)
  const histCanvas = document.createElement('canvas');
  histCanvas.id = 'stateHistogram';
  histCanvas.height = 120;
  const histTitle = document.createElement('h3');
  histTitle.textContent = 'Histogram: Distribution of case counts';
  histTitle.style.textAlign = 'center';
  document.querySelector('.dashboard-main-content').appendChild(histTitle);
  document.querySelector('.dashboard-main-content').appendChild(histCanvas);

  (function drawHistogram() {
    const vals = cases.slice();
    const buckets = Math.min(10, Math.max(3, Math.round(Math.sqrt(vals.length))));
    const maxV = Math.max(...vals, 1);
    const minV = Math.min(...vals, 0);
    const bucketSize = (maxV - minV) / buckets || 1;
    const counts = new Array(buckets).fill(0);
    vals.forEach(v => {
      const idx = Math.min(buckets - 1, Math.floor((v - minV) / bucketSize));
      counts[idx] += 1;
    });
    const labels = new Array(buckets).fill(0).map((_,i) => `${Math.round(minV + i*bucketSize)}–${Math.round(minV + (i+1)*bucketSize)}`);
    new Chart(histCanvas.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Count', data: counts, backgroundColor: 'rgba(153,102,255,0.7)' }] },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  })();

  // Boxplot-like summary (compute quartiles and draw a simple box)
  const boxTitle = document.createElement('h3');
  boxTitle.textContent = 'Box Plot: Spread & outliers';
  boxTitle.style.textAlign = 'center';
  document.querySelector('.dashboard-main-content').appendChild(boxTitle);
  const boxCanvas = document.createElement('canvas');
  boxCanvas.id = 'boxCanvas';
  boxCanvas.height = 100;
  boxCanvas.style.maxWidth = '700px';
  boxCanvas.style.display = 'block';
  boxCanvas.style.margin = '10px auto';
  document.querySelector('.dashboard-main-content').appendChild(boxCanvas);

  (function drawBox() {
    const vals = cases.slice().sort((a,b)=>a-b);
    if (vals.length === 0) return;
    function q(arr, p) {
      const pos = (arr.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      if (arr[base+1] !== undefined) return arr[base] + rest * (arr[base+1] - arr[base]);
      return arr[base];
    }
    const min = vals[0], max = vals[vals.length-1], median = q(vals, .5), q1 = q(vals, .25), q3 = q(vals, .75);
    const ctx = boxCanvas.getContext('2d');
    ctx.clearRect(0,0,boxCanvas.width, boxCanvas.height);
    // Responsive drawing
    const W = boxCanvas.width = Math.min(800, document.body.clientWidth - 40);
    const H = boxCanvas.height = 120;
    // Scale
    const pad = 40;
    const scale = (v) => pad + ((v - min) / (max - min || 1)) * (W - pad*2);
    // Draw line for min-max
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scale(min), H/2);
    ctx.lineTo(scale(max), H/2);
    ctx.stroke();
    // Draw box
    const left = scale(q1), right = scale(q3), boxH = 36;
    ctx.fillStyle = 'rgba(100,150,255,0.6)';
    ctx.fillRect(left, (H/2 - boxH/2), (right - left), boxH);
    ctx.strokeRect(left, (H/2 - boxH/2), (right - left), boxH);
    // Median
    ctx.beginPath();
    ctx.moveTo(scale(median), H/2 - boxH/2);
    ctx.lineTo(scale(median), H/2 + boxH/2);
    ctx.strokeStyle = '#ff5252';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Whiskers
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(scale(min), H/2 - 10); ctx.lineTo(scale(min), H/2 + 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(scale(max), H/2 - 10); ctx.lineTo(scale(max), H/2 + 10); ctx.stroke();
    // Labels
    ctx.fillStyle = '#222';
    ctx.font = '12px sans-serif';
    ctx.fillText(`min: ${min}`, scale(min) - 10, H/2 + 30);
    ctx.fillText(`q1: ${Math.round(q1)}`, left, H/2 + 30);
    ctx.fillText(`median: ${Math.round(median)}`, scale(median) - 20, H/2 - boxH/2 - 10);
    ctx.fillText(`q3: ${Math.round(q3)}`, right - 30, H/2 + 30);
    ctx.fillText(`max: ${max}`, scale(max) - 10, H/2 + 30);
  })();

}

loadState().catch(err => {
  console.error(err);
  document.getElementById('detail-table').innerHTML = "<tr><td>Error loading state data. See console.</td></tr>";
});


