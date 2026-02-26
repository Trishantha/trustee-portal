/**
 * Email Service
 * Send emails using nodemailer
 */

import nodemailer from 'nodemailer';
import { Logger } from '../utils/logger';

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

class EmailServiceClass {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured = false;
  
  constructor() {
    this.init();
  }
  
  private init() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: (process.env.SMTP_PORT || '587') === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      this.isConfigured = true;
    } else {
      Logger.warn('Email not configured - using mock transport');
      this.transporter = {
        sendMail: async (options: any) => {
          Logger.info('📧 Mock email sent', { to: options.to, subject: options.subject });
          return { messageId: 'mock-' + Date.now() };
        }
      } as any;
    }
  }
  
  async sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const result = await this.transporter!.sendMail({
        from: options.from || process.env.SMTP_FROM || 'noreply@trusteeportal.com',
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text
      });
      
      Logger.info(`✅ Email sent to ${options.to}: ${options.subject}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      Logger.error('Failed to send email', error as Error, { to: options.to });
      return { success: false, error: (error as Error).message };
    }
  }
  
  async sendWelcomeEmail(user: any, organization: any): Promise<void> {
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏛️ Welcome to Trustee Portal!</h1>
    </div>
    <div class="content">
      <h2>Hello ${user.firstName},</h2>
      <p>Your organization <strong>${organization.name}</strong> has been successfully created!</p>
      <p>Your trial includes 14 days of free access to all features.</p>
      <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Get Started</a>
    </div>
  </div>
</body>
</html>`;

    await this.sendEmail({ to: user.email, subject, html });
  }
  
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const subject = 'Verify your email - Trustee Portal';
    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Verify Your Email</h1>
    <p>Please click the button below to verify your email address:</p>
    <a href="${verifyUrl}" class="button">Verify Email</a>
  </div>
</body>
</html>`;

    await this.sendEmail({ to: email, subject, html });
  }
  
  async sendInvitationEmail(options: {
    to: string;
    organizationName: string;
    inviterName: string;
    role: string;
    department?: string;
    acceptUrl: string;
  }): Promise<void> {
    const subject = `You've been invited to join ${options.organizationName}`;
    
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
      <p><strong>${options.inviterName}</strong> has invited you to join <strong>${options.organizationName}</strong> on Trustee Portal.</p>
      <p><strong>Your role:</strong> ${options.role}</p>
      ${options.department ? `<p><strong>Department:</strong> ${options.department}</p>` : ''}
      <a href="${options.acceptUrl}" class="button">Accept Invitation</a>
      <p>This invitation will expire in 7 days.</p>
    </div>
  </div>
</body>
</html>`;

    await this.sendEmail({ to: options.to, subject, html });
  }
  
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const subject = 'Password Reset Request - Trustee Portal';
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .warning { color: #dc2626; }
  </style>
</head>
<body>
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1>🔐 Password Reset</h1>
    <p>We received a request to reset your password.</p>
    <a href="${resetUrl}" class="button">Reset Password</a>
    <p class="warning">This link will expire in 1 hour.</p>
    <p>If you didn't request this, please ignore this email.</p>
  </div>
</body>
</html>`;

    await this.sendEmail({ to: email, subject, html });
  }
  
  async sendPasswordChangedConfirmation(email: string): Promise<void> {
    const subject = 'Your password has been changed - Trustee Portal';
    
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1>🔐 Password Changed</h1>
  <p>Your password has been successfully changed.</p>
  <p>If you didn't make this change, please contact support immediately.</p>
</body>
</html>`;

    await this.sendEmail({ to: email, subject, html });
  }
  
  async sendSecurityAlert(email: string, type: string, details: any): Promise<void> {
    const subject = 'Security Alert - Trustee Portal';
    
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1>⚠️ Security Alert</h1>
  <p>We detected a security event on your account: <strong>${type}</strong></p>
  <p>IP Address: ${details.ipAddress || 'Unknown'}</p>
  <p>Time: ${new Date().toISOString()}</p>
  <p>If this wasn't you, please contact support immediately.</p>
</body>
</html>`;

    await this.sendEmail({ to: email, subject, html });
  }
  
  async sendReactivationEmail(email: string, organizationName: string): Promise<void> {
    const subject = `Your membership in ${organizationName} has been reactivated`;
    
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1>Membership Reactivated</h1>
  <p>Your membership in <strong>${organizationName}</strong> has been reactivated.</p>
  <a href="${process.env.FRONTEND_URL}/dashboard" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Go to Dashboard</a>
</body>
</html>`;

    await this.sendEmail({ to: email, subject, html });
  }
  
  async sendAddedToOrganizationEmail(email: string, organizationName: string, role: string): Promise<void> {
    const subject = `You've been added to ${organizationName}`;
    
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1>Added to Organization</h1>
  <p>You've been added to <strong>${organizationName}</strong> as a ${role}.</p>
  <a href="${process.env.FRONTEND_URL}/dashboard" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Go to Dashboard</a>
</body>
</html>`;

    await this.sendEmail({ to: email, subject, html });
  }
  
  async sendInvitationAcceptedNotification(inviterEmail: string, newUserEmail: string, organizationName: string): Promise<void> {
    const subject = `Invitation accepted - ${organizationName}`;
    
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1>Invitation Accepted</h1>
  <p><strong>${newUserEmail}</strong> has accepted your invitation to join <strong>${organizationName}</strong>.</p>
</body>
</html>`;

    await this.sendEmail({ to: inviterEmail, subject, html });
  }
}

export const EmailService = new EmailServiceClass();
