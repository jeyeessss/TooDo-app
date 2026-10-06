// --- REPLACE THESE WITH YOUR OWN SUPABASE CREDENTIALS ---
const SUPABASE_URL = 'https://uygnaxmdlsridrxztrho.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5Z25heG1kbHNyaWRyeHp0cmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyODI2MTksImV4cCI6MjEwNjg1ODYxOX0.iWqJxnyvTD__v28fVRiO6JV89EBCtn-6OQwZUbe15tM';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const taskInput = document.getElementById('task-input');
const dueDateInput = document.getElementById('due-date-input');
const prioritySelect = document.getElementById('priority-select');
const addBtn = document.getElementById('add-btn');
const taskList = document.getElementById('task-list');
const sortPriorityBtn = document.getElementById('sort-priority-btn');
const enableNotificationsBtn = document.getElementById('enable-notifications-btn');
const notificationArea = document.getElementById('notification-area');
const themeToggleBtn = document.getElementById('theme-toggle');

let currentTasksData = [];
let isSortedByPriority = false;
let countdownInterval = null;
const reminderLeadTimeMs = 24 * 60 * 60 * 1000;
const dueReminderGracePeriodMs = 5 * 60 * 1000;
const sentReminderKeys = new Set();

function updateThemeToggle() {
    const isDarkMode = document.documentElement.classList.contains('dark-mode');
    const label = isDarkMode ? 'Switch to light mode' : 'Switch to dark mode';
    themeToggleBtn.textContent = isDarkMode ? '\u2600' : '\u263e';
    themeToggleBtn.setAttribute('aria-label', label);
    themeToggleBtn.title = label;
}

try {
    if (localStorage.getItem('todo-theme') === 'dark') {
        document.documentElement.classList.add('dark-mode');
    }
} catch {
    // The theme toggle still works for this page when storage is unavailable.
}

if (themeToggleBtn) {
    updateThemeToggle();
    themeToggleBtn.addEventListener('click', () => {
        const isDarkMode = document.documentElement.classList.toggle('dark-mode');
        try {
            localStorage.setItem('todo-theme', isDarkMode ? 'dark' : 'light');
        } catch {
            // Keep the selected theme until the page is closed.
        }
        updateThemeToggle();
    });
}

// 1. Fetch tasks
async function fetchTasks() {
    const { data, error } = await supabaseClient
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }
    currentTasksData = data || [];
    renderTasks(currentTasksData);
    checkDueDateReminders();
}

function hasSentReminder(key) {
    if (sentReminderKeys.has(key)) return true;
    try {
        return localStorage.getItem(key) === 'sent';
    } catch {
        return false;
    }
}

function markReminderSent(key) {
    sentReminderKeys.add(key);
    try {
        localStorage.setItem(key, 'sent');
    } catch {
        // Keep the in-memory guard when browser storage is unavailable.
    }
}

function showInAppReminder(task, messageText, reminderKey) {
    const toast = document.createElement('div');
    toast.className = 'reminder-toast';

    const message = document.createElement('span');
    message.textContent = messageText;

    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.textContent = 'Dismiss';
    dismissButton.setAttribute('aria-label', `Dismiss reminder for ${task.task}`);
    dismissButton.addEventListener('click', () => toast.remove());

    toast.append(message, dismissButton);
    toast.dataset.reminderKey = reminderKey;
    notificationArea.appendChild(toast);
    window.setTimeout(() => toast.remove(), 15000);
}

function sendTaskReminder(task, key, title, message) {
    if (hasSentReminder(key)) return;

    markReminderSent(key);
    showInAppReminder(task, message, key);

    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const notification = new Notification(title, {
                body: task.task,
                tag: key
            });
            notification.addEventListener('click', () => {
                window.focus();
                notification.close();
            });
        } catch (error) {
            console.warn('Could not show system notification:', error);
        }
    }
}

function checkDueDateReminders() {
    const now = Date.now();

    currentTasksData.forEach(task => {
        if (task.is_completed || !task.due_date) return;

        const dueTime = new Date(task.due_date).getTime();
        const timeUntilDue = dueTime - now;
        if (timeUntilDue <= 0) {
            if (timeUntilDue >= -dueReminderGracePeriodMs) {
                const dueKey = `todo-due-${task.id}-${dueTime}`;
                sendTaskReminder(task, dueKey, 'Task is due now', `Due now: ${task.task}`);
            }
            return;
        }
        if (timeUntilDue > reminderLeadTimeMs) return;

        const reminderKey = `todo-reminder-${task.id}-${dueTime}`;
        sendTaskReminder(task, reminderKey, 'Task due within 24 hours', `Due within 24 hours: ${task.task}`);
    });
}

function updateNotificationsButton() {
    if (!('Notification' in window)) {
        enableNotificationsBtn.textContent = 'Notifications unavailable';
        enableNotificationsBtn.disabled = true;
        return;
    }

    if (Notification.permission === 'granted') {
        enableNotificationsBtn.textContent = 'Notifications enabled';
        enableNotificationsBtn.disabled = true;
    } else if (Notification.permission === 'denied') {
        enableNotificationsBtn.textContent = 'Allow in browser settings';
        enableNotificationsBtn.disabled = true;
    }
}

