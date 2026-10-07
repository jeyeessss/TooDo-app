const collectionTitle = document.getElementById('collection-title');
const collectionForm = document.getElementById('collection-form');
const collectionInput = document.getElementById('collection-input');
const collectionInputLabel = document.getElementById('collection-input-label');
const collectionSubmit = document.getElementById('collection-submit');
const collectionStatus = document.getElementById('collection-status');
const collectionList = document.getElementById('collection-list');
const syncStatus = document.getElementById('sync-status');
const themeToggleBtn = document.getElementById('theme-toggle');
const view = 'inbox';

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
    // Keep this page usable if browser storage is unavailable.
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

collectionTitle.textContent = 'Brain Dump';
collectionInputLabel.textContent = 'Brain dump';
collectionInput.placeholder = 'Get it out of your head...';
collectionInput.rows = 4;
collectionSubmit.textContent = 'Save dump';

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

function formatDate(value) {
    if (!value) return 'No date';
    return new Date(value).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function makeAction(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
}

async function syncCollectionChanges() {
    updateSyncStatus();
    renderCollection();
    if (!navigator.onLine) return;

    const result = await todoTaskStore.syncPending(supabaseClient);
    try {
        const tasks = await todoTaskStore.fetchRemote(supabaseClient);
        const legacySomedayTasks = tasks.filter(task => task.task_bucket === 'someday' && !task.deleted_at);
        legacySomedayTasks.forEach(task => todoTaskStore.updateTask({ ...task, task_bucket: 'inbox' }));
        const migrationResult = legacySomedayTasks.length
            ? await todoTaskStore.syncPending(supabaseClient)
            : null;
        updateSyncStatus(result.error || migrationResult?.error);
        renderCollection();
    } catch (error) {
        console.error('Could not sync collection changes:', error);
        updateSyncStatus(result.error || error);
    }
}

function moveTask(task, taskBucket, returnToTasks = false) {
    todoTaskStore.updateTask({ ...task, task_bucket: taskBucket });
    if (returnToTasks) {
        window.location.href = 'index.html';
        return;
    }
    syncCollectionChanges();
}

function editDump(task, card) {
    const editArea = card.querySelector('.collection-edit-input');
    const nextText = editArea.value.trim();
    if (!nextText) {
        collectionStatus.textContent = 'A brain dump cannot be empty.';
        return;
    }
    todoTaskStore.updateTask({ ...task, task: nextText });
    collectionStatus.textContent = 'Saved';
    syncCollectionChanges();
}

function renderCollection() {
    const cachedTasks = todoTaskStore.getTasks();
    cachedTasks
        .filter(task => task.task_bucket === 'someday' && !task.deleted_at)
        .forEach(task => todoTaskStore.updateTask({ ...task, task_bucket: 'inbox' }));

    const entries = todoTaskStore.getTasks()
        .filter(task => (task.task_bucket === 'inbox' || task.task_bucket === 'someday') && !task.deleted_at && !task._pendingDeleteForever)
        .sort((first, second) => new Date(second.created_at || second.started_at) - new Date(first.created_at || first.started_at));

    collectionList.replaceChildren();
    collectionStatus.textContent = entries.length === 0 ? 'Your Brain Dump is clear.' : '';

    entries.forEach(task => {
        const item = document.createElement('li');
        item.className = 'collection-item';

        const content = document.createElement('p');
        content.className = 'collection-entry-text';
        content.textContent = task.task;
        item.appendChild(content);

        const metadata = document.createElement('span');
        metadata.className = 'collection-entry-date';
        metadata.textContent = `Captured ${formatDate(task.created_at || task.started_at)}`;
        item.appendChild(metadata);

        const editDetails = document.createElement('details');
        editDetails.className = 'collection-edit';
        const summary = document.createElement('summary');
        summary.textContent = 'Edit dump';
        const editArea = document.createElement('textarea');
        editArea.className = 'collection-edit-input';
        editArea.rows = 4;
        editArea.value = task.task;
        editArea.setAttribute('aria-label', 'Edit brain dump');
        const saveEdit = makeAction('Save edit', 'collection-secondary-btn', () => editDump(task, item));
        editDetails.append(summary, editArea, saveEdit);
        item.appendChild(editDetails);

        const actions = document.createElement('div');
        actions.className = 'collection-actions';
        actions.appendChild(makeAction('Make task', 'collection-primary-btn', () => moveTask(task, 'active', true)));

        actions.appendChild(makeAction('Delete', 'collection-delete-btn', () => {
            todoTaskStore.updateTask({ ...task, deleted_at: new Date().toISOString() });
            syncCollectionChanges();
        }));
        item.appendChild(actions);
        collectionList.appendChild(item);
    });
}

collectionForm.addEventListener('submit', event => {
    event.preventDefault();
    const text = collectionInput.value.trim();
    if (!text) return;

    const now = new Date().toISOString();
    todoTaskStore.addTask({
        task: text,
        task_bucket: 'inbox',
        is_completed: false,
        priority: 'medium',
        started_at: now,
        created_at: now,
        due_date: null,
        finished_at: null,
        deleted_at: null
    });
    collectionInput.value = '';
    collectionStatus.textContent = '';
    syncCollectionChanges();
});

async function refreshCollection() {
    renderCollection();
    if (!navigator.onLine) {
        updateSyncStatus();
        return;
    }
    await syncCollectionChanges();
}

window.addEventListener('online', refreshCollection);
window.addEventListener('offline', updateSyncStatus);
window.addEventListener('storage', event => {
    if (event.key === 'todo-task-cache-v1') {
        renderCollection();
        updateSyncStatus();
    }
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) refreshCollection();
});

refreshCollection();