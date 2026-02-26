// ==========================================
// Trustee Portal - Main Application Logic (SaaS)
// ==========================================

// State Management - All data loaded dynamically from API
let currentRole = null;  // Role determined by backend
let currentModule = 'dashboard';
let currentChat = null;
let calendarDate = new Date();
let pendingTasks = 0;

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    // Check if already logged in
    checkExistingSession();

    // Enter key on login form
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    
    if (loginEmail && loginPassword) {
        loginPassword.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') login();
        });
    }

    // Enter key on message input
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // Modal outside click
    const modalOverlay = document.getElementById('modalOverlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });
    }

    // Close notification panel when clicking outside
    document.addEventListener('click', function(e) {
        const panel = document.getElementById('notificationPanel');
        const btn = document.querySelector('.notification-btn');
        if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
            panel.classList.remove('active');
        }
    });

    // Window resize handler
    window.addEventListener('resize', handleWindowResize);
});

// Check for existing session on page load
async function checkExistingSession() {
    const token = localStorage.getItem('auth_token');
    if (token) {
        try {
            const result = await authAPI.getCurrentUser();
            // api.js returns unwrapped data: { user, organization, ... }
            if (result && result.user) {
                await completeLogin(result);
            }
        } catch (error) {
            // Token invalid, stay on login page
            console.log('Session expired, please login again');
        }
    }
}

// ==========================================
// Authentication (SaaS Updated)
// ==========================================
async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    console.log('Login form values:', { email, passwordLength: password?.length });
    
    if (!email || !password) {
        showToast('Please enter email and password', 'error');
        return;
    }

    try {
        showToast('Signing in...', 'info');
        
        // Call backend API for authentication
        // api.js returns unwrapped data: { user, accessToken, organization }
        const result = await authAPI.login(email, password);
        
        if (!result || !result.user) {
            throw new Error('Invalid response from server');
        }
        
        // Handle multiple organizations
        if (result.requiresOrganizationSelection && result.organizations) {
            showOrganizationSelector(result.organizations, email, password);
            return;
        }
        
        // Single organization - proceed with login
        await completeLogin(result);
        
    } catch (error) {
        console.error('Login error:', error);
        showToast(error.message || 'Login failed. Please try again.', 'error');
    }
}

// Show organization selector for users with multiple orgs
function showOrganizationSelector(organizations, email, password) {
    // Hide login form, show organization selector
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('organizationSelector').style.display = 'block';
    
    // Populate organization list
    const orgList = document.getElementById('organizationList');
    orgList.innerHTML = organizations.map(org => `
        <button onclick="selectOrganization(${org.id}, '${email}', '${password}')" 
            style="padding: 1rem; text-align: left; background: var(--bg-light); 
                   border: 2px solid var(--border); border-radius: 8px; cursor: pointer;
                   display: flex; align-items: center; gap: 1rem; width: 100%;
                   transition: all 0.2s;"
            onmouseover="this.style.borderColor='var(--primary)'"
            onmouseout="this.style.borderColor='var(--border)'">
            <div style="width: 48px; height: 48px; background: linear-gradient(135deg, var(--primary), var(--secondary)); 
                        border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-building" style="color: white; font-size: 1.25rem;"></i>
            </div>
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 1rem;">${org.name}</div>
                <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 2px;">
                    ${org.slug} • You are ${org.role}
                </div>
            </div>
            <i class="fas fa-chevron-right" style="color: var(--text-light);"></i>
        </button>
    `).join('');
}

// Select organization and login
async function selectOrganization(orgId, email, password) {
    try {
        closeModal();
        showToast('Selecting organization...', 'info');
        
        const result = await authAPI.selectOrganization(orgId);
        
        if (!result.user) {
            throw new Error('Invalid response from server');
        }
        
        await completeLogin(result);
        
    } catch (error) {
        console.error('Organization selection error:', error);
        showToast(error.message || 'Failed to select organization', 'error');
    }
}

// Complete login process
async function completeLogin(result) {
    const user = result.user;
    const organization = result.organization;
    
    // Use organization member role if available, fallback to user role
    currentRole = result.role || user.role || 'trustee';
    
    // Update UI with user data
    document.getElementById('loginScreen').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        
        // Set user role class and display info
        document.body.classList.add(`user-${currentRole}`);
        
        const firstName = user.firstName || user.first_name;
        const lastName = user.lastName || user.last_name;
        const userFullName = `${firstName} ${lastName}`;
        const userInitials = `${firstName[0]}${lastName[0]}`.toUpperCase();
        
        // Update dropdown display
        const avatarPlaceholder = document.getElementById('userAvatarPlaceholder');
        const dropdownName = document.getElementById('userDropdownName');
        const dropdownUserName = document.getElementById('dropdownUserName');
        const dropdownUserEmail = document.getElementById('dropdownUserEmail');
        
        if (avatarPlaceholder) avatarPlaceholder.textContent = userInitials;
        if (dropdownName) dropdownName.textContent = firstName;
        if (dropdownUserName) dropdownUserName.textContent = userFullName;
        if (dropdownUserEmail) dropdownUserEmail.textContent = user.email;
        
        // Show organization info in UI if available
        if (organization) {
            const pageSubtitle = document.getElementById('pageSubtitle');
            if (pageSubtitle) {
                pageSubtitle.innerHTML = `Welcome back, here's what's happening • <strong>${organization.name}</strong>`;
            }
        }
        
        // Show/hide Platform Admin menu for Super Admins
        const platformAdminMenu = document.querySelector('.nav-item.super-admin-only');
        if (platformAdminMenu) {
            if (user.isSuperAdmin || user.is_super_admin) {
                platformAdminMenu.style.display = 'flex';
                document.body.classList.add('user-super-admin');
            } else {
                platformAdminMenu.style.display = 'none';
            }
        }
        
        // Load dashboard data
        loadDashboardData();
        renderCalendar();
        
        // Load term notifications for admins/chairs
        if (['owner', 'admin', 'chair'].includes(currentRole)) {
            loadTermNotifications();
        }
        
        showToast(`Welcome back, ${user.first_name}!`, 'success');
        
        // Check if setup is needed (for new organizations)
        if ((currentRole === 'owner' || currentRole === 'admin') && !user.isSuperAdmin && !user.is_super_admin) {
            setTimeout(() => checkSetupStatus(), 1000);
        }
    }, 500);
}

async function logout() {
    // Clear authentication
    await authAPI.logout();
    location.reload();
}

// ==========================================
// Term Notifications
// ==========================================
async function loadTermNotifications() {
    try {
        const org = JSON.parse(localStorage.getItem('current_organization') || '{}');
        if (!org.id) return;
        
        const response = await fetch(`${API_BASE_URL}/organizations/${org.id}/term-notifications`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        const badge = document.getElementById('trusteesNotificationBadge');
        
        if (badge && data.termTrackingEnabled && data.count > 0) {
            badge.textContent = data.count > 99 ? '99+' : data.count;
            badge.style.display = 'inline-block';
            
            // Show urgent count in red if any critical (<=30 days)
            const criticalCount = data.notifications.filter(n => n.urgency === 'critical').length;
            if (criticalCount > 0) {
                badge.style.background = 'var(--danger)';
            } else {
                badge.style.background = 'var(--warning)';
            }
        } else if (badge) {
            badge.style.display = 'none';
        }
    } catch (error) {
        console.log('Term notifications not available');
    }
}

// ==========================================
// Login Page Helper Functions
// ==========================================

function showForgotPassword() {
    const modalHtml = `
        <div style="max-width: 400px;">
            <h3 style="margin-bottom: 1rem;">Reset Password</h3>
            <p style="color: var(--text-light); margin-bottom: 1.5rem;">
                Enter your email address and we'll send you a link to reset your password.
            </p>
            <div class="form-group">
                <label>Email Address</label>
                <input type="email" id="resetEmail" placeholder="Enter your email">
            </div>
            <button class="btn btn-primary" onclick="submitForgotPassword()" style="width: 100%;">
                Send Reset Link
            </button>
        </div>
    `;
    showModal('Forgot Password', modalHtml);
}

async function submitForgotPassword() {
    const email = document.getElementById('resetEmail').value;
    if (!email) {
        showToast('Please enter your email address', 'error');
        return;
    }
    
    try {
        await authAPI.forgotPassword(email);
        closeModal();
        showToast('If an account exists, a reset link has been sent', 'success');
    } catch (error) {
        showToast(error.message || 'Failed to send reset link', 'error');
    }
}

function showCreateOrganization() {
    const modalHtml = `
        <div style="max-width: 450px;">
            <h3 style="margin-bottom: 1rem;">Create Organization</h3>
            <p style="color: var(--text-light); margin-bottom: 1.5rem;">
                Start your 14-day free trial. No credit card required.
            </p>
            <div class="form-group">
                <label>Organization Name</label>
                <input type="text" id="orgName" placeholder="e.g., Acme Corporation">
            </div>
            <div class="form-group">
                <label>Organization URL</label>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <input type="text" id="orgSlug" placeholder="acme-corp" style="flex: 1;">
                    <span style="color: var(--text-light);">.trusteeportal.com</span>
                </div>
            </div>
            <div class="form-group">
                <label>Your Email</label>
                <input type="email" id="orgAdminEmail" placeholder="admin@example.com">
            </div>
            <div class="form-group">
                <label>Your Name</label>
                <div style="display: flex; gap: 0.5rem;">
                    <input type="text" id="orgAdminFirstName" placeholder="First name" style="flex: 1;">
                    <input type="text" id="orgAdminLastName" placeholder="Last name" style="flex: 1;">
                </div>
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="orgAdminPassword" placeholder="Create a password">
            </div>
            <button class="btn btn-primary" onclick="submitCreateOrganization()" style="width: 100%;">
                Create Organization
            </button>
        </div>
    `;
    showModal('Create Organization', modalHtml);
}

async function submitCreateOrganization() {
    const name = document.getElementById('orgName').value;
    const slug = document.getElementById('orgSlug').value;
    const email = document.getElementById('orgAdminEmail').value;
    const firstName = document.getElementById('orgAdminFirstName').value;
    const lastName = document.getElementById('orgAdminLastName').value;
    const password = document.getElementById('orgAdminPassword').value;
    
    if (!name || !slug || !email || !firstName || !lastName || !password) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }
    
    try {
        const result = await organizationsAPI.create({
            name,
            slug,
            admin_email: email,
            admin_first_name: firstName,
            admin_last_name: lastName,
            admin_password: password
        });
        
        closeModal();
        
        // Auto-login with new credentials
        if (result.token) {
            await completeLogin(result);
        }
        
        showToast('Organization created successfully!', 'success');
    } catch (error) {
        showToast(error.message || 'Failed to create organization', 'error');
    }
}

function backToLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('organizationSelector').style.display = 'none';
}

// ==========================================
// API Integration Functions
// ==========================================

async function loadDashboardData() {
    try {
        const data = await dashboardAPI.getStats();
        
        // Update stats cards if they exist
        if (data.userStats) {
            updateDashboardStats(data.userStats);
        }
        
        // Update upcoming meetings
        if (data.upcomingMeetings && document.getElementById('upcomingMeetingsList')) {
            renderUpcomingMeetings(data.upcomingMeetings);
        }
        
        // Update pending tasks
        if (data.pendingTasks && document.getElementById('pendingTasksList')) {
            renderPendingTasks(data.pendingTasks);
        }
        
        // Update notifications
        if (data.notifications) {
            updateNotificationBadge(data.notifications.length);
        }
        
        // Admin stats
        if (data.adminStats && (currentRole === 'admin' || currentRole === 'chair')) {
            console.log('Admin stats:', data.adminStats);
        }
        
        // Update getting started card
        updateGettingStartedCard();
        
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
    }
}

