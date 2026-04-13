const canvas            = document.getElementById('canvas');
const canvasContainer   = document.getElementById('canvas-container');
const connectionsLayer  = document.getElementById('connections');
const gridOverlay       = document.getElementById('grid');

let selectedComponent    = null;
let isDraggingConnection = false;
let connectingFrom       = null;
let dragOffset = { x: 0, y: 0 };
let gridVisible = true;
let tempLine    = null;

const componentIcons = {
    "Sensor": "💡", "Actuator": "⚙️", "Electric Motor": "⚡",
    "Hydraulic Motor": "🛠️", "Hydraulic Pump": "🔧", "Hydraulic Cylinder": "📏",
    "PLC": "🖥️", "HMI": "📱", "Safety": "🦺", "Gateway": "🌐",
    "Switch": "🔀", "Router": "📡", "Cloud": "☁️", "Analytics": "📊", "Dashboard": "📈"
};

const componentColors = {
    'Sensor': '#4caf50', 'Actuator': '#ff9800', 'Electric Motor': '#9c27b0',
    'Hydraulic Motor': '#8e24aa', 'Hydraulic Pump': '#1976d2',
    'Hydraulic Cylinder': '#388e3c', 'PLC': '#1976d2', 'HMI': '#2196f3',
    'Safety': '#f44336', 'Gateway': '#607d8b', 'Switch': '#795548',
    'Router': '#3f51b5', 'Cloud': '#00bcd4', 'Analytics': '#8bc34a', 'Dashboard': '#ffc107'
};

function resizeCanvas() {
    if (!canvas) return;
    const rect = canvasContainer.getBoundingClientRect();
    canvas.width  = rect.width;
    canvas.height = rect.height;
}

function toggleGrid() {
    gridVisible = !gridVisible;
    gridOverlay.classList.toggle('hidden', !gridVisible);
}

function initializeArchitecture() {
    document.querySelectorAll('.component-item').forEach(item => {
        item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('componentType', item.dataset.type);
            e.dataTransfer.setData('componentIcon', item.dataset.icon);
        });
    });

    if (canvasContainer) {
        canvasContainer.addEventListener('dragover', e => e.preventDefault());
        canvasContainer.addEventListener('drop', e => {
            e.preventDefault();
            const type = e.dataTransfer.getData('componentType');
            const icon = e.dataTransfer.getData('componentIcon');
            const rect = canvasContainer.getBoundingClientRect();
            createComponent(type, icon, e.clientX - rect.left - 60, e.clientY - rect.top - 30);
        });
    }
}

function createComponent(type, icon, x, y) {
    const component = {
        id: Date.now() + Math.random(),
        type, icon: icon || componentIcons[type],
        iconType: (icon && (icon.includes('.png') || icon.includes('.jpg'))) ? 'image' : 'emoji',
        x, y, width: 120, height: 60,
        name: type + '_' + (components.length + 1),
        description: '', ip: ''
    };
    components.push(component);
    renderComponent(component);
    saveArchitectureData();
}

function renderComponent(component) {
    const div = document.createElement('div');
    div.className = 'component-block';
    div.style.left   = component.x + 'px';
    div.style.top    = component.y + 'px';
    div.style.width  = component.width  + 'px';
    div.style.height = component.height + 'px';
    div.style.borderColor = componentColors[component.type] || '#142c46';
    div.dataset.componentId = component.id;

    const iconHTML = component.iconType === 'image'
        ? `<img src="${component.icon}" alt="${component.type}" style="width:32px;height:32px;object-fit:contain;">`
        : component.icon;

    div.innerHTML = `
        <div class="block-icon" style="background:${component.iconType==='image'?'transparent':(componentColors[component.type]||'#1976d2')};display:flex;align-items:center;justify-content:center;">
            ${iconHTML}
        </div>
        <div class="block-title">${component.name}</div>
        <div class="connection-point input"  data-component-id="${component.id}" data-type="input"></div>
        <div class="connection-point output" data-component-id="${component.id}" data-type="output"></div>
        <button class="delete-btn" onclick="deleteComponent('${component.id}')">x</button>
    `;
    div.addEventListener('mousedown', startDrag);
    div.addEventListener('click', selectComponent);

    div.querySelector('.connection-point.input').addEventListener('mousedown',  e => { e.stopPropagation(); startConnection(e, component.id, 'input');  });
    div.querySelector('.connection-point.output').addEventListener('mousedown', e => { e.stopPropagation(); startConnection(e, component.id, 'output'); });

    canvasContainer.appendChild(div);
}

