/**
 * Email Service
 * Phase 6: Email Service & Notifications
 */

const nodemailer = require('nodemailer');
const db = require('../config/database');

class EmailService {
    constructor() {
        this.transporter = null;
        this.isConfigured = false;
        this.init();
    }

    /**
     * Initialize email transporter
     */
    init() {
        if (process.env.SMTP_HOST && process.env.SMTP_USER) {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: (process.env.SMTP_PORT || 587) == 465,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
            this.isConfigured = true;
        } else {
            console.log('⚠️ Email not configured. Set SMTP_HOST and SMTP_USER environment variables.');
            // Create mock transporter for development
            this.transporter = {
                sendMail: async (options) => {
                    console.log('📧 Mock email sent:', {
                        to: options.to,
                        subject: options.subject
                    });
                    return { messageId: 'mock-' + Date.now() };
                }
            };
        }
    }

    /**
     * Send email
     */
    async sendEmail({ to, subject, html, text, from, attachments }) {
        try {
            const mailOptions = {
                from: from || process.env.SMTP_FROM || 'noreply@trusteeportal.com',
                to,
                subject,
                html,
                text,
                attachments
            };

            const result = await this.transporter.sendMail(mailOptions);
            
            console.log(`✅ Email sent to ${to}: ${subject}`);
            
            return {
                success: true,
                messageId: result.messageId
            };
        } catch (error) {
            console.error('Send email error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send welcome email to new organization
     */
    async sendWelcomeEmail(organization, adminUser) {
        const subject = `Welcome to Trustee Portal - ${organization.name}`;
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏛️ Welcome to Trustee Portal!</h1>
        </div>
        <div class="content">
            <h2>Hello ${adminUser.first_name},</h2>
            <p>Your organization <strong>${organization.name}</strong> has been successfully created!</p>
            
            <h3>Getting Started:</h3>
            <ul>
                <li>Complete your organization profile</li>
                <li>Set up your committees</li>
                <li>Invite your board members</li>
                <li>Schedule your first meeting</li>
            </ul>
            
            <a href="${process.env.FRONTEND_URL}/setup" class="button">Complete Setup</a>
            
            <p><strong>Your trial includes:</strong></p>
            <ul>
                <li>14 days free access</li>
                <li>Full feature access</li>
                <li>No credit card required</li>
            </ul>
            
            <p>Need help? Reply to this email or contact support.</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} Trustee Portal. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;

        const text = `Welcome to Trustee Portal!

Hello ${adminUser.first_name},

Your organization ${organization.name} has been successfully created!

Your trial includes:
- 14 days free access
- Full feature access
- No credit card required

Get started: ${process.env.FRONTEND_URL}/setup

Need help? Contact support.
`;

        return await this.sendEmail({
            to: adminUser.email,
            subject,
            html,
            text
        });
    }

    /**
     * Send trial expiration reminder
     */
    async sendTrialExpirationReminder(organization, daysLeft) {
        const subject = `Your trial expires in ${daysLeft} days - ${organization.name}`;
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .urgent { color: #dc2626; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⏰ Trial Expiring Soon</h1>
        </div>
        <div class="content">
            <h2>Hello,</h2>
            <p class="urgent">Your trial for ${organization.name} expires in ${daysLeft} days.</p>
            
            <p>To continue using Trustee Portal without interruption, please upgrade to a paid plan.</p>
            
            <a href="${process.env.FRONTEND_URL}/admin/billing" class="button">Upgrade Now</a>
            
            <h3>Available Plans:</h3>
            <ul>
                <li><strong>Starter:</strong> $49/month - Up to 5 trustees</li>
                <li><strong>Professional:</strong> $149/month - Up to 25 trustees</li>
                <li><strong>Enterprise:</strong> $399/month - Up to 100 trustees</li>
            </ul>
            
            <p>Questions? Contact our support team.</p>
        </div>
    </div>
</body>
</html>`;

        // Get admin users
        const admins = await db.all(`
            SELECT u.email, u.first_name
            FROM organization_members om
            JOIN users u ON om.user_id = u.id
            WHERE om.organization_id = ? AND om.role IN ('owner', 'admin')
        `, [organization.id]);

        for (const admin of admins) {
            await this.sendEmail({
                to: admin.email,
                subject,
                html
            });
        }
    }

    /**
     * Send payment failed notification
     */
    async sendPaymentFailedNotification(organization, invoice) {
        const subject = `Payment Failed - ${organization.name}`;
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💳 Payment Failed</h1>
        </div>
        <div class="content">
            <h2>Hello,</h2>
            <p>We were unable to process your payment for <strong>${organization.name}</strong>.</p>
            
            <p><strong>Invoice:</strong> #${invoice.number}<br>
            <strong>Amount:</strong> $${(invoice.amount_due / 100).toFixed(2)}</p>
            
            <p>Please update your payment method to avoid service interruption.</p>
            
            <a href="${process.env.FRONTEND_URL}/admin/billing" class="button">Update Payment Method</a>
            
            <p>If you continue to experience issues, please contact support.</p>
        </div>
    </div>
</body>
</html>`;

        // Get billing contact
        const billingEmail = organization.billing_email || organization.email;
        
        await this.sendEmail({
            to: billingEmail,
            subject,
            html
        });
    }

    /**
     * Send invitation email
     */
    async sendInvitationEmail(invitation, organization, invitedBy) {
        const subject = `You've been invited to join ${organization.name} on Trustee Portal`;
        
        const acceptUrl = `${process.env.FRONTEND_URL}/accept-invitation?token=${invitation.token}`;
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📧 You're Invited!</h1>
        </div>
        <div class="content">
            <h2>Hello,</h2>
            <p><strong>${invitedBy.first_name} ${invitedBy.last_name}</strong> has invited you to join <strong>${organization.name}</strong> on Trustee Portal.</p>
            
            <p><strong>Your role:</strong> ${invitation.role}</p>
            
            <a href="${acceptUrl}" class="button">Accept Invitation</a>
            
            <p>This invitation will expire in 7 days.</p>
            
            <p>If you don't have an account yet, you'll be able to create one when you accept.</p>
        </div>
    </div>
</body>
</html>`;

        return await this.sendEmail({
            to: invitation.email,
            subject,
            html
        });
    }

    /**
     * Send password reset email
     */
    async sendPasswordResetEmail(user, resetToken) {
        const subject = 'Password Reset Request - Trustee Portal';
        
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .warning { color: #dc2626; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Password Reset</h1>
        </div>
        <div class="content">
            <h2>Hello ${user.first_name},</h2>
            <p>We received a request to reset your password for Trustee Portal.</p>
            
            <a href="${resetUrl}" class="button">Reset Password</a>
            
            <p class="warning">This link will expire in 1 hour.</p>
            
            <p>If you didn't request this, please ignore this email.</p>
        </div>
    </div>
</body>
</html>`;

        return await this.sendEmail({
            to: user.email,
            subject,
            html
        });
    }

    /**
     * Send limit warning email
     */
    async sendLimitWarning(organization, resource, current, limit, percentage) {
        const subject = `⚠️ ${organization.name} - ${resource} limit warning`;
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .stats { background: white; padding: 15px; border-radius: 6px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ Limit Warning</h1>
        </div>
        <div class="content">
            <h2>Hello,</h2>
            <p>Your organization <strong>${organization.name}</strong> is approaching its ${resource} limit.</p>
            
            <div class="stats">
                <p><strong>Current:</strong> ${current}<br>
                <strong>Limit:</strong> ${limit}<br>
                <strong>Usage:</strong> ${percentage}%</p>
            </div>
            
            <p>Consider upgrading your plan to avoid service interruption.</p>
            
            <a href="${process.env.FRONTEND_URL}/admin/billing" class="button">View Plans</a>
        </div>
    </div>
</body>
</html>`;

        // Get admin users
        const admins = await db.all(`
            SELECT u.email
            FROM organization_members om
            JOIN users u ON om.user_id = u.id
            WHERE om.organization_id = ? AND om.role IN ('owner', 'admin')
        `, [organization.id]);

        for (const admin of admins) {
            await this.sendEmail({
                to: admin.email,
                subject,
                html
            });
        }
    }

    /**
     * Verify email configuration
     */
    async verifyConfiguration() {
        if (!this.isConfigured) {
            return { configured: false, message: 'Email not configured' };
        }

        try {
            await this.transporter.verify();
            return { configured: true, message: 'Email configuration verified' };
        } catch (error) {
            return { configured: false, message: error.message };
        }
    }
}

module.exports = new EmailService();
