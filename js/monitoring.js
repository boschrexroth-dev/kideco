let _dashboardInitialized = false;

function initializeDashboard() {
    updateStatusCounts();
    renderDashboard();
    refreshMotorDropdown();

    if (!_dashboardInitialized) {
        _dashboardInitialized = true;
        setInterval(checkDataFreshness, 2000);
        setInterval(saveConfigurationToStorage, 30000);
    }
}

function updateMonitoringData(data) {
    if (!data || typeof data !== 'object') return;
    const motorName = data.Name || 'Unknown';
    const type      = guessType(data);
    const config    = parameterConfig[type] || parameterConfig['Electric Motor'];

    if (!monitoringDataByMotor[motorName]) {
        monitoringDataByMotor[motorName] = [];
        Object.keys(config).forEach(key => {
            monitoringDataByMotor[motorName].push({
                id: `${motorName}.${key}`,
                name: `${motorName} - ${key}`,
                value: 0, unit: config[key].unit,
                min: config[key].min, max: config[key].max,
                status: 'normal', history: []
            });
        });
        refreshMotorDropdown();
    }

    monitoringDataByMotor[motorName].forEach(param => {
        const key = param.name.split(' - ')[1];
        const mk  = findMatchingDataKey(data, key);
        if (mk) {
            const val = parseFloat(data[mk]);
            if (!isNaN(val)) {
                param.value = val;
                param.history.push(val);
                if (param.history.length > 10) param.history.shift();
                updateItemStatus(param);
            }
        }
    });

    updateLastUpdate(data.timestamp || new Date().toISOString());
    renderDashboard();
    updateStatusCounts();
}

function updateItemStatus(item) {
    const prev = item.status;
    item.status = 'normal';

    globalThresholdRules.forEach(rule => {
        if (!evaluateGlobalRule(rule)) return;
        if (item.id !== rule.data1 && item.id !== rule.data2) return;

        if (rule.color === 'green') {
            item.status = 'success';
        } else if (rule.color === 'yellow') {
            item.status = 'alert';
            generateAlert(item, prev, 'warning', rule.message);
            addNotification({
                id: Date.now() + Math.random(),
                timestamp: new Date().toISOString(),
                type: 'warning', parameter: item.name,
                value: item.value, unit: item.unit,
                message: rule.message, status: 'active', severity: 'warning'
            });
        } else if (rule.color === 'red') {
            item.status = 'critical';
            generateAlert(item, prev, 'critical', rule.message);
            addNotification({
                id: Date.now() + Math.random(),
                timestamp: new Date().toISOString(),
                type: 'critical', parameter: 'System',
                value: '', unit: '', message: rule.message,
                status: 'active', severity: 'critical'
            });
        }
    });

    globalCriticalThresholds.forEach(threshold => {
        if (threshold.parameter === item.id && item.value >= threshold.value) {
            item.status = 'critical';
            generateAlert(item, prev, 'critical',
                `${item.name} reached critical threshold: ${item.value}${item.unit}`);
        }
    });
}

function evaluateGlobalRule(rule) {
    const all = getAllMonitoringData();
    const d1 = all.find(i => i.id === rule.data1);
    const d2 = all.find(i => i.id === rule.data2);
    if (!d1 || !d2) return false;
    const c1 = evaluateCondition(d1.value, rule.operator1, rule.value1);
    const c2 = evaluateCondition(d2.value, rule.operator2, rule.value2);
    if (rule.logicalOperator === 'AND')   return c1 && c2;
    if (rule.logicalOperator === 'OR')    return c1 || c2;
    if (rule.logicalOperator === 'EQUAL') return c1 === c2;
    return false;
}

function evaluateCondition(value, operator, threshold) {
    switch (operator) {
        case '>':  return value >  threshold;
        case '<':  return value <  threshold;
        case '>=': return value >= threshold;
        case '<=': return value <= threshold;
        case '==': return value == threshold;
        case '!=': return value != threshold;
        default:   return false;
    }
}

