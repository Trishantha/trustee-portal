# Stripe Integration Setup Guide

This guide will help you set up Stripe payments for the Trustee Portal.

## Prerequisites

- Stripe account (create at https://stripe.com)
- Access to your server environment variables

## Step 1: Get Stripe API Keys

1. Log in to your Stripe Dashboard: https://dashboard.stripe.com
2. Go to **Developers** → **API Keys**
3. Copy your **Publishable key** (starts with `pk_test_` or `pk_live_`)
4. Copy your **Secret key** (starts with `sk_test_` or `sk_live_`)

## Step 2: Create Products and Prices

### Option A: Using Stripe Dashboard (Recommended for Testing)

1. Go to **Products** → **Add Product**
2. Create three products:
   - **Starter** - $49/month
   - **Professional** - $149/month  
   - **Enterprise** - $399/month

3. For each product:
   - Enter product name and description
   - Add pricing:
     - **Pricing model**: Standard pricing
     - **Price**: Monthly amount (e.g., $49.00)
     - **Billing period**: Monthly
   - Click "Save product"
   - Note the **Price ID** (format: `price_xxxxx`)

### Option B: Using Stripe CLI (For Advanced Users)

```bash
# Install Stripe CLI first
# Then run:
stripe products create --name="Starter" --description="Up to 5 users"
stripe prices create --product=prod_xxxxx --unit-amount=4900 --currency=usd --recurring={"interval":"month"}
```

## Step 3: Update Environment Variables

Add these to your `.env` file or server environment:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Stripe Price IDs (from Step 2)
STRIPE_PRICE_STARTER_MONTHLY=price_xxxxx
STRIPE_PRICE_PROFESSIONAL_MONTHLY=price_xxxxx
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_xxxxx

# Optional: Yearly plans (10x monthly for 2 months free)
STRIPE_PRICE_STARTER_YEARLY=price_xxxxx
STRIPE_PRICE_PROFESSIONAL_YEARLY=price_xxxxx
STRIPE_PRICE_ENTERPRISE_YEARLY=price_xxxxx
```

## Step 4: Set Up Webhook Endpoint

Webhooks allow Stripe to notify your server of payment events.

### Option A: Using Stripe CLI (Local Development)

```bash
# Install Stripe CLI from https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to your local server
stripe listen --forward-to http://localhost:3001/api/billing/webhook

# This will output your webhook signing secret
# Copy it to your .env file as STRIPE_WEBHOOK_SECRET
```

### Option B: Production Webhook Setup

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Enter your endpoint URL: `https://yourdomain.com/api/billing/webhook`
4. Select these events:
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `checkout.session.completed`
5. Click **Add endpoint**
6. Copy the **Signing secret** and add to `.env`

## Step 5: Database Migration (Supabase)

Run this SQL in your Supabase SQL Editor to add missing billing columns:

```sql
-- Add billing columns to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS billing_email TEXT,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS storage_used_mb INTEGER DEFAULT 0;

-- Add Stripe price IDs to subscription_plans table
ALTER TABLE subscription_plans
ADD COLUMN IF NOT EXISTS stripe_price_id_monthly TEXT,
ADD COLUMN IF NOT EXISTS stripe_price_id_yearly TEXT,
ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT FALSE;

-- Update existing plans with Stripe price IDs
-- Replace price_xxxxx with your actual Stripe Price IDs
UPDATE subscription_plans SET 
    stripe_price_id_monthly = 'price_starter_monthly',
    stripe_price_id_yearly = 'price_starter_yearly'
WHERE slug = 'starter';

UPDATE subscription_plans SET 
    stripe_price_id_monthly = 'price_professional_monthly',
    stripe_price_id_yearly = 'price_professional_yearly',
    is_popular = TRUE
WHERE slug = 'professional';

UPDATE subscription_plans SET 
    stripe_price_id_monthly = 'price_enterprise_monthly',
    stripe_price_id_yearly = 'price_enterprise_yearly'
WHERE slug = 'enterprise';
```

## Step 6: Test the Integration

### Test Mode

1. Use Stripe test keys (starting with `pk_test_` and `sk_test_`)
2. Use test card numbers:
   - **Success**: `4242 4242 4242 4242`
   - **Decline**: `4000 0000 0000 0002`
   - **3D Secure**: `4000 0025 0000 3155`
3. Use any future expiry date and any 3-digit CVC

### Testing Checklist

- [ ] Create a subscription via Billing page
- [ ] Add a payment method
- [ ] View billing history
- [ ] Open Stripe Customer Portal
- [ ] Verify webhooks are received
- [ ] Test subscription cancellation

## Step 7: Go Live

### Switch to Production

1. In Stripe Dashboard, toggle "Test mode" off
2. Copy your **live** API keys (starting with `pk_live_` and `sk_live_`)
3. Create products and prices again in live mode
4. Update environment variables with live keys and price IDs
5. Update webhook endpoint to production URL
6. Deploy your application

### Production Checklist

- [ ] Use live Stripe keys
- [ ] Create live products and prices
- [ ] Update all price IDs in database
- [ ] Set up production webhook endpoint
- [ ] Configure your domain in Stripe settings
- [ ] Enable HTTPS for webhook security
- [ ] Test with real card (small amount, then refund)

## API Endpoints

### Billing Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/billing/config` | Get Stripe publishable key | All members |
| GET | `/api/billing/subscription` | Get current subscription | All members |
| POST | `/api/billing/checkout` | Create Stripe Checkout session | Owner/Admin |
| POST | `/api/billing/subscribe` | Subscribe to plan (API method) | Owner/Admin |
| PUT | `/api/billing/subscription` | Upgrade/downgrade plan | Owner/Admin |
| DELETE | `/api/billing/subscription` | Cancel subscription | Owner |
| POST | `/api/billing/setup-intent` | Add payment method | Owner/Admin |
| GET | `/api/billing/payment-methods` | List saved cards | Owner/Admin |
| POST | `/api/billing/payment-methods/default` | Set default card | Owner/Admin |
| POST | `/api/billing/portal` | Open Stripe Customer Portal | Owner/Admin |
| GET | `/api/billing/invoices` | Get invoice history | Owner/Admin |
| GET | `/api/billing/usage` | Get usage statistics | All members |

### Webhook Endpoint

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/billing/webhook` | Receive Stripe webhooks | No auth required |

## Troubleshooting

### Common Issues

**"Stripe not configured" error**
- Check that `STRIPE_SECRET_KEY` is set in environment variables
- Verify the key starts with `sk_test_` or `sk_live_`

**"No such price" error**
- The Price ID doesn't exist in your Stripe account
- Check that you're using the correct mode (test vs live)
- Verify the Price ID in your database matches Stripe

**Webhooks not working**
- Check webhook secret is correct
- Ensure endpoint URL is accessible from internet
- Verify webhook events are selected in Stripe Dashboard
- Check server logs for webhook errors

**Payment method not saving**
- Check Stripe.js is loaded correctly
- Verify publishable key is correct
- Check browser console for JavaScript errors

### Getting Help

- Stripe Documentation: https://stripe.com/docs
- Stripe Support: https://support.stripe.com
- API Reference: https://stripe.com/docs/api

## Security Notes

1. **Never commit secret keys to Git**
2. **Always use HTTPS in production**
3. **Verify webhook signatures**
4. **Store customer IDs securely**
5. **PCI Compliance**: Using Stripe Checkout and Elements keeps you PCI compliant

## Next Steps

After setup:
1. Customize plan features in the database
2. Set up email notifications for billing events
3. Configure trial periods for new organizations
4. Add usage alerts when approaching limits
5. Set up dunning management for failed payments
