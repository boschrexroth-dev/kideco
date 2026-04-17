let historyColumns = [];
const excludedFields = ['result', 'table', '_time'];
let historyCharts = [];
let historyData   = [];   // semua data mentah
let filteredData  = [];   // setelah filter/sort
let historyPage   = 0;
const PAGE_SIZE   = 100;

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


function renderPage(page) {
    const table = document.getElementById('historyTable');
    if (!table) return;
    historyPage = page;

    const start = page * PAGE_SIZE;
    const slice = filteredData.slice(start, start + PAGE_SIZE);

    const frag  = document.createDocumentFragment();
    slice.forEach(rowData => {
        const tr = document.createElement('tr');
        historyColumns.forEach(key => {
            const td  = document.createElement('td');
            let display = rowData[key] !== null && rowData[key] !== undefined ? rowData[key] : '-';
            let raw     = rowData[key];
            if (key === 'time' && rowData.time) {
                display = formatTimestamp(rowData.time);
                raw     = new Date(rowData.time).getTime();
            }
            td.textContent = display;
            td.setAttribute('data-value', raw ?? '-');
            tr.appendChild(td);
        });
        frag.appendChild(tr);
    });

    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    tbody.appendChild(frag);
    renderPagination();
}

function renderPagination() {
    let pg = document.getElementById('historyPagination');
    if (!pg) {
        pg = document.createElement('div');
        pg.id = 'historyPagination';
        pg.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 0;flex-wrap:wrap;';
        const container = document.querySelector('.history-table-container');
        if (container) container.after(pg);
    }

    const total = filteredData.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    if (pages <= 1) { pg.innerHTML = `<span style="color:#94a3b8;font-size:13px;">${total} rows</span>`; return; }

    const cur = historyPage;
    let html  = `<span style="color:#94a3b8;font-size:13px;">${total} rows &nbsp;|&nbsp; Page ${cur+1} of ${pages}</span>`;
    html += `<button onclick="renderPage(0)" ${cur===0?'disabled':''} style="padding:4px 8px;">«</button>`;
    html += `<button onclick="renderPage(${cur-1})" ${cur===0?'disabled':''} style="padding:4px 8px;">‹</button>`;

    const from = Math.max(0, cur - 2);
    const to   = Math.min(pages - 1, cur + 2);
    for (let i = from; i <= to; i++) {
        html += `<button onclick="renderPage(${i})" style="padding:4px 8px;${i===cur?'background:#1565c0;color:#fff;':''}">${i+1}</button>`;
    }

    html += `<button onclick="renderPage(${cur+1})" ${cur===pages-1?'disabled':''} style="padding:4px 8px;">›</button>`;
    html += `<button onclick="renderPage(${pages-1})" ${cur===pages-1?'disabled':''} style="padding:4px 8px;">»</button>`;
    pg.innerHTML = html;
}


function loadHistoryData(rows) {
    historyData = rows;
    filteredData = [...rows];
    _buildHeader();
    renderPage(0);
}

function _buildHeader() {
    if (!historyColumns.length) return;
    const table = document.getElementById('historyTable');
    if (!table) return;
    table.querySelector('thead').innerHTML =
        `<tr>${historyColumns.map((k, i) =>
            `<th onclick="_sortByCol(${i})" style="cursor:pointer;">${k}</th>`).join('')}</tr>`;
}


function addHistoryRow(data) {
    const rowData = {
        time:        data._time        || null,
        value:       data._value !== undefined ? parseFloat(data._value) : null,
        field:       data._field       || '-',
        measurement: data._measurement || '-'
    };
    if (historyColumns.length === 0) {
        historyColumns = ['time', 'value', 'field', 'measurement'];
        _buildHeader();
    }
    historyData.push(rowData);
    filteredData.push(rowData);
    const lastPage = Math.max(0, Math.ceil(filteredData.length / PAGE_SIZE) - 1);
    if (historyPage >= lastPage - 1) renderPage(lastPage);
    else renderPagination();
}

function clearHistoryTable() {
    historyData    = [];
    filteredData   = [];
    historyColumns = [];
    historyPage    = 0;
    const table = document.getElementById('historyTable');
    if (table) {
        table.querySelector('thead').innerHTML = '';
        table.querySelector('tbody').innerHTML = '';
    }
    const pg = document.getElementById('historyPagination');
    if (pg) pg.innerHTML = '';
    const ss = document.getElementById('historySort');
    if (ss) ss.value = '';
}


