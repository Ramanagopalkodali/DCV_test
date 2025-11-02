const ctx = document.getElementById('myChart');

new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ['2015', '2016', '2017', '2018', '2019', '2020'],
    datasets: [{
      label: 'Mortality Rate (per 100k)',
      data: [230, 240, 245, 250, 248, 255],
      backgroundColor: 'rgba(54, 162, 235, 0.6)'
    }]
  },
  options: {
    responsive: true,
    plugins: {
      title: { display: true, text: 'Mortality Trends Over Years' },
      legend: { position: 'bottom' }
    }
  }
});
