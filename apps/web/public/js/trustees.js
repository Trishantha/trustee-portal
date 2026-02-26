/**
 * Trustees Module - Member Directory & Term Management
 */

let allTrustees = [];
let currentTrusteeFilter = '';
let currentView = 'cards'; // 'cards' or 'list'

// Load trustees when module is shown
async function loadTrustees() {
    try {
        // Check if module HTML is loaded (wait for it if necessary)
        const maxRetries = 10;
        let retries = 0;
        while (!document.getElementById('trusteesGrid') && retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }
        
        if (!document.getElementById('trusteesGrid')) {
            console.error('Trustees module HTML not loaded after retries');
            return;
        }
        
        const org = authAPI.getCurrentOrganization();
        if (!org) return;

        // Fetch members from API
        const response = await organizationsAPI.getMembers(org.id);
        allTrustees = response.members || [];

        // Calculate term data for each trustee
        allTrustees.forEach(trustee => {
            calculateTermStatus(trustee);
        });

        // Update stats
        updateTrusteeStats();

        // Display trustees
        displayTrustees();

        // Show/hide admin/chair only buttons
        const userRole = localStorage.getItem('user_role');
        document.querySelectorAll('.admin-chair-only').forEach(el => {
            if (userRole === 'owner' || userRole === 'admin' || userRole === 'chair') {
                el.style.display = 'inline-flex';
            } else {
                el.style.display = 'none';
            }
        });

        // Set default date for new trustee
        const startDateInput = document.getElementById('newTrusteeStartDate');
        if (startDateInput) {
            startDateInput.value = new Date().toISOString().split('T')[0];
        }

    } catch (error) {
        console.error('Failed to load trustees:', error);
        showToast('Failed to load trustees', 'error');
    }
}

function calculateTermStatus(trustee) {
    if (!trustee.term_start_date || !trustee.term_length_years) {
        trustee.term_status = 'unknown';
        return;
    }

    const startDate = new Date(trustee.term_start_date);
    const termLength = parseInt(trustee.term_length_years);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + termLength);

    const now = new Date();
    const daysUntilExpiry = Math.floor((endDate - now) / (1000 * 60 * 60 * 24));

    trustee.term_end_date = endDate.toISOString().split('T')[0];
    trustee.days_until_expiry = daysUntilExpiry;

    // Calculate term progress
    const totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    const daysElapsed = (now - startDate) / (1000 * 60 * 60 * 24);
    trustee.term_progress = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));

    if (daysUntilExpiry < 0) {
        trustee.term_status = 'expired';
    } else if (daysUntilExpiry <= 90) {
        trustee.term_status = 'ending';
    } else {
        trustee.term_status = 'active';
    }
}

function updateTrusteeStats() {
    const total = allTrustees.length;
    const ending = allTrustees.filter(t => t.term_status === 'ending').length;
    const expired = allTrustees.filter(t => t.term_status === 'expired').length;
    
    // Calculate average term length
    const trusteesWithTerms = allTrustees.filter(t => t.term_length_years);
    const avgTerm = trusteesWithTerms.length > 0 
        ? (trusteesWithTerms.reduce((sum, t) => sum + parseInt(t.term_length_years), 0) / trusteesWithTerms.length).toFixed(1)
        : '-';

    const totalEl = document.getElementById('totalTrustees');
    const endingEl = document.getElementById('termEndingSoon');
    const expiredEl = document.getElementById('termExpired');
    const avgEl = document.getElementById('avgTermLength');
    
    if (totalEl) totalEl.textContent = total;
    if (endingEl) endingEl.textContent = ending;
    if (expiredEl) expiredEl.textContent = expired;
    if (avgEl) avgEl.textContent = avgTerm;
}

