const trashList = document.getElementById('trash-list');
const trashStatus = document.getElementById('trash-status');
const themeToggleBtn = document.getElementById('theme-toggle');
const syncStatus = document.getElementById('sync-status');

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
    // The theme toggle still works for this page when storage is unavailable.
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
    if (!value) return 'No due date';
    return new Date(value).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function restoreTask(task, button) {
    button.disabled = true;
    todoTaskStore.updateTask({ ...task, deleted_at: null });
    window.location.href = 'index.html';
}

async function permanentlyDeleteTask(task, button) {
    const confirmed = window.confirm(`Permanently delete "${task.task}"? This cannot be undone.`);
    if (!confirmed) return;

    button.disabled = true;
    todoTaskStore.permanentlyDeleteTask(task);
    renderDeletedTasks(todoTaskStore.getTasks().filter(item => item.deleted_at));
    updateSyncStatus();
    if (navigator.onLine) fetchDeletedTasks();
}

function renderDeletedTasks(tasks) {
    trashList.replaceChildren();
    if (tasks.length === 0) {
        trashStatus.textContent = 'No recently deleted tasks.';
        return;
    }

    trashStatus.textContent = '';
    tasks.sort((first, second) => new Date(second.deleted_at) - new Date(first.deleted_at));
    tasks.forEach(task => {
        const item = document.createElement('li');
        item.className = 'trash-item';

        const details = document.createElement('div');
        details.className = 'trash-item-details';

        const title = document.createElement('strong');
        title.className = 'trash-task-title';
        title.textContent = task.task;

        const metadata = document.createElement('span');
        metadata.textContent = `${task._pendingDeleteForever ? 'Delete pending sync · ' : `Deleted ${formatDate(task.deleted_at)} · `}Due ${formatDate(task.due_date)} · ${task.priority || 'medium'} priority`;

        details.append(title, metadata);

        const restoreButton = document.createElement('button');
        restoreButton.className = 'restore-task-btn';
        restoreButton.type = 'button';
        restoreButton.textContent = 'Restore';
        restoreButton.disabled = Boolean(task._pendingDeleteForever);
        restoreButton.addEventListener('click', () => restoreTask(task, restoreButton));

        const actions = document.createElement('div');
        actions.className = 'trash-item-actions';
        actions.appendChild(restoreButton);

        const deleteForeverButton = document.createElement('button');
        deleteForeverButton.className = 'delete-forever-btn';
        deleteForeverButton.type = 'button';
        deleteForeverButton.textContent = task._pendingDeleteForever ? 'Deleting...' : 'Delete forever';
        deleteForeverButton.disabled = Boolean(task._pendingDeleteForever);
        deleteForeverButton.addEventListener('click', () => permanentlyDeleteTask(task, deleteForeverButton));
        actions.appendChild(deleteForeverButton);

        item.append(details, actions);
        trashList.appendChild(item);
    });
}

async function fetchDeletedTasks() {
    renderDeletedTasks(todoTaskStore.getTasks().filter(task => task.deleted_at));
    if (!navigator.onLine) {
        updateSyncStatus();
        return;
    }

    const syncResult = await todoTaskStore.syncPending(supabaseClient);
    try {
        const tasks = await todoTaskStore.fetchRemote(supabaseClient);
        renderDeletedTasks(tasks.filter(task => task.deleted_at));
        updateSyncStatus(syncResult.error);
    } catch (error) {
        console.error('Could not refresh Recently Deleted from Supabase:', error);
        updateSyncStatus(syncResult.error || error);
    }
}

window.addEventListener('online', fetchDeletedTasks);
window.addEventListener('offline', () => updateSyncStatus());
window.addEventListener('storage', event => {
    if (event.key === 'todo-task-cache-v1') fetchDeletedTasks();
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) fetchDeletedTasks();
});

fetchDeletedTasks();