function filterHistoryTable() {
    const q = (document.getElementById('historySearch')?.value || '').toLowerCase();
    filteredData = q
        ? historyData.filter(row =>
            Object.values(row).some(v => String(v ?? '').toLowerCase().includes(q)))
        : [...historyData];
    renderPage(0);
}


function _sortByCol(colIndex) {
    const table = document.getElementById('historyTable');
    const cur   = table.getAttribute('data-sort-dir') || 'desc';
    const next  = cur === 'asc' ? 'desc' : 'asc';
    const key   = historyColumns[colIndex];

    filteredData.sort((a, b) => {
        let va = a[key]; let vb = b[key];
        if (key === 'time') { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
        const na = parseFloat(va); const nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return next === 'asc' ? na - nb : nb - na;
        return next === 'asc'
            ? String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric:true })
            : String(vb ?? '').localeCompare(String(va ?? ''), undefined, { numeric:true });
    });

    table.setAttribute('data-sort-dir', next);
    table.querySelectorAll('th').forEach((h, i) => {
        h.classList.remove('sort-asc','sort-desc');
        if (i === colIndex) h.classList.add('sort-' + next);
    });
    renderPage(0);
}

function sortHistoryTable(colIndex) { _sortByCol(colIndex); }


function sortHistoryByOption() {
    const opt = document.getElementById('historySort')?.value;
    if (!opt) return;

    let key = 'time';
    if (opt.includes('value')) key = historyColumns.find(c => c === 'value') || _findBestNumericKey();
    const asc = opt.includes('asc');

    filteredData.sort((a, b) => {
        let va = a[key]; let vb = b[key];
        if (key === 'time') { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
        const na = parseFloat(va); const nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return asc ? na - nb : nb - na;
        return asc
            ? String(va ?? '').localeCompare(String(vb ?? ''))
            : String(vb ?? '').localeCompare(String(va ?? ''));
    });
    renderPage(0);
}

function _findBestNumericKey() {
    const sample = historyData.slice(0, 10);
    let best = historyColumns[0]; let bestScore = 0;
    historyColumns.forEach(k => {
        const score = sample.filter(r => !isNaN(parseFloat(r[k]))).length / Math.max(sample.length, 1);
        if (score > bestScore) { bestScore = score; best = k; }
    });
    return best;
}


function exportHistoryToCSV() {
    if (!historyColumns.length || !historyData.length) { alert('No data to export.'); return; }
    let csv = historyColumns.map(c => `"${c}"`).join(',') + '\n';
    historyData.forEach(row => {
        csv += historyColumns.map(k => {
            let v = k === 'time' && row.time ? formatTimestamp(row.time) : (row[k] ?? '');
            return `"${String(v).replace(/"/g,'""')}"`;
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
    if (!file || !file.name.toLowerCase().endsWith('.csv')) { alert('Please select a CSV file.'); return; }
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
    if (!confirm(`Import ${lines.length - 1} rows?\nThis will replace current data.`)) return;

    historyColumns = headers.filter(h => !excludedFields.includes(h));
    const imported = [];
    for (let i = 1; i < lines.length; i++) {
        const vals = _parseCSVLine(lines[i].trim());
        if (!vals.length || vals.length !== headers.length) continue;
        const obj = {};
        historyColumns.forEach(k => { obj[k] = headers.includes(k) ? vals[headers.indexOf(k)] : ''; });
        imported.push(obj);
    }
    loadHistoryData(imported);
    alert(`Imported ${imported.length} rows.`);
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
        const meas = d.measurement || 'data';
        if (!byMeasField[meas]) byMeasField[meas] = {};
        if (!byMeasField[meas][d.field]) byMeasField[meas][d.field] = [];
        byMeasField[meas][d.field].push({ x: new Date(d.time), y: d.value });
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
    const fieldColors = {}; let ci = 0;

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
            if (!fieldColors[field]) fieldColors[field] = palette[ci++ % palette.length];
            return {
                label: field,
                data:  fields[field].sort((a,b) => a.x - b.x).slice(-200),
                borderColor:     fieldColors[field],
                backgroundColor: fieldColors[field] + '20',
                tension: 0.3, fill: false, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2
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
                    x: { type:'time', time:{ unit:'minute', displayFormats:{ minute:'HH:mm', hour:'HH:mm', day:'MMM DD' } }, title:{ display:true, text:'Time' } },
                    y: { beginAtZero:true, title:{ display:true, text:'Value' } }
                },
                interaction: { mode:'nearest', axis:'x', intersect:false }
            }
        });
        historyCharts.push(chart);
    });

    document.getElementById('historyChartModal').style.display = 'flex';
}

function closeHistoryChart() {
    document.getElementById('historyChartModal').style.display = 'none';
}
