const db = require('../db');

class AuditService {
  log(req, action, details = {}) {
    const userId = req.user?.id || 'anonymous';
    const userName = req.user?.name || 'Anonymous User';
    return db.logAudit(action, userId, userName, {
      ...details,
      ip: req.ip || req.connection?.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent']
    });
  }
}

module.exports = new AuditService();
