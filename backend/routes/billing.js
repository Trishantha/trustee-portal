/**
 * Billing Routes - Stripe Integration
 * Phase 3: Subscription & Billing
 */

const express = require('express');
const router = express.Router();
const stripeService = require('../services/stripe');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth-saas');

// Webhook endpoint (no auth - called by Stripe)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    try {
        const event = stripeService.constructEvent(req.body, sig, endpointSecret);
        await stripeService.handleWebhookEvent(event);
        res.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error.message);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// All routes below require authentication
router.use(authenticate);

/**
 * @route   GET /api/billing/config
 * @desc    Get Stripe publishable key
 * @access  Organization members
 */
router.get('/config', async (req, res) => {
    res.json({
        publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || null
    });
});

/**
 * @route   GET /api/billing/subscription
 * @desc    Get current subscription details
 * @access  Organization members
 */
router.get('/subscription', async (req, res) => {
    try {
        const { organization } = req;
        
        const subscription = await stripeService.getSubscription(organization.id);
        
        // Get plan details
        const plan = await db.get(
            'SELECT * FROM subscription_plans WHERE id = ?',
            [organization.plan_id]
        );

        res.json({
            subscription: subscription ? {
                id: subscription.id,
                status: subscription.status,
                current_period_start: new Date(subscription.current_period_start * 1000),
                current_period_end: new Date(subscription.current_period_end * 1000),
                cancel_at_period_end: subscription.cancel_at_period_end,
                trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
            } : null,
            plan: plan || null,
            subscription_status: organization.subscription_status,
            trial_ends_at: organization.trial_ends_at
        });
    } catch (error) {
        console.error('Get subscription error:', error);
        res.status(500).json({ error: 'Failed to fetch subscription details' });
    }
});

/**
 * @route   POST /api/billing/checkout
 * @desc    Create Stripe Checkout session for subscription
 * @access  Organization owner/admin
 */
