const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/database');
const { authenticate, requireSuperAdmin, requireRole, generateToken } = require('../middleware/auth-saas');
const { requireTenant, checkOrganizationLimit } = require('../middleware/tenant');
const { generateUniqueClientId, formatClientId } = require('../utils/clientId');

/**
 * @route   POST /api/organizations
 * @desc    Create a new organization (with trial)
 * @access  Public (with email verification)
 */
router.post('/', async (req, res) => {
    try {
        const { 
            name, 
            slug, 
            admin_email, 
            admin_first_name, 
            admin_last_name, 
            admin_password,
            website_url,
            billing_email,
            plan_id,
            default_term_length,
            renewal_notification_days,
            enable_term_tracking
        } = req.body;

        // Validation
        if (!name || !slug || !admin_email || !admin_first_name || !admin_last_name || !admin_password) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Please provide organization name, slug, and admin details.'
            });
        }

        // Validate slug format (alphanumeric, hyphens only)
        if (!/^[a-z0-9-]+$/.test(slug)) {
            return res.status(400).json({
                error: 'Invalid slug',
                message: 'Slug must be lowercase alphanumeric with hyphens only.'
            });
        }

        // Check if slug is available
        const existingOrg = await db.get('SELECT id FROM organizations WHERE slug = ?', [slug]);
        if (existingOrg) {
            return res.status(409).json({
                error: 'Slug unavailable',
                message: 'This organization slug is already taken. Please choose another.'
            });
        }

        // Check if email is already registered
        const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [admin_email]);
        if (existingUser) {
            return res.status(409).json({
                error: 'Email already registered',
                message: 'This email is already associated with an account. Please login or use a different email.'
            });
        }

        // Get plan (use provided plan_id or default to trial)
        let selectedPlan;
        if (plan_id) {
            selectedPlan = await db.get('SELECT id FROM subscription_plans WHERE id = ?', [plan_id]);
        }
        if (!selectedPlan) {
            selectedPlan = await db.get("SELECT id FROM subscription_plans WHERE code = 'trial'");
        }
        if (!selectedPlan) {
            return res.status(500).json({
                error: 'Configuration error',
                message: 'Subscription plan not found.'
            });
        }

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(admin_password, salt);

        // Set trial end date (14 days from now)
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14);

        // Generate unique client ID
        const clientId = await generateUniqueClientId();

        // Create user and organization (no SQL transactions with Supabase)
        try {
            // Create user using table API
            const userResult = await db.insert('users', {
                email: admin_email.toLowerCase(),
                password: hashedPassword,
                first_name: admin_first_name,
                last_name: admin_last_name,
                verification_token: verificationToken,
                email_verified: false,
                role: 'organization_owner',
                created_at: new Date().toISOString()
            });
            const userId = userResult.id;

            // Create organization with term settings using table API
            const orgResult = await db.insert('organizations', {
                name: name,
                slug: slug,
                client_id: clientId,
                website_url: website_url || null,
                billing_email: billing_email || admin_email,
                plan_id: selectedPlan.id,
                subscription_status: 'trial',
                trial_ends_at: trialEndsAt.toISOString(),
                created_by: userId,
                term_length_years: default_term_length || 3,
                term_notification_days: [90, 60, 30],
                license_type: 'trial',
                max_trustees: 5,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            const organizationId = orgResult.id;

            // Create organization membership as owner using table API
            // Create organization membership as owner using table API
            await db.insert('organization_members', {
                organization_id: organizationId,
                user_id: userId,
                role: 'owner',
                term_start_date: new Date().toISOString().split('T')[0],
                term_length_years: default_term_length || 3
            });

            // TODO: Send verification email
            // await sendVerificationEmail(admin_email, verificationToken);

            // Generate token for immediate login
            const token = generateToken(
                { id: userId, email: admin_email },
                organizationId,
                'owner'
            );

            res.status(201).json({
                message: 'Organization created successfully!',
                organization: {
                    id: organizationId,
                    client_id: clientId,
                    client_id_formatted: formatClientId(clientId),
                    name,
                    slug,
                    subscription_status: 'trial',
                    trial_ends_at: trialEndsAt.toISOString()
                },
                token,
                user: {
                    id: userId,
                    email: admin_email,
                    first_name: admin_first_name,
                    last_name: admin_last_name,
                    role: 'owner'
                },
                requires_email_verification: true
            });

        } catch (error) {
            console.error('Create organization error (during creation):', error);
            throw error;
        }

    } catch (error) {
        console.error('Create organization error:', error);
        res.status(500).json({
            error: 'Failed to create organization',
            message: 'An error occurred while creating your organization. Please try again.'
        });
    }
});

