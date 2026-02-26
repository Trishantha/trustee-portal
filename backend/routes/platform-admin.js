/**
 * Platform Admin Routes
 * For Super Admin only - manages the SaaS platform
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, requireSuperAdmin } = require('../middleware/auth-saas');
const analyticsService = require('../services/analytics');
const { formatClientId, normalizeClientId, isValidClientId } = require('../utils/clientId');

// All routes require super admin access
router.use(authenticate);
router.use(requireSuperAdmin);

/**
 * @route   GET /api/platform/stats
 * @desc    Get platform statistics
 * @access  Super Admin
 */
router.get('/stats', async (req, res) => {
    try {
        // Get all organizations using table API
        const allOrgs = await db.query('organizations', { select: 'id, subscription_status, license_type, plan_id' });
        
        // Map license_type to subscription_status for compatibility
        const mappedOrgs = allOrgs.map(org => ({
            ...org,
            subscription_status: org.subscription_status || (org.license_type === 'trial' ? 'trial' : 'active')
        }));
        
        const totalOrganizations = mappedOrgs.length;
        const activeSubscriptions = mappedOrgs.filter(o => o.subscription_status === 'active').length;
        const trialOrganizations = mappedOrgs.filter(o => o.subscription_status === 'trial').length;
        
        // Monthly revenue calculation
        let monthlyRevenue = 0;
        const activeOrgs = mappedOrgs.filter(o => o.subscription_status === 'active');
        
        if (activeOrgs.length > 0) {
            const plans = await db.query('subscription_plans', { select: 'id, price_monthly' });
            const planMap = {};
            plans.forEach(p => { planMap[p.id] = p.price_monthly || 0; });
            
            monthlyRevenue = activeOrgs.reduce((sum, org) => {
                return sum + (planMap[org.plan_id] || 0);
            }, 0);
        }

        res.json({
            totalOrganizations,
            activeSubscriptions,
            trialOrganizations,
            monthlyRevenue
        });
    } catch (error) {
        console.error('Platform stats error:', error);
        res.status(500).json({ error: 'Failed to fetch platform stats' });
    }
});

/**
 * @route   GET /api/platform/organizations
 * @desc    Get all organizations with details
 * @access  Super Admin
 */
router.get('/organizations', async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Get all organizations - use table API for Supabase compatibility
        let orgsResult;
        try {
            const allOrgs = await db.query('organizations', {
                order: { column: 'created_at', ascending: false }
            });
            
            // Map license_type to subscription_status for backward compatibility
            orgsResult = allOrgs.map(org => ({
                ...org,
                subscription_status: org.subscription_status || 
                    (org.license_type === 'trial' ? 'trial' : 'active')
            }));
            
            // Apply status filter
            if (status) {
                orgsResult = orgsResult.filter(o => o.subscription_status === status);
            }
            
            // Apply pagination
            orgsResult = orgsResult.slice(offset, offset + parseInt(limit));
        } catch (queryError) {
            console.error('Error fetching organizations:', queryError.message);
            return res.status(500).json({ error: 'Failed to fetch organizations' });
        }
        
        // Get subscription plans for lookup
        let plansMap = {};
        try {
            const plansResult = await db.query('subscription_plans', { select: 'id, name, price_monthly' });
            plansResult.forEach(p => { plansMap[p.id] = p; });
        } catch (e) { console.log('Plans query error:', e.message); }
        
        // Get all users for admin lookup
        let usersMap = {};
        try {
            const usersResult = await db.query('users', { select: 'id, first_name, last_name, email' });
            usersResult.forEach(u => { usersMap[u.id] = u; });
        } catch (e) { console.log('Users query error:', e.message); }
        
        // Get organization members to find admins
        const organizations = [];
        for (const org of orgsResult) {
            // Get member count
            let memberCount = 0;
            try {
                const members = await db.query('organization_members', {
                    where: { organization_id: org.id },
                    select: 'id, user_id, role'
                });
                memberCount = members.length;
                
                // Find admin user (owner or admin role)
                const adminMember = members.find(m => m.role === 'owner' || m.role === 'admin');
                if (adminMember && usersMap[adminMember.user_id]) {
                    org.admin_user = usersMap[adminMember.user_id];
                }
            } catch (e) {}
            
            const plan = plansMap[org.plan_id] || {};
            organizations.push({
                ...org,
                client_id: org.client_id,
                client_id_formatted: formatClientId(org.client_id),
                plan_name: plan.name || 'Unknown',
                price_monthly: plan.price_monthly || 0,
                member_count: memberCount,
                admin_name: org.admin_user ? `${org.admin_user.first_name || ''} ${org.admin_user.last_name || ''}`.trim() : 'N/A',
                admin_email: org.admin_user?.email || org.billing_email || 'N/A'
            });
        }

        // Get total count
        let totalCount = 0;
        try {
            const allOrgs = await db.query('organizations', { select: 'id' });
            totalCount = allOrgs.length;
        } catch (e) {
            console.log('Count query error:', e.message);
        }

        res.json({
            organizations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get organizations error:', error);
        res.status(500).json({ error: 'Failed to fetch organizations' });
    }
});

