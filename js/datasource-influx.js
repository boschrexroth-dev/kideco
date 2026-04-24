let influxRefreshTimer = null;

function getDefaultSQLQuery() {
    return `SELECT *\nFROM "connector_plc"\nWHERE\ntime >= now() - interval '1 hour'`;
}

async function executeInfluxQuery(sqlQuery) {
    if (location.protocol === 'file:') {
        throw new Error(
            'App harus dijalankan lewat HTTP server, bukan file://\n' +
            'Jalankan di terminal: python proxy.py\n' +
            'Lalu buka: http://localhost:8080'
        );
    }

    let url;
    if (INFLUX_CONFIG.proxyUrl) {
        url = INFLUX_CONFIG.proxyUrl;
    } else if (_IS_LOCAL) {
        url = '/influx/query_sql';
    } else {
        url = `${INFLUX_CONFIG.url}/api/v3/query_sql`;
    }

    const useProxy = !!INFLUX_CONFIG.proxyUrl || _IS_LOCAL;
    const headers = {
        'Content-Type': 'application/json',
        'Accept':       'application/json'
    };
    if (!useProxy) {
        headers['Authorization'] = `Token ${INFLUX_CONFIG.token}`;
    }

    let response;
    try {
        response = await fetch(url, {
            method:  'POST',
            headers: headers,
            body: JSON.stringify({
                database:   INFLUX_CONFIG.bucket,
                query:      sqlQuery,
                query_type: 'sql'
            })
        });
    } catch (networkErr) {
        throw new Error(
            'Tidak dapat terhubung ke InfluxDB Cloud.\n' +
            'Kemungkinan penyebab:\n' +
            '• App dibuka lewat file:// (harus pakai HTTP server)\n' +
            '• Koneksi internet terputus\n' +
            '• CORS: buka browser dengan flag --disable-web-security (dev only)\n' +
            'Detail: ' + networkErr.message
        );
    }

    const text = await response.text();

    if (!response.ok) {
        let errMsg = `InfluxDB error ${response.status}`;
        try {
            const body = JSON.parse(text);
            errMsg += ': ' + (body.message || body.error || JSON.stringify(body));
            if (body.details) errMsg += '\n' + body.details.join('\n');
        } catch (_) {
            errMsg += ': ' + text;
        }
        throw new Error(errMsg);
    }

    let data;
    try {
        data = JSON.parse(text);
    } catch (_) {
        throw new Error('Response bukan JSON valid: ' + text.slice(0, 200));
    }

    if (data.results && Array.isArray(data.results)) {
        const rows = [];
        for (const result of data.results) {
            if (!result.series) continue;
            for (const serie of result.series) {
                const cols = serie.columns || [];
                for (const vals of (serie.values || [])) {
                    const row = {};
                    cols.forEach((col, i) => { row[col] = vals[i]; });
                    rows.push(row);
                }
            }
        }
        return rows;
    }

    return Array.isArray(data) ? data : (data.data || []);
}

function sqlRowsToHistoryRows(rows) {
    const historyRows = [];
    rows.forEach(row => {
        const time = row.time || row._time || null;
        Object.keys(row).forEach(key => {
            if (key === 'time' || key === '_time' || key === '_measurement') return;
            const val = row[key];
            if (val === null || val === undefined || val === '') return;
            const num = parseFloat(val);
            if (isNaN(num)) return;
            historyRows.push({
                _time:        time,
                _value:       num,
                _field:       key,
                _measurement: row._measurement || 'connector_plc'
            });
        });
    });
    return historyRows;
}

function feedInfluxDataToHistory(rows) {
    if (!rows || !rows.length) return;
    const mapped = sqlRowsToHistoryRows(rows).map(r => ({
        time:        r._time        || null,
        value:       r._value       !== undefined ? parseFloat(r._value) : null,
        field:       r._field       || '-',
        measurement: r._measurement || '-'
    }));
    historyColumns = ['time', 'value', 'field', 'measurement'];
    if (typeof loadHistoryData === 'function') loadHistoryData(mapped);
}


function populateInfluxBucketInfo() {
    const ta = document.getElementById('sqlQueryEditor');
    if (ta && !ta.value.trim()) ta.value = getDefaultSQLQuery();
}

async function runInfluxQuery() {
    const queryEl  = document.getElementById('sqlQueryEditor');
    const targetEl = document.getElementById('influxQueryTarget');
    const statusEl = document.getElementById('influxQueryStatus');
    if (!queryEl) return;

    const query = queryEl.value.trim();
    if (!query) { showNotification('Enter a SQL query', 'error'); return; }

    if (statusEl) {
        statusEl.style.color = '#94a3b8';
        statusEl.textContent = '⏳ Running query...';
    }

    try {
        const rows = await executeInfluxQuery(query);
        if (statusEl) {
            statusEl.style.color = '#4caf50';
            statusEl.textContent = `✅ ${rows.length} rows returned`;
        }

        feedInfluxDataToHistory(rows);

        showNotification(`InfluxDB: ${rows.length} rows loaded`, 'success');

        const interval = parseInt(document.getElementById('influxRefreshInterval')?.value || '0');
        clearInterval(influxRefreshTimer);
        if (interval > 0) {
            influxRefreshTimer = setInterval(async () => {
                try {
                    const r = await executeInfluxQuery(query);
                    feedInfluxDataToHistory(r);
                    if (statusEl) statusEl.textContent = `✅ ${r.length} rows (auto-refreshed ${new Date().toLocaleTimeString()})`;
                } catch (e) {
                    if (statusEl) { statusEl.style.color = '#f44336'; statusEl.textContent = '❌ ' + e.message; }
                }
            }, interval * 1000);
        }
    } catch (err) {
        console.error('InfluxDB query failed:', err);
        if (statusEl) {
            statusEl.style.color = '#f44336';
            statusEl.textContent = '❌ ' + err.message;
        }
        showNotification('Query failed: ' + err.message, 'error');
    }
}

function resetSQLQuery() {
    const ta = document.getElementById('sqlQueryEditor');
    if (ta) ta.value = getDefaultSQLQuery();
    const statusEl = document.getElementById('influxQueryStatus');
    if (statusEl) { statusEl.style.color = '#94a3b8'; statusEl.textContent = ''; }
}

function openInfluxModal() {
    populateInfluxBucketInfo();
    document.getElementById('influxModal').style.display = 'flex';
}

function closeInfluxModal() {
    document.getElementById('influxModal').style.display = 'none';
}

function stopInfluxRefresh() {
    clearInterval(influxRefreshTimer);
    influxRefreshTimer = null;
    const statusEl = document.getElementById('influxQueryStatus');
    if (statusEl) { statusEl.style.color = '#94a3b8'; statusEl.textContent = '⏹ Auto-refresh stopped'; }
    showNotification('Auto-refresh stopped', 'info');
}
