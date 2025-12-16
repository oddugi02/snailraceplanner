import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/* =========================
   DOM
========================= */
const app = document.getElementById('app');
const taskFormModal = document.getElementById('task-form-modal');
const addTaskBtn = document.getElementById('add-task-btn');
const taskForm = document.getElementById('task-form');
const enableTimeCheckbox = document.getElementById('enable-time');
const timeInputsDiv = document.getElementById('time-inputs');
const historyBtn = document.getElementById('history-btn');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const notificationArea = document.getElementById('notification-area');
const tasksBtn = document.getElementById('tasks-btn');
const tasksPanel = document.getElementById('tasks-panel');
const tasksList = document.getElementById('tasks-list');

const SNAIL_Y = 0;
const DEBUG = false;

/* =========================
   Day Picker
========================= */
tasksBtn?.addEventListener('click', () => {
    tasksPanel.classList.toggle('hidden');
    renderTasksList();
});

const dayPicker = document.getElementById('day-picker');
const taskDayInput = document.getElementById('task-day');

function selectDayButton(dayIndex) {
    if (!dayPicker) return;
    dayPicker.querySelectorAll('.day-btn').forEach((btn) => {
        btn.classList.toggle('selected', Number(btn.dataset.day) === Number(dayIndex));
    });
    if (taskDayInput) taskDayInput.value = String(dayIndex);
}
selectDayButton(0);

dayPicker?.addEventListener('click', (e) => {
    const btn = e.target.closest('.day-btn');
    if (!btn) return;
    selectDayButton(Number(btn.dataset.day));
});

/* =========================
   Utils
========================= */
function extractRenderableRoot(scene) {
    if (scene?.children?.length === 1 && scene.children[0].isGroup) return scene.children[0];
    let candidate = null;
    scene?.traverse((o) => {
        if (o.isMesh && !candidate) candidate = o.parent;
    });
    return candidate || scene;
}

function kstNow() {
    const now = new Date();
    return new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60000);
}

function dateText(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function hourText(h) {
    const hh = Math.floor(h);
    const mm = String(Math.round((h - hh) * 60)).padStart(2, '0');
    return `${hh}:${mm}`;
}

function getPopupDayText(dayIndex, currentKstDay) {
    const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
    const targetDayName = dayNames[dayIndex];

    const currentDayJs = currentKstDay; // 0(일)~6(토)
    const currentDayApp = (currentDayJs + 6) % 7; // 0(월)~6(일)

    if (dayIndex === currentDayApp) return '오늘';

    const currentDayApp_Mon0 = (currentDayJs + 6) % 7;
    if (dayIndex < currentDayApp_Mon0) return '다음 주 ' + targetDayName;
    return '이번 주 ' + targetDayName;
}

const COMPLETION_MESSAGES = [
    (title, num) => `달팽이 ${num}호 (${title})가 나에게 도달하여 집으로 돌아갔습니다!`,
    (title, num) => `달팽이 ${num}호 (${title})가 완주에 성공하여 휴식을 취하러 떠났습니다!`,
    (title, num) => `축하합니다! ${title} 달팽이가 무사히 임무를 완수했습니다.`,
    (title, num) => `${title} (달팽이 ${num}호)가 당신의 손에서 안식을 찾았습니다.`,
    (title, num) => `다음 목표를 향해! ${title} 달팽이와의 여정을 마무리했습니다!`,
];

/* =========================
   Notification (1초 후 무조건 사라지게)
========================= */
function showNotification(message, isOblique = false, duration = 3000, keepAnimation = false) {
    const note = document.createElement('div');
    note.className = `notification show ${isOblique ? 'oblique' : ''}`;
    note.innerHTML = message;
    notificationArea.appendChild(note);

    if (!keepAnimation) {
        setTimeout(() => {
            note.classList.remove('show');
            // transition이 있으면 그때 remove, 없으면 강제 remove
            let removed = false;
            const kill = () => {
                if (removed) return;
                removed = true;
                note.remove();
            };
            note.addEventListener('transitionend', kill, { once: true });
            setTimeout(kill, 250);
        }, duration);
    }
    return note;
}

/* =========================
   UI
========================= */
enableTimeCheckbox?.addEventListener('change', () => {
    timeInputsDiv.classList.toggle('hidden', !enableTimeCheckbox.checked);
});

addTaskBtn?.addEventListener('click', () => {
    taskFormModal.classList.remove('hidden');
    const today = new Date();
    document.getElementById('task-date').value = today.toISOString().substring(0, 10);
});

historyBtn?.addEventListener('click', () => {
    historyPanel.classList.toggle('hidden');
    renderHistoryList();
});

/* =========================
   Tooltip (DOM)
========================= */
let tooltip = document.getElementById('tooltip');
if (tooltip) {
    tooltip.style.cssText += `
    position: fixed;
    z-index: 99999;
    pointer-events: none;
    background: rgba(40,40,40,0.95);
    color: white;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.4;
    white-space: nowrap;
  `;
    tooltip.style.display = 'none';
} else {
    tooltip = document.createElement('div');
    tooltip.id = 'tooltip';
    tooltip.style.cssText = `
    position: fixed;
    pointer-events: none;
    background: rgba(40,40,40,0.95);
    color: white;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.4;
    display: none;
    z-index: 99999;
    white-space: nowrap;
  `;
    document.body.appendChild(tooltip);
}

/* =========================
   Scene / Camera / Renderer
========================= */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(18, 22, 30);
camera.lookAt(0, 0, -40);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;


// ✅ 추가
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25; // 1.1~1.6 사이로 취향 조절

app.appendChild(renderer.domElement);

/* =========================
   Controls
========================= */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableRotate = false;
controls.enablePan = true;
controls.enableZoom = true;
controls.screenSpacePanning = true;
controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
};
controls.target.set(0, 0, -40);

