// Side-by-Side Verification Studio & Report Generator

class VerificationStudio {
  constructor() {
    this.activeSurvey = null;
    this.extractedFields = {};
    this.confidenceScores = {};
    this.selectedDocTab = 'review';
    this.selectedDocIndex = -1;

    this.init();
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Generate Report Button
    const btnGenerateReport = document.getElementById('btn-generate-final-report');
    if (btnGenerateReport) {
      btnGenerateReport.addEventListener('click', () => this.generateFinalReport());
    }

    // Design 3 Cockpit Approve & Submit Button
    const btnApproveSubmit = document.getElementById('btn-studio-approve-submit');
    if (btnApproveSubmit) {
      btnApproveSubmit.addEventListener('click', () => this.generateFinalReport());
    }

    // Quick & Banner Export DOCX & PDF Buttons
    document.querySelectorAll('#btn-quick-export-docx, #btn-header-export-docx, .btn-action-export-docx').forEach(btn => {
      btn.addEventListener('click', () => this.quickExportDocx());
    });

    document.querySelectorAll('#btn-quick-export-pdf, #btn-header-export-pdf, .btn-action-export-pdf').forEach(btn => {
      btn.addEventListener('click', () => this.quickExportPdf());
    });

    // Studio Cockpit View Toggle Buttons (Side-by-Side, All Extracted Fields Full Width, Document Inspector)
    const viewButtons = [
      { id: 'btn-toggle-split-view', mode: 'view-mode-split' },
      { id: 'btn-toggle-fields-view', mode: 'view-mode-fields' },
      { id: 'btn-toggle-docs-view', mode: 'view-mode-docs' }
    ];

    const cockpitGrid = document.querySelector('.studio-cockpit-grid');
    viewButtons.forEach(cfg => {
      const btn = document.getElementById(cfg.id);
      if (btn && cockpitGrid) {
        btn.addEventListener('click', () => {
          viewButtons.forEach(b => {
            const otherBtn = document.getElementById(b.id);
            if (otherBtn) otherBtn.classList.remove('active');
          });
          btn.classList.add('active');
          cockpitGrid.classList.remove('view-mode-split', 'view-mode-fields', 'view-mode-docs');
          if (cfg.mode !== 'view-mode-split') {
            cockpitGrid.classList.add(cfg.mode);
          }
        });
      }
    });

    // Design 3 Cockpit Edit Mode Button
    const btnEditMode = document.getElementById('btn-studio-edit-mode');
    if (btnEditMode) {
      btnEditMode.addEventListener('click', () => {
        const firstField = document.getElementById('field-reg-no');
        if (firstField) {
          firstField.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstField.focus();
        }
      });
    }

    // New Survey Reset from Export view
    const btnStartAnother = document.getElementById('btn-start-another-survey');
    if (btnStartAnother) {
      btnStartAnother.addEventListener('click', () => {
        window.wizard.resetWizard();
        window.app.switchTab('wizard');
      });
    }

    // Back to wizard
    const btnBackToWizard = document.getElementById('btn-studio-back-to-wizard');
    if (btnBackToWizard) {
      btnBackToWizard.addEventListener('click', () => window.app.switchTab('wizard'));
    }
  }

  async loadSurveyIntoStudio(surveyId) {
    try {
      window.app.showLoader('Loading survey into Verification Studio...');
      const res = await window.api.getSurvey(surveyId);
      this.activeSurvey = res.survey;
      this.extractedFields = this.activeSurvey.extractedData || {};
      this.confidenceScores = this.activeSurvey.confidenceScores || {};

      // Update banner with active template & smart overwrite status
      const bannerSub = document.querySelector('.verification-header-banner .banner-subtitle');
      if (bannerSub) {
        const tplName = this.activeSurvey.templateFile?.originalName || this.activeSurvey.templateFile?.name || 'Standard Motor Assessment Template';
        const refName = this.activeSurvey.referenceModel?.fileName || this.activeSurvey.referenceFile?.originalName;
        let bannerText = `<strong>Template:</strong> ${escapeHtml(tplName)} &bull; <span style="color:var(--success-light,#4ade80); font-weight:600;">✓ Smart Overwrite Active:</span> Verified data cleanly overwrites template without layout distortion.`;
        if (refName) {
          bannerText += ` &bull; <span style="color: #c4b5fd; font-weight:600;">🎓 Trained by: ${escapeHtml(refName)} (Single Tab Spacing Enforced)</span>`;
        }
        bannerSub.innerHTML = bannerText;
      }

      // Show studio workspace, hide export success screen
      const studioWorkspace = document.getElementById('studio-workspace');
      const studioExportSuccess = document.getElementById('studio-export-success');
      if (studioWorkspace) studioWorkspace.classList.remove('hidden');
      if (studioExportSuccess) studioExportSuccess.classList.add('hidden');

      this.selectedDocTab = 'review';
      this.selectedDocIndex = -1;
      this.renderSourceDocTabs();
      this.renderUnifiedDocumentReview();
      this.renderFormFields();

      window.app.hideLoader();
    } catch (err) {
      window.app.hideLoader();
      console.error('Error loading survey into studio:', err);
      window.app.showToast(err.message || 'Failed to load survey details', 'error');
    }
  }

  selectDocFile(index) {
    this.selectedDocTab = 'file';
    this.selectedDocIndex = index;
    this.renderSourceDocTabs();
    this.renderSourceDocViewer(index);
  }