/**
 * @route   GET /api/organizations/check-slug/:slug
 * @desc    Check if an organization slug is available
 * @access  Public
 */
router.get('/check-slug/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        // Validate slug format
        if (!/^[a-z0-9-]+$/.test(slug)) {
            return res.status(400).json({
                available: false,
                message: 'Slug must be lowercase alphanumeric with hyphens only.'
            });
        }

        // Check reserved slugs
        const reservedSlugs = ['api', 'www', 'admin', 'app', 'dashboard', 'login', 'register', 'support', 'help', 'blog'];
        if (reservedSlugs.includes(slug)) {
            return res.json({
                available: false,
                message: 'This slug is reserved and cannot be used.'
            });
        }

        const existing = await db.get('SELECT id FROM organizations WHERE slug = ?', [slug]);
        
        res.json({
            available: !existing,
            message: existing ? 'This slug is already taken.' : 'This slug is available!'
        });

    } catch (error) {
        console.error('Check slug error:', error);
        res.status(500).json({
            error: 'Failed to check slug availability'
        });
    }
});

/**
 * @route   GET /api/organizations/my
 * @desc    Get all organizations for current user
 * @access  Private
 */
router.get('/my', authenticate, async (req, res) => {
    try {
        const organizations = await db.all(
            `SELECT o.id, o.name, o.slug, o.logo_url, o.subscription_status, 
                    o.trial_ends_at, o.custom_domain, o.primary_color,
                    om.role as user_role, om.joined_at,
                    p.name as plan_name, p.max_users, p.max_storage_mb
             FROM organizations o
             JOIN organization_members om ON o.id = om.organization_id
             LEFT JOIN subscription_plans p ON o.plan_id = p.id
             WHERE om.user_id = ? AND om.is_active = 1 AND o.is_active = 1
             ORDER BY om.joined_at DESC`,
            [req.user.id]
        );

        res.json({
            organizations: organizations.map(org => ({
                id: org.id,
                name: org.name,
                slug: org.slug,
                logo_url: org.logo_url,
                custom_domain: org.custom_domain,
                primary_color: org.primary_color,
                subscription_status: org.subscription_status,
                trial_ends_at: org.trial_ends_at,
                user_role: org.user_role,
                joined_at: org.joined_at,
                plan: {
                    name: org.plan_name,
                    max_users: org.max_users,
                    max_storage_mb: org.max_storage_mb
                }
            }))
        });

    } catch (error) {
        console.error('Get my organizations error:', error);
        res.status(500).json({
            error: 'Failed to fetch organizations'
        });
    }
});

/**
 * @route   GET /api/organizations/:id
 * @desc    Get organization details
 * @access  Private (Organization member)
 */
