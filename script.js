// script.js (index page)
const themeToggle = document.getElementById('themeToggle');
const currentTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', currentTheme);
themeToggle.textContent = currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
themeToggle.addEventListener('click', () => {
  const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
  themeToggle.textContent = t === 'dark' ? 'Light Mode' : 'Dark Mode';
});

// mapping: disease name -> dataset filename (update if you change filenames)
const datasetsMap = {
  'HIV': 'HIV_data.xlsx',
  'TB': 'TB_data.xlsx',
  'Malaria': 'Malaria_data.xlsx',
  'Dengue': 'Dengue_data.xlsx'
};

const diseaseSelect = document.getElementById('diseaseSelect');
const yearSelect = document.getElementById('yearInput');

// fetch and populate years for selected disease (attempts .json then .xlsx)
async function populateYearsForDisease(diseaseKey) {
  const filenameCandidates = [ datasetsMap[diseaseKey], datasetsMap[diseaseKey].replace('.xlsx','.json') ];
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
        const wb = XLSX.read(buf);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet);
      }
      if (Array.isArray(rows) && rows.length) break;
    } catch(e){
      console.warn('populateYearsForDisease error loading', fname, e);
    }
  }

  // if no rows, empty year list
  yearSelect.innerHTML = '';
  if (!rows || !rows.length) {
    const opt = document.createElement('option'); opt.value=''; opt.textContent='No years'; yearSelect.appendChild(opt); return;
  }
  const years = Array.from(new Set(rows.map(r => Number(r.Year)).filter(Boolean))).sort((a,b)=>a-b);
  years.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = y; yearSelect.appendChild(o); });
}

// load SheetJS only when needed: dynamic import if not loaded
async function ensureXLSX() {
  if (typeof XLSX !== 'undefined') return;
  await new Promise((res,rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// initial population
(async () => {
  await ensureXLSX();
  await populateYearsForDisease(diseaseSelect.value);
})();

diseaseSelect.addEventListener('change', async () => {
  await populateYearsForDisease(diseaseSelect.value);
});

// navigation buttons
document.getElementById('viewMap').addEventListener('click', () => {
  const diseaseKey = diseaseSelect.value;
  const year = yearSelect.value;
  if (!diseaseKey || !year) return alert('Choose disease and year');
  // pass the disease key (not filename) — map.js maps key -> filename
  window.location.href = `map.html?disease=${encodeURIComponent(diseaseKey)}&year=${encodeURIComponent(year)}`;
});

document.getElementById('openState').addEventListener('click', () => {
  const diseaseKey = diseaseSelect.value;
  const year = yearSelect.value;
  const exampleState = 'California';
  if (!diseaseKey || !year) return alert('Choose disease and year');
  window.location.href = `state.html?state=${encodeURIComponent(exampleState)}&disease=${encodeURIComponent(diseaseKey)}&year=${encodeURIComponent(year)}`;
});
