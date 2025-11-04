const stateNameFix = { "New York State": "New York", "Calif.": "California", "DC": "District of Columbia" };

const params = new URLSearchParams(window.location.search);
const diseaseFile = params.get('disease');
const selectedYear = parseInt(params.get('year'));

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

  const yearData = rows.filter(r => r["Year"] === selectedYear);
  const dataMap = {};

  yearData.forEach(r => {
    const raw = r["State"];
    const corrected = stateNameFix[raw] || raw;
    dataMap[corrected] = r["Cases"] || 0;
  });

  function getColor(v) {
    return v > 10000 ? "#800026" :
           v > 5000 ? "#BD0026" :
           v > 1000 ? "#E31A1C" :
           v > 500  ? "#FC4E2A" :
           v > 100  ? "#FD8D3C" :
           v > 50   ? "#FEB24C" :
           v > 10   ? "#FED976" : "#FFEDA0";
  }

  function style(feature) {
    const name = feature.properties.NAME;
    const value = dataMap[name] || 0;
    return { fillColor: getColor(value), weight: 1, opacity: 1, color: "white", dashArray: "3", fillOpacity: 0.7 };
  }

  function onEachFeature(feature, layer) {
    const name = feature.properties.NAME;
    const value = dataMap[name] || "No data";
    layer.bindPopup(`<strong>${name}</strong><br>Cases: ${value}`);
    layer.on('click', () => {
      window.location.href = `state.html?state=${encodeURIComponent(name)}&disease=${encodeURIComponent(diseaseFile)}&year=${selectedYear}`;
    });
  }

  L.geoJson(geoData, { style, onEachFeature }).addTo(map);

  // === Chart.js Bar Graph ===
  const ctx = document.getElementById('casesBarChart');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(dataMap),
      datasets: [{
        label: 'Cases by State',
        data: Object.values(dataMap),
        backgroundColor: 'rgba(54,162,235,0.6)',
        borderColor: 'rgba(54,162,235,1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Cases' } } }
    }
  });
}
loadMap();

