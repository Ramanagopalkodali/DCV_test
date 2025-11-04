// --- Fix state name mismatches ---
const stateNameFix = {
  "New York State": "New York",
  "Calif.": "California",
  "DC": "District of Columbia"
};

// --- URL parameters (disease file and year) ---
const params = new URLSearchParams(window.location.search);
const diseaseFile = params.get('disease');
const selectedYear = parseInt(params.get('year'));

// --- Initialize the map ---
const map = L.map('map').setView([37.8, -96], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// --- Main async function ---
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

  // --- Filter for the selected year ---
  const yearData = rows.filter(r => r["Year"] === selectedYear);
  const dataMap = {};

  yearData.forEach(r => {
    const raw = r["State"];
    const corrected = stateNameFix[raw] || raw;
    dataMap[corrected] = r["Cases"] || 0;
  });

  // --- Compute min & max for normalization ---
  const allValues = Object.values(dataMap).filter(v => !isNaN(v) && v > 0);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);

  // === MULTI-COLOR GRADIENT (Green → Yellow → Red) ===
  function getColor(value, min, max) {
    if (!value || isNaN(value)) return '#eeeeee'; // grey for no data

    // Normalize between 0 and 1
    const ratio = (value - min) / (max - min);
    const clamped = Math.max(0, Math.min(1, ratio));

    // Gradient stops: green → yellow → red
    const r = Math.floor(255 * clamped);          // red increases
    const g = Math.floor(255 * (1 - clamped));    // green decreases
    const b = 0;
    return `rgb(${r}, ${g}, ${b})`;
  }

  // --- Apply color style per state ---
  function style(feature) {
    const name = feature.properties.NAME;
    const value = dataMap[name] || 0;
    return {
      fillColor: getColor(value, minValue, maxValue),
      weight: 1,
      opacity: 1,
      color: "white",
      dashArray: "3",
      fillOpacity: 0.8
    };
  }

  // --- Popup and click events for each state ---
  function onEachFeature(feature, layer) {
    const name = feature.properties.NAME;
    const value = dataMap[name] || "No data";
    layer.bindPopup(`<strong>${name}</strong><br>Cases: ${value}`);
    layer.on('click', () => {
      window.location.href = `state.html?state=${encodeURIComponent(name)}&disease=${encodeURIComponent(diseaseFile)}&year=${selectedYear}`;
    });
  }

  // --- Draw GeoJSON Layer ---
  L.geoJson(geoData, { style, onEachFeature }).addTo(map);

  // === ADD GRADIENT LEGEND ===
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

  // === Chart.js Bar Graph (Cases by State) ===
  const ctx = document.getElementById('casesBarChart');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(dataMap),
      datasets: [{
        label: 'Cases by State',
        data: Object.values(dataMap),
        backgroundColor: Object.values(dataMap).map(v => getColor(v, minValue, maxValue)),
        borderColor: 'rgba(0,0,0,0.2)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
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