/**
 * @route   GET /api/platform/organizations/by-client-id/:clientId
 * @desc    Get organization by client ID
 * @access  Super Admin
 */
router.get('/organizations/by-client-id/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        
        // Normalize the client ID
        const normalizedId = normalizeClientId(clientId);
        
        if (!isValidClientId(normalizedId)) {
            return res.status(400).json({ 
                error: 'Invalid client ID format',
                message: 'Client ID must be 12 characters with letters and numbers only.'
            });
        }
        
        // Get organization by client_id
        const organization = await db.get(
            'SELECT * FROM organizations WHERE client_id = ?', 
            [normalizedId]
        );
        
        if (!organization) {
            return res.status(404).json({ error: 'Organization not found with this client ID' });
        }
        
        // Get plan name separately
        let planName = null;
        if (organization.plan_id) {
            const plan = await db.get('SELECT name FROM subscription_plans WHERE id = ?', [organization.plan_id]);
            planName = plan?.name;
        }
        
        res.json({
            ...organization,
            client_id_formatted: formatClientId(organization.client_id),
            plan_name: planName
        });
    } catch (error) {
        console.error('Get organization by client ID error:', error);
        res.status(500).json({ error: 'Failed to fetch organization' });
    }
});

/**
 * @route   GET /api/platform/organizations/:id
 * @desc    Get organization details
 * @access  Super Admin
 */
router.get('/organizations/:id', async (req, res) => {
    try {
        // Get organization using table API
        const organizations = await db.query('organizations', { 
            where: { id: parseInt(req.params.id) }
        });
        const organization = organizations[0];

        if (!organization) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        // Get plan name separately
        let planName = null;
        if (organization.plan_id) {
            const plans = await db.query('subscription_plans', { 
                where: { id: organization.plan_id },
                select: 'name'
            });
            planName = plans[0]?.name;
        }

        // Get members using table API
        const members = await db.query('organization_members', {
            where: { organization_id: parseInt(req.params.id) },
            select: 'id, role, joined_at, user_id'
        });

        // Get user details for each member
        const membersWithUsers = [];
        for (const member of members) {
            try {
                const users = await db.query('users', {
                    where: { id: member.user_id },
                    select: 'email, first_name, last_name'
                });
                const user = users[0];
                membersWithUsers.push({
                    ...member,
                    email: user?.email,
                    first_name: user?.first_name,
                    last_name: user?.last_name
                });
            } catch (e) {
                membersWithUsers.push(member);
            }
        }

        res.json({ 
            organization: { 
                ...organization,
                client_id_formatted: formatClientId(organization.client_id),
                plan_name: planName,
                members: membersWithUsers 
            } 
        });
    } catch (error) {
        console.error('Get organization error:', error);
        res.status(500).json({ error: 'Failed to fetch organization' });
    }
});

