/**
 * Stripe Service - Payment Processing & Subscription Management
 * Phase 3: Subscription & Billing
 */

const db = require('../config/database');

// Initialize Stripe only if API key is available
const stripe = process.env.STRIPE_SECRET_KEY ? 
    require('stripe')(process.env.STRIPE_SECRET_KEY) : 
    null;

class StripeService {
    /**
     * Check if Stripe is configured
     */
    isConfigured() {
        return stripe !== null;
    }

    /**
     * Create a Stripe customer for an organization
     */
    async createCustomer(organizationId, email, name) {
        if (!this.isConfigured()) {
            console.log('⚠️ Stripe not configured. Mocking customer creation.');
            return { id: `mock_cus_${organizationId}_${Date.now()}` };
        }
        try {
            const customer = await stripe.customers.create({
                email,
                name,
                metadata: {
                    organization_id: organizationId.toString()
                }
            });

            // Update organization with Stripe customer ID
            await db.run(
                'UPDATE organizations SET stripe_customer_id = ? WHERE id = ?',
                [customer.id, organizationId]
            );

            return customer;
        } catch (error) {
            console.error('Stripe create customer error:', error);
            throw error;
        }
    }

    /**
     * Create a subscription for an organization
     */
    async createSubscription(organizationId, planId, paymentMethodId = null) {
        if (!this.isConfigured()) {
            console.log('⚠️ Stripe not configured. Mocking subscription creation.');
            return { id: `mock_sub_${organizationId}`, status: 'active' };
        }
        try {
            // Get organization and plan details
            const organization = await db.get(
                'SELECT * FROM organizations WHERE id = ?',
                [organizationId]
            );

            const plan = await db.get(
                'SELECT * FROM subscription_plans WHERE id = ?',
                [planId]
            );

            if (!organization || !plan) {
                throw new Error('Organization or plan not found');
            }

            // Create customer if not exists
            let customerId = organization.stripe_customer_id;
            if (!customerId) {
                const customer = await this.createCustomer(
                    organizationId,
                    organization.billing_email || organization.email,
                    organization.name
                );
                customerId = customer.id;
            }

            // Attach payment method if provided
            if (paymentMethodId) {
                await stripe.paymentMethods.attach(paymentMethodId, {
                    customer: customerId
                });

                await stripe.customers.update(customerId, {
                    invoice_settings: {
                        default_payment_method: paymentMethodId
                    }
                });
            }

            // Create subscription
            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: plan.stripe_price_id_monthly }],
                trial_end: organization.trial_ends_at ? 
                    Math.floor(new Date(organization.trial_ends_at).getTime() / 1000) : 
                    Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60),
                metadata: {
                    organization_id: organizationId.toString(),
                    plan_id: planId.toString()
                }
            });

            // Update organization
            await db.run(
                `UPDATE organizations 
                 SET stripe_subscription_id = ?,
                     subscription_status = 'active',
                     plan_id = ?,
                     current_period_start = ?,
                     current_period_end = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    subscription.id,
                    planId,
                    new Date(subscription.current_period_start * 1000).toISOString(),
                    new Date(subscription.current_period_end * 1000).toISOString(),
                    organizationId
                ]
            );

            return subscription;
        } catch (error) {
            console.error('Stripe create subscription error:', error);
            throw error;
        }
    }

    /**
     * Cancel a subscription
     */
    async cancelSubscription(organizationId, immediate = false) {
        if (!this.isConfigured()) {
            console.log('⚠️ Stripe not configured. Mocking subscription cancellation.');
            return { id: `mock_sub_${organizationId}`, status: 'cancelled' };
        }
        try {
            const organization = await db.get(
                'SELECT stripe_subscription_id FROM organizations WHERE id = ?',
                [organizationId]
            );

            if (!organization?.stripe_subscription_id) {
                throw new Error('No active subscription found');
            }

            let subscription;
            if (immediate) {
                subscription = await stripe.subscriptions.cancel(
                    organization.stripe_subscription_id
                );
            } else {
                subscription = await stripe.subscriptions.update(
                    organization.stripe_subscription_id,
                    { cancel_at_period_end: true }
                );
            }

            // Update organization status
            await db.run(
                `UPDATE organizations 
                 SET subscription_status = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [immediate ? 'cancelled' : 'active', organizationId]
            );

            return subscription;
        } catch (error) {
            console.error('Stripe cancel subscription error:', error);
            throw error;
        }
    }

    /**
     * Update subscription plan (upgrade/downgrade)
     */
    async updateSubscriptionPlan(organizationId, newPlanId) {
        if (!this.isConfigured()) {
            console.log('⚠️ Stripe not configured. Mocking subscription update.');
            return { id: `mock_sub_${organizationId}`, status: 'active' };
        }
        try {
            const organization = await db.get(
                'SELECT stripe_subscription_id, plan_id FROM organizations WHERE id = ?',
                [organizationId]
            );

            const newPlan = await db.get(
                'SELECT * FROM subscription_plans WHERE id = ?',
                [newPlanId]
            );

            if (!organization?.stripe_subscription_id) {
                // No existing subscription, create new one
                return await this.createSubscription(organizationId, newPlanId);
            }

            // Get current subscription
            const subscription = await stripe.subscriptions.retrieve(
                organization.stripe_subscription_id
            );

            // Update subscription with new price
            const updatedSubscription = await stripe.subscriptions.update(
                organization.stripe_subscription_id,
                {
                    items: [{
                        id: subscription.items.data[0].id,
                        price: newPlan.stripe_price_id_monthly
                    }],
                    metadata: {
                        organization_id: organizationId.toString(),
                        plan_id: newPlanId.toString()
                    }
                }
            );

            // Update organization
            await db.run(
                `UPDATE organizations 
                 SET plan_id = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [newPlanId, organizationId]
            );

            return updatedSubscription;
        } catch (error) {
            console.error('Stripe update subscription error:', error);
            throw error;
        }
    }

    /**
     * Get subscription details
     */
    async getSubscription(organizationId) {
        if (!this.isConfigured()) {
            return null;
        }
        try {
            const organization = await db.get(
                'SELECT stripe_subscription_id FROM organizations WHERE id = ?',
                [organizationId]
            );

            if (!organization?.stripe_subscription_id) {
                return null;
            }

            return await stripe.subscriptions.retrieve(
                organization.stripe_subscription_id
            );
        } catch (error) {
            console.error('Stripe get subscription error:', error);
            throw error;
        }
    }

    /**
     * Create a setup intent for adding payment method
     */
    async createSetupIntent(customerId) {
        if (!this.isConfigured()) {
            return { client_secret: `mock_secret_${Date.now()}` };
        }
        try {
            return await stripe.setupIntents.create({
                customer: customerId,
                payment_method_types: ['card']
            });
        } catch (error) {
            console.error('Stripe create setup intent error:', error);
            throw error;
        }
    }

    /**
     * Get or create customer portal session
     */
    async createPortalSession(customerId, returnUrl) {
        if (!this.isConfigured()) {
            return { url: returnUrl || process.env.FRONTEND_URL || '/' };
        }
        try {
            return await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl
            });
        } catch (error) {
            console.error('Stripe create portal session error:', error);
            throw error;
        }
    }

    /**
     * Handle webhook events
     */
    async handleWebhookEvent(event) {
        console.log(`Processing Stripe webhook: ${event.type}`);

        switch (event.type) {
            case 'invoice.payment_succeeded':
                await this.handlePaymentSucceeded(event.data.object);
                break;

            case 'invoice.payment_failed':
                await this.handlePaymentFailed(event.data.object);
                break;

            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdated(event.data.object);
                break;

            case 'customer.subscription.deleted':
                await this.handleSubscriptionDeleted(event.data.object);
                break;

            case 'customer.subscription.trial_will_end':
                await this.handleTrialWillEnd(event.data.object);
                break;

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
    }

    /**
     * Handle successful payment
     */
    async handlePaymentSucceeded(invoice) {
        const organizationId = invoice.metadata?.organization_id;
        if (!organizationId) return;

        await db.run(
            `UPDATE organizations 
             SET subscription_status = 'active',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [organizationId]
        );

        // Log the payment
        await db.run(
            `INSERT INTO audit_log (organization_id, action, entity_type, new_values, created_at)
             VALUES (?, 'payment_succeeded', 'billing', ?, CURRENT_TIMESTAMP)`,
            [organizationId, JSON.stringify({ amount: invoice.amount_paid, invoice_id: invoice.id })]
        );
    }

    /**
     * Handle failed payment
     */
    async handlePaymentFailed(invoice) {
        const organizationId = invoice.metadata?.organization_id;
        if (!organizationId) return;

        await db.run(
            `UPDATE organizations 
             SET subscription_status = 'past_due',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [organizationId]
        );

        // Log the failed payment
        await db.run(
            `INSERT INTO audit_log (organization_id, action, entity_type, new_values, created_at)
             VALUES (?, 'payment_failed', 'billing', ?, CURRENT_TIMESTAMP)`,
            [organizationId, JSON.stringify({ invoice_id: invoice.id })]
        );
    }

    /**
     * Handle subscription update
     */
    async handleSubscriptionUpdated(subscription) {
        const organizationId = subscription.metadata?.organization_id;
        if (!organizationId) return;

        await db.run(
            `UPDATE organizations 
             SET subscription_status = ?,
                 current_period_start = ?,
                 current_period_end = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                subscription.status,
                new Date(subscription.current_period_start * 1000).toISOString(),
                new Date(subscription.current_period_end * 1000).toISOString(),
                organizationId
            ]
        );
    }

    /**
     * Handle subscription deletion/cancellation
     */
    async handleSubscriptionDeleted(subscription) {
        const organizationId = subscription.metadata?.organization_id;
        if (!organizationId) return;

        await db.run(
            `UPDATE organizations 
             SET subscription_status = 'cancelled',
                 stripe_subscription_id = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [organizationId]
        );
    }

    /**
     * Handle trial ending soon
     */
    async handleTrialWillEnd(subscription) {
        const organizationId = subscription.metadata?.organization_id;
        if (!organizationId) return;

        // This will be used to send email notifications
        console.log(`Trial ending soon for organization ${organizationId}`);
        
        // Log for email notification system
        await db.run(
            `INSERT INTO notifications (organization_id, user_id, type, title, message, created_at)
             SELECT ?, om.user_id, 'billing', 'Trial Ending Soon', 
                    'Your trial period will end in 3 days. Please add a payment method to continue using the service.',
                    CURRENT_TIMESTAMP
             FROM organization_members om
             WHERE om.organization_id = ? AND om.role IN ('owner', 'admin')`,
            [organizationId, organizationId]
        );
    }

    /**
     * Construct webhook event from payload
     */
    constructEvent(payload, signature, secret) {
        if (!this.isConfigured()) {
            throw new Error('Stripe not configured');
        }
        return stripe.webhooks.constructEvent(payload, signature, secret);
    }
}

module.exports = new StripeService();