/* =========================
   Lights
========================= */
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(30, 60, 20);
scene.add(dirLight);

const ambLight = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambLight);



/* =========================
   Track
========================= */
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const HOURS_PER_DAY = 24;
const TOTAL_HOURS = DAYS.length * HOURS_PER_DAY;

const UNIT = 1;
const trackLengthZ = TOTAL_HOURS * UNIT;
const trackWidthX = 14;
const trackHalfW = trackWidthX / 2;

function dayStartZ(dayIndex) {
    return -trackLengthZ / 2 + dayIndex * HOURS_PER_DAY * UNIT;
}
function hourZ(dayIndex, hour) {
    return dayStartZ(dayIndex) + hour * UNIT;
}

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(trackWidthX, trackLengthZ),
    new THREE.MeshPhongMaterial({ color: 0xf7f7f7, side: THREE.DoubleSide })
);
ground.rotation.x = -Math.PI / 2;
ground.position.z = 0;
scene.add(ground);

// 캔버스 크기 옵션(잘림 방지)
function makeTextTex(text, color = '#222', font = 'bold 64px system-ui', w = 1024, h = 256) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

/* =========================
   ME
========================= */
const ME_RADIUS = 0.5;
const meLine = new THREE.Mesh(
    new THREE.SphereGeometry(ME_RADIUS, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0x0000ff })
);
meLine.position.set(0, ME_RADIUS + 0.01, 0);
scene.add(meLine);

// ✅ ME 글자: 2.5배 줄인 버전 + 잘림 방지 + 카메라 바라보기
const ME_PLANE_W = 6;
const ME_PLANE_H = 1.6;
const ME_FONT = 'bold 240px system-ui';
const ME_Y = 2.2;

const meText = new THREE.Mesh(
    new THREE.PlaneGeometry(ME_PLANE_W, ME_PLANE_H),
    new THREE.MeshBasicMaterial({
        map: makeTextTex('ME', '#111', ME_FONT, 1024, 512),
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
    })
);
meText.renderOrder = 999;
scene.add(meText);

// Hover 안정화 박스(안 보이게)
const meDetectBox = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 2.5, 2.5),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.0, depthWrite: false })
);
meDetectBox.position.set(0, 1.25, 0);
meDetectBox.userData.isMeBox = true;
scene.add(meDetectBox);

/* =========================
   Storage: Tasks + History
========================= */
const HISTORY_KEY = 'snail_history_v1';
const TASKS_KEY = 'snail_tasks_v1';
const HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function loadHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        const now = Date.now();
        const kept = (Array.isArray(arr) ? arr : []).filter((item) => now - (item.ts || 0) <= HISTORY_TTL_MS);
        if (kept.length !== arr.length) localStorage.setItem(HISTORY_KEY, JSON.stringify(kept));
        return kept;
    } catch {
        return [];
    }
}

