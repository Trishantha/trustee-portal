/**
 * Trustee Portal API Client v2
 * Updated for new TypeScript backend
 */

const API_BASE_URL = window.location.protocol === 'file:' 
  ? 'http://localhost:3001/api'
  : '/api';

/**
 * Custom API Error class
 */
class APIError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.details = details;
  }
}

/**
 * API Client class
 */
class ApiClient {
  constructor() {
    this.token = localStorage.getItem('auth_token');
    this.refreshPromise = null;
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_organization');
    localStorage.removeItem('user_role');
  }

  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Make API request
   */
  async request(method, endpoint, data = null, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      ...options
    };

    // Add auth token
    if (this.token) {
      config.headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Add organization context if available
    const currentOrg = localStorage.getItem('current_organization');
    if (currentOrg) {
      try {
        const org = JSON.parse(currentOrg);
        if (org?.id) {
          config.headers['X-Organization-ID'] = org.id;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    if (data) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, config);
      
      // Parse response
      let result;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        throw new APIError('PARSE_ERROR', 'Invalid response format', { text: text.substring(0, 200) });
      }

      // Handle errors
      if (!response.ok) {
        if (result.error) {
          throw new APIError(result.error.code, result.error.message, result.error.details);
        }
        throw new APIError('UNKNOWN_ERROR', `HTTP ${response.status}`);
      }

      return result.data || result;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      
      // Network or other errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new APIError('NETWORK_ERROR', 'Unable to connect to server. Please check your connection.');
      }
      
      throw new APIError('REQUEST_ERROR', error.message);
    }
  }

  get(endpoint) {
    return this.request('GET', endpoint);
  }

  post(endpoint, data) {
    return this.request('POST', endpoint, data);
  }

  put(endpoint, data) {
    return this.request('PUT', endpoint, data);
  }

  delete(endpoint) {
    return this.request('DELETE', endpoint);
  }
}

// Create global API client instance
const api = new ApiClient();

// ==========================================
// Auth API
// ==========================================

const authAPI = {
  /**
   * Register new organization with admin user
   */
  register: async (userData) => {
    const result = await api.post('/auth/register', userData);
    if (result.accessToken) {
      api.setToken(result.accessToken);
      if (result.organization) {
        localStorage.setItem('current_organization', JSON.stringify(result.organization));
        localStorage.setItem('user_role', result.user.role);
      }
    }
    return result;
  },

  /**
   * Login user
   */
  login: async (email, password, organizationId = null) => {
    const result = await api.post('/auth/login', { 
      email, 
      password, 
      organizationId 
    });
    
    if (result.accessToken) {
      api.setToken(result.accessToken);
      if (result.organization) {
        localStorage.setItem('current_organization', JSON.stringify(result.organization));
        localStorage.setItem('user_role', result.organization.role);
      }
    }
    return result;
  },

  /**
   * Accept invitation and create account
   */
  acceptInvitation: async (token, password, firstName, lastName) => {
    const result = await api.post('/auth/accept-invitation', {
      token,
      password,
      firstName,
      lastName
    });
    
    if (result.accessToken) {
      api.setToken(result.accessToken);
      if (result.organization) {
        localStorage.setItem('current_organization', JSON.stringify(result.organization));
        localStorage.setItem('user_role', result.member.role);
      }
    }
    return result;
  },

  /**
   * Logout user
   */
  logout: () => {
    api.clearToken();
    return Promise.resolve({ message: 'Logged out' });
  },

  /**
   * Get current user
   */
  getCurrentUser: () => {
    return api.get('/auth/me');
  },

  /**
   * Update profile
   */
  updateProfile: (data) => {
    return api.put('/users/profile', data);
  },

  /**
   * Change password
   */
  changePassword: (currentPassword, newPassword) => {
    return api.post('/users/change-password', { currentPassword, newPassword });
  },

  /**
   * Request password reset
   */
  forgotPassword: (email) => {
    return api.post('/auth/forgot-password', { email });
  },

  /**
   * Reset password with token
   */
  resetPassword: (token, password) => {
    return api.post('/auth/reset-password', { token, password });
  },

  /**
   * Verify email
   */
  verifyEmail: (token) => {
    return api.post('/auth/verify-email', { token });
  }
};

// ==========================================
// Organizations API
// ==========================================

const organizationsAPI = {
  /**
   * Get user's organizations
   */
  getMyOrganizations: () => {
    return api.get('/organizations/my');
  },

  /**
   * Get organization details
   */
  getById: (id) => {
    return api.get(`/organizations/${id}`);
  },

  /**
   * Update organization
   */
  update: (id, data) => {
    return api.put(`/organizations/${id}`, data);
  },

  /**
   * Get organization members
   */
  getMembers: (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/organizations/${id}/members?${query}`);
  },

  /**
   * Invite member
   */
  inviteMember: (id, data) => {
    return api.post(`/organizations/${id}/invitations`, data);
  },

  /**
   * Update member
   */
  updateMember: (orgId, memberId, data) => {
    return api.put(`/organizations/${orgId}/members/${memberId}`, data);
  },

  /**
   * Remove member
   */
  removeMember: (orgId, memberId) => {
    return api.delete(`/organizations/${orgId}/members/${memberId}`);
  }
};

// ==========================================
// Invitations API
// ==========================================

const invitationsAPI = {
  /**
   * Validate invitation token
   */
  validate: (token) => {
    return api.get(`/invitations/validate?token=${token}`);
  },

  /**
   * Cancel invitation
   */
  cancel: (id) => {
    return api.delete(`/invitations/${id}`);
  },

  /**
   * Resend invitation
   */
  resend: (id) => {
    return api.post(`/invitations/${id}/resend`);
  }
};

// ==========================================
// Audit API
// ==========================================

const auditAPI = {
  /**
   * Get organization audit logs
   */
  getOrganizationLogs: (orgId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/audit/organizations/${orgId}/logs?${query}`);
  },

  /**
   * Get current user activity
   */
  getMyActivity: () => {
    return api.get('/audit/users/me/activity');
  },

  /**
   * Get resource history
   */
  getResourceHistory: (type, id) => {
    return api.get(`/audit/resources/${type}/${id}/history`);
  }
};

// ==========================================
// Export
// ==========================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    api,
    authAPI,
    organizationsAPI,
    invitationsAPI,
    auditAPI,
    APIError
  };
}

// Browser global
if (typeof window !== 'undefined') {
  window.apiV2 = {
    api,
    authAPI,
    organizationsAPI,
    invitationsAPI,
    auditAPI,
    APIError
  };
}
