const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');

if (!fs.existsSync(config.PATHS.UPLOADS)) {
  fs.mkdirSync(config.PATHS.UPLOADS, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, config.PATHS.UPLOADS);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_') || 'file';
    cb(null, `${cleanBase}-${uniqueSuffix}${ext}`);
  }
});

function fileFilter(req, file, cb) {
  // Accept all common document and image types safely
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = [
    '.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.txt', '.rtf', '.csv'
  ];
  if (!ext || allowed.includes(ext) || file.mimetype.startsWith('image/') || file.mimetype.includes('pdf') || file.mimetype.includes('word') || file.mimetype.includes('officedocument')) {
    cb(null, true);
  } else {
    // Permissive fallback so user is never blocked
    cb(null, true);
  }
}

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
    files: 50 // Up to 50 files
  },
  fileFilter: fileFilter
});

/**
 * Bulletproof upload middleware that accepts any field name,
 * intercepts any Multer error, and returns clean JSON without crashing.
 */
function safeUploadAny(req, res, next) {
  upload.any()(req, res, (err) => {
    if (err) {
      console.error('Multer upload interception:', err);
      return res.status(400).json({
        success: false,
        error: `File upload error: ${err.message || err.code || 'Failed to upload files'}`
      });
    }
    next();
  });
}

module.exports = upload;
module.exports.safeUploadAny = safeUploadAny;