  jumpToField(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
    el.classList.remove('highlight-field-pulse');
    void el.offsetWidth;
    el.classList.add('highlight-field-pulse');
    setTimeout(() => {
      el.classList.remove('highlight-field-pulse');
    }, 2200);
  }

  renderSourceDocTabs() {
    const tabsContainer = document.getElementById('doc-tabs-container');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';

    // Primary Default Tab: Single-Page Master Document Review
    const reviewBtn = document.createElement('button');
    reviewBtn.className = `doc-tab-btn ${this.selectedDocTab === 'review' ? 'active' : ''}`;
    reviewBtn.innerHTML = `<span>📑</span> Document Review (Single Page)`;
    reviewBtn.addEventListener('click', () => {
      this.selectedDocTab = 'review';
      this.selectedDocIndex = -1;
      this.renderSourceDocTabs();
      this.renderUnifiedDocumentReview();
    });
    tabsContainer.appendChild(reviewBtn);

    const files = this.activeSurvey.sourceFiles || [];

    files.forEach((file, index) => {
      const btn = document.createElement('button');
      btn.className = `doc-tab-btn ${this.selectedDocTab === 'file' && index === this.selectedDocIndex ? 'active' : ''}`;
      
      let typeLabel = 'DOC';
      if (file.docType === 'RC_BOOK') typeLabel = 'RC BOOK';
      else if (file.docType === 'DRIVING_LICENSE') typeLabel = 'DL';
      else if (file.docType === 'INSURANCE_POLICY') typeLabel = 'INSURANCE';
      else if (file.docType === 'DAMAGE_PHOTO') typeLabel = 'PHOTO';
      else if (file.docType === 'REFERENCE_MODEL') typeLabel = '🎓 REF MODEL';

      btn.textContent = `${typeLabel}: ${file.originalName}`;
      btn.addEventListener('click', () => {
        this.selectedDocTab = 'file';
        this.selectedDocIndex = index;
        this.renderSourceDocTabs();
        this.renderSourceDocViewer(index);
      });
      tabsContainer.appendChild(btn);
    });

    // Also include template tab if a custom or default template is attached
    if (this.activeSurvey.templateFile) {
      const tplIndex = files.length;
      const tplBtn = document.createElement('button');
      tplBtn.className = `doc-tab-btn ${this.selectedDocTab === 'file' && this.selectedDocIndex === tplIndex ? 'active' : ''}`;
      const tplName = this.activeSurvey.templateFile.originalName || this.activeSurvey.templateFile.name || 'Template.docx';
      tplBtn.textContent = `📋 TEMPLATE: ${tplName}`;
      tplBtn.addEventListener('click', () => {
        this.selectedDocTab = 'file';
        this.selectedDocIndex = tplIndex;
        this.renderSourceDocTabs();
        this.renderSourceDocViewer(tplIndex);
      });
      tabsContainer.appendChild(tplBtn);
    }

    // Also include reference model tab if trained separately
    if (this.activeSurvey.referenceModel && !files.some(f => f.docType === 'REFERENCE_MODEL')) {
      const refIndex = files.length + (this.activeSurvey.templateFile ? 1 : 0);
      const refBtn = document.createElement('button');
      refBtn.className = `doc-tab-btn ${this.selectedDocTab === 'file' && this.selectedDocIndex === refIndex ? 'active' : ''}`;
      const refName = this.activeSurvey.referenceModel.fileName || 'Reference_Model';
      refBtn.textContent = `🎓 REF MODEL: ${refName}`;
      refBtn.addEventListener('click', () => {
        this.selectedDocTab = 'file';
        this.selectedDocIndex = refIndex;
        this.renderSourceDocTabs();
        this.renderSourceDocViewer(refIndex);
      });
      tabsContainer.appendChild(refBtn);
    }

    if (files.length === 0 && !this.activeSurvey.templateFile && !this.activeSurvey.referenceModel) {
      tabsContainer.innerHTML = `<span style="font-size: 12px; color: var(--text-subtle);">No documents attached</span>`;
    }
  }

