const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('./config');

class JsonDatabase {
  constructor() {
    this.dbDir = config.PATHS.DB;
    this.collections = {
      users: path.join(this.dbDir, 'users.json'),
      surveys: path.join(this.dbDir, 'surveys.json'),
      files: path.join(this.dbDir, 'files.json'),
      templates: path.join(this.dbDir, 'templates.json'),
      audit_logs: path.join(this.dbDir, 'audit_logs.json'),
      otps: path.join(this.dbDir, 'otps.json')
    };

    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }

    this.initDatabase();
  }

  _read(file) {
    try {
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, '[]', 'utf8');
        return [];
      }
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data || '[]');
    } catch (err) {
      console.error(`Error reading ${file}:`, err);
      return [];
    }
  }

  _write(file, data) {
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error(`Error writing ${file}:`, err);
      return false;
    }
  }

  initDatabase() {
    // 1. Seed users if empty
    const users = this._read(this.collections.users);
    if (users.length === 0) {
      const salt = bcrypt.genSaltSync(10);
      const adminPasswordHash = bcrypt.hashSync(config.DEFAULT_ADMIN.password, salt);
      const surveyorPasswordHash = bcrypt.hashSync(config.DEFAULT_SURVEYOR.password, salt);

      const defaultUsers = [
        {
          id: 'usr_admin_001',
          name: config.DEFAULT_ADMIN.name,
          email: config.DEFAULT_ADMIN.email,
          passwordHash: adminPasswordHash,
          role: 'admin',
          createdAt: new Date().toISOString()
        },
        {
          id: 'usr_surv_001',
          name: config.DEFAULT_SURVEYOR.name,
          email: config.DEFAULT_SURVEYOR.email,
          passwordHash: surveyorPasswordHash,
          role: 'surveyor',
          licenseNo: config.DEFAULT_SURVEYOR.licenseNo,
          createdAt: new Date().toISOString()
        }
      ];
      this._write(this.collections.users, defaultUsers);
    }

    // Ensure all other collections exist
    for (const key of ['surveys', 'files', 'templates', 'audit_logs', 'otps']) {
      this._read(this.collections[key]);
    }
  }

  // --- Users ---
  getUsers() {
    return this._read(this.collections.users).map(u => {
      const { passwordHash, ...safe } = u;
      return safe;
    });
  }

  findUserByEmail(email) {
    if (!email) return null;
    const users = this._read(this.collections.users);
    return users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  }

  findUserById(id) {
    const users = this._read(this.collections.users);
    const user = users.find(u => u.id === id);
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  }

  createUser(userData) {
    const users = this._read(this.collections.users);
    if (users.some(u => u.email.toLowerCase() === userData.email.trim().toLowerCase())) {
      throw new Error('User with this email already exists');
    }
    const salt = bcrypt.genSaltSync(10);
    const newUser = {
      id: 'usr_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: userData.name,
      email: userData.email.trim(),
      passwordHash: bcrypt.hashSync(userData.password, salt),
      role: userData.role || 'surveyor',
      licenseNo: userData.licenseNo || '',
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    this._write(this.collections.users, users);
    const { passwordHash, ...safe } = newUser;
    return safe;
  }

  findOrCreateUser(email, name = '') {
    if (!email) throw new Error('Email address is required');
    const cleanEmail = email.trim().toLowerCase();
    let existingUser = this.findUserByEmail(cleanEmail);
    if (existingUser) {
      return existingUser;
    }

    // Auto-generate display name from email if not provided (e.g. 192421073.simats -> Simats)
    const emailPrefix = cleanEmail.split('@')[0];
    const generatedName = name || emailPrefix
      .replace(/[0-9]+/g, ' ')
      .replace(/[\._\-]+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'Surveyor ' + emailPrefix.slice(0, 5);

    const salt = bcrypt.genSaltSync(10);
    const tempPassword = 'User@' + Math.floor(100000 + Math.random() * 900000);
    const users = this._read(this.collections.users);

    const newUser = {
      id: 'usr_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: generatedName,
      email: cleanEmail,
      passwordHash: bcrypt.hashSync(tempPassword, salt),
      role: 'surveyor',
      licenseNo: 'IRDA/SLA/' + Math.floor(10000 + Math.random() * 90000),
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this._write(this.collections.users, users);
    return newUser;
  }

  updateUserPassword(email, newPassword) {
    if (!email || !newPassword) {
      throw new Error('Email and new password are required');
    }
    const cleanEmail = email.trim().toLowerCase();
    let users = this._read(this.collections.users);
    let userIdx = users.findIndex(u => u.email.toLowerCase() === cleanEmail);
    
    // If user does not exist yet, create user and set their password
    if (userIdx === -1) {
      this.findOrCreateUser(cleanEmail);
      users = this._read(this.collections.users);
      userIdx = users.findIndex(u => u.email.toLowerCase() === cleanEmail);
    }

    const salt = bcrypt.genSaltSync(10);
    users[userIdx].passwordHash = bcrypt.hashSync(newPassword, salt);
    users[userIdx].updatedAt = new Date().toISOString();
    this._write(this.collections.users, users);
    const { passwordHash, ...safe } = users[userIdx];
    return safe;
  }


  // --- OTP Verification Management ---
  saveOtp({ email, otp, purpose = 'login', ttlMinutes = 10 }) {
    let otps = this._read(this.collections.otps);
    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();
    const expiresAt = now + (ttlMinutes * 60 * 1000);

    // Invalidate previous unconsumed OTPs for same email & purpose
    otps = otps.filter(o => !(o.email === normalizedEmail && o.purpose === purpose));

    const record = {
      id: 'otp_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      email: normalizedEmail,
      otp: String(otp).trim(),
      purpose, // 'login' or 'password_reset'
      createdAt: new Date().toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      consumed: false
    };

    otps.push(record);
    // Cleanup expired records older than 1 hour
    otps = otps.filter(o => new Date(o.expiresAt).getTime() > (now - 3600000));
    this._write(this.collections.otps, otps);
    return record;
  }

  verifyAndConsumeOtp(email, otp, purpose = 'login') {
    if (!email || !otp) return { valid: false, reason: 'Email and OTP are required' };
    const otps = this._read(this.collections.otps);
    const normalizedEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();
    const now = Date.now();

    const record = otps.find(o => 
      o.email === normalizedEmail && 
      o.purpose === purpose && 
      !o.consumed && 
      new Date(o.expiresAt).getTime() > now
    );

    if (!record) {
      return { valid: false, reason: 'Invalid or expired OTP. Please request a fresh OTP.' };
    }

    if (record.otp !== cleanOtp) {
      return { valid: false, reason: 'Incorrect OTP entered. Please check and try again.' };
    }

    // Mark as consumed
    record.consumed = true;
    record.consumedAt = new Date().toISOString();
    this._write(this.collections.otps, otps);

    return { valid: true, record };
  }


  // --- Surveys ---
  getSurveys(filter = {}) {
    let surveys = this._read(this.collections.surveys);
    if (filter.surveyorId) {
      surveys = surveys.filter(s => s.surveyorId === filter.surveyorId);
    }
    if (filter.search) {
      const s = filter.search.toLowerCase();
      surveys = surveys.filter(
        item =>
          (item.caseNumber && item.caseNumber.toLowerCase().includes(s)) ||
          (item.vehicleRegNo && item.vehicleRegNo.toLowerCase().includes(s)) ||
          (item.insurer && item.insurer.toLowerCase().includes(s)) ||
          (item.ownerName && item.ownerName.toLowerCase().includes(s))
      );
    }
    return surveys.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  getSurveyById(id) {
    const surveys = this._read(this.collections.surveys);
    return surveys.find(s => s.id === id);
  }

  createSurvey(data) {
    const surveys = this._read(this.collections.surveys);
    const newSurvey = {
      id: 'srv_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      caseNumber: data.caseNumber || 'SURV-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
      surveyorId: data.surveyorId,
      surveyorName: data.surveyorName || 'Surveyor',
      insurer: data.insurer || 'National Insurance Co.',
      claimNo: data.claimNo || '',
      policyNo: data.policyNo || '',
      vehicleRegNo: data.vehicleRegNo || '',
      ownerName: data.ownerName || '',
      status: data.status || 'DRAFT', // DRAFT, EXTRACTED, VERIFIED, COMPLETED
      sourceFiles: data.sourceFiles || [],
      templateFile: data.templateFile || null,
      extractedData: data.extractedData || {},
      generatedReports: data.generatedReports || [],
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    surveys.push(newSurvey);
    this._write(this.collections.surveys, surveys);
    return newSurvey;
  }

  updateSurvey(id, updates) {
    const surveys = this._read(this.collections.surveys);
    const idx = surveys.findIndex(s => s.id === id);
    if (idx === -1) return null;
    surveys[idx] = {
      ...surveys[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this._write(this.collections.surveys, surveys);
    return surveys[idx];
  }

  deleteSurvey(id) {
    let surveys = this._read(this.collections.surveys);
    const initialLen = surveys.length;
    surveys = surveys.filter(s => s.id !== id);
    if (surveys.length !== initialLen) {
      this._write(this.collections.surveys, surveys);
      return true;
    }
    return false;
  }

  // --- Files (Central Repository for Admin & Surveyor) ---
  getAllFiles(filter = {}) {
    let files = this._read(this.collections.files);
    if (filter.surveyId) {
      files = files.filter(f => f.surveyId === filter.surveyId);
    }
    if (filter.uploadedBy) {
      files = files.filter(f => f.uploadedBy === filter.uploadedBy);
    }
    if (filter.docType) {
      files = files.filter(f => f.docType === filter.docType);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      files = files.filter(
        f =>
          (f.originalName && f.originalName.toLowerCase().includes(q)) ||
          (f.docType && f.docType.toLowerCase().includes(q)) ||
          (f.caseNumber && f.caseNumber.toLowerCase().includes(q)) ||
          (f.uploaderName && f.uploaderName.toLowerCase().includes(q))
      );
    }
    return files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  getFileById(id) {
    const files = this._read(this.collections.files);
    return files.find(f => f.id === id);
  }

  recordFile(fileData) {
    const files = this._read(this.collections.files);
    const fileRecord = {
      id: 'fil_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      originalName: fileData.originalName,
      storedName: fileData.storedName,
      filePath: fileData.filePath,
      mimeType: fileData.mimeType,
      fileSize: fileData.fileSize,
      fileCategory: fileData.fileCategory || 'document', // 'source_doc' | 'template' | 'report'
      docType: fileData.docType || 'VEHICLE_DOC', // RC, DL, INSURANCE, POLLUTION, DAMAGE_PHOTO, TEMPLATE, REPORT
      surveyId: fileData.surveyId || null,
      caseNumber: fileData.caseNumber || '',
      uploadedBy: fileData.uploadedBy || 'system',
      uploaderName: fileData.uploaderName || 'System',
      uploadedAt: new Date().toISOString()
    };
    files.push(fileRecord);
    this._write(this.collections.files, files);
    return fileRecord;
  }

  // --- Templates ---
  getTemplates() {
    return this._read(this.collections.templates);
  }

  getTemplateById(id) {
    const templates = this._read(this.collections.templates);
    return templates.find(t => t.id === id);
  }

  saveTemplate(templateData) {
    const templates = this._read(this.collections.templates);
    const newTemplate = {
      id: templateData.id || 'tpl_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: templateData.name,
      description: templateData.description || '',
      fileName: templateData.fileName,
      filePath: templateData.filePath,
      isDefault: !!templateData.isDefault,
      supportedTags: templateData.supportedTags || [],
      createdAt: new Date().toISOString()
    };
    templates.push(newTemplate);
    this._write(this.collections.templates, templates);
    return newTemplate;
  }

  // --- Audit Logs ---
  logAudit(action, userId, userName, details = {}) {
    const logs = this._read(this.collections.audit_logs);
    const newLog = {
      id: 'log_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      action,
      userId,
      userName,
      details,
      timestamp: new Date().toISOString()
    };
    logs.push(newLog);
    // Keep last 1000 logs
    if (logs.length > 1000) logs.splice(0, logs.length - 1000);
    this._write(this.collections.audit_logs, logs);
    return newLog;
  }

  getAuditLogs(limit = 100) {
    const logs = this._read(this.collections.audit_logs);
    return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
  }
}

module.exports = new JsonDatabase();
