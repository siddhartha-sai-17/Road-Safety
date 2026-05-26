(function () {
  'use strict';

  const dropZone         = document.getElementById('dropZone');
  const fileInput        = document.getElementById('fileInput');
  const previewArea      = document.getElementById('previewArea');
  const previewImg       = document.getElementById('previewImg');
  const previewName      = document.getElementById('previewName');
  const previewSize      = document.getElementById('previewSize');
  const removeBtn        = document.getElementById('removeBtn');
  const runBtn           = document.getElementById('runBtn');
  const placeholderState = document.getElementById('placeholderState');
  const resultContent    = document.getElementById('resultContent');
  const healthStatus     = document.getElementById('healthStatus');
  const historyList      = document.getElementById('historyList');

  let currentFile = null;
  let donutChart  = null;
  let history     = [];

  const COLOR_MAP  = { pothole: '#d85a30', crack: '#ba7517', manhole: '#185fa5' };
  const FILL_CLASS = { pothole: 'fill-pothole', crack: 'fill-crack', manhole: 'fill-manhole' };

  async function checkHealth() {
    try {
      const res  = await fetch('/health');
      const data = await res.json();
      const dot  = healthStatus.querySelector('.health-dot');
      const txt  = healthStatus.querySelector('span');
      if (data.model_loaded) { dot.className = 'health-dot ok';   txt.textContent = 'Model ready'; }
      else                   { dot.className = 'health-dot demo'; txt.textContent = 'Demo mode';   }
    } catch {
      healthStatus.querySelector('.health-dot').className = 'health-dot error';
      healthStatus.querySelector('span').textContent = 'Offline';
    }
  }
  checkHealth();

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function () {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      this.classList.add('active');
    });
  });

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) { alert('Please upload an image file (JPG, PNG, WEBP).'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('File too large. Maximum size is 10 MB.'); return; }
    currentFile = file;
    previewImg.src = URL.createObjectURL(file);
    previewName.textContent = file.name;
    previewSize.textContent = '(' + (file.size / 1024).toFixed(1) + ' KB)';
    previewArea.style.display = 'flex';
    runBtn.disabled = false;
    placeholderState.style.display = 'flex';
    resultContent.style.display = 'none';
  }

  fileInput.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
  dropZone.addEventListener('click', e => { if (e.target.classList.contains('upload-btn') || e.target.tagName === 'LABEL') return; fileInput.click(); });
  dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

  removeBtn.addEventListener('click', () => {
    currentFile = null; previewImg.src = ''; fileInput.value = '';
    previewArea.style.display = 'none'; runBtn.disabled = true;
    placeholderState.style.display = 'flex'; resultContent.style.display = 'none';
  });

  runBtn.addEventListener('click', async () => {
    if (!currentFile) return;
    runBtn.disabled = true;
    runBtn.querySelector('.run-btn-text').innerHTML = '<span class="spinner"></span> Analysing…';
    const form = new FormData();
    form.append('image', currentFile);
    try {
      const res  = await fetch('/predict', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { alert('Error: ' + (data.error || 'Prediction failed')); return; }
      renderResults(data);
      addHistory(data);
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      runBtn.disabled = false;
      runBtn.querySelector('.run-btn-text').textContent = 'Run detection';
    }
  });

  function renderResults(data) {
    placeholderState.style.display = 'none';
    resultContent.style.display    = 'block';
    document.getElementById('demoBadge').style.display = data.demo_mode ? 'block' : 'none';
    document.getElementById('resType').textContent = data.prediction + ' detected';
    document.getElementById('resConf').textContent = data.confidence + '%';
    const sevEl = document.getElementById('resSev');
    sevEl.textContent = data.severity;
    sevEl.className   = 'pred-value';
    sevEl.style.color = data.severity === 'High' ? '#d85a30' : data.severity === 'Medium' ? '#ba7517' : '#3b6d11';

    const barsEl = document.getElementById('confBars');
    barsEl.innerHTML = '';
    Object.entries(data.probabilities).sort((a, b) => b[1] - a[1]).forEach(([name, pct]) => {
      barsEl.insertAdjacentHTML('beforeend', `
        <div class="conf-item">
          <div class="conf-header"><span class="conf-name">${capitalize(name)}</span><span class="conf-pct">${pct.toFixed(1)}%</span></div>
          <div class="conf-track"><div class="conf-fill ${FILL_CLASS[name] || 'fill-manhole'}" style="width:${pct.toFixed(1)}%"></div></div>
        </div>`);
    });

    if (donutChart) { donutChart.destroy(); donutChart = null; }
    donutChart = new Chart(document.getElementById('donutChart'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(data.probabilities).map(capitalize),
        datasets: [{ data: Object.values(data.probabilities).map(v => parseFloat(v.toFixed(1))), backgroundColor: Object.keys(data.probabilities).map(k => COLOR_MAP[k] || '#888'), borderWidth: 2, borderColor: '#ffffff' }]
      },
      options: { responsive: false, cutout: '64%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%` } } } }
    });

    document.getElementById('donutLegend').innerHTML = Object.entries(data.probabilities).map(([name, pct]) =>
      `<div class="legend-item"><div class="legend-swatch" style="background:${COLOR_MAP[name] || '#888'}"></div><span>${capitalize(name)}</span><span class="legend-pct">${pct.toFixed(1)}%</span></div>`
    ).join('');

    document.getElementById('recCards').innerHTML = (data.recommendations || []).map(r => `
      <div class="rec-card ${r.type}">
        <div class="rec-title"><svg class="rec-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${getIconPath(r.icon)}</svg>${r.title}</div>
        <div class="rec-body">${r.body}</div>
      </div>`).join('');
  }

  function addHistory(data) {
    history.unshift({ src: previewImg.src, prediction: data.prediction, confidence: data.confidence, severity: data.severity, ts: new Date() });
    if (history.length > 10) history.pop();
    historyList.innerHTML = history.map(h => `
      <div class="history-item">
        <img class="history-thumb" src="${h.src}" alt="">
        <div class="history-info"><div class="history-class">${h.prediction} detected</div><div class="history-meta">${h.severity} severity · ${h.ts.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div></div>
        <div class="history-conf">${h.confidence}%</div>
      </div>`).join('');
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function getIconPath(name) {
    const p = {
      'alert-octagon':   '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
      'cone':            '<path d="M3 22l9-20 9 20H3z"/><path d="M6 16h12"/><path d="M8 12h8"/>',
      'clipboard-check': '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="m9 14 2 2 4-4"/>',
      'clock':           '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      'droplet':         '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
      'chart-line':      '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
      'circle-check':    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
      'adjustments':     '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
      'calendar':        '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    };
    return p[name] || '<circle cx="12" cy="12" r="10"/>';
  }

})();