function updateDashboardStats(stats) {
    // Update stat cards in the DOM
    const statElements = {
        'stat-pending-tasks': stats.pending_tasks,
        'stat-completed-tasks': stats.completed_tasks,
        'stat-upcoming-meetings': stats.upcoming_meetings,
        'stat-notifications': stats.unread_notifications
    };
    
    for (const [id, value] of Object.entries(statElements)) {
        const el = document.getElementById(id);
        if (el) el.textContent = value || 0;
    }
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

function renderUpcomingMeetings(meetings) {
    const container = document.getElementById('upcomingMeetingsList');
    if (!container) return;
    
    if (meetings.length === 0) {
        container.innerHTML = '<p class="empty-state">No upcoming meetings</p>';
        return;
    }
    
    container.innerHTML = meetings.map(m => `
        <div class="meeting-item">
            <div class="meeting-date">${formatDate(m.meeting_date)}</div>
            <div class="meeting-title">${m.title}</div>
            <div class="meeting-location">${m.location || 'Virtual'}</div>
        </div>
    `).join('');
}

function renderPendingTasks(tasks) {
    const container = document.getElementById('pendingTasksList');
    if (!container) return;
    
    if (tasks.length === 0) {
        container.innerHTML = '<p class="empty-state">No pending tasks</p>';
        return;
    }
    
    container.innerHTML = tasks.map(t => `
        <div class="task-item ${t.priority}">
            <div class="task-title">${t.title}</div>
            <div class="task-due">${t.due_date ? 'Due: ' + formatDate(t.due_date) : 'No due date'}</div>
        </div>
    `).join('');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==========================================
// Navigation & Module Loading
// ==========================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

async function showModule(moduleName, element) {
    // Close sidebar on mobile
    if (window.innerWidth <= 1024) {
        toggleSidebar();
    }

    // Hide all modules
    document.querySelectorAll('.module-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show target module
    const module = document.getElementById(moduleName);
    if (module) {
        module.classList.add('active');
    }
    
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    if (element) {
        element.classList.add('active');
    } else {
        const navItem = document.querySelector('[data-module="' + moduleName + '"]');
        if (navItem) navItem.classList.add('active');
    }
    
    currentModule = moduleName;
    updatePageTitle(moduleName);
    
    // Load module-specific data
    if (moduleName === 'recruitment') {
        await loadRecruitmentJobs();
        await updateRecruitmentBadges();
    } else if (moduleName === 'trustees') {
        await loadTrustees();
    } else if (moduleName === 'platformAdmin') {
        await loadPlatformStats();
        await loadOrganizations();
        await loadPlans();
        await loadPlatformActivity();
    }
    
    // Initialize module if it has a data-module-init attribute
    const moduleElement = document.getElementById(moduleName);
    if (moduleElement) {
        const initFunction = moduleElement.getAttribute('data-module-init');
        if (initFunction && typeof window[initFunction] === 'function') {
            try {
                await window[initFunction]();
            } catch (error) {
                console.error(`Error initializing module ${moduleName}:`, error);
            }
        }
    }
}

function updatePageTitle(moduleName) {
    const titles = {
        'dashboard': 'Dashboard',
        'committees': 'Committee Management',
        'meetings': 'Meeting Management',
        'recruitment': 'Trustee Recruitment',
        'onboarding': 'Onboarding',
        'training': 'Training & Development',
        'calendar': 'Event Calendar',
        'messaging': 'Messaging Centre',
        'tasks': 'Tasks & Milestones',
        'minutes': 'Meeting Minutes & Records',
        'policies': 'Policies & Governance',
        'admin': 'Admin Settings',
        'profile': 'My Profile',
        'account': 'Account Settings',
        'billing': 'Billing & Subscription',
        'trustees': 'Trustee Directory'
    };
    
    document.getElementById('pageTitle').textContent = titles[moduleName] || moduleName;
    
    const subtitles = {
        'dashboard': 'Welcome back, here is what is happening',
        'committees': 'Manage committees and workflows',
        'meetings': 'Schedule and manage meetings',
        'recruitment': 'Active recruitment campaigns',
        'messaging': 'Your secure communications',
        'training': 'Mandatory and optional training modules',
        'tasks': 'Track your assigned tasks and milestones',
        'calendar': 'View upcoming meetings and events',
        'profile': 'Manage your personal information and profile details',
        'account': 'Manage your login credentials and security settings',
        'billing': 'Manage your subscription and billing information',
        'trustees': 'View and manage board members'
    };
    document.getElementById('pageSubtitle').textContent = subtitles[moduleName] || 'Manage your governance activities';
}

function handleWindowResize() {
    if (window.innerWidth > 1024) {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    }
    if (window.innerWidth > 768) {
        const convList = document.getElementById('conversationsList');
        if (convList) convList.classList.remove('hidden');
        document.getElementById('searchBox').classList.remove('mobile-visible');
    }
}

// ==========================================
// Search & Notifications
// ==========================================
function toggleSearchMobile() {
    const searchBox = document.getElementById('searchBox');
    if (window.innerWidth <= 768) {
        searchBox.classList.toggle('mobile-visible');
    }
}

function handleSearch(e) {
    if (e.key === 'Enter') {
        const query = e.target.value;
        if (query.trim()) {
            showToast('Searching for: "' + query + '"', 'success');
        }
    }
}

function toggleNotifications() {
    const panel = document.getElementById('notificationPanel');
    panel.classList.toggle('active');
    // Close user dropdown if open
    document.getElementById('userDropdownMenu')?.classList.remove('active');
}

// ==========================================
// User Dropdown Menu
// ==========================================
function toggleUserDropdown() {
    const menu = document.getElementById('userDropdownMenu');
    menu.classList.toggle('active');
    // Close notification panel if open
    document.getElementById('notificationPanel')?.classList.remove('active');
}

function closeUserDropdown() {
    document.getElementById('userDropdownMenu')?.classList.remove('active');
}

function showUserProfile() {
    closeUserDropdown();
    showModule('profile');
}

function showUserAccount() {
    closeUserDropdown();
    showModule('account');
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
    const userDropdown = document.querySelector('.user-dropdown-container');
    const notificationBtn = document.querySelector('.notification-btn');
    
    if (userDropdown && !userDropdown.contains(e.target)) {
        document.getElementById('userDropdownMenu')?.classList.remove('active');
    }
    if (notificationBtn && !notificationBtn.contains(e.target) && !e.target.closest('.notification-panel')) {
        document.getElementById('notificationPanel')?.classList.remove('active');
    }
});

function handleNotification(item) {
    item.classList.remove('unread');
    showToast('Notification marked as read', 'success');
}

// ==========================================
// Toast Notifications
// ==========================================
function showToast(message, type) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'success');
    
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    
    toast.innerHTML = '<i class="fas fa-' + icon + '"></i><span>' + message + '</span>';
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// Modal System
// ==========================================
function openModal(type, data) {
    const modal = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    
    modal.classList.add('active');
    
    const modalContent = getModalContent(type, data);
    title.textContent = modalContent.title;
    body.innerHTML = modalContent.body;
}

function getModalContent(type, data) {
    const modals = {
        createCommittee: {
            title: 'Create New Committee',
            body: '<div class="form-group"><label>Committee Name</label><input type="text" placeholder="e.g., Audit Committee" id="committeeName"></div><div class="form-group"><label>Purpose/Scope</label><textarea style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px; min-height: 100px; font-family: Inter;" placeholder="Describe the committees responsibilities..."></textarea></div><div class="form-group"><label>Chair</label><select style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px;"><option>Select Chair...</option><option>Sarah Johnson</option><option>Michael Chen</option></select></div>'
        },
        enrollTrustee: {
            title: 'Enroll Trustee to Committee',
            body: '<div class="form-group"><label>Select Trustee</label><select style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px;"><option>Choose trustee...</option><option>John Doe</option><option>Lisa Park</option></select></div><div class="form-group"><label>Select Committee</label><select style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px;"><option>Choose committee...</option><option>Property Committee</option><option>Finance & Governance (FIG)</option><option>People Committee</option></select></div>'
        },
        pushToBoard: {
            title: 'Push Committee Items to Board',
            body: '<div class="form-group"><label>Select Items to Push</label><div style="border: 2px solid var(--border); border-radius: 8px; padding: 1rem; margin-top: 0.5rem;"><label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;"><input type="checkbox" checked> Property Maintenance Budget Q2 2026</label><label style="display: flex; align-items: center; gap: 0.5rem;"><input type="checkbox"> New Lease Agreement - Oxford Street</label></div></div><div class="form-group"><label>Target Board Meeting</label><select style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px;"><option>Quarterly Board Meeting - 25 Feb 2026</option><option>Extraordinary Meeting - 28 Feb 2026</option></select></div>'
        },
        scheduleMeeting: {
            title: 'Schedule New Meeting',
            body: '<div class="form-group"><label>Meeting Title</label><input type="text" placeholder="e.g., Property Committee - March Review"></div><div class="form-group"><label>Meeting Type</label><select style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px;"><option>Board Meeting</option><option>Committee Meeting</option><option>Extraordinary Board Meeting</option></select></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;"><div class="form-group"><label>Date</label><input type="date" style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px;"></div><div class="form-group"><label>Time</label><input type="time" style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px;"></div></div>'
        },
        newRole: {
            title: 'Post New Trustee Role',
            body: '<div class="form-group"><label>Role Title</label><input type="text" placeholder="e.g., Trustee - Finance Committee"></div><div class="form-group"><label>Description</label><textarea style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px; min-height: 100px; font-family: Inter;" placeholder="Enter role description..."></textarea></div><div class="form-group"><label>Location</label><select style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px;"><option>London</option><option>Remote</option><option>Hybrid</option></select></div>'
        },
        newTask: {
            title: 'Assign New Task',
            body: '<div class="form-group"><label>Task Title</label><input type="text" placeholder="Task name"></div><div class="form-group"><label>Assign To</label><select style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px;"><option>John Doe</option><option>Sarah Johnson</option></select></div><div class="form-group"><label>Due Date</label><input type="date" style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px;"></div><div class="form-group"><label>Priority</label><select style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px;"><option>High</option><option>Medium</option><option>Low</option></select></div>'
        },
        manageCommittee: {
            title: 'Manage Committee: ' + (data || 'Unknown'),
            body: '<div class="form-group"><label>Committee Settings</label><p style="font-size: 0.85rem; color: var(--text-light);">Manage members, permissions, and workflow settings for this committee.</p></div><div class="form-group"><label>Add Member</label><select style="width: 100%; padding: 0.75rem; border: 2px solid var(--border); border-radius: 8px;"><option>Select member...</option><option>New Trustee</option></select></div>'
        }
    };
    
    return modals[type] || { title: 'Modal', body: '' };
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

function confirmAction() {
    closeModal();
    showToast('Action completed successfully', 'success');
}

// ==========================================
// Committee Functions
// ==========================================
function viewCommittee(committee) {
    showToast('Viewing ' + committee + ' committee details', 'success');
}

function manageCommittee(committee) {
    openModal('manageCommittee', committee);
}

function pushToBoard(item) {
    showToast('Item pushed to Board meeting agenda successfully', 'success');
}

function approveItem(btn) {
    showToast('Item approved successfully', 'success');
    const card = btn.closest('[style*="border-left"]');
    if (card) {
        card.style.borderLeftColor = 'var(--success)';
        const status = card.querySelector('.workflow-status');
        if (status) {
            status.className = 'workflow-status workflow-approved';
            status.innerHTML = '<i class="fas fa-check-circle"></i> Approved';
        }
    }
}

// ==========================================
// Meeting Functions
// ==========================================
function filterMeetings(type, btn) {
    document.querySelectorAll('.meeting-tab').forEach(tab => tab.classList.remove('active'));
    btn.classList.add('active');
    
    const items = document.querySelectorAll('.meeting-item');
    items.forEach(item => {
        if (type === 'all' || item.dataset.type === type) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function rsvpMeeting(btn) {
    if (btn.innerHTML.includes('RSVP') || btn.innerHTML.includes('Confirm')) {
        btn.innerHTML = '<i class="fas fa-check-double"></i> Confirmed';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
        showToast('You have confirmed your attendance', 'success');
    }
}

// ==========================================
// Task Functions
// ==========================================
function completeTask(taskId, btn) {
    const taskItem = document.querySelector('[data-task-id="' + taskId + '"]');
    if (taskItem) {
        taskItem.style.opacity = '0.5';
        taskItem.style.textDecoration = 'line-through';
        btn.innerHTML = '<i class="fas fa-check-double"></i>';
        btn.disabled = true;
        
        pendingTasks--;
        if (pendingTasks < 0) pendingTasks = 0;
        document.getElementById('pendingTasksCount').textContent = pendingTasks;
        showToast('Task marked as complete!', 'success');
    }
}

// ==========================================
// Checklist Functions
// ==========================================
function toggleChecklistItem(checkbox) {
    const item = checkbox.closest('.checklist-item');
    const icon = checkbox.querySelector('i');
    
    if (item.classList.contains('completed')) {
        item.classList.remove('completed');
        checkbox.style.background = '';
        checkbox.style.borderColor = '';
        checkbox.style.color = '';
        icon.style.opacity = '0';
    } else {
        item.classList.add('completed');
        checkbox.style.background = 'var(--success)';
        checkbox.style.borderColor = 'var(--success)';
        checkbox.style.color = 'white';
        icon.style.opacity = '1';
        showToast('Item completed!', 'success');
    }
}

// ==========================================
// Messaging Functions
// ==========================================
function openChat(element, name) {
    const list = document.getElementById('conversationsList');
    const title = document.getElementById('chatTitle');
    const chatName = name || element.querySelector('.conversation-name').textContent;
    
    document.querySelectorAll('.conversation-item').forEach(item => item.classList.remove('active'));
    element.classList.add('active');
    
    title.textContent = chatName;
    currentChat = chatName;
    
    if (window.innerWidth <= 768) {
        list.classList.add('hidden');
    }
}

function backToConversations() {
    document.getElementById('conversationsList').classList.remove('hidden');
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (message) {
        const chatMessages = document.getElementById('chatMessages');
        const newMessage = document.createElement('div');
        newMessage.className = 'message sent';
        newMessage.innerHTML = '<div>' + escapeHtml(message) + '</div><div class="message-time">Just now</div>';
        chatMessages.appendChild(newMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        input.value = '';
        
        setTimeout(() => {
            const reply = document.createElement('div');
            reply.className = 'message received';
            reply.innerHTML = '<div>Thanks for your message. I will get back to you shortly.</div><div class="message-time">Just now</div>';
            chatMessages.appendChild(reply);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 2000);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// Calendar Functions
// ==========================================
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    document.getElementById('calendarMonth').textContent = monthNames[calendarDate.getMonth()] + ' ' + calendarDate.getFullYear();
    
    let html = '';
    dayNames.forEach(day => {
        html += '<div class="calendar-day-header">' + day + '</div>';
    });
    
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = startOffset - 1; i >= 0; i--) {
        html += '<div class="calendar-day other-month">' + (daysInPrevMonth - i) + '</div>';
    }
    
    const hasEvents = [4, 6, 11, 13, 17, 20, 25];
    
    for (let day = 1; day <= daysInMonth; day++) {
        let classes = 'calendar-day';
        if (year === 2026 && month === 1 && day === 17) {
            classes += ' today';
        }
        if (hasEvents.includes(day)) {
            classes += ' has-event';
        }
        html += '<div class="' + classes + '" onclick="showCalendarDay(' + day + ')">' + day + '</div>';
    }
    
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    const remainingCells = totalCells - startOffset - daysInMonth;
    for (let day = 1; day <= remainingCells; day++) {
        html += '<div class="calendar-day other-month">' + day + '</div>';
    }
    
    grid.innerHTML = html;
}

function changeMonth(delta) {
    calendarDate.setMonth(calendarDate.getMonth() + delta);
    renderCalendar();
}

function showCalendarDay(day) {
    showToast('Selected: February ' + day + ', 2026', 'success');
}

function toggleRSVP(btn) {
    const icon = btn.querySelector('i');
    if (icon.classList.contains('fa-question')) {
        icon.classList.remove('fa-question');
        icon.classList.add('fa-check');
        btn.style.background = 'var(--success)';
        btn.style.color = 'white';
        showToast('You have confirmed your attendance', 'success');
    } else if (icon.classList.contains('fa-check')) {
        icon.classList.remove('fa-check');
        icon.classList.add('fa-times');
        btn.style.background = 'var(--danger)';
        showToast('You have declined this event', 'error');
    } else {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-question');
        btn.style.background = 'var(--bg)';
        btn.style.color = 'var(--text)';
    }
}

// ==========================================
// Training Functions
// ==========================================
function startTraining(module) {
    showToast('Starting ' + module + ' training module...', 'success');
}

// ==========================================
// File Upload Functions
// ==========================================
function triggerUpload() {
    document.getElementById('fileInput').click();
}

function handleFileSelect(e) {
    handleFiles(e.target.files);
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const uploadZone = document.getElementById('uploadZone');
    uploadZone.classList.remove('dragover');
    uploadZone.classList.add('uploaded');
    handleFiles(e.dataTransfer.files);
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadZone').classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadZone').classList.remove('dragover');
}

function handleFiles(files) {
    const container = document.getElementById('uploadedFiles');
    
    Array.from(files).forEach(file => {
        const fileDiv = document.createElement('div');
        fileDiv.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--bg); border-radius: 8px; margin-bottom: 0.5rem;';
        fileDiv.innerHTML = '<i class="fas fa-file" style="color: var(--primary);"></i><span style="flex: 1; font-size: 0.85rem;">' + file.name + '</span><i class="fas fa-check-circle" style="color: var(--success);"></i>';
        container.appendChild(fileDiv);
    });
    
    showToast(files.length + ' file(s) uploaded successfully', 'success');
}

// ==========================================
// Settings Functions
// ==========================================
function saveSettings() {
    showToast('Settings saved successfully', 'success');
}

async function restartSetupWizard() {
    if (!confirm('This will restart the setup wizard. You can configure your organization, committees, and members again. Continue?')) {
        return;
    }
    
    const org = authAPI.getCurrentOrganization();
    if (!org) {
        showToast('Please login first', 'error');
        return;
    }
    
    // Clear setup completion flag
    localStorage.removeItem(`setupCompleted_${org.id}`);
    
    // Reset setup data
    setupData = {
        organization: {},
        committees: [],
        members: [],
        csvMembers: null
    };
    currentSetupStep = 1;
    
    showToast('Restarting setup wizard...', 'success');
    
    // Small delay to show toast before reloading
    setTimeout(() => {
        location.reload();
    }, 500);
}

// ==========================================
// RECRUITMENT MODULE FUNCTIONS
// ==========================================

let nextJobId = 4;

// ==========================================
// Recruitment Data Loading
// ==========================================

async function loadRecruitmentJobs() {
    try {
        // Load both active and closed jobs
        const [activeResult, closedResult] = await Promise.all([
            recruitmentAPI.getJobs({ status: 'active' }),
            recruitmentAPI.getJobs({ status: 'closed' })
        ]);
        
        console.log('Loaded active jobs:', activeResult.jobs);
        console.log('Loaded closed jobs:', closedResult.jobs);
        
        // Render active jobs
        const jobListings = document.getElementById('jobListings');
        if (jobListings) {
            // Clear existing job cards
            const existingCards = jobListings.querySelectorAll('.job-card');
            existingCards.forEach(card => card.remove());
            
            // Add active jobs
            if (activeResult.jobs) {
                activeResult.jobs.forEach(job => renderJobCard(job, jobListings, false));
            }
        }
        
        // Render closed jobs
        const closedJobsList = document.getElementById('closedJobsList');
        const closedJobsCount = document.getElementById('closedJobsCount');
        const noClosedJobsMsg = document.getElementById('noClosedJobsMsg');
        
        if (closedJobsCount) {
            closedJobsCount.textContent = `(${closedResult.jobs?.length || 0})`;
        }
        
        if (closedJobsList) {
            // Clear existing closed job cards (but keep the empty message)
            const existingClosedCards = closedJobsList.querySelectorAll('.job-card');
            existingClosedCards.forEach(card => card.remove());
            
            if (closedResult.jobs && closedResult.jobs.length > 0) {
                if (noClosedJobsMsg) noClosedJobsMsg.style.display = 'none';
                
                closedResult.jobs.forEach(job => {
                    renderJobCard(job, closedJobsList, true);
                });
            } else {
                if (noClosedJobsMsg) noClosedJobsMsg.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Failed to load jobs:', error);
    }
}

// Helper function to render a job card
function renderJobCard(job, container, isClosed) {
    const expiryDate = new Date(job.expiry_date);
    const formattedExpiry = expiryDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    
    const closedDate = job.closed_at ? new Date(job.closed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
    
    const jobCard = document.createElement('div');
    jobCard.className = 'job-card' + (isClosed ? ' closed' : '');
    jobCard.setAttribute('data-job-id', job.id);
    
    if (isClosed) {
        // Simplified card for closed jobs
        jobCard.style.margin = '1rem';
        jobCard.style.opacity = '0.7';
        jobCard.innerHTML = `
            <div class="job-header">
                <div class="job-info">
                    <div class="job-title">${job.title}</div>
                    <div class="job-meta">
                        <span><i class="fas fa-calendar-check"></i> Closed: ${closedDate || 'N/A'}</span>
                        <span><i class="fas fa-map-marker-alt"></i> ${job.location}</span>
                        <span><i class="fas fa-clock"></i> ${job.time_commitment}</span>
                    </div>
                </div>
                <div class="job-actions">
                    <span class="status-badge status-completed">Closed</span>
                </div>
            </div>
            <div class="job-department">${job.department}</div>
            <div class="job-footer" style="margin-top: 1rem;">
                <button class="btn btn-secondary" style="width: auto;" onclick="editJob(${job.id})">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-success" style="width: auto;" onclick="reopenJob(${job.id})">
                    <i class="fas fa-redo"></i> Reopen Position
                </button>
            </div>
        `;
    } else {
        // Full card for active jobs
        jobCard.innerHTML = `
            <div class="job-header">
                <div class="job-info">
                    <div class="job-title">${job.title}</div>
                    <div class="job-meta">
                        <span><i class="fas fa-map-marker-alt"></i> ${job.location}</span>
                        <span><i class="fas fa-clock"></i> ${job.time_commitment}</span>
                        <span><i class="fas fa-calendar"></i> Expires: ${formattedExpiry}</span>
                    </div>
                </div>
                <div class="job-actions">
                    <span class="status-badge status-open">Active</span>
                    <button class="btn btn-secondary" style="padding: 0.4rem 0.75rem; font-size: 0.75rem; width: auto;" onclick="editJob(${job.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
            <div class="job-department">${job.department}</div>
            <div class="job-description">
                <p>${job.description}</p>
            </div>
            <div class="job-requirements">
                <strong>Required:</strong> ${job.requirements}
            </div>
            <div class="job-stats">
                <div class="stat">
                    <span class="stat-value">${job.application_count || 0}</span>
                    <span class="stat-label">Applications</span>
                </div>
                <div class="stat">
                    <span class="stat-value">0</span>
                    <span class="stat-label">Shortlisted</span>
                </div>
                <div class="stat">
                    <span class="stat-value">0</span>
                    <span class="stat-label">In Review</span>
                </div>
                <div class="progress-section">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 0%;"></div>
                    </div>
                    <span class="progress-text">0% Complete</span>
                </div>
            </div>
            <div class="job-footer">
                <button class="btn btn-primary" style="width: auto;" onclick="viewApplications(${job.id})">
                    <i class="fas fa-eye"></i> View Applications
                </button>
                <button class="btn btn-secondary" style="width: auto;" onclick="manageShortlist(${job.id})">
                    <i class="fas fa-list"></i> Manage Shortlist
                </button>
                <button class="btn btn-info" style="width: auto; background: var(--primary-light); color: white;" onclick="copyApplicationLink(${job.id})">
                    <i class="fas fa-link"></i> Copy Link
                </button>
                <button class="btn btn-success" style="width: auto;" onclick="closeJob(${job.id})">
                    <i class="fas fa-check"></i> Close Position
                </button>
            </div>
        `;
    }
    
    container.appendChild(jobCard);
}

// ==========================================
// Dynamic Data Loading for Recruitment Tabs
// ==========================================

async function loadApplications() {
    try {
        console.log('Loading all applications...');
        // Get ALL applications regardless of status
        const filters = { status: 'all' };
        if (currentFilterJobId) {
            filters.jobId = currentFilterJobId;
        }
        const result = await recruitmentAPI.getApplications(filters);
        console.log('Applications result:', result);
        const applications = result.applications || [];
        
        // Also get shortlisted data to check for interview status
        const shortlistedResult = await recruitmentAPI.getShortlisted();
        const shortlistedMap = {};
        (shortlistedResult.candidates || []).forEach(c => {
            shortlistedMap[c.application_id] = c;
        });
        
        // Remove duplicates by application id
        const seenApps = new Set();
        const uniqueApplications = applications.filter(a => {
            if (seenApps.has(a.id)) return false;
            seenApps.add(a.id);
            return true;
        });
        
        // Update badge - show total count
        const badge = document.getElementById('applicationsBadge');
        if (badge) badge.textContent = uniqueApplications.length;
        
        console.log(`Found ${applications.length} total applications`);
        
        // Render applications list
        const container = document.getElementById('applicationsList');
        const emptyMsg = document.getElementById('noApplicationsMsg');
        
        if (!container) return;
        
        // Clear existing (except empty message)
        container.querySelectorAll('.application-card').forEach(el => el.remove());
        
        // Add filter indicator if filtering by job
        if (currentFilterJobId) {
            let filterIndicator = container.querySelector('.filter-indicator');
            if (!filterIndicator) {
                filterIndicator = document.createElement('div');
                filterIndicator.className = 'filter-indicator';
                filterIndicator.style.cssText = 'margin-bottom: 1rem; padding: 0.75rem; background: var(--primary-light); color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;';
                container.insertBefore(filterIndicator, container.firstChild);
            }
            filterIndicator.innerHTML = `
                <span><i class="fas fa-filter"></i> Showing applications for Job #${currentFilterJobId}</span>
                <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; width: auto;" onclick="clearJobFilter()">Clear Filter</button>
            `;
            filterIndicator.style.display = 'flex';
        } else {
            const filterIndicator = container.querySelector('.filter-indicator');
            if (filterIndicator) filterIndicator.style.display = 'none';
        }
        
        if (applications.length === 0) {
            console.log('No applications to display');
            if (emptyMsg) {
                emptyMsg.style.display = 'block';
                if (currentFilterJobId) {
                    emptyMsg.querySelector('p').textContent = 'No applications for this job position';
                } else {
                    emptyMsg.querySelector('p').textContent = 'No applications received yet';
                }
            }
            return;
        }
        
        console.log(`Rendering ${uniqueApplications.length} unique applications`);
        if (emptyMsg) emptyMsg.style.display = 'none';
        
        uniqueApplications.forEach(app => {
            console.log('Rendering application:', app.first_name, app.last_name, 'Status:', app.status);
            const appCard = document.createElement('div');
            appCard.className = 'application-card';
            
            // Check if this application has a shortlisted entry with interview
            const shortlistedEntry = shortlistedMap[app.id];
            const isInterviewing = shortlistedEntry && shortlistedEntry.status === 'interview_scheduled';
            
            // Set background color based on status
            let bgColor = '';
            let statusLabel = '';
            let statusClass = '';
            
            if (isInterviewing) {
                // Interviewing - Green
                bgColor = 'background: #e8f5e9;';
                statusLabel = 'Interviewing';
                statusClass = 'status-open';
            } else {
                switch(app.status) {
                    case 'rejected':
                        bgColor = 'background: #f5f5f5; opacity: 0.7;';
                        statusLabel = 'Rejected';
                        statusClass = 'status-closed';
                        break;
                    case 'shortlisted':
                        bgColor = 'background: #e3f2fd;';
                        statusLabel = 'Shortlisted';
                        statusClass = 'status-review';
                        break;
                    case 'hired':
                        bgColor = 'background: #c8e6c9;';
                        statusLabel = 'Selected';
                        statusClass = 'status-open';
                        break;
                    default:
                        bgColor = '';
                        statusLabel = app.status === 'new' ? 'New' : 'Under Review';
                        statusClass = app.status === 'new' ? 'status-open' : 'status-review';
                }
            }
            
            appCard.style.cssText = bgColor;
            appCard.setAttribute('data-status', app.status);
            
            // Determine action buttons based on status
            let actionButtons = '';
            if (app.status === 'rejected' || isInterviewing || app.status === 'hired') {
                actionButtons = `
                    <button class="btn btn-secondary" style="padding: 0.4rem 0.75rem; font-size: 0.75rem; width: auto;" onclick="viewApplication(${app.id})">
                        <i class="fas fa-eye"></i> View
                    </button>
                `;
            } else if (app.status === 'shortlisted') {
                actionButtons = `
                    <button class="btn btn-secondary" style="padding: 0.4rem 0.75rem; font-size: 0.75rem; width: auto;" onclick="viewApplication(${app.id})">
                        <i class="fas fa-eye"></i> View
                    </button>
                `;
            } else {
                actionButtons = `
                    <button class="btn btn-primary" style="padding: 0.4rem 0.75rem; font-size: 0.75rem; width: auto;" onclick="viewApplication(${app.id})">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-success" style="padding: 0.4rem 0.75rem; font-size: 0.75rem; width: auto;" onclick="shortlistCandidate(${app.id})">
                        <i class="fas fa-list"></i> Shortlist
                    </button>
                    <button class="btn btn-danger" style="padding: 0.4rem 0.75rem; font-size: 0.75rem; width: auto;" onclick="rejectCandidate(${app.id})">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            }
            
            appCard.innerHTML = `
                <div class="applicant-avatar">${app.first_name[0]}${app.last_name[0]}</div>
                <div class="applicant-info">
                    <h4>${app.first_name} ${app.last_name}</h4>
                    <p>Applied for: ${app.job_title || 'Unknown Position'}</p>
                    <div class="applicant-meta">
                        <span><i class="fas fa-envelope"></i> ${app.email}</span>
                        ${app.phone ? `<span><i class="fas fa-phone"></i> ${app.phone}</span>` : ''}
                        <span><i class="fas fa-calendar"></i> Applied: ${formatDate(app.applied_at)}</span>
                    </div>
                </div>
                <div class="application-status">
                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                    <div class="status-actions">
                        ${actionButtons}
                    </div>
                </div>
            `;
            container.appendChild(appCard);
        });
    } catch (error) {
        console.error('Failed to load applications:', error);
    }
}

async function loadShortlisted() {
    try {
        // If filtering by job, pass jobId to API
        const result = currentFilterJobId 
            ? await recruitmentAPI.getShortlistedByJob(currentFilterJobId)
            : await recruitmentAPI.getShortlisted();
        // Filter out rejected and interview-scheduled candidates
        let shortlisted = result.candidates || [];
        shortlisted = shortlisted.filter(c => c.status !== 'rejected' && c.status !== 'interview_scheduled');
        
        // Remove duplicates by candidate id (keep only first occurrence)
        const seen = new Set();
        shortlisted = shortlisted.filter(c => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
        });
        
        // Update badge (total count, not filtered)
        const totalResult = await recruitmentAPI.getShortlisted();
        const totalShortlisted = (totalResult.candidates || []).filter(c => c.status !== 'rejected' && c.status !== 'interview_scheduled');
        const badge = document.getElementById('shortlistedBadge');
        if (badge) badge.textContent = totalShortlisted.length;
        
        // Show filter indicator
        const container = document.getElementById('shortlistedTable')?.parentElement;
        if (container) {
            let filterIndicator = container.querySelector('.filter-indicator');
            if (currentFilterJobId) {
                if (!filterIndicator) {
                    filterIndicator = document.createElement('div');
                    filterIndicator.className = 'filter-indicator';
                    filterIndicator.style.cssText = 'margin-bottom: 1rem; padding: 0.75rem; background: var(--primary-light); color: white; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;';
                    container.insertBefore(filterIndicator, container.firstChild);
                }
                filterIndicator.innerHTML = `
                    <span><i class="fas fa-filter"></i> Showing shortlisted for: ${currentFilterJobId}</span>
                    <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; width: auto;" onclick="clearJobFilter()">Clear Filter</button>
                `;
                filterIndicator.style.display = 'flex';
            } else if (filterIndicator) {
                filterIndicator.style.display = 'none';
            }
        }
        
        // Render shortlisted table
        const tbody = document.getElementById('shortlistedTableBody');
        const emptyMsg = document.getElementById('noShortlistedMsg');
        
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (shortlisted.length === 0) {
            if (emptyMsg) {
                emptyMsg.style.display = 'block';
                if (currentFilterJobId) {
                    emptyMsg.querySelector('p').textContent = 'No shortlisted candidates for this job';
                }
            }
            return;
        }
        
        if (emptyMsg) emptyMsg.style.display = 'none';
        
        shortlisted.forEach(candidate => {
            const row = document.createElement('tr');
            const isScheduled = candidate.status === 'interview_scheduled';
            const candidateName = `${candidate.first_name} ${candidate.last_name}`.replace(/'/g, "\\'");
            row.innerHTML = `
                <td>
                    <div class="candidate-cell">
                        <div class="candidate-avatar">${candidate.first_name[0]}${candidate.last_name[0]}</div>
                        <div>
                            <strong>${candidate.first_name} ${candidate.last_name}</strong>
                            <p style="font-size: 0.75rem; color: var(--text-light);">${candidate.email}</p>
                        </div>
                    </div>
                </td>
                <td>${candidate.job_title || 'Unknown'}</td>
                <td>${candidate.interview_date ? formatDate(candidate.interview_date) : 'Not scheduled'}</td>
                <td><span class="status-badge ${isScheduled ? 'status-review' : 'status-open'}">${candidate.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-secondary" style="padding: 0.4rem; width: auto;" onclick="viewCandidateDetails(${candidate.id})" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${!isScheduled ? `
                            <button class="btn btn-primary" style="padding: 0.4rem; width: auto;" onclick="openScheduleInterviewModal(${candidate.id}, ${candidate.job_id || 0}, '${candidateName}')" title="Schedule Interview">
                                <i class="fas fa-calendar-plus"></i>
                            </button>
                            <button class="btn btn-danger" style="padding: 0.4rem; width: auto;" onclick="rejectShortlisted(${candidate.id})" title="Reject">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : `
                            <button class="btn btn-success" style="padding: 0.4rem; width: auto;" onclick="viewInterview(${candidate.id})" title="View Interview">
                                <i class="fas fa-calendar-check"></i>
                            </button>
                        `}
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Failed to load shortlisted:', error);
    }
}

async function loadInterviews() {
    try {
        const result = await recruitmentAPI.getShortlisted();
        const candidates = result.candidates || [];
        
        // Filter candidates with scheduled interviews (including completed interviews) - exclude rejected and offered
        let interviews = candidates.filter(c => 
            (c.status === 'interview_scheduled' || c.status === 'interview_completed') && 
            c.status !== 'rejected' && 
            c.status !== 'offered'
        );
        
        // Remove duplicates by candidate id
        const seen = new Set();
        interviews = interviews.filter(c => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
        });
        
        // Update badge
        const badge = document.getElementById('interviewBadge');
        if (badge) badge.textContent = interviews.length;
        
        // Render interviews list
        const container = document.getElementById('interviewsList');
        const emptyMsg = document.getElementById('noInterviewsMsg');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (interviews.length === 0) {
            if (emptyMsg) emptyMsg.style.display = 'block';
            return;
        }
        
        if (emptyMsg) emptyMsg.style.display = 'none';
        
        interviews.forEach(candidate => {
            const isCompleted = candidate.status === 'interview_completed';
            const interviewCard = document.createElement('div');
            interviewCard.className = 'interview-card';
            interviewCard.style.cssText = 'background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem;';
            interviewCard.setAttribute('data-candidate-id', candidate.id);
            interviewCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                    <div style="display: flex; gap: 1rem;">
                        <div class="candidate-avatar" style="width: 48px; height: 48px; font-size: 1.2rem;">${candidate.first_name[0]}${candidate.last_name[0]}</div>
                        <div>
                            <h4 style="margin: 0;">${candidate.first_name} ${candidate.last_name}</h4>
                            <p style="margin: 0; color: var(--text-light); font-size: 0.9rem;">${candidate.job_title || 'Unknown Position'}</p>
                        </div>
                    </div>
                    <span class="status-badge ${isCompleted ? 'status-open' : 'status-review'}">${isCompleted ? 'Interview Completed' : 'Scheduled'}</span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem; padding: 1rem; background: var(--bg); border-radius: 8px;">
                    <div>
                        <p style="margin: 0; font-size: 0.8rem; color: var(--text-light);"><i class="fas fa-calendar"></i> Date</p>
                        <p style="margin: 0; font-weight: 500;">${candidate.interview_date ? formatDate(candidate.interview_date) : 'TBD'}</p>
                    </div>
                    <div>
                        <p style="margin: 0; font-size: 0.8rem; color: var(--text-light);"><i class="fas fa-envelope"></i> Email</p>
                        <p style="margin: 0; font-weight: 500;">${candidate.email}</p>
                    </div>
                    ${candidate.panel_score ? `
                    <div>
                        <p style="margin: 0; font-size: 0.8rem; color: var(--text-light);"><i class="fas fa-star"></i> Panel Score</p>
                        <p style="margin: 0; font-weight: 500;">${candidate.panel_score}/10</p>
                    </div>
                    ` : ''}
                </div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="btn btn-primary" style="flex: 1; min-width: 120px; width: auto;" onclick="viewInterviewDetailsModal(${candidate.id})">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    <button class="btn btn-success" style="width: auto;" onclick="selectFromInterview(${candidate.id})">
                        <i class="fas fa-user-check"></i> Select
                    </button>
                    <button class="btn btn-secondary" style="width: auto;" onclick="rescheduleInterviewModal(${candidate.id}, ${candidate.job_id || 0}, '${candidate.first_name} ${candidate.last_name}')">
                        <i class="fas fa-calendar-alt"></i> Reschedule
                    </button>
                    <button class="btn btn-danger" style="width: auto;" onclick="rejectInterviewCandidate(${candidate.id})">
                        <i class="fas fa-times"></i> Reject
                    </button>
                </div>
            `;
            container.appendChild(interviewCard);
        });
    } catch (error) {
        console.error('Failed to load interviews:', error);
    }
}

// Interview Details Modal
async function viewInterviewDetailsModal(candidateId) {
    try {
        const result = await recruitmentAPI.getShortlisted();
        const candidate = result.candidates.find(c => c.id === candidateId);
        
        if (!candidate) {
            showToast('Candidate not found', 'error');
            return;
        }
        
        const modalHtml = `
            <div class="modal-overlay active" id="interviewDetailsModal" style="display: flex;">
                <div class="modal" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h2>Interview Details</h2>
                        <button class="modal-close" onclick="closeInterviewDetailsModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--bg); border-radius: 8px;">
                            <div class="applicant-avatar" style="width: 64px; height: 64px; font-size: 1.5rem;">${candidate.first_name[0]}${candidate.last_name[0]}</div>
                            <div>
                                <h3 style="margin: 0;">${candidate.first_name} ${candidate.last_name}</h3>
                                <p style="margin: 0; color: var(--text-light);">${candidate.job_title || 'Unknown Position'}</p>
                                <span class="status-badge ${candidate.status === 'interview_completed' ? 'status-open' : 'status-review'}">${candidate.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                            </div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                            <div class="form-group">
                                <label><i class="fas fa-envelope"></i> Email</label>
                                <p style="margin: 0; padding: 0.5rem; background: var(--bg); border-radius: 4px;">${candidate.email}</p>
                            </div>
                            <div class="form-group">
                                <label><i class="fas fa-phone"></i> Phone</label>
                                <p style="margin: 0; padding: 0.5rem; background: var(--bg); border-radius: 4px;">${candidate.phone || 'Not provided'}</p>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label><i class="fas fa-calendar-check"></i> Interview Date</label>
                            <p style="margin: 0; padding: 0.5rem; background: var(--bg); border-radius: 4px;">${candidate.interview_date ? formatDate(candidate.interview_date) : 'Not scheduled'}</p>
                        </div>
                        
                        ${candidate.panel_score ? `
                        <div class="form-group">
                            <label><i class="fas fa-star"></i> Panel Score</label>
                            <p style="margin: 0; padding: 0.5rem; background: var(--bg); border-radius: 4px;">${candidate.panel_score}/10</p>
                        </div>
                        ` : ''}
                        
                        ${candidate.interview_notes ? `
                        <div class="form-group">
                            <label><i class="fas fa-sticky-note"></i> Interview Notes</label>
                            <div style="padding: 1rem; background: var(--bg); border-radius: 8px; white-space: pre-wrap;">${candidate.interview_notes}</div>
                        </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeInterviewDetailsModal()" style="width: auto;">Close</button>
                        <button class="btn btn-secondary" onclick="closeInterviewDetailsModal(); rescheduleInterviewModal(${candidate.id}, ${candidate.job_id || 0}, '${candidate.first_name} ${candidate.last_name}')" style="width: auto;">
                            <i class="fas fa-calendar-alt"></i> Reschedule
                        </button>
                        <button class="btn btn-danger" onclick="closeInterviewDetailsModal(); rejectInterviewCandidate(${candidate.id})" style="width: auto;">
                            <i class="fas fa-times"></i> Reject
                        </button>
                        <button class="btn btn-success" onclick="closeInterviewDetailsModal(); selectFromInterview(${candidate.id})" style="width: auto;">
                            <i class="fas fa-user-check"></i> Select Candidate
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const existingModal = document.getElementById('interviewDetailsModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
    } catch (error) {
        console.error('Failed to load interview details:', error);
        showToast('Failed to load interview details', 'error');
    }
}

function closeInterviewDetailsModal() {
    const modal = document.getElementById('interviewDetailsModal');
    if (modal) modal.remove();
}

function viewInterviewDetails(candidateId) {
    showToast('Viewing interview details...', 'info');
}

// Select candidate directly from interview tab
async function selectFromInterview(candidateId) {
    if (!confirm('Are you sure you want to select this candidate? This will move them to the Selected tab.')) return;
    
    try {
        showToast('Selecting candidate...', 'info');
        
        // Get candidate details
        const result = await recruitmentAPI.getShortlisted();
        const candidate = result.candidates.find(c => c.id === candidateId);
        
        if (!candidate) {
            showToast('Candidate not found', 'error');
            return;
        }
        
        // Update shortlisted status to 'offered' to remove from interview tab
        await api.put(`/recruitment/shortlisted/${candidateId}/score`, {
            panelScore: candidate.panel_score || 0,
            status: 'offered'
        });
        
        // Add to selected candidates
        await recruitmentAPI.selectCandidate(candidateId, new Date().toISOString().split('T')[0]);
        
        // Update application status to hired
        if (candidate.application_id) {
            await recruitmentAPI.updateApplicationStatus(candidate.application_id, 'hired');
        }
        
        showToast('Candidate selected successfully!', 'success');
        
        // Refresh all relevant tabs
        await loadInterviews();
        await loadSelected();
        await loadApplications();
        await updateRecruitmentBadges();
        
    } catch (error) {
        console.error('Failed to select candidate:', error);
        showToast('Failed to select candidate: ' + (error.message || 'Unknown error'), 'error');
    }
}

function completeInterview(candidateId) {
    showToast('Interview marked as complete', 'success');
    // Reload to show the updated status with Select button
    setTimeout(() => loadInterviews(), 500);
}

// Reschedule interview - opens the schedule modal with existing data
async function rescheduleInterviewModal(candidateId, jobId, candidateName) {
    // Just open the schedule interview modal which will allow setting a new date
    await openScheduleInterviewModal(candidateId, jobId, candidateName);
    
    // Update modal title to indicate rescheduling
    const modalTitle = document.querySelector('#scheduleInterviewModal .modal-header h2');
    if (modalTitle) {
        modalTitle.textContent = 'Reschedule Interview';
    }
}

function rescheduleInterview(candidateId) {
    showToast('Please use the Reschedule button in the interview card', 'info');
}

// Reject candidate from interview stage
async function rejectInterviewCandidate(candidateId) {
    if (!confirm('Are you sure you want to reject this candidate?')) return;
    
    try {
        showToast('Rejecting candidate...', 'info');
        
        // Get the shortlisted candidate to find the application_id
        const result = await recruitmentAPI.getShortlisted();
        const candidate = result.candidates.find(c => c.id === candidateId);
        
        if (!candidate) {
            showToast('Candidate not found', 'error');
            return;
        }
        
        // Update the shortlisted status to rejected
        await api.put(`/recruitment/shortlisted/${candidateId}/score`, {
            status: 'rejected'
        });
        
        // Also update the application status to rejected
        await recruitmentAPI.updateApplicationStatus(candidate.application_id, 'rejected');
        
        showToast('Candidate rejected', 'success');
        
        // Close any open modals
        closeInterviewDetailsModal();
        
        // Refresh all relevant tabs
        await loadInterviews();
        await loadShortlisted();
        await loadApplications();
        await updateRecruitmentBadges();
    } catch (error) {
        console.error('Failed to reject:', error);
        showToast('Failed to reject candidate: ' + (error.message || 'Unknown error'), 'error');
    }
}

// Finalize candidate - push to selected tab
async function finalizeCandidate(candidateId) {
    if (!confirm('Are you sure you want to select this candidate? This will move them to the Selected tab.')) return;
    
    try {
        showToast('Finalizing candidate selection...', 'info');
        
        // Add to selected candidates
        await recruitmentAPI.selectCandidate(candidateId, new Date().toISOString().split('T')[0]);
        
        showToast('Candidate selected successfully!', 'success');
        
        // Refresh both interview and selected tabs
        await loadInterviews();
        await loadSelected();
        await updateRecruitmentBadges();
        
        // Optionally switch to selected tab
        if (confirm('Candidate moved to Selected tab. View selected candidates now?')) {
            showRecruitmentTab('selected', document.querySelectorAll('.recruitment-tab')[5]);
        }
    } catch (error) {
        console.error('Failed to finalize candidate:', error);
        showToast('Failed to select candidate', 'error');
    }
}

async function loadRejected() {
    try {
        const result = await recruitmentAPI.getApplications({ status: 'rejected' });
        const rejected = result.applications || [];
        
        // Update badge
        const badge = document.getElementById('rejectedBadge');
        if (badge) badge.textContent = rejected.length;
        
        // Render rejected list
        const container = document.getElementById('rejectedList');
        const emptyMsg = document.getElementById('noRejectedMsg');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (rejected.length === 0) {
            if (emptyMsg) emptyMsg.style.display = 'block';
            return;
        }
        
        if (emptyMsg) emptyMsg.style.display = 'none';
        
        rejected.forEach(app => {
            const rejectCard = document.createElement('div');
            rejectCard.className = 'application-card';
            rejectCard.style.opacity = '0.7';
            rejectCard.innerHTML = `
                <div class="applicant-avatar">${app.first_name[0]}${app.last_name[0]}</div>
                <div class="applicant-info">
                    <h4>${app.first_name} ${app.last_name}</h4>
                    <p>Applied for: ${app.job_title || 'Unknown Position'}</p>
                    <div class="applicant-meta">
                        <span><i class="fas fa-envelope"></i> ${app.email}</span>
                        <span><i class="fas fa-calendar"></i> Applied: ${formatDate(app.applied_at)}</span>
                        ${app.reviewed_at ? `<span><i class="fas fa-times-circle"></i> Rejected: ${formatDate(app.reviewed_at)}</span>` : ''}
                    </div>
                </div>
                <div class="application-status">
                    <span class="status-badge status-closed">Rejected</span>
                    <div class="status-actions">
                        <button class="btn btn-secondary" style="padding: 0.4rem 0.75rem; font-size: 0.75rem; width: auto;" onclick="viewApplication(${app.id})">
                            <i class="fas fa-eye"></i> View
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(rejectCard);
        });
    } catch (error) {
        console.error('Failed to load rejected:', error);
    }
}

async function loadSelected() {
    try {
        const result = await recruitmentAPI.getSelected();
        let selected = result.selected || [];
        
        // Remove duplicates by selected candidate id
        const seen = new Set();
        selected = selected.filter(s => {
            if (seen.has(s.id)) return false;
            seen.add(s.id);
            return true;
        });
        
        // Update badge
        const badge = document.getElementById('selectedBadge');
        if (badge) badge.textContent = selected.length;
        
        // Render selected candidates
        const container = document.getElementById('selectedCandidates');
        const emptyMsg = document.getElementById('noSelectedMsg');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (selected.length === 0) {
            if (emptyMsg) emptyMsg.style.display = 'block';
            return;
        }
        
        if (emptyMsg) emptyMsg.style.display = 'none';
        
        selected.forEach(candidate => {
            const isOnboarding = candidate.onboarding_initiated;
            const selectedCard = document.createElement('div');
            selectedCard.className = 'selected-card';
            selectedCard.setAttribute('data-candidate-id', candidate.id);
            selectedCard.innerHTML = `
                <div class="selected-header">
                    <div class="selected-avatar">${candidate.first_name[0]}${candidate.last_name[0]}</div>
                    <div class="selected-info">
                        <h3>${candidate.first_name} ${candidate.last_name}</h3>
                        <p><i class="fas fa-briefcase"></i> ${candidate.job_title || 'Unknown Position'}</p>
                        <p><i class="fas fa-calendar-check"></i> Selected: ${formatDate(candidate.selected_at)}</p>
                    </div>
                    <span class="status-badge ${isOnboarding ? 'status-completed' : 'status-open'}">${isOnboarding ? 'Onboarding Started' : 'Ready to Onboard'}</span>
                </div>
                <div class="selected-details">
                    <div class="detail-row">
                        <span class="detail-label">Email:</span>
                        <span class="detail-value">${candidate.email}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Start Date:</span>
                        <span class="detail-value">${candidate.start_date || 'Not set'}</span>
                    </div>
                </div>
                <div class="selected-actions">
                    ${!isOnboarding ? `
                        <button class="btn btn-primary" style="flex: 1; width: auto;" onclick="startOnboarding(${candidate.id})">
                            <i class="fas fa-rocket"></i> Start Onboarding
                        </button>
                    ` : `
                        <button class="btn btn-success" style="flex: 1; width: auto;" onclick="viewOnboarding(${candidate.id})">
                            <i class="fas fa-check-circle"></i> View Onboarding
                        </button>
                    `}
                </div>
            `;
            container.appendChild(selectedCard);
        });
    } catch (error) {
        console.error('Failed to load selected:', error);
    }
}

async function updateRecruitmentBadges() {
    try {
        // Load all data in parallel
        const [appsResult, shortlistedResult, selectedResult] = await Promise.all([
            recruitmentAPI.getApplications({ status: 'all' }),
            recruitmentAPI.getShortlisted(),
            recruitmentAPI.getSelected()
        ]);
        
        // Get interviews (candidates with interview dates)
        const interviews = (shortlistedResult.candidates || []).filter(c => c.status === 'interview_scheduled' || c.interview_date);
        
        // Update all badges
        const appsBadge = document.getElementById('applicationsBadge');
        const shortlistedBadge = document.getElementById('shortlistedBadge');
        const interviewBadge = document.getElementById('interviewBadge');
        const selectedBadge = document.getElementById('selectedBadge');
        
        if (appsBadge) appsBadge.textContent = (appsResult.applications || []).length;
        if (shortlistedBadge) shortlistedBadge.textContent = (shortlistedResult.candidates || []).filter(c => c.status !== 'interview_scheduled' && !c.interview_date).length;
        if (interviewBadge) interviewBadge.textContent = interviews.length;
        if (selectedBadge) selectedBadge.textContent = (selectedResult.selected || []).length;
        
    } catch (error) {
        console.error('Failed to update badges:', error);
    }
}

// Open Create Job Modal
function openCreateJobModal() {
    const modal = document.getElementById('createJobModal');
    if (modal) {
        // Reset form for create mode
        document.getElementById('editJobId').value = '';
        document.getElementById('jobModalTitle').textContent = 'Create New Job Opening';
        document.getElementById('jobModalSubmitBtn').innerHTML = '<i class="fas fa-paper-plane"></i> Post Job Opening';
        
        // Clear form fields
        document.getElementById('jobTitle').value = '';
        document.getElementById('jobDepartment').value = '';
        document.getElementById('jobLocation').value = '';
        document.getElementById('jobTime').value = '';
        document.getElementById('jobExpiry').value = '';
        document.getElementById('jobDescription').value = '';
        document.getElementById('jobRequirements').value = '';
        document.getElementById('jobAdditional').value = '';
        
        modal.style.display = 'flex';
        modal.classList.add('active');
    } else {
        showToast('Error: Modal not found', 'error');
    }
}

// Open Edit Job Modal
async function editJob(jobId) {
    try {
        showToast('Loading job details...', 'info');
        
        // Fetch job details from API (admin endpoint)
        const result = await recruitmentAPI.getJobDetails(jobId);
        const job = result.job;
        
        if (!job) {
            showToast('Job not found', 'error');
            return;
        }
        
        const modal = document.getElementById('createJobModal');
        if (!modal) {
            showToast('Error: Modal not found', 'error');
            return;
        }
        
        // Set edit mode
        document.getElementById('editJobId').value = jobId;
        document.getElementById('jobModalTitle').textContent = 'Edit Job Opening';
        document.getElementById('jobModalSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Job Opening';
        
        // Fill form fields
        document.getElementById('jobTitle').value = job.title || '';
        document.getElementById('jobDepartment').value = job.department || '';
        document.getElementById('jobLocation').value = job.location || '';
        document.getElementById('jobTime').value = job.time_commitment || '';
        document.getElementById('jobExpiry').value = job.expiry_date || '';
        document.getElementById('jobDescription').value = job.description || '';
        document.getElementById('jobRequirements').value = job.requirements || '';
        document.getElementById('jobAdditional').value = job.additional_info || '';
        
        modal.style.display = 'flex';
        modal.classList.add('active');
        
    } catch (error) {
        console.error('Failed to load job:', error);
        showToast('Failed to load job details', 'error');
    }
}

// Close Create Job Modal
function closeCreateJobModal() {
    const modal = document.getElementById('createJobModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    clearJobForm();
}

// Clear form fields
function clearJobForm() {
    const fields = ['jobTitle', 'jobDepartment', 'jobLocation', 'jobTime', 'jobExpiry', 'jobDescription', 'jobRequirements', 'jobAdditional'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const salary = document.getElementById('jobSalary');
    if (salary) salary.value = 'Unpaid/Volunteer';
}

// Post/Update Job Opening
async function postJobOpening() {
    // Get form values
    const title = document.getElementById('jobTitle')?.value.trim();
    const department = document.getElementById('jobDepartment')?.value;
    const location = document.getElementById('jobLocation')?.value;
    const time = document.getElementById('jobTime')?.value;
    const expiry = document.getElementById('jobExpiry')?.value;
    const description = document.getElementById('jobDescription')?.value.trim();
    const requirements = document.getElementById('jobRequirements')?.value.trim();
    const editJobId = document.getElementById('editJobId')?.value;
    
    // Validation
    if (!title || !department || !location || !time || !expiry || !description || !requirements) {
        showToast('Please fill in all required fields (*)', 'error');
        return;
    }
    
    try {
        const isEdit = !!editJobId;
        showToast(isEdit ? 'Updating job posting...' : 'Creating job posting...', 'info');
        console.log(isEdit ? 'Updating job:' : 'Creating job:', { title, department, location, time, expiry, description, requirements });
        
        let result;
        if (isEdit) {
            // Update existing job
            result = await recruitmentAPI.updateJob(editJobId, {
                title,
                department,
                location,
                timeCommitment: time,
                expiryDate: expiry,
                description,
                requirements,
                status: 'active'
            });
        } else {
            // Create new job
            result = await recruitmentAPI.createJob({
                title,
                department,
                location,
                timeCommitment: time,
                expiryDate: expiry,
                description,
                requirements
            });
        }
        
        console.log('API response:', result);
        
        const job = result.job;
        
        if (!job || !job.id) {
            throw new Error('Invalid response from server: missing job data');
        }
        
        // Format expiry date for display
        const expiryDate = new Date(expiry);
        const formattedExpiry = expiryDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        
        if (isEdit) {
            // Update existing job card
            const existingCard = document.querySelector(`[data-job-id="${editJobId}"]`);
            if (existingCard) {
                existingCard.querySelector('.job-title').textContent = title;
                existingCard.querySelector('.job-department').textContent = department;
                existingCard.querySelector('.job-description p').textContent = description;
                existingCard.querySelector('.job-requirements').innerHTML = `<strong>Required:</strong> ${requirements}`;
                const metaSpans = existingCard.querySelectorAll('.job-meta span');
                if (metaSpans[0]) metaSpans[0].innerHTML = `<i class="fas fa-map-marker-alt"></i> ${location}`;
                if (metaSpans[1]) metaSpans[1].innerHTML = `<i class="fas fa-clock"></i> ${time}`;
                if (metaSpans[2]) metaSpans[2].innerHTML = `<i class="fas fa-calendar"></i> Expires: ${formattedExpiry}`;
            }
        } else {
            // Create new job card HTML
            const jobId = job.id;
            const newJobCard = document.createElement('div');
            newJobCard.className = 'job-card';
            newJobCard.setAttribute('data-job-id', jobId);
            newJobCard.innerHTML = `
        <div class="job-header">
            <div class="job-info">
                <div class="job-title">${title}</div>
                <div class="job-meta">
                    <span><i class="fas fa-map-marker-alt"></i> ${location}</span>
                    <span><i class="fas fa-clock"></i> ${time}</span>
                    <span><i class="fas fa-calendar"></i> Expires: ${formattedExpiry}</span>
                </div>
            </div>
            <div class="job-actions">
                <span class="status-badge status-open">Active</span>
                <button class="btn btn-secondary" style="padding: 0.4rem 0.75rem; font-size: 0.75rem; width: auto;" onclick="editJob(${jobId})">
                    <i class="fas fa-edit"></i>
                </button>
            </div>
        </div>
        <div class="job-description">
            <p>${description}</p>
        </div>
        <div class="job-requirements">
            <strong>Required:</strong> ${requirements}
        </div>
        <div class="job-stats">
            <div class="stat">
                <span class="stat-value">0</span>
                <span class="stat-label">Applications</span>
            </div>
            <div class="stat">
                <span class="stat-value">0</span>
                <span class="stat-label">Shortlisted</span>
            </div>
            <div class="stat">
                <span class="stat-value">0</span>
                <span class="stat-label">In Review</span>
            </div>
            <div class="progress-section">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%;"></div>
                </div>
                <span class="progress-text">0% Complete</span>
            </div>
        </div>
        <div class="job-footer">
            <button class="btn btn-primary" style="width: auto;" onclick="viewApplications(${jobId})">
                <i class="fas fa-eye"></i> View Applications
            </button>
            <button class="btn btn-secondary" style="width: auto;" onclick="manageShortlist(${jobId})">
                <i class="fas fa-list"></i> Manage Shortlist
            </button>
            <button class="btn btn-success" style="width: auto;" onclick="closeJob(${jobId})">
                <i class="fas fa-check"></i> Close Position
            </button>
        </div>
    `;
    
            // Add to job listings
            const jobListings = document.getElementById('jobListings');
            if (jobListings) {
                jobListings.insertBefore(newJobCard, jobListings.firstChild);
            }
        }
        
        // Close modal and show success
        closeCreateJobModal();
        showToast(isEdit ? 'Job opening updated successfully!' : 'Job opening posted successfully!', 'success');
        
        // Reload jobs to show updated data
        await loadRecruitmentJobs();
        
    } catch (error) {
        console.error('Failed to create job:', error);
        showToast(error.message || 'Failed to create job opening. Please try again.', 'error');
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('createJobModal');
    if (modal && e.target === modal) {
        closeCreateJobModal();
    }
});

// Recruitment Tab switching
async function showRecruitmentTab(tabName, btn) {
    document.querySelectorAll('.recruitment-content').forEach(tab => {
        tab.classList.remove('active');
    });
    const targetTab = document.getElementById('tab-' + tabName);
    if (targetTab) targetTab.classList.add('active');
    
    document.querySelectorAll('.recruitment-tab').forEach(t => {
        t.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    
    // Load tab-specific data
    if (tabName === 'applications') {
        await loadApplications();
    } else if (tabName === 'shortlisted') {
        await loadShortlisted();
    } else if (tabName === 'interview') {
        await loadInterviews();
    } else if (tabName === 'selected') {
        await loadSelected();
    }
}

// Job Management

async function closeJob(jobId) {
    if (confirm('Are you sure you want to close this position?')) {
        try {
            await recruitmentAPI.closeJob(jobId);
            showToast('Position closed successfully', 'success');
            
            // Reload jobs to move to closed list
            await loadRecruitmentJobs();
        } catch (error) {
            console.error('Failed to close job:', error);
            showToast('Failed to close position', 'error');
        }
    }
}

async function reopenJob(jobId) {
    if (confirm('Reopen this position?')) {
        try {
            // Update job status to active
            await recruitmentAPI.updateJob(jobId, { status: 'active' });
            showToast('Position reopened successfully', 'success');
            
            // Reload jobs to move back to active list
            await loadRecruitmentJobs();
        } catch (error) {
            console.error('Failed to reopen job:', error);
            showToast('Failed to reopen position', 'error');
        }
    }
}

function copyApplicationLink(jobId) {
    const link = recruitmentAPI.getApplicationUrl(jobId);
    
    // Copy to clipboard
    navigator.clipboard.writeText(link).then(() => {
        showToast('Application link copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback: show the link in a prompt
        prompt('Copy this link to share with applicants:', link);
    });
}

let currentFilterJobId = null;

function viewApplications(jobId) {
    currentFilterJobId = jobId;
    showRecruitmentTab('applications', document.querySelectorAll('.recruitment-tab')[1]);
}

function manageShortlist(jobId) {
    currentFilterJobId = jobId;
    showRecruitmentTab('shortlisted', document.querySelectorAll('.recruitment-tab')[2]);
}

let currentScheduleCandidateId = null;
let currentScheduleJobId = null;

function clearJobFilter() {
    currentFilterJobId = null;
    // Reload current active tab
    const activeTab = document.querySelector('.recruitment-content.active');
    if (activeTab) {
        if (activeTab.id === 'tab-applications') {
            loadApplications();
        } else if (activeTab.id === 'tab-shortlisted') {
            loadShortlisted();
        }
    }
}

async function openScheduleInterviewModal(candidateId, jobId, candidateName) {
    console.log('Opening schedule modal for:', candidateId, jobId, candidateName);
    currentScheduleCandidateId = candidateId;
    currentScheduleJobId = jobId;
    
    const modal = document.getElementById('scheduleInterviewModal');
    if (!modal) {
        console.error('Modal not found');
        showToast('Error: Modal not found', 'error');
        return;
    }
    
    document.getElementById('scheduleCandidateId').value = candidateId;
    document.getElementById('scheduleJobId').value = jobId;
    document.getElementById('scheduleCandidateName').textContent = candidateName;
    
    // Load interviewers (active trustees)
    await loadInterviewers();
    
    // Set default date (tomorrow at 10 AM)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    document.getElementById('interviewDateTime').value = tomorrow.toISOString().slice(0, 16);
    
    // Show modal
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function closeScheduleInterviewModal() {
    const modal = document.getElementById('scheduleInterviewModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    currentScheduleCandidateId = null;
    currentScheduleJobId = null;
}

async function loadInterviewers() {
    try {
        const result = await usersAPI.getAll({ role: 'trustee' });
        const users = result.users || [];
        
        const container = document.getElementById('interviewersList');
        if (!container) return;
        
        if (users.length === 0) {
            container.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 1rem;">No trustees available</p>';
            return;
        }
        
        container.innerHTML = users.map(user => `
            <label style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem; cursor: pointer; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" name="interviewer" value="${user.id}" style="width: auto;">
                <div class="candidate-avatar" style="width: 32px; height: 32px; font-size: 0.8rem;">${user.avatar || user.first_name[0] + user.last_name[0]}</div>
                <span>${user.first_name} ${user.last_name}</span>
            </label>
        `).join('');
    } catch (error) {
        console.error('Failed to load interviewers:', error);
        document.getElementById('interviewersList').innerHTML = '<p style="color: var(--danger); text-align: center; padding: 1rem;">Failed to load interviewers</p>';
    }
}

async function submitInterviewSchedule() {
    console.log('submitInterviewSchedule called');
    if (!currentScheduleCandidateId) {
        console.error('No candidate selected');
        showToast('No candidate selected', 'error');
        return;
    }
    
    const dateTime = document.getElementById('interviewDateTime').value;
    const duration = document.getElementById('interviewDuration').value;
    const type = document.getElementById('interviewType').value;
    const location = document.getElementById('interviewLocation').value;
    const notes = document.getElementById('interviewNotes').value;
    const addToCalendar = document.getElementById('addToCalendar').checked;
    
    // Get selected interviewers
    const interviewerCheckboxes = document.querySelectorAll('input[name="interviewer"]:checked');
    const interviewerIds = Array.from(interviewerCheckboxes).map(cb => parseInt(cb.value));
    
    if (!dateTime) {
        showToast('Please select interview date and time', 'error');
        return;
    }
    
    if (interviewerIds.length === 0) {
        showToast('Please select at least one interviewer', 'error');
        return;
    }
    
    try {
        showToast('Scheduling interview...', 'info');
        
        // Schedule the interview
        const interviewResult = await api.put(`/recruitment/shortlisted/${currentScheduleCandidateId}/interview`, {
            interviewDate: dateTime,
            interviewLocation: location,
            interviewType: type,
            notes: notes,
            interviewerIds: interviewerIds
        });
        
        // Add to calendar if checked (non-blocking - don't fail if this errors)
        if (addToCalendar) {
            try {
                await api.post(`/recruitment/shortlisted/${currentScheduleCandidateId}/calendar`, {
                    meetingDate: dateTime,
                    duration: parseInt(duration),
                    location: location,
                    zoomLink: type === 'video' ? location : null
                });
            } catch (calendarError) {
                console.warn('Calendar addition failed:', calendarError);
                // Don't fail the whole operation - calendar is optional
            }
        }
        
        showToast('Interview scheduled successfully!', 'success');
        closeScheduleInterviewModal();
        
        // Refresh lists
        await loadShortlisted();
        await loadInterviews();
        await updateRecruitmentBadges();
        
    } catch (error) {
        console.error('Failed to schedule interview:', error);
        showToast(error.message || 'Failed to schedule interview', 'error');
    }
}

async function rejectShortlisted(candidateId) {
    if (!confirm('Are you sure you want to reject this candidate?')) return;
    
    try {
        showToast('Rejecting candidate...', 'info');
        await api.put(`/recruitment/shortlisted/${candidateId}/score`, {
            status: 'rejected'
        });
        showToast('Candidate rejected', 'success');
        await loadShortlisted();
        await updateRecruitmentBadges();
    } catch (error) {
        console.error('Failed to reject:', error);
        showToast('Failed to reject candidate', 'error');
    }
}

function viewInterview(candidateId) {
    showRecruitmentTab('interview', document.querySelectorAll('.recruitment-tab')[3]);
}

function scheduleInterview(candidateId) {
    showRecruitmentTab('interview', document.querySelectorAll('.recruitment-tab')[3]);
}

function viewInterviewDetails(candidateId) {
    showToast('Viewing interview details...', 'info');
}

function completeInterview(candidateId) {
    showToast('Interview marked as complete', 'success');
}

function rescheduleInterview(candidateId) {
    showToast('Reschedule interview feature coming soon', 'info');
}

function toggleClosedJobs() {
    const list = document.getElementById('closedJobsList');
    const icon = document.getElementById('closedJobsIcon');
    if (list && icon) {
        if (list.style.display === 'none') {
            list.style.display = 'block';
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        } else {
            list.style.display = 'none';
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        }
    }
}

// Application Management
let currentApplicationId = null;

async function viewApplication(appId) {
    try {
        currentApplicationId = appId;
        
        // Fetch application details
        const result = await recruitmentAPI.getApplications({ status: 'all' });
        const application = result.applications.find(app => app.id === appId);
        
        if (!application) {
            showToast('Application not found', 'error');
            return;
        }
        
        // Get shortlisted data to check for interview status
        const shortlistedResult = await recruitmentAPI.getShortlisted();
        const shortlistedEntry = (shortlistedResult.candidates || []).find(c => c.application_id === appId);
        const isInterviewing = shortlistedEntry && shortlistedEntry.status === 'interview_scheduled';
        
        // Determine status display
        let statusLabel = '';
        let statusClass = '';
        
        if (isInterviewing) {
            statusLabel = 'Interviewing';
            statusClass = 'status-open';
        } else {
            switch(application.status) {
                case 'rejected':
                    statusLabel = 'Rejected';
                    statusClass = 'status-closed';
                    break;
                case 'shortlisted':
                    statusLabel = 'Shortlisted';
                    statusClass = 'status-review';
                    break;
                case 'hired':
                    statusLabel = 'Selected';
                    statusClass = 'status-open';
                    break;
                default:
                    statusLabel = application.status === 'new' ? 'New' : 'Under Review';
                    statusClass = application.status === 'new' ? 'status-open' : 'status-review';
            }
        }
        
        // Populate modal
        document.getElementById('viewAppId').value = appId;
        document.getElementById('viewAppAvatar').textContent = `${application.first_name[0]}${application.last_name[0]}`;
        document.getElementById('viewAppName').textContent = `${application.first_name} ${application.last_name}`;
        document.getElementById('viewAppPosition').textContent = application.job_title || 'Unknown Position';
        document.getElementById('viewAppStatus').textContent = statusLabel;
        document.getElementById('viewAppStatus').className = `status-badge ${statusClass}`;
        document.getElementById('viewAppEmail').textContent = application.email;
        document.getElementById('viewAppPhone').textContent = application.phone || 'Not provided';
        document.getElementById('viewAppDate').textContent = formatDate(application.applied_at);
        document.getElementById('viewAppCoverLetter').textContent = application.cover_letter || 'No cover letter provided';
        
        // Show/hide CV section
        const cvSection = document.getElementById('viewAppCVSection');
        if (application.cv_path) {
            cvSection.style.display = 'block';
            // Prepend backend URL to the CV path
            const cvUrl = 'http://localhost:3001' + application.cv_path;
            document.getElementById('viewAppCV').href = cvUrl;
        } else {
            cvSection.style.display = 'none';
        }
        
        // Update action buttons based on status
        const rejectBtn = document.querySelector('#viewApplicationModal .btn-danger');
        const shortlistBtn = document.querySelector('#viewApplicationModal .btn-success');
        
        if (rejectBtn && shortlistBtn) {
            if (application.status === 'rejected' || isInterviewing || application.status === 'hired') {
                rejectBtn.style.display = 'none';
                shortlistBtn.style.display = 'none';
            } else if (application.status === 'shortlisted') {
                rejectBtn.style.display = 'none';
                shortlistBtn.style.display = 'none';
            } else {
                rejectBtn.style.display = 'inline-flex';
                shortlistBtn.style.display = 'inline-flex';
            }
        }
        
        // Open modal
        const modal = document.getElementById('viewApplicationModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
        }
    } catch (error) {
        console.error('Failed to load application details:', error);
        showToast('Failed to load application details', 'error');
    }
}

function closeViewApplicationModal() {
    const modal = document.getElementById('viewApplicationModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    currentApplicationId = null;
}

async function shortlistCurrentApplication() {
    if (!currentApplicationId) return;
    await shortlistCandidate(currentApplicationId);
    closeViewApplicationModal();
}

async function rejectCurrentApplication() {
    if (!currentApplicationId) return;
    await rejectCandidate(currentApplicationId);
    closeViewApplicationModal();
}

async function shortlistCandidate(appId) {
    try {
        showToast('Shortlisting candidate...', 'info');
        await recruitmentAPI.updateApplicationStatus(appId, 'shortlisted');
        showToast('Candidate added to shortlist', 'success');
        
        // Refresh applications list
        await loadApplications();
        await updateRecruitmentBadges();
    } catch (error) {
        console.error('Failed to shortlist:', error);
        showToast('Failed to shortlist candidate', 'error');
    }
}

async function rejectCandidate(appId) {
    if (confirm('Are you sure you want to reject this candidate?')) {
        try {
            showToast('Rejecting candidate...', 'info');
            await recruitmentAPI.updateApplicationStatus(appId, 'rejected');
            showToast('Candidate rejected', 'success');
            
            // Refresh applications list
            await loadApplications();
            await updateRecruitmentBadges();
        } catch (error) {
            console.error('Failed to reject:', error);
            showToast('Failed to reject candidate', 'error');
        }
    }
}

// Shortlist Management
let currentCandidateDetails = null;

async function viewCandidateDetails(candidateId) {
    try {
        showToast('Loading candidate details...', 'info');
        
        // Get shortlisted candidates
        const result = await recruitmentAPI.getShortlisted();
        const candidate = result.candidates.find(c => c.id === candidateId);
        
        if (!candidate) {
            showToast('Candidate not found', 'error');
            return;
        }
        
        currentCandidateDetails = candidate;
        
        // Create and show modal
        const modalHtml = `
            <div class="modal-overlay active" id="candidateDetailsModal" style="display: flex;">
                <div class="modal" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h2>Candidate Details</h2>
                        <button class="modal-close" onclick="closeCandidateDetailsModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--bg); border-radius: 8px;">
                            <div class="applicant-avatar" style="width: 64px; height: 64px; font-size: 1.5rem;">${candidate.first_name[0]}${candidate.last_name[0]}</div>
                            <div>
                                <h3 style="margin: 0;">${candidate.first_name} ${candidate.last_name}</h3>
                                <p style="margin: 0; color: var(--text-light);">${candidate.job_title || 'Unknown Position'}</p>
                                <span class="status-badge ${candidate.status === 'interview_scheduled' ? 'status-review' : 'status-open'}">${candidate.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                            </div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                            <div class="form-group">
                                <label><i class="fas fa-envelope"></i> Email</label>
                                <p style="margin: 0; padding: 0.5rem; background: var(--bg); border-radius: 4px;">${candidate.email}</p>
                            </div>
                            <div class="form-group">
                                <label><i class="fas fa-phone"></i> Phone</label>
                                <p style="margin: 0; padding: 0.5rem; background: var(--bg); border-radius: 4px;">${candidate.phone || 'Not provided'}</p>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label><i class="fas fa-calendar"></i> Shortlisted Date</label>
                            <p style="margin: 0; padding: 0.5rem; background: var(--bg); border-radius: 4px;">${formatDate(candidate.shortlisted_at)}</p>
                        </div>
                        
                        ${candidate.interview_date ? `
                        <div class="form-group">
                            <label><i class="fas fa-calendar-check"></i> Interview Scheduled</label>
                            <p style="margin: 0; padding: 0.5rem; background: var(--bg); border-radius: 4px;">${formatDate(candidate.interview_date)}</p>
                        </div>
                        ` : ''}
                        
                        ${candidate.interview_notes ? `
                        <div class="form-group">
                            <label><i class="fas fa-sticky-note"></i> Interview Notes</label>
                            <div style="padding: 1rem; background: var(--bg); border-radius: 8px; white-space: pre-wrap;">${candidate.interview_notes}</div>
                        </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeCandidateDetailsModal()" style="width: auto;">Close</button>
                        ${candidate.status !== 'interview_scheduled' ? `
                            <button class="btn btn-primary" onclick="closeCandidateDetailsModal(); openScheduleInterviewModal(${candidate.id}, ${candidate.job_id || 0}, '${candidate.first_name} ${candidate.last_name}')" style="width: auto;">
                                <i class="fas fa-calendar-plus"></i> Schedule Interview
                            </button>
                        ` : ''}
                        <button class="btn btn-danger" onclick="closeCandidateDetailsModal(); rejectShortlisted(${candidate.id})" style="width: auto;">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('candidateDetailsModal');
        if (existingModal) existingModal.remove();
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
    } catch (error) {
        console.error('Failed to load candidate details:', error);
        showToast('Failed to load candidate details', 'error');
    }
}

function closeCandidateDetailsModal() {
    const modal = document.getElementById('candidateDetailsModal');
    if (modal) modal.remove();
}

function sendBiometricLink(candidateId) {
    showToast('Biometric verification link sent to candidate', 'success');
}

// Biometric Management
function resendBiometricLink(candidateId) {
    showToast('Biometric link resent successfully', 'success');
}

function verifyManually(candidateId) {
    showToast('Opening manual verification form...', 'success');
}

function proceedToSelection(candidateId) {
    showRecruitmentTab('selected', document.querySelectorAll('.recruitment-tab')[5]);
}

// Selected Candidate Actions
// Start onboarding for selected candidate
async function startOnboarding(candidateId) {
    if (!confirm('Start onboarding process for this candidate?')) return;
    
    try {
        showToast('Starting onboarding...', 'info');
        
        // Update onboarding status
        await recruitmentAPI.updateOnboarding(candidateId, 'initiated');
        
        // Get candidate details
        const result = await recruitmentAPI.getSelected();
        const candidate = result.selected.find(c => c.id === candidateId);
        
        if (candidate) {
            // Add to onboarding module (store in localStorage for now)
            const onboardingData = {
                id: candidateId,
                candidate_id: candidate.candidate_id,
                first_name: candidate.first_name,
                last_name: candidate.last_name,
                email: candidate.email,
                job_title: candidate.job_title,
                department: candidate.department,
                start_date: candidate.start_date,
                selected_at: candidate.selected_at,
                onboarding_started: new Date().toISOString(),
                status: 'in_progress',
                progress: 0
            };
            
            // Save to localStorage for onboarding module
            let onboardings = JSON.parse(localStorage.getItem('onboarding_candidates') || '[]');
            onboardings.push(onboardingData);
            localStorage.setItem('onboarding_candidates', JSON.stringify(onboardings));
            
            showToast('Onboarding started successfully!', 'success');
            
            // Refresh selected tab
            await loadSelected();
            
            // Ask if user wants to go to onboarding module
            if (confirm('Candidate added to onboarding. Go to Onboarding module?')) {
                showModule('onboarding', document.querySelector('[data-module="onboarding"]'));
            }
        }
    } catch (error) {
        console.error('Failed to start onboarding:', error);
        showToast('Failed to start onboarding: ' + (error.message || 'Unknown error'), 'error');
    }
}

function viewOnboarding(candidateId) {
    showModule('onboarding', document.querySelector('[data-module="onboarding"]'));
}

function viewFullProfile(candidateId) {
    showToast('Loading full candidate profile...', 'success');
}


// ==========================================
// SETUP WIZARD - First Time Organization Setup
// ==========================================

let currentSetupStep = 1;
let setupData = {
    organization: {},
    committees: [],
    members: []
};

// Check if setup is needed after login
async function checkSetupStatus() {
    try {
        const org = authAPI.getCurrentOrganization();
        if (!org) return;

        // Check if organization is fully set up
        const response = await api.get(`/organizations/${org.id}`);
        
        // If organization is new (created within last hour) or incomplete
        const orgCreated = new Date(response.organization.created_at);
        const hoursSinceCreated = (new Date() - orgCreated) / (1000 * 60 * 60);
        
        // Show wizard if org is new (< 24h) OR if setup is not completed
        const setupCompleted = localStorage.getItem(`setupCompleted_${org.id}`);
        const shouldShowWizard = (hoursSinceCreated < 24 && !setupCompleted) || org.setup_status === 'incomplete';
        
        if (shouldShowWizard) {
            await loadAndShowSetupWizard(org);
        } else {
            // Update getting started card on dashboard if it exists
            updateGettingStartedCard();
        }
    } catch (error) {
        console.log('Setup check skipped:', error);
    }
}

function updateGettingStartedCard() {
    const card = document.getElementById('gettingStartedCard');
    if (!card) return;
    
    const org = authAPI.getCurrentOrganization();
    if (!org) return;
    
    // Check which setup steps are complete
    const hasOrgDetails = org.name && org.billing_email;
    
    // Try to get committees to check if setup is done
    committeesAPI.getAll().then(data => {
        const hasCommittees = data.committees && data.committees.length > 0;
        
        // Update icons and text
        const orgIcon = document.getElementById('gs-org-icon');
        const orgText = document.getElementById('gs-org-text');
        const committeeIcon = document.getElementById('gs-committee-icon');
        const committeeText = document.getElementById('gs-committee-text');
        
        if (orgIcon && hasOrgDetails) {
            orgIcon.className = 'fas fa-check-circle';
            orgIcon.style.color = 'var(--success)';
            if (orgText) orgText.style.textDecoration = 'line-through';
        }
        
        if (committeeIcon && hasCommittees) {
            committeeIcon.className = 'fas fa-check-circle';
            committeeIcon.style.color = 'var(--success)';
            if (committeeText) committeeText.style.textDecoration = 'line-through';
        }
        
        // Show card if not fully set up
        const isFullySetUp = hasOrgDetails && hasCommittees;
        const dismissed = localStorage.getItem(`gettingStartedDismissed_${org.id}`);
        
        if (!isFullySetUp && !dismissed) {
            card.style.display = 'block';
        }
    }).catch(err => {
        console.log('Could not load committees for getting started:', err);
        // Still show the card
        const dismissed = localStorage.getItem(`gettingStartedDismissed_${org.id}`);
        if (!dismissed) {
            card.style.display = 'block';
        }
    });
}

function dismissGettingStarted() {
    const org = authAPI.getCurrentOrganization();
    if (org) {
        localStorage.setItem(`gettingStartedDismissed_${org.id}`, 'true');
    }
    const card = document.getElementById('gettingStartedCard');
    if (card) {
        card.style.display = 'none';
    }
}

async function loadAndShowSetupWizard(org) {
    try {
        console.log('Loading setup wizard...');
        
        // Fetch wizard HTML
        const response = await fetch('modules/setup-wizard.html');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        
        // Insert into container
        const container = document.getElementById('setupWizardContainer');
        if (!container) {
            throw new Error('Setup wizard container not found');
        }
        
        container.innerHTML = html;
        
        // Hide main app
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'none';
        
        // Show wizard container
        container.style.display = 'block';
        
        // Initialize wizard - show step 1
        document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.progress-steps .step').forEach(s => s.classList.remove('active', 'completed'));
        
        const step1 = document.getElementById('step1');
        if (step1) {
            step1.classList.add('active');
        }
        
        const progressStep1 = document.querySelector('.progress-steps .step[data-step="1"]');
        if (progressStep1) {
            progressStep1.classList.add('active');
        }
        
        // Pre-fill organization name if available
        setTimeout(() => {
            const nameInput = document.getElementById('setupOrgName');
            if (nameInput && org && org.name) {
                nameInput.value = org.name;
            }
            
            const emailInput = document.getElementById('setupOrgEmail');
            if (emailInput && org && org.billing_email) {
                emailInput.value = org.billing_email;
            }
        }, 100);
        
        console.log('Setup wizard loaded successfully');
    } catch (error) {
        console.error('Failed to load setup wizard:', error);
        showToast('Failed to load setup wizard. You can configure settings from the Admin panel.', 'error');
        // Show main app as fallback
        document.getElementById('appContainer').style.display = 'block';
    }
}

function goToStep(step) {
    // Hide all steps
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.progress-steps .step').forEach(s => s.classList.remove('active'));
    
    // Mark previous steps as completed
    document.querySelectorAll('.progress-steps .step').forEach((s, index) => {
        if (index < step - 1) {
            s.classList.add('completed');
        } else {
            s.classList.remove('completed');
        }
    });
    
    // Show current step
    document.getElementById(`step${step}`).classList.add('active');
    document.querySelector(`.progress-steps .step[data-step="${step}"]`).classList.add('active');
    
    currentSetupStep = step;
}

async function saveStep1() {
    console.log('saveStep1 called');
    
    const name = document.getElementById('setupOrgName')?.value?.trim();
    const website = document.getElementById('setupOrgWebsite')?.value?.trim();
    const email = document.getElementById('setupOrgEmail')?.value?.trim();
    const phone = document.getElementById('setupOrgPhone')?.value?.trim();
    const address = document.getElementById('setupOrgAddress')?.value?.trim();
    const domain = document.getElementById('setupOrgDomain')?.value?.trim();
    const slug = document.getElementById('setupOrgSlug')?.value?.trim();
    const description = document.getElementById('setupOrgDescription')?.value?.trim();

    console.log('Form values:', { name, email, slug });

    // Validation
    if (!name) {
        showToast('Please enter organization name', 'error');
        document.getElementById('setupOrgName')?.focus();
        return;
    }
    
    if (!email) {
        showToast('Please enter billing email', 'error');
        document.getElementById('setupOrgEmail')?.focus();
        return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('Please enter a valid email address', 'error');
        document.getElementById('setupOrgEmail')?.focus();
        return;
    }

    // Get term settings
    const defaultTermLength = document.getElementById('setupDefaultTermLength')?.value || 3;
    const maxConsecutiveTerms = document.getElementById('setupMaxConsecutiveTerms')?.value || 2;
    const renewalNotificationDays = document.getElementById('setupRenewalNotificationDays')?.value || 90;
    const autoRenewalPolicy = document.getElementById('setupAutoRenewal')?.value || 'chair_approval';
    const enableTermTracking = document.getElementById('setupEnableTermTracking')?.checked ?? true;

    setupData.organization = {
        name,
        website_url: website || null,
        billing_email: email,
        phone: phone || null,
        billing_address: address || null,
        custom_domain: domain || null,
        slug: slug || null,
        description: description || null,
        default_term_length: parseInt(defaultTermLength),
        max_consecutive_terms: parseInt(maxConsecutiveTerms),
        renewal_notification_days: parseInt(renewalNotificationDays),
        auto_renewal_policy: autoRenewalPolicy,
        enable_term_tracking: enableTermTracking ? 1 : 0
    };

    console.log('Setup data prepared:', setupData.organization);

    // Get current organization
    const org = authAPI.getCurrentOrganization();
    console.log('Current organization:', org);
    
    if (!org || !org.id) {
        showToast('Organization not found. Please log in again.', 'error');
        console.error('No organization found in authAPI.getCurrentOrganization()');
        return;
    }

    // Save to API
    try {
        console.log('Calling organizationsAPI.update with ID:', org.id);
        console.log('Data being sent:', setupData.organization);
        const result = await organizationsAPI.update(org.id, setupData.organization);
        console.log('Update successful:', result);
        showToast('Organization details saved!', 'success');
        goToStep(2);
    } catch (error) {
        console.error('SaveStep1 error:', error);
        // Try to extract more detailed error message
        let errorMsg = 'Failed to save organization details';
        if (error.message) {
            errorMsg = error.message;
        }
        if (error.error) {
            errorMsg = error.error;
        }
        showToast(errorMsg, 'error');
    }
}

async function saveStep2() {
    console.log('saveStep2 called');
    
    const selectedCommittees = [];
    
    // Get preset committees
    const presets = [
        { id: 'board', name: 'Board of Trustees', color: 'primary' },
        { id: 'finance', name: 'Finance & Audit', color: 'success' },
        { id: 'people', name: 'People & Remuneration', color: 'warning' },
        { id: 'fundraising', name: 'Fundraising', color: 'purple' },
        { id: 'safeguarding', name: 'Safeguarding', color: 'danger' },
        { id: 'property', name: 'Property & Assets', color: 'info' }
    ];

    presets.forEach(preset => {
        const checkboxId = `preset${preset.id.charAt(0).toUpperCase() + preset.id.slice(1)}`;
        const checkbox = document.getElementById(checkboxId);
        console.log(`Checking ${checkboxId}:`, checkbox?.checked);
        if (checkbox && checkbox.checked) {
            selectedCommittees.push({
                name: preset.name,
                description: getCommitteeDescription(preset.id),
                color_theme: preset.color
            });
        }
    });

    // Get custom committees
    document.querySelectorAll('.custom-committee-row').forEach(row => {
        const nameInput = row.querySelector('.custom-committee-name');
        const descInput = row.querySelector('.custom-committee-desc');
        const name = nameInput?.value?.trim();
        const description = descInput?.value?.trim();
        if (name) {
            selectedCommittees.push({
                name,
                description: description || '',
                color_theme: 'primary'
            });
        }
    });

    console.log('Selected committees:', selectedCommittees);

    if (selectedCommittees.length === 0) {
        showToast('Please select at least one committee', 'error');
        return;
    }

    setupData.committees = selectedCommittees;

    // Get organization
    const org = authAPI.getCurrentOrganization();
    if (!org || !org.id) {
        showToast('Organization not found. Please log in again.', 'error');
        return;
    }

    // Create committees via API
    try {
        console.log('Creating committees for org:', org.id);
        let createdCount = 0;
        for (const committee of selectedCommittees) {
            try {
                await committeesAPI.create(committee);
                createdCount++;
            } catch (err) {
                console.error('Failed to create committee:', committee.name, err);
            }
        }
        showToast(`${createdCount} committees created!`, 'success');
        goToStep(3);
    } catch (error) {
        console.error('SaveStep2 error:', error);
        showToast(error.message || 'Failed to create committees', 'error');
    }
}

function getCommitteeDescription(id) {
    const descriptions = {
        board: 'Main governing body of the organization',
        finance: 'Financial oversight and audit matters',
        people: 'HR, staffing, and compensation',
        fundraising: 'Development and fundraising strategy',
        safeguarding: 'Child and vulnerable adult protection',
        property: 'Facilities and asset management'
    };
    return descriptions[id] || '';
}

function addCustomCommittee() {
    const container = document.getElementById('customCommitteesList');
    const row = document.createElement('div');
    row.className = 'custom-committee-row form-row';
    row.innerHTML = `
        <div class="form-group">
            <input type="text" class="custom-committee-name" placeholder="Committee Name">
        </div>
        <div class="form-group">
            <input type="text" class="custom-committee-desc" placeholder="Description (optional)">
        </div>
        <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">
            <i class="fas fa-trash"></i>
        </button>
    `;
    container.appendChild(row);
}

async function saveStep3() {
    const members = [];
    
    // Collect manual entries
    document.querySelectorAll('.member-form-row').forEach(row => {
        const firstName = row.querySelector('.member-firstname').value;
        const lastName = row.querySelector('.member-lastname').value;
        const email = row.querySelector('.member-email').value;
        const role = row.querySelector('.member-role').value;
        
        if (firstName && lastName && email) {
            members.push({ firstName, lastName, email, role });
        }
    });

    // Check if skipping
    const skipInvites = document.getElementById('skipInvites');
    if (skipInvites && skipInvites.checked) {
        goToStep(4);
        return;
    }

    if (members.length === 0 && !setupData.csvMembers) {
        showToast('Please add at least one member or skip this step', 'error');
        return;
    }

    setupData.members = members;

    // Invite members via API
    try {
        const org = authAPI.getCurrentOrganization();
        const sendEmail = document.getElementById('sendEmailInvites')?.checked ?? true;
        
        let invitedCount = 0;
        let errorCount = 0;
        
        for (const member of members) {
            try {
                await organizationsAPI.inviteMember(org.id, {
                    email: member.email,
                    role: member.role,
                    first_name: member.firstName,
                    last_name: member.lastName
                });
                invitedCount++;
            } catch (memberError) {
                console.error(`Failed to invite ${member.email}:`, memberError);
                errorCount++;
                // Check if it's a limit error
                if (memberError.message && memberError.message.includes('limit')) {
                    showToast(`User limit reached for your plan. Consider upgrading.`, 'error');
                    return;
                }
            }
        }

        if (errorCount > 0) {
            showToast(`${invitedCount} members invited, ${errorCount} failed`, 'warning');
        } else {
            showToast(`${invitedCount} members invited!`, 'success');
        }
        
        goToStep(4);
        showSetupSummary();
    } catch (error) {
        console.error('Invite error:', error);
        showToast(error.message || 'Failed to invite members', 'error');
    }
}

function showSetupSummary() {
    const summary = document.getElementById('setupSummary');
    if (!summary) return;

    summary.innerHTML = `
        <h4>Setup Summary</h4>
        <div class="summary-item">
            <i class="fas fa-building"></i>
            <span><strong>Organization:</strong> ${setupData.organization.name}</span>
        </div>
        <div class="summary-item">
            <i class="fas fa-users-cog"></i>
            <span><strong>Committees:</strong> ${setupData.committees.length} created</span>
        </div>
        <div class="summary-item">
            <i class="fas fa-user-plus"></i>
            <span><strong>Members:</strong> ${setupData.members.length} invited</span>
        </div>
    `;
}

function completeSetup() {
    const org = authAPI.getCurrentOrganization();
    if (org) {
        localStorage.setItem(`setupCompleted_${org.id}`, 'true');
    }
    
    // Hide wizard, show app
    document.getElementById('setupWizardContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    
    showToast('Setup complete! Welcome to your portal.', 'success');
    
    // Refresh dashboard
    loadDashboardData();
}

// Debug function to test organization update API
async function debugTestOrgUpdate() {
    console.log('Testing organization update API...');
    
    const org = authAPI.getCurrentOrganization();
    if (!org) {
        console.error('No organization found');
        return;
    }
    
    const testData = {
        name: 'Test Organization ' + new Date().toISOString(),
        billing_email: 'test@test.com'
    };
    
    console.log('Sending test data:', testData);
    
    try {
        const result = await organizationsAPI.update(org.id, testData);
        console.log('Success:', result);
        showToast('Test update successful!', 'success');
    } catch (error) {
        console.error('Test failed:', error);
        showToast('Test failed: ' + error.message, 'error');
    }
}

// Debug function to force go to step 2 (skip step 1)
function debugForceStep2() {
    console.log('Forcing step 2...');
    
    // Save minimal data
    setupData.organization = {
        name: authAPI.getCurrentOrganization()?.name || 'My Organization',
        billing_email: 'admin@example.com'
    };
    
    goToStep(2);
}

function skipSetup() {
    if (confirm('Skip setup?\n\nYou can restart the setup wizard anytime from:\n• Admin → System Settings → Run Setup Wizard\n• Dashboard → Getting Started card\n\nContinue?')) {
        const org = authAPI.getCurrentOrganization();
        if (org) {
            localStorage.setItem(`setupCompleted_${org.id}`, 'true');
        }
        document.getElementById('setupWizardContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        
        // Show getting started card on dashboard
        setTimeout(() => {
            updateGettingStartedCard();
        }, 500);
    }
}

function switchImportTab(tab, btn) {
    // Update buttons
    document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    
    // Update content
    document.querySelectorAll('.import-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`import${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
}

function addMemberRow() {
    const container = document.getElementById('manualMembersList');
    const row = document.createElement('div');
    row.className = 'member-form-row';
    row.innerHTML = `
        <div class="form-group">
            <input type="text" placeholder="First Name" class="member-firstname">
        </div>
        <div class="form-group">
            <input type="text" placeholder="Last Name" class="member-lastname">
        </div>
        <div class="form-group">
            <input type="email" placeholder="Email Address" class="member-email">
        </div>
        <div class="form-group">
            <select class="member-role">
                <option value="trustee">Trustee</option>
                <option value="chair">Chair</option>
                <option value="secretary">Secretary</option>
                <option value="admin">Admin</option>
            </select>
        </div>
        <button class="btn btn-danger btn-sm" onclick="removeMemberRow(this)">
            <i class="fas fa-trash"></i>
        </button>
    `;
    container.appendChild(row);
    
    // Show delete buttons if more than one row
    const rows = container.querySelectorAll('.member-form-row');
    rows.forEach(r => {
        const btn = r.querySelector('.btn-danger');
        if (btn) btn.style.display = rows.length > 1 ? 'block' : 'none';
    });
}

function removeMemberRow(btn) {
    btn.closest('.member-form-row').remove();
    
    // Hide delete button if only one row left
    const container = document.getElementById('manualMembersList');
    const rows = container.querySelectorAll('.member-form-row');
    if (rows.length === 1) {
        rows[0].querySelector('.btn-danger').style.display = 'none';
    }
}

async function checkSlugAvailability() {
    const slug = document.getElementById('setupOrgSlug').value;
    const statusEl = document.getElementById('slugStatus');
    
    if (!slug) {
        statusEl.textContent = '';
        return;
    }
    
    try {
        const result = await organizationsAPI.checkSlug(slug);
        if (result.available) {
            statusEl.textContent = '✓ Available';
            statusEl.className = 'slug-status available';
        } else {
            statusEl.textContent = '✗ Already taken';
            statusEl.className = 'slug-status taken';
        }
    } catch (error) {
        statusEl.textContent = '';
    }
}

function downloadCSVTemplate() {
    const csv = 'first_name,last_name,email,role,committee\n' +
                'John,Smith,john@example.com,chair,Board of Trustees\n' +
                'Jane,Doe,jane@example.com,trustee,Finance & Audit';
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'member_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        const members = [];
        
        // Parse CSV (skip header)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const cols = line.split(',');
                if (cols.length >= 4) {
                    members.push({
                        firstName: cols[0],
                        lastName: cols[1],
                        email: cols[2],
                        role: cols[3],
                        committee: cols[4] || ''
                    });
                }
            }
        }
        
        setupData.csvMembers = members;
        
        // Show preview
        document.getElementById('csvPreview').style.display = 'block';
        document.getElementById('csvRowCount').textContent = members.length;
        
        // Build preview table
        const tbody = document.getElementById('csvPreviewTable');
        tbody.innerHTML = members.slice(0, 5).map(m => `
            <tr>
                <td>${m.firstName} ${m.lastName}</td>
                <td>${m.email}</td>
                <td>${m.role}</td>
            </tr>
        `).join('');
        
        if (members.length > 5) {
            tbody.innerHTML += `<tr><td colspan="3" style="text-align: center; color: var(--text-light);">... and ${members.length - 5} more</td></tr>`;
        }
    };
    reader.readAsText(file);
}


// ==========================================
// SETUP WIZARD DEBUG FUNCTIONS
// ==========================================

// ==========================================
// SETUP WIZARD DEBUG & MANUAL TRIGGER
// ==========================================

function resetSetup() {
    const org = authAPI.getCurrentOrganization();
    if (org) {
        localStorage.removeItem(`setupCompleted_${org.id}`);
        showToast('Setup reset for this organization. Refresh to see wizard.', 'success');
    } else {
        // Clear all setup flags
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('setupCompleted_')) {
                localStorage.removeItem(key);
            }
        });
        showToast('All setup flags cleared.', 'success');
    }
}

async function forceShowSetup() {
    console.log('Manually triggering setup wizard...');
    const org = authAPI.getCurrentOrganization();
    if (org) {
        localStorage.removeItem(`setupCompleted_${org.id}`);
        console.log('Organization found:', org);
        await loadAndShowSetupWizard(org);
    } else {
        showToast('Please login first', 'error');
        console.error('No organization found');
    }
}

// Debug function to test wizard without checking conditions
async function debugShowWizard() {
    console.log('Debug: Showing wizard directly...');
    const testOrg = {
        id: 1,
        name: 'Test Organization',
        billing_email: 'test@example.com'
    };
    await loadAndShowSetupWizard(testOrg);
}