router.get('/:id', authenticate, requireTenant, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify user is a member using table API
        const memberships = await db.query('organization_members', {
            where: { organization_id: id, user_id: req.user.id, is_active: true },
            select: '*'
        });
        
        if (memberships.length === 0) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You are not a member of this organization.'
            });
        }
        const member = memberships[0];

        // Get organization details
        const orgs = await db.query('organizations', {
            where: { id: id },
            select: '*'
        });
        
        if (orgs.length === 0) {
            return res.status(404).json({
                error: 'Organization not found',
                message: 'The organization does not exist.'
            });
        }
        const organization = orgs[0];

        // Get plan details
        let plan = {};
        if (organization.plan_id) {
            const plans = await db.query('subscription_plans', {
                where: { id: organization.plan_id },
                select: '*'
            });
            if (plans.length > 0) plan = plans[0];
        }

        // Get member counts using table API
        const allMembers = await db.query('organization_members', {
            where: { organization_id: id, is_active: true },
            select: 'role'
        });
        
        const memberCounts = {
            total: allMembers.length,
            owners: allMembers.filter(m => m.role === 'owner').length,
            admins: allMembers.filter(m => m.role === 'admin').length,
            chairs: allMembers.filter(m => m.role === 'chair').length,
            trustees: allMembers.filter(m => m.role === 'trustee').length
        };

        res.json({
            organization: {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                custom_domain: organization.custom_domain,
                logo_url: organization.logo_url,
                favicon_url: organization.favicon_url,
                primary_color: organization.primary_color,
                secondary_color: organization.secondary_color,
                description: organization.description,
                website_url: organization.website_url,
                billing_email: organization.billing_email,
                subscription_status: organization.subscription_status,
                trial_ends_at: organization.trial_ends_at,
                current_period_end: organization.current_period_end,
                storage_used_mb: organization.storage_used_mb,
                settings: organization.settings || {},
                created_at: organization.created_at,
                updated_at: organization.updated_at
            },
            membership: {
                role: member.role,
                department: member.department,
                title: member.title,
                joined_at: member.joined_at
            },
            plan: {
                name: plan.name || 'Unknown',
                max_users: plan.max_users,
                max_committees: plan.max_committees,
                max_storage_mb: plan.max_storage_mb
            },
            usage: {
                total_members: memberCounts.total,
                owners: memberCounts.owners,
                admins: memberCounts.admins,
                chairs: memberCounts.chairs,
                trustees: memberCounts.trustees,
                storage_used_mb: organization.storage_used_mb
            }
        });

    } catch (error) {
        console.error('Get organization error:', error);
        res.status(500).json({
            error: 'Failed to fetch organization details'
        });
    }
});

