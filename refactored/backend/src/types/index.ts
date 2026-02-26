/**
 * Core Type Definitions
 * Trustee Portal - TypeScript Types
 */

// ==========================================
// User Types
// ==========================================

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  avatar?: string;
  role: Role;
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
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  mfaEnabled: boolean;
  mfaSecret?: string;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  passwordChangedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
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
  planId: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStripeId?: string;
  trialEndsAt?: Date;
  subscriptionStartedAt?: Date;
  subscriptionEndsAt?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  storageUsedMb: number;
  maxStorageMb: number;
  settings: OrganizationSettings;
  termSettings: TermSettings;
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

export interface TermSettings {
  defaultTermLengthYears: number;
  maxConsecutiveTerms: number;
  renewalNotificationDays: number[];
  autoRenewalPolicy: 'never' | 'opt_in' | 'opt_out';
  enableTermTracking: boolean;
}

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';

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
  termSettings?: Partial<TermSettings>;
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
// Role & Permission Types
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
  token: string;
  tokenHash: string;
  invitedBy: string;
  invitedAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
  acceptedBy?: string;
  termLengthYears?: number;
  termStartDate?: Date;
  createdAt: Date;
  updatedAt: Date;
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
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
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
  ROLE_CHANGE = 'role_change',
  PASSWORD_CHANGE = 'password_change',
  EMAIL_VERIFIED = 'email_verified',
  EXPORT = 'export',
  SETTINGS_CHANGE = 'settings_change'
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
// Email Types
// ==========================================

export interface EmailMessage {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  from?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
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