function generateAlert(item, oldStatus, newStatus, customMessage) {
    const alertMessage = {
        timestamp: new Date().toISOString(),
        parameter: item.name,
        value: item.value,
        unit: item.unit,
        status: newStatus,
        oldStatus,
        message: customMessage || `${item.name}: ${item.value}${item.unit} - Status: ${newStatus.toUpperCase()}`
    };

    if (newStatus === 'critical') {
        sendEmailNotification(alertMessage);
    }

    outputMessages.unshift(alertMessage);
    if (outputMessages.length > 50) outputMessages = outputMessages.slice(0, 50);
    updateOutputDisplay();

    if (newStatus === 'critical') {
        const s = document.getElementById('outputSection');
        if (s) s.style.display = 'block';
    }
    console.log('CBM_ALERT:', JSON.stringify(alertMessage));
}

function renderDashboard() {
    const grid = document.getElementById('dashboardGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const hasMotorData = Object.keys(monitoringDataByMotor).length > 0;
    const hasMqttData  = mqttSubscriptions.length > 0;

    if (!hasMotorData && !hasMqttData) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#fff;padding:40px;">' +
            'No monitoring data available. Add MQTT topics in Data Sources or wait for incoming data.</div>';
        return;
    }

    Object.keys(monitoringDataByMotor).forEach(motorName => {
        monitoringDataByMotor[motorName].forEach(item => grid.appendChild(createMonitoringCard(item)));
    });

    if (hasMqttData) {
        mqttSubscriptions.forEach(sub => {
            const item = {
                id: sub.id, name: sub.label, value: sub.value,
                unit: sub.unit, min: sub.min, max: sub.max,
                status: sub.status, history: sub.history,
                isBool: sub.isBool || false
            };
            grid.appendChild(createMonitoringCard(item));
        });
    }
}

function createMonitoringCard(item) {
    const card = document.createElement('div');
    card.className = 'monitoring-card status-' + item.status;
    card.onclick = openGlobalSettings;
    const bars = item.history.map(val => {
        let h = Math.max(5, ((val - item.min) / (item.max - item.min)) * 100);
        if (isNaN(h)) h = 5;
        return `<div class="chart-bar" style="height:${h}%"></div>`;
    }).join('');
    card.innerHTML =
        '<div class="card-header">' +
            '<div class="card-title">' + item.name + '</div>' +
            '<button onclick="event.stopPropagation();deleteMonitoringItem(\'' + item.id + '\')" ' +
                    'title="Hapus parameter ini" ' +
                    'style="background:none;border:none;color:#5f7f96;font-size:14px;cursor:pointer;' +
                           'padding:0 2px;line-height:1;flex-shrink:0;" ' +
                    'onmouseover="this.style.color=\'#f44336\'" ' +
                    'onmouseout="this.style.color=\'#5f7f96\'">✕</button>' +
        '</div>' +
        '<div class="card-content">' +
            '<div class="metric-row">' +
                '<div class="metric-label">Current Value</div>' +
                '<div class="metric-value">' +
                    (item.isBool
                        ? `<span style="color:${item.value ? '#4caf50' : '#94a3b8'}">${item.value ? 'ON' : 'OFF'}</span>`
                        : item.value + '<span class="metric-unit">' + item.unit + '</span>') +
                '</div>' +
            '</div>' +
            '<div class="mini-chart">' + (bars || '<div style="text-align:center;color:#5f7f96;font-size:12px;">No history</div>') + '</div>' +
        '</div>';
    return card;
}

function refreshMotorDropdown() {
    const sel = document.getElementById('motorSelector');
    if (!sel) return;
    sel.innerHTML = '';
    Object.keys(monitoringDataByMotor).forEach(name => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = name;
        sel.appendChild(opt);
    });
    mqttSubscriptions.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.id; opt.textContent = sub.label;
        sel.appendChild(opt);
    });
}

function updateStatusCounts() { updateNotificationStats(); }

function updateConnectionStatus(connected) {
    const dot    = document.getElementById('connectionDot');
    const status = document.getElementById('connectionStatus');
    if (!dot || !status) return;
    dot.classList.toggle('offline', !connected);
    status.textContent = connected ? 'Connected - Receiving Data' : 'Disconnected - No Data';
}