/**
 * @route   PUT /api/organizations/:id
 * @desc    Update organization settings
 * @access  Private (Admin or Owner)
 */
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log('Update organization request:', { id, body: req.body });
        
        // Verify user is a member of this organization with appropriate role
        const membership = await db.get(
            `SELECT role FROM organization_members 
             WHERE organization_id = ? AND user_id = ? AND is_active = 1`,
            [id, req.user.id]
        );
        
        if (!membership) {
            return res.status(403).json({ error: 'Not a member of this organization' });
        }
        
        // Check role permissions
        const allowedRoles = ['owner', 'admin'];
        if (!allowedRoles.includes(membership.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        const {
            name,
            description,
            website_url,
            website,
            billing_email,
            contact_email,
            phone,
            contact_phone,
            billing_address,
            address,
            custom_domain,
            slug,
            subdomain,
            primary_color,
            secondary_color,
            settings,
            default_term_length,
            term_length_years,
            max_consecutive_terms,
            renewal_notification_days,
            auto_renewal_policy,
            enable_term_tracking
        } = req.body;

        // Build update fields (using actual DB column names)
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
        // Support both website_url and website
        const websiteValue = website_url !== undefined ? website_url : website;
        if (websiteValue !== undefined) {
            updates.push('website = ?');
            values.push(websiteValue);
        }
        // Support both billing_email and contact_email
        const emailValue = billing_email !== undefined ? billing_email : contact_email;
        if (emailValue !== undefined) {
            updates.push('contact_email = ?');
            values.push(emailValue);
        }
        // Support both phone and contact_phone
        const phoneValue = phone !== undefined ? phone : contact_phone;
        if (phoneValue !== undefined) {
            updates.push('contact_phone = ?');
            values.push(phoneValue);
        }
        // Support both billing_address and address
        const addressValue = billing_address !== undefined ? billing_address : address;
        if (addressValue !== undefined) {
            updates.push('address = ?');
            values.push(addressValue);
        }
        if (custom_domain !== undefined) {
            updates.push('custom_domain = ?');
            values.push(custom_domain);
        }
        // Support both slug and subdomain
        const slugValue = slug !== undefined ? slug : subdomain;
        if (slugValue !== undefined) {
            updates.push('subdomain = ?');
            values.push(slugValue);
        }
        if (primary_color !== undefined) {
            updates.push('primary_color = ?');
            values.push(primary_color);
        }
        if (secondary_color !== undefined) {
            updates.push('secondary_color = ?');
            values.push(secondary_color);
        }
        if (settings !== undefined) {
            updates.push('settings = ?');
            values.push(typeof settings === 'string' ? settings : JSON.stringify(settings));
        }
        // Support both default_term_length and term_length_years
        const termLengthValue = default_term_length !== undefined ? default_term_length : term_length_years;
        if (termLengthValue !== undefined) {
            updates.push('term_length_years = ?');
            values.push(parseInt(termLengthValue));
        }
        
        // Store new fields in settings JSON if columns don't exist
        const settingsToStore = {};
        if (max_consecutive_terms !== undefined) settingsToStore.max_consecutive_terms = max_consecutive_terms;
        if (auto_renewal_policy !== undefined) settingsToStore.auto_renewal_policy = auto_renewal_policy;
        if (enable_term_tracking !== undefined) settingsToStore.enable_term_tracking = enable_term_tracking;
        
        // Handle renewal_notification_days - store in settings or use existing column
        if (renewal_notification_days !== undefined) {
            const days = parseInt(renewal_notification_days);
            // Try to update the array column if possible, otherwise store in settings
            try {
                updates.push('term_notification_days = ?');
                values.push([90, 60, 30]); // Default array, individual day stored in settings
                settingsToStore.renewal_notification_days = days;
            } catch (e) {
                settingsToStore.renewal_notification_days = days;
            }
        }
        
        // If we have settings to store, merge with existing settings
        if (Object.keys(settingsToStore).length > 0) {
            const existingOrg = await db.get('SELECT settings FROM organizations WHERE id = ?', [id]);
            let existingSettings = {};
            if (existingOrg && existingOrg.settings) {
                try {
                    existingSettings = JSON.parse(existingOrg.settings);
                } catch (e) {}
            }
            const mergedSettings = { ...existingSettings, ...settingsToStore };
            
            // Check if settings column already being updated
            const settingsIndex = updates.findIndex(u => u.startsWith('settings ='));
            if (settingsIndex >= 0) {
                values[settingsIndex] = JSON.stringify(mergedSettings);
            } else {
                updates.push('settings = ?');
                values.push(JSON.stringify(mergedSettings));
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: 'No fields to update'
            });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        console.log('Executing update:', { updates, values });

        await db.run(
            `UPDATE organizations SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        // Get updated organization
        const organization = await db.get(
            'SELECT * FROM organizations WHERE id = ?',
            [id]
        );

        res.json({
            message: 'Organization updated successfully',
            organization: {
                ...organization,
                settings: organization.settings ? JSON.parse(organization.settings) : {}
            }
        });

    } catch (error) {
        console.error('Update organization error:', error);
        // Return more detailed error for debugging
        res.status(500).json({
            error: 'Failed to update organization: ' + error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * @route   POST /api/organizations/:id/members
 * @desc    Invite a new member to organization
 * @access  Private (Admin+)
 */
router.post('/:id/members', 
    authenticate, 
    requireTenant, 
    requireRole('owner', 'admin', 'chair'),
    checkOrganizationLimit('users'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { email, role, department, title, term_length_years, term_start_date, first_name, last_name } = req.body;

            if (!email || !role) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    message: 'Email and role are required.'
                });
            }

            // Valid roles
            const validRoles = ['admin', 'chair', 'secretary', 'trustee', 'viewer'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({
                    error: 'Invalid role',
                    message: `Role must be one of: ${validRoles.join(', ')}`
                });
            }

            // Get organization default term settings
            const org = await db.get(
                'SELECT default_term_length FROM organizations WHERE id = ?',
                [id]
            );

            // Check if user is already a member
            const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
            
            if (existingUser) {
                const existingMember = await db.get(
                    'SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?',
                    [id, existingUser.id]
                );

                if (existingMember) {
                    return res.status(409).json({
                        error: 'Already a member',
                        message: 'This user is already a member of the organization.'
                    });
                }
            }

            // Check for existing pending invitation
            const existingInvite = await db.get(
                'SELECT id FROM organization_invitations WHERE organization_id = ? AND email = ? AND accepted_at IS NULL AND expires_at > datetime("now")',
                [id, email]
            );

            if (existingInvite) {
                return res.status(409).json({
                    error: 'Invitation pending',
                    message: 'An invitation is already pending for this email.'
                });
            }

            // Generate invitation token
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

            // Calculate term dates
            const termLength = term_length_years || (org?.default_term_length || 3);
            const startDate = term_start_date || new Date().toISOString().split('T')[0];
            const endDate = new Date(startDate);
            endDate.setFullYear(endDate.getFullYear() + parseInt(termLength));

            // Create invitation
            await db.run(
                `INSERT INTO organization_invitations 
                 (organization_id, email, role, department, token, invited_by, expires_at, term_length_years, term_start_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, email, role, department || null, token, req.user.id, expiresAt.toISOString(),
                 termLength, startDate]
            );

            // TODO: Send invitation email
            // await sendInvitationEmail(email, organization.name, token);

            res.status(201).json({
                message: 'Invitation sent successfully',
                invitation: {
                    email,
                    role,
                    term_length_years: termLength,
                    term_start_date: startDate,
                    term_end_date: endDate.toISOString().split('T')[0],
                    expires_at: expiresAt.toISOString()
                }
            });

        } catch (error) {
            console.error('Invite member error:', error);
            res.status(500).json({
                error: 'Failed to send invitation'
            });
        }
    }
);

