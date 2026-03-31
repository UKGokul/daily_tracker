// Initialize Application State
let currentDate = new Date();
// Format the date for the key: YYYY-MM-DD
function getDbKey(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `dailyTracker_${year}-${month}-${day}`;
}

const defaultState = {
    joints: 0,
    bath: false,
    sleep: { wake: '', sleep: '' },
    budget: { income: '', spend: '' },
    food: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    workouts: [],
    tasks: [],
    work: []
};

let appState = {};

// --- DOM Elements ---
// Navigation
const dateDisplay = document.getElementById('dateDisplay');
const prevDateBtn = document.getElementById('prevDateBtn');
const nextDateBtn = document.getElementById('nextDateBtn');
const todayBtn = document.getElementById('todayBtn');
const viewHistoryBtn = document.getElementById('viewHistoryBtn');

// Joints
const jointsCountNode = document.getElementById('jointsCount');
const jointsMinusBtn = document.getElementById('jointsMinus');
const jointsPlusBtn = document.getElementById('jointsPlus');

// Bath
const bathToggle = document.getElementById('bathToggle');
const bathLabel = document.getElementById('bathLabel');

// Sleep Schedule
const wakeTimeInput = document.getElementById('wakeTime');
const sleepTimeInput = document.getElementById('sleepTime');

// Budget
const budgetIncomeInput = document.getElementById('budgetIncome');
const budgetSpendInput = document.getElementById('budgetSpend');

// Food
const foodBreakfast = document.getElementById('foodBreakfast');
const foodLunch = document.getElementById('foodLunch');
const foodSnacks = document.getElementById('foodSnacks');
const foodDinner = document.getElementById('foodDinner');

// Workout
const workoutList = document.getElementById('workoutList');
const workoutForm = document.getElementById('workoutForm');
const workoutInput = document.getElementById('workoutInput');

// Tasks
const taskList = document.getElementById('taskList');
const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');

// Work
const workList = document.getElementById('workList');
const workForm = document.getElementById('workForm');
const workStartTime = document.getElementById('workStartTime');
const workEndTime = document.getElementById('workEndTime');
const workProjectInput = document.getElementById('workProjectInput');


// --- Initialization ---
function initApp() {
    loadDataForDate(currentDate);
    updateDateDisplay();
    setupEventListeners();
}

function updateDateDisplay() {
    const isToday = getDbKey(currentDate) === getDbKey(new Date());
    
    // Day text
    const dayNode = dateDisplay.querySelector('.date-day');
    dayNode.textContent = isToday ? 'Today' : currentDate.toLocaleDateString('en-US', { weekday: 'long' });
    
    // Full date text
    const fullDateNode = dateDisplay.querySelector('.date-full');
    fullDateNode.textContent = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    // Toggle today button visibility
    todayBtn.style.display = isToday ? 'none' : 'block';
}

function loadDataForDate(date) {
    const key = getDbKey(date);
    const stored = localStorage.getItem(key);
    
    if (stored) {
        appState = JSON.parse(stored);
        // Ensure all default properties exist even if older version
        appState = { ...defaultState, ...appState };
    } else {
        appState = JSON.parse(JSON.stringify(defaultState)); // Deep copy
    }
    
    renderApp();
}

function saveData() {
    const key = getDbKey(currentDate);
    localStorage.setItem(key, JSON.stringify(appState));
    showToast();
}

// --- Render UI ---
function renderApp() {
    // 1. Joints
    jointsCountNode.textContent = appState.joints;
    
    // 5. Bath
    bathToggle.checked = appState.bath;
    updateBathLabel(appState.bath);
    
    // Sleep
    wakeTimeInput.value = appState.sleep.wake || '';
    sleepTimeInput.value = appState.sleep.sleep || '';
    
    // Budget
    budgetIncomeInput.value = appState.budget.income || '';
    budgetSpendInput.value = appState.budget.spend || '';
    
    // Food
    foodBreakfast.value = appState.food.breakfast || '';
    foodLunch.value = appState.food.lunch || '';
    foodSnacks.value = appState.food.snacks || '';
    foodDinner.value = appState.food.dinner || '';
    
    // Lists
    renderList(workoutList, appState.workouts, 'workout');
    renderList(taskList, appState.tasks, 'task');
    renderWorkList();
}

function updateBathLabel(isDone) {
    if (isDone) {
        bathLabel.textContent = "Done";
        bathLabel.classList.add('active');
    } else {
        bathLabel.textContent = "Not Yet";
        bathLabel.classList.remove('active');
    }
}

// Render generic list (Tasks / Workouts)
function renderList(containerNode, itemsArray, type) {
    containerNode.innerHTML = '';
    
    if (itemsArray.length === 0) {
        containerNode.innerHTML = `<div class="empty-state">No items added yet.</div>`;
        return;
    }
    
    itemsArray.forEach(item => {
        const div = document.createElement('div');
        div.className = `list-item ${item.done ? 'completed' : ''}`;
        
        div.innerHTML = `
            <div class="item-content">
                <input type="checkbox" class="checkbox-custom" ${item.done ? 'checked' : ''} data-id="${item.id}" data-type="${type}">
                <div class="item-text">${escapeHtml(item.text)}</div>
            </div>
            <button class="delete-btn" data-id="${item.id}" data-type="${type}" title="Delete">
                <i class="fas fa-trash"></i>
            </button>
        `;
        containerNode.appendChild(div);
    });
}

