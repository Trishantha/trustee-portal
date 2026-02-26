# Role-Based Access Control Matrix

## Trustee Portal - Governance & Compliance

This document defines the role-based access control (RBAC) system for the Trustee Portal, aligned with charity governance best practices.

---

## Supported Roles

| Role | Code | Level | Description |
|------|------|-------|-------------|
| Super Admin | `super_admin` | System | Platform administrator with full system access |
| Owner | `owner` | Organization | Organization creator with full control |
| Admin | `admin` | Organization | Administrator with broad management permissions |
| Chair | `chair` | Board | Board chair with leadership authority |
| Vice Chair | `vice_chair` | Board | Vice chair with delegated authority |
| Treasurer | `treasurer` | Board | Financial officer with billing access |
| Secretary | `secretary` | Board | Board secretary with meeting management |
| MLRO | `mlro` | Compliance | Money Laundering Reporting Officer |
| Compliance Officer | `compliance_officer` | Compliance | Regulatory compliance manager |
| Health Officer | `health_officer` | Compliance | Health and safety officer |
| Trustee | `trustee` | Board | Standard board member |
| Volunteer | `volunteer` | Member | Volunteer with limited access |
| Viewer | `viewer` | Member | Read-only access |

---

## Permission Matrix

### Organization Management

| Permission | Super Admin | Owner | Admin | Chair | Treasurer | Secretary | Trustee | Volunteer | Viewer |
|------------|:-----------:|:-----:|:-----:|:-----:|:---------:|:---------:|:-------:|:---------:|:------:|
| View Organization | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage Organization | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete Organization | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### User Management

| Permission | Super Admin | Owner | Admin | Chair | Treasurer | Secretary | Trustee | Volunteer | Viewer |
|------------|:-----------:|:-----:|:-----:|:-----:|:---------:|:---------:|:-------:|:---------:|:------:|
| View Users | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create User | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Update User | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete User | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Invite User | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Assign Role | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Document Management

| Permission | Super Admin | Owner | Admin | Chair | Treasurer | Secretary | Trustee | Volunteer | Viewer |
|------------|:-----------:|:-----:|:-----:|:-----:|:---------:|:---------:|:-------:|:---------:|:------:|
| View Documents | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Document | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Update Document | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Delete Document | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve Document | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Task Management

| Permission | Super Admin | Owner | Admin | Chair | Treasurer | Secretary | Trustee | Volunteer | Viewer |
|------------|:-----------:|:-----:|:-----:|:-----:|:---------:|:---------:|:-------:|:---------:|:------:|
| View Tasks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create Task | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Update Task | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Delete Task | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Assign Task | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

### Meeting Management

| Permission | Super Admin | Owner | Admin | Chair | Treasurer | Secretary | Trustee | Volunteer | Viewer |
|------------|:-----------:|:-----:|:-----:|:-----:|:---------:|:---------:|:-------:|:---------:|:------:|
| View Meetings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Meeting | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Update Meeting | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Delete Meeting | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Schedule Meeting | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

### Committee Management

| Permission | Super Admin | Owner | Admin | Chair | Treasurer | Secretary | Trustee | Volunteer | Viewer |
|------------|:-----------:|:-----:|:-----:|:-----:|:---------:|:---------:|:-------:|:---------:|:------:|
| View Committees | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create Committee | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Update Committee | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete Committee | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Compliance & Audit

| Permission | Super Admin | Owner | Admin | Chair | Treasurer | Secretary | MLRO | Compliance Officer | Health Officer |
|------------|:-----------:|:-----:|:-----:|:-----:|:---------:|:---------:|:----:|:------------------:|:--------------:|
| View Compliance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage Compliance | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| View Audit Log | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |

### Billing

| Permission | Super Admin | Owner | Admin | Treasurer |
|------------|:-----------:|:-----:|:-----:|:---------:|
| View Billing | ✅ | ✅ | ✅ | ✅ |
| Manage Billing | ✅ | ✅ | ❌ | ✅ |

