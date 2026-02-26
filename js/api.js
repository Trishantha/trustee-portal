/**
 * Trustee Portal API Client
 * Connects the frontend to the Node.js/Express backend
 */

// API base URL - auto-detect backend location
// If accessed via file://, default to localhost:3001
// Otherwise use relative path (same host:port)
const API_BASE_URL = (window.location.protocol === 'file:') 
    ? 'http://localhost:3001/api'
    : '/api';

// API Client class
class ApiClient {
    constructor() {
        this.token = localStorage.getItem('auth_token');
    }

    // Set auth token
    setToken(token) {
        this.token = token;
        localStorage.setItem('auth_token', token);
    }

    // Clear auth token
    clearToken() {
        this.token = null;
        localStorage.removeItem('auth_token');
    }

    // Check if authenticated
    isAuthenticated() {
        return !!this.token;
    }

    // Make API request
    async request(method, endpoint, data = null) {
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (this.token) {
            options.headers['Authorization'] = `Bearer ${this.token}`;
        }

        // Add organization ID header if available
        const currentOrg = localStorage.getItem('current_organization');
        if (currentOrg) {
            try {
                const org = JSON.parse(currentOrg);
                if (org && org.id) {
                    options.headers['X-Organization-ID'] = org.id;
                }
            } catch (e) {
                // Ignore parse errors
            }
        }

        if (data) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response:', text.substring(0, 200));
                throw new Error('Server returned non-JSON response. Is the backend running?');
            }
            
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `HTTP ${response.status}`);
            }

            return result;
        } catch (error) {
            console.error(`API Error (${method} ${endpoint}):`, error);
            throw error;
        }
    }

    // GET request
    get(endpoint) {
        return this.request('GET', endpoint);
    }

    // POST request
    post(endpoint, data) {
        return this.request('POST', endpoint, data);
    }

    // PUT request
    put(endpoint, data) {
        return this.request('PUT', endpoint, data);
    }

    // DELETE request
    delete(endpoint) {
        return this.request('DELETE', endpoint);
    }
}

// Create global API client instance
const api = new ApiClient();

// Health check on startup - logs helpful message if backend is unreachable
api.get('/health')
    .then(() => console.log('✅ Backend connection OK'))
    .catch(() => console.error('❌ Backend not reachable. Make sure to run: ./start.sh and open http://localhost:3001'));

// ==================== AUTH API ====================
// Updated for SaaS - supports multi-tenant organization authentication

const authAPI = {
    // SaaS Login with organization support
    login: async (email, password, organizationId = null) => {
        const result = await api.post('/auth/saas/login', { email, password, organization_id: organizationId });
        if (result.token) {
            api.setToken(result.token);
            // Store organization info
            if (result.organization) {
                localStorage.setItem('current_organization', JSON.stringify(result.organization));
                localStorage.setItem('user_role', result.role);
            }
        }
        return result;
    },

    // SaaS Registration - creates organization + user
    register: async (userData) => {
        return api.post('/auth/saas/register', userData);
    },

    // Select organization (for users with multiple orgs)
    selectOrganization: async (organizationId) => {
        const result = await api.post('/auth/saas/select-organization', { organization_id: organizationId });
        if (result.token) {
            api.setToken(result.token);
            if (result.organization) {
                localStorage.setItem('current_organization', JSON.stringify(result.organization));
                localStorage.setItem('user_role', result.role);
            }
        }
        return result;
    },

    // Get current organization
    getCurrentOrganization: () => {
        const org = localStorage.getItem('current_organization');
        return org ? JSON.parse(org) : null;
    },

    // Get user's organizations
    getMyOrganizations: () => {
        return api.get('/organizations/my');
    },

    logout: () => {
        api.clearToken();
        localStorage.removeItem('current_organization');
        localStorage.removeItem('user_role');
        return Promise.resolve({ message: 'Logged out' });
    },

    getCurrentUser: () => {
        return api.get('/auth/saas/me');
    },

    updateProfile: (data) => {
        return api.put('/auth/saas/profile', data);
    },

    changePassword: (currentPassword, newPassword) => {
        return api.post('/auth/change-password', { currentPassword, newPassword });
    },

    // Forgot password
    forgotPassword: (email) => {
        return api.post('/auth/saas/forgot-password', { email });
    },

    // Reset password
    resetPassword: (token, password) => {
        return api.post('/auth/saas/reset-password', { token, password });
    }
};

// ==================== ORGANIZATIONS API (SaaS) ====================

const organizationsAPI = {
    // Create new organization
    create: (data) => {
        return api.post('/organizations', data);
    },

    // Check if slug is available
    checkSlug: (slug) => {
        return api.get(`/organizations/check-slug/${slug}`);
    },

    // Get my organizations
    getMyOrganizations: () => {
        return api.get('/organizations/my');
    },

    // Get organization by ID
    getById: (id) => {
        return api.get(`/organizations/${id}`);
    },

    // Update organization
    update: (id, data) => {
        return api.put(`/organizations/${id}`, data);
    },

    // Get organization members
    getMembers: (id) => {
        return api.get(`/organizations/${id}/members`);
    },

    // Invite member
    inviteMember: (id, data) => {
        return api.post(`/organizations/${id}/members`, data);
    },

    // Update member
    updateMember: (orgId, memberId, data) => {
        return api.put(`/organizations/${orgId}/members/${memberId}`, data);
    },

    // Remove member
    removeMember: (orgId, memberId) => {
        return api.delete(`/organizations/${orgId}/members/${memberId}`);
    },

    // Get SaaS info (plans, pricing)
    getSaasInfo: () => {
        return api.get('/saas/info');
    }
};

// ==================== USERS API ====================

