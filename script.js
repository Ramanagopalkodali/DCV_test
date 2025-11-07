// Theme toggle
const themeToggle = document.getElementById('themeToggle');
const currentTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', currentTheme);

function updateThemeIcon() {
  const theme = document.documentElement.getAttribute('data-theme');
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  themeToggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}
updateThemeIcon();

themeToggle.addEventListener('click', () => {
  const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon();
});

// Dataset mapping
const datasetsMap = {
  'HIV': 'HIV_data.xlsx',
  'TB': 'TB_data.xlsx',
  'Malaria': 'Malaria_data.xlsx',
  'Dengue': 'Dengue_data.xlsx'
};

const diseaseSelect = document.getElementById('diseaseSelect');
const yearSelect = document.getElementById('yearInput');

// Populate years dynamically
async function populateYearsForDisease(diseaseKey) {
  const filenameCandidates = [
    datasetsMap[diseaseKey],
    datasetsMap[diseaseKey].replace('.xlsx', '.json')
  ];
  let rows = null;

  for (const fname of filenameCandidates) {
    if (!fname) continue;
    try {
      if (fname.toLowerCase().endsWith('.json')) {
        const resp = await fetch(fname);
        if (!resp.ok) continue;
        rows = await resp.json();
      } else if (fname.toLowerCase().endsWith('.xlsx') || fname.toLowerCase().endsWith('.xls')) {
        const resp = await fetch(fname);
        if (!resp.ok) continue;
        const buf = await resp.arrayBuffer();
        await ensureXLSX();
        const wb = XLSX.read(buf);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet);
      }
      if (Array.isArray(rows) && rows.length) break;
    } catch (e) {
      console.warn('Error loading', fname, e);
    }
  }

  yearSelect.innerHTML = '';
  if (!rows || !rows.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No years';
    yearSelect.appendChild(opt);
    return;
  }

  const years = [...new Set(rows.map(r => Number(r.Year)).filter(Boolean))].sort((a, b) => a - b);
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  });
}

// Lazy-load SheetJS if not loaded
async function ensureXLSX() {
  if (typeof XLSX !== 'undefined') return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

// Initialize
(async () => {
  await ensureXLSX();
  await populateYearsForDisease(diseaseSelect.value);
})();

diseaseSelect.addEventListener('change', () => populateYearsForDisease(diseaseSelect.value));

document.getElementById('viewMap').addEventListener('click', () => {
  const diseaseKey = diseaseSelect.value;
  const year = yearSelect.value;
  if (!diseaseKey || !year) return alert('Choose disease and year');
  window.location.href = `map.html?disease=${encodeURIComponent(diseaseKey)}&year=${encodeURIComponent(year)}`;
});

document.getElementById('openState').addEventListener('click', () => {
  const diseaseKey = diseaseSelect.value;
  const year = yearSelect.value;
  const exampleState = 'California';
  if (!diseaseKey || !year) return alert('Choose disease and year');
  window.location.href = `state.html?state=${encodeURIComponent(exampleState)}&disease=${encodeURIComponent(diseaseKey)}&year=${encodeURIComponent(year)}`;
});
