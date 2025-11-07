// map.js - Updated to add line chart, histogram, heatmap pivot, total cases display, hover popups and redirect including the year.

// Optional state name fixes if your Excel uses variations
const stateNameFix = {
  "New York State": "New York",
  "Calif.": "California",
  "DC": "District of Columbia"
};

const params = new URLSearchParams(window.location.search);
const diseaseFile = params.get('disease');
const selectedYear = parseInt(params.get('year'));

if (!diseaseFile || isNaN(selectedYear)) {
  document.getElementById('selectedInfo').textContent = 'Missing disease file or year in URL.';
  throw new Error('Missing disease or year');
}

document.getElementById('selectedInfo').textContent = `Viewing: ${decodeURIComponent(diseaseFile)} — Year: ${selectedYear}`;

// Initialize map
const map = L.map('map').setView([37.8, -96], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

async function loadMap() {
  const [geoRes, excelRes] = await Promise.all([
    fetch('usa_states.geojson'),
    fetch(diseaseFile)
  ]);

  const geoData = await geoRes.json();
  const excelData = await excelRes.arrayBuffer();
  const workbook = XLSX.read(excelData);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  // Aggregate by state for selectedYear
  const yearData = rows.filter(r => Number(r["Year"]) === selectedYear);
  const dataMap = {};
  yearData.forEach(r => {
    const raw = r["State"];
    const corrected = stateNameFix[raw] || raw;
    dataMap[corrected] = (dataMap[corrected] || 0) + Number(r["Cases"] || 0);
  });

  // Compute total cases for USA (selected year)
  const totalUSA = Object.values(dataMap).reduce((s, v) => s + (isNaN(v) ? 0 : v), 0);
  document.getElementById('totalCases').textContent = `Total USA Cases (${selectedYear}): ${totalUSA.toLocaleString()}`;

  // For line chart: aggregate cases per year across dataset
  const yearAgg = {};
  rows.forEach(r => {
    const y = Number(r["Year"]);
    if (!y) return;
    yearAgg[y] = (yearAgg[y] || 0) + Number(r["Cases"] || 0);
  });
  const yearLabels = Object.keys(yearAgg).map(Number).sort((a,b)=>a-b);
  const yearValues = yearLabels.map(y => yearAgg[y]);

  // Determine min/max for choropleth
  const allValues = Object.values(dataMap).filter(v => !isNaN(v));
  const minValue = allValues.length ? Math.min(...allValues) : 0;
  const maxValue = allValues.length ? Math.max(...allValues) : 1;

  // color scale function
  function getColor(value, min, max) {
    if (!value && value !== 0) return '#d9d9d9';
    const ratio = (value - min) / (max - min || 1);
    const clamped = Math.max(0, Math.min(1, ratio));
    // colors array
    const colors = [
      [0,200,0],
      [255,255,0],
      [255,165,0],
      [255,69,0],
      [139,0,0]
    ];
    const idx = Math.floor(clamped * (colors.length - 1));
    const frac = (clamped * (colors.length - 1)) - idx;
    const c1 = colors[idx];
    const c2 = colors[Math.min(idx + 1, colors.length - 1)];
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * frac);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * frac);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * frac);
    return `rgb(${r},${g},${b})`;
  }

  function style(feature) {
    const name = feature.properties.NAME;
    const value = dataMap[name];
    return {
      fillColor: getColor(value, minValue, maxValue),
      weight: 1,
      opacity: 1,
      color: 'white',
      dashArray: '3',
      fillOpacity: 0.85
    };
  }

  function onEachFeature(feature, layer) {
    const name = feature.properties.NAME;
    const value = (dataMap[name] != null) ? dataMap[name] : 'No data';
    layer.bindPopup(`<strong>${name}</strong><br>Cases (${selectedYear}): ${value}`);
    layer.on({
      click: () => {
        // redirect to state page with year and disease
        window.location.href = `state.html?state=${encodeURIComponent(name)}&disease=${encodeURIComponent(diseaseFile)}&year=${selectedYear}`;
      }
    });
    layer.on('mouseover', function() { layer.openPopup(); });
    layer.on('mouseout', function() { layer.closePopup(); });
  }

  L.geoJson(geoData, { style, onEachFeature }).addTo(map);

  // Legend
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'info legend');
    const steps = 6;
    let labels = ['<strong>Cases</strong><br>'];
    for (let i = 0; i <= steps; i++) {
      const val = Math.round(minValue + ((maxValue - minValue) * (i / steps)));
      const color = getColor(val, minValue, maxValue);
      labels.push(`<i style="background:${color};"></i> ${val}`);
    }
    div.innerHTML = labels.join('<br>');
    return div;
  };
  legend.addTo(map);

  // ===== Bar chart (cases by state) =====
  const barCtx = document.getElementById('casesBarChart').getContext('2d');
  const states = Object.keys(dataMap);
  const stateValues = Object.values(dataMap);
  new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: states,
      datasets: [{
        label: `Cases by State (${selectedYear})`,
        data: stateValues,
        backgroundColor: stateValues.map(v => getColor(v, minValue, maxValue)),
        borderColor: 'rgba(0,0,0,0.2)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: `Cases by State — ${selectedYear}` },
        legend: { display: false }
      },
      scales: {
        x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 45 } },
        y: { beginAtZero: true, title: { display: true, text: 'Cases' } }
      }
    }
  });

  // ===== Line chart: USA aggregated over years =====
  const lineCtx = document.getElementById('casesLineChart').getContext('2d');
  new Chart(lineCtx, {
    type: 'line',
    data: {
      labels: yearLabels,
      datasets: [{
        label: 'USA Cases (all years)',
        data: yearValues,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: 'USA Trend — All Years' } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Cases' } },
        x: { title: { display: true, text: 'Year' } }
      }
    }
  });

  // ===== Histogram (state case counts for selected year) =====
  const histCtx = document.getElementById('histogramChart').getContext('2d');
  // Build buckets (simple)
  const values = stateValues.filter(v => !isNaN(v));
  const buckets = 10;
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const bucketSize = (maxV - minV) / buckets || 1;
  const histogramCounts = new Array(buckets).fill(0);
  values.forEach(v => {
    const idx = Math.min(buckets - 1, Math.floor((v - minV) / bucketSize));
    histogramCounts[idx] += 1;
  });
  const histLabels = new Array(buckets).fill(0).map((_,i) => {
    const a = Math.round(minV + i*bucketSize);
    const b = Math.round(minV + (i+1)*bucketSize);
    return `${a}–${b}`;
  });

  new Chart(histCtx, {
    type: 'bar',
    data: {
      labels: histLabels,
      datasets: [{
        label: `Number of states`,
        data: histogramCounts,
        backgroundColor: 'rgba(100,149,237,0.7)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: { title: { display: false } },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'States' } } }
    }
  });

  // ===== Heatmap (state vs year pivot) - render as colored HTML table =====
  // Build pivot of states (rows) × years (columns)
  const pivot = {};
  const allYears = Array.from(new Set(rows.map(r => Number(r['Year'])))).filter(Boolean).sort((a,b)=>a-b);
  const allStates = Array.from(new Set(rows.map(r => stateNameFix[r['State']] || r['State']))).sort();

  allStates.forEach(s => pivot[s] = {});
  rows.forEach(r => {
    const s = stateNameFix[r['State']] || r['State'];
    const y = Number(r['Year']);
    pivot[s][y] = (pivot[s][y] || 0) + Number(r['Cases'] || 0);
  });

  // Find pivot min/max
  let pivotMin = Infinity, pivotMax = -Infinity;
  allStates.forEach(s => {
    allYears.forEach(y => {
      const v = pivot[s][y] || 0;
      if (v < pivotMin) pivotMin = v;
      if (v > pivotMax) pivotMax = v;
    });
  });
  if (!isFinite(pivotMin)) { pivotMin = 0; pivotMax = 1; }

  function colorFor(v) { return getColor(v, pivotMin, pivotMax); }

  // Create table
  const heatDiv = document.getElementById('heatmapContainer');
  let table = '<table style="border-collapse:collapse; width:100%;">';
  // header row
  table += '<thead><tr><th style="position:sticky; top:0; background:#fff; z-index:2;">State</th>';
  allYears.forEach(y => table += `<th style="position:sticky; top:0; background:#fff; z-index:2;">${y}</th>`);
  table += '</tr></thead><tbody>';
  allStates.forEach(s => {
    table += `<tr><td style="padding:6px 8px; border-bottom:1px solid #eee; font-weight:600;">${s}</td>`;
    allYears.forEach(y => {
      const v = pivot[s][y] || 0;
      const bg = colorFor(v);
      table += `<td data-state="${s}" data-year="${y}" style="padding:6px 8px; text-align:center; border-bottom:1px solid #eee; background:${bg}; cursor:pointer;">${v}</td>`;
    });
    table += '</tr>';
  });
  table += '</tbody></table>';
  heatDiv.innerHTML = table;

  // Click handler on heatmap cell -> go to state.html for that state-year
  heatDiv.querySelectorAll('td[data-state]').forEach(td => {
    td.addEventListener('click', () => {
      const s = td.getAttribute('data-state');
      const y = td.getAttribute('data-year');
      window.location.href = `state.html?state=${encodeURIComponent(s)}&disease=${encodeURIComponent(diseaseFile)}&year=${y}`;
    });
  });

}

loadMap().catch(err => {
  console.error(err);
  document.getElementById('selectedInfo').textContent = 'Failed to load data. Check console.';
});


