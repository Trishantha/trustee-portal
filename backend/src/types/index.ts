/**
 * Core Type Definitions
 * Trustee Portal - TypeScript Types
 */

// ==========================================
// Enums
// ==========================================

export enum Role {
  SUPER_ADMIN = 'super_admin',
  OWNER = 'owner',
  ADMIN = 'admin',
  CHAIR = 'chair',
  VICE_CHAIR = 'vice_chair',
  TREASURER = 'treasurer',
  SECRETARY = 'secretary',
  MLRO = 'mlro',
  COMPLIANCE_OFFICER = 'compliance_officer',
  HEALTH_OFFICER = 'health_officer',
  TRUSTEE = 'trustee',
  VOLUNTEER = 'volunteer',
  VIEWER = 'viewer'
}

export enum Permission {
  // Organization
  ORG_MANAGE = 'org:manage',
  ORG_VIEW = 'org:view',
  ORG_DELETE = 'org:delete',
  
  // Users
  USER_CREATE = 'user:create',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  USER_VIEW = 'user:view',
  USER_INVITE = 'user:invite',
  
  // Roles
  ROLE_ASSIGN = 'role:assign',
  ROLE_MANAGE = 'role:manage',
  
  // Documents
  DOC_CREATE = 'doc:create',
  DOC_UPDATE = 'doc:update',
  DOC_DELETE = 'doc:delete',
  DOC_VIEW = 'doc:view',
  DOC_APPROVE = 'doc:approve',
  
  // Tasks
  TASK_CREATE = 'task:create',
  TASK_UPDATE = 'task:update',
  TASK_DELETE = 'task:delete',
  TASK_VIEW = 'task:view',
  TASK_ASSIGN = 'task:assign',
  
  // Meetings
  MEETING_CREATE = 'meeting:create',
  MEETING_UPDATE = 'meeting:update',
  MEETING_DELETE = 'meeting:delete',
  MEETING_VIEW = 'meeting:view',
  MEETING_SCHEDULE = 'meeting:schedule',
  
  // Committees
  COMMITTEE_CREATE = 'committee:create',
  COMMITTEE_UPDATE = 'committee:update',
  COMMITTEE_DELETE = 'committee:delete',
  COMMITTEE_VIEW = 'committee:view',
  
  // Compliance
  COMPLIANCE_VIEW = 'compliance:view',
  COMPLIANCE_MANAGE = 'compliance:manage',
  AUDIT_VIEW = 'audit:view',
  
  // Billing
  BILLING_VIEW = 'billing:view',
  BILLING_MANAGE = 'billing:manage',
  
  // Platform
  PLATFORM_ADMIN = 'platform:admin'
}

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  VIEW = 'view',
  LOGIN = 'login',
  LOGOUT = 'logout',
  INVITE = 'invite',
  ACCEPT_INVITE = 'accept_invite',
  CANCEL_INVITE = 'cancel_invite',
  ROLE_CHANGE = 'role_change',
  PASSWORD_CHANGE = 'password_change',
  EMAIL_VERIFIED = 'email_verified',
  EXPORT = 'export',
  SETTINGS_CHANGE = 'settings_change'
}

export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  SUSPENDED = 'suspended'
}

// ==========================================
// User Types
// ==========================================

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  jobTitle?: string;
  bio?: string;
  phone?: string;
  locationCity?: string;
  locationCountry?: string;
  timezone: string;
  language: string;
  website?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  githubUrl?: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  emailVerified: boolean;
  emailVerifiedAt?: Date;
  verificationToken?: string;
  mfaEnabled: boolean;
  mfaSecret?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  passwordChangedAt?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  jobTitle?: string;
  bio?: string;
  phone?: string;
  locationCity?: string;
  locationCountry?: string;
  timezone: string;
  language: string;
  website?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  githubUrl?: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  emailVerified: boolean;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: Role;
  jobTitle?: string;
  phone?: string;
  timezone?: string;
  language?: string;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  bio?: string;
  phone?: string;
  locationCity?: string;
  locationCountry?: string;
  timezone?: string;
  language?: string;
  website?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  githubUrl?: string;
  avatar?: string;
}

