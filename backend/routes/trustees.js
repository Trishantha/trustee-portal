/**
 * Trustees Routes - Term Management & Notifications
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth-saas');
const { requireTenant } = require('../middleware/tenant');

router.use(authenticate);
router.use(requireTenant);

// GET /api/trustees - Get all trustees with term info
router.get('/', async (req, res) => {
    try {
        const members = await db.all(`
            SELECT om.id, om.role, om.department, om.title, om.joined_at, om.is_active,
                   om.term_length_years, om.term_start_date, om.term_end_date, om.term_renewal_count,
                   u.id as user_id, u.email, u.first_name, u.last_name, u.avatar
            FROM organization_members om
            JOIN users u ON om.user_id = u.id
            WHERE om.organization_id = ? AND om.is_active = 1
            ORDER BY u.last_name, u.first_name
        `, [req.organizationId]);

        res.json({ members });
    } catch (error) {
        console.error('Get trustees error:', error);
        res.status(500).json({ error: 'Failed to fetch trustees' });
    }
});

// GET /api/trustees/stats - Get trustee statistics
router.get('/stats', async (req, res) => {
    try {
        const now = new Date().toISOString().split('T')[0];
        const ninetyDaysLater = new Date();
        ninetyDaysLater.setDate(ninetyDaysLater.getDate() + 90);
        const ninetyDaysStr = ninetyDaysLater.toISOString().split('T')[0];

        const total = await db.get(`
            SELECT COUNT(*) as count FROM organization_members 
            WHERE organization_id = ? AND is_active = 1
        `, [req.organizationId]);

        const termEnding = await db.get(`
            SELECT COUNT(*) as count FROM organization_members 
            WHERE organization_id = ? AND is_active = 1 
            AND term_end_date IS NOT NULL 
            AND term_end_date <= ? AND term_end_date >= ?
        `, [req.organizationId, ninetyDaysStr, now]);

        const termExpired = await db.get(`
            SELECT COUNT(*) as count FROM organization_members 
            WHERE organization_id = ? AND is_active = 1 
            AND term_end_date IS NOT NULL AND term_end_date < ?
        `, [req.organizationId, now]);

        const avgTerm = await db.get(`
            SELECT AVG(term_length_years) as avg FROM organization_members 
            WHERE organization_id = ? AND is_active = 1 AND term_length_years IS NOT NULL
        `, [req.organizationId]);

        res.json({
            total: total.count,
            termEnding: termEnding.count,
            termExpired: termExpired.count,
            avgTermLength: avgTerm.avg ? avgTerm.avg.toFixed(1) : 0
        });
    } catch (error) {
        console.error('Get trustee stats error:', error);
        res.status(500).json({ error: 'Failed to fetch trustee statistics' });
    }
});

// GET /api/trustees/notifications - Get term notifications
router.get('/notifications', async (req, res) => {
    try {
        const now = new Date().toISOString().split('T')[0];
        
        // Get organization settings
        const org = await db.get(`
            SELECT renewal_notification_days FROM organizations WHERE id = ?
        `, [req.organizationId]);

        const notificationDays = org?.renewal_notification_days || 90;
        const notificationDate = new Date();
        notificationDate.setDate(notificationDate.getDate() + notificationDays);
        const notificationDateStr = notificationDate.toISOString().split('T')[0];

        // Find trustees with terms ending within notification period
        const notifications = await db.all(`
            SELECT om.id, om.term_end_date, om.term_length_years, om.term_renewal_count,
                   u.first_name, u.last_name, u.email
            FROM organization_members om
            JOIN users u ON om.user_id = u.id
            WHERE om.organization_id = ? AND om.is_active = 1
            AND om.term_end_date IS NOT NULL
            AND om.term_end_date <= ? AND om.term_end_date >= ?
            AND (om.last_notification_sent IS NULL OR om.last_notification_sent < date('now', '-7 days'))
            ORDER BY om.term_end_date
        `, [req.organizationId, notificationDateStr, now]);

        res.json({ notifications });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// PUT /api/trustees/:id/renew - Renew trustee term
router.put('/:id/renew', requireRole('owner', 'admin', 'chair'), async (req, res) => {
    try {
        const { new_term_length, renewal_notes } = req.body;
        
        // Get current member info
        const member = await db.get(`
            SELECT om.*, u.email, u.first_name, u.last_name, o.max_consecutive_terms
            FROM organization_members om
            JOIN users u ON om.user_id = u.id
            JOIN organizations o ON om.organization_id = o.id
            WHERE om.id = ? AND om.organization_id = ?
        `, [req.params.id, req.organizationId]);

        if (!member) {
            return res.status(404).json({ error: 'Trustee not found' });
        }

        // Check max consecutive terms
        const maxTerms = member.max_consecutive_terms || 2;
        if (member.term_renewal_count >= maxTerms) {
            return res.status(400).json({ 
                error: 'Maximum consecutive terms reached',
                message: `This trustee has already served the maximum of ${maxTerms} consecutive terms. Board vote required for reappointment.`
            });
        }

        // Calculate new term dates
        const newStartDate = new Date().toISOString().split('T')[0];
        const termLength = new_term_length || member.term_length_years || 3;
        const newEndDate = new Date();
        newEndDate.setFullYear(newEndDate.getFullYear() + parseInt(termLength));

        // Update member record
        await db.run(`
            UPDATE organization_members 
            SET term_start_date = ?, 
                term_end_date = ?, 
                term_length_years = ?,
                term_renewal_count = term_renewal_count + 1,
                renewal_notes = ?,
                last_renewal_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND organization_id = ?
        `, [newStartDate, newEndDate.toISOString().split('T')[0], termLength, renewal_notes, req.params.id, req.organizationId]);

        // Log the renewal
        await db.run(`
            INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, new_values)
            VALUES (?, ?, 'trustee_term_renewed', 'organization_members', ?, ?)
        `, [req.organizationId, req.user.id, req.params.id, JSON.stringify({
            term_start_date: newStartDate,
            term_end_date: newEndDate.toISOString().split('T')[0],
            term_length_years: termLength,
            renewal_count: member.term_renewal_count + 1
        })]);

        res.json({ 
            message: 'Trustee term renewed successfully',
            trustee: {
                first_name: member.first_name,
                last_name: member.last_name,
                new_term_end: newEndDate.toISOString().split('T')[0]
            }
        });
    } catch (error) {
        console.error('Renew term error:', error);
        res.status(500).json({ error: 'Failed to renew trustee term' });
    }
});

// PUT /api/trustees/:id/terminate - Terminate trustee
router.put('/:id/terminate', requireRole('owner', 'admin', 'chair'), async (req, res) => {
    try {
        const { termination_reason, termination_date } = req.body;

        const member = await db.get(`
            SELECT om.*, u.email, u.first_name, u.last_name
            FROM organization_members om
            JOIN users u ON om.user_id = u.id
            WHERE om.id = ? AND om.organization_id = ?
        `, [req.params.id, req.organizationId]);

        if (!member) {
            return res.status(404).json({ error: 'Trustee not found' });
        }

        // Deactivate member
        await db.run(`
            UPDATE organization_members 
            SET is_active = 0, 
                termination_reason = ?,
                termination_date = ?,
                terminated_by = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND organization_id = ?
        `, [termination_reason, termination_date || new Date().toISOString().split('T')[0], req.user.id, req.params.id, req.organizationId]);

        // Log the termination
        await db.run(`
            INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, new_values)
            VALUES (?, ?, 'trustee_terminated', 'organization_members', ?, ?)
        `, [req.organizationId, req.user.id, req.params.id, JSON.stringify({
            termination_reason,
            termination_date: termination_date || new Date().toISOString().split('T')[0]
        })]);

        res.json({ 
            message: 'Trustee terminated successfully',
            trustee: {
                first_name: member.first_name,
                last_name: member.last_name
            }
        });
    } catch (error) {
        console.error('Terminate trustee error:', error);
        res.status(500).json({ error: 'Failed to terminate trustee' });
    }
});

// Scheduled job endpoint (called by cron job)
router.post('/check-term-alerts', async (req, res) => {
    try {
        // Verify this is an internal request or authenticated admin
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== process.env.CRON_API_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const now = new Date().toISOString().split('T')[0];
        const alerts = [];

        // Get all organizations with term tracking enabled
        const orgs = await db.all(`
            SELECT id, name, renewal_notification_days, auto_renewal_policy
            FROM organizations 
            WHERE is_active = 1
        `);

        for (const org of orgs) {
            const notificationDays = org.renewal_notification_days || 90;
            const notificationDate = new Date();
            notificationDate.setDate(notificationDate.getDate() + notificationDays);
            const notificationDateStr = notificationDate.toISOString().split('T')[0];

            // Find trustees needing notifications
            const expiringTrustees = await db.all(`
                SELECT om.id, om.term_end_date, u.email, u.first_name, u.last_name
                FROM organization_members om
                JOIN users u ON om.user_id = u.id
                WHERE om.organization_id = ? AND om.is_active = 1
                AND om.term_end_date IS NOT NULL
                AND om.term_end_date <= ? AND om.term_end_date >= ?
                AND (om.last_notification_sent IS NULL OR om.last_notification_sent < date('now', '-7 days'))
            `, [org.id, notificationDateStr, now]);

            for (const trustee of expiringTrustees) {
                // Mark notification sent
                await db.run(`
                    UPDATE organization_members 
                    SET last_notification_sent = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [trustee.id]);

                // Create notification for chairs and admins
                const admins = await db.all(`
                    SELECT u.id FROM organization_members om
                    JOIN users u ON om.user_id = u.id
                    WHERE om.organization_id = ? AND om.role IN ('owner', 'admin', 'chair')
                `, [org.id]);

                for (const admin of admins) {
                    await db.run(`
                        INSERT INTO notifications (organization_id, user_id, type, title, message, link)
                        VALUES (?, ?, 'term_expiring', ?, ?, ?)
                    `, [
                        org.id, 
                        admin.id,
                        'Trustee Term Expiring',
                        `${trustee.first_name} ${trustee.last_name}'s term expires on ${trustee.term_end_date}. Review renewal options.`,
                        `/trustees/${trustee.id}`
                    ]);
                }

                alerts.push({
                    organization: org.name,
                    trustee: `${trustee.first_name} ${trustee.last_name}`,
                    expiryDate: trustee.term_end_date
                });
            }
        }

        res.json({ 
            message: 'Term alerts checked successfully',
            alertsSent: alerts.length,
            alerts
        });
    } catch (error) {
        console.error('Check term alerts error:', error);
        res.status(500).json({ error: 'Failed to check term alerts' });
    }
});

module.exports = router;
