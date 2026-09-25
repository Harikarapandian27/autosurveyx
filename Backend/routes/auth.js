const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { createToken, requireAuth } = require('../middleware/auth');
const audit = require('../services/audit');
const config = require('../config');
const emailService = require('../services/emailService');

// POST /api/auth/login (Standard Password / OTP Login - Open to any Email Address)
router.post('/login', async (req, res) => {
  try {
    const { email, password, otp } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email address is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let user = db.findUserByEmail(cleanEmail);

    // If OTP is provided, verify OTP (allows any email address to login immediately)
    if (otp) {
      const otpCheck = db.verifyAndConsumeOtp(cleanEmail, otp, 'login');
      if (!otpCheck.valid) {
        return res.status(400).json({ success: false, error: otpCheck.reason });
      }
      if (!user) {
        user = db.findOrCreateUser(cleanEmail);
      }
    } else {
      // Standard password validation
      if (!password) {
        return res.status(400).json({ success: false, error: 'Password or OTP is required' });
      }

      if (!user) {
        // If user doesn't exist yet, auto-register with this password for seamless entry
        user = db.createUser({
          name: cleanEmail.split('@')[0].replace(/[\._\-0-9]+/g, ' ').trim() || 'Surveyor User',
          email: cleanEmail,
          password: password,
          role: 'surveyor'
        });
      } else {
        const isMatch = bcrypt.compareSync(password, user.passwordHash);
        if (!isMatch) {
          return res.status(401).json({ success: false, error: 'Invalid password. If you forgot your password, click "Forgot Password?" or use "Send OTP".' });
        }
      }
    }

    const token = createToken(user);
    const { passwordHash, ...safeUser } = user;

    audit.log({ user: safeUser, ip: req.ip, headers: req.headers }, 'USER_LOGIN', {
      email: safeUser.email,
      role: safeUser.role,
      method: otp ? 'OTP_AUTH' : 'PASSWORD_AUTH'
    });

    return res.json({
      success: true,
      message: 'Logged in successfully',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/send-login-otp (Dispatch One-Time Password to ANY email address)
router.post('/send-login-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Please enter your email address to receive an OTP' });
    }

    const cleanEmail = email.trim().toLowerCase();
    // Allow any email ID - auto-create/fetch user
    const user = db.findOrCreateUser(cleanEmail);

    const otpCode = emailService.generateOtp();
    db.saveOtp({
      email: cleanEmail,
      otp: otpCode,
      purpose: 'login',
      ttlMinutes: config.EMAIL.OTP_EXPIRY_MINUTES || 10
    });

    // Send email to the respective email address
    const mailResult = await emailService.sendLoginOtpEmail(cleanEmail, otpCode, user.name);

    audit.log({ user: { email: cleanEmail, name: user.name }, ip: req.ip, headers: req.headers }, 'LOGIN_OTP_SENT', {
      email: cleanEmail,
      mode: mailResult.mode
    });

    return res.json({
      success: true,
      message: `A 6-digit verification code has been dispatched to ${cleanEmail}`,
      email: cleanEmail,
      expiresInMinutes: config.EMAIL.OTP_EXPIRY_MINUTES || 10,
      previewOtp: mailResult.mode !== 'smtp' ? otpCode : undefined
    });
  } catch (err) {
    console.error('Send Login OTP error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to send OTP' });
  }
});

// POST /api/auth/login-with-otp (Login with OTP for ANY email address)
router.post('/login-with-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and 6-digit OTP are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const otpCheck = db.verifyAndConsumeOtp(cleanEmail, otp, 'login');
    if (!otpCheck.valid) {
      return res.status(400).json({ success: false, error: otpCheck.reason });
    }

    // Ensure user profile exists
    const user = db.findOrCreateUser(cleanEmail);

    const token = createToken(user);
    const { passwordHash, ...safeUser } = user;

    audit.log({ user: safeUser, ip: req.ip, headers: req.headers }, 'USER_LOGIN_OTP', {
      email: safeUser.email,
      role: safeUser.role
    });

    return res.json({
      success: true,
      message: 'OTP verified successfully! Logged in.',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Login with OTP error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/forgot-password (Dispatch Password Reset OTP to ANY registered or entered email)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Please enter your email address' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = db.findOrCreateUser(cleanEmail);

    const otpCode = emailService.generateOtp();
    db.saveOtp({
      email: cleanEmail,
      otp: otpCode,
      purpose: 'password_reset',
      ttlMinutes: config.EMAIL.OTP_EXPIRY_MINUTES || 10
    });

    // Send reset code email
    const mailResult = await emailService.sendPasswordResetOtpEmail(cleanEmail, otpCode, user.name);

    audit.log({ user: { email: cleanEmail, name: user.name }, ip: req.ip, headers: req.headers }, 'PASSWORD_RESET_OTP_SENT', {
      email: cleanEmail,
      mode: mailResult.mode
    });

    return res.json({
      success: true,
      message: `Password reset code sent to ${cleanEmail}. Please check your inbox.`,
      email: cleanEmail,
      expiresInMinutes: config.EMAIL.OTP_EXPIRY_MINUTES || 10,
      previewOtp: mailResult.mode !== 'smtp' ? otpCode : undefined
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to process password reset' });
  }
});

// POST /api/auth/reset-password (Verify Reset OTP & Set New Password)
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, error: 'Email, OTP verification code, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const otpCheck = db.verifyAndConsumeOtp(cleanEmail, otp, 'password_reset');
    if (!otpCheck.valid) {
      return res.status(400).json({ success: false, error: otpCheck.reason });
    }

    // Update password
    const safeUser = db.updateUserPassword(cleanEmail, newPassword);

    audit.log({ user: safeUser, ip: req.ip, headers: req.headers }, 'PASSWORD_RESET_SUCCESS', {
      email: safeUser.email,
      role: safeUser.role
    });

    return res.json({
      success: true,
      message: 'Password has been successfully updated! You can now log in with your new password.',
      user: safeUser
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to reset password' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, licenseNo, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const newUser = db.createUser({
      name,
      email: email.trim().toLowerCase(),
      password,
      licenseNo: licenseNo || 'IRDA/SLA/' + Math.floor(10000 + Math.random() * 90000),
      role: role === 'admin' ? 'admin' : 'surveyor'
    });

    const token = createToken(newUser);

    audit.log({ user: newUser, ip: req.ip, headers: req.headers }, 'USER_REGISTER', {
      email: newUser.email,
      role: newUser.role
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: newUser
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// GET /api/auth/demo-users
router.get('/demo-users', (req, res) => {
  res.json({
    success: true,
    demoAccounts: [
      {
        role: 'Admin',
        email: config.DEFAULT_ADMIN.email,
        password: config.DEFAULT_ADMIN.password,
        description: 'Full administrative access to all files, logs, and system controls'
      },
      {
        role: 'Surveyor',
        email: config.DEFAULT_SURVEYOR.email,
        password: config.DEFAULT_SURVEYOR.password,
        description: 'Field surveyor account for document upload, extraction, and report generation'
      }
    ]
  });
});

module.exports = router;