function deleteComponent(componentId) {
    if (!confirm('Delete this component and all its connections?')) return;
    components.splice(components.findIndex(c => c.id == componentId), 1);
    document.querySelector(`[data-component-id="${componentId}"]`)?.remove();
    connections = connections.filter(c => c.from.componentId != componentId && c.to.componentId != componentId);
    updateConnections();
    if (selectedComponent?.id == componentId) {
        document.getElementById('propertiesPanel').style.display = 'none';
        selectedComponent = null;
    }
    saveArchitectureData();
}

function clearCanvas() {
    if (!confirm('Clear the entire canvas? This cannot be undone.')) return;
    components = []; connections = [];
    canvasContainer.querySelectorAll('.component-block').forEach(el => el.remove());
    connectionsLayer.innerHTML = '';
    document.getElementById('propertiesPanel').style.display = 'none';
    saveArchitectureData();
    showNotification('Canvas cleared!', 'info');
}

function startDrag(e) {
    if (e.target.classList.contains('connection-point') || e.target.classList.contains('delete-btn') || isDraggingConnection) return;
    const div = e.currentTarget;
    const comp = components.find(c => c.id == div.dataset.componentId);
    if (!comp) return;
    dragOffset = { x: e.clientX - comp.x, y: e.clientY - comp.y };

    function drag(e) {
        comp.x = e.clientX - dragOffset.x;
        comp.y = e.clientY - dragOffset.y;
        div.style.left = comp.x + 'px';
        div.style.top  = comp.y + 'px';
        updateConnections();
    }
    function stopDrag() {
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
        saveArchitectureData();
    }
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
}

function selectComponent(e) {
    document.querySelectorAll('.component-block').forEach(el => el.classList.remove('selected'));
    e.currentTarget.classList.add('selected');
    selectedComponent = components.find(c => c.id == e.currentTarget.dataset.componentId);
    if (selectedComponent) showProperties(selectedComponent);
}

function showProperties(comp) {
    const panel = document.getElementById('propertiesPanel');
    if (!panel) return;
    document.getElementById('componentName').value = comp.name;
    document.getElementById('componentDesc').value = comp.description;
    document.getElementById('componentIP').value   = comp.ip;
    panel.style.display = 'block';
    document.getElementById('componentName').oninput = e => {
        comp.name = e.target.value;
        document.querySelector(`[data-component-id="${comp.id}"] .block-title`).textContent = comp.name;
        saveArchitectureData();
    };
    document.getElementById('componentDesc').oninput = e => { comp.description = e.target.value; saveArchitectureData(); };
    document.getElementById('componentIP').oninput   = e => { comp.ip = e.target.value; saveArchitectureData(); };
}

function startConnection(e, componentId, type) {
    e.preventDefault(); e.stopPropagation();
    isDraggingConnection = true;
    connectingFrom = { componentId, type };
    e.target.classList.add('connecting');
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mousemove', dragConnection);
    document.addEventListener('mouseup', endConnection);
}

