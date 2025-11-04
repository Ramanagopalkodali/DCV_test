document.addEventListener('DOMContentLoaded', () => {
  const diseaseSelect = document.getElementById('disease-select');
  const yearSelect = document.getElementById('year-select');
  const searchBtn = document.getElementById('search-btn');

  let selectedDisease = null;
  let availableYears = [];

  diseaseSelect.addEventListener('change', async () => {
    selectedDisease = diseaseSelect.value;
    if (!selectedDisease) return;

    // Read Excel file and populate year dropdown
    const years = await getYearsFromExcel(selectedDisease);
    yearSelect.innerHTML = '<option value="">-- Select Year --</option>';
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

// Helper: get unique years from Excel file
async function getYearsFromExcel(filePath) {
  const response = await fetch(filePath);
  const data = await response.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet);
  const years = [...new Set(json.map(row => row["Year"]))];
  return years.sort();
}