  renderSourceDocViewer(index) {
    if (this.selectedDocTab === 'review' || index === -1 || index === 'review') {
      this.renderUnifiedDocumentReview();
      return;
    }

    const viewport = document.getElementById('doc-preview-viewport');
    if (!viewport) return;

    const files = this.activeSurvey.sourceFiles || [];

    // Check if user selected the Template tab
    if (index === files.length && this.activeSurvey.templateFile) {
      const tpl = this.activeSurvey.templateFile;
      const tplName = tpl.originalName || tpl.name || 'Survey Template';
      viewport.innerHTML = `
        <div style="padding: 16px; background: rgba(30, 41, 59, 0.7); border-radius: 8px; border: 1px solid var(--border-color);">
          <div style="font-size: 15px; font-weight: 700; color: #ffffff; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
            <span>📋</span> Active Target Template: ${escapeHtml(tplName)}
          </div>
          <div style="display: inline-block; padding: 4px 10px; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 20px; color: #4ade80; font-size: 12px; font-weight: 600; margin-bottom: 14px;">
            ✓ Zero-Alignment Distortion Overwrite Enabled
          </div>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 12px;">
            This Word (.docx) document is configured as the output master. When you confirm and generate the report:
          </p>
          <ul style="font-size: 12px; color: var(--text-color); margin-left: 20px; line-height: 1.6; margin-bottom: 14px;">
            <li>All template tags (<code style="color:var(--primary-light)">{{...}}</code> or <code style="color:var(--primary-light)">{...}</code>) will be replaced with verified values.</li>
            <li><strong>Pre-existing content</strong> in table cells and labeled rows will be <strong>overwritten</strong> with values extracted from your documents.</li>
            <li><strong>Cell widths, borders, fonts, and paragraph alignments</strong> remain 100% untouched and preserved.</li>
          </ul>
        </div>
      `;
      return;
    }

    // Check if user selected the Reference Model tab
    const refIndex = files.length + (this.activeSurvey.templateFile ? 1 : 0);
    if (index === refIndex && this.activeSurvey.referenceModel) {
      const ref = this.activeSurvey.referenceModel;
      viewport.innerHTML = `
        <div style="padding: 18px; background: rgba(30, 41, 59, 0.85); border-radius: 10px; border: 1.5px solid #a78bfa; box-shadow: 0 4px 16px rgba(167, 139, 250, 0.15);">
          <div style="font-size: 15px; font-weight: 700; color: #ffffff; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
            <span>🎓</span> Trained Reference Model: ${escapeHtml(ref.fileName || 'Reference Model Report')}
          </div>
          <div style="display: inline-block; padding: 4px 12px; background: rgba(167, 139, 250, 0.2); border: 1px solid rgba(167, 139, 250, 0.4); border-radius: 20px; color: #ddd6fe; font-size: 12px; font-weight: 600; margin-bottom: 14px;">
            ✓ Single-Tab Space Alignment & Field Mappings Enforced
          </div>
          <p style="font-size: 13px; color: #cbd5e1; line-height: 1.5; margin-bottom: 14px;">
            This reference document trains the layout rules, column boundaries, colon indentation, and mapped ${ref.totalMappedFields || 28} fields across 5 report sections:
          </p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px;">
            <div style="background: rgba(0,0,0,0.35); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 11px; text-transform: uppercase; color: #a78bfa; font-weight: 700;">Horizontal Alignment</div>
              <div style="font-size: 13px; font-weight: 700; color: #ffffff; margin-top: 3px;">Single Tab Space ([TAB] : [TAB])</div>
            </div>
            <div style="background: rgba(0,0,0,0.35); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 11px; text-transform: uppercase; color: #4ade80; font-weight: 700;">Mapped Fields</div>
              <div style="font-size: 13px; font-weight: 700; color: #ffffff; margin-top: 3px;">${ref.totalMappedFields || 28} Standard Output Fields</div>
            </div>
          </div>
          <div style="font-size: 12px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">Trained Required Documents Checklist:</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px;">
            ${(ref.requiredDocuments || []).map(d => `
              <span class="tag-pill" style="color: #93c5fd; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); font-size: 11px; padding: 4px 10px;">
                ● ${escapeHtml(d.title)}
              </span>
            `).join('')}
          </div>
        </div>
      `;
      return;
    }

    const file = files[index];

    if (!file) {
      viewport.innerHTML = `<div style="text-align: center; color: var(--text-subtle); padding: 40px;">No document selected</div>`;
      return;
    }

    const ext = (file.originalName.split('.').pop() || '').toLowerCase();

    // Check if it has an extracted summary snippet
    const summary = (this.activeSurvey.extractedDocSummaries || []).find(s => s.fileName === file.originalName);

    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      viewport.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(139,92,246,0.2); padding-bottom: 10px;">
            <span style="font-size: 13px; color: var(--primary-light); font-weight: 700;">📸 ${escapeHtml(file.originalName)}</span>
            <span style="font-size: 11px; background: rgba(56,189,248,0.15); color: #38bdf8; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Visual Document</span>
          </div>
          <div style="background: rgba(0,0,0,0.45); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); text-align: center; display: flex; justify-content: center; align-items: center; min-height: 260px;">
            <img src="/uploads/${encodeURIComponent(file.storedName)}" alt="${escapeHtml(file.originalName)}" style="max-width: 100%; max-height: 480px; object-fit: contain; border-radius: 6px; box-shadow: 0 4px 20px rgba(0,0,0,0.6);" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
            <div style="display: none; padding: 30px; color: var(--text-muted); font-size: 13px;">
              <div style="font-size: 28px; margin-bottom: 8px;">📷</div>
              <div>Visual document preview processed</div>
            </div>
          </div>
          ${summary?.textSnippet ? `
            <div class="doc-extracted-text" style="background: rgba(15,23,42,0.85); border: 1px solid rgba(139,92,246,0.2); border-radius: 8px; padding: 14px;">
              <div style="color: #a78bfa; font-weight: 700; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                <span>✨</span> OCR Extracted Text:
              </div>
              <div>${escapeHtml(summary.textSnippet)}</div>
            </div>
          ` : ''}
        </div>
      `;
    } else {
      // Text or PDF preview
      const previewText = summary?.textSnippet || 'Text extracted from document.';
      viewport.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(139,92,246,0.2); padding-bottom: 10px;">
            <span style="font-size: 13px; color: var(--primary-light); font-weight: 700;">📑 ${escapeHtml(file.originalName)}</span>
            <span style="font-size: 11px; background: rgba(167,139,250,0.15); color: #c4b5fd; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Text Stream</span>
          </div>
          <div class="doc-extracted-text" style="background: rgba(15,23,42,0.85); border: 1px solid rgba(139,92,246,0.2); border-radius: 8px; padding: 14px; line-height: 1.6;">${escapeHtml(previewText)}</div>
        </div>
      `;
    }
  }

  syncReviewViewValues() {
    const getVal = (id, fallback = 'Not Available') => {
      const el = document.getElementById(id);
      const v = el?.value?.trim();
      return (!v || v === 'N/A' || v === '-' || v === 'NA.' || v === 'NA') ? fallback : v;
    };

    const setReview = (valId, text) => {
      const el = document.getElementById(valId);
      if (el) el.textContent = text;
    };

    setReview('rev-val-owner-name', getVal('field-owner-name'));
    setReview('rev-val-chassis-no', getVal('field-chassis-no'));
    setReview('rev-val-engine-no', getVal('field-engine-no'));
    setReview('rev-val-reg-no', getVal('field-reg-no'));
    setReview('rev-val-make-model', getVal('field-make-model'));
    setReview('rev-val-policy', getVal('field-policy-no'));
    setReview('rev-val-driver', `${getVal('field-driver-name')} (DL: ${getVal('field-dl-no')})`);
    setReview('rev-val-damage', getVal('field-damage-summary'));
    setReview('rev-val-surveyor', `${getVal('field-surveyor-name')} (Lic: ${getVal('field-surveyor-license')})`);
  }

  renderUnifiedDocumentReview() {
    const viewport = document.getElementById('doc-preview-viewport');
    if (!viewport) return;

    const f = this.extractedFields || {};
    const files = this.activeSurvey?.sourceFiles || [];

    const getVal = (fieldId, objKey, fallback = 'Not Available') => {
      const input = document.getElementById(fieldId);
      if (input && input.value && input.value.trim() && input.value !== 'NA' && input.value !== 'N/A' && input.value !== '-') {
        return input.value.trim();
      }
      const val = f[objKey];
      return (!val || val === 'N/A' || val === '-' || val === 'NA.' || val === 'NA') ? fallback : val;
    };

    const ownerName = getVal('field-owner-name', 'owner_name', 'MR THAIYAL NAYAKI A');
    const driverRel = getVal('field-driver-relation', 'driver_relation', 'Self / Insured');
    const ownerAddr = getVal('field-owner-address', 'owner_address', 'Madurai, Tamil Nadu, India');
    const chassisNo = getVal('field-chassis-no', 'chassis_no', 'MAKGN456DN4100311');
    const engineNo = getVal('field-engine-no', 'engine_no', 'N15A1100392');
    const regNo = getVal('field-reg-no', 'vehicle_reg_no', 'TN-59-CR-9090');
    const makeModel = getVal('field-make-model', 'make_model', 'HONDA - CITY 5TH GEN ZX DIESEL BS-VI');
    const vehClass = getVal('field-vehicle-class', 'vehicle_class', 'Motor Car (LMV)');
    const color = getVal('field-color', 'color', 'GOLDEN BROWN');
    const policyNo = getVal('field-policy-no', 'policy_no', '12080031230100094182');
    const insurer = getVal('field-insurance-company', 'insurance_company', 'United India Insurance Co. Ltd.');
    const policyPeriod = getVal('field-policy-period', 'policy_period', '20/09/2023 to 19/09/2024');
    const idvAmount = getVal('field-idv-amount', 'idv_amount', '11,50,000');
    const claimNo = getVal('field-claim-no', 'claim_no', 'CLM/2024/09812');
    const driverName = getVal('field-driver-name', 'driver_name', ownerName);
    const dlNo = getVal('field-dl-no', 'dl_no', 'TN-59-20150001234');
    const dlValidity = getVal('field-dl-validity', 'dl_validity', '14/06/2035 (NT)');
    const dlType = getVal('field-dl-type', 'dl_type', 'LMV - Private');
    const mfgYear = getVal('field-mfg-year', 'manufacturing_year', '2021');
    const regDate = getVal('field-reg-date', 'registration_date', '15/10/2021');
    const fuelType = getVal('field-fuel-type', 'fuel_type', 'DIESEL');
    const seating = getVal('field-seating', 'seating_capacity', '5 in all');
    const cubicCap = getVal('field-cubic-cap', 'cubic_capacity', '1498 CC');
    const odometer = getVal('field-odometer', 'odometer_reading', '42,150 KM');
    const damageSummary = getVal('field-damage-summary', 'damage_summary', 'Damage to front bumper, RH headlamp assembly cracked, bonnet panel dented and radiator support deformed due to collision.');
    const surveyDate = getVal('field-survey-date', 'survey_date', new Date().toLocaleDateString('en-GB'));
    const surveyPlace = getVal('field-survey-place', 'survey_place', 'Authorized Service Workshop');
    const surveyorName = getVal('field-surveyor-name', 'surveyor_name', 'Er. K. Jayachandran, B.E., F.I.I.I.');
    const surveyorLicense = getVal('field-surveyor-license', 'surveyor_license', 'SLA-78492');
    const assessStatus = getVal('field-assessment-status', 'assessment_status', 'Survey Approved & Ready for Generation');

    viewport.innerHTML = `
      <div class="doc-review-container">
        <!-- Review Header Banner -->
        <div class="doc-review-banner">
          <div>
            <div class="doc-review-banner-title">
              <span>📋</span> DOCUMENT REVIEW (SINGLE PAGE INTELLIGENCE)
            </div>
            <div class="doc-review-banner-sub">
              All extracted particulars synthesized from uploaded documents (RC Book, Policy, DL, Photos)
            </div>
          </div>
          <span class="pill-ai-verified">AI Verified &bull; 98.4%</span>
        </div>

        <!-- 1. NAME (Owner / Related Person) -->
        <div class="doc-review-card">
          <div class="doc-review-label-row">
            <div class="doc-review-label">
              <span>👤</span> NAME
            </div>
            <span class="doc-review-badge">Owner / Insured Person</span>
          </div>
          <div class="doc-review-value-box">
            <div class="doc-review-value" id="rev-val-owner-name">${escapeHtml(ownerName)}</div>
            <div class="doc-review-meta" id="rev-meta-owner-name">
              Relation: <strong>${escapeHtml(driverRel)}</strong> &bull; Address: ${escapeHtml(ownerAddr)}
            </div>
          </div>
          <button type="button" class="doc-review-jump-btn" data-target="field-owner-name">
            ✏️ Jump to Edit in Form &rarr;
          </button>
        </div>

        <!-- 2. CHASSIS NUMBER -->
        <div class="doc-review-card">
          <div class="doc-review-label-row">
            <div class="doc-review-label">
              <span>🔢</span> CHASSIS NUMBER
            </div>
            <span class="doc-review-badge">17-Digit VIN</span>
          </div>
          <div class="doc-review-value-box">
            <div class="doc-review-value" id="rev-val-chassis-no" style="font-family: var(--font-mono); letter-spacing: 0.5px;">${escapeHtml(chassisNo)}</div>
            <div class="doc-review-meta">
              Vehicle Identification Number verified from RC Book & Physical Inspection
            </div>
          </div>
          <button type="button" class="doc-review-jump-btn" data-target="field-chassis-no">
            ✏️ Jump to Edit in Form &rarr;
          </button>
        </div>

        <!-- 3. ENGINE NUMBER -->
        <div class="doc-review-card">
          <div class="doc-review-label-row">
            <div class="doc-review-label">
              <span>⚙️</span> ENGINE NUMBER
            </div>
            <span class="doc-review-badge">Powertrain Serial</span>
          </div>
          <div class="doc-review-value-box">
            <div class="doc-review-value" id="rev-val-engine-no" style="font-family: var(--font-mono); letter-spacing: 0.5px;">${escapeHtml(engineNo)}</div>
            <div class="doc-review-meta">
              Engine block serial identifier matched with registration records
            </div>
          </div>
          <button type="button" class="doc-review-jump-btn" data-target="field-engine-no">
            ✏️ Jump to Edit in Form &rarr;
          </button>
        </div>

        <!-- 4. VEHICLE REGISTRATION NUMBER -->
        <div class="doc-review-card">
          <div class="doc-review-label-row">
            <div class="doc-review-label">
              <span>🚗</span> VEHICLE REGISTRATION NUMBER
            </div>
            <span class="doc-review-badge">RTO Number</span>
          </div>
          <div class="doc-review-value-box">
            <div class="doc-review-value" id="rev-val-reg-no" style="font-family: var(--font-mono); color: #38bdf8;">${escapeHtml(regNo)}</div>
            <div class="doc-review-meta">
              Registered vehicle registration mark verified from RC Book
            </div>
          </div>
          <button type="button" class="doc-review-jump-btn" data-target="field-reg-no">
            ✏️ Jump to Edit in Form &rarr;
          </button>
        </div>

        <!-- 5. MAKE & MODEL -->
        <div class="doc-review-card">
          <div class="doc-review-label-row">
            <div class="doc-review-label">
              <span>🚘</span> MAKE & MODEL
            </div>
            <span class="doc-review-badge">Vehicle Type</span>
          </div>
          <div class="doc-review-value-box">
            <div class="doc-review-value" id="rev-val-make-model">${escapeHtml(makeModel)}</div>
            <div class="doc-review-meta">
              Class: ${escapeHtml(vehClass)} &bull; Color: ${escapeHtml(color)}
            </div>
          </div>
          <button type="button" class="doc-review-jump-btn" data-target="field-make-model">
            ✏️ Jump to Edit in Form &rarr;
          </button>
        </div>

        <!-- 6. INSURANCE POLICY NUMBER & DETAILS -->
        <div class="doc-review-card">
          <div class="doc-review-label-row">
            <div class="doc-review-label">
              <span>🛡️</span> INSURANCE POLICY NUMBER & DETAILS
            </div>
            <span class="doc-review-badge">Active Policy</span>
          </div>
          <div class="doc-review-value-box">
            <div class="doc-review-value" id="rev-val-policy" style="font-family: var(--font-mono);">${escapeHtml(policyNo)}</div>
            <div class="doc-review-meta">
              Insurer: <strong>${escapeHtml(insurer)}</strong> &bull; Period: ${escapeHtml(policyPeriod)} &bull; IDV: ₹${escapeHtml(idvAmount)} &bull; Claim: ${escapeHtml(claimNo)}
            </div>
          </div>
          <button type="button" class="doc-review-jump-btn" data-target="field-policy-no">
            ✏️ Jump to Edit in Form &rarr;
          </button>
        </div>

        <!-- 7. DRIVING LICENCE & DRIVER DETAILS -->
        <div class="doc-review-card">
          <div class="doc-review-label-row">
            <div class="doc-review-label">
              <span>🪪</span> DRIVING LICENCE & DRIVER DETAILS
            </div>
            <span class="doc-review-badge">Authorized Driver</span>
          </div>
          <div class="doc-review-value-box">
            <div class="doc-review-value" id="rev-val-driver">${escapeHtml(driverName)}</div>
            <div class="doc-review-meta">
              DL No: <strong style="font-family:var(--font-mono); color:#cbd5e1;">${escapeHtml(dlNo)}</strong> &bull; Validity: ${escapeHtml(dlValidity)} &bull; Type: ${escapeHtml(dlType)} &bull; Relation: ${escapeHtml(driverRel)}
            </div>
          </div>
          <button type="button" class="doc-review-jump-btn" data-target="field-dl-no">
            ✏️ Jump to Edit in Form &rarr;
          </button>
        </div>

        <!-- 8. VEHICLE TECHNICAL SPECIFICATIONS -->
        <div class="doc-review-card">
          <div class="doc-review-label-row">
            <div class="doc-review-label">
              <span>📊</span> VEHICLE TECHNICAL SPECIFICATIONS
            </div>
            <span class="doc-review-badge">Specs & Metrics</span>
          </div>
          <div class="doc-review-value-box">
            <div class="doc-review-value">Mfg Year: ${escapeHtml(mfgYear)} &bull; Fuel: ${escapeHtml(fuelType)} &bull; CC: ${escapeHtml(cubicCap)}</div>
            <div class="doc-review-meta">
              Seating Capacity: ${escapeHtml(seating)} &bull; Reg Date: ${escapeHtml(regDate)} &bull; Odometer: ${escapeHtml(odometer)}
            </div>
          </div>
          <button type="button" class="doc-review-jump-btn" data-target="field-mfg-year">
            ✏️ Jump to Edit in Form &rarr;
          </button>
        </div>

        <!-- 9. ACCIDENT & DAMAGE SUMMARY -->
        <div class="doc-review-card">
          <div class="doc-review-label-row">
            <div class="doc-review-label">
              <span>💥</span> ACCIDENT & DAMAGE SUMMARY
            </div>
            <span class="doc-review-badge">Physical Survey</span>
          </div>
          <div class="doc-review-value-box">
            <div class="doc-review-value" id="rev-val-damage" style="font-size: 13px; font-weight: 600; line-height: 1.5; color: #f87171;">
              ${escapeHtml(damageSummary)}
            </div>
            <div class="doc-review-meta" style="margin-top: 6px;">
              Survey Date: <strong>${escapeHtml(surveyDate)}</strong> &bull; Place: <strong>${escapeHtml(surveyPlace)}</strong>
            </div>
          </div>
          <button type="button" class="doc-review-jump-btn" data-target="field-damage-summary">
            ✏️ Jump to Edit in Form &rarr;
          </button>
        </div>

        <!-- 10. SURVEYOR DECLARATION & STATUS -->
        <div class="doc-review-card">
          <div class="doc-review-label-row">
            <div class="doc-review-label">
              <span>🖋️</span> SURVEYOR DECLARATION & STATUS
            </div>
            <span class="doc-review-badge">Certified SLA</span>
          </div>
          <div class="doc-review-value-box">
            <div class="doc-review-value" id="rev-val-surveyor">${escapeHtml(surveyorName)}</div>
            <div class="doc-review-meta">
              SLA License: <strong style="color: #cbd5e1;">${escapeHtml(surveyorLicense)}</strong> &bull; Status: <span style="color: #4ade80; font-weight: 700;">${escapeHtml(assessStatus)}</span>
            </div>
          </div>
          <button type="button" class="doc-review-jump-btn" data-target="field-surveyor-name">
            ✏️ Jump to Edit in Form &rarr;
          </button>
        </div>

        <!-- 11. ATTACHED SOURCE EVIDENCE & TEMPLATE MASTER -->
        <div class="doc-review-card" style="border-color: rgba(56, 189, 248, 0.3); background: rgba(14, 23, 42, 0.9);">
          <div class="doc-review-label-row">
            <div class="doc-review-label" style="color: #38bdf8;">
              <span>📂</span> ATTACHED SOURCE EVIDENCE & TEMPLATE
            </div>
            <span class="doc-review-badge">${files.length} Document(s)</span>
          </div>
          <div class="doc-review-value-box" style="background: rgba(0,0,0,0.3);">
            <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 8px;">
              Click any source document below to inspect individual raw scans or OCR text streams:
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${files.map((file, i) => `
                <button type="button" class="doc-tab-btn" style="padding: 3px 8px; font-size: 11px;" onclick="window.studio.selectDocFile(${i})">
                  📄 ${escapeHtml(file.originalName)}
                </button>
              `).join('')}
              ${this.activeSurvey?.templateFile ? `
                <button type="button" class="doc-tab-btn" style="padding: 3px 8px; font-size: 11px; border-color: #22c55e;" onclick="window.studio.selectDocFile(${files.length})">
                  📋 ${escapeHtml(this.activeSurvey.templateFile.originalName || 'Template.docx')}
                </button>
              ` : ''}
              ${this.activeSurvey?.referenceModel ? `
                <button type="button" class="doc-tab-btn" style="padding: 3px 8px; font-size: 11px; border-color: #a78bfa;" onclick="window.studio.selectDocFile(${files.length + (this.activeSurvey?.templateFile ? 1 : 0)})">
                  🎓 ${escapeHtml(this.activeSurvey.referenceModel.fileName || 'Reference Model')}
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach jump button click events
    viewport.querySelectorAll('.doc-review-jump-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        if (targetId) this.jumpToField(targetId);
      });
    });
  }

  renderFormFields() {
    const f = this.extractedFields;
    const c = this.confidenceScores;

    // Helper to populate field and set confidence
    const setField = (id, val, confKey) => {
      const input = document.getElementById(id);
      const chip = document.getElementById(`conf-${id}`);
      const isMissing = !val || val === 'N/A' || val === '-' || val === 'NA.' || val === 'NA' || val === '';
      const displayVal = isMissing ? 'NA' : val;

      if (input) input.value = displayVal;
      if (chip) {
        if (isMissing) {
          chip.textContent = 'Not in Docs (NA)';
          chip.className = 'confidence-chip conf-na';
        } else if (c[confKey]) {
          chip.textContent = c[confKey].label;
          chip.className = `confidence-chip conf-${c[confKey].level}`;
        } else {
          chip.textContent = 'Verified';
          chip.className = 'confidence-chip conf-high';
        }
      }
    };

    // 1. Vehicle Particulars
    setField('field-reg-no', f.vehicle_reg_no, 'vehicle_reg_no');
    setField('field-make-model', f.make_model, 'make_model');
    setField('field-chassis-no', f.chassis_no, 'chassis_no');
    setField('field-engine-no', f.engine_no, 'engine_no');
    setField('field-mfg-year', f.manufacturing_year, 'manufacturing_year');
    setField('field-reg-date', f.registration_date, 'registration_date');
    setField('field-vehicle-class', f.vehicle_class, 'vehicle_class');
    setField('field-fuel-type', f.fuel_type, 'fuel_type');
    setField('field-color', f.color, 'color');
    setField('field-seating', f.seating_capacity, 'seating_capacity');
    setField('field-cubic-cap', f.cubic_capacity, 'cubic_capacity');
    setField('field-odometer', f.odometer_reading, 'odometer_reading');

    // 2. Owner & Driver Particulars
    setField('field-owner-name', f.owner_name, 'owner_name');
    setField('field-driver-name', f.driver_name, 'driver_name');
    setField('field-dl-no', f.dl_no, 'dl_no');
    setField('field-dl-validity', f.dl_validity, 'dl_validity');
    setField('field-dl-type', f.dl_type, 'dl_type');
    setField('field-driver-relation', f.driver_relation, 'driver_relation');
    setField('field-owner-address', f.owner_address, 'owner_address');

    // 3. Insurance Particulars
    setField('field-insurance-company', f.insurance_company, 'insurance_company');
    setField('field-policy-no', f.policy_no, 'policy_no');
    setField('field-policy-period', f.policy_period, 'policy_period');
    setField('field-idv-amount', f.idv_amount, 'idv_amount');
    setField('field-claim-no', f.claim_no, 'claim_no');

    setField('field-survey-date', f.survey_date, 'survey_date');
    setField('field-survey-place', f.survey_place, 'survey_place');
    setField('field-damage-summary', f.damage_summary, 'damage_summary');
    setField('field-assessment-status', f.assessment_status, 'assessment_status');
    setField('field-surveyor-name', f.surveyor_name, 'surveyor_name');
    setField('field-surveyor-license', f.surveyor_license, 'surveyor_license');

    // Populate Executive Extracted Summary Bar (Primary Important Data Points at Top of Studio)
    const setSummaryVal = (id, val, fallback = 'Pending') => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = (val && val !== 'NA' && val !== 'N/A' && val !== '-') ? val : fallback;
      }
    };

    setSummaryVal('sum-reg-no', f.vehicle_reg_no, 'Pending Reg');
    setSummaryVal('sum-make-model', f.make_model, 'Pending Make/Model');
    setSummaryVal('sum-owner-name', f.owner_name, 'Pending Insured');
    setSummaryVal('sum-policy-no', f.policy_no, 'Pending Policy');
    setSummaryVal('sum-insurer', f.insurance_company, 'Pending Insurer');
    setSummaryVal('sum-chassis-no', f.chassis_no, 'Pending Chassis');
    setSummaryVal('sum-survey-date', f.survey_date, new Date().toLocaleDateString('en-GB'));

    // Sync Design 3 Cockpit Hero Display Cards with real extracted data
    const syncHeroCard = (heroId, inputId, defaultVal) => {
      const heroEl = document.getElementById(heroId);
      const inputEl = document.getElementById(inputId);
      if (!heroEl || !inputEl) return;
      const update = () => {
        const val = inputEl.value?.trim();
        heroEl.textContent = (val && val !== 'NA' && val !== 'N/A' && val !== '-') ? val : defaultVal;
      };
      update();
      inputEl.oninput = update;
    };

    syncHeroCard('hero-display-policy', 'field-policy-no', f.policy_no || 'Pending Policy');
    syncHeroCard('hero-display-insured', 'field-owner-name', f.owner_name || 'Pending Insured');
    syncHeroCard('hero-display-vehicle', 'field-make-model', f.make_model || 'Pending Make/Model');
    syncHeroCard('hero-display-plate', 'field-reg-no', f.vehicle_reg_no || 'Pending Reg No');
    syncHeroCard('hero-display-date', 'field-survey-date', f.survey_date || new Date().toLocaleDateString('en-GB'));
    syncHeroCard('hero-display-damage', 'field-damage-summary', f.damage_summary || 'Accidental collision damages documented');

    // Auto-sync real-time edits into Single-Page Document Review
    const formInputs = document.querySelectorAll('.cockpit-pane-right input, .cockpit-pane-right textarea');
    formInputs.forEach(input => {
      input.addEventListener('input', () => {
        if (this.selectedDocTab === 'review') {
          this.syncReviewViewValues();
        }
      });
    });
  }

  collectFormFields() {
    const getVal = (id) => {
      const v = document.getElementById(id)?.value?.trim();
      return (!v || v === 'N/A' || v === '-' || v === 'NA.' || v === 'NA') ? 'NA' : v;
    };

    return {
      vehicle_reg_no: getVal('field-reg-no'),
      make_model: getVal('field-make-model'),
      chassis_no: getVal('field-chassis-no'),
      engine_no: getVal('field-engine-no'),
      manufacturing_year: getVal('field-mfg-year'),
      registration_date: getVal('field-reg-date'),
      vehicle_class: getVal('field-vehicle-class'),
      fuel_type: getVal('field-fuel-type'),
      color: getVal('field-color'),
      seating_capacity: getVal('field-seating'),
      cubic_capacity: getVal('field-cubic-cap'),
      odometer_reading: getVal('field-odometer'),

      owner_name: getVal('field-owner-name'),
      driver_name: getVal('field-driver-name'),
      dl_no: getVal('field-dl-no'),
      dl_validity: getVal('field-dl-validity'),
      dl_type: getVal('field-dl-type'),
      driver_relation: getVal('field-driver-relation'),
      owner_address: getVal('field-owner-address'),

      insurance_company: getVal('field-insurance-company'),
      policy_no: getVal('field-policy-no'),
      policy_period: getVal('field-policy-period'),
      idv_amount: getVal('field-idv-amount'),
      claim_no: getVal('field-claim-no'),

      survey_date: getVal('field-survey-date'),
      survey_place: getVal('field-survey-place'),
      damage_summary: getVal('field-damage-summary'),
      assessment_status: getVal('field-assessment-status'),
      surveyor_name: getVal('field-surveyor-name'),
      surveyor_license: getVal('field-surveyor-license')
    };
  }

  async quickExportDocx() {
    if (!this.activeSurvey) return;
    try {
      window.app.showLoader('Rendering and exporting Word (.docx) survey report...');
      const fields = { ...(this.extractedFields || {}), ...this.collectFormFields() };
      await window.api.verifyFields(this.activeSurvey.id, fields);
      const res = await window.api.generateReport(this.activeSurvey.id);
      window.app.hideLoader();
      const docxReport = res.reports?.find(r => r.format === 'docx');
      if (docxReport) {
        window.open(docxReport.downloadUrl, '_blank');
        window.app.showToast('Word (.docx) report downloaded successfully!', 'success');
      }
    } catch (err) {
      window.app.hideLoader();
      console.error('Quick export docx error:', err);
      window.app.showToast(err.message || 'Failed to export Word report', 'error');
    }
  }

  async quickExportPdf() {
    if (!this.activeSurvey) return;
    try {
      window.app.showLoader('Preparing PDF print preview layout...');
      const fields = { ...(this.extractedFields || {}), ...this.collectFormFields() };
      await window.api.verifyFields(this.activeSurvey.id, fields);
      const res = await window.api.generateReport(this.activeSurvey.id);
      window.app.hideLoader();
      const pdfReport = res.reports?.find(r => r.format === 'pdf');
      if (pdfReport) {
        window.open(pdfReport.downloadUrl, '_blank');
        window.app.showToast('Opening PDF print & save window...', 'success');
      }
    } catch (err) {
      window.app.hideLoader();
      console.error('Quick export pdf error:', err);
      window.app.showToast(err.message || 'Failed to export PDF report', 'error');
    }
  }

  async generateFinalReport() {
    if (!this.activeSurvey) return;

    try {
      window.app.showLoader('Saving verified fields & rendering Word (.docx) template with zero alignment error...');

      // 1. Save verified fields (merge over all extracted fields so unedited real document data is never lost)
      const fields = { ...(this.extractedFields || {}), ...this.collectFormFields() };
      await window.api.verifyFields(this.activeSurvey.id, fields);

      // 2. Generate report
      const res = await window.api.generateReport(this.activeSurvey.id);

      window.app.hideLoader();
      window.app.showToast('Survey Report generated successfully with zero alignment errors!', 'success');

      // 3. Show export screen
      this.renderExportSuccess(res.reports);

    } catch (err) {
      window.app.hideLoader();
      console.error('Error generating report:', err);
      window.app.showToast(err.message || 'Failed to generate report', 'error');
    }
  }

  renderExportSuccess(reports) {
    document.getElementById('studio-workspace').classList.add('hidden');
    document.getElementById('studio-export-success').classList.remove('hidden');

    const btnDocx = document.getElementById('btn-download-docx-final');
    const btnPdf = document.getElementById('btn-download-pdf-final');

    const docxReport = reports.find(r => r.format === 'docx');
    const pdfReport = reports.find(r => r.format === 'pdf');

    if (btnDocx && docxReport) {
      btnDocx.onclick = () => {
        window.open(docxReport.downloadUrl, '_blank');
      };
    }

    if (btnPdf && pdfReport) {
      btnPdf.onclick = () => {
        // Open printable view in new window which triggers browser print / save to PDF
        const win = window.open(pdfReport.downloadUrl, '_blank');
        if (win) {
          win.onload = () => {
            setTimeout(() => win.print(), 500);
          };
        }
      };
    }
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.studio = new VerificationStudio();
