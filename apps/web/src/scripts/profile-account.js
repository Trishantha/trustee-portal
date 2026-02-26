/**
 * Profile & Account Module Functions
 * User profile management and account settings
 */

// ==========================================
// PROFILE MODULE
// ==========================================

function initProfileModule() {
    loadProfileData();
    
    // Setup bio character counter
    const bio = document.getElementById('profileBio');
    if (bio) {
        bio.addEventListener('input', updateBioCount);
    }
}

function updateBioCount() {
    const bio = document.getElementById('profileBio');
    const count = document.getElementById('bioCharCount');
    if (bio && count) {
        const len = bio.value.length;
        count.textContent = `${len} / 500 characters`;
        count.style.color = len > 500 ? '#ef4444' : '#94a3b8';
    }
}

async function loadProfileData() {
    try {
        // Check if user is authenticated (token stored as 'auth_token' by SaaS login)
        if (!api.isAuthenticated()) {
            showToast('Please login first', 'error');
            return;
        }
        
        // Get user data from API (SaaS endpoint) - includes both user profile AND membership details
        const response = await api.get('/auth/saas/me');
        const user = response.user || response;
        
        // Get membership details from the same response (if available)
        const membership = response.membership || {};
        
        // SYNC LOGIC: Use membership data as fallback if user profile fields are empty
        // This ensures organization admin details populate the profile
        const jobTitle = user.job_title || membership.title || '';
        const department = membership.department || '';
        
        // Populate hero section
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
        const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || '--';
        
        document.getElementById('profileDisplayName').textContent = fullName;
        document.getElementById('profileInitials').textContent = initials;
        document.getElementById('profileDisplayJob').textContent = jobTitle || 'No job title set';
        
        // Location display
        const location = [user.location_city, user.location_country].filter(Boolean).join(', ');
        document.getElementById('profileDisplayLocation').innerHTML = location 
            ? `<i class="fas fa-map-marker-alt"></i> ${location}`
            : `<i class="fas fa-map-marker-alt"></i> No location set`;
        
        // Role badge - use membership role if available
        const userRole = membership.role || user.role;
        const roleText = userRole === 'owner' ? 'Organization Owner' :
                        userRole === 'admin' ? 'Administrator' :
                        userRole === 'chair' ? 'Chair' :
                        userRole === 'secretary' ? 'Secretary' :
                        userRole === 'trustee' ? 'Trustee' : userRole;
        document.getElementById('profileDisplayRole').textContent = roleText;
        
        // Profile photo
        if (user.avatar) {
            document.getElementById('profileImage').src = user.avatar;
            document.getElementById('profileImage').style.display = 'block';
            document.getElementById('profilePhotoPlaceholder').style.display = 'none';
        }
        
        // Form fields - Personal Info
        document.getElementById('profileFirstName').value = user.first_name || '';
        document.getElementById('profileLastName').value = user.last_name || '';
        document.getElementById('profileJobTitle').value = jobTitle;
        document.getElementById('profileBio').value = user.bio || '';
        
        // Store department in a data attribute for syncing (add hidden field if needed)
        if (document.getElementById('profileDepartment')) {
            document.getElementById('profileDepartment').value = department;
        }
        
        updateBioCount();
        
        // Location
        document.getElementById('profileCity').value = user.location_city || '';
        document.getElementById('profileCountry').value = user.location_country || '';
        
        // Contact
        document.getElementById('profileEmail').value = user.email || '';
        document.getElementById('profilePhone').value = user.phone || '';
        document.getElementById('profileArea').value = user.area || '';
        document.getElementById('profileWebsite').value = user.website || '';
        
        // Social
        document.getElementById('profileLinkedIn').value = user.linkedin_url || '';
        document.getElementById('profileTwitter').value = user.twitter_url || '';
        document.getElementById('profileGitHub').value = user.github_url || '';
        
    } catch (error) {
        console.error('Failed to load profile:', error);
        showToast('Failed to load profile data', 'error');
    }
}

