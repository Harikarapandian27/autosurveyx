const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const config = require('../config');

// All routes here require Administrator access
router.use(requireAdmin);

// GET /api/admin/stats - Overview metrics
router.get('/stats', (req, res) => {
  try {
    const files = db.getAllFiles();
    const surveys = db.getSurveys();
    const users = db.getUsers();
    const templates = db.getTemplates();

    const totalStorageBytes = files.reduce((acc, f) => acc + (f.fileSize || 0), 0);
    const completedSurveys = surveys.filter(s => s.status === 'COMPLETED').length;

    // Breakdown by doc type
    const docTypeCounts = {};
    for (const f of files) {
      const type = f.docType || 'OTHER';
      docTypeCounts[type] = (docTypeCounts[type] || 0) + 1;
    }

    res.json({
      success: true,
      stats: {
        totalFilesUploaded: files.length,
        totalSurveys: surveys.length,
        completedSurveys,
        totalStorageBytes,
        totalStorageFormatted: (totalStorageBytes / (1024 * 1024)).toFixed(2) + ' MB',
        totalUsers: users.length,
        totalTemplates: templates.length,
        docTypeBreakdown: docTypeCounts
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/files - Master Repository of ALL files & docs uploaded till date
router.get('/files', (req, res) => {
  try {
    const filter = {};
    if (req.query.docType) filter.docType = req.query.docType;
    if (req.query.search) filter.search = req.query.search;
    if (req.query.uploadedBy) filter.uploadedBy = req.query.uploadedBy;

    const files = db.getAllFiles(filter);
    res.json({
      success: true,
      count: files.length,
      files
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/files/:id/download - Direct file download for admin
router.get('/files/:id/download', (req, res) => {
  try {
    const file = db.getFileById(req.params.id);
    if (!file) return res.status(404).send('File not found in database');

    if (!fs.existsSync(file.filePath)) {
      return res.status(404).send('File physical payload not found on disk');
    }

    res.download(file.filePath, file.originalName);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /api/admin/files/:id/preview - Direct file preview for admin (images, PDFs, text)
router.get('/files/:id/preview', (req, res) => {
  try {
    const file = db.getFileById(req.params.id);
    if (!file) return res.status(404).send('File not found in database');

    if (!fs.existsSync(file.filePath)) {
      return res.status(404).send('File physical payload not found on disk');
    }

    const mime = file.mimeType || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
    fs.createReadStream(file.filePath).pipe(res);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /api/admin/surveys - View all surveys across all surveyors
router.get('/surveys', (req, res) => {
  try {
    const surveys = db.getSurveys({ search: req.query.search });
    res.json({ success: true, surveys });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/templates - View all available templates
router.get('/templates', (req, res) => {
  try {
    const templates = db.getTemplates();
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/logs - System audit logs
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const logs = db.getAuditLogs(limit);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/users - User accounts
router.get('/users', (req, res) => {
  try {
    const users = db.getUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
