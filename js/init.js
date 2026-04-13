document.addEventListener('DOMContentLoaded', function () {
    console.log('Bosch Rexroth Industrial Suite loading...');

    if (loadArchitectureData()) {
        components.forEach(renderComponent);
        updateConnections();
    }
    loadConfigurationFromStorage();
    emailSettings = loadEmailSettings();

    if (emailSettings.publicKey && typeof emailjs !== 'undefined') {
        emailjs.init(emailSettings.publicKey);
    }

    window.addEventListener('resize', () => {
        if (document.getElementById('architectureSection').classList.contains('active'))
            resizeCanvas();
    });

    initializeArchitecture();

    connectMqttBroker(mqttBrokerUrl);

    showArchitecture();

    setInterval(() => {
        saveConfigurationToStorage();
        saveArchitectureData();
        console.log('Auto-saved all configurations.');
    }, 300000);

    setInterval(() => {
        if (document.getElementById('monitoringSection').classList.contains('active')) {
            getSystemStatus();
        }
    }, 30000);

    setTimeout(() => showNotification('Welcome to Bosch Rexroth Industrial Suite.', 'info'), 2000);
});
