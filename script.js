document.addEventListener("DOMContentLoaded", () => {
  const diseaseSelect = document.getElementById("disease-select");
  const yearSelect = document.getElementById("year-select");
  const searchBtn = document.getElementById("search-btn");

  diseaseSelect.addEventListener("change", async () => {
    const diseaseFile = diseaseSelect.value;
    if (!diseaseFile) {
      yearSelect.disabled = true;
      searchBtn.disabled = true;
      return;
    }

    // Fetch Excel and extract unique years
    const res = await fetch(diseaseFile);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws);

    const years = [...new Set(data.map(r => r["Year"]))].sort((a, b) => a - b);
    yearSelect.innerHTML = '<option value="">-- Select Year --</option>';
    years.forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    });

    yearSelect.disabled = false;
  });

  yearSelect.addEventListener("change", () => {
    searchBtn.disabled = !yearSelect.value;
  });

  searchBtn.addEventListener("click", () => {
    const diseaseFile = diseaseSelect.value;
    const year = yearSelect.value;
    if (diseaseFile && year) {
      window.location.href = `map.html?disease=${encodeURIComponent(diseaseFile)}&year=${year}`;
    }
  });
});
