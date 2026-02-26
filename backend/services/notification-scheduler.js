/**
 * Notification Scheduler Service
 * Phase 6: Automated Notifications & Reminders
 * Updated for Supabase PostgreSQL compatibility
 */

const db = require('../config/database');
const emailService = require('./email');
const usageTracker = require('./usage-tracker');

class NotificationScheduler {
    constructor() {
        this.isRunning = false;
        this.intervals = [];
    }

    /**
     * Start all scheduled tasks
     */
    start() {
        if (this.isRunning) return;
        
        console.log('🔄 Starting notification scheduler...');
        this.isRunning = true;

        // Check trial expirations daily
        this.intervals.push(setInterval(() => {
            this.checkTrialExpirations();
        }, 24 * 60 * 60 * 1000)); // 24 hours

        // Check limit warnings hourly
        this.intervals.push(setInterval(() => {
            this.checkLimitWarnings();
        }, 60 * 60 * 1000)); // 1 hour

        // Check past due subscriptions daily
        this.intervals.push(setInterval(() => {
            this.checkPastDueSubscriptions();
        }, 24 * 60 * 60 * 1000)); // 24 hours

        // Run immediately on start
        this.checkTrialExpirations();
        this.checkLimitWarnings();
        this.checkPastDueSubscriptions();

        console.log('✅ Notification scheduler started');
    }

    /**
     * Stop all scheduled tasks
     */
    stop() {
        this.intervals.forEach(clearInterval);
        this.intervals = [];
        this.isRunning = false;
        console.log('⏹️ Notification scheduler stopped');
    }

    /**
     * Check for trial expirations and send reminders
     */
    async checkTrialExpirations() {
        try {
            console.log('📧 Checking trial expirations...');

            const now = new Date();
            const threeDaysFromNow = new Date(now);
            threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
            const twoDaysFromNow = new Date(now);
            twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
            const oneDayFromNow = new Date(now);
            oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

            // Get all trial organizations
            const trials = await db.query('organizations', {
                where: { subscription_status: 'trial' },
                select: 'id, name, trial_ends_at, billing_email'
            });

            // Get plans for lookup
            const plans = await db.query('subscription_plans', {
                select: 'id, name'
            });
            const planMap = {};
            plans.forEach(p => planMap[p.id] = p);

            // Get recent notifications to avoid duplicates
            const recentNotifications = await db.query('notifications', {
                where: { type: 'trial_reminder' }
            });
            const notifiedOrgIds = new Set(recentNotifications.map(n => n.organization_id));

            let remindersSent = 0;

            for (const org of trials) {
                const trialEnds = new Date(org.trial_ends_at);
                
                // Skip if already notified recently
                if (notifiedOrgIds.has(org.id)) continue;

                // Check if expiring in 3 days
                if (trialEnds <= threeDaysFromNow && trialEnds > twoDaysFromNow) {
                    await emailService.sendTrialExpirationReminder?.(org, 3);
                    await this.createNotification(org.id, null, 'trial_reminder', 
                        'Trial Expiring Soon', 
                        'Your trial will expire in 3 days.');
                    remindersSent++;
                }
                // Check if expiring in 1 day
                else if (trialEnds <= oneDayFromNow && trialEnds > now) {
                    await emailService.sendTrialExpirationReminder?.(org, 1);
                    await this.createNotification(org.id, null, 'trial_reminder',
                        'Trial Expires Tomorrow',
                        'Your trial will expire tomorrow.');
                    remindersSent++;
                }
            }

            console.log(`✅ Sent ${remindersSent} trial reminders`);
        } catch (error) {
            console.error('Check trial expirations error:', error);
        }
    }

