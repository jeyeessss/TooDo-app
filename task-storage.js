(() => {
    const storageKey = 'todo-task-cache-v1';
    const taskFields = ['task', 'is_completed', 'priority', 'started_at', 'due_date', 'finished_at', 'deleted_at'];
    let syncPromise = null;
    let storageAvailable = true;

    function readTasks() {
        try {
            const stored = localStorage.getItem(storageKey);
            const tasks = stored ? JSON.parse(stored) : [];
            return Array.isArray(tasks) ? tasks : [];
        } catch (error) {
            storageAvailable = false;
            console.error('Could not read the local task cache:', error);
            return [];
        }
    }

    function writeTasks(tasks) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(tasks));
            storageAvailable = true;
            window.dispatchEvent(new Event('todo-cache-change'));
            return true;
        } catch (error) {
            storageAvailable = false;
            console.error('Could not save tasks on this device:', error);
            return false;
        }
    }

    function localId() {
        return `local-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    }

    function taskPayload(task) {
        return Object.fromEntries(taskFields.map(field => [field, task[field] ?? null]));
    }

    function samePayload(first, second) {
        return taskFields.every(field => (first[field] ?? null) === (second[field] ?? null));
    }

    function replaceTask(id, replacement) {
        const tasks = readTasks();
        const index = tasks.findIndex(task => String(task.id) === String(id));
        if (index < 0) return false;
        tasks[index] = replacement;
        writeTasks(tasks);
        return true;
    }

    function removeTask(id) {
        writeTasks(readTasks().filter(task => String(task.id) !== String(id)));
    }

    function mergeRemote(remoteTasks) {
        const cachedTasks = readTasks();
        const pendingTasks = cachedTasks.filter(task => task._syncState && task._syncState !== 'synced');
        const pendingById = new Map(pendingTasks
            .filter(task => !task._localOnly)
            .map(task => [String(task.id), task]));
        const remoteIds = new Set(remoteTasks.map(task => String(task.id)));
        const mergedTasks = remoteTasks.map(task => pendingById.get(String(task.id)) || {
            ...task,
            _localOnly: false,
            _syncState: 'synced'
        });

        pendingTasks.forEach(task => {
            if (task._localOnly || !remoteIds.has(String(task.id))) {
                if (!mergedTasks.some(existing => String(existing.id) === String(task.id))) {
                    mergedTasks.push(task);
                }
            }
        });

        writeTasks(mergedTasks);
        return mergedTasks;
    }

    function addTask(task) {
        const createdTask = {
            ...task,
            id: localId(),
            created_at: task.created_at || task.started_at,
            _localOnly: true,
            _syncState: 'pending_create'
        };
        writeTasks([createdTask, ...readTasks()]);
        return createdTask;
    }

    function updateTask(task) {
        const updatedTask = {
            ...task,
            _syncState: task._localOnly ? 'pending_create' : 'pending_update'
        };
        replaceTask(task.id, updatedTask);
        return updatedTask;
    }

    function permanentlyDeleteTask(task) {
        if (task._localOnly) {
            removeTask(task.id);
            return;
        }
        updateTask({ ...task, _pendingDeleteForever: true });
    }

    function mergeTaskData(latestTask, remoteTask, remoteId, sentPayload) {
        const latestPayload = taskPayload(latestTask);
        return {
            ...remoteTask,
            ...latestPayload,
            id: remoteId,
            _localOnly: false,
            _pendingDeleteForever: Boolean(latestTask._pendingDeleteForever),
            _syncState: samePayload(latestPayload, sentPayload) && !latestTask._pendingDeleteForever
                ? 'synced'
                : 'pending_update'
        };
    }

    async function syncPending(client) {
        if (!navigator.onLine) return { synced: 0, error: null };
        if (syncPromise) return syncPromise;

        syncPromise = (async () => {
            let synced = 0;
            const pendingTasks = readTasks().filter(task => task._syncState && task._syncState !== 'synced');

            for (const task of pendingTasks) {
                if (!navigator.onLine) break;
                const latestTask = readTasks().find(candidate => String(candidate.id) === String(task.id));
                if (!latestTask || latestTask._syncState === 'synced') continue;

                if (latestTask._pendingDeleteForever) {
                    if (latestTask._localOnly) {
                        removeTask(latestTask.id);
                        synced += 1;
                        continue;
                    }
                    const { error } = await client.from('tasks')
                        .delete()
                        .eq('id', latestTask.id)
                        .not('deleted_at', 'is', null);
                    if (error) return { synced, error };
                    removeTask(latestTask.id);
                    synced += 1;
                    continue;
                }

                const sentPayload = taskPayload(latestTask);
                if (latestTask._localOnly) {
                    const { data, error } = await client.from('tasks')
                        .insert([sentPayload])
                        .select('*')
                        .single();
                    if (error) return { synced, error };

                    const currentTask = readTasks().find(candidate => String(candidate.id) === String(task.id));
                    if (currentTask) {
                        replaceTask(task.id, mergeTaskData(currentTask, data, data.id, sentPayload));
                    }
                    synced += 1;
                    continue;
                }

                const { error } = await client.from('tasks')
                    .update(sentPayload)
                    .eq('id', latestTask.id);
                if (error) return { synced, error };

                const currentTask = readTasks().find(candidate => String(candidate.id) === String(task.id));
                if (currentTask) {
                    replaceTask(task.id, {
                        ...currentTask,
                        _syncState: samePayload(taskPayload(currentTask), sentPayload)
                            && !currentTask._pendingDeleteForever
                            ? 'synced'
                            : 'pending_update'
                    });
                }
                synced += 1;
            }

            return { synced, error: null };
        })().finally(() => {
            syncPromise = null;
        });

        return syncPromise;
    }

    async function fetchRemote(client) {
        const { data, error } = await client.from('tasks').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return mergeRemote(data || []);
    }

    window.todoTaskStore = {
        addTask,
        fetchRemote,
        getTasks: readTasks,
        isStorageAvailable: () => storageAvailable,
        mergeRemote,
        pendingCount: () => readTasks().filter(task => task._syncState && task._syncState !== 'synced').length,
        permanentlyDeleteTask,
        syncPending,
        updateTask
    };

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('./sw.js').catch(error => {
            console.error('Could not register the offline app worker:', error);
        });
    }
})();