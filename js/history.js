let historyColumns = [];
const excludedFields = ['result', 'table', '_time'];
let historyCharts = [];
let historyData   = [];
const MAX_ROWS = 500;

function formatTimestamp(ts) {
    if (!ts) return '-';
    try {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return ts;
        const dateStr = new Intl.DateTimeFormat('id-ID', { day:'2-digit', month:'short', year:'numeric' }).format(d);
        const timeStr = new Intl.DateTimeFormat('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(d).replace(/\./g, ':');
        return `${dateStr}, ${timeStr}`;
    } catch (_) { return ts; }
}

function addHistoryRow(data) {
    const table = document.getElementById('historyTable');
    if (!table) return;
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    const rowData = {
        time:        data._time        || null,
        value:       data._value !== undefined ? parseFloat(data._value) : null,
        field:       data._field       || '-',
        measurement: data._measurement || '-'
    };
    historyData.push(rowData);
    if (historyData.length > MAX_ROWS) historyData.shift();

    if (historyColumns.length === 0) {
        historyColumns = ['time', 'value', 'field', 'measurement'];
        thead.innerHTML = `<tr>${historyColumns.map((k, i) =>
            `<th onclick="sortHistoryTable(${i})" style="cursor:pointer;">${k}</th>`).join('')}</tr>`;
        const sortSel = document.getElementById('historySort');
        if (sortSel) sortSel.innerHTML = `
            <option value="">Select Sort Option</option>
            <option value="date_asc">Date (Oldest First)</option>
            <option value="date_desc">Date (Newest First)</option>
            <option value="value_desc">Value (High → Low)</option>
            <option value="value_asc">Value (Low → High)</option>`;
    }

    const row = tbody.insertRow();
    historyColumns.forEach(key => {
        const cell = row.insertCell();
        let display = rowData[key] !== null ? rowData[key] : '-';
        let raw     = rowData[key];

        if (key === 'time' && data._time) {
            display = formatTimestamp(data._time);
            raw     = new Date(data._time).getTime();
        }
        if (key === 'value' && data._value !== undefined) {
            display = data._value;
            raw     = parseFloat(data._value);
        }
        cell.textContent = display;
        cell.setAttribute('data-value', raw);
    });
}

function clearHistoryTable() {
    historyData    = [];
    historyColumns = [];
    const table = document.getElementById('historyTable');
    if (!table) return;
    table.querySelector('thead').innerHTML = '';
    table.querySelector('tbody').innerHTML = '';
    const ss = document.getElementById('historySort');
    if (ss) ss.value = '';
}

function filterHistoryTable() {
    const input = document.getElementById('historySearch');
    if (!input) return;
    const q    = input.value.toLowerCase();
    const rows = document.querySelectorAll('#historyTable tbody tr');
    rows.forEach(row => {
        const found = [...row.querySelectorAll('td')].some(c => c.textContent.toLowerCase().includes(q));
        row.style.display = found ? '' : 'none';
    });
}

function sortHistoryTable(colIndex) {
    const table = document.getElementById('historyTable');
    const tbody = table.querySelector('tbody');
    const rows  = Array.from(tbody.querySelectorAll('tr'));
    const cur   = table.getAttribute('data-sort-dir') || 'desc';
    const next  = cur === 'asc' ? 'desc' : 'asc';

    rows.sort((a, b) => {
        const ca = a.cells[colIndex]; const cb = b.cells[colIndex];
        if (!ca || !cb) return 0;
        let va = ca.getAttribute('data-value') || ca.textContent.trim();
        let vb = cb.getAttribute('data-value') || cb.textContent.trim();
        if (va === '-' || va === '') va = next === 'asc' ? 'zzz' : '';
        if (vb === '-' || vb === '') vb = next === 'asc' ? 'zzz' : '';
        const na = parseFloat(va); const nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return next === 'asc' ? na - nb : nb - na;
        return next === 'asc'
            ? va.localeCompare(vb, undefined, { numeric:true, sensitivity:'base' })
            : vb.localeCompare(va, undefined, { numeric:true, sensitivity:'base' });
    });
    tbody.innerHTML = '';
    rows.forEach(r => tbody.appendChild(r));
    table.setAttribute('data-sort-dir', next);

    table.querySelectorAll('th').forEach((h, i) => {
        h.classList.remove('sort-asc','sort-desc');
        if (i === colIndex) h.classList.add('sort-' + next);
    });
}

function sortHistoryByOption() {
    const sel = document.getElementById('historySort');
    if (!sel || !sel.value) return;
    const opt = sel.value;

    let colIdx = -1;
    if (opt.includes('date')) {
        colIdx = historyColumns.findIndex(c => c.toLowerCase().includes('time') || c.toLowerCase().includes('date'));
    } else if (opt.includes('value')) {
        colIdx = historyColumns.findIndex(c => c.toLowerCase() === 'value');
        if (colIdx === -1) colIdx = _findBestNumericColumn();
    }
    if (colIdx < 0) colIdx = 0;

    const asc   = opt.includes('asc');
    const table = document.getElementById('historyTable');
    const tbody = table.querySelector('tbody');
    const rows  = Array.from(tbody.querySelectorAll('tr'));

    rows.sort((a, b) => {
        const ca = a.cells[colIdx]; const cb = b.cells[colIdx];
        if (!ca || !cb) return 0;
        let va = ca.textContent.trim(); let vb = cb.textContent.trim();
        if (!va || va === '-') return asc ? 1 : -1;
        if (!vb || vb === '-') return asc ? -1 : 1;

        if (opt.includes('date')) {
            const da = new Date(Date.parse(va)); const db = new Date(Date.parse(vb));
            if (!isNaN(da) && !isNaN(db)) return asc ? da - db : db - da;
        }
        const na = parseFloat(va); const nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return asc ? na - nb : nb - na;
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    tbody.innerHTML = '';
    rows.forEach(r => tbody.appendChild(r));
}

function _findBestNumericColumn() {
    const rows = document.querySelectorAll('#historyTable tbody tr');
    if (!rows.length) return 0;
    let best = 0; let bestScore = 0;
    for (let ci = 0; ci < historyColumns.length; ci++) {
        let num = 0; let total = 0;
        const sample = Math.min(rows.length, 10);
        for (let ri = 0; ri < sample; ri++) {
            const c = rows[ri].cells[ci];
            if (c) { total++; if (!isNaN(parseFloat(c.textContent.trim()))) num++; }
        }
        const score = total > 0 ? num / total : 0;
        if (score > bestScore) { bestScore = score; best = ci; }
    }
    return best;
}

function exportHistoryToCSV() {
    if (!historyColumns.length || !historyData.length) {
        alert('No data to export.');
        return;
    }
    let csv = historyColumns.map(c => `"${c}"`).join(',') + '\n';
    document.querySelectorAll('#historyTable tbody tr').forEach(row => {
        csv += [...row.cells].map(c => {
            let v = c.textContent.trim();
            return `"${v.replace(/"/g,'""')}"`;
        }).join(',') + '\n';
    });
    const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,-5);
    const a  = Object.assign(document.createElement('a'), {
        href:     URL.createObjectURL(new Blob([csv], { type:'text/csv' })),
        download: `history_data_${ts}.csv`
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showNotification(`Exported history_data_${ts}.csv`, 'success');
}

function importHistoryFromCSV(file) {
    if (!file || !file.name.toLowerCase().endsWith('.csv')) {
        alert('Please select a CSV file.'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        try { parseAndImportCSV(e.target.result); }
        catch (err) { console.error(err); alert('Error reading CSV file.'); }
    };
    reader.readAsText(file);
}

function parseAndImportCSV(csvData) {
    const lines = csvData.split('\n').filter(l => l.trim());
    if (!lines.length) { alert('Empty CSV.'); return; }
    const headers = _parseCSVLine(lines[0]);
    if (!headers.length) { alert('No headers found.'); return; }
    if (!confirm(`Import ${lines.length - 1} rows with columns: ${headers.join(', ')}?\nThis will replace current data.`)) return;

    clearHistoryTable();
    historyColumns = headers.filter(h => !excludedFields.includes(h));

    const table = document.getElementById('historyTable');
    table.querySelector('thead').innerHTML = `<tr>${historyColumns.map((k,i)=>
        `<th onclick="sortHistoryTable(${i})" style="cursor:pointer;">${k}</th>`).join('')}</tr>`;

    let count = 0;
    const tbody = table.querySelector('tbody');
    for (let i = 1; i < lines.length; i++) {
        const vals = _parseCSVLine(lines[i].trim());
        if (!vals.length || vals.length !== headers.length) continue;
        const obj = {}; headers.forEach((h, j) => { obj[h] = vals[j] || ''; });
        const row = tbody.insertRow();
        historyColumns.forEach(k => {
            const c = row.insertCell();
            c.textContent = obj[k] || '-';
            c.setAttribute('data-value', obj[k] || '-');
        });
        count++;
    }
    alert(`Imported ${count} rows.`);
}

function _parseCSVLine(line) {
    const result = []; let cur = ''; let inQ = false; let i = 0;
    while (i < line.length) {
        const ch = line[i];
        if (ch === '"') {
            if (inQ && line[i+1] === '"') { cur += '"'; i += 2; }
            else { inQ = !inQ; i++; }
        } else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; i++; }
        else { cur += ch; i++; }
    }
    result.push(cur.trim());
    return result;
}

function openHistoryChart() {
    if (!historyData.length) { alert('No data available for chart.'); return; }

    const byMeasField = {};
    historyData.forEach(d => {
        if (!d.time || d.value === null) return;
        if (!byMeasField[d.measurement]) byMeasField[d.measurement] = {};
        if (!byMeasField[d.measurement][d.field]) byMeasField[d.measurement][d.field] = [];
        byMeasField[d.measurement][d.field].push({ x: new Date(d.time), y: d.value });
    });

    historyCharts.forEach(ch => ch.destroy());
    historyCharts = [];

    const container = document.getElementById('chartsContainer');
    container.innerHTML = '';

    const palette = [
        'rgb(255,99,132)','rgb(54,162,235)','rgb(255,205,86)','rgb(75,192,192)',
        'rgb(153,102,255)','rgb(255,159,64)','rgb(199,199,199)','rgb(83,102,147)',
        'rgb(255,99,255)','rgb(99,255,132)'
    ];
    const fieldColors = {};
    let ci = 0;

    Object.keys(byMeasField).forEach(measurement => {
        const fields = byMeasField[measurement];
        const names  = Object.keys(fields);
        if (!names.length) return;

        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-bottom:30px;padding:20px;border:1px solid #ddd;border-radius:8px;background:#f9f9f9;';
        wrap.innerHTML = `
            <h3 style="margin-bottom:15px;color:#333;">${measurement} (${names.length} field${names.length>1?'s':''})</h3>
            <p style="font-size:12px;color:#666;margin-bottom:10px;">Fields: ${names.join(', ')}</p>`;
        const cnv = document.createElement('canvas');
        cnv.style.maxHeight = '400px';
        wrap.appendChild(cnv);
        container.appendChild(wrap);

        const datasets = names.map(field => {
            if (!fieldColors[field]) { fieldColors[field] = palette[ci++ % palette.length]; }
            return {
                label: field,
                data:  fields[field].sort((a,b) => a.x - b.x).slice(-100),
                borderColor:     fieldColors[field],
                backgroundColor: fieldColors[field] + '20',
                tension: 0.3, fill: false, pointRadius: 3, pointHoverRadius: 6, borderWidth: 2
            };
        });

        const chart = new Chart(cnv.getContext('2d'), {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: names.length > 1, position: 'top' },
                    tooltip: {
                        mode: 'index', intersect: false,
                        callbacks: {
                            title: ctx => formatTimestamp(new Date(ctx[0].parsed.x).toISOString()),
                            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}`
                        }
                    }
                },
                scales: {
                    x: { type:'time', time:{ unit:'minute',
                        displayFormats:{ minute:'HH:mm', hour:'HH:mm', day:'MMM DD' } },
                        title:{ display:true, text:'Time' } },
                    y: { beginAtZero:true, title:{ display:true, text:'Value' } }
                },
                interaction: { mode:'nearest', axis:'x', intersect:false }
            }
        });
        historyCharts.push(chart);
    });

    const summary = document.createElement('div');
    summary.style.cssText = 'padding:15px;background:#e8f4f8;border-radius:5px;margin-bottom:20px;';
    summary.innerHTML = `<strong>Chart Summary:</strong><br>
        • Total Measurements: ${Object.keys(byMeasField).length}<br>
        • Total Data Points: ${historyData.length}<br>
        • Charts Generated: ${historyCharts.length}`;
    container.insertBefore(summary, container.firstChild);

    document.getElementById('historyChartModal').style.display = 'flex';
}

function closeHistoryChart() {
    document.getElementById('historyChartModal').style.display = 'none';
}

setInterval(() => {
    if (historyData.length && document.getElementById('historySection')?.classList.contains('active')) {
    }
}, 5000);