/**
 * @route   GET /api/organizations/:id/members
 * @desc    Get organization members
 * @access  Private (Organization member)
 */
router.get('/:id/members', authenticate, requireTenant, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.query;

        // Verify membership
        const membership = await db.get(
            'SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ? AND is_active = 1',
            [id, req.user.id]
        );

        if (!membership && !req.user.is_super_admin) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You are not a member of this organization.'
            });
        }

        // Get active members with term data
        const members = await db.all(
            `SELECT om.id, om.role, om.department, om.title, om.joined_at, om.last_active_at, om.is_active,
                    om.term_start_date, om.term_end_date, om.term_length_years, om.renewal_notified_at,
                    u.id as user_id, u.email, u.first_name, u.last_name, u.avatar
             FROM organization_members om
             JOIN users u ON om.user_id = u.id
             WHERE om.organization_id = ? AND (om.is_active = 1 OR ? = 'all')
             ORDER BY om.joined_at DESC`,
            [id, status]
        );

        // Get pending invitations
        const invitations = await db.all(
            `SELECT oi.id, oi.email, oi.role, oi.department, oi.invited_at, oi.expires_at,
                    u.first_name as invited_by_first_name, u.last_name as invited_by_last_name
             FROM organization_invitations oi
             JOIN users u ON oi.invited_by = u.id
             WHERE oi.organization_id = ? AND oi.accepted_at IS NULL AND oi.expires_at > datetime('now')
             ORDER BY oi.invited_at DESC`,
            [id]
        );

        res.json({
            members: members.map(m => ({
                id: m.id,
                user_id: m.user_id,
                email: m.email,
                first_name: m.first_name,
                last_name: m.last_name,
                avatar: m.avatar,
                role: m.role,
                department: m.department,
                title: m.title,
                joined_at: m.joined_at,
                last_active_at: m.last_active_at,
                is_active: m.is_active,
                term_start_date: m.term_start_date,
                term_end_date: m.term_end_date,
                term_length_years: m.term_length_years,
                renewal_notified_at: m.renewal_notified_at
            })),
            pending_invitations: invitations.map(i => ({
                id: i.id,
                email: i.email,
                role: i.role,
                department: i.department,
                invited_at: i.invited_at,
                expires_at: i.expires_at,
                invited_by: `${i.invited_by_first_name} ${i.invited_by_last_name}`
            }))
        });

    } catch (error) {
        console.error('Get members error:', error);
        res.status(500).json({
            error: 'Failed to fetch members'
        });
    }
});

/**
 * @route   GET /api/organizations/:id/term-notifications
 * @desc    Get term expiration notifications for admins and chairs
 * @access  Private (Admin, Chair, Owner)
 */
