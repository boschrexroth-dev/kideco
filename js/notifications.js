function addNotification(notification) {
    const now = Date.now();
    const isDuplicate = allNotifications.some(n =>
        n.message === notification.message && Math.abs(new Date(n.timestamp).getTime() - now) < 2000);
    if (isDuplicate) return;

    allNotifications.unshift(notification);
    if (allNotifications.length > 1000) allNotifications = allNotifications.slice(0, 1000);

    updateNotificationStats();
    if (document.getElementById('notificationsSection').classList.contains('active'))
        renderNotifications();

    saveConfigurationToStorage();
}

function renderNotifications() {
    const container      = document.getElementById('notificationsContainer');
    const noNotif        = document.getElementById('noNotifications');
    if (!container) return;

    const filter = document.getElementById('notificationFilter')?.value || 'all';
    const list   = filter === 'all' ? allNotifications
                 : allNotifications.filter(n => n.type === filter);

    if (!list.length) {
        if (noNotif) noNotif.style.display = 'block';
        container.innerHTML = '';
        return;
    }
    if (noNotif) noNotif.style.display = 'none';

    container.innerHTML = list.map(n => {
        const icon = getNotificationIcon(n.type);
        return `<div class="notification-item ${n.type}" data-id="${n.id}">
            <div class="notification-header">
                <div class="notification-title">${icon} ${n.type.toUpperCase()}</div>
                <div class="notification-time">${new Date(n.timestamp).toLocaleString()}</div>
            </div>
            <div class="notification-message">${n.message}</div>
            <div class="notification-details">
                <div class="notification-parameter">Parameter: <span class="notification-value">${n.parameter}</span></div>
                <div class="notification-parameter">Value: <span class="notification-value">${n.value}${n.unit}</span></div>
            </div>
            <div class="notification-actions">
                ${n.status === 'active'
                    ? `<button class="notification-btn resolve" onclick="resolveNotification('${n.id}')">Mark Resolved</button>`
                    : '<span style="color:#10b981;font-size:12px;">✓ Resolved</span>'}
                <button class="notification-btn dismiss" onclick="dismissNotification('${n.id}')">Dismiss</button>
            </div>
        </div>`;
    }).join('');
}

function getNotificationIcon(type) {
    return { critical: '🚨', warning: '⚠️', alert: '⚠️', resolved: '✅' }[type] || 'ℹ️';
}

function updateNotificationStats() {
    let critical = 0, alerts = 0, resolved = 0;
    allNotifications.forEach(n => {
        if (n.type === 'critical') critical++;
        else if (n.type === 'warning' || n.type === 'alert') alerts++;
        else if (n.type === 'resolved') resolved++;
    });
    const critEl     = document.getElementById('totalCritical');
    const alertEl    = document.getElementById('totalAlerts');
    const resolvedEl = document.getElementById('totalResolved');
    const normEl     = document.getElementById('normalCount');
    const critCntEl  = document.getElementById('criticalCount');
    if (critEl)     critEl.textContent     = critical;
    if (alertEl)    alertEl.textContent    = alerts;
    if (resolvedEl) resolvedEl.textContent = resolved;
    const sys = getSystemStatus();
    if (normEl)    normEl.textContent    = `${sys.normal} Normal`;
    if (critCntEl) critCntEl.textContent = `${sys.critical} Critical`;
}

function filterNotifications() { renderNotifications(); }

function resolveNotification(id) {
    const n = allNotifications.find(n => n.id == id);
    if (n) { n.status = 'resolved'; n.type = 'resolved'; }
    saveConfigurationToStorage(); renderNotifications(); updateNotificationStats();
}

function dismissNotification(id) {
    const idx = allNotifications.findIndex(n => n.id == id);
    if (idx > -1) allNotifications.splice(idx, 1);
    saveConfigurationToStorage(); renderNotifications(); updateNotificationStats();
}

function clearAllNotifications() {
    if (!confirm('Clear all notifications? This cannot be undone.')) return;
    allNotifications = [];
    saveConfigurationToStorage(); renderNotifications(); updateNotificationStats();
    showNotification('All notifications cleared!', 'info');
}

function openNotificationSettings() {
    const modal = document.getElementById('notificationSettingsModal');
    if (!modal) return;
    renderCriticalThresholdsList();
    modal.style.display = 'block';
}

