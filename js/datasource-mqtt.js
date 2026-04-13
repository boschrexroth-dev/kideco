let mqttMonitorClient = null;
let mqttConnected     = false;
let mqttBrokerUrl     = 'wss://broker.hivemq.com:8884/mqtt';
let _clientGen        = 0;
let _saveDebounce           = null;
let _fieldValuesSaveDebounce = null;

const _topicPanelMap = {};

const _fieldLastValues = (() => {
    try {
        const saved = localStorage.getItem('cbm_field_last_values');
        if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {};
})();

const _topicDiscoveredFields = (() => {
    try {
        const saved = localStorage.getItem('cbm_discovered_fields');
        if (saved) {
            const obj = JSON.parse(saved);
            const result = {};
            Object.keys(obj).forEach(t => { result[t] = new Set(obj[t]); });
            return result;
        }
    } catch (_) {}
    return {};
})();


function _saveDiscoveredFields() {
    try {
        const obj = {};
        Object.keys(_topicDiscoveredFields).forEach(t => {
            obj[t] = [..._topicDiscoveredFields[t]];
        });
        localStorage.setItem('cbm_discovered_fields', JSON.stringify(obj));
    } catch (_) {}
}

function connectMqttBroker(url) {
    if (mqttMonitorClient) {
        try { mqttMonitorClient.end(true); } catch (_) {}
        mqttMonitorClient = null;
    }
    if (url) mqttBrokerUrl = url;

    const gen = ++_clientGen;

    const client = mqtt.connect(mqttBrokerUrl, {
        clientId:        'cbm_dashboard_' + Math.random().toString(16).slice(2, 8),
        clean:           true,
        reconnectPeriod: 5000
    });
    mqttMonitorClient = client;

    client.on('connect', () => {
        if (gen !== _clientGen) return;
        mqttConnected = true;
        updateConnectionStatus(true);
        _updateMqttStatusUI(true);
        console.log('MQTT connected:', mqttBrokerUrl);
        _resubscribeAll();
    });

    client.on('error', err => {
        if (gen !== _clientGen) return;
        console.error('MQTT error:', err);
        mqttConnected = false;
        _updateMqttStatusUI(false);
    });

    client.on('close', () => {
        if (gen !== _clientGen) return;
        mqttConnected = false;
        updateConnectionStatus(false);
        _updateMqttStatusUI(false);
    });

    client.on('message', (topic, message) => {
        if (gen !== _clientGen) return;
        _handleMessage(topic, message.toString());
    });
}

function _resubscribeAll() {
    Object.keys(_topicPanelMap).forEach(k => delete _topicPanelMap[k]);
    mqttSubscriptions.forEach(p => {
        if (!_topicPanelMap[p.topic]) _topicPanelMap[p.topic] = new Set();
        _topicPanelMap[p.topic].add(p.id);
    });

    const topics = Object.keys(_topicPanelMap);
    if (topics.length === 0) return;
    topics.forEach(topic => {
        mqttMonitorClient.subscribe(topic, { qos: 1 }, err => {
            if (err) console.error('Subscribe error:', topic, err);
            else     console.log('Subscribed:', topic);
        });
    });
}

function _handleMessage(topic, rawMsg) {
    console.log(`[MQTT] topic: ${topic}`);
    console.log(`[MQTT] raw  :`, rawMsg);

    let payload = null;
    try {
        payload = JSON.parse(rawMsg);
    } catch (_) {
        payload = { _raw: rawMsg };
    }

    if (Array.isArray(payload)) {
        console.log('[MQTT] payload adalah array, ambil elemen pertama');
        payload = payload[0];
    }

    console.log('[MQTT] parsed:', payload);

    if (payload && typeof payload === 'object') {
        if (!_topicDiscoveredFields[topic]) _topicDiscoveredFields[topic] = new Set();
        if (!_fieldLastValues[topic])       _fieldLastValues[topic]       = {};
        const src  = payload.fields || payload;
        const time = new Date().toLocaleTimeString();
        let added  = false;
        Object.keys(src).forEach(k => {
            if (k === '_raw' || k === 'name' || k === 'tags' || k === 'timestamp' || k === 'fields') return;
            _fieldLastValues[topic][k] = { value: src[k], time };
            if (!_topicDiscoveredFields[topic].has(k)) {
                _topicDiscoveredFields[topic].add(k);
                added = true;
            }
        });
        clearTimeout(_fieldValuesSaveDebounce);
        _fieldValuesSaveDebounce = setTimeout(() => {
            try { localStorage.setItem('cbm_field_last_values', JSON.stringify(_fieldLastValues)); } catch (_) {}
        }, 2000);
        if (added) _saveDiscoveredFields();
    }

    const panelIds = _topicPanelMap[topic];
    if (!panelIds || panelIds.size === 0) {
        console.warn('[MQTT] Tidak ada panel yang terdaftar untuk topic:', topic);
        console.warn('[MQTT] topicPanelMap saat ini:', JSON.stringify(Object.fromEntries(
            Object.entries(_topicPanelMap).map(([k,v]) => [k, [...v]])
        )));
        return;
    }

    let updated = false;
    panelIds.forEach(id => {
        const panel = mqttSubscriptions.find(p => p.id === id);
        if (!panel) return;

        const val = _extractField(payload, panel.field);
        console.log(`[MQTT] panel "${panel.label}" → field "${panel.field}" → nilai:`, val);

        if (val === null || isNaN(val)) return;

        const rawSrc = payload.fields || payload;
        if (rawSrc[panel.field] === true || rawSrc[panel.field] === false) panel.isBool = true;

        panel.value = val;
        panel.history.push(val);
        if (panel.history.length > 10) panel.history.shift();
        _evalPanelStatus(panel);
        updated = true;
    });

    if (updated) {
        updateLastUpdate(new Date().toISOString());
        renderDashboard();
        updateStatusCounts();

        clearTimeout(_saveDebounce);
        _saveDebounce = setTimeout(() => saveConfigurationToStorage(), 3000);

        if (typeof addHistoryRow === 'function') {
            panelIds.forEach(id => {
                const p = mqttSubscriptions.find(x => x.id === id);
                if (!p) return;
                addHistoryRow({
                    _time:        new Date().toISOString(),
                    _value:       p.value,
                    _field:       p.field || p.label,
                    _measurement: topic
                });
            });
        }
    }
}

function _toNumber(v) {
    if (v === true  || v === 'true')  return 1;
    if (v === false || v === 'false') return 0;
    return parseFloat(v);
}

function _extractField(payload, fieldPath) {
    if (!fieldPath || payload === null || typeof payload !== 'object') return null;

    if (fieldPath.includes('.')) {
        const val = fieldPath.split('.').reduce((o, k) => (o != null ? o[k] : null), payload);
        if (val !== undefined && val !== null) return _toNumber(val);
    }

    if (payload.fields && payload.fields[fieldPath] !== undefined) {
        return _toNumber(payload.fields[fieldPath]);
    }

    if (payload[fieldPath] !== undefined) {
        return _toNumber(payload[fieldPath]);
    }

    if (payload._raw !== undefined) return _toNumber(payload._raw);

    return null;
}

function _evalPanelStatus(panel) {
    const prev = panel.status;
    panel.status = 'normal';

    const item = { id: panel.id, name: panel.label, value: panel.value, unit: panel.unit };

    globalThresholdRules.forEach(rule => {
        if (rule.data1 !== panel.id && rule.data2 !== panel.id) return;
        if (!evaluateGlobalRule(rule)) return;

        if (rule.color === 'green') {
            panel.status = 'success';
        } else if (rule.color === 'yellow') {
            panel.status = 'alert';
            generateAlert(item, prev, 'warning', rule.message);
            addNotification({
                id: Date.now() + Math.random(),
                timestamp: new Date().toISOString(),
                type: 'warning', parameter: panel.label,
                value: panel.value, unit: panel.unit,
                message: rule.message, status: 'active', severity: 'warning'
            });
        } else if (rule.color === 'red') {
            panel.status = 'critical';
            generateAlert(item, prev, 'critical', rule.message);
            addNotification({
                id: Date.now() + Math.random(),
                timestamp: new Date().toISOString(),
                type: 'critical', parameter: panel.label,
                value: panel.value, unit: panel.unit,
                message: rule.message, status: 'active', severity: 'critical'
            });
        }
    });

    globalCriticalThresholds.forEach(threshold => {
        if (threshold.parameter === panel.id && panel.value >= threshold.value) {
            panel.status = 'critical';
            generateAlert(item, prev, 'critical',
                `${panel.label} reached critical threshold: ${panel.value}${panel.unit}`);
        }
    });
}

function receiveNodeRedData(data) {
    if (data && typeof data === 'object') {
        updateMonitoringData(data);
        updateConnectionStatus(true);
        renderDashboard();
        updateStatusCounts();
        updateLastUpdate(data.timestamp);
    }
}

let _modalRefreshTimer = null;

function openDataSourceModal() {
    document.getElementById('mqttBrokerUrl').value = mqttBrokerUrl;
    renderPanelList();
    _updateMqttStatusUI(mqttConnected);
    document.getElementById('dataSourceModal').style.display = 'block';
    clearInterval(_modalRefreshTimer);
    _modalRefreshTimer = setInterval(() => {
        if (document.getElementById('dataSourceModal').style.display !== 'none') {
            renderPanelList();
            _updateMqttStatusUI(mqttConnected);
        }
    }, 2000);
}

function closeDataSourceModal() {
    clearInterval(_modalRefreshTimer);
    _modalRefreshTimer = null;
    document.getElementById('dataSourceModal').style.display = 'none';
}

let _discoverTimer    = null;
let _discoverCountdown = 0;

function discoverFields() {
    const topic = document.getElementById('newMqttTopic').value.trim();
    const el    = document.getElementById('fieldDiscovery');
    if (!el) return;

    if (!topic) {
        el.innerHTML = '<span style="color:#f44336;font-size:12px;">Enter a topic first</span>';
        return;
    }

    if (!mqttMonitorClient || !mqttConnected) {
        el.innerHTML = '<span style="color:#f44336;font-size:12px;">MQTT belum terhubung</span>';
        return;
    }

    if (_discoverTimer) {
        _renderDiscoverChips(topic, el);
        return;
    }

    _topicDiscoveredFields[topic] = new Set();

    mqttMonitorClient.subscribe(topic, { qos: 0 });

    const SCAN_SECONDS = 120;
    _discoverCountdown = SCAN_SECONDS;

    _discoverTimer = setInterval(() => {
        _discoverCountdown--;
        const fields = _topicDiscoveredFields[topic];
        const count  = fields ? fields.size : 0;

        if (_discoverCountdown <= 0) {
            clearInterval(_discoverTimer);
            _discoverTimer = null;
            _renderDiscoverChips(topic, el);
            return;
        }

        el.innerHTML = `<div style="margin-top:4px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <div style="flex:1;height:4px;background:#1e3a5f;border-radius:2px;">
                    <div style="width:${((SCAN_SECONDS - _discoverCountdown) / SCAN_SECONDS) * 100}%;
                                height:100%;background:#64b5f6;border-radius:2px;transition:width 0.9s;"></div>
                </div>
                <span style="color:#94a3b8;font-size:11px;white-space:nowrap;">${count} field — ${_discoverCountdown}s</span>
                <span onclick="stopDiscover()" style="color:#f44336;font-size:11px;cursor:pointer;white-space:nowrap;">■ Stop</span>
            </div>
            ${_buildChipsHtml(topic)}
        </div>`;
    }, 1000);

    el.innerHTML = `<span style="color:#94a3b8;font-size:12px;">⏳ Scanning <code style="color:#64b5f6;">${topic}</code> selama ${SCAN_SECONDS}s…</span>`;
}

function stopDiscover() {
    if (!_discoverTimer) return;
    clearInterval(_discoverTimer);
    _discoverTimer = null;
    const topic = document.getElementById('newMqttTopic').value.trim();
    const el    = document.getElementById('fieldDiscovery');
    if (topic && el) _renderDiscoverChips(topic, el);
}

function _buildChipsHtml(topic) {
    const fields = _topicDiscoveredFields[topic];
    if (!fields || fields.size === 0) return '';
    return [...fields].sort().map(f =>
        `<span onclick="document.getElementById('newMqttField').value='${f}';document.getElementById('newMqttLabel').value='${f.replace(/_/g,' ')}';"
               style="display:inline-block;margin:2px;padding:3px 8px;background:#1565c0;color:#fff;
                      border-radius:12px;font-size:12px;cursor:pointer;user-select:none;"
               title="Click to use">${f}</span>`
    ).join('');
}

function _renderDiscoverChips(topic, el) {
    const fields = _topicDiscoveredFields[topic];
    const count  = fields ? fields.size : 0;
    if (count === 0) {
        el.innerHTML = '<span style="color:#94a3b8;font-size:12px;">Tidak ada field ditemukan. Coba scan ulang.</span>';
        return;
    }
    el.innerHTML = `<div style="margin-top:4px;">
        <span style="color:#4caf50;font-size:11px;">✓ ${count} field ditemukan pada <code style="color:#64b5f6;">${topic}</code> — klik untuk pilih:</span><br>
        ${_buildChipsHtml(topic)}
        <div style="margin-top:6px;">
            <span onclick="discoverFields()" style="color:#64b5f6;font-size:11px;cursor:pointer;text-decoration:underline;">
                ↺ Scan ulang
            </span>
        </div>
    </div>`;
    _saveDiscoveredFields();
}

function renderPanelList() {
    const el = document.getElementById('mqttTopicList');
    if (!el) return;

    if (!mqttSubscriptions.length) {
        el.innerHTML = '<div style="color:#94a3b8;font-size:14px;padding:8px 0;">Belum ada panel. Tambahkan panel baru di bawah.</div>';
        return;
    }

    el.innerHTML = mqttSubscriptions.map(p => {
        const fieldData = (_fieldLastValues[p.topic] || {})[p.field];
        let debugHtml = '';
        if (fieldData) {
            const val = _toNumber(fieldData.value);
            const ok  = !isNaN(val);
            debugHtml = `
                <div style="margin-top:6px;padding:6px 8px;background:#0d2035;border-radius:4px;font-size:11px;">
                    <span style="color:#94a3b8;">Last @ ${fieldData.time} → </span>
                    <span style="color:${ok ? '#4caf50' : '#ff9800'};">
                        ${ok ? val : '"' + fieldData.value + '" (non-numeric)'}
                    </span>
                </div>`;
        } else {
            debugHtml = `<div style="margin-top:6px;font-size:11px;color:#5f7f96;">Waiting for "${p.field}"…</div>`;
        }

        return `
        <div style="margin-bottom:8px;background:#1e3a5f;padding:10px 14px;border-radius:6px;
                    border-left:3px solid ${p.status==='critical'?'#f44336':p.status==='alert'?'#ff9800':'#4caf50'};">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="flex:1;min-width:0;">
                    <div style="color:#fff;font-weight:600;font-size:14px;">${p.label}</div>
                    <div style="color:#94a3b8;font-size:12px;margin-top:2px;">
                        Topic: <code style="color:#64b5f6;">${p.topic}</code>
                        &nbsp;·&nbsp;
                        Field: <code style="color:#a5d6a7;">${p.field}</code>
                        &nbsp;·&nbsp; Unit: ${p.unit || '—'}
                        &nbsp;·&nbsp; Range: ${p.min} – ${p.max}
                    </div>
                </div>
                <div style="text-align:right;min-width:80px;">
                    <div style="color:#fff;font-size:18px;font-weight:bold;">
                        ${p.value !== undefined ? p.value : '--'}
                        <span style="font-size:12px;color:#94a3b8;">${p.unit}</span>
                    </div>
                    <div style="font-size:11px;color:${p.status==='normal'?'#4caf50':p.status==='alert'?'#ff9800':'#f44336'};">
                        ${p.status.toUpperCase()}
                    </div>
                </div>
                <button class="btn btn-danger btn-sm"
                        onclick="removePanel('${p.id}')"
                        style="padding:4px 10px;font-size:12px;flex-shrink:0;">✕</button>
            </div>
            ${debugHtml}
        </div>`;
    }).join('');
}

function addPanel() {
    const topic = document.getElementById('newMqttTopic').value.trim();
    const field = document.getElementById('newMqttField').value.trim();
    const label = document.getElementById('newMqttLabel').value.trim() || field;
    const unit  = document.getElementById('newMqttUnit').value.trim();
    const min   = parseFloat(document.getElementById('newMqttMin').value) || 0;
    const max   = parseFloat(document.getElementById('newMqttMax').value) || 100;

    if (!topic) { showNotification('Topic wajib diisi', 'error'); return; }
    if (!field) { showNotification('Field wajib diisi', 'error'); return; }

    const panel = {
        id:      'panel_' + Date.now(),
        topic, field, label, unit, min, max,
        value:   0,
        status:  'normal',
        history: []
    };
    mqttSubscriptions.push(panel);

    if (!_topicPanelMap[topic]) {
        _topicPanelMap[topic] = new Set();
        if (mqttMonitorClient && mqttConnected) {
            mqttMonitorClient.subscribe(topic, { qos: 1 }, err => {
                if (!err) console.log('Subscribed (new):', topic);
            });
        }
    }
    _topicPanelMap[topic].add(panel.id);

    ['newMqttTopic','newMqttField','newMqttLabel','newMqttUnit','newMqttMin','newMqttMax']
        .forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });

    renderPanelList();
    refreshMotorDropdown();
    renderDashboard();
    saveConfigurationToStorage();
    showNotification(`Panel "${label}" ditambahkan!`, 'success');
}