---

## Role Hierarchy

```
Super Admin (100)
    └── Owner (90)
        └── Admin (80)
            ├── Chair (75)
            │   ├── Vice Chair (70)
            │   ├── Treasurer (65)
            │   ├── Secretary (65)
            │   ├── MLRO (60)
            │   ├── Compliance Officer (60)
            │   ├── Health Officer (60)
            │   └── Trustee (50)
            └── Volunteer (30)
                └── Viewer (10)
```

**Rule:** Users can only manage (invite, assign roles to) users at or below their hierarchy level.

---

## Special Role Definitions

### MLRO (Money Laundering Reporting Officer)

**Responsibilities:**
- Monitor suspicious activities
- File suspicious activity reports (SARs)
- Ensure AML compliance
- Access compliance documents
- View audit trails

**Key Permissions:**
- `compliance:view`
- `compliance:manage`
- `audit:view`

### Compliance Officer

**Responsibilities:**
- Ensure regulatory compliance
- Manage compliance documentation
- Conduct compliance audits
- Report to board

**Key Permissions:**
- `compliance:view`
- `compliance:manage`
- `audit:view`

### Health Officer

**Responsibilities:**
- Health and safety compliance
- Risk assessments
- Safety documentation
- Incident reporting

**Key Permissions:**
- `compliance:view` (health-related)
- `doc:view` (safety docs)

---

## Permission Logic

### hasPermission(role, permission)
```typescript
// Returns true if role has the specific permission
RBACService.hasPermission(Role.TRUSTEE, Permission.DOC_VIEW) // true
RBACService.hasPermission(Role.TRUSTEE, Permission.USER_CREATE) // false
```

### hasMinimumRole(userRole, requiredRole)
```typescript
// Returns true if userRole >= requiredRole in hierarchy
RBACService.hasMinimumRole(Role.ADMIN, Role.TRUSTEE) // true
RBACService.hasMinimumRole(Role.TRUSTEE, Role.ADMIN) // false
```

### canManageRole(managerRole, targetRole)
```typescript
// Returns true if manager can invite/assign targetRole
RBACService.canManageRole(Role.ADMIN, Role.TRUSTEE) // true
RBACService.canManageRole(Role.TRUSTEE, Role.ADMIN) // false
```

---

## API Endpoint Protection

### Protected Endpoints Examples

```typescript
// Only admins can invite users
router.post('/:id/invitations', 
  authenticate,
  requirePermission(Permission.USER_INVITE),
  invitationController.create
);

// Only treasurers and above can view billing
router.get('/:id/billing',
  authenticate,
  requirePermission(Permission.BILLING_VIEW),
  billingController.get
);

// Only chair and admin can manage committees
router.post('/:id/committees',
  authenticate,
  requireRole(Role.OWNER, Role.ADMIN, Role.CHAIR),
  committeeController.create
);

// Board members only
router.get('/:id/board-documents',
  authenticate,
  requireBoardMember,
  documentController.getBoardDocs
);
```

---

## Default Role Assignment

### Signup Flow
1. New organization created
2. **Signup user automatically assigned: OWNER**

### Invitation Flow
1. Admin invites user with specified role
2. **User accepts and is assigned the role from invitation**
3. **Role must be specified before activation**

---

## Audit Requirements

All role assignments and changes are logged:

```typescript
AuditLog {
  action: 'role_change' | 'invite' | 'accept_invite',
  resourceType: 'organization_member' | 'invitation',
  details: {
    targetUserId: string,
    previousRole?: Role,
    newRole: Role,
    changedBy: string
  }
}
```

---

## Compliance Notes

1. **Segregation of Duties:** Treasurer (financial) and Secretary (records) have separate permissions
2. **MLRO Independence:** MLRO has independent compliance access
3. **Audit Trail:** All role changes logged for regulatory review
4. **Data Protection:** Access limited based on role (GDPR compliance)
5. **Term Limits:** Role assignments include term tracking for trustees