function dragConnection(e) {
    if (!isDraggingConnection || !connectingFrom) return;
    const from = components.find(c => c.id == connectingFrom.componentId);
    if (!from) return;
    const rect  = canvasContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const fromX  = from.x + (connectingFrom.type === 'output' ? from.width : 0);
    const fromY  = from.y + from.height / 2;
    if (tempLine) tempLine.remove();
    tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    Object.assign(tempLine, {});
    tempLine.setAttribute('x1', fromX); tempLine.setAttribute('y1', fromY);
    tempLine.setAttribute('x2', mouseX); tempLine.setAttribute('y2', mouseY);
    tempLine.style.stroke = '#ff5722'; tempLine.style.strokeWidth = '2';
    tempLine.style.opacity = '0.6'; tempLine.style.strokeDasharray = '4,4';
    tempLine.style.pointerEvents = 'none';
    connectionsLayer.appendChild(tempLine);
}

function endConnection(e) {
    if (!isDraggingConnection) return;
    document.body.style.cursor = '';
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target?.classList.contains('connection-point')) {
        const tid = target.dataset.componentId;
        if (connectingFrom.componentId !== tid)
            createConnection(connectingFrom, { componentId: tid, type: target.dataset.type });
    }
    isDraggingConnection = false; connectingFrom = null;
    if (tempLine) { tempLine.remove(); tempLine = null; }
    document.querySelectorAll('.connection-point').forEach(p => p.classList.remove('connecting'));
    document.removeEventListener('mousemove', dragConnection);
    document.removeEventListener('mouseup', endConnection);
}

function createConnection(from, to) {
    if (connections.find(c =>
        (c.from.componentId === from.componentId && c.to.componentId === to.componentId) ||
        (c.from.componentId === to.componentId   && c.to.componentId === from.componentId))) return;
    connections.push({ id: Date.now() + Math.random(), from, to });
    updateConnections();
    saveArchitectureData();
}

function getConnectionPointPosition(componentId, type) {
    const el = document.querySelector(`.connection-point.${type}[data-component-id='${componentId}']`);
    if (!el) return { x: 0, y: 0 };
    const r  = el.getBoundingClientRect();
    const cr = canvasContainer.getBoundingClientRect();
    return { x: r.left + r.width/2 - cr.left, y: r.top + r.height/2 - cr.top };
}

function updateConnections() {
    if (!connectionsLayer) return;
    connectionsLayer.innerHTML = '';
    connections.forEach((conn, index) => {
        const fp = getConnectionPointPosition(conn.from.componentId, conn.from.type);
        const tp = getConnectionPointPosition(conn.to.componentId,   conn.to.type);
        const midX = (fp.x + tp.x) / 2;
        const pts  = [`${fp.x},${fp.y}`, `${midX},${fp.y}`, `${midX},${tp.y}`, `${tp.x},${tp.y}`];

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.style.cursor = 'pointer';

        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        poly.setAttribute('points', pts.join(' '));
        poly.setAttribute('stroke', '#142c46');
        poly.setAttribute('stroke-width', '2');
        poly.setAttribute('fill', 'none');
        poly.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (confirm('Delete this connection?')) { connections.splice(index, 1); updateConnections(); saveArchitectureData(); }
        });

        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        hit.setAttribute('x1', fp.x); hit.setAttribute('y1', fp.y);
        hit.setAttribute('x2', tp.x); hit.setAttribute('y2', tp.y);
        hit.style.stroke = 'transparent'; hit.style.strokeWidth = '20'; hit.style.cursor = 'pointer';
        hit.addEventListener('click', e => {
            e.stopPropagation();
            if (confirm('Delete this connection?')) { connections.splice(index, 1); updateConnections(); saveArchitectureData(); }
        });

        g.appendChild(hit); g.appendChild(poly);
        connectionsLayer.appendChild(g);
    });
}

document.addEventListener('click', e => {
    if (e.target === canvasContainer || e.target === canvas) {
        document.querySelectorAll('.component-block').forEach(el => el.classList.remove('selected'));
        document.getElementById('propertiesPanel').style.display = 'none';
        selectedComponent = null;
    }
});