function removePanel(id) {
    const idx = mqttSubscriptions.findIndex(p => p.id === id);
    if (idx === -1) return;
    const panel = mqttSubscriptions[idx];

    if (_topicPanelMap[panel.topic]) {
        _topicPanelMap[panel.topic].delete(panel.id);
        if (_topicPanelMap[panel.topic].size === 0) {
            delete _topicPanelMap[panel.topic];
            if (mqttMonitorClient && mqttConnected) {
                mqttMonitorClient.unsubscribe(panel.topic);
            }
        }
    }

    mqttSubscriptions.splice(idx, 1);
    renderPanelList();
    refreshMotorDropdown();
    renderDashboard();
    saveConfigurationToStorage();
    showNotification(`Panel "${panel.label}" dihapus`, 'info');
}

function applyMqttBrokerSettings() {
    const url = document.getElementById('mqttBrokerUrl').value.trim();
    if (!url) { showNotification('Masukkan broker URL', 'error'); return; }
    connectMqttBroker(url);
    showNotification('Menghubungkan ke broker...', 'info');
}

function _updateMqttStatusUI(connected) {
    const dot  = document.getElementById('mqttStatusDot');
    const text = document.getElementById('mqttStatusText');
    if (dot)  dot.style.background = connected ? '#4caf50' : '#f44336';
    if (text) text.textContent     = connected
        ? `Terhubung ke ${mqttBrokerUrl}`
        : 'Terputus';
}
