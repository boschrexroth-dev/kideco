let influxRefreshTimer = null;

function getDefaultSQLQuery() {
    return `SELECT
    time,
    CAST("Drive_Ready_For_Electric_Motor_Start_Drive2" AS INT) AS "Drive_Ready_For_Electric_Motor_Start_Drive2",
    CAST("Electric_Motor_Started_Drive2" AS INT) AS "Electric_Motor_Started_Drive2",
    CAST("Drive_Ready_To_Use_Drive2" AS INT) AS "Drive_Ready_To_Use_Drive2",
    CAST("Drive_Started_Drive2" AS INT) AS "Drive_Started_Drive2",
    CAST("Alarm_Drive2" AS INT) AS "Alarm_Drive2",
    CAST("Warning_Drive1" AS INT) AS "Warning_Drive1",
    CAST("Disable_Drive2" AS INT) AS "Disable_Drive2",
    CAST("Interlock_Drive2" AS INT) AS "Interlock_Drive2",
    CAST("Remote_Mode_Drive2" AS INT) AS "Remote_Mode_Drive2"
FROM "connector_plc"
WHERE time >= NOW() - INTERVAL '1 HOUR'
ORDER BY time ASC`;
}

async function executeInfluxQuery(sqlQuery) {
    if (location.protocol === 'file:') {
        throw new Error(
            'App harus dijalankan lewat HTTP server, bukan file://\n' +
            'Jalankan di terminal: python -m http.server 8080\n' +
            'Lalu buka: http://localhost:8080'
        );
    }

    const url = `${INFLUX_CONFIG.url}/api/v3/query_sql`;

    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${INFLUX_CONFIG.token}`,
                'Content-Type':  'application/json',
                'Accept':        'application/json'
            },
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

    if (!response.ok) {
        let errMsg = `InfluxDB error ${response.status}`;
        try {
            const body = await response.json();
            errMsg += ': ' + (body.message || body.error || JSON.stringify(body));
        } catch (_) {
            errMsg += ': ' + await response.text();
        }
        throw new Error(errMsg);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : (data.results || data.data || []);
}

function sqlRowsToHistoryRows(rows) {
    const historyRows = [];
    rows.forEach(row => {
        const time = row.time || row._time || null;
        Object.keys(row).forEach(key => {
            if (key === 'time' || key === '_time') return;
            const val = row[key];
            if (val === null || val === undefined) return;
            historyRows.push({
                _time:        time,
                _value:       parseFloat(val),
                _field:       key,
                _measurement: 'connector_plc'
            });
        });
    });
    return historyRows;
}

function feedInfluxDataToHistory(rows) {
    if (!rows || !rows.length) return;
    const historyRows = sqlRowsToHistoryRows(rows);
    clearHistoryTable();
    historyRows.forEach(r => { if (typeof addHistoryRow === 'function') addHistoryRow(r); });
}

function feedInfluxDataToMonitoring(rows) {
    if (!rows || !rows.length) return;
    const lastRow = rows[rows.length - 1];
    const measurement = 'connector_plc';

    if (!monitoringDataByMotor[measurement]) monitoringDataByMotor[measurement] = [];

    Object.keys(lastRow).forEach(key => {
        if (key === 'time' || key === '_time') return;
        const val = parseFloat(lastRow[key]);
        if (isNaN(val)) return;

        let param = monitoringDataByMotor[measurement].find(p => p.name === `${measurement} - ${key}`);
        if (!param) {
            param = {
                id: `${measurement}.${key}`,
                name: `${measurement} - ${key}`,
                value: 0, unit: '', min: 0, max: 1,
                status: 'normal', history: []
            };
            monitoringDataByMotor[measurement].push(param);
        }
        param.history = rows.slice(-10).map(r => parseFloat(r[key])).filter(v => !isNaN(v));
        param.value   = val;
        updateItemStatus(param);
    });

    refreshMotorDropdown();
    renderDashboard();
    updateStatusCounts();
    updateLastUpdate(new Date().toISOString());
    updateConnectionStatus(true);
}

function populateInfluxBucketInfo() {
    const warn = document.getElementById('influxCorsWarning');
    if (warn) warn.style.display = (location.protocol === 'file:') ? 'block' : 'none';

    const isProxy  = _IS_LOCAL;
    const proxyNote = isProxy
        ? `<div style="margin-top:6px;color:#4caf50;font-size:12px;">
               ✅ Berjalan via <strong>proxy.py</strong> — CORS otomatis teratasi
           </div>`
        : `<div style="margin-top:6px;color:#64b5f6;font-size:12px;">
               Direct connection ke InfluxDB Cloud
           </div>`;

    const el = document.getElementById('influxBucketInfo');
    if (el) {
        el.innerHTML = `
            <div style="background:#1e3a5f;border-radius:6px;padding:10px 14px;font-size:13px;color:#94a3b8;">
                <div><strong style="color:#fff;">Target:</strong> https://us-east-1-1.aws.cloud2.influxdata.com</div>
                <div><strong style="color:#fff;">Organization:</strong> ${INFLUX_CONFIG.org}</div>
                <div><strong style="color:#fff;">Bucket / Database:</strong> ${INFLUX_CONFIG.bucket}</div>
                <div><strong style="color:#fff;">Endpoint:</strong>
                    <code>${INFLUX_CONFIG.url}/api/v3/query_sql</code>
                </div>
                ${proxyNote}
            </div>`;
    }
    const ta = document.getElementById('sqlQueryEditor');
    if (ta && !ta.value.trim()) ta.value = getDefaultSQLQuery();
}

async function runInfluxQuery() {
    const queryEl  = document.getElementById('sqlQueryEditor');
    const targetEl = document.getElementById('influxQueryTarget');
    const statusEl = document.getElementById('influxQueryStatus');
    if (!queryEl) return;

    const query  = queryEl.value.trim();
    const target = targetEl ? targetEl.value : 'history';
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

        if (target === 'history' || target === 'both') feedInfluxDataToHistory(rows);
        if (target === 'monitor' || target === 'both') feedInfluxDataToMonitoring(rows);

        showNotification(`InfluxDB: ${rows.length} rows loaded`, 'success');

        const interval = parseInt(document.getElementById('influxRefreshInterval')?.value || '0');
        clearInterval(influxRefreshTimer);
        if (interval > 0) {
            influxRefreshTimer = setInterval(async () => {
                try {
                    const r = await executeInfluxQuery(query);
                    if (target === 'history' || target === 'both') feedInfluxDataToHistory(r);
                    if (target === 'monitor' || target === 'both') feedInfluxDataToMonitoring(r);
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

function stopInfluxRefresh() {
    clearInterval(influxRefreshTimer);
    influxRefreshTimer = null;
    const statusEl = document.getElementById('influxQueryStatus');
    if (statusEl) { statusEl.style.color = '#94a3b8'; statusEl.textContent = '⏹ Auto-refresh stopped'; }
    showNotification('Auto-refresh stopped', 'info');
}