router.post('/checkout', requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { plan_id, billing_cycle = 'monthly' } = req.body;
        const { organization } = req;

        if (!plan_id) {
            return res.status(400).json({ error: 'Plan ID is required' });
        }

        // Get plan details
        const plan = await db.get('SELECT * FROM subscription_plans WHERE id = ?', [plan_id]);
        if (!plan) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        // Check if Stripe is configured
        if (!process.env.STRIPE_SECRET_KEY) {
            return res.status(400).json({ error: 'Stripe not configured' });
        }

        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

        // Create or get customer
        let customerId = organization.stripe_customer_id;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: organization.billing_email || req.user.email,
                name: organization.name,
                metadata: {
                    organization_id: organization.id.toString()
                }
            });
            customerId = customer.id;
            
            // Save customer ID
            await db.run(
                'UPDATE organizations SET stripe_customer_id = ? WHERE id = ?',
                [customerId, organization.id]
            );
        }

        // Get price ID based on billing cycle
        const priceId = billing_cycle === 'yearly' 
            ? (plan.stripe_price_id_yearly || plan.stripe_price_id_monthly)
            : plan.stripe_price_id_monthly;

        if (!priceId) {
            // If no Stripe price ID, create subscription directly in database
            await db.run(
                `UPDATE organizations 
                 SET plan_id = ?, subscription_status = 'active', updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [plan_id, organization.id]
            );
            return res.json({ 
                message: 'Subscription updated',
                subscription: { status: 'active' }
            });
        }

        // Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [{
                price: priceId,
                quantity: 1
            }],
            mode: 'subscription',
            subscription_data: {
                trial_end: organization.trial_ends_at 
                    ? Math.floor(new Date(organization.trial_ends_at).getTime() / 1000)
                    : undefined,
                metadata: {
                    organization_id: organization.id.toString(),
                    plan_id: plan_id.toString()
                }
            },
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/?billing=success`,
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/?billing=cancel`,
            metadata: {
                organization_id: organization.id.toString(),
                plan_id: plan_id.toString()
            }
        });

        res.json({ checkout_url: session.url });
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ error: error.message || 'Failed to create checkout session' });
    }
});

/**
 * @route   POST /api/billing/subscribe
 * @desc    Subscribe to a plan (direct API method)
 * @access  Organization owner/admin
 */
router.post('/subscribe', requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { plan_id, payment_method_id } = req.body;
        const { organization } = req;

        if (!plan_id) {
            return res.status(400).json({ error: 'Plan ID is required' });
        }

        const subscription = await stripeService.createSubscription(
            organization.id,
            plan_id,
            payment_method_id
        );

        res.json({
            message: 'Subscription created successfully',
            subscription: {
                id: subscription.id,
                status: subscription.status,
                current_period_end: new Date(subscription.current_period_end * 1000)
            }
        });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ error: error.message || 'Failed to create subscription' });
    }
});

/**
 * @route   PUT /api/billing/subscription
 * @desc    Update subscription (upgrade/downgrade)
 * @access  Organization owner/admin
 */
router.put('/subscription', requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { plan_id } = req.body;
        const { organization } = req;

        if (!plan_id) {
            return res.status(400).json({ error: 'Plan ID is required' });
        }

        const subscription = await stripeService.updateSubscriptionPlan(
            organization.id,
            plan_id
        );

        res.json({
            message: 'Subscription updated successfully',
            subscription: {
                id: subscription.id,
                status: subscription.status
            }
        });
    } catch (error) {
        console.error('Update subscription error:', error);
        res.status(500).json({ error: error.message || 'Failed to update subscription' });
    }
});

/**
 * @route   DELETE /api/billing/subscription
 * @desc    Cancel subscription
 * @access  Organization owner
 */
router.delete('/subscription', requireRole(['owner']), async (req, res) => {
    try {
        const { immediate } = req.query;
        const { organization } = req;

        const subscription = await stripeService.cancelSubscription(
            organization.id,
            immediate === 'true'
        );

        res.json({
            message: immediate === 'true' ? 
                'Subscription cancelled immediately' : 
                'Subscription will cancel at period end',
            cancel_at_period_end: subscription.cancel_at_period_end
        });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
    }
});

/**
 * @route   POST /api/billing/setup-intent
 * @desc    Create setup intent for adding payment method
 * @access  Organization owner/admin
 */
router.post('/setup-intent', requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { organization } = req;

        // Get or create customer
        let customerId = organization.stripe_customer_id;
        if (!customerId) {
            const customer = await stripeService.createCustomer(
                organization.id,
                organization.billing_email || req.user.email,
                organization.name
            );
            customerId = customer.id;
        }

        const setupIntent = await stripeService.createSetupIntent(customerId);

        res.json({
            client_secret: setupIntent.client_secret
        });
    } catch (error) {
        console.error('Setup intent error:', error);
        res.status(500).json({ error: 'Failed to create setup intent' });
    }
});

/**
 * @route   GET /api/billing/payment-methods
 * @desc    Get saved payment methods
 * @access  Organization owner/admin
 */
router.get('/payment-methods', requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { organization } = req;
        
        if (!organization.stripe_customer_id || !process.env.STRIPE_SECRET_KEY) {
            return res.json({ methods: [] });
        }

        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const paymentMethods = await stripe.paymentMethods.list({
            customer: organization.stripe_customer_id,
            type: 'card'
        });

        // Get default payment method
        const customer = await stripe.customers.retrieve(organization.stripe_customer_id);
        const defaultPaymentMethod = customer.invoice_settings?.default_payment_method;

        res.json({
            methods: paymentMethods.data.map(pm => ({
                id: pm.id,
                card: pm.card,
                is_default: pm.id === defaultPaymentMethod
            }))
        });
    } catch (error) {
        console.error('Get payment methods error:', error);
        res.status(500).json({ error: 'Failed to fetch payment methods' });
    }
});

/**
 * @route   POST /api/billing/payment-methods/default
 * @desc    Set default payment method
 * @access  Organization owner/admin
 */
router.post('/payment-methods/default', requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { method_id } = req.body;
        const { organization } = req;

        if (!organization.stripe_customer_id || !process.env.STRIPE_SECRET_KEY) {
            return res.status(400).json({ error: 'Stripe not configured' });
        }

        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        
        await stripe.customers.update(organization.stripe_customer_id, {
            invoice_settings: {
                default_payment_method: method_id
            }
        });

        res.json({ message: 'Default payment method updated' });
    } catch (error) {
        console.error('Set default payment method error:', error);
        res.status(500).json({ error: 'Failed to update default payment method' });
    }
});

/**
 * @route   POST /api/billing/portal
 * @desc    Create customer portal session
 * @access  Organization owner/admin
 */
router.post('/portal', requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { return_url } = req.body;
        const { organization } = req;

        if (!organization.stripe_customer_id) {
            return res.status(400).json({ error: 'No billing account found' });
        }

        const session = await stripeService.createPortalSession(
            organization.stripe_customer_id,
            return_url || `${process.env.FRONTEND_URL || 'http://localhost:3001'}/billing`
        );

        res.json({ url: session.url });
    } catch (error) {
        console.error('Portal session error:', error);
        res.status(500).json({ error: 'Failed to create portal session' });
    }
});

/**
 * @route   GET /api/billing/invoices
 * @desc    Get billing history/invoices
 * @access  Organization owner/admin
 */
router.get('/invoices', requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { organization } = req;

        if (!organization.stripe_customer_id || !process.env.STRIPE_SECRET_KEY) {
            return res.json({ invoices: [] });
        }

        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const invoices = await stripe.invoices.list({
            customer: organization.stripe_customer_id,
            limit: 24 // Last 24 invoices
        });

        res.json({
            invoices: invoices.data.map(inv => ({
                id: inv.id,
                number: inv.number,
                status: inv.status,
                amount_due: inv.amount_due,
                amount_paid: inv.amount_paid,
                currency: inv.currency,
                created: new Date(inv.created * 1000),
                period_start: new Date(inv.period_start * 1000),
                period_end: new Date(inv.period_end * 1000),
                pdf_url: inv.invoice_pdf,
                hosted_invoice_url: inv.hosted_invoice_url
            }))
        });
    } catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

/**
 * @route   GET /api/billing/usage
 * @desc    Get current usage statistics
 * @access  Organization members
 */
router.get('/usage', async (req, res) => {
    try {
        const { organization } = req;
        const plan = await db.get(
            'SELECT * FROM subscription_plans WHERE id = ?',
            [organization.plan_id]
        );

        // Get current counts
        let userCount = { count: 0 };
        let committeeCount = { count: 0 };
        
        try {
            userCount = await db.get(
                'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ?',
                [organization.id]
            );
        } catch (e) {}

        try {
            committeeCount = await db.get(
                'SELECT COUNT(*) as count FROM committees WHERE organization_id = ?',
                [organization.id]
            );
        } catch (e) {}

        res.json({
            usage: {
                users: {
                    current: userCount?.count || 0,
                    limit: plan?.max_users || 5,
                    percentage: Math.round(((userCount?.count || 0) / (plan?.max_users || 5)) * 100)
                },
                storage: {
                    current: organization.storage_used_mb || 0,
                    limit: plan?.max_storage_mb || 5120,
                    percentage: Math.round(((organization.storage_used_mb || 0) / (plan?.max_storage_mb || 5120)) * 100)
                },
                committees: {
                    current: committeeCount?.count || 0,
                    limit: plan?.max_committees || 3,
                    percentage: Math.round(((committeeCount?.count || 0) / (plan?.max_committees || 3)) * 100)
                }
            },
            plan: plan ? {
                name: plan.name,
                price_monthly: plan.price_monthly,
                price_yearly: plan.price_yearly
            } : null
        });
    } catch (error) {
        console.error('Get usage error:', error);
        res.status(500).json({ error: 'Failed to fetch usage' });
    }
});

module.exports = router;
