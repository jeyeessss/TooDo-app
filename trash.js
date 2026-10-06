const trashList = document.getElementById('trash-list');
const trashStatus = document.getElementById('trash-status');
const themeToggleBtn = document.getElementById('theme-toggle');

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
    const { error } = await supabaseClient
        .from('tasks')
        .update({ deleted_at: null })
        .eq('id', task.id);

    if (error) {
        console.error('Error restoring task:', error);
        button.disabled = false;
        window.alert(`Could not restore this task: ${error.message || error.code || 'Unknown Supabase error'}`);
        return;
    }

    window.location.href = 'index.html';
}

async function permanentlyDeleteTask(task, button) {
    const confirmed = window.confirm(`Permanently delete "${task.task}"? This cannot be undone.`);
    if (!confirmed) return;

    button.disabled = true;
    const { error } = await supabaseClient
        .from('tasks')
        .delete()
        .eq('id', task.id)
        .not('deleted_at', 'is', null);

    if (error) {
        console.error('Error permanently deleting task:', error);
        button.disabled = false;
        window.alert(`Could not permanently delete this task: ${error.message || error.code || 'Unknown Supabase error'}`);
        return;
    }

    await fetchDeletedTasks();
}

async function fetchDeletedTasks() {
    const { data, error } = await supabaseClient
        .from('tasks')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

    if (error) {
        console.error('Error fetching recently deleted tasks:', error);
        trashStatus.textContent = `Could not load deleted tasks: ${error.message || error.code || 'Unknown Supabase error'}`;
        return;
    }

    trashList.replaceChildren();
    if (!data || data.length === 0) {
        trashStatus.textContent = 'No recently deleted tasks.';
        return;
    }

    trashStatus.textContent = '';
    data.forEach(task => {
        const item = document.createElement('li');
        item.className = 'trash-item';

        const details = document.createElement('div');
        details.className = 'trash-item-details';

        const title = document.createElement('strong');
        title.className = 'trash-task-title';
        title.textContent = task.task;

        const metadata = document.createElement('span');
        metadata.textContent = `Deleted ${formatDate(task.deleted_at)} · Due ${formatDate(task.due_date)} · ${task.priority || 'medium'} priority`;

        details.append(title, metadata);

        const restoreButton = document.createElement('button');
        restoreButton.className = 'restore-task-btn';
        restoreButton.type = 'button';
        restoreButton.textContent = 'Restore';
        restoreButton.addEventListener('click', () => restoreTask(task, restoreButton));

        const actions = document.createElement('div');
        actions.className = 'trash-item-actions';
        actions.appendChild(restoreButton);

        const deleteForeverButton = document.createElement('button');
        deleteForeverButton.className = 'delete-forever-btn';
        deleteForeverButton.type = 'button';
        deleteForeverButton.textContent = 'Delete forever';
        deleteForeverButton.addEventListener('click', () => permanentlyDeleteTask(task, deleteForeverButton));
        actions.appendChild(deleteForeverButton);

        item.append(details, actions);
        trashList.appendChild(item);
    });
}

fetchDeletedTasks();