if (enableNotificationsBtn) {
    enableNotificationsBtn.addEventListener('click', async () => {
        if (!('Notification' in window)) {
            updateNotificationsButton();
            return;
        }

        try {
            await Notification.requestPermission();
            updateNotificationsButton();
            checkDueDateReminders();
        } catch (error) {
            console.error('Could not request notification permission:', error);
        }
    });
    updateNotificationsButton();
}

setInterval(checkDueDateReminders, 60 * 1000);

// 2. Add task
async function addTask() {
    const taskText = taskInput.value.trim();
    const priorityValue = prioritySelect.value;
    const dueDateValue = dueDateInput.value ? new Date(dueDateInput.value).toISOString() : null;
    const startedAtValue = new Date().toISOString();

    if (!taskText) return;

    const { error } = await supabaseClient
        .from('tasks')
        .insert([{ 
            task: taskText, 
            is_completed: false, 
            priority: priorityValue,
            started_at: startedAtValue,
            due_date: dueDateValue
        }]);

    if (error) {
        console.error('Error adding task:', error);
    } else {
        taskInput.value = '';
        dueDateInput.value = '';
        await fetchTasks();
    }
}

// 3. Toggle completion
async function toggleTask(event, id, currentStatus) {
    event.stopPropagation(); 
    
    const existingTask = currentTasksData.find(task => task.id === id);
    const previousStatus = existingTask ? existingTask.is_completed : currentStatus;
    const previousFinishedAt = existingTask?.finished_at ?? null;
    const newStatus = !previousStatus;
    const finishedAtValue = newStatus ? new Date().toISOString() : null;

    currentTasksData = currentTasksData.map(task => task.id === id
        ? { ...task, is_completed: newStatus, finished_at: finishedAtValue }
        : task);
    renderTasks(currentTasksData);

    const { error } = await supabaseClient
        .from('tasks')
        .update({ 
            is_completed: newStatus,
            finished_at: finishedAtValue
        })
        .eq('id', id);

    if (error) {
        console.error('Error updating task:', error);
        currentTasksData = currentTasksData.map(task => task.id === id
            ? { ...task, is_completed: previousStatus, finished_at: previousFinishedAt }
            : task);
        renderTasks(currentTasksData);
        window.alert(`Could not save this task update: ${error.message || error.code || 'Unknown Supabase error'}`);
    }
}

// 4. Delete task
async function deleteTask(event, id) {
    event.stopPropagation();
    const previousTasks = currentTasksData;
    currentTasksData = currentTasksData.filter(task => task.id !== id);
    renderTasks(currentTasksData);

    const { error } = await supabaseClient
        .from('tasks')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting task:', error);
        currentTasksData = previousTasks;
        renderTasks(currentTasksData);
        window.alert(`Could not delete this task: ${error.message || error.code || 'Unknown Supabase error'}`);
    }
}

