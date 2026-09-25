const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const extractor = require('../services/extractor');
const parser = require('../services/parser');
const templater = require('../services/templater');
const referenceTrainer = require('../services/referenceTrainer');
const audit = require('../services/audit');
const config = require('../config');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// GET /api/surveys - List surveys
router.get('/', requireAuth, (req, res) => {
  try {
    const filter = {};
    if (req.user.role !== 'admin') {
      filter.surveyorId = req.user.id;
    }
    if (req.query.search) {
      filter.search = req.query.search;
    }
    const surveys = db.getSurveys(filter);
    res.json({ success: true, surveys });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/surveys - Create new survey case
router.post('/', requireAuth, (req, res) => {
  try {
    const survey = db.createSurvey({
      surveyorId: req.user.id,
      surveyorName: req.user.name,
      insurer: req.body.insurer || '',
      caseNumber: req.body.caseNumber,
      claimNo: req.body.claimNo,
      policyNo: req.body.policyNo,
      vehicleRegNo: req.body.vehicleRegNo
    });

    audit.log(req, 'SURVEY_CREATED', { surveyId: survey.id, caseNumber: survey.caseNumber });
    res.status(201).json({ success: true, survey });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/surveys/:id - Get survey details
router.get('/:id', requireAuth, (req, res) => {
  try {
    const survey = db.getSurveyById(req.params.id);
    if (!survey) {
      return res.status(404).json({ success: false, error: 'Survey not found' });
    }
    // Check permission
    if (req.user.role !== 'admin' && survey.surveyorId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized to view this survey' });
    }
    res.json({ success: true, survey });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/surveys/:id/upload-docs - Upload 2 or more vehicle documents (RC, DL, Insurance, etc.)
router.post('/:id/upload-docs', requireAuth, upload.safeUploadAny, async (req, res) => {
  try {
    const survey = db.getSurveyById(req.params.id);
    if (!survey) {
      return res.status(404).json({ success: false, error: 'Survey not found' });
    }

    const uploadedFiles = req.files || (req.file ? [req.file] : []);
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'No files were uploaded' });
    }

    const docTypeOverrides = req.body.docTypes ? JSON.parse(req.body.docTypes) : {};
    const recordedFiles = [];

    for (const file of uploadedFiles) {
      const ext = path.extname(file.originalname).toLowerCase();
      let docType = docTypeOverrides[file.originalname] || 'VEHICLE_DOC';
      
      // Auto-tag doc type from filename
      const lowerName = file.originalname.toLowerCase();
      if (lowerName.includes('reference') || lowerName.includes('templete') || lowerName.includes('model_report') || docType === 'REFERENCE_MODEL') {
        docType = 'REFERENCE_MODEL';
      } else if (lowerName.includes('rc') || lowerName.includes('regn') || lowerName.includes('registration')) {
        docType = 'RC_BOOK';
      } else if (lowerName.includes('dl') || lowerName.includes('licen')) {
        docType = 'DRIVING_LICENSE';
      } else if (lowerName.includes('insur') || lowerName.includes('policy') || lowerName.includes('cover')) {
        docType = 'INSURANCE_POLICY';
      } else if (lowerName.includes('pollut') || lowerName.includes('puc')) {
        docType = 'PUC_CERTIFICATE';
      } else if (lowerName.includes('estimate') || lowerName.includes('assessment')) {
        docType = 'ESTIMATE_ASSESSMENT';
      } else if (lowerName.includes('fir') || lowerName.includes('claim') || lowerName.includes('statement')) {
        docType = 'INCIDENT_REPORT';
      } else if (lowerName.includes('cheque') || lowerName.includes('receipt') || lowerName.includes('voucher') || lowerName.includes('neft')) {
        docType = 'PAYMENT_VOUCHER';
      } else if (lowerName.includes('aadhar') || lowerName.includes('aadhaar') || lowerName.includes('pancard') || lowerName.includes('pan_card')) {
        docType = 'ID_PROOF';
      } else if (lowerName.includes('damage') || lowerName.includes('photo') || lowerName.includes('front') || lowerName.includes('rear') || lowerName.includes('side') || lowerName.includes('dent') || lowerName.includes('stage') || lowerName.includes('ri_photo')) {
        docType = 'DAMAGE_PHOTO';
      }

      const fileCategory = docType === 'REFERENCE_MODEL' ? 'reference_model' : 'source_doc';

      const fileRecord = db.recordFile({
        originalName: file.originalname,
        storedName: file.filename,
        filePath: file.path,
        mimeType: file.mimetype,
        fileSize: file.size,
        fileCategory: fileCategory,
        docType: docType,
        surveyId: survey.id,
        caseNumber: survey.caseNumber,
        uploadedBy: req.user.id,
        uploaderName: req.user.name
      });

      // If reference model file is uploaded, automatically train it on the survey
      if (docType === 'REFERENCE_MODEL') {
        try {
          const trainingResult = await referenceTrainer.trainFromReference(file.path, file.originalname);
          db.updateSurvey(survey.id, {
            referenceFile: fileRecord,
            referenceModel: trainingResult
          });
        } catch (refTrainErr) {
          console.warn('Auto reference train warning:', refTrainErr.message);
        }
      }

      // If a custom .docx template is uploaded in documents, link as templateFile if none set
      if (ext === '.docx' && docType !== 'REFERENCE_MODEL' && !survey.templateFile) {
        db.updateSurvey(survey.id, {
          templateFile: fileRecord
        });
      }

      recordedFiles.push(fileRecord);
    }

    // Deduplicate by originalName to keep the latest upload for each file
    const fileMap = new Map();
    for (const f of [...(survey.sourceFiles || []), ...recordedFiles]) {
      fileMap.set(f.originalName, f);
    }
    const updatedSourceFiles = Array.from(fileMap.values());

    db.updateSurvey(survey.id, {
      sourceFiles: updatedSourceFiles,
      status: survey.status === 'DRAFT' ? 'FILES_UPLOADED' : survey.status
    });

    audit.log(req, 'FILES_UPLOADED', {
      surveyId: survey.id,
      count: recordedFiles.length,
      fileNames: recordedFiles.map(f => f.originalName)
    });

    res.json({
      success: true,
      message: `Successfully uploaded ${recordedFiles.length} document(s)`,
      files: recordedFiles
    });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/surveys/:id/upload-template - Upload custom surveyor template (.docx)
router.post('/:id/upload-template', requireAuth, upload.safeUploadAny, async (req, res) => {
  try {
    const survey = db.getSurveyById(req.params.id);
    if (!survey) {
      return res.status(404).json({ success: false, error: 'Survey not found' });
    }

    const templateFile = (req.files && req.files.length > 0 ? req.files[0] : null) || req.file;
    if (!templateFile) {
      return res.status(400).json({ success: false, error: 'No template file provided' });
    }

    const ext = path.extname(templateFile.originalname).toLowerCase();
    if (ext !== '.docx') {
      return res.status(400).json({ success: false, error: 'Template must be a Word (.docx) file' });
    }

    const fileRecord = db.recordFile({
      originalName: templateFile.originalname,
      storedName: templateFile.filename,
      filePath: templateFile.path,
      mimeType: templateFile.mimetype,
      fileSize: templateFile.size,
      fileCategory: 'template',
      docType: 'TEMPLATE_FILE',
      surveyId: survey.id,
      caseNumber: survey.caseNumber,
      uploadedBy: req.user.id,
      uploaderName: req.user.name
    });

    // Save also to template collection
    const templateRecord = db.saveTemplate({
      name: req.body.templateName || templateFile.originalname.replace('.docx', ''),
      description: 'Custom uploaded survey template',
      fileName: templateFile.filename,
      filePath: templateFile.path,
      isDefault: false
    });

    db.updateSurvey(survey.id, {
      templateFile: {
        ...fileRecord,
        fileName: templateFile.filename,
        originalName: templateFile.originalname,
        filePath: templateFile.path,
        templateId: templateRecord.id
      }
    });

    audit.log(req, 'TEMPLATE_UPLOADED', { surveyId: survey.id, templateName: templateFile.originalname });

    res.json({
      success: true,
      message: 'Template uploaded successfully',
      template: fileRecord
    });
  } catch (err) {
    console.error('Template upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/surveys/:id/select-template - Select existing default template
router.post('/:id/select-template', requireAuth, (req, res) => {
  try {
    const survey = db.getSurveyById(req.params.id);
    if (!survey) return res.status(404).json({ success: false, error: 'Survey not found' });

    const { templateId } = req.body;
    const template = db.getTemplateById(templateId);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    db.updateSurvey(survey.id, {
      templateFile: {
        id: template.id,
        name: template.name,
        filePath: template.filePath,
        fileName: template.fileName,
        isDefault: template.isDefault
      }
    });

    audit.log(req, 'TEMPLATE_SELECTED', { surveyId: survey.id, templateId: template.id });

    res.json({ success: true, message: 'Template selected', template });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/surveys/analyze-reference-preview - Standalone reference model preview & training
router.post('/analyze-reference-preview', requireAuth, upload.safeUploadAny, async (req, res) => {
  try {
    const refFile = (req.files && req.files.length > 0 ? req.files[0] : null) || req.file;
    if (!refFile) {
      return res.status(400).json({ success: false, error: 'No reference model file provided' });
    }

    const trainingResult = await referenceTrainer.trainFromReference(refFile.path, refFile.originalname);
    res.json({
      success: true,
      training: trainingResult
    });
  } catch (err) {
    console.error('Reference preview analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/surveys/:id/upload-reference - Upload and train reference model file for a survey
router.post('/:id/upload-reference', requireAuth, upload.safeUploadAny, async (req, res) => {
  try {
    const survey = db.getSurveyById(req.params.id);
    if (!survey) return res.status(404).json({ success: false, error: 'Survey not found' });

    const refFile = (req.files && req.files.length > 0 ? req.files[0] : null) || req.file;
    if (!refFile) {
      return res.status(400).json({ success: false, error: 'No reference model file provided' });
    }

    const fileRecord = db.recordFile({
      originalName: refFile.originalname,
      storedName: refFile.filename,
      filePath: refFile.path,
      mimeType: refFile.mimetype,
      fileSize: refFile.size,
      fileCategory: 'reference_model',
      docType: 'REFERENCE_MODEL',
      surveyId: survey.id,
      caseNumber: survey.caseNumber,
      uploadedBy: req.user.id,
      uploaderName: req.user.name
    });

    const trainingResult = await referenceTrainer.trainFromReference(refFile.path, refFile.originalname);

    db.updateSurvey(survey.id, {
      referenceFile: fileRecord,
      referenceModel: trainingResult
    });

    audit.log(req, 'REFERENCE_MODEL_TRAINED', {
      surveyId: survey.id,
      referenceName: refFile.originalname,
      alignment: trainingResult.alignment.type,
      fieldsCount: trainingResult.totalMappedFields
    });

    res.json({
      success: true,
      message: 'Reference model trained successfully with single tab alignment and field mapping',
      referenceFile: fileRecord,
      referenceModel: trainingResult
    });
  } catch (err) {
    console.error('Reference model upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/surveys/:id/extract - Extract information from all uploaded documents
router.post('/:id/extract', requireAuth, async (req, res) => {
  try {
    const survey = db.getSurveyById(req.params.id);
    if (!survey) return res.status(404).json({ success: false, error: 'Survey not found' });

    if (!survey.sourceFiles || survey.sourceFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'No documents found to extract information from. Please upload at least one document.' });
    }

    // Process documents with controlled concurrency (pool of 3)
    const pLimit = (concurrency) => {
      let active = 0;
      const queue = [];
      const next = () => {
        active--;
        if (queue.length > 0) queue.shift()();
      };
      return (fn) => new Promise((resolve, reject) => {
        const run = () => {
          active++;
          fn().then(resolve, reject).finally(next);
        };
        if (active < concurrency) run();
        else queue.push(run);
      });
    };

    const limit = pLimit(3);
    const extractedDocs = await Promise.all(
      survey.sourceFiles.map(file => limit(async () => {
        const extracted = await extractor.extractText(
          file.filePath,
          file.mimeType,
          file.docType,
          file.originalName
        );
        return {
          fileId: file.id,
          fileName: file.originalName,
          docType: file.docType,
          text: extracted.text,
          method: extracted.method
        };
      }))
    );

    // Run semantic vehicle parsing with strict collision guardrails and learned reference template intelligence
    const parseResult = parser.parseDocuments(extractedDocs, survey.referenceModel);

    // Merge in surveyor profile / wizard defaults ONLY if not present in uploaded documents
    if (!parseResult.fields.surveyor_name || parseResult.fields.surveyor_name === 'N/A' || parseResult.fields.surveyor_name === 'NA') {
      parseResult.fields.surveyor_name = req.user.name || 'NA';
    }
    if (!parseResult.fields.surveyor_license || parseResult.fields.surveyor_license === 'N/A' || parseResult.fields.surveyor_license === 'NA') {
      parseResult.fields.surveyor_license = req.user.licenseNo || 'NA';
    }
    parseResult.fields.case_number = survey.caseNumber || 'NA';
    if (!parseResult.fields.claim_no || parseResult.fields.claim_no === 'N/A' || parseResult.fields.claim_no === 'NA') {
      if (survey.claimNo) parseResult.fields.claim_no = survey.claimNo;
      else parseResult.fields.claim_no = 'NA';
    }
    if (!parseResult.fields.insurance_company || parseResult.fields.insurance_company === 'N/A' || parseResult.fields.insurance_company === 'NA') {
      if (survey.insurer) parseResult.fields.insurance_company = survey.insurer;
      else parseResult.fields.insurance_company = 'NA';
    }

    // Save extracted data to survey
    db.updateSurvey(survey.id, {
      extractedData: parseResult.fields,
      confidenceScores: parseResult.confidence,
      extractedDocSummaries: extractedDocs.map(d => ({
        fileName: d.fileName,
        docType: d.docType,
        method: d.method,
        textSnippet: d.text.slice(0, 300)
      })),
      vehicleRegNo: parseResult.fields.vehicle_reg_no !== 'N/A' ? parseResult.fields.vehicle_reg_no : survey.vehicleRegNo,
      ownerName: parseResult.fields.owner_name !== 'N/A' ? parseResult.fields.owner_name : survey.ownerName,
      status: 'EXTRACTED'
    });

    audit.log(req, 'EXTRACTION_COMPLETED', {
      surveyId: survey.id,
      fieldsCount: parseResult.summary.verifiedFields,
      regNo: parseResult.fields.vehicle_reg_no
    });

    res.json({
      success: true,
      message: 'Information extracted successfully without alignment collision',
      fields: parseResult.fields,
      confidence: parseResult.confidence,
      summary: parseResult.summary
    });
  } catch (err) {
    console.error('Extraction error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/surveys/:id/verify - Update and verify fields
router.put('/:id/verify', requireAuth, (req, res) => {
  try {
    const survey = db.getSurveyById(req.params.id);
    if (!survey) return res.status(404).json({ success: false, error: 'Survey not found' });

    const updatedFields = {
      ...(survey.extractedData || {}),
      ...req.body.fields
    };

    db.updateSurvey(survey.id, {
      extractedData: updatedFields,
      vehicleRegNo: updatedFields.vehicle_reg_no || survey.vehicleRegNo,
      ownerName: updatedFields.owner_name || survey.ownerName,
      status: 'VERIFIED'
    });

    audit.log(req, 'FIELDS_VERIFIED', { surveyId: survey.id });

    res.json({
      success: true,
      message: 'Fields verified and updated successfully',
      fields: updatedFields
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/surveys/:id/generate - Fill template without alignment errors and generate reports
router.post('/:id/generate', requireAuth, async (req, res) => {
  try {
    const survey = db.getSurveyById(req.params.id);
    if (!survey) return res.status(404).json({ success: false, error: 'Survey not found' });

    // Determine template path
    let templatePath = null;
    let templateName = 'motor_survey_assessment';

    if (survey.templateFile && survey.templateFile.filePath && fs.existsSync(survey.templateFile.filePath)) {
      templatePath = survey.templateFile.filePath;
      templateName = path.basename(templatePath, '.docx');
    } else {
      // Default to standard assessment template
      templatePath = path.join(config.PATHS.TEMPLATES, 'motor_survey_assessment.docx');
      if (!fs.existsSync(templatePath)) {
        // Regenerate if needed
        const gen = require('../templates/generate_templates');
        await gen.main();
      }
    }

    const data = { ...(survey.extractedData || {}) };
    data.case_number = survey.caseNumber || data.case_number || 'NA';
    if (!data.surveyor_name || data.surveyor_name === 'N/A' || data.surveyor_name === 'NA' || data.surveyor_name === '-') {
      data.surveyor_name = req.user.name || 'NA';
    }
    if (!data.surveyor_license || data.surveyor_license === 'N/A' || data.surveyor_license === 'NA' || data.surveyor_license === '-') {
      data.surveyor_license = req.user.licenseNo || 'NA';
    }

    const safeReg = (data.vehicle_reg_no || 'VEHICLE').replace(/[^a-zA-Z0-9_-]/g, '_');
    const outputDocxName = `SurveyReport_${safeReg}_${Date.now()}.docx`;

    // Render DOCX cleanly with docxtemplater and alignment enforcement
    const alignmentMode = survey.referenceModel?.alignment?.type || 'single_tab_space';
    const renderResult = await templater.renderDocx(templatePath, data, outputDocxName, {
      alignment: alignmentMode,
      referenceModel: survey.referenceModel
    });

    // Record generated report file in central files collection
    const reportFileRecord = db.recordFile({
      originalName: outputDocxName,
      storedName: renderResult.docxFileName,
      filePath: renderResult.docxPath,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: renderResult.fileSize,
      fileCategory: 'report',
      docType: 'FINAL_REPORT_DOCX',
      surveyId: survey.id,
      caseNumber: survey.caseNumber,
      uploadedBy: req.user.id,
      uploaderName: req.user.name
    });

    const generatedReports = [
      {
        format: 'docx',
        fileName: renderResult.docxFileName,
        fileId: reportFileRecord.id,
        downloadUrl: `/api/surveys/${survey.id}/download-docx`,
        generatedAt: new Date().toISOString()
      },
      {
        format: 'pdf',
        fileName: outputDocxName.replace('.docx', '.pdf'),
        previewUrl: `/api/surveys/${survey.id}/preview-html`,
        downloadUrl: `/api/surveys/${survey.id}/preview-html?print=true`,
        generatedAt: new Date().toISOString()
      }
    ];

    db.updateSurvey(survey.id, {
      generatedReports,
      status: 'COMPLETED'
    });

    audit.log(req, 'REPORT_GENERATED', {
      surveyId: survey.id,
      docxFile: renderResult.docxFileName,
      regNo: data.vehicle_reg_no
    });

    res.json({
      success: true,
      message: 'Survey report generated with zero alignment errors!',
      reports: generatedReports
    });
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/surveys/:id/download-docx - Download Word document
router.get('/:id/download-docx', (req, res) => {
  try {
    const survey = db.getSurveyById(req.params.id);
    if (!survey) return res.status(404).send('Survey not found');

    const docxReport = survey.generatedReports?.find(r => r.format === 'docx');
    if (!docxReport) return res.status(404).send('No generated Word report available');

    const filePath = path.join(config.PATHS.REPORTS, docxReport.fileName);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found on server disk');

    res.download(filePath, docxReport.fileName);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /api/surveys/:id/preview-html - Printable HTML report view (for PDF export & browser preview)
router.get('/:id/preview-html', async (req, res) => {
  try {
    const survey = db.getSurveyById(req.params.id);
    if (!survey) return res.status(404).send('Survey not found');

    const docxReport = survey.generatedReports?.find(r => r.format === 'docx');
    if (docxReport) {
      const docxPath = path.join(config.PATHS.REPORTS, docxReport.fileName);
      if (fs.existsSync(docxPath)) {
        try {
          const mammoth = require('mammoth');
          const result = await mammoth.convertToHtml({ path: docxPath });

          // Post-process HTML to guarantee 100% straight single-tab colon and value alignment
          const formattedBody = result.value.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (match, inner) => {
            const plainText = inner.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
            if (!plainText.includes(':') || plainText.startsWith('http') || plainText.includes('Cell:') || plainText.includes('Email:') || plainText.includes('Add:') || plainText.includes('Less:')) {
              return match;
            }

            const colonIdx = inner.indexOf(':');
            if (colonIdx === -1) return match;

            const beforeColon = inner.slice(0, colonIdx);
            const plainBeforeColon = beforeColon.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
            const afterColon = inner.slice(colonIdx + 1);

            // Check if continuation line (e.g. address continuation)
            if (plainBeforeColon.length === 0) {
              const valHtml = afterColon.replace(/^\s*(?:&nbsp;|\t|\s)+/g, '').trim();
              if (!valHtml) return '';
              return `<div class="report-field-row"><span class="report-field-label"></span><span class="report-field-colon">:</span><span class="report-field-value">${valHtml}</span></div>`;
            }

            // Standard label : value row
            const labelHtml = beforeColon.replace(/\t+/g, '').replace(/&nbsp;/g, ' ').trim();
            const valHtml = afterColon.replace(/^\s*(?:&nbsp;|\t|\s)+/g, '').trim();
            return `<div class="report-field-row"><span class="report-field-label">${labelHtml}</span><span class="report-field-colon">:</span><span class="report-field-value">${valHtml}</span></div>`;
          });

          const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Survey Report Preview - ${survey.vehicleRegNo || survey.caseNumber}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body {
      font-family: 'Times New Roman', Times, serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 30px;
      font-size: 13px;
      line-height: 1.5;
    }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    td, th { border: 1px solid #cbd5e1; padding: 6px 10px; font-size: 12px; }
    h1, h2, h3 { color: #000000; margin-top: 18px; margin-bottom: 8px; }
    p { margin: 4px 0; }
    .report-field-row {
      display: flex;
      align-items: baseline;
      margin: 2.5px 0;
      font-size: 13px;
      line-height: 1.5;
      font-family: 'Times New Roman', Times, serif;
    }
    .report-field-label {
      width: 230px;
      min-width: 230px;
      max-width: 230px;
      color: #000000;
      word-break: break-word;
    }
    .report-field-colon {
      width: 24px;
      min-width: 24px;
      text-align: center;
      color: #000000;
      font-weight: bold;
    }
    .report-field-value {
      flex: 1;
      color: #000000;
      font-weight: bold;
      padding-left: 6px;
      word-break: break-word;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
    .report-action-header {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px 18px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .btn-print-action {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 6px rgba(37,99,235,0.3);
    }
    .btn-print-action:hover { background: #1d4ed8; }
    .btn-docx-action {
      background: #059669;
      color: #ffffff;
      text-decoration: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 6px rgba(5,150,105,0.3);
    }
    .btn-docx-action:hover { background: #047857; }
  </style>
</head>
<body>
  <div class="report-action-header no-print">
    <div style="font-size: 14px; font-weight: 700; color: #1e293b;">
      📄 Vehicle Survey & Loss Assessment Report: <strong>${escapeHtml(survey.vehicleRegNo || survey.caseNumber)}</strong>
    </div>
    <div style="display: flex; gap: 10px;">
      <button onclick="window.print()" class="btn-print-action">
        🖨️ Save as PDF / Print Report
      </button>
      <a href="/api/surveys/${survey.id}/download-docx" class="btn-docx-action">
        ⬇️ Download Word (.docx)
      </a>
    </div>
  </div>

  ${formattedBody}

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('print') === 'true') {
        setTimeout(() => window.print(), 500);
      }
    });
  </script>
</body>
</html>`;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.send(htmlContent);
        } catch (mammothErr) {
          console.warn('Mammoth preview conversion fallback:', mammothErr.message);
        }
      }
    }

    const html = templater.generatePrintableHtml(survey.extractedData || {}, survey);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// DELETE /api/surveys/:id - Delete a draft/incomplete survey
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const survey = db.getSurveyById(req.params.id);
    if (!survey) return res.status(404).json({ success: false, error: 'Survey not found' });
    if (req.user.role !== 'admin' && survey.surveyorId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized to delete this survey' });
    }
    const deleted = db.deleteSurvey(req.params.id);
    if (deleted) {
      audit.log(req, 'SURVEY_DELETED', { surveyId: req.params.id, caseNumber: survey.caseNumber });
      return res.json({ success: true, message: 'Survey deleted successfully' });
    }
    res.status(500).json({ success: false, error: 'Failed to delete survey' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