/**
 * @route   PUT /api/platform/organizations/:id/suspend
 * @desc    Suspend an organization
 * @access  Super Admin
 */
router.put('/organizations/:id/suspend', async (req, res) => {
    try {
        const { reason } = req.body;
        const orgId = parseInt(req.params.id);

        // Use table API for Supabase compatibility
        await db.update('organizations', 
            { subscription_status: 'suspended', updated_at: new Date().toISOString() },
            { id: orgId }
        );

        // Log the action (ignore errors)
        try {
            await db.insert('activity_logs', {
                organization_id: orgId,
                user_id: req.user.id,
                action: 'organization_suspended',
                entity_type: 'organization',
                details: { reason },
                created_at: new Date().toISOString()
            });
        } catch (e) { console.log('Activity log failed:', e.message); }

        res.json({ message: 'Organization suspended successfully', reason });
    } catch (error) {
        console.error('Suspend organization error:', error);
        res.status(500).json({ error: 'Failed to suspend organization' });
    }
});

/**
 * @route   PUT /api/platform/organizations/:id/activate
 * @desc    Activate/reactivate an organization
 * @access  Super Admin
 */
router.put('/organizations/:id/activate', async (req, res) => {
    try {
        const orgId = parseInt(req.params.id);

        // Use table API for Supabase compatibility
        await db.update('organizations', 
            { subscription_status: 'active', updated_at: new Date().toISOString() },
            { id: orgId }
        );

        // Log the action
        try {
            await db.insert('activity_logs', {
                organization_id: orgId,
                user_id: req.user.id,
                action: 'organization_activated',
                entity_type: 'organization',
                details: {},
                created_at: new Date().toISOString()
            });
        } catch (e) { console.log('Activity log failed:', e.message); }

        res.json({ message: 'Organization activated successfully' });
    } catch (error) {
        console.error('Activate organization error:', error);
        res.status(500).json({ error: 'Failed to activate organization' });
    }
});

/**
 * @route   PUT /api/platform/organizations/:id/renew
 * @desc    Renew organization subscription
 * @access  Super Admin
 */