async function saveProfile() {
    try {
        // Collect all profile data
        const profileData = {
            first_name: document.getElementById('profileFirstName').value,
            last_name: document.getElementById('profileLastName').value,
            job_title: document.getElementById('profileJobTitle').value,
            bio: document.getElementById('profileBio').value,
            location_city: document.getElementById('profileCity').value,
            location_country: document.getElementById('profileCountry').value,
            phone: document.getElementById('profilePhone').value,
            area: document.getElementById('profileArea').value,
            website: document.getElementById('profileWebsite').value,
            linkedin_url: document.getElementById('profileLinkedIn').value,
            twitter_url: document.getElementById('profileTwitter').value,
            github_url: document.getElementById('profileGitHub').value
        };
        
        // Also sync department if field exists
        const deptField = document.getElementById('profileDepartment');
        if (deptField) {
            profileData.department = deptField.value;
        }
        
        // Send to API - this now syncs to BOTH users table AND organization_members table
        await api.put('/auth/saas/profile', profileData);
        
        showToast('Profile saved successfully!', 'success');
        
        // Refresh display
        loadProfileData();
        
        // Update header display
        updateUserDisplay();
        
    } catch (error) {
        console.error('Failed to save profile:', error);
        showToast(error.message || 'Failed to save profile', 'error');
    }
}

// ==========================================
// PROFILE PHOTO UPLOAD
// ==========================================

async function handleProfileImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        showToast('Image must be less than 5MB', 'error');
        return;
    }
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Only JPG, PNG, and GIF images are allowed', 'error');
        return;
    }
    
    try {
        showToast('Uploading photo...', 'info');
        
        // Create FormData
        const formData = new FormData();
        formData.append('avatar', file);
        
        // Upload to server
        const result = await fetch('/api/users/avatar', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: formData
        });
        
        const data = await result.json();
        
        if (!result.ok) {
            throw new Error(data.error || data.message || 'Upload failed');
        }
        
        // Update profile image display
        if (data.avatar_url) {
            document.getElementById('profileImage').src = data.avatar_url + '?t=' + Date.now();
            document.getElementById('profileImage').style.display = 'block';
            document.getElementById('profilePhotoPlaceholder').style.display = 'none';
            
            // Update header avatar
            updateHeaderAvatar(data.avatar_url);
        }
        
        showToast('Profile photo updated!', 'success');
        
    } catch (error) {
        console.error('Upload error:', error);
        showToast(error.message || 'Failed to upload photo', 'error');
    }
}

function updateHeaderAvatar(avatarUrl) {
    // Update the dropdown avatar if exists
    const img = document.getElementById('userAvatarImg');
    const placeholder = document.getElementById('userAvatarPlaceholder');
    
    if (img && avatarUrl) {
        img.src = avatarUrl;
        img.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    }
}

// ==========================================
// ACCOUNT MODULE
// ==========================================

function initAccountModule() {
    loadAccountData();
}

async function loadAccountData() {
    try {
        const user = await api.get('/users/me');
        
        // Email
        const emailEl = document.getElementById('accountEmail');
        const currentEmailEl = document.getElementById('currentEmailDisplay');
        if (emailEl) emailEl.textContent = user.email || 'Not set';
        if (currentEmailEl) currentEmailEl.value = user.email || '';
        
        // MFA status
        const mfaStatus = document.getElementById('mfaStatus');
        if (mfaStatus) {
            if (user.mfa_enabled) {
                mfaStatus.textContent = 'Enabled';
                mfaStatus.style.background = '#10b981';
            } else {
                mfaStatus.textContent = 'Not Enabled';
                mfaStatus.style.background = '#f59e0b';
            }
        }
        
        // Password last changed
        const pwdChanged = document.getElementById('passwordLastChanged');
        if (pwdChanged) {
            if (user.password_changed_at) {
                const date = new Date(user.password_changed_at);
                pwdChanged.textContent = date.toLocaleDateString();
            } else {
                pwdChanged.textContent = 'Never';
            }
        }
        
    } catch (error) {
        console.error('Failed to load account:', error);
    }
}

// ==========================================
// EMAIL CHANGE
// ==========================================

function openChangeEmailModal() {
    const modal = document.getElementById('changeEmailModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('newEmail').value = '';
        document.getElementById('emailChangePassword').value = '';
    }
}

function closeChangeEmailModal() {
    const modal = document.getElementById('changeEmailModal');
    if (modal) modal.style.display = 'none';
}

async function submitEmailChange() {
    const newEmail = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('emailChangePassword').value;
    
    if (!newEmail || !password) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    if (!newEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showToast('Please enter a valid email', 'error');
        return;
    }
    
    try {
        await api.post('/users/change-email', { 
            new_email: newEmail, 
            password 
        });
        
        showToast('Email updated! Please verify your new email.', 'success');
        closeChangeEmailModal();
        loadAccountData();
        
    } catch (error) {
        showToast(error.message || 'Failed to update email', 'error');
    }
}

