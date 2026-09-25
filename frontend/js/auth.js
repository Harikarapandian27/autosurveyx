// Authentication Manager for AutoSurveyor Pro
// Supports Email & Password, Live Email OTP Verification, and Multi-Step Password Reset

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.loginOtpTimer = null;
    this.resetOtpTimer = null;
    this.init();
  }

  init() {
    this.bindEvents();
    this.checkSession();
  }

  bindEvents() {
    // DOM Elements
    const tabLogin = document.getElementById('tab-btn-login');
    const tabRegister = document.getElementById('tab-btn-register');
    const authMainTabs = document.getElementById('auth-main-tabs');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const formForgot = document.getElementById('form-forgot');
    const btnOpenForgot = document.getElementById('btn-open-forgot');
    const btnBackFromForgot = document.getElementById('btn-back-from-forgot');

    // Auth Tab Switching (Sign In / Register)
    if (tabLogin && tabRegister) {
      tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
        if (formForgot) formForgot.classList.add('hidden');
      });

      tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        formRegister.classList.remove('hidden');
        formLogin.classList.add('hidden');
        if (formForgot) formForgot.classList.add('hidden');
      });
    }

    // Open Forgot Password View
    if (btnOpenForgot) {
      btnOpenForgot.addEventListener('click', () => {
        if (formLogin) formLogin.classList.add('hidden');
        if (formRegister) formRegister.classList.add('hidden');
        if (authMainTabs) authMainTabs.classList.add('hidden');
        if (formForgot) {
          formForgot.classList.remove('hidden');
          // Autofill email from login input if already typed
          const loginEmailVal = document.getElementById('login-email')?.value?.trim();
          if (loginEmailVal) {
            const forgotEmailInput = document.getElementById('forgot-email');
            if (forgotEmailInput && !forgotEmailInput.value) {
              forgotEmailInput.value = loginEmailVal;
            }
          }
        }
      });
    }

    // Back from Forgot Password View
    if (btnBackFromForgot) {
      btnBackFromForgot.addEventListener('click', () => {
        if (formForgot) formForgot.classList.add('hidden');
        if (authMainTabs) authMainTabs.classList.remove('hidden');
        if (formLogin) formLogin.classList.remove('hidden');
      });
    }

    // Send Login OTP Button
    const btnSendLoginOtp = document.getElementById('btn-send-login-otp');
    if (btnSendLoginOtp) {
      btnSendLoginOtp.addEventListener('click', async () => {
        const email = document.getElementById('login-email')?.value?.trim();
        if (!email) {
          window.app.showToast('Please enter your email address first', 'error');
          document.getElementById('login-email')?.focus();
          return;
        }

        try {
          btnSendLoginOtp.disabled = true;
          window.app.showLoader('Sending OTP to ' + email + '...');
          const res = await window.api.sendLoginOtp(email);
          
          const statusText = document.getElementById('login-otp-status');
          if (statusText) {
            statusText.textContent = `OTP sent to ${email} (Valid for ${res.expiresInMinutes || 10}m)`;
            statusText.classList.add('active');
          }

          window.app.showToast(res.message || 'OTP sent successfully to your email!', 'success');

          // If development preview OTP is provided
          if (res.previewOtp) {
            const otpInput = document.getElementById('login-otp');
            if (otpInput) otpInput.value = res.previewOtp;
            window.app.showToast(`[Preview OTP]: ${res.previewOtp}`, 'info');
          }

          // Start 60s cooldown timer
          this.startCountdown('login-otp-timer-badge', 'btn-send-login-otp', 'Send OTP', 60);
          document.getElementById('login-otp')?.focus();
        } catch (err) {
          window.app.showToast(err.message || 'Failed to send OTP', 'error');
          btnSendLoginOtp.disabled = false;
        } finally {
          window.app.hideLoader();
        }
      });
    }

    // Login with OTP Only Button
    const btnLoginWithOtpOnly = document.getElementById('btn-login-with-otp-only');
    if (btnLoginWithOtpOnly) {
      btnLoginWithOtpOnly.addEventListener('click', async () => {
        const email = document.getElementById('login-email')?.value?.trim();
        const otp = document.getElementById('login-otp')?.value?.trim();

        if (!email) {
          window.app.showToast('Please enter your official email address', 'error');
          document.getElementById('login-email')?.focus();
          return;
        }

        if (!otp) {
          window.app.showToast('Please enter the 6-digit OTP received on your email, or click Send OTP', 'warning');
          document.getElementById('login-otp')?.focus();
          return;
        }

        try {
          window.app.showLoader('Verifying OTP code...');
          const res = await window.api.loginWithOtp(email, otp);
          window.api.setToken(res.token);
          this.currentUser = res.user;
          this.onAuthSuccess();
          window.app.showToast(`OTP Verified! Welcome back, ${res.user.name}!`, 'success');
        } catch (err) {
          window.app.showToast(err.message || 'OTP verification failed', 'error');
        } finally {
          window.app.hideLoader();
        }
      });
    }

    // Standard Login Form Submit (Password or Password + OTP)
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email')?.value?.trim();
        const password = document.getElementById('login-password')?.value;
        const otp = document.getElementById('login-otp')?.value?.trim();

        if (!email) {
          window.app.showToast('Email address is required', 'error');
          return;
        }

        if (!password && !otp) {
          window.app.showToast('Please enter your password or request an OTP to sign in', 'warning');
          return;
        }

        await this.handleLogin(email, password, otp);
      });
    }

    // Send Password Reset OTP Button
    const btnSendResetOtp = document.getElementById('btn-send-reset-otp');
    if (btnSendResetOtp) {
      btnSendResetOtp.addEventListener('click', async () => {
        const email = document.getElementById('forgot-email')?.value?.trim();
        if (!email) {
          window.app.showToast('Please enter your registered email address', 'error');
          document.getElementById('forgot-email')?.focus();
          return;
        }

        try {
          btnSendResetOtp.disabled = true;
          window.app.showLoader('Sending password reset code to ' + email + '...');
          const res = await window.api.forgotPassword(email);

          const statusText = document.getElementById('forgot-otp-status');
          if (statusText) {
            statusText.textContent = `Reset code sent to ${email} (Valid for ${res.expiresInMinutes || 10}m)`;
            statusText.classList.add('active');
          }

          // Reveal Step 2 container
          const step2Container = document.getElementById('forgot-step-2-container');
          if (step2Container) step2Container.classList.remove('hidden');

          window.app.showToast(res.message || 'Reset code sent to your email!', 'success');

          // If development preview OTP is provided
          if (res.previewOtp) {
            const resetOtpInput = document.getElementById('reset-otp');
            if (resetOtpInput) resetOtpInput.value = res.previewOtp;
            window.app.showToast(`[Preview Reset Code]: ${res.previewOtp}`, 'info');
          }

          this.startCountdown('forgot-otp-timer-badge', 'btn-send-reset-otp', 'Send Reset OTP', 60);
          document.getElementById('reset-otp')?.focus();
        } catch (err) {
          window.app.showToast(err.message || 'Failed to send password reset code', 'error');
          btnSendResetOtp.disabled = false;
        } finally {
          window.app.hideLoader();
        }
      });
    }

    // Submit Password Reset Button
    const btnSubmitResetPassword = document.getElementById('btn-submit-reset-password');
    if (btnSubmitResetPassword) {
      btnSubmitResetPassword.addEventListener('click', async () => {
        const email = document.getElementById('forgot-email')?.value?.trim();
        const otp = document.getElementById('reset-otp')?.value?.trim();
        const newPassword = document.getElementById('reset-new-password')?.value;
        const confirmPassword = document.getElementById('reset-confirm-password')?.value;

        if (!email) {
          window.app.showToast('Email address is required', 'error');
          return;
        }
        if (!otp) {
          window.app.showToast('Please enter the 6-digit OTP reset code', 'error');
          document.getElementById('reset-otp')?.focus();
          return;
        }
        if (!newPassword || newPassword.length < 6) {
          window.app.showToast('New password must be at least 6 characters long', 'error');
          document.getElementById('reset-new-password')?.focus();
          return;
        }
        if (newPassword !== confirmPassword) {
          window.app.showToast('New passwords do not match. Please verify.', 'error');
          document.getElementById('reset-confirm-password')?.focus();
          return;
        }

        try {
          window.app.showLoader('Updating your password...');
          const res = await window.api.resetPassword(email, otp, newPassword);
          window.app.showToast(res.message || 'Password reset successfully!', 'success');

          // Return back to Login Form & prefill updated password
          if (formForgot) formForgot.classList.add('hidden');
          if (authMainTabs) authMainTabs.classList.remove('hidden');
          if (formLogin) {
            formLogin.classList.remove('hidden');
            const loginEmail = document.getElementById('login-email');
            const loginPass = document.getElementById('login-password');
            if (loginEmail) loginEmail.value = email;
            if (loginPass) loginPass.value = newPassword;
          }
        } catch (err) {
          window.app.showToast(err.message || 'Failed to reset password', 'error');
        } finally {
          window.app.hideLoader();
        }
      });
    }

    // Register Form Submit
    if (formRegister) {
      formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        const licenseNo = document.getElementById('reg-license').value.trim();
        const role = document.getElementById('reg-role').value;

        try {
          window.app.showLoader('Creating account...');
          const res = await window.api.register({ name, email, password, licenseNo, role });
          window.api.setToken(res.token);
          this.currentUser = res.user;
          this.onAuthSuccess();
          window.app.showToast('Account registered and logged in successfully!', 'success');
        } catch (err) {
          window.app.showToast(err.message, 'error');
        } finally {
          window.app.hideLoader();
        }
      });
    }

    // Quick Demo Buttons
    const btnDemoAdmin = document.getElementById('btn-demo-admin');
    const btnDemoSurveyor = document.getElementById('btn-demo-surveyor');

    if (btnDemoAdmin) {
      btnDemoAdmin.addEventListener('click', () => {
        document.getElementById('login-email').value = 'admin@surveyor.com';
        document.getElementById('login-password').value = 'admin123';
        const otpInput = document.getElementById('login-otp');
        if (otpInput) otpInput.value = '';
        this.handleLogin('admin@surveyor.com', 'admin123');
      });
    }

    if (btnDemoSurveyor) {
      btnDemoSurveyor.addEventListener('click', () => {
        document.getElementById('login-email').value = 'surveyor@surveyor.com';
        document.getElementById('login-password').value = 'surveyor123';
        const otpInput = document.getElementById('login-otp');
        if (otpInput) otpInput.value = '';
        this.handleLogin('surveyor@surveyor.com', 'surveyor123');
      });
    }

    // Interactive Watermark feedback while entering Main ID, Password, and OTP
    const watermark = document.getElementById('auth-logo-watermark');
    const inputsToWatch = [
      'login-email',
      'login-password',
      'login-otp',
      'forgot-email',
      'reset-otp',
      'reset-new-password',
      'reg-email',
      'reg-password'
    ];

    const activateWatermark = () => watermark && watermark.classList.add('typing-active');
    const deactivateWatermark = () => watermark && watermark.classList.remove('typing-active');

    inputsToWatch.forEach(id => {
      const el = document.getElementById(id);
      if (el && watermark) {
        el.addEventListener('focus', activateWatermark);
        el.addEventListener('blur', deactivateWatermark);
        el.addEventListener('input', activateWatermark);
      }
    });

    // Logout Button
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => this.logout());
    }

    // Unauthorized event listener
    window.addEventListener('auth:unauthorized', () => {
      this.logout();
      window.app.showToast('Session expired. Please log in again.', 'info');
    });
  }

  startCountdown(badgeId, buttonId, defaultButtonText, seconds = 60) {
    const badge = document.getElementById(badgeId);
    const button = document.getElementById(buttonId);
    if (!button) return;

    button.disabled = true;
    if (badge) {
      badge.classList.remove('hidden');
      badge.textContent = `Resend in ${seconds}s`;
    }

    let remaining = seconds;
    const interval = setInterval(() => {
      remaining--;
      if (badge) {
        badge.textContent = `Resend in ${remaining}s`;
      }
      if (remaining <= 0) {
        clearInterval(interval);
        if (badge) badge.classList.add('hidden');
        button.disabled = false;
        button.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"></path><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          <span>Resend OTP</span>
        `;
      }
    }, 1000);
  }

  async handleLogin(email, password, otp) {
    try {
      window.app.showLoader('Authenticating credentials...');
      const res = await window.api.login(email, password, otp);
      window.api.setToken(res.token);
      this.currentUser = res.user;
      this.onAuthSuccess();
      window.app.showToast(`Welcome back, ${res.user.name}!`, 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Login failed', 'error');
    } finally {
      window.app.hideLoader();
    }
  }

  async checkSession() {
    const token = window.api.getToken();
    if (!token) {
      this.showAuthScreen();
      return;
    }

    try {
      const res = await window.api.getMe();
      this.currentUser = res.user;
      this.onAuthSuccess();
    } catch (err) {
      console.warn('Session verification failed:', err);
      this.logout();
    }
  }

  onAuthSuccess() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-main-content').classList.remove('hidden');
    document.getElementById('header-user-menu').classList.remove('hidden');

    // Update user badge in header
    const initials = this.currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('user-avatar-initials').textContent = initials;
    document.getElementById('user-display-name').textContent = this.currentUser.name;

    const rolePill = document.getElementById('user-role-pill');
    rolePill.textContent = this.currentUser.role;
    rolePill.className = 'role-pill ' + (this.currentUser.role === 'admin' ? 'role-admin' : 'role-surveyor');

    // Admin Dashboard role indicators
    const adminNavBtn = document.getElementById('nav-btn-admin-dashboard');
    const adminSideNavBtn = document.getElementById('side-nav-admin-dashboard');
    if (this.currentUser.role === 'admin') {
      if (adminNavBtn) adminNavBtn.setAttribute('title', 'Chief Admin Master Operations Dashboard (All Organization Cases)');
      if (adminSideNavBtn) adminSideNavBtn.setAttribute('title', 'Chief Admin Master Operations Dashboard (All Organization Cases)');
    }

    // Load initial tab
    window.app.switchTab('wizard');
  }

  logout() {
    window.api.setToken(null);
    this.currentUser = null;
    this.showAuthScreen();
  }

  showAuthScreen() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-main-content').classList.add('hidden');
    document.getElementById('header-user-menu').classList.add('hidden');
  }
}

window.auth = new AuthManager();
