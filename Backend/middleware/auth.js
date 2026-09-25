const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../models/db');

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      licenseNo: user.licenseNo || ''
    },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
}

function extractToken(req) {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.slice(7).trim();
  }
  if (req.headers['x-auth-token']) {
    return req.headers['x-auth-token'];
  }
  // Allow query parameter for direct file downloads and preview links
  if (req.query && req.query.token) {
    return req.query.token;
  }
  return null;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = db.findUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User session expired or invalid.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      return res.status(403).json({ success: false, error: 'Access denied. Administrator privileges required.' });
    }
  });
}

function requireSurveyor(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user && (req.user.role === 'surveyor' || req.user.role === 'admin')) {
      next();
    } else {
      return res.status(403).json({ success: false, error: 'Access denied. Surveyor or Administrator privileges required.' });
    }
  });
}

module.exports = {
  createToken,
  requireAuth,
  requireAdmin,
  requireSurveyor
};
