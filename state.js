const params = new URLSearchParams(window.location.search);
const diseaseFile = params.get('disease');
const state = params.get('state');

document.getElementById('state-title').textContent = `Disease Trends for ${state}`;

async function loadState() {
  const res = await fetch(diseaseFile);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);

  // Filter only selected state
  const stateData = data.filter(r => r["State"] === state);
  if (stateData.length === 0) {
    document.getElementById("detail-table").innerHTML = "<tr><td>No data found for this state.</td></tr>";
    return;
  }

  // Extract columns
  const years = stateData.map(r => r["Year"]);
  const cases = stateData.map(r => r["Cases"]);

  // Build dynamic table (includes all columns, not just Cases)
  const columns = Object.keys(stateData[0]);
  let tableHTML = "<tr>" + columns.map(c => `<th>${c}</th>`).join("") + "</tr>";
  stateData.forEach(row => {
    tableHTML += "<tr>" + columns.map(c => `<td>${row[c]}</td>`).join("") + "</tr>";
  });
  document.getElementById("detail-table").innerHTML = tableHTML;

  // === Bar Chart: Cases per Year ===
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
        legend: { display: true },
        title: {
          display: true,
          text: `${state} - Cases by Year`
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Cases" }
        },
        x: {
          title: { display: true, text: "Year" }
        }
      }
    }
  });

  // === Line Chart: Trend Over Years ===
  const lineCtx = document.getElementById("lineChart");
  new Chart(lineCtx, {
    type: "line",
    data: {
      labels: years,
      datasets: [{
        label: "Cases Trend",
        data: cases,
        fill: false,
        borderColor: "rgba(255, 99, 132, 1)",
        backgroundColor: "rgba(255, 99, 132, 0.2)",
        tension: 0.3,
        pointRadius: 5
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
        title: {
          display: true,
          text: `${state} - Trend Line`
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Cases" }
        },
        x: {
          title: { display: true, text: "Year" }
        }
      }
    }
  });
}

loadState();