router.get('/:id/term-notifications', authenticate, requireTenant, requireRole('owner', 'admin', 'chair'), async (req, res) => {
    try {
        const { id } = req.params;
        const daysThreshold = req.query.days || 90;

        // Get organization term settings
        const org = await db.get(
            'SELECT default_term_length, renewal_notification_days, enable_term_tracking FROM organizations WHERE id = ?',
            [id]
        );

        if (!org || !org.enable_term_tracking) {
            return res.json({ 
                notifications: [], 
                count: 0,
                termTrackingEnabled: false 
            });
        }

        // Get trustees with terms expiring soon
        const expiringSoon = await db.all(
            `SELECT om.id, om.role, om.department, om.term_start_date, om.term_end_date, om.term_length_years,
                    om.renewal_notified_at, om.is_active,
                    u.id as user_id, u.email, u.first_name, u.last_name, u.avatar,
                    julianday(om.term_end_date) - julianday('now') as days_remaining
             FROM organization_members om
             JOIN users u ON om.user_id = u.id
             WHERE om.organization_id = ?
             AND om.term_end_date IS NOT NULL
             AND om.term_end_date <= date('now', '+' || ? || ' days')
             AND om.is_active = 1
             ORDER BY om.term_end_date`,
            [id, daysThreshold]
        );

        // Categorize notifications
        const notifications = expiringSoon.map(m => {
            const daysRemaining = Math.ceil(m.days_remaining);
            let urgency = 'info';
            if (daysRemaining <= 30) urgency = 'critical';
            else if (daysRemaining <= 60) urgency = 'warning';
            
            return {
                id: m.id,
                user_id: m.user_id,
                email: m.email,
                first_name: m.first_name,
                last_name: m.last_name,
                avatar: m.avatar,
                role: m.role,
                department: m.department,
                term_start_date: m.term_start_date,
                term_end_date: m.term_end_date,
                term_length_years: m.term_length_years,
                days_remaining: daysRemaining,
                urgency: urgency,
                renewal_notified_at: m.renewal_notified_at
            };
        });

        res.json({
            notifications,
            count: notifications.length,
            termTrackingEnabled: true,
            settings: {
                default_term_length: org.default_term_length,
                renewal_notification_days: org.renewal_notification_days
            }
        });

    } catch (error) {
        console.error('Get term notifications error:', error);
        res.status(500).json({
            error: 'Failed to fetch term notifications'
        });
    }
});

/**
 * @route   PUT /api/organizations/:id/members/:memberId
 * @desc    Update member role or details
 * @access  Private (Admin+)
 */
router.put('/:id/members/:memberId', authenticate, requireTenant, requireRole('owner', 'admin'), async (req, res) => {
    try {
        const { id, memberId } = req.params;
        const { role, department, title, is_active } = req.body;

        // Cannot modify own role through this endpoint (prevents locking yourself out)
        const targetMember = await db.get(
            'SELECT user_id FROM organization_members WHERE id = ? AND organization_id = ?',
            [memberId, id]
        );

        if (!targetMember) {
            return res.status(404).json({
                error: 'Member not found'
            });
        }

        if (targetMember.user_id === req.user.id && role !== undefined) {
            return res.status(400).json({
                error: 'Cannot modify own role',
                message: 'You cannot change your own role. Transfer ownership first.'
            });
        }

        // Build update
        const updates = [];
        const values = [];

        if (role !== undefined) {
            updates.push('role = ?');
            values.push(role);
        }
        if (department !== undefined) {
            updates.push('department = ?');
            values.push(department);
        }
        if (title !== undefined) {
            updates.push('title = ?');
            values.push(title);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: 'No fields to update'
            });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(memberId);

        await db.run(
            `UPDATE organization_members SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        // SYNC: When title is updated from admin side, also update user's job_title
        if (title !== undefined && title !== '') {
            await db.update('users', 
                { job_title: title, updated_at: new Date().toISOString() },
                { id: targetMember.user_id }
            );
        }

        res.json({
            message: 'Member updated successfully'
        });

    } catch (error) {
        console.error('Update member error:', error);
        res.status(500).json({
            error: 'Failed to update member'
        });
    }
});

/**
 * @route   POST /api/organizations/:id/members/:memberId/renew-term
 * @desc    Renew a trustee's term
 * @access  Private (Admin, Chair, Owner)
 */
router.post('/:id/members/:memberId/renew-term', authenticate, requireTenant, requireRole('owner', 'admin', 'chair'), async (req, res) => {
    try {
        const { id, memberId } = req.params;
        const { term_length_years, notes } = req.body;

        // Get member details
        const member = await db.get(
            `SELECT om.*, u.first_name, u.last_name, u.email, org.default_term_length
             FROM organization_members om
             JOIN users u ON om.user_id = u.id
             JOIN organizations org ON om.organization_id = org.id
             WHERE om.id = ? AND om.organization_id = ?`,
            [memberId, id]
        );

        if (!member) {
            return res.status(404).json({
                error: 'Member not found'
            });
        }

        // Calculate new term dates
        const years = term_length_years || member.default_term_length || 3;
        const newStartDate = new Date();
        const newEndDate = new Date();
        newEndDate.setFullYear(newEndDate.getFullYear() + parseInt(years));

        // Update member's term
        await db.run(
            `UPDATE organization_members 
             SET term_start_date = ?,
                 term_end_date = ?,
                 term_length_years = ?,
                 renewal_notified_at = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [newStartDate.toISOString().split('T')[0], newEndDate.toISOString().split('T')[0], years, memberId]
        );

        // TODO: Send renewal notification email

        res.json({
            message: 'Term renewed successfully',
            member: {
                id: member.id,
                name: `${member.first_name} ${member.last_name}`,
                email: member.email,
                new_term_start_date: newStartDate.toISOString().split('T')[0],
                new_term_end_date: newEndDate.toISOString().split('T')[0],
                term_length_years: years
            }
        });

    } catch (error) {
        console.error('Renew term error:', error);
        res.status(500).json({
            error: 'Failed to renew term'
        });
    }
});

