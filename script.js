// script.js
const themeToggle = document.getElementById('themeToggle');
const current = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', current);

themeToggle.textContent = current === 'dark' ? 'Light Mode' : 'Dark Mode';
themeToggle.addEventListener('click', () => {
  const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
  themeToggle.textContent = t === 'dark' ? 'Light Mode' : 'Dark Mode';
});

document.getElementById('viewMap').addEventListener('click', () => {
  const f = document.getElementById('diseaseSelect').value;
  const y = document.getElementById('yearInput').value;
  if (!f || !y) return alert('Choose dataset and year');
  window.location.href = `map.html?disease=${encodeURIComponent(f)}&year=${encodeURIComponent(y)}`;
});

document.getElementById('openState').addEventListener('click', () => {
  const f = document.getElementById('diseaseSelect').value;
  const y = document.getElementById('yearInput').value;
  const exampleState = 'California';
  window.location.href = `state.html?state=${encodeURIComponent(exampleState)}&disease=${encodeURIComponent(f)}&year=${encodeURIComponent(y)}`;
});

