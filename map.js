// Mapping for mismatched names between Excel and GeoJSON
const stateNameFix = {
  "District of Columbia": "District of Columbia",
  "Hawaii": "Hawaii",
  "Alaska": "Alaska",
  "New York State": "New York",
  "California State": "California"
  // Add other mappings if your Excel uses variations
};

const urlParams = new URLSearchParams(window.location.search);
const diseaseFile = urlParams.get("disease");
const selectedYear = parseInt(urlParams.get("year"));

const map = L.map("map").setView([37.8, -96], 4);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

async function loadMap() {
  const [geoRes, excelRes] = await Promise.all([
    fetch("usa_states.geojson"),
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
    const rawName = r["State"];
    const corrected = stateNameFix[rawName] || rawName;
    dataMap[corrected] = r["Cases"] || 0;
  });

  function getColor(value) {
    return value > 10000 ? "#800026" :
           value > 5000  ? "#BD0026" :
           value > 1000  ? "#E31A1C" :
           value > 500   ? "#FC4E2A" :
           value > 100   ? "#FD8D3C" :
           value > 50    ? "#FEB24C" :
           value > 10    ? "#FED976" : "#FFEDA0";
  }

  function style(feature) {
    const name = feature.properties.NAME;
    const value = dataMap[name] || 0;
    return {
      fillColor: getColor(value),
      weight: 1,
      opacity: 1,
      color: "white",
      dashArray: "3",
      fillOpacity: 0.7
    };
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
}

loadMap();