// Render Work List
function renderWorkList() {
    workList.innerHTML = '';
    
    if (appState.work.length === 0) {
        workList.innerHTML = `<div class="empty-state">No work sessions logged yet.</div>`;
        return;
    }
    
    appState.work.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        
        div.innerHTML = `
            <div class="item-content">
                <i class="fas fa-briefcase icon-blue mt-1"></i>
                <div>
                    <div class="item-text">${escapeHtml(item.project)}</div>
                    <div class="item-subtext"><i class="far fa-clock"></i> ${formatTime(item.start)} to ${formatTime(item.end)}</div>
                </div>
            </div>
            <button class="delete-btn" data-id="${item.id}" data-type="work" title="Delete">
                <i class="fas fa-trash"></i>
            </button>
        `;
        workList.appendChild(div);
    });
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    // Navigation
    prevDateBtn.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() - 1);
        initApp();
    });
    
    nextDateBtn.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() + 1);
        initApp();
    });
    
    todayBtn.addEventListener('click', () => {
        currentDate = new Date();
        initApp();
    });
    
    viewHistoryBtn.addEventListener('click', () => {
        window.location.href = 'history.html';
    });

    // 1. Joints
    jointsMinusBtn.addEventListener('click', () => {
        if (appState.joints > 0) {
            appState.joints--;
            jointsCountNode.textContent = appState.joints;
            saveData();
        }
    });

    jointsPlusBtn.addEventListener('click', () => {
        appState.joints++;
        jointsCountNode.textContent = appState.joints;
        saveData();
    });

    // 5. Bath
    bathToggle.addEventListener('change', (e) => {
        appState.bath = e.target.checked;
        updateBathLabel(appState.bath);
        saveData();
    });

    // Sleep
    const saveSleep = () => {
        appState.sleep.wake = wakeTimeInput.value;
        appState.sleep.sleep = sleepTimeInput.value;
        saveData();
    };
    wakeTimeInput.addEventListener('change', saveSleep);
    sleepTimeInput.addEventListener('change', saveSleep);

    // Budget
    const saveBudget = () => {
        appState.budget.income = budgetIncomeInput.value;
        appState.budget.spend = budgetSpendInput.value;
        saveData();
    };
    budgetIncomeInput.addEventListener('input', debounce(saveBudget, 1000));
    budgetSpendInput.addEventListener('input', debounce(saveBudget, 1000));

    // Food
    const saveFood = () => {
        appState.food.breakfast = foodBreakfast.value;
        appState.food.lunch = foodLunch.value;
        appState.food.snacks = foodSnacks.value;
        appState.food.dinner = foodDinner.value;
        saveData();
    };
    foodBreakfast.addEventListener('input', debounce(saveFood, 1000));
    foodLunch.addEventListener('input', debounce(saveFood, 1000));
    foodSnacks.addEventListener('input', debounce(saveFood, 1000));
    foodDinner.addEventListener('input', debounce(saveFood, 1000));

    // Form Submissions
    workoutForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = workoutInput.value.trim();
        if (text) {
            appState.workouts.push({ id: Date.now(), text, done: false });
            workoutInput.value = '';
            renderApp();
            saveData();
            scrollToBottom(workoutList);
        }
    });

    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = taskInput.value.trim();
        if (text) {
            appState.tasks.push({ id: Date.now(), text, done: false });
            taskInput.value = '';
            renderApp();
            saveData();
            scrollToBottom(taskList);
        }
    });

    workForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const start = workStartTime.value;
        const end = workEndTime.value;
        const project = workProjectInput.value.trim();
        
        if (start && end && project) {
            appState.work.push({ id: Date.now(), start, end, project });
            workStartTime.value = '';
            workEndTime.value = '';
            workProjectInput.value = '';
            renderApp();
            saveData();
            scrollToBottom(workList);
        }
    });

    // List Interactions (Delegation)
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('checkbox-custom')) {
            const id = parseInt(e.target.dataset.id);
            const type = e.target.dataset.type;
            const checked = e.target.checked;
            
            const list = type === 'workout' ? appState.workouts : appState.tasks;
            const item = list.find(item => item.id === id);
            
            if (item) {
                item.done = checked;
                renderApp();
                saveData();
            }
        }
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-btn');
        if (btn) {
            const id = parseInt(btn.dataset.id);
            const type = btn.dataset.type;
            
            if (type === 'workout') {
                appState.workouts = appState.workouts.filter(item => item.id !== id);
            } else if (type === 'task') {
                appState.tasks = appState.tasks.filter(item => item.id !== id);
            } else if (type === 'work') {
                appState.work = appState.work.filter(item => item.id !== id);
            }
            
            renderApp();
            saveData();
        }

        // Widget navigation to history map
        const widget = e.target.closest('.widget');
        if (widget && !e.target.closest('input') && !e.target.closest('button') && !e.target.closest('textarea') && !e.target.closest('label.toggle-switch')) {
            // Optional: Click on widget background goes to history
            // window.location.href = `history.html?widget=${widget.id}`;
        }
    });
}

// --- Utils ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

let toastTimeout;
function showToast() {
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function formatTime(timeStr) {
    // timeStr is usually "HH:MM"
    if (!timeStr) return "";
    let [hours, minutes] = timeStr.split(':');
    hours = parseInt(hours);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    return `${hours}:${minutes} ${ampm}`;
}

function scrollToBottom(element) {
    setTimeout(() => {
        element.scrollTop = element.scrollHeight;
    }, 50);
}

// Run!
document.addEventListener('DOMContentLoaded', initApp);
