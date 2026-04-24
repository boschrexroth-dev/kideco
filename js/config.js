const EMAIL_SENDER = "glennimmanuel8@gmail.com";

const INFLUX_CONFIG = {
    proxyUrl: 'https://odd-leaf-0456.glennimmanuel8.workers.dev/'
};

const _IS_LOCAL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');


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

var globalThresholdRules    = [];
var globalCriticalThresholds= [];
var allNotifications        = [];
var lastDataTimestamp       = null;
var outputMessages          = [];
var ruleAlertCounters       = {};

var mqttSubscriptions = [];
var cardViewModes = {};


function getAllMonitoringData() {
    return mqttSubscriptions.map(s => ({
        id:     s.id,
        name:   s.label,
        value:  s.value,
        unit:   s.unit,
        min:    s.min,
        max:    s.max,
        status: s.status,
        history:s.history
    }));
}