// Helper: Format ISO date nicely
function formatDate(isoString) {
    if (!isoString) return 'None';
    const date = new Date(isoString);
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toDateTimeLocalValue(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
}

// Helper: Calculate short badge countdown
function getCountdownText(dueDateISO) {
    if (!dueDateISO) return '';
    const diff = new Date(dueDateISO) - new Date();
    if (diff < 0) return `<span class="countdown-badge countdown-overdue">Overdue</span>`;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `<span class="countdown-badge">Due in ${days}d</span>`;
    if (hours > 0) return `<span class="countdown-badge">Due in ${hours}h</span>`;
    return `<span class="countdown-badge countdown-overdue short-countdown" data-due="${dueDateISO}">${getShortCountdownText(dueDateISO)}</span>`;
}

function getShortCountdownText(dueDateISO) {
    const diff = new Date(dueDateISO) - new Date();
    if (diff <= 0) return 'Overdue';

    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `Due in ${minutes}m ${seconds}s`;
}

// Helper: Detailed live remaining time string for the drawer
function getLiveRemainingTime(dueDateISO) {
    if (!dueDateISO) return 'No due date set';
    const diff = new Date(dueDateISO) - new Date();
    if (diff < 0) return '<span style="color: #e74c3c; font-weight: bold;">Overdue</span>';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const days = Math.floor(hours / 24);
    const remHours = hours % 24;

    if (days > 0) {
        return `${days}d ${remHours}h ${minutes}m ${seconds}s remaining`;
    }
    return `${hours}h ${minutes}m ${seconds}s remaining`;
}

// 5. Render tasks
// 5. Render tasks
function renderTasks(tasks) {
    taskList.innerHTML = '';
    if (!tasks) return;

    let tasksToRender = [...tasks];

    // Sorting
    tasksToRender.sort((a, b) => {
        if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
        if (isSortedByPriority) {
            const weights = { high: 1, medium: 2, low: 3 };
            const pA = weights[a.priority || 'medium'] ?? 2;
            const pB = weights[b.priority || 'medium'] ?? 2;
            if (pA !== pB) return pA - pB;
        }
        return new Date(b.created_at) - new Date(a.created_at);
    });

    tasksToRender.forEach(item => {
        const li = document.createElement('li');
        li.dataset.taskId = item.id;
        
        // Ensure completed class is applied if database says it's done
        if (item.is_completed) {
            li.classList.add('completed');
        }

        const priority = item.priority || 'medium';
        const countdownHTML = !item.is_completed ? getCountdownText(item.due_date) : '';

        li.innerHTML = `
            <div class="task-main-row">
                <div class="task-click-target" style="display: flex; align-items: center; gap: 8px; flex: 1; cursor: pointer;">
                    <span class="task-text-span">${item.task}</span>
                    ${countdownHTML}
                </div>

                <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="priority-badge priority-${priority}">${priority}</span>
                    <button class="slide-toggle-btn" style="background-color: #f1f2f6; border: none; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600; padding: 4px 8px; color: #555;">See Details</button>
                    <button class="delete-btn" style="background: none; border: none; cursor: pointer; color: #e74c3c; font-weight: bold; font-size: 14px;">❌</button>
                </div>
            </div>
            <div class="task-details">
                <div><strong>Started:</strong> ${formatDate(item.started_at)}</div>
                <div><strong>Due Date:</strong> ${formatDate(item.due_date)}</div>
                ${!item.is_completed && item.due_date ? `<div class="live-countdown" data-due="${item.due_date}" style="color: #2980b9; font-weight: 500; margin-top: 2px;"><strong>Remaining:</strong> ${getLiveRemainingTime(item.due_date)}</div>` : ''}
                ${item.is_completed ? `<div><strong>Finished:</strong> ${formatDate(item.finished_at)}</div>` : ''}
                <div class="task-details-editor">
                    <label>Due date and time<input class="edit-due-date" type="datetime-local" value="${toDateTimeLocalValue(item.due_date)}"></label>
                    <label>Priority<select class="edit-priority">
                        <option value="low" ${priority === 'low' ? 'selected' : ''}>Low</option>
                        <option value="medium" ${priority === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="high" ${priority === 'high' ? 'selected' : ''}>High</option>
                    </select></label>
                    <button class="save-details-btn" type="button">Save details</button>
                </div>
            </div>
        `;

        // Toggle completion from the task row, leaving its controls independent.
        const mainRow = li.querySelector('.task-main-row');
        mainRow.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            toggleTask(e, item.id, item.is_completed);
        });

        // Delete button
        const deleteBtn = li.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            deleteTask(e, item.id);
        });

        // Slide Drawer Toggle Event with text change
        const slideBtn = li.querySelector('.slide-toggle-btn');
        slideBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            li.classList.toggle('expanded');
            slideBtn.textContent = li.classList.contains('expanded') ? 'Hide Details' : 'See Details';
        });

        const saveDetailsBtn = li.querySelector('.save-details-btn');
        saveDetailsBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            saveDetailsBtn.disabled = true;

            const dueDateInput = li.querySelector('.edit-due-date');
            const dueDate = dueDateInput.value ? new Date(dueDateInput.value).toISOString() : null;
            const updatedPriority = li.querySelector('.edit-priority').value;
            const { error } = await supabaseClient
                .from('tasks')
                .update({ due_date: dueDate, priority: updatedPriority })
                .eq('id', item.id);

            if (error) {
                console.error('Error updating task details:', error);
                saveDetailsBtn.disabled = false;
                window.alert(`Could not save task details: ${error.message || error.code || 'Unknown Supabase error'}`);
                return;
            }

            currentTasksData = currentTasksData.map(task => task.id === item.id
                ? { ...task, due_date: dueDate, priority: updatedPriority }
                : task);
            renderTasks(currentTasksData);
            const updatedRow = Array.from(taskList.children).find(row => row.dataset.taskId === String(item.id));
            if (updatedRow) {
                updatedRow.classList.add('expanded');
                updatedRow.querySelector('.slide-toggle-btn').textContent = 'Hide Details';
            }
        });

        taskList.appendChild(li);
    });
}

// Setup live updating interval for timers every second
if (countdownInterval) clearInterval(countdownInterval);
countdownInterval = setInterval(() => {
    document.querySelectorAll('.short-countdown').forEach(el => {
        el.textContent = getShortCountdownText(el.getAttribute('data-due'));
    });

    document.querySelectorAll('.live-countdown').forEach(el => {
        const dueDate = el.getAttribute('data-due');
        el.innerHTML = `<strong>Remaining:</strong> ${getLiveRemainingTime(dueDate)}`;
    });
}, 1000);

// Sort button toggle listener
if (sortPriorityBtn) {
    sortPriorityBtn.addEventListener('click', () => {
        isSortedByPriority = !isSortedByPriority;
        sortPriorityBtn.textContent = isSortedByPriority ? "Sort: Default " : "Sort: High to Low ";
        renderTasks(currentTasksData);
    });
}

if (addBtn) addBtn.addEventListener('click', addTask);
if (taskInput) {
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });
}

// Real-time synchronization subscription
supabaseClient
    .channel('public:tasks')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchTasks();
    })
    .subscribe();

fetchTasks();