function saveHistory() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(completedTasks));
}

function pushHistory(entry) {
    completedTasks.push(entry);
    const now = Date.now();
    for (let i = completedTasks.length - 1; i >= 0; i--) {
        if (now - (completedTasks[i].ts || 0) > HISTORY_TTL_MS) completedTasks.splice(i, 1);
    }
    saveHistory();
}

function loadTasks(seed) {
    try {
        const raw = localStorage.getItem(TASKS_KEY);
        if (!raw) return seed;
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : seed;
    } catch {
        return seed;
    }
}

function saveTasks() {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

/* =========================
   Tasks Data
========================= */
const SEED_TASKS = [
    { title: '철학 에세이', dayIndex: 1, dueHour: 18.0, snailNumber: 1 },
    { title: '3D 렌더 제출', dayIndex: 3, dueHour: 21.5, snailNumber: 2 },
    { title: '인터랙션 과제', dayIndex: 4, dueHour: 15.0, snailNumber: 3 },
    { title: '주간 회고', dayIndex: 6, dueHour: 10.0, snailNumber: 4 },
];

const completedTasks = loadHistory();
const tasks = loadTasks(SEED_TASKS); // ✅ 삭제/추가가 새로고침해도 유지됨

const snails = [];
const snailDetectionBoxes = [];

/* =========================
   History UI
========================= */
function renderHistoryList() {
    if (!historyList) return;
    historyList.innerHTML = '';

    if (!completedTasks.length) {
        const li = document.createElement('li');
        li.className = 'history-empty oblique';
        li.textContent = '아직 집에 돌아간 달팽이가 없습니다..';
        historyList.appendChild(li);
        return;
    }

    completedTasks
        .slice()
        .reverse()
        .forEach((t) => {
            const statusText = t.status === 'deleted' ? '(삭제됨)' : '(완료됨)';
            const li = document.createElement('li');
            li.innerHTML = `
        <strong>${t.title}</strong> ${statusText}<br>
        <span class="history-msg">${t.completedMessage}</span>
      `;
            historyList.appendChild(li);
        });
}

/* =========================
   Tasks UI (삭제 버튼)
========================= */
function renderTasksList() {
    if (!tasksList) return;

    tasksList.innerHTML = '';

    tasks.forEach((t) => {
        const li = document.createElement('li');
        li.innerHTML = `
      <div class="task-item">
        <div>
          <strong>${t.title}</strong>
          <span class="task-meta">
            (${DAYS[t.dayIndex]} ${hourText(t.dueHour)}) · 달팽이 ${t.snailNumber}호
          </span>
        </div>
        <button class="task-delete-btn">삭제</button>
      </div>
    `;

        li.querySelector('.task-delete-btn')?.addEventListener('click', () => deleteTask(t));
        tasksList.appendChild(li);
    });

    // ✅ 스크롤은 CSS에서: #tasks-list { max-height: ...; overflow:auto; }
}

/* =========================
   Add Task
========================= */
taskForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    taskFormModal.classList.add('hidden');

    const title = document.getElementById('task-title').value;
    const enableTime = document.getElementById('enable-time').checked;

    let hour = 23;
    let minute = 59;

    if (enableTime) {
        hour = parseInt(document.getElementById('task-hour').value) || 0;
        minute = parseInt(document.getElementById('task-minute').value) || 0;
    }

    const dayIndexLocal = parseInt(document.getElementById('task-day').value, 10) || 0;
    const dueHour = hour + minute / 60;

    const newTask = { title, dayIndex: dayIndexLocal, dueHour, snailNumber: getNextSnailNumber() };

    const preparationNote = showNotification('달팽이를 준비하고 있습니다...', true, 99999, true);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    preparationNote.remove();

    createSnail(newTask, snails.length);
    tasks.push(newTask);
    saveTasks(); // ✅
    updateLayout();
    renderTasksList();

    showNotification(`달팽이 ${newTask.snailNumber}호 (${newTask.title})가 추가되었습니다!`, false, 3000);
});