// ==========================================
// PASSWORD CHANGE
// ==========================================

function openChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
    }
}

function closeChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    if (modal) modal.style.display = 'none';
}

async function submitPasswordChange() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    if (newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }
    
    try {
        await api.post('/users/change-password', {
            current_password: currentPassword,
            new_password: newPassword
        });
        
        showToast('Password updated successfully!', 'success');
        closeChangePasswordModal();
        loadAccountData();
        
    } catch (error) {
        showToast(error.message || 'Failed to update password', 'error');
    }
}

// ==========================================
// MFA SETUP
// ==========================================

function openMFASetupModal() {
    const modal = document.getElementById('mfaSetupModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('mfaCode').value = '';
    }
}

function closeMFASetupModal() {
    const modal = document.getElementById('mfaSetupModal');
    if (modal) modal.style.display = 'none';
}

async function submitMFASetup() {
    const code = document.getElementById('mfaCode').value.trim();
    
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
        showToast('Please enter a valid 6-digit code', 'error');
        return;
    }
    
    try {
        await api.post('/users/mfa/enable', { code });
        
        showToast('Two-factor authentication enabled!', 'success');
        closeMFASetupModal();
        loadAccountData();
        
    } catch (error) {
        showToast(error.message || 'Invalid code', 'error');
    }
}

// ==========================================
// ACCOUNT ACTIONS
// ==========================================

async function logoutAllDevices() {
    if (!confirm('This will log you out of all devices. Continue?')) {
        return;
    }
    
    try {
        await api.post('/auth/logout-all', {});
        showToast('Logged out of all devices', 'success');
        setTimeout(() => logout(), 1500);
    } catch (error) {
        showToast(error.message || 'Failed to logout', 'error');
    }
}

function openDeleteAccountModal() {
    const confirmed = confirm('⚠️ WARNING: This will permanently delete your account and all data.\n\nThis action CANNOT be undone.\n\nAre you sure you want to continue?');
    
    if (confirmed) {
        const confirmText = prompt('Type "DELETE MY ACCOUNT" to confirm:');
        if (confirmText === 'DELETE MY ACCOUNT') {
            deleteAccount();
        } else {
            showToast('Account deletion cancelled', 'info');
        }
    }
}

async function deleteAccount() {
    try {
        await api.delete('/users/account', {});
        showToast('Account deleted. Redirecting...', 'success');
        setTimeout(() => {
            localStorage.clear();
            window.location.href = '/login';
        }, 2000);
    } catch (error) {
        showToast(error.message || 'Failed to delete account', 'error');
    }
}

// ==========================================
// GLOBAL EXPORTS
// ==========================================

window.initProfileModule = initProfileModule;
window.initAccountModule = initAccountModule;
window.saveProfile = saveProfile;
window.handleProfileImageUpload = handleProfileImageUpload;

window.openChangeEmailModal = openChangeEmailModal;
window.closeChangeEmailModal = closeChangeEmailModal;
window.submitEmailChange = submitEmailChange;

window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.submitPasswordChange = submitPasswordChange;

window.openMFASetupModal = openMFASetupModal;
window.closeMFASetupModal = closeMFASetupModal;
window.submitMFASetup = submitMFASetup;

// ==========================================
// UPDATE HEADER DISPLAY
// ==========================================

function updateUserDisplay() {
    // Update user name in header dropdown
    const userNameEl = document.getElementById('userDropdownName');
    const userEmailEl = document.getElementById('userDropdownEmail');
    
    if (userNameEl) {
        const firstName = document.getElementById('profileFirstName')?.value || '';
        const lastName = document.getElementById('profileLastName')?.value || '';
        const fullName = `${firstName} ${lastName}`.trim() || 'User';
        userNameEl.textContent = fullName;
    }
    
    if (userEmailEl) {
        const email = document.getElementById('profileEmail')?.value || '';
        userEmailEl.textContent = email;
    }
    
    // Update avatar initials
    const avatarPlaceholder = document.getElementById('userAvatarPlaceholder');
    if (avatarPlaceholder) {
        const firstName = document.getElementById('profileFirstName')?.value || '';
        const lastName = document.getElementById('profileLastName')?.value || '';
        const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
        avatarPlaceholder.textContent = initials || '--';
    }
}

// Export for global access
window.updateUserDisplay = updateUserDisplay;

window.logoutAllDevices = logoutAllDevices;
window.openDeleteAccountModal = openDeleteAccountModal;
