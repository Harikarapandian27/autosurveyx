const nodemailer = require('nodemailer');
const config = require('../config');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.initTransporter();
  }

  initTransporter() {
    const emailConfig = config.EMAIL;

    if (emailConfig.HOST && emailConfig.USER) {
      try {
        this.transporter = nodemailer.createTransport({
          host: emailConfig.HOST,
          port: emailConfig.PORT,
          secure: emailConfig.SECURE,
          auth: {
            user: emailConfig.USER,
            pass: emailConfig.PASS
          }
        });
        this.initialized = true;
        console.log(`[EmailService] Configured custom SMTP server (${emailConfig.HOST}:${emailConfig.PORT})`);
      } catch (err) {
        console.error('[EmailService] Failed to initialize custom SMTP:', err);
      }
    } else {
      console.log('[EmailService] SMTP credentials not set in environment. Running in development preview mode (OTP logged & returned in response for testing).');
    }
  }

  /**
   * Generate a secure 6-digit numeric OTP
   */
  generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Send Login Verification OTP
   */
  async sendLoginOtpEmail(toEmail, otpCode, userName = 'Surveyor') {
    const subject = `🔐 ${otpCode} is your AutoSurveyX Login Verification Code`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; margin: 0; padding: 24px; }
          .container { max-width: 540px; margin: 0 auto; background: #111827; border: 1px solid #1e293b; border-radius: 12px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { text-align: center; border-bottom: 1px solid #1e293b; padding-bottom: 20px; margin-bottom: 24px; }
          .logo-title { font-size: 22px; font-weight: 800; color: #38bdf8; letter-spacing: 0.5px; margin: 0; }
          .logo-sub { font-size: 12px; color: #94a3b8; margin-top: 4px; }
          .greeting { font-size: 16px; color: #e2e8f0; margin-bottom: 16px; }
          .message { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
          .otp-box { background: rgba(37, 99, 235, 0.12); border: 2px dashed #38bdf8; border-radius: 10px; text-align: center; padding: 20px; margin-bottom: 24px; }
          .otp-code { font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #38bdf8; font-family: 'Courier New', Courier, monospace; }
          .otp-expiry { font-size: 12px; color: #64748b; margin-top: 8px; }
          .security-note { background: #1e293b; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #cbd5e1; line-height: 1.5; }
          .footer { text-align: center; font-size: 11px; color: #64748b; margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="logo-title">AutoSurveyX</h1>
            <div class="logo-sub">Intelligent Vehicle Survey & Loss Assessment Platform</div>
          </div>
          <div class="greeting">Hello, <strong>${userName}</strong></div>
          <div class="message">
            We received a sign-in request for your official surveyor account (<code>${toEmail}</code>). Please use the One-Time Password (OTP) below to authenticate your session:
          </div>
          <div class="otp-box">
            <div class="otp-code">${otpCode}</div>
            <div class="otp-expiry">Valid for <strong>${config.EMAIL.OTP_EXPIRY_MINUTES} minutes</strong>. Single-use only.</div>
          </div>
          <div class="security-note">
            ⚠️ <strong>Security Advisory:</strong> Never share this OTP with anyone, including AutoSurveyX staff. If you did not initiate this login, please change your password immediately.
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} AutoSurveyX Systems. All rights reserved. Automated security notification.
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({
      to: toEmail,
      subject,
      text: `Your AutoSurveyX Login OTP is: ${otpCode}. It is valid for ${config.EMAIL.OTP_EXPIRY_MINUTES} minutes. Do not share this code with anyone.`,
      html
    });
  }

  /**
   * Send Password Reset OTP
   */
  async sendPasswordResetOtpEmail(toEmail, otpCode, userName = 'Surveyor') {
    const subject = `🔑 ${otpCode} is your AutoSurveyX Password Reset Code`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; margin: 0; padding: 24px; }
          .container { max-width: 540px; margin: 0 auto; background: #111827; border: 1px solid #1e293b; border-radius: 12px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { text-align: center; border-bottom: 1px solid #1e293b; padding-bottom: 20px; margin-bottom: 24px; }
          .logo-title { font-size: 22px; font-weight: 800; color: #ec4899; letter-spacing: 0.5px; margin: 0; }
          .logo-sub { font-size: 12px; color: #94a3b8; margin-top: 4px; }
          .greeting { font-size: 16px; color: #e2e8f0; margin-bottom: 16px; }
          .message { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
          .otp-box { background: rgba(236, 72, 153, 0.12); border: 2px dashed #ec4899; border-radius: 10px; text-align: center; padding: 20px; margin-bottom: 24px; }
          .otp-code { font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #f472b6; font-family: 'Courier New', Courier, monospace; }
          .otp-expiry { font-size: 12px; color: #64748b; margin-top: 8px; }
          .security-note { background: #1e293b; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #cbd5e1; line-height: 1.5; }
          .footer { text-align: center; font-size: 11px; color: #64748b; margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="logo-title">AutoSurveyX</h1>
            <div class="logo-sub">Intelligent Vehicle Survey Platform — Security Center</div>
          </div>
          <div class="greeting">Hello, <strong>${userName}</strong></div>
          <div class="message">
            We received a request to reset the password for your account associated with <code>${toEmail}</code>. Enter this verification code to complete your password reset:
          </div>
          <div class="otp-box">
            <div class="otp-code">${otpCode}</div>
            <div class="otp-expiry">Valid for <strong>${config.EMAIL.OTP_EXPIRY_MINUTES} minutes</strong>. Single-use only.</div>
          </div>
          <div class="security-note">
            ⚠️ <strong>Security Notice:</strong> If you did not request a password reset, you can safely ignore this email or contact your Chief Administrator.
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} AutoSurveyX Systems. All rights reserved. Automated security notification.
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({
      to: toEmail,
      subject,
      text: `Your AutoSurveyX Password Reset Code is: ${otpCode}. It is valid for ${config.EMAIL.OTP_EXPIRY_MINUTES} minutes.`,
      html
    });
  }

  /**
   * Internal Mail Dispatcher
   */
  async sendMail({ to, subject, text, html }) {
    console.log(`\n======================================================`);
    console.log(`📧 [EMAIL NOTIFICATION]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Content: ${text}`);
    console.log(`======================================================\n`);

    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: config.EMAIL.FROM,
          to,
          subject,
          text,
          html
        });
        console.log('[EmailService] Email sent successfully:', info.messageId);
        return { sent: true, messageId: info.messageId, mode: 'smtp' };
      } catch (err) {
        console.error('[EmailService] SMTP Dispatch failed:', err.message);
        return { sent: false, error: err.message, mode: 'smtp_failed' };
      }
    }

    // Development/Local Simulation Mode
    return {
      sent: true,
      mode: 'dev_preview',
      message: 'Email dispatched via Dev Preview Mode (logged to console & returned in API preview)'
    };
  }
}

module.exports = new EmailService();