router.put('/organizations/:id/renew', async (req, res) => {
    try {
        // Extend subscription by one month from now or current period end
        await db.run(`
            UPDATE organizations 
            SET subscription_status = 'active',
                current_period_end = datetime(COALESCE(current_period_end, 'now'), '+1 month'),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [req.params.id]);

        // Log the action
        try {
            await db.run(`
                INSERT INTO audit_log (organization_id, user_id, action, entity_type, created_at)
                VALUES (?, ?, ?, ?, NOW())
            `, [parseInt(req.params.id), req.user.id, 'organization_renewed', 'organization']);
        } catch (e) { console.log('Audit log failed:', e.message); }

        res.json({ message: 'Subscription renewed successfully' });
    } catch (error) {
        console.error('Renew organization error:', error);
        res.status(500).json({ error: 'Failed to renew subscription' });
    }
});

/**
 * @route   PUT /api/platform/organizations/:id/plan
 * @desc    Manually change organization subscription plan
 * @access  Super Admin
 */
router.put('/organizations/:id/plan', async (req, res) => {
    try {
        const { plan_id, change_type, reason, billing_cycle } = req.body;
        const organizationId = parseInt(req.params.id);

        if (!plan_id) {
            return res.status(400).json({ error: 'Plan ID is required' });
        }

        // Get the new plan details
        const plan = await db.get('SELECT * FROM subscription_plans WHERE id = ?', [plan_id]);
        if (!plan) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        // Get current organization details
        const organization = await db.get('SELECT * FROM organizations WHERE id = ?', [organizationId]);
        if (!organization) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        // Calculate new period end based on billing cycle
        const periodMonths = billing_cycle === 'yearly' ? 12 : 1;
        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + periodMonths);

        // Build update data
        const updateData = {
            plan_id: parseInt(plan_id),
            subscription_status: 'active',
            updated_at: new Date().toISOString()
        };

        // Only add period columns if they might exist
        try {
            updateData.current_period_start = new Date().toISOString();
            updateData.current_period_end = periodEnd.toISOString();
            if (billing_cycle) {
                updateData.billing_cycle = billing_cycle;
            }
        } catch (e) {}

        // Try to update using table API
        try {
            await db.update('organizations', updateData, { id: organizationId });
        } catch (updateError) {
            console.log('Table API update failed, trying SQL:', updateError.message);
            
            // Fallback to SQL
            try {
                await db.run(
                    'UPDATE organizations SET plan_id = ?, subscription_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [plan_id, 'active', organizationId]
                );
            } catch (sqlError) {
                console.error('SQL update also failed:', sqlError.message);
                throw sqlError;
            }
        }

        // Log the action (ignore errors)
        try {
            await db.run(`
                INSERT INTO audit_log (organization_id, user_id, action, entity_type, old_values, new_values, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            `, [
                parseInt(organizationId),
                req.user.id,
                'plan_changed',
                'organization',
                JSON.stringify({ plan_id: organization.plan_id }),
                JSON.stringify({ 
                    plan_id, 
                    plan_name: plan.name, 
                    change_type: change_type || 'manual',
                    reason: reason || 'Manual plan change by admin'
                })
            ]);
        } catch (logError) {
            console.log('Audit log insert failed:', logError.message);
        }

        // Get updated organization (without JOIN)
        const updatedOrg = await db.get('SELECT * FROM organizations WHERE id = ?', [organizationId]);

        res.json({
            message: 'Plan changed successfully',
            organization: {
                id: updatedOrg.id,
                name: updatedOrg.name,
                plan_id: updatedOrg.plan_id,
                plan_name: plan.name,
                subscription_status: updatedOrg.subscription_status,
                billing_cycle: updatedOrg.billing_cycle || billing_cycle || 'monthly',
                current_period_end: updatedOrg.current_period_end || periodEnd.toISOString()
            },
            change: {
                from_plan: organization.plan_id,
                to_plan: plan_id,
                type: change_type || 'manual',
                reason: reason
            }
        });
    } catch (error) {
        console.error('Change plan error:', error);
        res.status(500).json({ error: error.message || 'Failed to change plan' });
    }
});

/**
 * @route   DELETE /api/platform/organizations/:id
 * @desc    Delete an organization permanently
 * @access  Super Admin
 */
router.delete('/organizations/:id', async (req, res) => {
    try {
        // Get org name before deletion for audit log
        let orgName = 'Unknown';
        try {
            const org = await db.get('SELECT name FROM organizations WHERE id = ?', [req.params.id]);
            if (org) orgName = org.name;
        } catch (e) {}

        await db.run('DELETE FROM organizations WHERE id = ?', [req.params.id]);

        // Log the action
        try {
            await db.run(`
                INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_values, created_at)
                VALUES (?, ?, ?, ?, ?, NOW())
            `, [req.user.id, 'organization_deleted', 'organization', parseInt(req.params.id), JSON.stringify({ name: orgName })]);
        } catch (e) { console.log('Audit log failed:', e.message); }

        res.json({ message: 'Organization deleted successfully' });
    } catch (error) {
        console.error('Delete organization error:', error);
        res.status(500).json({ error: 'Failed to delete organization' });
    }
});

/**
 * @route   GET /api/platform/plans
 * @desc    Get all subscription plans
 * @access  Super Admin
 */
router.get('/plans', async (req, res) => {
    try {
        let plans;
        try {
            plans = await db.all('SELECT * FROM subscription_plans ORDER BY price_monthly');
        } catch (queryError) {
            // Fallback to table API if SQL fails
            console.log('SQL query failed, using table API:', queryError.message);
            plans = await db.query('subscription_plans', {
                order: { column: 'price_monthly', ascending: true }
            });
        }
        
        // Normalize plan data to handle missing columns
        const normalizedPlans = plans.map(p => ({
            id: p.id,
            name: p.name,
            slug: p.slug || p.code || '',
            description: p.description || '',
            price_monthly: p.price_monthly,
            price_yearly: p.price_yearly || p.price_monthly * 10,
            max_users: p.max_users || 5,
            max_storage_mb: p.max_storage_mb || 5120,
            max_committees: p.max_committees || 3,
            features: typeof p.features === 'string' ? JSON.parse(p.features || '[]') : (p.features || []),
            is_popular: p.is_popular === 1 || p.is_popular === true,
            is_active: p.is_active !== 0 && p.is_active !== false,
            stripe_price_id_monthly: p.stripe_price_id_monthly || '',
            stripe_price_id_yearly: p.stripe_price_id_yearly || ''
        }));
        
        res.json({ plans: normalizedPlans });
    } catch (error) {
        console.error('Get plans error:', error);
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
});

/**
 * @route   POST /api/platform/plans
 * @desc    Create a new subscription plan
 * @access  Super Admin
 */
router.post('/plans', async (req, res) => {
    try {
        const {
            name, slug, description, price_monthly, price_yearly,
            max_users, max_storage_mb, max_committees, features,
            stripe_price_id_monthly, stripe_price_id_yearly,
            is_popular, is_active
        } = req.body;

        // Build insert data
        const insertData = {
            name,
            code: slug || name.toLowerCase().replace(/\s+/g, '-'),
            price_monthly: price_monthly || 0,
            price_yearly: price_yearly || null,
            max_trustees: max_users || 5,
            features: typeof features === 'string' ? features : JSON.stringify(features || [])
        };
        
        // Add optional fields
        if (description) insertData.description = description;
        if (max_storage_mb) insertData.max_storage_mb = max_storage_mb;
        if (max_committees) insertData.max_committees = max_committees;
        if (stripe_price_id_monthly) insertData.stripe_price_id_monthly = stripe_price_id_monthly;
        if (stripe_price_id_yearly) insertData.stripe_price_id_yearly = stripe_price_id_yearly;
        if (is_popular !== undefined) insertData.is_popular = is_popular;
        if (is_active !== undefined) insertData.is_active = is_active;

        // Insert using table API
        const result = await db.insert('subscription_plans', insertData);
        const planId = result.id;

        // Fetch the created plan
        const plans = await db.query('subscription_plans', {
            where: { id: planId }
        });
        const plan = plans[0];
        
        // Log the action
        try {
            await db.insert('activity_logs', {
                user_id: req.user.id,
                action: 'plan_created',
                entity_type: 'subscription_plan',
                entity_id: planId,
                details: { name, price_monthly },
                created_at: new Date().toISOString()
            });
        } catch (logError) {
            console.log('Activity log insert failed:', logError.message);
        }
        
        res.status(201).json({ message: 'Plan created successfully', plan });
    } catch (error) {
        console.error('Create plan error:', error);
        res.status(500).json({ error: error.message || 'Failed to create plan' });
    }
});

/**
 * @route   PUT /api/platform/plans/:id
 * @desc    Update a subscription plan
 * @access  Super Admin
 */
router.put('/plans/:id', async (req, res) => {
    try {
        const {
            name, slug, description, price_monthly, price_yearly,
            max_users, max_storage_mb, max_committees, features, is_active,
            is_popular, stripe_price_id_monthly, stripe_price_id_yearly
        } = req.body;

        // Build update data dynamically - only include defined values
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (slug !== undefined) updateData.slug = slug;
        if (description !== undefined) updateData.description = description;
        if (price_monthly !== undefined) updateData.price_monthly = price_monthly;
        if (price_yearly !== undefined) updateData.price_yearly = price_yearly;
        if (max_users !== undefined) updateData.max_users = max_users;
        if (max_storage_mb !== undefined) updateData.max_storage_mb = max_storage_mb;
        if (max_committees !== undefined) updateData.max_committees = max_committees;
        if (features !== undefined) updateData.features = typeof features === 'string' ? features : JSON.stringify(features);
        if (is_active !== undefined) updateData.is_active = is_active;
        if (is_popular !== undefined) updateData.is_popular = is_popular;
        if (stripe_price_id_monthly !== undefined) updateData.stripe_price_id_monthly = stripe_price_id_monthly;
        if (stripe_price_id_yearly !== undefined) updateData.stripe_price_id_yearly = stripe_price_id_yearly;
        updateData.updated_at = new Date().toISOString();

        // Try table API first
        try {
            await db.update('subscription_plans', updateData, { id: parseInt(req.params.id) });
        } catch (updateError) {
            console.log('Table API failed, trying minimal SQL:', updateError.message);
            
            // Try minimal SQL with just essential fields
            try {
                await db.run(`
                    UPDATE subscription_plans 
                    SET name = ?, price_monthly = ?, price_yearly = ?, max_users = ?,
                        features = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [
                    name, price_monthly, price_yearly, max_users,
                    JSON.stringify(features || []), req.params.id
                ]);
            } catch (minimalError) {
                console.log('Minimal SQL failed, trying ultra-minimal:', minimalError.message);
                // Ultra-minimal - just name and price
                await db.run(`
                    UPDATE subscription_plans 
                    SET name = ?, price_monthly = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [name, price_monthly, req.params.id]);
            }
        }

        const plan = await db.get('SELECT * FROM subscription_plans WHERE id = ?', [req.params.id]);
        
        // Log the action
        try {
            await db.run(`
                INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_values, created_at)
                VALUES (?, ?, ?, ?, ?, NOW())
            `, [req.user.id, 'plan_updated', 'subscription_plan', parseInt(req.params.id), JSON.stringify({ name, price_monthly })]);
        } catch (logError) {
            console.log('Audit log insert failed:', logError.message);
        }
        
        res.json({ message: 'Plan updated successfully', plan });
    } catch (error) {
        console.error('Update plan error:', error);
        res.status(500).json({ error: error.message || 'Failed to update plan' });
    }
});

/**
 * @route   GET /api/platform/activity
 * @desc    Get platform-wide activity
 * @access  Super Admin
 */
router.get('/activity', async (req, res) => {
    try {
        const { limit = 50 } = req.query;

        // Try to get activities - handle missing columns gracefully
        let activities = [];
        try {
            activities = await db.all(`
                SELECT id, organization_id, user_id, action, entity_type, entity_id, details, created_at
                FROM audit_log
                ORDER BY created_at DESC
                LIMIT ?
            `, [parseInt(limit)]);
        } catch (queryError) {
            console.log('Activity query failed, trying fallback:', queryError.message);
            // Fallback: try with minimal columns
            try {
                activities = await db.all(`
                    SELECT id, organization_id, user_id, action, created_at
                    FROM audit_log
                    ORDER BY created_at DESC
                    LIMIT ?
                `, [parseInt(limit)]);
            } catch (fallbackError) {
                console.log('Fallback also failed:', fallbackError.message);
                // Return empty activities if table doesn't exist or has issues
                return res.json({ activities: [] });
            }
        }

        // Get org names, user details, and entity details
        const activitiesWithDetails = [];
        for (const activity of activities) {
            let orgName = null;
            let userInfo = { email: null, first_name: null, last_name: null };
            let entityName = null;
            
            // Get organization name
            if (activity.organization_id) {
                try {
                    const org = await db.get('SELECT name FROM organizations WHERE id = ?', [activity.organization_id]);
                    orgName = org?.name;
                } catch (e) {}
            }
            
            // Get user details
            if (activity.user_id) {
                try {
                    const user = await db.get('SELECT email, first_name, last_name FROM users WHERE id = ?', [activity.user_id]);
                    if (user) {
                        userInfo = user;
                    }
                } catch (e) {}
            }
            
            // Get entity name based on entity_type
            if (activity.entity_id && activity.entity_type) {
                try {
                    if (activity.entity_type === 'organization') {
                        const org = await db.get('SELECT name FROM organizations WHERE id = ?', [activity.entity_id]);
                        entityName = org?.name;
                    } else if (activity.entity_type === 'subscription_plan' || activity.entity_type === 'plan') {
                        const plan = await db.get('SELECT name FROM subscription_plans WHERE id = ?', [activity.entity_id]);
                        entityName = plan?.name;
                    } else if (activity.entity_type === 'user') {
                        const user = await db.get('SELECT email FROM users WHERE id = ?', [activity.entity_id]);
                        entityName = user?.email;
                    }
                } catch (e) {}
            }
            
            // Build user display name
            let userDisplay = 'System';
            if (userInfo.email) {
                if (userInfo.first_name && userInfo.last_name) {
                    userDisplay = `${userInfo.first_name} ${userInfo.last_name} (${userInfo.email})`;
                } else {
                    userDisplay = userInfo.email;
                }
            }
            
            activitiesWithDetails.push({
                ...activity,
                entity_type: activity.entity_type || 'unknown',
                entity_name: entityName,
                organization_name: orgName,
                user_email: userDisplay,
                user_first_name: userInfo.first_name,
                user_last_name: userInfo.last_name
            });
        }

        res.json({ activities: activitiesWithDetails });
    } catch (error) {
        console.error('Get activity error:', error);
        res.json({ activities: [] }); // Return empty instead of error
    }
});

/**
 * @route   GET /api/platform/analytics/dashboard
 * @desc    Get dashboard summary with all analytics
 * @access  Super Admin
 */
router.get('/analytics/dashboard', async (req, res) => {
    try {
        const summary = await analyticsService.getDashboardSummary();
        
        if (!summary) {
            return res.status(500).json({ error: 'Failed to fetch dashboard summary' });
        }

        res.json(summary);
    } catch (error) {
        console.error('Get dashboard summary error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard summary' });
    }
});

/**
 * @route   GET /api/platform/analytics/revenue
 * @desc    Get revenue analytics
 * @access  Super Admin
 */
router.get('/analytics/revenue', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        const end = end_date || new Date().toISOString();
        const start = start_date || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        
        const revenue = await analyticsService.getRevenueAnalytics(start, end);
        
        if (!revenue) {
            return res.status(500).json({ error: 'Failed to fetch revenue analytics' });
        }

        res.json(revenue);
    } catch (error) {
        console.error('Get revenue analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch revenue analytics' });
    }
});

/**
 * @route   GET /api/platform/analytics/churn
 * @desc    Get churn analytics
 * @access  Super Admin
 */
router.get('/analytics/churn', async (req, res) => {
    try {
        const { days = 90 } = req.query;
        
        const churn = await analyticsService.getChurnAnalytics(parseInt(days));
        
        if (!churn) {
            return res.status(500).json({ error: 'Failed to fetch churn analytics' });
        }

        res.json(churn);
    } catch (error) {
        console.error('Get churn analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch churn analytics' });
    }
});

/**
 * @route   GET /api/platform/analytics/growth
 * @desc    Get growth metrics
 * @access  Super Admin
 */
router.get('/analytics/growth', async (req, res) => {
    try {
        const { days = 90 } = req.query;
        
        const growth = await analyticsService.getGrowthMetrics(parseInt(days));
        
        if (!growth) {
            return res.status(500).json({ error: 'Failed to fetch growth metrics' });
        }

        res.json(growth);
    } catch (error) {
        console.error('Get growth metrics error:', error);
        res.status(500).json({ error: 'Failed to fetch growth metrics' });
    }
});

/**
 * @route   GET /api/platform/analytics/health
 * @desc    Get organization health metrics
 * @access  Super Admin
 */
router.get('/analytics/health', async (req, res) => {
    try {
        const health = await analyticsService.getOrganizationHealth();
        
        if (!health) {
            return res.status(500).json({ error: 'Failed to fetch health metrics' });
        }

        res.json(health);
    } catch (error) {
        console.error('Get health metrics error:', error);
        res.status(500).json({ error: 'Failed to fetch health metrics' });
    }
});

module.exports = router;
