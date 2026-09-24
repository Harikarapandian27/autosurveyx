const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');

// Load user-defined configuration from .env if present (Zero-dependency loader)
const envFile = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envFile)) {
  try {
    const envContent = fs.readFileSync(envFile, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  } catch (e) {
    console.warn('[Config] Could not parse .env file:', e.message);
  }
}

module.exports = {
  PORT: process.env.PORT || 4000,
  JWT_SECRET: process.env.JWT_SECRET || 'surveyor_pro_super_secret_jwt_key_2026',
  JWT_EXPIRES_IN: '24h',
  
  PATHS: {
    ROOT: ROOT_DIR,
    BACKEND: __dirname,
    FRONTEND: path.join(ROOT_DIR, 'frontend'),
    DATA: path.join(ROOT_DIR, 'data'),
    DB: path.join(ROOT_DIR, 'data', 'db'),
    UPLOADS: path.join(ROOT_DIR, 'data', 'uploads'),
    REPORTS: path.join(ROOT_DIR, 'data', 'reports'),
    TEMPLATES: path.join(__dirname, 'templates')
  },
  
  MAX_FILE_SIZE: 25 * 1024 * 1024, // 25 MB
  ALLOWED_EXTENSIONS: ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.doc', '.txt'],
  
  // User-Defined Credentials (loaded from User Input / Environment / .env)
  DEFAULT_ADMIN: {
    name: process.env.ADMIN_NAME || 'Chief Admin Surveyor',
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
    role: 'admin'
  },
  DEFAULT_SURVEYOR: {
    name: process.env.SURVEYOR_NAME || 'Field Surveyor User',
    email: process.env.SURVEYOR_EMAIL || process.env.USER_EMAIL || '',
    password: process.env.SURVEYOR_PASSWORD || process.env.USER_PASSWORD || '',
    role: 'surveyor',
    licenseNo: process.env.SURVEYOR_LICENSE || 'SLA-IRDA-001'
  },

  EMAIL: {
    ENABLED: process.env.ENABLE_SMTP === 'true',
    HOST: process.env.SMTP_HOST || '',
    PORT: parseInt(process.env.SMTP_PORT || '587', 10),
    SECURE: process.env.SMTP_SECURE === 'true',
    USER: process.env.SMTP_USER || '',
    PASS: process.env.SMTP_PASS || '',
    FROM: process.env.EMAIL_FROM || '"AutoSurveyX Security" <noreply@autosurveyx.com>',
    OTP_EXPIRY_MINUTES: 10
  }
};