const usersAPI = {
    getAll: (filters = {}) => {
        const params = new URLSearchParams(filters).toString();
        return api.get(`/users?${params}`);
    },

    getById: (id) => {
        return api.get(`/users/${id}`);
    },

    create: (data) => {
        return api.post('/users', data);
    },

    update: (id, data) => {
        return api.put(`/users/${id}`, data);
    },

    delete: (id) => {
        return api.delete(`/users/${id}`);
    },

    resetPassword: (id, newPassword) => {
        return api.post(`/users/${id}/reset-password`, { newPassword });
    }
};

// ==================== COMMITTEES API ====================

const committeesAPI = {
    getAll: () => {
        return api.get('/committees');
    },

    getById: (id) => {
        return api.get(`/committees/${id}`);
    },

    create: (data) => {
        return api.post('/committees', data);
    },

    update: (id, data) => {
        return api.put(`/committees/${id}`, data);
    },

    delete: (id) => {
        return api.delete(`/committees/${id}`);
    },

    addMember: (committeeId, userId, roleInCommittee = 'member') => {
        return api.post(`/committees/${committeeId}/members`, { userId, roleInCommittee });
    },

    removeMember: (committeeId, userId) => {
        return api.delete(`/committees/${committeeId}/members/${userId}`);
    }
};

// ==================== MEETINGS API ====================

const meetingsAPI = {
    getAll: (filters = {}) => {
        const params = new URLSearchParams(filters).toString();
        return api.get(`/meetings?${params}`);
    },

    getById: (id) => {
        return api.get(`/meetings/${id}`);
    },

    create: (data) => {
        return api.post('/meetings', data);
    },

    update: (id, data) => {
        return api.put(`/meetings/${id}`, data);
    },

    delete: (id) => {
        return api.delete(`/meetings/${id}`);
    },

    rsvp: (meetingId, status) => {
        return api.put(`/meetings/${meetingId}/rsvp`, { status });
    },

    addAttendee: (meetingId, userId) => {
        return api.post(`/meetings/${meetingId}/attendees`, { userId });
    }
};

// ==================== TASKS API ====================

const tasksAPI = {
    getAll: (filters = {}) => {
        const params = new URLSearchParams(filters).toString();
        return api.get(`/tasks?${params}`);
    },

    getById: (id) => {
        return api.get(`/tasks/${id}`);
    },

    create: (data) => {
        return api.post('/tasks', data);
    },

    update: (id, data) => {
        return api.put(`/tasks/${id}`, data);
    },

    delete: (id) => {
        return api.delete(`/tasks/${id}`);
    },

    complete: (id) => {
        return api.post(`/tasks/${id}/complete`);
    }
};

// ==================== RECRUITMENT API ====================

const recruitmentAPI = {
    // Jobs
    getJobs: (filters = {}) => {
        const params = new URLSearchParams(filters).toString();
        return api.get(`/recruitment/jobs?${params}`);
    },

    getJob: (id) => {
        // Public endpoint - for applicants
        return api.get(`/recruitment/jobs/${id}`);
    },

    getJobDetails: (id) => {
        // Admin endpoint - includes applications
        return api.get(`/recruitment/jobs/${id}/details`);
    },

    getApplicationUrl: (jobId) => {
        // Generate the public application URL for a job
        const baseUrl = window.location.origin;
        return `${baseUrl}/apply.html?job=${jobId}`;
    },

    createJob: (data) => {
        return api.post('/recruitment/jobs', data);
    },

    updateJob: (id, data) => {
        return api.put(`/recruitment/jobs/${id}`, data);
    },

    closeJob: (id) => {
        return api.post(`/recruitment/jobs/${id}/close`);
    },

    deleteJob: (id) => {
        return api.delete(`/recruitment/jobs/${id}`);
    },

    // Applications
    getApplications: (filters = {}) => {
        const params = new URLSearchParams(filters).toString();
        return api.get(`/recruitment/applications?${params}`);
    },

    submitApplication: (data) => {
        return api.post('/recruitment/apply', data);
    },

    updateApplicationStatus: (id, status) => {
        return api.put(`/recruitment/applications/${id}/status`, { status });
    },

    // Shortlisted
    getShortlisted: () => {
        return api.get('/recruitment/shortlisted');
    },

    getShortlistedByJob: (jobId) => {
        return api.get(`/recruitment/shortlisted?jobId=${jobId}`);
    },

    scheduleInterview: (id, interviewDate, notes) => {
        return api.put(`/recruitment/shortlisted/${id}/interview`, { interviewDate, notes });
    },

    updateScore: (id, panelScore, status) => {
        return api.put(`/recruitment/shortlisted/${id}/score`, { panelScore, status });
    },

    // Selected
    getSelected: () => {
        return api.get('/recruitment/selected');
    },

    selectCandidate: (candidateId, startDate) => {
        return api.post('/recruitment/selected', { candidateId, startDate });
    },

    acceptOffer: (id) => {
        return api.put(`/recruitment/selected/${id}/offer-accepted`);
    },

    updateOnboarding: (id, status) => {
        return api.put(`/recruitment/selected/${id}/onboarding`, { status });
    }
};

// ==================== DASHBOARD API ====================

const dashboardAPI = {
    getStats: () => {
        return api.get('/dashboard');
    },

    getCalendar: (month, year) => {
        return api.get(`/dashboard/calendar?month=${month}&year=${year}`);
    },

    getActivity: () => {
        return api.get('/dashboard/activity');
    }
};

// Export all API modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        api,
        authAPI,
        organizationsAPI,
        usersAPI,
        committeesAPI,
        meetingsAPI,
        tasksAPI,
        recruitmentAPI,
        dashboardAPI
    };
}
