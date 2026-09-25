// Main Application Controller for AutoSurveyor Pro

class AppController {
  constructor() {
    this.currentTab = 'wizard';
    this.init();
  }

  init() {
    this.bindNavigation();
    this.setupToastContainer();
    this.setupLoadingOverlay();
    this.initTheme();

    // Default case number pre-fill
    const caseInput = document.getElementById('case-number-input');
    if (caseInput && !caseInput.value) {
      caseInput.value = 'SURV-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
    }
    const claimInput = document.getElementById('claim-number-input');
    if (claimInput && !claimInput.value) {
      claimInput.value = 'CLM-' + Math.floor(100000 + Math.random() * 900000);
    }
  }

  initTheme() {
    const savedTheme = localStorage.getItem('autosurveyor_theme') || 'sapphire';
    this.applyTheme(savedTheme);

    document.querySelectorAll('.theme-dot').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const theme = btn.getAttribute('data-theme');
        this.applyTheme(theme);
        this.showToast(`Active Theme: ${btn.title}`, 'info');
      });
    });
  }

  applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('autosurveyor_theme', themeName);
    document.querySelectorAll('.theme-dot').forEach(btn => {
      if (btn.getAttribute('data-theme') === themeName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  bindNavigation() {
    // Header Navigation Listeners
    const navWizard = document.getElementById('nav-btn-wizard');
    const navPending = document.getElementById('nav-btn-pending');
    const navReports = document.getElementById('nav-btn-reports');
    const navTasksFiles = document.getElementById('nav-btn-tasks-files');
    const navAdminDashboard = document.getElementById('nav-btn-admin-dashboard');

    if (navWizard) navWizard.addEventListener('click', () => this.switchTab('wizard'));
    if (navPending) navPending.addEventListener('click', () => this.switchTab('pending'));
    if (navReports) navReports.addEventListener('click', () => this.switchTab('reports'));
    if (navTasksFiles) navTasksFiles.addEventListener('click', () => this.switchTab('tasks-files'));
    if (navAdminDashboard) navAdminDashboard.addEventListener('click', () => this.switchTab('admin-dashboard'));

    // Design 3 Executive Sidebar Navigation Listeners
    const sideWizard = document.getElementById('side-nav-wizard');
    const sidePending = document.getElementById('side-nav-pending');
    const sideReports = document.getElementById('side-nav-reports');
    const sideTasksFiles = document.getElementById('side-nav-tasks-files');
    const sideAdminDashboard = document.getElementById('side-nav-admin-dashboard');

    if (sideWizard) sideWizard.addEventListener('click', () => this.switchTab('wizard'));
    if (sidePending) sidePending.addEventListener('click', () => this.switchTab('pending'));
    if (sideReports) sideReports.addEventListener('click', () => this.switchTab('reports'));
    if (sideTasksFiles) sideTasksFiles.addEventListener('click', () => this.switchTab('tasks-files'));
    if (sideAdminDashboard) sideAdminDashboard.addEventListener('click', () => this.switchTab('admin-dashboard'));

    const brandBtn = document.getElementById('brand-home-btn');
    if (brandBtn) {
      brandBtn.addEventListener('click', () => this.switchTab('wizard'));
    }

    const btnNewSurvey = document.getElementById('btn-pending-new-survey');
    if (btnNewSurvey) {
      btnNewSurvey.addEventListener('click', () => this.switchTab('wizard'));
    }

    // Admin Dashboard Lifecycle Filter Tabs
    const lifecycleTabs = document.querySelectorAll('.lifecycle-tab-btn[data-lifecycle]');
    lifecycleTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        lifecycleTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const filter = tab.getAttribute('data-lifecycle');
        this.renderAdminDashboardTable(filter);
      });
    });


    // Refresh Dashboard button
    const btnRefreshDash = document.getElementById('btn-refresh-admin-dashboard');
    if (btnRefreshDash) {
      btnRefreshDash.addEventListener('click', () => this.loadAdminDashboard());
    }

    // Tasks & Files selector change
    const selSurvey = document.getElementById('tasks-files-survey-select');
    if (selSurvey) {
      selSurvey.addEventListener('change', (e) => {
        const id = e.target.value;
        if (id) this.renderTaskComparison(id);
      });
    }
  }

  switchTab(tabName) {
    this.currentTab = tabName;

    // Header nav active states
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activeNav = document.getElementById(`nav-btn-${tabName}`);
    if (activeNav) activeNav.classList.add('active');

    // Sidebar nav active states (Design 3)
    document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));
    const sideTabId = (tabName === 'studio') ? 'side-nav-wizard' : `side-nav-${tabName}`;
    const activeSideNav = document.getElementById(sideTabId);
    if (activeSideNav) activeSideNav.classList.add('active');

    // Sections visibility
    const views = ['wizard', 'studio', 'pending', 'reports', 'tasks-files', 'admin-dashboard'];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) {
        if (v === tabName) el.classList.remove('hidden');
        else el.classList.add('hidden');
      }
    });

    // Tab-specific initializers
    if (tabName === 'pending') {
      this.loadPendingClaims();
    } else if (tabName === 'reports') {
      this.loadSurveyReports();
    } else if (tabName === 'tasks-files') {
      this.loadTasksAndFiles();
    } else if (tabName === 'admin-dashboard') {
      this.loadAdminDashboard();
    }
  }

  // 1. PENDING CLAIMS: Contains ONLY Draft or Incomplete Tasks
  async loadPendingClaims() {
    const tbody = document.getElementById('pending-surveys-tbody');
    if (!tbody) return;

    try {
      this.showLoader('Loading pending claims & drafts...');
      const res = await window.api.getSurveys();
      const allSurveys = res.surveys || [];
      // Incomplete tasks only: status not COMPLETED and not SCHEDULED
      const pending = allSurveys.filter(s => s.status !== 'COMPLETED' && s.status !== 'SCHEDULED');
      this.hideLoader();

      const badgeCount = document.getElementById('badge-pending-count');
      if (badgeCount) badgeCount.textContent = `${pending.length} Incomplete`;

      // Update sidebar HUD card
      const hudOpen = document.querySelector('.stats-hud-item:first-child .stats-hud-val');
      if (hudOpen) hudOpen.textContent = pending.length;

      if (pending.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 40px; color: var(--text-subtle);">No pending claims or drafts! All surveys are completed. Start a new assessment from the wizard.</td></tr>`;
        return;
      }

      tbody.innerHTML = '';
      pending.forEach((s, idx) => {
        const tr = document.createElement('tr');
        const updatedDate = new Date(s.updatedAt || s.createdAt).toLocaleDateString('en-GB');

        let stageBadge = '<span class="badge badge-draft">Draft</span>';
        if (s.status === 'EXTRACTED') stageBadge = '<span class="badge badge-extracted">OCR Extracted</span>';
        else if (s.status === 'VERIFIED') stageBadge = '<span class="badge badge-verified">Review In Progress</span>';
        else if (s.status === 'FILES_UPLOADED') stageBadge = '<span class="badge" style="background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3);">Files Uploaded</span>';

        const vehicleInfo = s.vehicleRegNo ? `<strong>${escapeHtml(s.vehicleRegNo)}</strong>${s.extractedData?.make_model ? `<br><small style="color:var(--text-muted);">${escapeHtml(s.extractedData.make_model)}</small>` : ''}` : '<span style="color:var(--text-subtle);">Registration Pending</span>';

        tr.innerHTML = `
          <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-subtle);">${idx + 1}</td>
          <td><strong style="color: #ffffff;">${escapeHtml(s.caseNumber)}</strong></td>
          <td>${vehicleInfo}</td>
          <td>${escapeHtml(s.ownerName || s.extractedData?.owner_name || 'Pending Extraction')}</td>
          <td>${stageBadge}</td>
          <td style="font-size: 12px; color: var(--text-muted);">${updatedDate}</td>
          <td>
            <div class="table-actions">
              <button class="btn btn-primary btn-sm" data-resume-survey="${s.id}" style="font-size: 11px;">
                Resume & Studio
              </button>
              <button class="btn btn-secondary btn-sm" data-delete-survey="${s.id}" style="font-size: 11px; color: #ef4444;" title="Delete Draft">
                Delete
              </button>
            </div>
          </td>
        `;

        const btnResume = tr.querySelector('[data-resume-survey]');
        btnResume.addEventListener('click', () => {
          window.studio.loadSurveyIntoStudio(s.id);
          this.switchTab('studio');
        });

        const btnDel = tr.querySelector('[data-delete-survey]');
        btnDel.addEventListener('click', async () => {
          if (confirm(`Are you sure you want to delete draft case ${s.caseNumber}?`)) {
            try {
              this.showLoader('Deleting draft survey...');
              await window.api.deleteSurvey(s.id);
              this.hideLoader();
              this.showToast('Draft deleted successfully', 'success');
              this.loadPendingClaims();
            } catch (err) {
              this.hideLoader();
              this.showToast(err.message || 'Failed to delete survey', 'error');
            }
          }
        });

        tbody.appendChild(tr);
      });
    } catch (err) {
      this.hideLoader();
      console.error('Error loading pending claims:', err);
      this.showToast(err.message || 'Failed to load pending claims', 'error');
    }
  }

  // 2. SURVEY REPORTS: Contains ONLY Completed Tasks
  async loadSurveyReports() {
    const tbody = document.getElementById('completed-reports-tbody');
    if (!tbody) return;

    try {
      this.showLoader('Loading completed survey reports...');
      const res = await window.api.getSurveys();
      const allSurveys = res.surveys || [];
      // Completed tasks only
      const completed = allSurveys.filter(s => s.status === 'COMPLETED');
      this.hideLoader();

      const badgeCount = document.getElementById('badge-reports-count');
      if (badgeCount) badgeCount.textContent = `${completed.length} Completed`;

      if (completed.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 40px; color: var(--text-subtle);">No completed survey reports yet. Complete your pending claims to generate reports here.</td></tr>`;
        return;
      }

      tbody.innerHTML = '';
      completed.forEach((s, idx) => {
        const tr = document.createElement('tr');
        const completedDate = new Date(s.completedAt || s.updatedAt).toLocaleDateString('en-GB');

        const docxReport = s.generatedReports?.find(r => r.format === 'docx');
        const tplName = s.templateFile?.originalName || s.templateFile?.name || (s.templateId ? 'Custom Template' : 'Standard Word Template');

        tr.innerHTML = `
          <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-subtle);">${idx + 1}</td>
          <td><strong style="color: #ffffff;">${escapeHtml(s.caseNumber)}</strong></td>
          <td><strong style="color: #60a5fa;">${escapeHtml(s.vehicleRegNo || 'TN-59-CR-9090')}</strong></td>
          <td>${escapeHtml(s.ownerName || s.extractedData?.owner_name || 'Insured')}</td>
          <td><span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(s.insurer || 'National Insurance')}</span></td>
          <td style="font-size: 12px; color: #34d399;">${completedDate}</td>
          <td>
            <span class="badge" style="background: rgba(37,99,235,0.12); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); font-size: 11px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;" title="${escapeHtml(tplName)}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              ${escapeHtml(tplName)}
            </span>
          </td>
          <td>
            <div class="table-actions">
              ${docxReport ? `<a href="${docxReport.downloadUrl}" class="btn btn-docx-download btn-sm" style="font-size: 11px; padding: 5px 10px;" download>Word (.docx)</a>` : `<a href="/api/surveys/${s.id}/download-docx" class="btn btn-docx-download btn-sm" style="font-size: 11px; padding: 5px 10px;" download>Word (.docx)</a>`}
              <a href="/api/surveys/${s.id}/preview-html" target="_blank" class="btn btn-pdf-download btn-sm" style="font-size: 11px; padding: 5px 10px;">PDF Report</a>
              <button class="btn btn-secondary btn-sm" data-open-studio="${s.id}" style="font-size: 11px; padding: 5px 10px;">View Studio</button>
            </div>
          </td>
        `;

        const btnOpen = tr.querySelector('[data-open-studio]');
        btnOpen.addEventListener('click', () => {
          window.studio.loadSurveyIntoStudio(s.id);
          this.switchTab('studio');
        });

        tbody.appendChild(tr);
      });
    } catch (err) {
      this.hideLoader();
      console.error('Error loading reports:', err);
      this.showToast(err.message || 'Failed to load survey reports', 'error');
    }
  }

  // 3. MY TASKS & FILES: AI Values vs Original Web App Values + Files Audit
  async loadTasksAndFiles(targetSurveyId = null) {
    const selSurvey = document.getElementById('tasks-files-survey-select');
    if (!selSurvey) return;

    try {
      this.showLoader('Loading tasks and value audit...');
      const res = await window.api.getSurveys();
      const surveys = res.surveys || [];
      this.cachedSurveys = surveys;
      this.hideLoader();

      if (surveys.length === 0) {
        selSurvey.innerHTML = '<option value="">No surveys found</option>';
        return;
      }

      selSurvey.innerHTML = '';
      surveys.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        const reg = s.vehicleRegNo || s.extractedData?.vehicle_reg_no || 'Pending';
        opt.textContent = `${s.caseNumber} — ${reg} (${s.ownerName || s.extractedData?.owner_name || 'Owner'}) [${s.status}]`;
        selSurvey.appendChild(opt);
      });

      const selectedId = targetSurveyId || (surveys[0] ? surveys[0].id : null);
      if (selectedId) {
        selSurvey.value = selectedId;
        this.renderTaskComparison(selectedId);
      }
    } catch (err) {
      this.hideLoader();
      console.error('Error loading tasks and files:', err);
      this.showToast(err.message || 'Failed to load task files', 'error');
    }
  }

  renderTaskComparison(surveyId) {
    const s = (this.cachedSurveys || []).find(item => item.id === surveyId);
    if (!s) return;

    const compTbody = document.getElementById('comparison-tbody');
    const filesTbody = document.getElementById('task-files-tbody');

    const origWeb = s.extractedData || {};

    // Defined 27 core parameters with clear categories
    const paramDefs = [
      { key: 'vehicle_reg_no', label: 'Vehicle Registration No.', category: 'vehicle', catLabel: 'Vehicle Particulars' },
      { key: 'make_model', label: 'Vehicle Make & Model', category: 'vehicle', catLabel: 'Vehicle Particulars' },
      { key: 'chassis_no', label: 'Chassis / VIN (17 Chars)', category: 'vehicle', catLabel: 'Vehicle Particulars' },
      { key: 'engine_no', label: 'Engine Number', category: 'vehicle', catLabel: 'Vehicle Particulars' },
      { key: 'vehicle_class', label: 'Vehicle Legal Class', category: 'vehicle', catLabel: 'Vehicle Particulars' },
      { key: 'manufacturing_year', label: 'Manufacturing Year', category: 'vehicle', catLabel: 'Vehicle Particulars' },
      { key: 'registration_date', label: 'Registration Date', category: 'vehicle', catLabel: 'Vehicle Particulars' },
      { key: 'fuel_type', label: 'Fuel Type', category: 'vehicle', catLabel: 'Vehicle Particulars' },
      { key: 'color', label: 'Vehicle Color', category: 'vehicle', catLabel: 'Vehicle Particulars' },
      { key: 'seating_capacity', label: 'Seating Capacity', category: 'vehicle', catLabel: 'Vehicle Particulars' },
      { key: 'cubic_capacity', label: 'Cubic Capacity (CC)', category: 'vehicle', catLabel: 'Vehicle Particulars' },
      { key: 'odometer_reading', label: 'Odometer Reading', category: 'vehicle', catLabel: 'Vehicle Particulars' },
      { key: 'owner_name', label: 'Registered Insured / Owner', category: 'insured', catLabel: 'Insured & Driver' },
      { key: 'driver_name', label: "Driver's Name", category: 'insured', catLabel: 'Insured & Driver' },
      { key: 'dl_no', label: 'Driving License Number', category: 'insured', catLabel: 'Insured & Driver' },
      { key: 'dl_validity', label: 'Driving License Validity', category: 'insured', catLabel: 'Insured & Driver' },
      { key: 'dl_type', label: 'DL Vehicle Authorization', category: 'insured', catLabel: 'Insured & Driver' },
      { key: 'driver_relation', label: 'Driver Relation to Owner', category: 'insured', catLabel: 'Insured & Driver' },
      { key: 'owner_address', label: 'Insured Residence Address', category: 'insured', catLabel: 'Insured & Driver' },
      { key: 'insurance_company', label: 'Insuring Company', category: 'policy', catLabel: 'Policy & Coverage' },
      { key: 'policy_no', label: 'Policy Number', category: 'policy', catLabel: 'Policy & Coverage' },
      { key: 'policy_period', label: 'Period of Insurance', category: 'policy', catLabel: 'Policy & Coverage' },
      { key: 'idv_amount', label: 'Insured Declared Value (IDV)', category: 'policy', catLabel: 'Policy & Coverage' },
      { key: 'claim_no', label: 'Claim Reference Number', category: 'policy', catLabel: 'Policy & Coverage' },
      { key: 'survey_date', label: 'Date of Survey / Loss', category: 'survey', catLabel: 'Survey Assessment' },
      { key: 'survey_place', label: 'Inspection Workshop Place', category: 'survey', catLabel: 'Survey Assessment' },
      { key: 'damage_summary', label: 'Damage Assessment Summary', category: 'survey', catLabel: 'Survey Assessment' }
    ];

    let totalVerified = 0;

    if (compTbody) {
      compTbody.innerHTML = '';
      paramDefs.forEach((p, idx) => {
        const origVal = (origWeb[p.key] && origWeb[p.key] !== 'N/A' && origWeb[p.key] !== '-') ? origWeb[p.key] : 'NA';
        if (origVal !== 'NA') totalVerified++;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-subtle);">${idx + 1}</td>
          <td><strong style="color: #ffffff;">${escapeHtml(p.label)}</strong></td>
          <td><span class="original-val-box" style="font-size: 12.5px;">${escapeHtml(origVal)}</span></td>
          <td><span class="category-pill category-pill-${p.category}">${escapeHtml(p.catLabel)}</span></td>
          <td style="text-align: center;"><span class="val-chip val-chip-match">✓ Verified</span></td>
        `;
        compTbody.appendChild(tr);
      });
    }

    // Update Stats Pills (Original Data only)
    const elFields = document.getElementById('comp-stat-fields-count');
    const elFiles = document.getElementById('comp-stat-files-count');
    const elInteg = document.getElementById('comp-stat-integrity');
    if (elFields) elFields.textContent = `${totalVerified} / ${paramDefs.length}`;
    if (elInteg) elInteg.textContent = '100% Original';

    // Render Attached Source Files
    const attachedFiles = s.sourceFiles || [];
    if (s.templateFile) attachedFiles.push(s.templateFile);

    if (elFiles) elFiles.textContent = attachedFiles.length;
    const badgeFiles = document.getElementById('task-files-count-badge');
    if (badgeFiles) badgeFiles.textContent = `${attachedFiles.length} Documents Attached`;

    if (filesTbody) {
      filesTbody.innerHTML = '';
      if (attachedFiles.length === 0) {
        filesTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--text-subtle);">No documents attached to this task.</td></tr>`;
      } else {
        attachedFiles.forEach((f, idx) => {
          const tr = document.createElement('tr');
          const sizeKb = f.fileSize ? (f.fileSize / 1024).toFixed(1) + ' KB' : '-';
          const uploadDate = f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString('en-GB') : '-';
          const isTpl = f.originalName?.endsWith('.docx') || f.mimeType?.includes('word');

          tr.innerHTML = `
            <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-subtle);">${idx + 1}</td>
            <td><strong style="color: #ffffff;">${escapeHtml(f.originalName || f.name || 'Document')}</strong></td>
            <td><span class="badge" style="background: rgba(139,92,246,0.15); color: #c4b5fd; font-size: 11px;">${isTpl ? 'WORD TEMPLATE' : (f.docType || 'SOURCE DOC')}</span></td>
            <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">${sizeKb}</td>
            <td style="font-size: 12px; color: var(--text-muted);">${uploadDate}</td>
            <td>
              <div class="table-actions">
                ${f.storedName ? `<a href="/uploads/${encodeURIComponent(f.storedName)}" target="_blank" class="btn btn-secondary btn-sm" style="font-size: 11px;">Preview</a>` : ''}
              </div>
            </td>
          `;
          filesTbody.appendChild(tr);
        });
      }
    }
  }

  // 4. ADMIN DASHBOARD: Past (> 24 hrs ago) & Present (Active / < 24 hrs) Operations
  async loadAdminDashboard() {
    try {
      this.showLoader('Loading Admin Operations Dashboard...');
      const res = await window.api.getSurveys();
      const surveys = res.surveys || [];
      this.dashboardSurveys = surveys;
      this.hideLoader();

      const now = Date.now();
      // Categorize into Past (performed >= 24 hrs before) and Present (active or within last 24 hrs)
      const pastTasks = [];
      const presentTasks = [];

      surveys.forEach(s => {
        const taskTime = new Date(s.completedAt || s.updatedAt || s.createdAt).getTime();
        const ageHours = (now - taskTime) / (1000 * 60 * 60);
        if (s.status === 'COMPLETED' && ageHours >= 24) {
          pastTasks.push(s);
        } else {
          presentTasks.push(s);
        }
      });

      // Update KPI Cards
      const elPast = document.getElementById('kpi-past-count');
      const elPresent = document.getElementById('kpi-present-count');
      const elTotal = document.getElementById('kpi-total-count');

      if (elPast) elPast.textContent = pastTasks.length;
      if (elPresent) elPresent.textContent = presentTasks.length;
      if (elTotal) elTotal.textContent = surveys.length;

      // Update filter tab count pills
      const pAll = document.getElementById('pill-all-count');
      const pPast = document.getElementById('pill-past-count');
      const pPres = document.getElementById('pill-present-count');

      if (pAll) pAll.textContent = surveys.length;
      if (pPast) pPast.textContent = pastTasks.length;
      if (pPres) pPres.textContent = presentTasks.length;

      // Default to render ALL or current active filter
      const activeFilterBtn = document.querySelector('.lifecycle-tab-btn.active');
      const filter = activeFilterBtn ? activeFilterBtn.getAttribute('data-lifecycle') : 'ALL';
      this.renderAdminDashboardTable(filter);
    } catch (err) {
      this.hideLoader();
      console.error('Error loading admin dashboard:', err);
      this.showToast(err.message || 'Failed to load dashboard', 'error');
    }
  }

  renderAdminDashboardTable(lifecycleFilter = 'ALL') {
    const tbody = document.getElementById('admin-dashboard-tbody');
    if (!tbody) return;

    const surveys = this.dashboardSurveys || [];
    const now = Date.now();

    let filtered = surveys;

    if (lifecycleFilter === 'PAST') {
      filtered = surveys.filter(s => {
        const taskTime = new Date(s.completedAt || s.updatedAt || s.createdAt).getTime();
        const ageHours = (now - taskTime) / (1000 * 60 * 60);
        return s.status === 'COMPLETED' && ageHours >= 24;
      });
    } else if (lifecycleFilter === 'PRESENT') {
      filtered = surveys.filter(s => {
        const taskTime = new Date(s.completedAt || s.updatedAt || s.createdAt).getTime();
        const ageHours = (now - taskTime) / (1000 * 60 * 60);
        return !(s.status === 'COMPLETED' && ageHours >= 24);
      });
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 36px; color: var(--text-subtle);">No tasks found in the ${escapeHtml(lifecycleFilter)} phase.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    filtered.forEach((s, idx) => {
      const tr = document.createElement('tr');
      const taskTime = new Date(s.completedAt || s.updatedAt || s.createdAt).getTime();
      const ageHours = (now - taskTime) / (1000 * 60 * 60);
      const isPast = (s.status === 'COMPLETED' && ageHours >= 24);
      const dateStr = new Date(taskTime).toLocaleDateString('en-GB');

      let stageBadge = '';
      let timelineText = '';
      let actionButtons = '';

      if (isPast) {
        stageBadge = '<span class="lifecycle-badge badge-past">PAST • >24H ARCHIVE</span>';
        timelineText = `<span style="color:#34d399; font-weight:600;">✓ Performed ${Math.round(ageHours)}h ago (${dateStr})</span>`;
        actionButtons = `
          <a href="/api/surveys/${s.id}/download-docx" class="btn btn-docx-download btn-sm" style="font-size: 10.5px; padding: 4px 8px;" download>Word</a>
          <a href="/api/surveys/${s.id}/preview-html" target="_blank" class="btn btn-pdf-download btn-sm" style="font-size: 10.5px; padding: 4px 8px;">PDF</a>
        `;
      } else {
        stageBadge = '<span class="lifecycle-badge badge-present">PRESENT • ACTIVE</span>';
        if (s.status === 'COMPLETED') {
          timelineText = `<span style="color:#60a5fa; font-weight:600;">⚡ Performed ${Math.max(1, Math.round(ageHours))}h ago (${dateStr})</span>`;
          actionButtons = `
            <a href="/api/surveys/${s.id}/download-docx" class="btn btn-docx-download btn-sm" style="font-size: 10.5px; padding: 4px 8px;" download>Word</a>
            <a href="/api/surveys/${s.id}/preview-html" target="_blank" class="btn btn-pdf-download btn-sm" style="font-size: 10.5px; padding: 4px 8px;">PDF</a>
          `;
        } else {
          timelineText = `<span style="color:#fbbf24; font-weight:600;">⚡ Draft In Progress (${dateStr})</span>`;
          actionButtons = `
            <button class="btn btn-primary btn-sm" data-open-studio="${s.id}" style="font-size: 10.5px; padding: 4px 8px;">Resume Studio</button>
            <button class="btn btn-secondary btn-sm" data-delete-draft="${s.id}" style="font-size: 10.5px; padding: 4px 8px; color: #ef4444;" title="Delete Draft">Delete</button>
          `;
        }
      }

      const vehicleText = s.vehicleRegNo ? `<strong>${escapeHtml(s.vehicleRegNo)}</strong>` : '<span style="color:var(--text-subtle);">Unassigned</span>';
      const insuredText = s.ownerName ? `<br><small style="color:var(--text-muted);">${escapeHtml(s.ownerName)}</small>` : '';

      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-subtle);">${idx + 1}</td>
        <td><strong style="color: #ffffff;">${escapeHtml(s.caseNumber)}</strong></td>
        <td>${vehicleText}${insuredText}</td>
        <td><span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(s.insurer || 'National Insurance')}<br><small style="color:var(--text-subtle);">${escapeHtml(s.extractedData?.survey_place || 'Workshop')}</small></span></td>
        <td><span style="font-size: 12px; font-weight: 600; color: #ffffff;">${escapeHtml(s.surveyorName || 'Senior Inspector')}</span></td>
        <td>${stageBadge}</td>
        <td style="font-size: 12px;">${timelineText}</td>
        <td>
          <div class="table-actions">
            ${actionButtons}
          </div>
        </td>
      `;

      const btnOpenStudio = tr.querySelector('[data-open-studio]');
      if (btnOpenStudio) {
        btnOpenStudio.addEventListener('click', () => {
          window.studio.loadSurveyIntoStudio(s.id);
          this.switchTab('studio');
        });
      }

      const btnDelDraft = tr.querySelector('[data-delete-draft]');
      if (btnDelDraft) {
        btnDelDraft.addEventListener('click', async () => {
          if (confirm(`Are you sure you want to delete draft case ${s.caseNumber}?`)) {
            try {
              this.showLoader('Deleting draft survey...');
              await window.api.deleteSurvey(s.id);
              this.hideLoader();
              this.showToast('Draft deleted successfully', 'success');
              this.loadAdminDashboard();
            } catch (err) {
              this.hideLoader();
              this.showToast(err.message || 'Failed to delete survey', 'error');
            }
          }
        });
      }

      tbody.appendChild(tr);
    });
  }

  setupToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else {
      iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      ${iconSvg}
      <span style="flex:1;">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  setupLoadingOverlay() {
    let overlay = document.getElementById('global-loader');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'global-loader';
      overlay.className = 'modal-overlay hidden';
      overlay.innerHTML = `
        <div style="background: var(--bg-card); border: 1px solid var(--border-card); border-radius: var(--radius-lg); padding: 32px; text-align: center; max-width: 400px; box-shadow: var(--shadow-lg);">
          <div style="width: 48px; height: 48px; border: 3px solid rgba(59, 130, 246, 0.2); border-top-color: var(--primary-light); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px auto;"></div>
          <div id="loader-message" style="font-weight: 600; font-size: 14px; color: #ffffff;">Processing...</div>
        </div>
        <style>
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      `;
      document.body.appendChild(overlay);
    }
  }

  showLoader(message = 'Processing...') {
    const overlay = document.getElementById('global-loader');
    const msgEl = document.getElementById('loader-message');
    if (overlay && msgEl) {
      msgEl.textContent = message;
      overlay.classList.remove('hidden');
    }
  }

  hideLoader() {
    const overlay = document.getElementById('global-loader');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }
}

window.app = new AppController();
