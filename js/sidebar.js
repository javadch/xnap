// viewer/sidebar.js — Sidebar toggle and resize

export function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarResizeHandle = document.getElementById('sidebarResizeHandle');

    // Toggle collapse
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        sidebarToggle.classList.toggle('collapsed');

        if (sidebar.classList.contains('collapsed')) {
            sidebarToggle.style.left = '0';
        } else {
            sidebarToggle.style.left = (parseInt(sidebar.style.width) || 280) + 'px';
        }

        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    });

    // Restore collapsed state
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        sidebar.classList.add('collapsed');
        sidebarToggle.classList.add('collapsed');
        sidebarToggle.style.left = '0';
    }

    // Restore width
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
        sidebar.style.width = savedWidth + 'px';
        if (!sidebar.classList.contains('collapsed')) {
            sidebarToggle.style.left = savedWidth + 'px';
        }
    }

    // Resize
    let isResizing = false;

    sidebarResizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        sidebarResizeHandle.classList.add('dragging');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth >= 200 && newWidth <= 500) {
            sidebar.style.width = newWidth + 'px';
            sidebarToggle.style.left = newWidth + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            sidebarResizeHandle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            localStorage.setItem('sidebarWidth', parseInt(sidebar.style.width));
        }
    });
}
