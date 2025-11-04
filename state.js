const params = new URLSearchParams(window.location.search);
const diseaseFile = params.get('disease');
const state = params.get('state');

document.getElementById('state-title').textContent = `Disease Trends for ${state}`;

// Back button
document.getElementById("backBtn").addEventListener("click", () => {
  window.history.back();
});

async function loadState() {
  // === Load GeoJSON for state map ===
  const [geoRes, excelRes] = await Promise.all([
    fetch("usa_states.geojson"),
    fetch(diseaseFile)
  ]);
  const geoData = await geoRes.json();
  const excelData = await excelRes.arrayBuffer();
  const wb = XLSX.read(excelData);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);

  // === Filter for this state ===
  const stateData = data.filter(r => r["State"] === state);
  if (stateData.length === 0) {
    document.getElementById("detail-table").innerHTML = "<tr><td>No data found for this state.</td></tr>";
    return;
  }

  // Extract year and case data
  const years = stateData.map(r => r["Year"]);
  const cases = stateData.map(r => r["Cases"]);

  // === Build Table Dynamically ===
  const columns = Object.keys(stateData[0]);
  let tableHTML = "<tr>" + columns.map(c => `<th>${c}</th>`).join("") + "</tr>";
  stateData.forEach(row => {
    tableHTML += "<tr>" + columns.map(c => `<td>${row[c]}</td>`).join("") + "</tr>";
  });
  document.getElementById("detail-table").innerHTML = tableHTML;

  // === Draw the State Map ===
  const map = L.map('state-map').setView([37.8, -96], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

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

  // === Bar Chart ===
  const barCtx = document.getElementById("barChart");
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
      plugins: {
        title: { display: true, text: `${state} - Cases by Year` }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Cases" } },
        x: { title: { display: true, text: "Year" } }
      }
    }
  });

  // === Line Chart ===
  const lineCtx = document.getElementById("lineChart");
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
      plugins: {
        title: { display: true, text: `${state} - Trend Over Time` }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Cases" } },
        x: { title: { display: true, text: "Year" } }
      }
    }
  });
}

loadState();