/**
 * @route   DELETE /api/organizations/:id/members/:memberId
 * @desc    Remove member from organization
 * @access  Private (Admin+)
 */
router.delete('/:id/members/:memberId', authenticate, requireTenant, requireRole('owner', 'admin'), async (req, res) => {
    try {
        const { id, memberId } = req.params;

        // Cannot remove yourself
        const targetMember = await db.get(
            'SELECT user_id FROM organization_members WHERE id = ? AND organization_id = ?',
            [memberId, id]
        );

        if (!targetMember) {
            return res.status(404).json({
                error: 'Member not found'
            });
        }

        if (targetMember.user_id === req.user.id) {
            return res.status(400).json({
                error: 'Cannot remove yourself',
                message: 'You cannot remove yourself from the organization. Transfer ownership first.'
            });
        }

        await db.run(
            'UPDATE organization_members SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [memberId]
        );

        res.json({
            message: 'Member removed successfully'
        });

    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({
            error: 'Failed to remove member'
        });
    }
});

// ==========================================
// SUPER ADMIN ROUTES
// ==========================================

/**
 * @route   GET /api/organizations
 * @desc    Get all organizations (Super Admin only)
 * @access  Private (Super Admin)
 */
router.get('/', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (status) {
            whereClause = 'WHERE subscription_status = ?';
            params.push(status);
        }

        const organizations = await db.all(
            `SELECT o.*, p.name as plan_name,
                    (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id AND is_active = 1) as member_count
             FROM organizations o
             LEFT JOIN subscription_plans p ON o.plan_id = p.id
             ${whereClause}
             ORDER BY o.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        const total = await db.get(
            `SELECT COUNT(*) as count FROM organizations ${whereClause}`,
            params
        );

        res.json({
            organizations: organizations.map(org => ({
                ...org,
                settings: org.settings ? JSON.parse(org.settings) : {}
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                total_pages: Math.ceil(total.count / limit)
            }
        });

    } catch (error) {
        console.error('Get all organizations error:', error);
        res.status(500).json({
            error: 'Failed to fetch organizations'
        });
    }
});

/**
 * @route   PUT /api/organizations/:id/suspend
 * @desc    Suspend an organization (Super Admin only)
 * @access  Private (Super Admin)
 */
router.put('/:id/suspend', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        await db.run(
            "UPDATE organizations SET subscription_status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [id]
        );

        // TODO: Send suspension notification email

        res.json({
            message: 'Organization suspended successfully',
            reason
        });

    } catch (error) {
        console.error('Suspend organization error:', error);
        res.status(500).json({
            error: 'Failed to suspend organization'
        });
    }
});

module.exports = router;