/* =========================
   Delete Task (달팽이도 같이 제거 + History (삭제됨))
========================= */
function deleteTask(task) {
    const root = snails.find((s) => s.userData.snailNumber === task.snailNumber);

    if (root) {
        scene.remove(root);

        const snailIdx = snails.indexOf(root);
        if (snailIdx > -1) snails.splice(snailIdx, 1);

        const boxIdx = snailDetectionBoxes.findIndex((b) => b.userData.snailRoot === root);
        if (boxIdx > -1) snailDetectionBoxes.splice(boxIdx, 1);
    }

    const taskIdx = tasks.findIndex((t) => t.snailNumber === task.snailNumber);
    if (taskIdx > -1) tasks.splice(taskIdx, 1);
    saveTasks(); // ✅ 삭제 영구 반영

    pushHistory({
        ...task,
        status: 'deleted',
        completedMessage: '사용자에 의해 삭제됨',
        ts: Date.now(),
    });

    renderTasksList();
    renderHistoryList();

    showNotification(`달팽이 ${task.snailNumber}호 (${task.title})가 삭제되었습니다.`, true, 1000, false);
}

function getNextSnailNumber() {
    const nums = [...tasks.map((t) => t.snailNumber || 0), ...completedTasks.map((t) => t.snailNumber || 0)];
    const max = nums.length ? Math.max(...nums) : 0;
    return max + 1;
}

function laneX(i) {
    const lanes = [-5.5, -1.8, 1.8, 5.5];
    return lanes[i % lanes.length] ?? 0;
}

/* =========================
   Snail Model Helpers
========================= */
let snailTemplate = null;

function fallbackSnail() {
    return new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.8, 1, 32),
        new THREE.MeshStandardMaterial({ color: 0x964b00 })
    );
}

function forceVisibleMaterials(root) {
    let meshCount = 0;
    root.traverse((o) => {
        if (!o.isMesh) return;
        meshCount++;

        if (o.geometry && !o.geometry.attributes?.normal) o.geometry.computeVertexNormals();

        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
            if (!m) return;

            if (m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshBasicMaterial) {
                if (m.color && m.color.getHex() === 0xffffff) m.color.setHex(0x964b00);
                else if (!m.color) m.color = new THREE.Color(0x964b00);
            } else {
                o.material = new THREE.MeshStandardMaterial({ color: 0x964b00, roughness: 0.8, metalness: 0.1 });
            }

            const mat = Array.isArray(o.material) ? o.material[0] : o.material;
            mat.side = THREE.DoubleSide;
            mat.transparent = false;
            mat.opacity = 1;
            if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
            mat.needsUpdate = true;
        });
    });
    return meshCount;
}

function normalizeModel(model) {
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model, true);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    model.position.sub(center);
    model.updateMatrixWorld(true);

    const desiredMax = 1.8;
    const s = desiredMax / (maxDim || 1);
    model.scale.setScalar(s);
    model.updateMatrixWorld(true);

    const box2 = new THREE.Box3().setFromObject(model, true);
    const bottom = box2.min.y;
    model.position.y -= bottom;

    return model;
}

/* =========================
   Create Snail
========================= */
function createSnail(task, idx) {
    const root = new THREE.Group();
    root.userData.task = task;

    const snail = (snailTemplate || fallbackSnail()).clone(true);
    forceVisibleMaterials(snail);
    normalizeModel(snail);
    root.add(snail);

    const detectionBox = new THREE.Mesh(
        new THREE.BoxGeometry(4.0, 4.0, 4.0),
        new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: DEBUG ? 0.25 : 0.0,
            depthWrite: false,
        })
    );
    detectionBox.position.y = 2.0;
    root.add(detectionBox);

    const z = hourZ(task.dayIndex, task.dueHour);
    root.position.set(laneX(idx), SNAIL_Y, z);

    detectionBox.userData.task = task;
    detectionBox.userData.isDetectionBox = true;
    detectionBox.userData.snailRoot = root;

    root.userData.remainingMeters = 0;
    root.userData.snailNumber = task.snailNumber;

    scene.add(root);
    snails.push(root);
    snailDetectionBoxes.push(detectionBox);
}

