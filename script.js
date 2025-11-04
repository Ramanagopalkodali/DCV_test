document.addEventListener('DOMContentLoaded', () => {
  const diseaseSelect = document.getElementById('disease-select');
  const yearSelect = document.getElementById('year-select');
  const searchBtn = document.getElementById('search-btn');

  let selectedDisease = null;

  diseaseSelect.addEventListener('change', async () => {
    selectedDisease = diseaseSelect.value;
    yearSelect.innerHTML = '<option value="">-- Select Year --</option>';

    if (!selectedDisease) {
      yearSelect.disabled = true;
      searchBtn.disabled = true;
      return;
    }

    const years = await getYearsFromExcel(selectedDisease);
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    });
    yearSelect.disabled = false;
  });

  yearSelect.addEventListener('change', () => {
    searchBtn.disabled = !yearSelect.value;
  });

  searchBtn.addEventListener('click', () => {
    const disease = selectedDisease;
    const year = yearSelect.value;
    if (disease && year) {
      window.location.href = `map.html?disease=${encodeURIComponent(disease)}&year=${encodeURIComponent(year)}`;
    }
  });
});

async function getYearsFromExcel(filePath) {
  const res = await fetch(filePath);
  const ab = await res.arrayBuffer();
  const wb = XLSX.read(ab);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  const years = [...new Set(rows.map(r => r["Year"]))];
  return years.sort((a, b) => a - b);
}
