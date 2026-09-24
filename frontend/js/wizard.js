// Survey Intake & Document Upload Wizard

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

class SurveyWizard {
  constructor() {
    this.currentStep = 1;
    this.stagedFiles = []; // Array of File objects
    this.stagedFileDocTypes = {}; // filename -> docType
    this.selectedTemplateId = 'tpl_default_motor_assessment';
    this.customTemplateFile = null;
    this.referenceModelFile = null;
    this.trainedReferenceData = null;
    this.activeSurveyId = null;

    this.init();
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Stepper buttons
    const btnNextToUpload = document.getElementById('btn-step-next-to-upload');
    const btnBackToCase = document.getElementById('btn-step-back-to-case');
    const btnNextToTemplate = document.getElementById('btn-step-next-to-template');
    const btnBackToUpload = document.getElementById('btn-step-back-to-upload');
    const btnStartExtraction = document.getElementById('btn-start-extraction');

    if (btnNextToUpload) {
      btnNextToUpload.addEventListener('click', () => {
        const caseNo = document.getElementById('case-number-input').value.trim();
        if (!caseNo) {
          window.app.showToast('Please enter a Case / Reference number', 'error');
          return;
        }
        this.goToStep(2);
      });
    }

    if (btnBackToCase) {
      btnBackToCase.addEventListener('click', () => this.goToStep(1));
    }

    if (btnNextToTemplate) {
      btnNextToTemplate.addEventListener('click', () => {
        if (this.stagedFiles.length === 0) {
          window.app.showToast('Please upload at least 1 vehicle document (e.g., RC Book or Insurance Policy)', 'error');
          return;
        }
        this.goToStep(3);
      });
    }

    if (btnBackToUpload) {
      btnBackToUpload.addEventListener('click', () => this.goToStep(2));
    }

    // Multi-document dropzone events
    const dropzone = document.getElementById('docs-dropzone');
    const fileInput = document.getElementById('docs-file-input');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleStagedFiles(Array.from(e.dataTransfer.files));
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleStagedFiles(Array.from(e.target.files));
          fileInput.value = '';
        }
      });
    }

    // Template Dropzone
    const tplDropzone = document.getElementById('template-dropzone');
    const tplFileInput = document.getElementById('template-file-input');

    if (tplDropzone && tplFileInput) {
      tplDropzone.addEventListener('click', () => tplFileInput.click());

      tplDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        tplDropzone.classList.add('drag-over');
      });

      tplDropzone.addEventListener('dragleave', () => {
        tplDropzone.classList.remove('drag-over');
      });

      tplDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        tplDropzone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          const file = e.dataTransfer.files[0];
          if (!file.name.endsWith('.docx')) {
            window.app.showToast('Template must be a Word (.docx) document', 'error');
            return;
          }
          this.customTemplateFile = file;
          this.selectedTemplateId = 'custom_uploaded';
          this.updateTemplateSelectionUI();
          window.app.showToast(`Custom template staged: ${file.name}`, 'success');
        }
      });

      tplFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          if (!file.name.endsWith('.docx')) {
            window.app.showToast('Template must be a Word (.docx) document', 'error');
            return;
          }
          this.customTemplateFile = file;
          this.selectedTemplateId = 'custom_uploaded';
          this.updateTemplateSelectionUI();
          window.app.showToast(`Custom template staged: ${file.name}`, 'success');
        }
      });
    }

    // Built-in Template Cards
    const tplCardAssessment = document.getElementById('tpl-card-assessment');
    const tplCardSpot = document.getElementById('tpl-card-spot');

    if (tplCardAssessment) {
      tplCardAssessment.addEventListener('click', () => {
        this.selectedTemplateId = 'tpl_default_motor_assessment';
        this.customTemplateFile = null;
        this.updateTemplateSelectionUI();
      });
    }

    if (tplCardSpot) {
      tplCardSpot.addEventListener('click', () => {
        this.selectedTemplateId = 'tpl_default_spot_survey';
        this.customTemplateFile = null;
        this.updateTemplateSelectionUI();
      });
    }

    // Extraction Trigger
    if (btnStartExtraction) {
      btnStartExtraction.addEventListener('click', () => this.executeIntakeAndExtract());
    }

    // Quick Sample Load Button (creates realistic sample RC, DL, and Insurance docs for fast testing)
    const btnLoadSampleDocs = document.getElementById('btn-load-sample-docs');
    if (btnLoadSampleDocs) {
      btnLoadSampleDocs.addEventListener('click', () => this.loadSampleVehicleDocuments());
    }

    // Reference Model Dropzone & Inputs (Trains Template)
    const refDropzone = document.getElementById('reference-dropzone');
    const refFileInput = document.getElementById('reference-file-input');
    const btnLoadSampleRef = document.getElementById('btn-load-sample-reference');
    const btnCloseRefModal = document.getElementById('btn-close-ref-modal');

    if (refDropzone && refFileInput) {
      refDropzone.addEventListener('click', () => refFileInput.click());

      refDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        refDropzone.classList.add('drag-over');
      });

      refDropzone.addEventListener('dragleave', () => {
        refDropzone.classList.remove('drag-over');
      });

      refDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        refDropzone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleReferenceFile(e.dataTransfer.files[0]);
        }
      });

      refFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleReferenceFile(e.target.files[0]);
          refFileInput.value = '';
        }
      });
    }

    if (btnLoadSampleRef) {
      btnLoadSampleRef.addEventListener('click', () => {
        this.loadSampleReferenceModel();
      });
    }

    if (btnCloseRefModal) {
      btnCloseRefModal.addEventListener('click', () => {
        const modal = document.getElementById('modal-reference-mapping');
        if (modal) modal.classList.add('hidden');
      });
    }
  }

  goToStep(stepNumber) {
    this.currentStep = stepNumber;

    // Update stepper pills
    for (let i = 1; i <= 4; i++) {
      const stepEl = document.getElementById(`step-pill-${i}`);
      const sectionEl = document.getElementById(`wizard-step-${i}`);

      if (stepEl) {
        stepEl.classList.remove('active', 'completed');
        if (i < stepNumber) stepEl.classList.add('completed');
        else if (i === stepNumber) stepEl.classList.add('active');
      }

      if (sectionEl) {
        if (i === stepNumber) sectionEl.classList.remove('hidden');
        else sectionEl.classList.add('hidden');
      }
    }
  }

  handleStagedFiles(newFiles) {
    for (const file of newFiles) {
      // Prevent duplicates
      if (!this.stagedFiles.some(f => f.name === file.name && f.size === file.size)) {
        this.stagedFiles.push(file);

        // Auto determine docType
        const lower = file.name.toLowerCase();
        let docType = 'VEHICLE_DOC';
        if (lower.includes('reference') || lower.includes('templete') || lower.includes('model_report')) {
          docType = 'REFERENCE_MODEL';
          // Auto-train reference model from staged files
          if (!this.referenceModelFile) {
            this.handleReferenceFile(file);
          }
        } else if (lower.includes('rc') || lower.includes('regn') || lower.includes('registration')) {
          docType = 'RC_BOOK';
        } else if (lower.includes('dl') || lower.includes('licen')) {
          docType = 'DRIVING_LICENSE';
        } else if (lower.includes('insur') || lower.includes('policy') || lower.includes('cover')) {
          docType = 'INSURANCE_POLICY';
        } else if (lower.includes('puc') || lower.includes('pollut')) {
          docType = 'PUC_CERTIFICATE';
        } else if (lower.includes('estimate') || lower.includes('assessment')) {
          docType = 'ESTIMATE_ASSESSMENT';
        } else if (lower.includes('damage') || lower.includes('photo') || lower.includes('front') || lower.includes('rear') || lower.includes('side')) {
          docType = 'DAMAGE_PHOTO';
        }

        // Auto-detect custom word template (.docx) if not reference
        if (lower.endsWith('.docx') && docType !== 'REFERENCE_MODEL' && !this.customTemplateFile) {
          this.customTemplateFile = file;
          this.selectedTemplateId = 'custom_uploaded';
          this.updateTemplateSelectionUI();
        }

        this.stagedFileDocTypes[file.name] = docType;
      }
    }

    this.renderStagedFilesList();
    this.renderInitialDataAnalysis();
    this.updateStep2ReferenceBanner();
    window.app.showToast(`Staged ${this.stagedFiles.length} vehicle file(s)`, 'info');
  }

  removeStagedFile(fileName) {
    this.stagedFiles = this.stagedFiles.filter(f => f.name !== fileName);
    delete this.stagedFileDocTypes[fileName];
    this.renderStagedFilesList();
    this.renderInitialDataAnalysis();
    this.updateStep2ReferenceBanner();
  }

  renderStagedFilesList() {
    const listEl = document.getElementById('staged-files-container');
    const badgeEl = document.getElementById('staged-count-badge');
    if (!listEl) return;

    if (badgeEl) {
      badgeEl.textContent = `${this.stagedFiles.length} Document(s) Staged`;
    }

    if (this.stagedFiles.length === 0) {
      listEl.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-subtle); font-size: 13px;">No documents staged yet. Drag & drop files above or click to select.</div>`;
      this.renderInitialDataAnalysis();
      return;
    }

    listEl.innerHTML = '';
    this.stagedFiles.forEach(file => {
      const ext = file.name.split('.').pop().toUpperCase();
      const sizeFormatted = (file.size / 1024).toFixed(1) + ' KB';
      const currentDocType = this.stagedFileDocTypes[file.name] || 'VEHICLE_DOC';

      const item = document.createElement('div');
      item.className = 'file-card-item';
      item.innerHTML = `
        <div class="file-card-info">
          <div class="file-icon-box">${ext}</div>
          <div>
            <div class="file-name">${escapeHtml(file.name)}</div>
            <div class="file-meta">${sizeFormatted} &bull; Staged for extraction</div>
          </div>
          <select class="doc-type-select" data-filename="${escapeHtml(file.name)}">
            <option value="RC_BOOK" ${currentDocType === 'RC_BOOK' ? 'selected' : ''}>RC Book / Reg Cert</option>
            <option value="DRIVING_LICENSE" ${currentDocType === 'DRIVING_LICENSE' ? 'selected' : ''}>Driving License</option>
            <option value="INSURANCE_POLICY" ${currentDocType === 'INSURANCE_POLICY' ? 'selected' : ''}>Insurance Policy</option>
            <option value="PUC_CERTIFICATE" ${currentDocType === 'PUC_CERTIFICATE' ? 'selected' : ''}>Pollution / PUC</option>
            <option value="DAMAGE_PHOTO" ${currentDocType === 'DAMAGE_PHOTO' ? 'selected' : ''}>Damage Photo</option>
            <option value="REFERENCE_MODEL" ${currentDocType === 'REFERENCE_MODEL' ? 'selected' : ''}>Reference Model Report (Trains Template)</option>
            <option value="ESTIMATE_ASSESSMENT" ${currentDocType === 'ESTIMATE_ASSESSMENT' ? 'selected' : ''}>Repair Estimate / Assessment</option>
            <option value="VEHICLE_DOC" ${currentDocType === 'VEHICLE_DOC' ? 'selected' : ''}>Other Vehicle Doc</option>
          </select>
        </div>
        <button class="btn-remove-file" title="Remove file" data-remove="${escapeHtml(file.name)}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;

      // Event listener for docType dropdown
      const select = item.querySelector('.doc-type-select');
      select.addEventListener('change', (e) => {
        const newType = e.target.value;
        this.stagedFileDocTypes[file.name] = newType;
        if (newType === 'REFERENCE_MODEL') {
          this.handleReferenceFile(file);
        }
        this.renderInitialDataAnalysis();
        this.updateStep2ReferenceBanner();
      });

      // Event listener for remove button
      const btnRemove = item.querySelector('[data-remove]');
      btnRemove.addEventListener('click', () => {
        this.removeStagedFile(file.name);
      });

      listEl.appendChild(item);
    });

    this.renderInitialDataAnalysis();
  }

  renderInitialDataAnalysis() {
    const cardEl = document.getElementById('initial-data-analysis-card');
    if (!cardEl) return;

    if (this.stagedFiles.length === 0) {
      cardEl.classList.add('hidden');
      return;
    }

    cardEl.classList.remove('hidden');

    // Aggregate statistics
    const totalFiles = this.stagedFiles.length;
    const totalBytes = this.stagedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    const totalSizeKb = (totalBytes / 1024).toFixed(1);

    const docTypesMap = {};
    for (const [fn, type] of Object.entries(this.stagedFileDocTypes)) {
      docTypesMap[type] = (docTypesMap[type] || 0) + 1;
    }

    const hasRc = !!docTypesMap['RC_BOOK'];
    const hasDl = !!docTypesMap['DRIVING_LICENSE'];
    const hasPolicy = !!docTypesMap['INSURANCE_POLICY'];
    const photoCount = docTypesMap['DAMAGE_PHOTO'] || 0;
    const isRefTrained = !!this.referenceModelFile;

    // Scan filenames for vehicle registration marks (e.g. TN-59-CR-9090 or MH-12-DE-1433)
    let detectedRegNo = '';
    for (const f of this.stagedFiles) {
      const regMatch = f.name.match(/\b([A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{1,3}[-\s]?[0-9]{4})\b/i);
      if (regMatch) {
        detectedRegNo = regMatch[1].toUpperCase().replace(/\s+/g, '-');
        break;
      }
    }

    // Auto-populate vehicle registration preview in Step 1 if available
    const regInput = document.getElementById('vehicle-reg-preview');
    if (regInput && detectedRegNo && !regInput.value) {
      regInput.value = detectedRegNo;
    }

    // Update stat numbers
    const statDocsEl = document.getElementById('stat-classified-docs');
    const statRcEl = document.getElementById('stat-rc-detected');
    const statPolicyEl = document.getElementById('stat-policy-detected');
    const statDlEl = document.getElementById('stat-dl-detected');
    const badgeEl = document.getElementById('analysis-readiness-badge');
    const previewRow = document.getElementById('initial-detected-preview-row');

    const uniqueTypesCount = Object.keys(docTypesMap).length;
    if (statDocsEl) statDocsEl.textContent = `${totalFiles} Files (${uniqueTypesCount} Classified)`;

    if (statRcEl) {
      if (hasRc) {
        statRcEl.innerHTML = `<span style="color:#4ade80;">✓ RC Record ${detectedRegNo ? `(${escapeHtml(detectedRegNo)})` : 'Staged'}</span>`;
      } else {
        statRcEl.innerHTML = `<span style="color:#fbbf24;">⚠️ Pending RC Record</span>`;
      }
    }

    if (statPolicyEl) {
      if (hasPolicy) {
        statPolicyEl.innerHTML = `<span style="color:#4ade80;">✓ Policy / Coverage Staged</span>`;
      } else {
        statPolicyEl.innerHTML = `<span style="color:#fbbf24;">⚠️ Pending Policy Copy</span>`;
      }
    }

    if (statDlEl) {
      if (hasDl) {
        statDlEl.innerHTML = `<span style="color:#4ade80;">✓ Driving Licence Staged</span>`;
      } else {
        statDlEl.innerHTML = `<span style="color:#94a3b8;">○ Optional / Pending DL</span>`;
      }
    }

    // Readiness score
    if (badgeEl) {
      if (hasRc && hasPolicy && hasDl) {
        badgeEl.textContent = '🟢 100% Core Documents Verified — Ready for Extraction';
        badgeEl.style.borderColor = 'rgba(74, 222, 128, 0.4)';
        badgeEl.style.color = '#4ade80';
        badgeEl.style.background = 'rgba(74, 222, 128, 0.15)';
      } else if (hasRc || hasPolicy) {
        badgeEl.textContent = '🟡 Primary Vehicle Record Staged — Ready to Extract';
        badgeEl.style.borderColor = 'rgba(251, 191, 36, 0.4)';
        badgeEl.style.color = '#fbbf24';
        badgeEl.style.background = 'rgba(251, 191, 36, 0.15)';
      } else {
        badgeEl.textContent = '🔵 Files Staged — Add RC / Policy for Maximum Accuracy';
        badgeEl.style.borderColor = 'rgba(56, 189, 248, 0.4)';
        badgeEl.style.color = '#38bdf8';
        badgeEl.style.background = 'rgba(56, 189, 248, 0.15)';
      }
    }

    // Interactive chips in preview row
    if (previewRow) {
      let chipsHtml = `
        <span class="detected-part-chip">
          <span>📦</span> Total Payload: ${totalSizeKb} KB (${totalFiles} file${totalFiles > 1 ? 's' : ''})
        </span>
      `;

      if (detectedRegNo) {
        chipsHtml += `
          <span class="detected-part-chip success">
            <span>🚗</span> Vehicle Reg: <strong>${escapeHtml(detectedRegNo)}</strong>
          </span>
        `;
      }

      if (hasRc) {
        chipsHtml += `
          <span class="detected-part-chip success">
            <span>✓</span> RC Book / Registration (${docTypesMap['RC_BOOK']})
          </span>
        `;
      }

      if (hasPolicy) {
        chipsHtml += `
          <span class="detected-part-chip success">
            <span>✓</span> Insurance Policy (${docTypesMap['INSURANCE_POLICY']})
          </span>
        `;
      }

      if (hasDl) {
        chipsHtml += `
          <span class="detected-part-chip success">
            <span>✓</span> Driving Licence (${docTypesMap['DRIVING_LICENSE']})
          </span>
        `;
      }

      if (photoCount > 0) {
        chipsHtml += `
          <span class="detected-part-chip purple">
            <span>📸</span> Inspection & Damage Photos (${photoCount})
          </span>
        `;
      }

      if (isRefTrained && this.referenceModelFile) {
        chipsHtml += `
          <span class="detected-part-chip purple">
            <span>🎓</span> Trained Reference Model: ${escapeHtml(this.referenceModelFile.name)} (Single Tab Spacing Enforced)
          </span>
        `;
      }

      if (this.customTemplateFile) {
        chipsHtml += `
          <span class="detected-part-chip" style="background: rgba(37,99,235,0.15); color: #93c5fd; border-color: rgba(37,99,235,0.3);">
            <span>📋</span> Custom Target Template: ${escapeHtml(this.customTemplateFile.name)}
          </span>
        `;
      }

      previewRow.innerHTML = chipsHtml;
    }
  }

  updateTemplateSelectionUI() {
    const cardAssessment = document.getElementById('tpl-card-assessment');
    const cardSpot = document.getElementById('tpl-card-spot');
    const customStatus = document.getElementById('custom-template-status');
    const cardContainer = document.getElementById('active-template-card-container');
    const tplDropzone = document.getElementById('template-dropzone');

    if (cardAssessment) cardAssessment.classList.remove('selected');
    if (cardSpot) cardSpot.classList.remove('selected');

    if (this.selectedTemplateId === 'tpl_default_motor_assessment' && cardAssessment) {
      cardAssessment.classList.add('selected');
      if (customStatus) customStatus.textContent = 'Or drag & drop your custom .docx template below:';
      if (cardContainer) cardContainer.innerHTML = '';
      if (tplDropzone) tplDropzone.style.borderColor = 'var(--border-color)';
    } else if (this.selectedTemplateId === 'tpl_default_spot_survey' && cardSpot) {
      cardSpot.classList.add('selected');
      if (customStatus) customStatus.textContent = 'Or drag & drop your custom .docx template below:';
      if (cardContainer) cardContainer.innerHTML = '';
      if (tplDropzone) tplDropzone.style.borderColor = 'var(--border-color)';
    } else if (this.selectedTemplateId === 'custom_uploaded') {
      if (this.customTemplateFile) {
        if (customStatus) {
          customStatus.innerHTML = `<span style="color: var(--success); font-weight: bold;">✓ Custom Word Template Selected:</span>`;
        }
        if (tplDropzone) {
          tplDropzone.style.borderColor = '#3b82f6';
        }
        if (cardContainer) {
          const fileSizeKb = (this.customTemplateFile.size / 1024).toFixed(1);
          cardContainer.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, rgba(37,99,235,0.18) 0%, rgba(30,41,59,0.85) 100%); border: 1.5px solid #3b82f6; border-radius: 10px; padding: 14px 18px; box-shadow: 0 4px 12px rgba(37,99,235,0.15);">
              <div style="display: flex; align-items: center; gap: 14px;">
                <div style="width: 44px; height: 44px; border-radius: 8px; background: rgba(37,99,235,0.3); border: 1px solid #60a5fa; display: flex; align-items: center; justify-content: center; color: #60a5fa; flex-shrink: 0;">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                </div>
                <div>
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-weight: 700; font-size: 14px; color: #ffffff;">${escapeHtml(this.customTemplateFile.name)}</span>
                    <span class="badge" style="background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); font-size: 11px;">✓ Active Custom Template</span>
                  </div>
                  <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">
                    ${fileSizeKb} KB &bull; Zero-distortion overwrite enabled (preserves all alignments, tab stops & styles)
                  </div>
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-remove-custom-template" style="color: #ef4444; border-color: rgba(239,68,68,0.3); flex-shrink: 0;" title="Remove custom template">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                Remove
              </button>
            </div>
          `;

          const btnRemoveTpl = document.getElementById('btn-remove-custom-template');
          if (btnRemoveTpl) {
            btnRemoveTpl.addEventListener('click', (e) => {
              e.stopPropagation();
              this.customTemplateFile = null;
              this.selectedTemplateId = 'tpl_default_motor_assessment';
              this.updateTemplateSelectionUI();
              window.app.showToast('Reverted to standard assessment template', 'info');
            });
          }
        }
      }
    }
  }

  loadSampleVehicleDocuments() {
    // Generate realistic simulated text documents representing RC Book, Driving License, and Insurance Policy
    const rcContent = `GOVERNMENT OF INDIA - TRANSPORT DEPARTMENT
CERTIFICATE OF REGISTRATION (RC BOOK)
Registration No: MH-12-DE-1433
Date of Registration: 18/04/2021
Chassis Number / VIN: MA3EWA12S00984123
Engine Number: K12MN8923411
Owner Name: Rajesh V. Patil
Address: Flat 402, Shanti Vihar, Baner Road, Pune, Maharashtra 411045
Make / Model: MARUTI SUZUKI SWIFT VXI
Vehicle Class: LMV (Private Motor Car)
Fuel Type: Petrol
Manufacturing Year: 2021
Color: Arctic White Metallic
Seating Capacity: 5 In All
Cubic Capacity: 1197 CC
Unladen Weight: 890 KG
`;

    const insContent = `THE NEW INDIA ASSURANCE CO. LTD.
MOTOR PRIVATE CAR PACKAGE POLICY SCHEDULE
Policy Number: 12080031230100094182
Name of Insured: Rajesh V. Patil
Address: Flat 402, Shanti Vihar, Pune 411045
Period of Insurance: From 18/04/2025 to 17/04/2026
Vehicle Regn No: MH-12-DE-1433
Make & Model: MARUTI SUZUKI SWIFT VXI
Chassis No: MA3EWA12S00984123
Engine No: K12MN8923411
Insured's Declared Value (IDV): ₹ 5,80,000
Claim Number: CLM-2026-90812
Insuring Office: Pune Divisional Office III
`;

    const dlContent = `INDIAN UNION DRIVING LICENCE
Licence No: MH-12-2015-0048921
Name of Driver: Rajesh V. Patil
Date of Birth: 12/07/1988
Residing At: Pune, Maharashtra
Valid Upto: 11/07/2035
Class of Vehicle: LMV - Motor Car / Motorcycle
`;

    const fileRc = new File([rcContent], 'RC_Book_MH12DE1433.txt', { type: 'text/plain' });
    const fileIns = new File([insContent], 'Insurance_Policy_NewIndia.txt', { type: 'text/plain' });
    const fileDl = new File([dlContent], 'Driving_Licence_Patil.txt', { type: 'text/plain' });

    this.handleStagedFiles([fileRc, fileIns, fileDl]);
    window.app.showToast('Pre-loaded 3 realistic vehicle documents (RC, Insurance, DL)!', 'success');
  }

  async executeIntakeAndExtract() {
    try {
      window.app.showLoader('Creating survey case and uploading files...');

      // 1. Create survey
      const caseNumber = document.getElementById('case-number-input').value.trim();
      const insurer = document.getElementById('insurer-select').value;
      const claimNo = document.getElementById('claim-number-input').value.trim();

      const surveyRes = await window.api.createSurvey({
        caseNumber,
        insurer,
        claimNo
      });

      const surveyId = surveyRes.survey.id;
      this.activeSurveyId = surveyId;

      // 2. Upload vehicle documents
      window.app.showLoader(`Uploading ${this.stagedFiles.length} vehicle documents to server...`);
      await window.api.uploadDocuments(surveyId, this.stagedFiles, this.stagedFileDocTypes);

      // 3. Upload or select template
      if (this.customTemplateFile) {
        window.app.showLoader('Uploading custom DOCX template...');
        await window.api.uploadTemplate(surveyId, this.customTemplateFile, this.customTemplateFile.name);
      } else {
        await window.api.selectTemplate(surveyId, this.selectedTemplateId);
      }

      // 3b. Upload and attach trained reference model if provided
      if (this.referenceModelFile) {
        window.app.showLoader('Attaching trained reference model & single-tab alignment locks...');
        await window.api.uploadReference(surveyId, this.referenceModelFile);
      }

      // 4. Run intelligent extraction
      window.app.showLoader('Extracting text & running semantic entity disambiguation (zero-collision parser)...');
      const extractRes = await window.api.extractData(surveyId);

      window.app.hideLoader();
      window.app.showToast('Document data extracted with zero collision!', 'success');

      // 5. Open Verification Studio with active survey
      window.app.switchTab('studio');
      await window.studio.loadSurveyIntoStudio(surveyId);

    } catch (err) {
      window.app.hideLoader();
      console.error('Intake execution error:', err);
      window.app.showToast(err.message || 'Error executing survey intake', 'error');
    }
  }

  async handleReferenceFile(file) {
    try {
      window.app.showLoader('Analyzing Reference Model & Training Template Intelligence...');
      const res = await window.api.analyzeReferencePreview(file);
      this.referenceModelFile = file;
      this.trainedReferenceData = res.training;
      this.renderReferenceModelUI();
      this.updateStep2ReferenceBanner();
      window.app.hideLoader();
      window.app.showToast(`Reference Model trained: ${file.name} (Single Tab Space Alignment active!)`, 'success');
    } catch (err) {
      window.app.hideLoader();
      console.error('Reference training error:', err);
      window.app.showToast(err.message || 'Failed to analyze reference file', 'error');
    }
  }

  removeReferenceModel() {
    this.referenceModelFile = null;
    this.trainedReferenceData = null;
    const refContainer = document.getElementById('active-reference-card-container');
    const intelContainer = document.getElementById('reference-intelligence-container');
    const refDropzone = document.getElementById('reference-dropzone');
    const step2Banner = document.getElementById('step2-reference-banner');

    if (refContainer) refContainer.innerHTML = '';
    if (intelContainer) {
      intelContainer.innerHTML = '';
      intelContainer.classList.add('hidden');
    }
    if (refDropzone) refDropzone.style.borderColor = 'rgba(167, 139, 250, 0.3)';
    if (step2Banner) step2Banner.classList.add('hidden');
    window.app.showToast('Reference model cleared', 'info');
  }

  loadSampleReferenceModel() {
    const sampleRefContent = `========================================================================================
MOTOR SURVEY AND FINAL LOSS ASSESSMENT REPORT
Independent Insurance Surveyor & Loss Assessor
========================================================================================
Report Ref No	:	SURV-2026-REF-089		Survey Date	:	22/09/2026
Claim Number	:	CLM-2026-90812			Inspection Place	:	Baner, Pune

1. POLICY & INSURED PARTICULARS
Insuring Company	:	The New India Assurance Co. Ltd.
Policy Number		:	12080031230100094182
Period of Insurance	:	18/04/2025 to 17/04/2026
Name of Insured		:	Rajesh V. Patil
Insured Address		:	Flat 402, Shanti Vihar, Baner Road, Pune 411045
Sum Insured (IDV)	:	₹ 5,80,000
H.P.A / Financier	:	HDFC Bank Ltd.

2. VEHICLE PARTICULARS
Registration Number	:	MH-12-DE-1433
Date of Registration	:	18/04/2021
Make & Model		:	MARUTI SUZUKI SWIFT VXI
Chassis Number / VIN	:	MA3EWA12S00984123
Engine Number		:	K12MN8923411
Manufacturing Year	:	2021
Class of Vehicle	:	LMV (Private Motor Car)
Type of Body		:	SALOON / HATCHBACK
Fuel Type		:	Petrol
Seating Capacity	:	5 In All
Cubic Capacity		:	1197 CC
Odometer Reading	:	34,812 KM
Vehicle Colour		:	Arctic White Metallic

3. DRIVER PARTICULARS
Driver's Name		:	Rajesh V. Patil
Driving Licence No.	:	MH-12-2015-0048921
Date of Issue		:	12/07/2015
Valid up to		:	11/07/2035
Class Allowed		:	LMV-NT
Licencing Authority	:	RTO Pune, Maharashtra
Relationship with Insured:	Self

4. ACCIDENT & SURVEY PARTICULARS
Date & Time of Accident	:	20/09/2026 at 14:30 Hrs
Place of Accident	:	Mumbai-Pune Expressway, near Urse Toll Plaza
Date & Time of Survey	:	22/09/2026 at 11:00 Hrs
Place of Survey		:	M/s Sai Service Authorized Workshop, Pune
Contact Person Workshop	:	Mr. Amit Sharma (Service Advisor)
Police Intimation / FIR	:	Reported to Shirgaon Police Station (Station Diary Entry No. 412)
Damage Summary		:	Front bumper cracked, radiator assembly damaged, bonnet dented, condenser leaked

5. LOSS ASSESSMENT PARTICULARS
Assessment Status	:	SURVEY COMPLETED & VERIFIED
Surveyor Name		:	Senior Inspector Rajesh Kumar
IRDA License Number	:	IRDA/SLA/2026/89412
========================================================================================`;

    const refFile = new File([sampleRefContent], 'Reference_Model_Report_Oriental_National.txt', { type: 'text/plain' });
    this.handleReferenceFile(refFile);
  }

  renderReferenceModelUI() {
    const refContainer = document.getElementById('active-reference-card-container');
    const intelContainer = document.getElementById('reference-intelligence-container');
    const refDropzone = document.getElementById('reference-dropzone');

    if (!this.trainedReferenceData || !this.referenceModelFile) return;

    const data = this.trainedReferenceData;
    const fileSizeKb = (this.referenceModelFile.size / 1024).toFixed(1);

    if (refDropzone) {
      refDropzone.style.borderColor = '#a78bfa';
    }

    if (refContainer) {
      refContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, rgba(167,139,250,0.18) 0%, rgba(30,41,59,0.85) 100%); border: 1.5px solid #a78bfa; border-radius: 10px; padding: 14px 18px; box-shadow: 0 4px 12px rgba(167,139,250,0.15);">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 8px; background: rgba(167,139,250,0.3); border: 1px solid #c4b5fd; display: flex; align-items: center; justify-content: center; color: #c4b5fd; flex-shrink: 0;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-weight: 700; font-size: 14px; color: #ffffff;">${escapeHtml(this.referenceModelFile.name)}</span>
                <span class="badge" style="background: rgba(167, 139, 250, 0.25); color: #ddd6fe; border: 1px solid rgba(167, 139, 250, 0.4); font-size: 11px;">✓ Active Reference Model</span>
              </div>
              <div style="font-size: 12px; color: #cbd5e1; margin-top: 3px;">
                ${fileSizeKb} KB &bull; <strong style="color: #4ade80;">Single Tab Space Alignment Locked</strong> &bull; ${data.totalMappedFields} Fields Mapped
              </div>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-remove-reference-model" style="color: #ef4444; border-color: rgba(239,68,68,0.3); flex-shrink: 0;" title="Remove reference model">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            Remove
          </button>
        </div>
      `;

      const btnRemove = document.getElementById('btn-remove-reference-model');
      if (btnRemove) {
        btnRemove.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeReferenceModel();
        });
      }
    }

    if (intelContainer) {
      intelContainer.classList.remove('hidden');

      const reqDocsHtml = (data.requiredDocuments || []).map(d => `
        <span class="ref-doc-pill ${d.priority === 'CRITICAL' ? 'critical' : ''}" title="${escapeHtml(d.description)}">
          <span>●</span> ${escapeHtml(d.title)}
        </span>
      `).join('');

      intelContainer.innerHTML = `
        <div class="ref-header-row">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="ref-badge-active">✨ Learned Template Intelligence Active</span>
              <span style="font-size: 12px; color: var(--text-muted);">Source: ${escapeHtml(data.fileName)}</span>
            </div>
            <div style="font-size: 15px; font-weight: 700; color: #ffffff; margin-top: 6px;">
              Template Trained from Model Reference Document
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-inspect-ref-mapping">
            🔍 Inspect Field Mappings & Alignment Rules
          </button>
        </div>

        <div class="ref-alignment-banner">
          <div class="ref-alignment-badge">ENFORCED</div>
          <div style="flex: 1;">
            <strong>${escapeHtml(data.alignment.label)}:</strong> ${escapeHtml(data.alignment.description)}
          </div>
        </div>

        <div class="ref-metrics-grid">
          <div class="ref-metric-card">
            <div class="ref-metric-label">Source Docs Required</div>
            <div class="ref-metric-val" style="color: #60a5fa;">${data.requiredDocuments ? data.requiredDocuments.length : 0} Document Types</div>
          </div>
          <div class="ref-metric-card">
            <div class="ref-metric-label">Datas to Upload / Extract</div>
            <div class="ref-metric-val" style="color: #4ade80;">${data.totalMappedFields} Target Fields</div>
          </div>
          <div class="ref-metric-card">
            <div class="ref-metric-label">Target Placement Sections</div>
            <div class="ref-metric-val" style="color: #c4b5fd;">${data.sections ? data.sections.length : 0} Report Sections</div>
          </div>
          <div class="ref-metric-card">
            <div class="ref-metric-label">Horizontal Alignment</div>
            <div class="ref-metric-val" style="color: #facc15;">Single Tab Space (\t)</div>
          </div>
        </div>

        <div>
          <div style="font-size: 12px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
            Required Source Documents Checklist (Trained from Model):
          </div>
          <div class="ref-docs-list">
            ${reqDocsHtml}
          </div>
        </div>
      `;

      const btnInspect = document.getElementById('btn-inspect-ref-mapping');
      if (btnInspect) {
        btnInspect.addEventListener('click', () => {
          this.openReferenceMappingModal();
        });
      }
    }
  }

  updateStep2ReferenceBanner() {
    const banner = document.getElementById('step2-reference-banner');
    const pillsContainer = document.getElementById('step2-ref-docs-pills');
    if (!banner || !pillsContainer) return;

    if (!this.trainedReferenceData) {
      banner.classList.add('hidden');
      return;
    }

    banner.classList.remove('hidden');
    const stagedTypes = Object.values(this.stagedFileDocTypes);

    const pillsHtml = (this.trainedReferenceData.requiredDocuments || []).map(d => {
      const isSatisfied = stagedTypes.includes(d.docType);
      return `
        <span class="badge" style="background: ${isSatisfied ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}; color: ${isSatisfied ? '#4ade80' : '#cbd5e1'}; border: 1px solid ${isSatisfied ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.15)'}; font-size: 11px; padding: 4px 8px;">
          ${isSatisfied ? '✓' : '○'} ${escapeHtml(d.title)}
        </span>
      `;
    }).join('');

    pillsContainer.innerHTML = pillsHtml;
  }

  openReferenceMappingModal() {
    const modal = document.getElementById('modal-reference-mapping');
    const body = document.getElementById('modal-ref-body');
    if (!modal || !body || !this.trainedReferenceData) return;

    const data = this.trainedReferenceData;

    let sectionsHtml = '';
    if (data.sections && data.sections.length > 0) {
      sectionsHtml = data.sections.map(sec => `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; margin-bottom: 14px;">
          <div style="font-weight: 700; font-size: 14px; color: #60a5fa; margin-bottom: 4px;">${escapeHtml(sec.name)}</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">${escapeHtml(sec.description)}</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${sec.fields.map(f => `
              <span class="tag-pill" style="font-size: 11px; color: #e2e8f0; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); padding: 3px 8px;">
                ${escapeHtml(f.label)} &bull; <code style="color: #93c5fd; font-size: 10px;">[TAB] : [TAB]</code>
              </span>
            `).join('')}
          </div>
        </div>
      `).join('');
    }

    body.innerHTML = `
      <div style="margin-bottom: 18px; background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 8px; padding: 14px;">
        <div style="font-weight: 700; color: #4ade80; font-size: 13px; margin-bottom: 4px;">
          📐 Enforced Alignment Profile: ${escapeHtml(data.alignment.label)}
        </div>
        <div style="font-size: 12px; color: #cbd5e1; line-height: 1.5;">
          ${escapeHtml(data.alignment.description)}
        </div>
        <div style="margin-top: 8px; font-family: var(--font-mono); font-size: 11px; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; color: #86efac;">
          [Field Label] &lt;w:tab/&gt; : &lt;w:tab/&gt; [Extracted Value]
        </div>
      </div>

      <div style="font-weight: 700; font-size: 14px; color: #ffffff; margin-bottom: 10px;">
        Where to Upload & Extract (Target Report Sections):
      </div>
      ${sectionsHtml}

      <div style="font-weight: 700; font-size: 14px; color: #ffffff; margin-top: 18px; margin-bottom: 10px;">
        Required Source Documents (Trained from Model):
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${(data.requiredDocuments || []).map(doc => `
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px 14px;">
            <div>
              <div style="font-weight: 700; font-size: 13px; color: #ffffff;">${escapeHtml(doc.title)}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(doc.description)}</div>
            </div>
            <span class="badge ${doc.priority === 'CRITICAL' ? 'badge-cancelled' : 'badge-completed'}">${escapeHtml(doc.priority)}</span>
          </div>
        `).join('')}
      </div>
    `;

    modal.classList.remove('hidden');
  }

  resetWizard() {
    this.currentStep = 1;
    this.stagedFiles = [];
    this.stagedFileDocTypes = {};
    this.customTemplateFile = null;
    this.referenceModelFile = null;
    this.trainedReferenceData = null;
    this.selectedTemplateId = 'tpl_default_motor_assessment';
    this.activeSurveyId = null;

    document.getElementById('case-number-input').value = 'SURV-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
    document.getElementById('claim-number-input').value = 'CLM-' + Math.floor(100000 + Math.random() * 900000);
    this.renderStagedFilesList();
    this.updateTemplateSelectionUI();
    this.removeReferenceModel();
    this.goToStep(1);
  }
}

window.wizard = new SurveyWizard();
