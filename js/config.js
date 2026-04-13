const EMAIL_SENDER = "glennimmanuel8@gmail.com";

const parameterConfig = {
    "Electric Motor": {
        "Speed":          { unit: "rpm", min: 0, max: 3000 },
        "Frequency":      { unit: "Hz",  min: 0, max: 100 },
        "Output Current": { unit: "A",   min: 0, max: 200 },
        "Output Voltage": { unit: "V",   min: 0, max: 1000 },
        "Temperature":    { unit: "°C",  min: -40, max: 150 }
    },
    "Hydraulic Motor": {
        "Main Flow port A":    { unit: "L/min", min: 0, max: 500 },
        "Main Flow port B":    { unit: "L/min", min: 0, max: 500 },
        "Pressure A":          { unit: "bar",   min: 0, max: 700 },
        "Pressure B":          { unit: "bar",   min: 0, max: 700 },
        "Internal Leakage Flow": { unit: "L/min", min: 0, max: 100 },
        "Case Pressure":       { unit: "bar",   min: 0, max: 700 },
        "Temperature":         { unit: "°C",    min: -40, max: 150 }
    },
    "Hydraulic Pump": {
        "Main Flow port A":    { unit: "L/min", min: 0, max: 500 },
        "Main Flow port B":    { unit: "L/min", min: 0, max: 500 },
        "Pressure A":          { unit: "bar",   min: 0, max: 700 },
        "Pressure B":          { unit: "bar",   min: 0, max: 700 },
        "Internal Leakage Flow": { unit: "L/min", min: 0, max: 100 },
        "Case Pressure":       { unit: "bar",   min: 0, max: 700 },
        "Temperature":         { unit: "°C",    min: -40, max: 150 }
    }
};

let runtimeParameterConfig = JSON.parse(JSON.stringify(parameterConfig));

const STORAGE_KEYS = {
    PARAMETER_CONFIG:          'cbm_parameter_config',
    MONITORING_DATA:           'cbm_monitoring_data',
    GLOBAL_THRESHOLD_RULES:    'cbm_global_threshold_rules',
    GLOBAL_CRITICAL_THRESHOLDS:'cbm_global_critical_thresholds',
    NOTIFICATIONS:             'cbm_notifications',
    MQTT_TOPICS:               'cbm_mqtt_topics',
    EMAIL_SETTINGS:            'cbm_email_settings'
};

var components  = [];
var connections = [];

var monitoringDataByMotor   = {};
var globalThresholdRules    = [];
var globalCriticalThresholds= [];
var allNotifications        = [];
var lastDataTimestamp       = null;
var outputMessages          = [];
var ruleAlertCounters       = {};

var mqttSubscriptions = [];

function normalizeKey(k) {
    return String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findMatchingDataKey(dataObj, templateKey) {
    const target = normalizeKey(templateKey);
    for (const k of Object.keys(dataObj)) {
        if (normalizeKey(k) === target) return k;
    }
    for (const k of Object.keys(dataObj)) {
        if (normalizeKey(k).includes(target) || target.includes(normalizeKey(k))) return k;
    }
    return null;
}

function guessType(data) {
    if (data.Type && parameterConfig[data.Type]) return data.Type;
    const name = (data.Name || "").toLowerCase();
    if (name.includes("hydraulic") && name.includes("pump"))  return "Hydraulic Pump";
    if (name.includes("hydraulic") && name.includes("motor")) return "Hydraulic Motor";
    if (name.includes("pump"))      return "Hydraulic Pump";
    if (name.includes("hydraulic")) return "Hydraulic Motor";
    return "Electric Motor";
}

function getAllMonitoringData() {
    const fromMotors = Object.values(monitoringDataByMotor).flat();
    const fromMqtt   = mqttSubscriptions.map(s => ({
        id:     s.id,
        name:   s.label,
        value:  s.value,
        unit:   s.unit,
        min:    s.min,
        max:    s.max,
        status: s.status,
        history:s.history
    }));
    return [...fromMotors, ...fromMqtt];
}