function checkDataFreshness() {
    if (lastDataTimestamp && (new Date() - new Date(lastDataTimestamp)) / 1000 > 30)
        updateConnectionStatus(false);
}

function updateLastUpdate(timestamp) {
    const el = document.getElementById('lastUpdate');
    if (!el) return;
    lastDataTimestamp = timestamp;
    el.textContent = new Date(timestamp).toLocaleTimeString();
}

function getSystemStatus() {
    let critical = 0, alerts = 0, normal = 0;
    getAllMonitoringData().forEach(i => {
        if (i.status === 'critical') critical++;
        else if (i.status === 'alert') alerts++;
        else normal++;
    });
    return { critical, alerts, normal };
}

function updateOutputDisplay() {
    const el = document.getElementById('outputContent');
    if (!el) return;
    el.innerHTML = outputMessages.length === 0
        ? '<div style="color:#5f7f96;text-align:center;padding:20px;">No alerts</div>'
        : outputMessages.map(m =>
            `<div class="output-message ${m.status}">
                <div><strong>${m.parameter}</strong>: ${m.value}${m.unit}</div>
                <div>Status: ${m.status.toUpperCase()}</div>
                <div class="output-timestamp">${new Date(m.timestamp).toLocaleString()}</div>
            </div>`
        ).join('');
}

function clearAlerts() {
    outputMessages = [];
    updateOutputDisplay();
    const s = document.getElementById('outputSection');
    if (s) s.style.display = 'none';
}

function openGlobalSettings() {
    const modal = document.getElementById('globalSettingsModal');
    if (!modal) return;
    populateDataSelectors();
    renderThresholdRules();
    renderCriticalSettings();
    modal.style.display = 'block';
}

function closeGlobalSettings() {
    const modal = document.getElementById('globalSettingsModal');
    if (modal) modal.style.display = 'none';
}

function populateDataSelectors() {
    ['newRuleData1','newRuleData2','newCriticalData'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Select Parameter</option>';
        getAllMonitoringData().forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id; opt.textContent = item.name;
            sel.appendChild(opt);
        });
    });
}

