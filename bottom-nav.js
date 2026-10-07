(() => {
    const mount = document.getElementById('bottom-nav-root');
    if (!mount) return;

    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.setAttribute('aria-label', 'Main navigation');

    function createNavItem({ label, icon, href, key, title = label }) {
        const link = document.createElement('a');
        link.className = 'bottom-nav-item';
        link.href = href;
        link.dataset.nav = key;
        link.title = title;

        const iconElement = document.createElement('span');
        iconElement.className = 'bottom-nav-icon';
        iconElement.setAttribute('aria-hidden', 'true');
        iconElement.textContent = icon;

        const labelElement = document.createElement('span');
        labelElement.className = 'bottom-nav-label';
        labelElement.textContent = label;

        link.append(iconElement, labelElement);
        return link;
    }

    const pageName = window.location.pathname.split('/').pop() || 'index.html';
    const activeKey = pageName === 'completed.html'
        ? 'completed'
        : pageName === 'trash.html'
            ? 'deleted'
            : pageName === 'collections.html'
                ? 'brain-dump'
                : 'home';

    const navItems = [
        createNavItem({ label: 'Home', icon: '\u2302', href: 'index.html', key: 'home' }),
        createNavItem({ label: 'Brain Dump', icon: '\u270e', href: 'collections.html?view=inbox', key: 'brain-dump' }),
        createNavItem({ label: 'Completed', icon: '\u2713', href: 'completed.html', key: 'completed' }),
        createNavItem({ label: 'Deleted', icon: '\u232b', href: 'trash.html', key: 'deleted', title: 'Recently deleted' })
    ];

    navItems.forEach(item => {
        if (item.dataset.nav === activeKey) item.setAttribute('aria-current', 'page');
        nav.appendChild(item);
    });

    const notificationButton = document.createElement('button');
    notificationButton.className = 'bottom-nav-item notification-nav-button';
    notificationButton.id = 'enable-notifications-btn';
    notificationButton.type = 'button';
    notificationButton.setAttribute('aria-label', 'Notifications');

    const notificationIcon = document.createElement('span');
    notificationIcon.className = 'bottom-nav-icon';
    notificationIcon.setAttribute('aria-hidden', 'true');
    notificationIcon.textContent = '\ud83d\udd14';

    const notificationLabel = document.createElement('span');
    notificationLabel.className = 'bottom-nav-label';
    notificationLabel.textContent = 'Notifications';

    const notificationCount = document.createElement('span');
    notificationCount.className = 'notification-count';
    notificationCount.id = 'notification-count';
    notificationCount.hidden = true;
    notificationCount.setAttribute('aria-hidden', 'true');

    notificationButton.append(notificationIcon, notificationLabel, notificationCount);
    nav.appendChild(notificationButton);
    mount.appendChild(nav);

    function updateNotificationCount() {
        const now = Date.now();
        const reminderLeadTime = 24 * 60 * 60 * 1000;
        const dueGracePeriod = 5 * 60 * 1000;
        const reminderCount = todoTaskStore.getTasks().filter(task => {
            if (task.task_bucket !== 'active' || task.deleted_at || task._pendingDeleteForever || task.is_completed || !task.due_date) return false;
            const timeUntilDue = new Date(task.due_date).getTime() - now;
            return timeUntilDue > 0
                ? timeUntilDue <= reminderLeadTime
                : timeUntilDue >= -dueGracePeriod;
        }).length;

        notificationCount.textContent = reminderCount > 99 ? '99+' : String(reminderCount);
        notificationCount.hidden = reminderCount === 0;
        notificationButton.setAttribute('aria-label', reminderCount
            ? `Notifications, ${reminderCount} task reminder${reminderCount === 1 ? '' : 's'}`
            : 'Notifications');
    }

    updateNotificationCount();
    window.addEventListener('todo-cache-change', updateNotificationCount);
    window.addEventListener('storage', event => {
        if (event.key === 'todo-task-cache-v1') updateNotificationCount();
    });
    window.setInterval(updateNotificationCount, 60 * 1000);

    if (pageName !== 'index.html' && pageName !== '') {
        notificationButton.addEventListener('click', () => {
            window.location.href = 'index.html#notification-area';
        });
    }
})();