    /**
     * Check for organizations approaching limits
     */
    async checkLimitWarnings() {
        try {
            console.log('📊 Checking limit warnings...');

            const warnings = await usageTracker.sendLimitWarnings?.() || [];

            for (const warning of warnings) {
                // Get organization
                const org = await db.query('organizations', {
                    where: { id: warning.organization_id },
                    limit: 1
                });

                if (org && org[0]) {
                    const organization = org[0];
                    await emailService.sendLimitWarning?.(
                        organization,
                        warning.resource,
                        warning.current,
                        warning.limit,
                        warning.percentage
                    );

                    // Get admins
                    const admins = await db.query('organization_members', {
                        where: { 
                            organization_id: warning.organization_id,
                            role: ['owner', 'admin']
                        },
                        select: 'user_id'
                    });

                    for (const admin of admins) {
                        await this.createNotification(
                            warning.organization_id,
                            admin.user_id,
                            'limit_warning',
                            `${warning.resource} limit warning`,
                            `You are using ${warning.percentage}% of your ${warning.resource} limit.`
                        );
                    }
                }
            }

            console.log(`✅ Sent ${warnings.length} limit warnings`);
        } catch (error) {
            console.error('Check limit warnings error:', error);
        }
    }

    /**
     * Check past due subscriptions
     */
    async checkPastDueSubscriptions() {
        try {
            console.log('💳 Checking past due subscriptions...');

            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

            // Get past due organizations
            const pastDueOrgs = await db.query('organizations', {
                where: { subscription_status: 'past_due' }
            });

            // Filter those updated more than 3 days ago
            const filtered = pastDueOrgs.filter(org => {
                const updated = new Date(org.updated_at || org.created_at);
                return updated < threeDaysAgo;
            });

            // Get recent past due notifications
            const recentNotifications = await db.query('notifications', {
                where: { type: 'past_due_warning' }
            });
            const notifiedOrgIds = new Set(recentNotifications.map(n => n.organization_id));

            let warningsSent = 0;

            for (const org of filtered) {
                // Skip if already notified
                if (notifiedOrgIds.has(org.id)) continue;

                const billingEmail = org.billing_email || org.contact_email;
                
                if (billingEmail) {
                    // Send warning email
                    const html = `
                        <h2>Payment Overdue</h2>
                        <p>Your payment for ${org.name} is 3+ days overdue.</p>
                        <p>Please update your payment method to avoid service suspension.</p>
                    `;

                    await emailService.sendEmail?.({
                        to: billingEmail,
                        subject: `Payment Overdue - ${org.name}`,
                        html
                    });

                    // Get admins
                    const admins = await db.query('organization_members', {
                        where: { 
                            organization_id: org.id,
                            role: ['owner', 'admin']
                        },
                        select: 'user_id'
                    });

                    for (const admin of admins) {
                        await this.createNotification(
                            org.id,
                            admin.user_id,
                            'past_due_warning',
                            'Payment Overdue',
                            'Your payment is 3+ days overdue. Please update your payment method.'
                        );
                    }
                    warningsSent++;
                }
            }

            console.log(`✅ Sent ${warningsSent} past due warnings`);
        } catch (error) {
            console.error('Check past due subscriptions error:', error);
        }
    }

    /**
     * Create in-app notification
     */
    async createNotification(organizationId, userId, type, title, message, link = null) {
        try {
            await db.insert('notifications', {
                organization_id: organizationId,
                user_id: userId,
                type,
                title,
                message,
                link,
                created_at: new Date().toISOString(),
                read: false
            });
        } catch (error) {
            console.error('Create notification error:', error);
        }
    }

    /**
     * Send immediate notification (not scheduled)
     */
    async sendImmediateNotification(organizationId, userIds, type, title, message, link = null) {
        try {
            // Create in-app notifications
            for (const userId of userIds) {
                await this.createNotification(organizationId, userId, type, title, message, link);
            }

            // Send emails if appropriate
            // TODO: Implement email sending based on user preferences
        } catch (error) {
            console.error('Send immediate notification error:', error);
        }
    }

    /**
     * Send bulk notification to organization
     */
    async sendOrganizationNotification(organizationId, type, title, message, link = null) {
        try {
            // Get all organization members
            const members = await db.query('organization_members', {
                where: { organization_id: organizationId },
                select: 'user_id'
            });

            const userIds = members.map(m => m.user_id);
            await this.sendImmediateNotification(organizationId, userIds, type, title, message, link);
        } catch (error) {
            console.error('Send organization notification error:', error);
        }
    }
}

module.exports = new NotificationScheduler();
