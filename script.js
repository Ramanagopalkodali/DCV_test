// === Theme toggle ===
const themeToggle = document.getElementById('themeToggle');
const currentTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', currentTheme);

function updateThemeIcon() {
  const theme = document.documentElement.getAttribute('data-theme');
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}
updateThemeIcon();

themeToggle.addEventListener('click', () => {
  const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon();
});

// === Dataset mapping ===
const datasetsMap = {
  'HIV': 'HIV_data.xlsx',
  'TB': 'TB_data.xlsx',
  'Diabetes': 'Diabetes.xlsx',
  'Dengue': 'Dengue_data.xlsx'
};

const diseaseSelect = document.getElementById('diseaseSelect');
const yearSelect = document.getElementById('yearInput');

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

async function populateYearsForDisease(diseaseKey) {
  const fname = datasetsMap[diseaseKey];
  if (!fname) return;
  let rows = [];
  try {
    const resp = await fetch(fname);
    if (!resp.ok) throw new Error('not found');
    const buf = await resp.arrayBuffer();
    await ensureXLSX();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet);
  } catch (e) {
    console.warn('Error reading', diseaseKey, e);
  }
  yearSelect.innerHTML = '';
  if (!rows.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No data';
    yearSelect.appendChild(opt);
    return;
  }
  const years = [...new Set(rows.map(r => Number(r.Year)).filter(Boolean))].sort((a,b)=>a-b);
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    yearSelect.appendChild(opt);
  });
}

// === Init ===
(async () => {
  await ensureXLSX();
  await populateYearsForDisease(diseaseSelect.value);
})();
diseaseSelect.addEventListener('change', () => populateYearsForDisease(diseaseSelect.value));

// === Map and State redirects ===
document.getElementById('viewMap').addEventListener('click', () => {
  const d = diseaseSelect.value, y = yearSelect.value;
  if (!d || !y) return alert('Choose disease and year');
  window.location.href = `map.html?disease=${encodeURIComponent(d)}&year=${encodeURIComponent(y)}`;
});

document.getElementById('openState').addEventListener('click', () => {
  const d = diseaseSelect.value, y = yearSelect.value;
  if (!d || !y) return alert('Choose disease and year');
  window.location.href = `state.html?state=California&disease=${encodeURIComponent(d)}&year=${encodeURIComponent(y)}`;
});

// === Extra buttons ===
['heroOpenMap','openMapAside'].forEach(id => {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', () => {
    const d = diseaseSelect.value, y = yearSelect.value;
    window.location.href = d && y
      ? `map.html?disease=${encodeURIComponent(d)}&year=${encodeURIComponent(y)}`
      : 'map.html';
  });
});

const openStateAside = document.getElementById('openStateAside');
if (openStateAside) openStateAside.addEventListener('click', () => {
  const d = diseaseSelect.value, y = yearSelect.value;
  window.location.href = `state.html?state=California${d&&y?`&disease=${encodeURIComponent(d)}&year=${encodeURIComponent(y)}`:''}`;
});
