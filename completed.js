const completedList = document.getElementById('completed-list');
const completedStatus = document.getElementById('completed-status');
const syncStatus = document.getElementById('sync-status');
const themeToggleBtn = document.getElementById('theme-toggle');

function updateSyncStatus(error = null) {
    if (!todoTaskStore.isStorageAvailable()) {
        syncStatus.textContent = 'Local storage unavailable';
    } else if (!navigator.onLine) {
        syncStatus.textContent = 'Offline · changes saved on this device';
    } else if (error) {
        const detail = error.message || error.code || 'Unknown Supabase error';
        syncStatus.textContent = `Sync failed: ${detail}`;
        syncStatus.title = error.details || error.hint || detail;
        syncStatus.dataset.syncError = 'true';
    } else {
        syncStatus.title = '';
        delete syncStatus.dataset.syncError;
        const pendingCount = todoTaskStore.pendingCount();
        syncStatus.textContent = pendingCount
            ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync`
            : 'Synced';
    }
}

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
    // Keep the completed page usable if browser storage is unavailable.
}

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

function formatDate(value) {
    if (!value) return 'Completion date unavailable';
    return new Date(value).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderCompletedTasks(tasks) {
    const completedTasks = tasks
        .filter(task => task.task_bucket === 'active' && task.is_completed && !task.deleted_at && !task._pendingDeleteForever)
        .sort((first, second) => new Date(second.finished_at || second.created_at) - new Date(first.finished_at || first.created_at));

    completedList.replaceChildren();
    completedStatus.textContent = completedTasks.length
        ? `${completedTasks.length} completed task${completedTasks.length === 1 ? '' : 's'}`
        : 'No completed tasks yet.';

    completedTasks.forEach(task => {
        const item = document.createElement('li');
        item.className = 'completed-task-item';

        const details = document.createElement('div');
        details.className = 'completed-task-details';

        const title = document.createElement('strong');
        title.className = 'completed-task-title';
        title.textContent = task.task;

        const completedDate = document.createElement('span');
        completedDate.className = 'completed-task-date';
        completedDate.textContent = `Completed ${formatDate(task.finished_at)}`;
        details.append(title, completedDate);

        const reopenButton = document.createElement('button');
        reopenButton.className = 'restore-task-btn';
        reopenButton.type = 'button';
        reopenButton.textContent = 'Reopen';
        reopenButton.addEventListener('click', () => {
            todoTaskStore.updateTask({ ...task, is_completed: false, finished_at: null });
            window.location.href = 'index.html';
        });

        item.append(details, reopenButton);
        completedList.appendChild(item);
    });
}

async function refreshCompletedTasks() {
    const cachedTasks = todoTaskStore.getTasks();
    renderCompletedTasks(cachedTasks);
    if (!navigator.onLine) {
        updateSyncStatus();
        return;
    }

    const syncResult = await todoTaskStore.syncPending(supabaseClient);
    try {
        const tasks = await todoTaskStore.fetchRemote(supabaseClient);
        renderCompletedTasks(tasks);
        updateSyncStatus(syncResult.error);
    } catch (error) {
        console.error('Could not refresh completed tasks from Supabase:', error);
        updateSyncStatus(syncResult.error || error);
    }
}

window.addEventListener('online', refreshCompletedTasks);
window.addEventListener('offline', () => updateSyncStatus());
window.addEventListener('storage', event => {
    if (event.key === 'todo-task-cache-v1') refreshCompletedTasks();
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) refreshCompletedTasks();
});

refreshCompletedTasks();