function displayTrustees() {
    const grid = document.getElementById('trusteesGrid');
    const list = document.getElementById('trusteesList');
    const noMsg = document.getElementById('noTrusteesMsg');
    
    if (!grid || !list) {
        console.warn('trusteesGrid or trusteesList element not found');
        return;
    }
    
    let filtered = allTrustees;

    // Apply status filter
    if (currentTrusteeFilter) {
        filtered = filtered.filter(t => t.term_status === currentTrusteeFilter);
    }

    // Apply search filter
    const searchTerm = document.getElementById('trusteeSearch')?.value.toLowerCase() || '';
    if (searchTerm) {
        filtered = filtered.filter(t => 
            `${t.first_name} ${t.last_name}`.toLowerCase().includes(searchTerm) ||
            t.email.toLowerCase().includes(searchTerm) ||
            (t.department && t.department.toLowerCase().includes(searchTerm))
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = '';
        list.style.display = 'none';
        noMsg.style.display = 'block';
        return;
    }

    noMsg.style.display = 'none';

    // Show/hide based on current view
    if (currentView === 'cards') {
        grid.style.display = 'grid';
        list.style.display = 'none';
        displayCardView(filtered);
    } else {
        grid.style.display = 'none';
        list.style.display = 'block';
        displayListView(filtered);
    }
}

function displayCardView(filtered) {
    const grid = document.getElementById('trusteesGrid');
    
    grid.innerHTML = filtered.map(trustee => {
        const initials = `${trustee.first_name[0]}${trustee.last_name[0]}`.toUpperCase();
        const statusClass = trustee.term_status === 'expired' ? 'term-expired' : 
                           trustee.term_status === 'ending' ? 'term-ending' : '';
        const progressClass = trustee.term_status === 'expired' ? 'expired' : 
                             trustee.term_status === 'ending' ? 'ending' : '';
        
        let statusBadge = '';
        if (trustee.term_status === 'expired') {
            statusBadge = '<span class="term-status expired"><i class="fas fa-exclamation-circle"></i> Term Expired</span>';
        } else if (trustee.term_status === 'ending') {
            statusBadge = `<span class="term-status ending"><i class="fas fa-clock"></i> ${trustee.days_until_expiry} days left</span>`;
        } else if (trustee.term_status === 'active') {
            statusBadge = '<span class="term-status active"><i class="fas fa-check-circle"></i> Active</span>';
        }

        return `
            <div class="trustee-card ${statusClass}" onclick="openTrusteeDetail(${trustee.id})">
                <div class="trustee-header">
                    <div class="trustee-avatar">${initials}</div>
                    <div class="trustee-info">
                        <h4>${trustee.first_name} ${trustee.last_name}</h4>
                        <p>${trustee.email}</p>
                        <span class="trustee-role ${trustee.role}">${trustee.role}</span>
                    </div>
                </div>
                
                ${trustee.department ? `<p style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.5rem;"><i class="fas fa-briefcase"></i> ${trustee.department}</p>` : ''}
                
                <div class="trustee-term">
                    <div class="term-info">
                        <span class="term-label">Term:</span>
                        <span class="term-value">${trustee.term_length_years || '-'} Years</span>
                    </div>
                    ${trustee.term_end_date ? `
                        <div class="term-info">
                            <span class="term-label">Ends:</span>
                            <span class="term-value">${formatDate(trustee.term_end_date)}</span>
                        </div>
                        <div class="term-progress">
                            <div class="term-progress-bar">
                                <div class="term-progress-fill ${progressClass}" style="width: ${trustee.term_progress || 0}%"></div>
                            </div>
                        </div>
                        ${statusBadge}
                    ` : '<p style="font-size: 0.8rem; color: var(--text-light); margin-top: 0.5rem;">No term set</p>'}
                </div>
                
                <div class="trustee-actions">
                    <button class="btn btn-secondary" onclick="event.stopPropagation(); sendMessageToTrustee(${trustee.id})">
                        <i class="fas fa-envelope"></i> Message
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function filterTrustees() {
    const filterValue = document.getElementById('trusteeFilter')?.value || '';
    
    // Map filter values to term_status values
    const filterMap = {
        'term-ending': 'ending',
        'active': 'active',
        'expired': 'expired'
    };
    
    currentTrusteeFilter = filterMap[filterValue] || '';
    displayTrustees();
}

function switchView(view) {
    currentView = view;
    
    // Update button states
    document.getElementById('cardViewBtn')?.classList.toggle('active', view === 'cards');
    document.getElementById('listViewBtn')?.classList.toggle('active', view === 'list');
    
    // Re-display trustees with new view
    displayTrustees();
}

function displayListView(filtered) {
    const listBody = document.getElementById('trusteesListBody');
    if (!listBody) return;
    
    listBody.innerHTML = filtered.map(trustee => {
        const initials = `${trustee.first_name[0]}${trustee.last_name[0]}`.toUpperCase();
        const statusClass = trustee.term_status === 'expired' ? 'term-expired' : 
                           trustee.term_status === 'ending' ? 'term-ending' : '';
        const progressClass = trustee.term_status === 'expired' ? 'expired' : 
                             trustee.term_status === 'ending' ? 'ending' : '';
        const dateClass = trustee.term_status === 'expired' ? 'expired' : 
                         trustee.term_status === 'ending' ? 'ending' : '';
        
        let statusBadge = '';
        if (trustee.term_status === 'expired') {
            statusBadge = '<span class="list-status-badge expired"><i class="fas fa-exclamation-circle"></i> Expired</span>';
        } else if (trustee.term_status === 'ending') {
            statusBadge = `<span class="list-status-badge ending"><i class="fas fa-clock"></i> ${trustee.days_until_expiry} days left</span>`;
        } else if (trustee.term_status === 'active') {
            statusBadge = '<span class="list-status-badge active"><i class="fas fa-check-circle"></i> Active</span>';
        } else {
            statusBadge = '<span class="list-status-badge"><i class="fas fa-minus-circle"></i> No term</span>';
        }
        
        const progressHtml = trustee.term_end_date ? `
            <div class="list-progress" title="${Math.round(trustee.term_progress || 0)}% complete">
                <div class="list-progress-fill ${progressClass}" style="width: ${trustee.term_progress || 0}%"></div>
            </div>
        ` : '';

        const userRole = localStorage.getItem('user_role');
        const canRenew = ['owner', 'admin', 'chair'].includes(userRole) && trustee.term_end_date;

        return `
            <div class="list-item ${statusClass}" onclick="openTrusteeDetail(${trustee.id})">
                <div class="list-col-member">
                    <div class="list-member">
                        <div class="list-member-avatar">${initials}</div>
                        <div class="list-member-info">
                            <h4>${trustee.first_name} ${trustee.last_name}</h4>
                            <p>${trustee.email}</p>
                        </div>
                    </div>
                </div>
                <div class="list-col-role">
                    <span class="list-role ${trustee.role}">${trustee.role}</span>
                </div>
                <div class="list-col-dept">
                    <span class="list-dept">${trustee.department || '-'}</span>
                </div>
                <div class="list-col-status">
                    <div class="list-status">
                        ${statusBadge}
                        ${progressHtml}
                    </div>
                </div>
                <div class="list-col-ends">
                    <span class="list-date ${dateClass}">${trustee.term_end_date ? formatDate(trustee.term_end_date) : '-'}</span>
                </div>
                <div class="list-col-actions">
                    <div class="list-actions" onclick="event.stopPropagation();">
                        <button class="btn btn-secondary" onclick="sendMessageToTrustee(${trustee.id})" title="Send Message">
                            <i class="fas fa-envelope"></i>
                        </button>
                        ${canRenew ? `
                            <button class="btn btn-primary" onclick="openRenewTermModal(${trustee.id})" title="Renew Term">
                                <i class="fas fa-sync"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openTrusteeDetail(trusteeId) {
    const trustee = allTrustees.find(t => t.id === trusteeId);
    if (!trustee) return;

    const initials = `${trustee.first_name[0]}${trustee.last_name[0]}`.toUpperCase();
    const content = document.getElementById('trusteeDetailContent');
    
    let termHtml = '';
    if (trustee.term_start_date && trustee.term_length_years) {
        const statusColor = trustee.term_status === 'expired' ? 'var(--danger)' : 
                           trustee.term_status === 'ending' ? 'var(--warning)' : 'var(--success)';
        termHtml = `
            <div style="background: var(--bg-light); padding: 1rem; border-radius: 8px; margin-top: 1rem;">
                <h4 style="margin-bottom: 1rem;">Term Information</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                    <div>
                        <span style="color: var(--text-light);">Start Date:</span>
                        <p style="font-weight: 500;">${formatDate(trustee.term_start_date)}</p>
                    </div>
                    <div>
                        <span style="color: var(--text-light);">End Date:</span>
                        <p style="font-weight: 500; color: ${statusColor};">${formatDate(trustee.term_end_date)}</p>
                    </div>
                    <div>
                        <span style="color: var(--text-light);">Term Length:</span>
                        <p style="font-weight: 500;">${trustee.term_length_years} Years</p>
                    </div>
                    <div>
                        <span style="color: var(--text-light);">Status:</span>
                        <p style="font-weight: 500; color: ${statusColor}; text-transform: capitalize;">${trustee.term_status}</p>
                    </div>
                </div>
            </div>
        `;
    }

    content.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1.5rem;">
            <div class="trustee-avatar" style="width: 80px; height: 80px; font-size: 2rem;">${initials}</div>
            <div>
                <h3 style="margin-bottom: 0.25rem;">${trustee.first_name} ${trustee.last_name}</h3>
                <p style="color: var(--text-light);">${trustee.email}</p>
                <span class="trustee-role ${trustee.role}" style="margin-top: 0.5rem;">${trustee.role}</span>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div>
                <span style="color: var(--text-light); font-size: 0.9rem;">Department:</span>
                <p>${trustee.department || '-'}</p>
            </div>
            <div>
                <span style="color: var(--text-light); font-size: 0.9rem;">Joined:</span>
                <p>${trustee.joined_at ? formatDate(trustee.joined_at) : '-'}</p>
            </div>
        </div>
        
        ${termHtml}
    `;

    window.currentTrusteeId = trusteeId;
    document.getElementById('trusteeDetailModal').style.display = 'flex';
}

function closeTrusteeDetailModal() {
    document.getElementById('trusteeDetailModal').style.display = 'none';
    window.currentTrusteeId = null;
}

function sendMessageToTrustee(trusteeId) {
    const trustee = allTrustees.find(t => t.id === trusteeId);
    if (!trustee) return;

    // Open messaging module with this user
    showModule('messaging', document.querySelector('[data-module="messaging"]'));
    
    // Set up direct message (would need messaging API integration)
    showToast(`Opening message to ${trustee.first_name}...`, 'success');
}

function openAddTrusteeModal() {
    document.getElementById('addTrusteeModal').style.display = 'flex';
}

function closeAddTrusteeModal() {
    document.getElementById('addTrusteeModal').style.display = 'none';
    
    // Clear inputs
    document.getElementById('newTrusteeFirstName').value = '';
    document.getElementById('newTrusteeLastName').value = '';
    document.getElementById('newTrusteeEmail').value = '';
    document.getElementById('newTrusteeDepartment').value = '';
}

async function submitNewTrustee() {
    const firstName = document.getElementById('newTrusteeFirstName').value;
    const lastName = document.getElementById('newTrusteeLastName').value;
    const email = document.getElementById('newTrusteeEmail').value;
    const role = document.getElementById('newTrusteeRole').value;
    const department = document.getElementById('newTrusteeDepartment').value;
    const termLength = document.getElementById('newTrusteeTermLength').value;
    const startDate = document.getElementById('newTrusteeStartDate').value;

    if (!firstName || !lastName || !email || !startDate) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    try {
        const org = authAPI.getCurrentOrganization();
        
        await organizationsAPI.inviteMember(org.id, {
            email: email,
            role: role,
            first_name: firstName,
            last_name: lastName,
            department: department,
            term_length_years: termLength,
            term_start_date: startDate
        });

        showToast('Trustee added successfully!', 'success');
        closeAddTrusteeModal();
        loadTrustees(); // Refresh list
    } catch (error) {
        showToast(error.message || 'Failed to add trustee', 'error');
    }
}

async function removeTrustee() {
    if (!window.currentTrusteeId) return;
    
    const trustee = allTrustees.find(t => t.id === window.currentTrusteeId);
    if (!trustee) return;

    if (!confirm(`Are you sure you want to remove ${trustee.first_name} ${trustee.last_name}?`)) {
        return;
    }

    try {
        const org = authAPI.getCurrentOrganization();
        await organizationsAPI.removeMember(org.id, trustee.id);
        
        showToast('Trustee removed successfully', 'success');
        closeTrusteeDetailModal();
        loadTrustees(); // Refresh list
    } catch (error) {
        showToast(error.message || 'Failed to remove trustee', 'error');
    }
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Check for term notifications (called periodically)
async function checkTermNotifications() {
    try {
        const org = authAPI.getCurrentOrganization();
        if (!org) return;

        const response = await api.get(`/organizations/${org.id}/term-notifications`);
        
        if (response.notifications && response.notifications.length > 0) {
            // Show notification badge
            const trusteesNav = document.querySelector('[data-module="trustees"]');
            if (trusteesNav) {
                const existingBadge = trusteesNav.querySelector('.nav-badge');
                if (existingBadge) {
                    existingBadge.textContent = response.notifications.length;
                } else {
                    const badge = document.createElement('span');
                    badge.className = 'nav-badge';
                    badge.textContent = response.notifications.length;
                    trusteesNav.appendChild(badge);
                }
            }
        }
    } catch (error) {
        console.log('Term notification check failed:', error);
    }
}

// Renewal functions
let renewTrusteeId = null;

function openRenewTermModal(trusteeId) {
    renewTrusteeId = trusteeId;
    const trustee = allTrustees.find(t => t.id === trusteeId);
    if (!trustee) return;
    
    document.getElementById('renewTrusteeName').textContent = `${trustee.first_name} ${trustee.last_name}`;
    document.getElementById('renewCurrentEndDate').textContent = trustee.term_end_date 
        ? new Date(trustee.term_end_date).toLocaleDateString()
        : 'Not set';
    document.getElementById('renewTermLength').value = trustee.term_length_years || 3;
    document.getElementById('renewNotes').value = '';
    
    document.getElementById('renewTermModal').style.display = 'flex';
}

function closeRenewTermModal() {
    document.getElementById('renewTermModal').style.display = 'none';
    renewTrusteeId = null;
}

async function submitTermRenewal() {
    if (!renewTrusteeId) return;
    
    const termLength = document.getElementById('renewTermLength').value;
    const notes = document.getElementById('renewNotes').value;
    
    try {
        const org = authAPI.getCurrentOrganization();
        const response = await api.post(`/organizations/${org.id}/members/${renewTrusteeId}/renew-term`, {
            term_length_years: parseInt(termLength),
            notes: notes
        });
        
        showToast(`Term renewed successfully`, 'success');
        closeRenewTermModal();
        loadTrustees();
    } catch (error) {
        showToast(error.message || 'Failed to renew term', 'error');
    }
}

// Load trustees when module is shown
document.addEventListener('DOMContentLoaded', function() {
    const trusteeNav = document.querySelector('[data-module="trustees"]');
    if (trusteeNav) {
        trusteeNav.addEventListener('click', loadTrustees);
    }
});
