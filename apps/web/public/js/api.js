/**
 * Trustee Portal API Client
 * Secure cookie-based authentication (XSS protected)
 * Tokens are stored in httpOnly cookies, not localStorage
 */

// API base URL - backend runs on port 3001
// Always use localhost:3001 for API (backend port)
const API_BASE_URL = 'http://localhost:3001/api';

// CSRF token storage (not authentication tokens!)
let csrfToken = null;

// API Client class
class ApiClient {
    constructor() {
        // No token storage - tokens are in httpOnly cookies
        this.csrfToken = null;
    }

    /**
     * Fetch CSRF token from server
     * Required for state-changing operations (POST, PUT, DELETE)
     */
    async fetchCsrfToken() {
        try {
            const response = await fetch(`${API_BASE_URL}/csrf-token`, {
                method: 'GET',
                credentials: 'include' // Important: include cookies
            });
            const data = await response.json();
            if (data.csrfToken) {
                this.csrfToken = data.csrfToken;
            }
        } catch (error) {
            console.warn('Failed to fetch CSRF token:', error);
        }
    }

    /**
     * Check if user is authenticated
     * Makes a lightweight call to verify session
     */
    async isAuthenticated() {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/me`, {
                method: 'GET',
                credentials: 'include'
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Make API request
     * Automatically includes cookies and CSRF token
     */
    async request(method, endpoint, data = null) {
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method,
            credentials: 'include', // Critical: sends httpOnly cookies
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // Add CSRF token for state-changing operations
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
            if (!this.csrfToken) {
                await this.fetchCsrfToken();
            }
            if (this.csrfToken) {
                options.headers['X-CSRF-Token'] = this.csrfToken;
            }
        }

        // Add organization ID header if available
        const currentOrg = sessionStorage.getItem('current_organization');
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
            
            // Handle 401 - Token expired or invalid
            if (response.status === 401) {
                // Try to refresh token
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    // Retry original request
                    return this.request(method, endpoint, data);
                } else {
                    // Redirect to login
                    this.redirectToLogin();
                    throw new Error('Session expired');
                }
            }
            
            // Get response text first to check what we received
            const responseText = await response.text();
            
            // Try to parse as JSON
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                // Not valid JSON - could be HTML error page
                console.error('Non-JSON response:', responseText.substring(0, 500));
                
                if (!response.ok) {
                    // HTTP error with HTML response
                    if (response.status === 404) {
                        throw new Error(`API endpoint not found: ${endpoint}`);
                    } else if (response.status === 500) {
                        throw new Error('Server error. Please try again later.');
                    } else if (response.status === 503) {
                        throw new Error('Service unavailable. Please try again later.');
                    } else {
                        throw new Error(`Server error (${response.status}). Please try again.`);
                    }
                } else {
                    throw new Error('Invalid server response format');
                }
            }

            if (!response.ok) {
                // Handle specific error codes
                if (result.error?.code === 'TOKEN_EXPIRED') {
                    this.redirectToLogin();
                }
                throw new Error(result.error?.message || result.message || `HTTP ${response.status}`);
            }

            return result;
        } catch (error) {
            // Handle network errors (server not running, CORS, etc.)
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                console.error(`Network error (${method} ${endpoint}):`, error);
                throw new Error('Cannot connect to server. Please check if the backend is running.');
            }
            
            // Re-throw already processed errors
            if (error.message.includes('API endpoint not found') ||
                error.message.includes('Server error') ||
                error.message.includes('Session expired') ||
                error.message.includes('Cannot connect to server')) {
                throw error;
            }
            
            console.error(`API Error (${method} ${endpoint}):`, error);
            throw error;
        }
    }

    /**
     * Refresh access token using refresh token cookie
     */
    async refreshToken() {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                credentials: 'include'
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Redirect to login page
     */
    redirectToLogin() {
        // Clear session data
        sessionStorage.removeItem('current_organization');
        sessionStorage.removeItem('user_role');
        
        // Only redirect if not already on login page
        if (!window.location.pathname.includes('index.html') && 
            !window.location.pathname.endsWith('/')) {
            window.location.href = '/index.html?session_expired=1';
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

    // PATCH request
    patch(endpoint, data) {
        return this.request('PATCH', endpoint, data);
    }
}

// Create global API client instance
const api = new ApiClient();

// Health check on startup
api.get('/health')
    .then(result => {
        if (result.success) {
            console.log('✅ Backend connection OK');
        } else {
            console.error('❌ Backend unhealthy:', result);
        }
    })
    .catch(error => {
        console.error('❌ Backend not reachable:', error.message);
        console.info('💡 Make sure the backend server is running on port 3001');
    });

// ==================== AUTH API ====================

const authAPI = {
    // Login - uses secure httpOnly cookies
    login: async (email, password, organizationId = null) => {
        const result = await api.post('/auth/login', { email, password, organizationId });
        
        if (result.success && result.data) {
            // Store non-sensitive data in sessionStorage (not localStorage)
            if (result.data.organization) {
                sessionStorage.setItem('current_organization', JSON.stringify(result.data.organization));
                sessionStorage.setItem('user_role', result.data.organization.role);
            }
            // Return unwrapped data for backward compatibility
            return result.data;
        }
        throw new Error(result.error?.message || 'Login failed');
    },

    // Registration
    register: async (userData) => {
        const result = await api.post('/auth/register', userData);
        
        if (result.success && result.data?.organization) {
            sessionStorage.setItem('current_organization', JSON.stringify(result.data.organization));
            sessionStorage.setItem('user_role', result.data.organization.role);
        }
        return result;
    },

    // Get current organization
    getCurrentOrganization: () => {
        const org = sessionStorage.getItem('current_organization');
        return org ? JSON.parse(org) : null;
    },

    // Get user's organizations
    getMyOrganizations: () => {
        return api.get('/organizations/my');
    },

    // Logout - clears cookies and session
    logout: async () => {
        try {
            await api.post('/auth/logout', {});
        } catch (e) {
            // Ignore errors
        }
        // Clear session data
        sessionStorage.removeItem('current_organization');
        sessionStorage.removeItem('user_role');
        window.location.href = '/index.html';
    },

    // Get current user
    getCurrentUser: async () => {
        const result = await api.get('/auth/me');
        if (result.success && result.data) {
            return result.data;
        }
        throw new Error(result.error?.message || 'Failed to get user');
    },

    // Update profile
    updateProfile: (data) => {
        return api.put('/users/profile', data);
    },

    // Change password
    changePassword: (currentPassword, newPassword) => {
        return api.post('/auth/change-password', { currentPassword, password: newPassword });
    },

    // Forgot password
    forgotPassword: (email) => {
        return api.post('/auth/forgot-password', { email });
    },

    // Reset password
    resetPassword: (token, password) => {
        return api.post('/auth/reset-password', { token, password });
    },

    // Check if authenticated
    checkAuth: () => {
        return api.isAuthenticated();
    }
};

// ==================== ORGANIZATIONS API ====================

const organizationsAPI = {
    create: (data) => {
        return api.post('/organizations', data);
    },

    checkSlug: (slug) => {
        return api.get(`/organizations/check-slug/${slug}`);
    },

    getMyOrganizations: () => {
        return api.get('/organizations/my');
    },

    getById: (id) => {
        return api.get(`/organizations/${id}`);
    },

    update: (id, data) => {
        return api.put(`/organizations/${id}`, data);
    },

    getMembers: (id, page = 1, limit = 20) => {
        return api.get(`/organizations/${id}/members?page=${page}&limit=${limit}`);
    },

    inviteMember: (id, data) => {
        return api.post(`/organizations/${id}/invitations`, data);
    },

    updateMember: (orgId, memberId, data) => {
        return api.put(`/organizations/${orgId}/members/${memberId}`, data);
    },

    removeMember: (orgId, memberId) => {
        return api.delete(`/organizations/${orgId}/members/${memberId}`);
    },

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
    },

    deactivate: (id) => {
        return api.post(`/users/${id}/deactivate`);
    },

    activate: (id) => {
        return api.post(`/users/${id}/activate`);
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
    getJobs: (filters = {}) => {
        const params = new URLSearchParams(filters).toString();
        return api.get(`/recruitment/jobs?${params}`);
    },

    getJob: (id) => {
        return api.get(`/recruitment/jobs/${id}`);
    },

    getJobDetails: (id) => {
        return api.get(`/recruitment/jobs/${id}/details`);
    },

    getApplicationUrl: (jobId) => {
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