// ==========================================
// Organization Types
// ==========================================

export interface Organization {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  description?: string;
  websiteUrl?: string;
  customDomain?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  planId?: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStripeId?: string;
  trialEndsAt?: Date;
  subscriptionStartedAt?: Date;
  subscriptionEndsAt?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  maxMembers: number;
  storageUsedMb: number;
  maxStorageMb: number;
  settings: OrganizationSettings;
  defaultTermLengthYears: number;
  maxConsecutiveTerms: number;
  renewalNotificationDays: number[];
  autoRenewalPolicy: string;
  enableTermTracking: boolean;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface OrganizationSettings {
  timezone?: string;
  dateFormat?: string;
  timeFormat?: '12h' | '24h';
  language?: string;
  emailNotifications?: boolean;
  meetingReminders?: boolean;
  taskReminders?: boolean;
  [key: string]: any;
}

export interface OrganizationResponse {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  description?: string;
  websiteUrl?: string;
  customDomain?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  contactEmail?: string;
  contactPhone?: string;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt?: Date;
  settings: OrganizationSettings;
  createdAt: Date;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  description?: string;
  websiteUrl?: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
  planId?: string;
  timezone?: string;
  language?: string;
}

// ==========================================
// Organization Member Types
// ==========================================

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  department?: string;
  title?: string;
  isActive: boolean;
  joinedAt: Date;
  lastActiveAt?: Date;
  invitedBy?: string;
  invitedAt?: Date;
  termStartDate?: Date;
  termEndDate?: Date;
  termLengthYears?: number;
  renewalNotifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMemberResponse {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: Role;
  department?: string;
  title?: string;
  isActive: boolean;
  joinedAt: Date;
  lastActiveAt?: Date;
  termStartDate?: Date;
  termEndDate?: Date;
  termLengthYears?: number;
}

export interface CreateOrganizationMemberInput {
  organizationId: string;
  userId: string;
  role: Role;
  department?: string;
  title?: string;
  invitedBy?: string;
  termLengthYears?: number;
  termStartDate?: Date;
}

// ==========================================
// Invitation Types
// ==========================================

export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  department?: string;
  title?: string;
  tokenHash: string;
  invitedBy: string;
  invitedAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
  acceptedBy?: string;
  cancelledAt?: Date;
  termLengthYears?: number;
  termStartDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationInvitationResponse {
  id: string;
  email: string;
  role: Role;
  department?: string;
  title?: string;
  invitedAt: Date;
  expiresAt: Date;
  invitedBy: string;
}

export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  role: Role;
  department?: string;
  title?: string;
  invitedBy: string;
  termLengthYears?: number;
  termStartDate?: Date;
}

export interface AcceptInvitationInput {
  token: string;
  password: string;
  firstName: string;
  lastName: string;
}

// ==========================================
// Audit Log Types
// ==========================================

export interface AuditLog {
  id: string;
  organizationId?: string;
  userId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  organizationId?: string;
  userId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

// ==========================================
// API Response Types
// ==========================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

// ==========================================
// JWT Types
// ==========================================

export interface JWTPayload {
  sub: string;
  email: string;
  isSuperAdmin: boolean;
  organizationId?: string;
  role?: Role;
  iat?: number;
  exp?: number;
}

// ==========================================
// Auth Types
// ==========================================

export interface LoginInput {
  email: string;
  password: string;
  organizationId?: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  organizationSlug: string;
  timezone?: string;
  language?: string;
}

export interface AuthResult {
  user: UserResponse;
  organization?: OrganizationResponse & { role?: Role };
  accessToken: string;
  refreshToken: string;
  requiresEmailVerification?: boolean;
}

// ==========================================
// Pagination Types
// ==========================================

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ==========================================
// Validation Types
// ==========================================

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ==========================================
// Express Extension
// ==========================================

declare global {
  namespace Express {
    interface Request {
      user?: UserResponse;
      member?: OrganizationMember;
      organization?: Organization;
    }
  }
}
