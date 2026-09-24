const http = require('http');

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Authentication OTP & Forgot Password Test Suite ---');

  // Test 1: Send Login OTP
  console.log('\n[1] Testing Send Login OTP to surveyor@surveyor.com...');
  const sendOtpRes = await request('/api/auth/send-login-otp', 'POST', { email: 'surveyor@surveyor.com' });
  console.log('Status:', sendOtpRes.status, 'Response:', sendOtpRes.body);
  if (!sendOtpRes.body.success) throw new Error('Send OTP failed');
  const loginOtp = sendOtpRes.body.previewOtp;
  console.log('Obtained Login OTP for verification:', loginOtp);

  // Test 2: Login with OTP
  console.log('\n[2] Testing Login with OTP...');
  const otpLoginRes = await request('/api/auth/login-with-otp', 'POST', { email: 'surveyor@surveyor.com', otp: loginOtp });
  console.log('Status:', otpLoginRes.status, 'User Logged In:', otpLoginRes.body.user?.name, 'Token:', !!otpLoginRes.body.token);
  if (!otpLoginRes.body.token) throw new Error('Login with OTP failed');

  // Test 3: Standard Password Login
  console.log('\n[3] Testing Standard Password Login...');
  const standardLoginRes = await request('/api/auth/login', 'POST', { email: 'surveyor@surveyor.com', password: 'surveyor123' });
  console.log('Status:', standardLoginRes.status, 'Success:', standardLoginRes.body.success);
  if (!standardLoginRes.body.success) throw new Error('Standard password login failed');

  // Test 4: Forgot Password - Send Reset Code
  console.log('\n[4] Testing Forgot Password OTP dispatch...');
  const forgotRes = await request('/api/auth/forgot-password', 'POST', { email: 'surveyor@surveyor.com' });
  console.log('Status:', forgotRes.status, 'Response:', forgotRes.body);
  if (!forgotRes.body.success) throw new Error('Forgot password request failed');
  const resetOtp = forgotRes.body.previewOtp;
  console.log('Obtained Password Reset OTP:', resetOtp);

  // Test 5: Reset Password using OTP
  console.log('\n[5] Testing Password Reset with OTP...');
  const resetRes = await request('/api/auth/reset-password', 'POST', {
    email: 'surveyor@surveyor.com',
    otp: resetOtp,
    newPassword: 'newSurveyorPass2026'
  });
  console.log('Status:', resetRes.status, 'Response:', resetRes.body);
  if (!resetRes.body.success) throw new Error('Password reset failed');

  // Test 6: Verify Login with New Password
  console.log('\n[6] Testing Login with Newly Reset Password...');
  const newPassLogin = await request('/api/auth/login', 'POST', {
    email: 'surveyor@surveyor.com',
    password: 'newSurveyorPass2026'
  });
  console.log('Status:', newPassLogin.status, 'Success with new password:', newPassLogin.body.success);
  if (!newPassLogin.body.success) throw new Error('Login with new password failed');

  // Test 7: Reset back to surveyor123 for seamless demo access
  console.log('\n[7] Re-sending Reset OTP to restore default password surveyor123...');
  const forgotRestore = await request('/api/auth/forgot-password', 'POST', { email: 'surveyor@surveyor.com' });
  const restoreOtp = forgotRestore.body.previewOtp;
  const restoreRes = await request('/api/auth/reset-password', 'POST', {
    email: 'surveyor@surveyor.com',
    otp: restoreOtp,
    newPassword: 'surveyor123'
  });
  console.log('Status:', restoreRes.status, 'Default Password Restored:', restoreRes.body.success);

  console.log('\n✅ ALL AUTHENTICATION, OTP, AND FORGOT PASSWORD TESTS PASSED PERFECTLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