/* =========================
   Init Snails
========================= */
(async () => {
    try {
        const rawScene = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}snail.glb`);

        const sceneToExtract = rawScene.scene || rawScene;
        snailTemplate = extractRenderableRoot(sceneToExtract);
    } catch (e) {
        console.error('GLTF Load Failed:', e);
        snailTemplate = fallbackSnail();
    }

    const meshCount = forceVisibleMaterials(snailTemplate);
    if (meshCount === 0) snailTemplate = fallbackSnail();

    // ✅ 저장된 snailNumber를 덮어쓰지 않기 (없을 때만 세팅)
    tasks.forEach((task, idx) => {
        if (!task.snailNumber) task.snailNumber = idx + 1;
        createSnail(task, idx);
    });
    saveTasks(); // ✅ 보정이 있었다면 저장

    updateLayout();
    renderTasksList();
    renderHistoryList();
})();

/* =========================
   Complete Snail (History (완료됨) + tasks에서 제거 + 저장)
========================= */
function completeSnail(root) {
    const task = root.userData.task;
    if (!task) {
        scene.remove(root);
        return;
    }

    const snailNum = root.userData.snailNumber;
    const message = COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)](task.title, snailNum);

    pushHistory({
        ...task,
        status: 'completed',
        completedMessage: message,
        ts: Date.now(),
    });
    renderHistoryList();

    showNotification(message, false, 5000);

    // 제거
    scene.remove(root);

    const index = snails.indexOf(root);
    if (index > -1) {
        snails.splice(index, 1);
        const boxIdx = snailDetectionBoxes.findIndex((b) => b.userData.snailRoot === root);
        if (boxIdx > -1) snailDetectionBoxes.splice(boxIdx, 1);

        const taskIdx = tasks.findIndex((t) => t.snailNumber === task.snailNumber);
        if (taskIdx > -1) tasks.splice(taskIdx, 1);
        saveTasks(); // ✅ 완료도 영구 반영
    }

    renderTasksList();
}

/* =========================
   Hover (Raycaster)
========================= */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects([meDetectBox, ...snailDetectionBoxes], false);

    if (!hits.length) {
        tooltip.style.display = 'none';
        return;
    }

    const hit = hits[0].object;
    const now = kstNow();

    if (hit.userData.isMeBox) {
        const currentDayJs = now.getDay();
        const currentDayName = ['일', '월', '화', '수', '목', '금', '토'][currentDayJs];
        const currentTime = hourText(now.getHours() + now.getMinutes() / 60);

        tooltip.innerHTML = `
      <b>현재 시간 (ME)</b><br/>
      ${dateText(now)} ${currentDayName}요일 ${currentTime}
    `;
    }

    if (hit.userData.isDetectionBox) {
        const t = hit.userData.task;
        const root = hit.userData.snailRoot;

        if (t && root) {
            const remainingMM = (root.userData.remainingMeters || 0) * 1000;
            const currentKstDay = now.getDay();
            const popupDayText = getPopupDayText(t.dayIndex, currentKstDay);

            tooltip.innerHTML = `
        <b>${t.title}</b><br/>
        ${popupDayText} ${hourText(t.dueHour)}<br/>
        나와의 시간 거리: ${Number(remainingMM).toFixed(0)} mm
      `;
        } else {
            tooltip.style.display = 'none';
            return;
        }
    }

    tooltip.style.left = e.clientX + 12 + 'px';
    tooltip.style.top = e.clientY + 12 + 'px';
    tooltip.style.display = 'block';
});

/* =========================
   Update Layout
========================= */
function updateLayout() {
    const now = kstNow();
    const day = (now.getDay() + 6) % 7; // 월(0) ~ 일(6)
    const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

    const nowZ = hourZ(day, hour);

    meLine.position.z = nowZ;
    meDetectBox.position.z = nowZ;

    // ✅ ME 텍스트: 구체 위 + 카메라 바라보기
    meText.position.set(0, ME_Y, nowZ);
    meText.lookAt(camera.position);

    const snailsToRemove = [];
    snails.forEach((root) => {
        const dz = root.position.z - nowZ;
        root.userData.remainingMeters = Math.abs(dz);
        if (dz < -0.1) snailsToRemove.push(root);
    });

    snailsToRemove.forEach(completeSnail);
}

setInterval(updateLayout, 1000);

/* =========================
   Resize + Render + Animation
========================= */
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

// 초기 UI 렌더
renderHistoryList();
renderTasksList();
