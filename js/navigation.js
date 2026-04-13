function showArchitecture() {
    _activateSection('architectureSection', 0);
    setTimeout(resizeCanvas, 100);
}

function showMonitoring() {
    _activateSection('monitoringSection', 1);
    setTimeout(() => {
        initializeDashboard();
    }, 100);
}

function showNotifications() {
    _activateSection('notificationsSection', 2);
    setTimeout(() => {
        renderNotifications();
        updateNotificationStats();
    }, 100);
}

function showHistory() {
    _activateSection('historySection', 3);
}

function _activateSection(sectionId, btnIndex) {
    ['architectureSection','monitoringSection','notificationsSection','historySection']
        .forEach(id => document.getElementById(id).classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelectorAll('.nav-btn')[btnIndex];
    if (btn) btn.classList.add('active');
}

function showNotification(message, type) {
    const bgColor = { success: '#4caf50', error: '#f44336', info: '#2196f3' };
    const div = document.createElement('div');
    div.style.cssText =
        'position:fixed;top:20px;right:20px;padding:15px 20px;' +
        'background:' + (bgColor[type] || '#142c46') + ';color:white;' +
        'border-radius:8px;z-index:2000;animation:slideIn 0.3s ease;' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:350px;font-size:14px;line-height:1.4;';
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => {
        div.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => div.parentNode && div.parentNode.removeChild(div), 300);
    }, 4000);
}

function exportAllConfiguration() {
    try {
        const exportData = {
            architecture: { components, connections },
            cbm: {
                parameterConfig, monitoringDataByMotor,
                globalThresholdRules, globalCriticalThresholds,
                allNotifications, ruleAlertCounters, mqttSubscriptions
            },
            exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'cbm_full_configuration_' + new Date().toISOString().split('T')[0] + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        showNotification('All configuration exported successfully!', 'success');
    } catch (e) {
        console.error('Export error:', e);
        showNotification('Error exporting configuration', 'error');
    }
}

function importAllConfiguration(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const d = JSON.parse(e.target.result);
            if (d.architecture) {
                components  = d.architecture.components  || [];
                connections = d.architecture.connections || [];
                canvasContainer.querySelectorAll('.component-block').forEach(el => el.remove());
                connectionsLayer.innerHTML = '';
                components.forEach(renderComponent);
                updateConnections();
            }
            if (d.cbm) {
                if (d.cbm.globalThresholdRules)     globalThresholdRules     = d.cbm.globalThresholdRules;
                if (d.cbm.globalCriticalThresholds) globalCriticalThresholds = d.cbm.globalCriticalThresholds;
                if (d.cbm.allNotifications)         allNotifications         = d.cbm.allNotifications;
                if (d.cbm.ruleAlertCounters)        ruleAlertCounters        = d.cbm.ruleAlertCounters;
                if (d.cbm.mqttSubscriptions)        mqttSubscriptions        = d.cbm.mqttSubscriptions;
                monitoringDataByMotor = d.cbm.monitoringDataByMotor || {};
            }
            saveConfigurationToStorage();
            saveArchitectureData();
            renderDashboard();
            refreshMotorDropdown();
            updateStatusCounts();
            showNotification('All configuration imported successfully!', 'success');
        } catch (err) {
            console.error('Import parse error:', err);
            showNotification('Error parsing configuration file', 'error');
        }
    };
    reader.readAsText(file);
}
