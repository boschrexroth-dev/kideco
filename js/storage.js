function saveArchitectureData() {
    try {
        localStorage.setItem('cbm_architecture', JSON.stringify({ components, connections }));
    } catch (e) { console.error('Save architecture failed:', e); }
}

function loadArchitectureData() {
    try {
        const saved = localStorage.getItem('cbm_architecture');
        if (saved) {
            const p = JSON.parse(saved);
            components  = p.components  || [];
            connections = p.connections || [];
            return true;
        }
    } catch (e) { console.error('Load architecture failed:', e); }
    return false;
}

function saveConfigurationToStorage() {
    try {
        const data = {
            parameterConfig: runtimeParameterConfig,
            monitoringDataByMotor,
            globalThresholdRules,
            globalCriticalThresholds,
            allNotifications,
            ruleAlertCounters,
            mqttSubscriptions,
            mqttBrokerUrl
        };
        localStorage.setItem(STORAGE_KEYS.PARAMETER_CONFIG, JSON.stringify(data));
    } catch (e) { console.error('Save configuration failed:', e); }
}

function loadConfigurationFromStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.PARAMETER_CONFIG);
        if (saved) {
            const p = JSON.parse(saved);
            runtimeParameterConfig   = p.parameterConfig         || runtimeParameterConfig;
            monitoringDataByMotor    = p.monitoringDataByMotor    || {};
            globalThresholdRules     = p.globalThresholdRules     || [];
            globalCriticalThresholds = p.globalCriticalThresholds || [];
            allNotifications         = p.allNotifications         || [];
            ruleAlertCounters        = p.ruleAlertCounters        || {};
            mqttSubscriptions        = p.mqttSubscriptions        || [];
            if (p.mqttBrokerUrl) {
                // Upgrade insecure ws:// to wss:// automatically
                mqttBrokerUrl = p.mqttBrokerUrl.replace(/^ws:\/\//i, 'wss://').replace(/:8000\//, ':8884/');
            }
            return true;
        }
    } catch (e) { console.error('Load configuration failed:', e); }
    return false;
}

function clearAllMonitoringData() {
    if (!confirm('Hapus semua parameter monitoring? Aksi ini tidak bisa dibatalkan.')) return;
    monitoringDataByMotor = {};
    mqttSubscriptions     = [];
    Object.keys(_topicPanelMap).forEach(k => delete _topicPanelMap[k]);
    saveConfigurationToStorage();
    renderDashboard();
    refreshMotorDropdown();
    showNotification('Semua parameter monitoring dihapus', 'info');
}

function deleteMonitoringItem(itemId) {
    const mqttIdx = mqttSubscriptions.findIndex(p => p.id === itemId);
    if (mqttIdx !== -1) {
        removePanel(itemId);
        return;
    }
    for (const motorName of Object.keys(monitoringDataByMotor)) {
        const arr = monitoringDataByMotor[motorName];
        const idx = arr.findIndex(p => p.id === itemId);
        if (idx !== -1) {
            arr.splice(idx, 1);
            if (arr.length === 0) delete monitoringDataByMotor[motorName];
            saveConfigurationToStorage();
            renderDashboard();
            refreshMotorDropdown();
            showNotification('Parameter dihapus', 'info');
            return;
        }
    }
}

function saveEmailSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.EMAIL_SETTINGS, JSON.stringify(settings));
}

function loadEmailSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.EMAIL_SETTINGS);
        if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { publicKey: '', serviceId: '', templateId: '', receiverEmail: '' };
}