function addThresholdRule() {
    const data1    = document.getElementById('newRuleData1').value;
    const op1      = document.getElementById('newRuleOperator1').value;
    const val1     = parseFloat(document.getElementById('newRuleValue1').value);
    const logicEl  = document.getElementById('newRuleLogicalOperator');
    const logic    = logicEl ? logicEl.value : 'AND';
    const data2    = document.getElementById('newRuleData2').value;
    const op2      = document.getElementById('newRuleOperator2').value;
    const val2     = parseFloat(document.getElementById('newRuleValue2').value);
    const message  = document.getElementById('newRuleMessage').value;
    const color    = document.getElementById('newRuleColor').value;

    if (!data1 || !data2 || isNaN(val1) || isNaN(val2) || !message) {
        showNotification('Please fill all fields for the threshold rule', 'error');
        return;
    }

    const rule = { id: Date.now() + Math.random(), data1, operator1: op1, value1: val1,
        data2, operator2: op2, value2: val2, logicalOperator: logic, message, color };
    globalThresholdRules.push(rule);
    globalCriticalThresholds.push({ id: Date.now() + Math.random(), isFromRule: true, ruleId: rule.id });

    ['newRuleData1','newRuleValue1','newRuleData2','newRuleValue2','newRuleMessage'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    renderThresholdRules();
    renderCriticalSettings();
    saveConfigurationToStorage();
    showNotification('Threshold rule added!', 'success');
}

function renderThresholdRules() {
    const el = document.getElementById('thresholdRules');
    if (!el) return;
    if (!globalThresholdRules.length) {
        el.innerHTML = '<div class="no-rules">No threshold rules configured</div>';
        return;
    }
    el.innerHTML = globalThresholdRules.map(rule => {
        const d1 = getAllMonitoringData().find(d => d.id === rule.data1)?.name || rule.data1;
        const d2 = getAllMonitoringData().find(d => d.id === rule.data2)?.name || rule.data2;
        return `<div class="rule-item">
            <div class="rule-condition"><strong>${d1}</strong> ${rule.operator1} ${rule.value1}
                ${rule.logicalOperator||'AND'} <strong>${d2}</strong> ${rule.operator2} ${rule.value2}</div>
            <div class="rule-message">Message: "${rule.message}"</div>
            <div class="rule-color">Color: <span class="color-badge ${rule.color}">${rule.color}</span></div>
            <button class="btn btn-danger btn-sm" onclick="removeThresholdRule('${rule.id}')">Remove</button>
        </div>`;
    }).join('');
}

function renderCriticalSettings() {
    const el = document.getElementById('criticalSettings');
    if (!el) return;
    const items = [];

    globalCriticalThresholds.filter(t => t.isFromRule).forEach(th => {
        const rule = globalThresholdRules.find(r => r.id === th.ruleId);
        if (!rule) return;
        const d1   = getAllMonitoringData().find(d => d.id === rule.data1)?.name || rule.data1;
        const d2   = getAllMonitoringData().find(d => d.id === rule.data2)?.name || rule.data2;
        const cond = `${d1} ${rule.operator1} ${rule.value1} ${rule.logicalOperator||'AND'} ${d2} ${rule.operator2} ${rule.value2}`;
        const trig = evaluateGlobalRule(rule);
        items.push(`<div class="critical-item ${trig?'triggered':''}">
            <div class="critical-condition">
                <strong>${rule.message}</strong>
                <div class="threshold-condition">Rule: ${cond}</div>
                <div class="threshold-status">Status: ${trig?'TRIGGERED':'Normal'}</div>
                <div class="threshold-input">
                    <label>Critical Value:</label>
                    <input type="number" step="0.1" value="${th.value||''}"
                        onchange="updateCriticalValue('${th.id}', this.value)">
                </div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="removeCriticalThreshold('${th.id}')">Remove</button>
        </div>`);
    });

    globalCriticalThresholds.filter(t => !t.isFromRule).forEach(th => {
        const name = getAllMonitoringData().find(d => d.id === th.parameter)?.name || th.parameter;
        items.push(`<div class="critical-item">
            <div class="critical-condition">
                <strong>${name}</strong>
                <div class="threshold-input">
                    <label>Critical Value:</label>
                    <input type="number" step="0.1" value="${th.value||''}"
                        onchange="updateCriticalValue('${th.id}', this.value)">
                </div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="removeCriticalThreshold('${th.id}')">Remove</button>
        </div>`);
    });

    el.innerHTML = items.length ? items.join('') : '<div class="no-settings">No critical thresholds configured</div>';
}

function updateCriticalValue(id, val) {
    const th = globalCriticalThresholds.find(t => t.id == parseFloat(id));
    if (!th) return;
    th.value = parseFloat(val);
    saveConfigurationToStorage();
    showNotification('Critical threshold updated', 'success');
}

function removeThresholdRule(ruleId) {
    const id = parseFloat(ruleId);
    globalThresholdRules     = globalThresholdRules.filter(r => r.id !== id);
    globalCriticalThresholds = globalCriticalThresholds.filter(t => !(t.isFromRule && t.ruleId === id));
    renderThresholdRules(); renderCriticalSettings();
    saveConfigurationToStorage();
    showNotification('Threshold rule removed', 'info');
}

function removeCriticalThreshold(thresholdId) {
    const id = parseFloat(thresholdId);
    const th = globalCriticalThresholds.find(t => t.id === id);
    if (!th) return;
    if (th.isFromRule) globalThresholdRules = globalThresholdRules.filter(r => r.id !== th.ruleId);
    globalCriticalThresholds = globalCriticalThresholds.filter(t => t.id !== id);
    renderThresholdRules(); renderCriticalSettings();
    saveConfigurationToStorage();
    showNotification('Critical threshold removed', 'info');
}

window.addEventListener('click', e => {
    if (e.target === document.getElementById('globalSettingsModal'))      closeGlobalSettings();
    if (e.target === document.getElementById('notificationSettingsModal')) closeNotificationSettings();
    if (e.target === document.getElementById('dataSourceModal'))           closeDataSourceModal();
    if (e.target === document.getElementById('emailSettingsModal'))        closeEmailSettingsModal();
});
