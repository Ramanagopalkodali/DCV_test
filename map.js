// --- Fix inconsistent state names (optional adjustments) ---
const stateNameFix = {
  "New York State": "New York",
  "Calif.": "California",
  "DC": "District of Columbia"
};

// --- Get parameters from URL ---
const params = new URLSearchParams(window.location.search);
const diseaseFile = params.get('disease');
const selectedYear = parseInt(params.get('year'));

// --- Initialize Leaflet Map ---
const map = L.map('map').setView([37.8, -96], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// --- Load data and render map ---
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

  // === Filter by selected year ===
  const yearData = rows.filter(r => r["Year"] === selectedYear);
  const dataMap = {};
  yearData.forEach(r => {
    const raw = r["State"];
    const corrected = stateNameFix[raw] || raw;
    dataMap[corrected] = Number(r["Cases"]) || 0;
  });

  // === Compute min/max for normalization ===
  const allValues = Object.values(dataMap).filter(v => !isNaN(v) && v > 0);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);

  // === Multi-color Gradient (Green → Yellow → Orange → Red → Dark Red) ===
  function getColor(value, min, max) {
    if (!value || isNaN(value)) return '#d9d9d9'; // grey for missing data

    const ratio = (value - min) / (max - min);
    const clamped = Math.max(0, Math.min(1, ratio));

    // Define smooth color stops
    const colors = [
      [0, 200, 0],    // Green
      [255, 255, 0],  // Yellow
      [255, 165, 0],  // Orange
      [255, 69, 0],   // Red-Orange
      [139, 0, 0]     // Dark Red
    ];

    // Interpolate between colors
    const idx = Math.floor(clamped * (colors.length - 1));
    const frac = (clamped * (colors.length - 1)) - idx;
    const c1 = colors[idx];
    const c2 = colors[Math.min(idx + 1, colors.length - 1)];
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * frac);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * frac);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * frac);

    return `rgb(${r},${g},${b})`;
  }

  // === Style each state region ===
  function style(feature) {
    const name = feature.properties.NAME;
    const value = dataMap[name] || 0;
    return {
      fillColor: getColor(value, minValue, maxValue),
      weight: 1,
      opacity: 1,
      color: "white",
      dashArray: "3",
      fillOpacity: 0.85
    };
  }

  // === Interaction logic (popups and navigation) ===
  function onEachFeature(feature, layer) {
    const name = feature.properties.NAME;
    const value = dataMap[name] || "No data";
    layer.bindPopup(`<strong>${name}</strong><br>Cases: ${value}`);
    layer.on('click', () => {
      window.location.href = `state.html?state=${encodeURIComponent(name)}&disease=${encodeURIComponent(diseaseFile)}`;
    });
  }

  // === Add GeoJSON Layer ===
  L.geoJson(geoData, { style, onEachFeature }).addTo(map);

  // === Add Multi-Color Legend ===
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend");
    const steps = 6;
    let labels = ['<strong>Cases</strong><br>'];
    for (let i = 0; i <= steps; i++) {
      const val = minValue + ((maxValue - minValue) * (i / steps));
      const color = getColor(val, minValue, maxValue);
      labels.push(`<i style="background:${color};"></i> ${Math.round(val)}`);
    }
    div.innerHTML = labels.join('<br>');
    return div;
  };
  legend.addTo(map);

  // === Bar Chart: Cases by State ===
  const ctx = document.getElementById('casesBarChart');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(dataMap),
      datasets: [{
        label: 'Cases by State',
        data: Object.values(dataMap),
        backgroundColor: Object.values(dataMap).map(v => getColor(v, minValue, maxValue)),
        borderColor: 'rgba(0,0,0,0.3)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `Disease Spread in ${selectedYear}`,
          font: { size: 18 }
        }
      },
      scales: {
        x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 45 } },
        y: { beginAtZero: true, title: { display: true, text: 'Cases' } }
      }
    }
  });
}

loadMap();