function closeNotificationSettings() {
    const modal = document.getElementById('notificationSettingsModal');
    if (modal) modal.style.display = 'none';
}

function renderCriticalThresholdsList() {
    const el = document.getElementById('criticalThresholdsList');
    if (!el) return;
    if (!globalCriticalThresholds.length) {
        el.innerHTML = '<div class="no-thresholds">No critical thresholds configured. Go to Condition Monitoring to set up threshold rules.</div>';
        return;
    }
    el.innerHTML = globalCriticalThresholds.map(th => {
        if (!th.isFromRule) return '';
        const rule = globalThresholdRules.find(r => r.id === th.ruleId);
        if (!rule) return '';
        const d1   = getAllMonitoringData().find(d => d.id === rule.data1)?.name || rule.data1;
        const d2   = getAllMonitoringData().find(d => d.id === rule.data2)?.name || rule.data2;
        const cond = `${d1} ${rule.operator1} ${rule.value1} ${rule.logicalOperator||'AND'} ${d2} ${rule.operator2} ${rule.value2}`;
        const trig = evaluateGlobalRule(rule);
        return `<div class="threshold-item ${trig?'triggered':''}">
            <div class="threshold-info">
                <div class="threshold-parameter">${rule.message}</div>
                <div class="threshold-condition">Rule: ${cond}</div>
                <div class="threshold-status">Status: ${trig?'TRIGGERED':'Normal'}</div>
            </div>
            <div class="threshold-status-indicator ${trig?'critical':'normal'}"></div>
        </div>`;
    }).join('');
}

let emailSettings = { publicKey: '', serviceId: '', templateId: '', receiverEmail: '' };

function openEmailSettingsModal() {
    emailSettings = loadEmailSettings();
    document.getElementById('emailPublicKey').value   = emailSettings.publicKey;
    document.getElementById('emailServiceId').value   = emailSettings.serviceId;
    document.getElementById('emailTemplateId').value  = emailSettings.templateId;
    document.getElementById('emailReceiver').value    = emailSettings.receiverEmail;
    document.getElementById('emailSettingsModal').style.display = 'block';
}

function closeEmailSettingsModal() {
    document.getElementById('emailSettingsModal').style.display = 'none';
}

function saveEmailSettingsForm() {
    emailSettings = {
        publicKey:     document.getElementById('emailPublicKey').value.trim(),
        serviceId:     document.getElementById('emailServiceId').value.trim(),
        templateId:    document.getElementById('emailTemplateId').value.trim(),
        receiverEmail: document.getElementById('emailReceiver').value.trim()
    };
    saveEmailSettings(emailSettings);

    if (emailSettings.publicKey && typeof emailjs !== 'undefined') {
        emailjs.init(emailSettings.publicKey);
    }
    closeEmailSettingsModal();
    showNotification('Email settings saved!', 'success');
}

function testEmailNotification() {
    sendEmailNotification({
        message:   'Test notification from Bosch Rexroth CBM Dashboard',
        parameter: 'Test',
        value:     0,
        unit:      '',
        status:    'test',
        timestamp: new Date().toISOString()
    });
}

function sendEmailNotification(alertData) {
    if (!emailSettings.publicKey) emailSettings = loadEmailSettings();

    const { publicKey, serviceId, templateId, receiverEmail } = emailSettings;
    if (!publicKey || !serviceId || !templateId || !receiverEmail) {
        console.warn('Email not configured. Open Email Settings to configure.');
        return;
    }

    if (typeof emailjs === 'undefined') {
        console.error('EmailJS SDK not loaded.');
        return;
    }

    emailjs.init(publicKey);

    const params = {
        to_email:  receiverEmail,
        from_name: 'Bosch Rexroth CBM',
        subject:   `[${(alertData.status || 'ALERT').toUpperCase()}] ${alertData.parameter || 'System Alert'}`,
        message:   alertData.message,
        parameter: alertData.parameter || '-',
        value:     `${alertData.value}${alertData.unit || ''}`,
        timestamp: new Date(alertData.timestamp).toLocaleString(),
        status:    (alertData.status || '').toUpperCase()
    };

    emailjs.send(serviceId, templateId, params)
        .then(() => {
            console.log('Email notification sent to', receiverEmail);
            showNotification('Email alert sent to ' + receiverEmail, 'success');
        })
        .catch(err => {
            console.error('Failed to send email:', err);
            showNotification('Failed to send email notification', 'error');
        });
}
