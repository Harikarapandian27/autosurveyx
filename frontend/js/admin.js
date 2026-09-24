// Admin Backend File & Document Repository Manager

class AdminManager {
  constructor() {
    this.files = [];
    this.currentFilter = 'ALL';
    this.searchQuery = '';
    this.init();
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Search input
    const searchInput = document.getElementById('admin-files-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderFilteredFiles();
      });
    }

    // Filter pills
    const pills = document.querySelectorAll('.filter-pill[data-doctype]');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.currentFilter = pill.getAttribute('data-doctype');
        this.renderFilteredFiles();
      });
    });

    // Modal close button
    const btnCloseModal = document.getElementById('modal-close-btn');
    const overlay = document.getElementById('file-preview-modal');
    if (btnCloseModal && overlay) {
      btnCloseModal.addEventListener('click', () => overlay.classList.add('hidden'));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
      });
    }

    // Refresh buttons
    const btnRefreshRepo = document.getElementById('btn-refresh-admin-repo');
    if (btnRefreshRepo) {
      btnRefreshRepo.addEventListener('click', () => this.loadDashboardData());
    }
  }

  async loadDashboardData() {
    try {
      window.app.showLoader('Loading Admin Repository & System Metrics...');

      // 1. Load Stats
      const statsRes = await window.api.getAdminStats();
      this.renderStats(statsRes.stats);

      // 2. Load Master File Repository
      const filesRes = await window.api.getAdminFiles();
      this.files = filesRes.files || [];
      this.renderFilteredFiles();

      window.app.hideLoader();
    } catch (err) {
      window.app.hideLoader();
      console.error('Error loading admin data:', err);
      window.app.showToast(err.message || 'Failed to load admin repository', 'error');
    }
  }

  async loadAuditLogs() {
    try {
      window.app.showLoader('Loading System Audit Logs...');
      const res = await window.api.getAdminLogs(100);
      this.renderAuditLogs(res.logs || []);
      window.app.hideLoader();
    } catch (err) {
      window.app.hideLoader();
      console.error('Error loading audit logs:', err);
      window.app.showToast(err.message || 'Failed to load audit logs', 'error');
    }
  }

  renderStats(stats) {
    const elFiles = document.getElementById('stat-total-files');
    const elStorage = document.getElementById('stat-total-storage');
    const elSurveys = document.getElementById('stat-total-surveys');
    const elUsers = document.getElementById('stat-total-users');

    if (elFiles) elFiles.textContent = stats.totalFilesUploaded || 0;
    if (elStorage) elStorage.textContent = stats.totalStorageFormatted || '0.00 MB';
    if (elSurveys) elSurveys.textContent = stats.totalSurveys || 0;
    if (elUsers) elUsers.textContent = stats.totalUsers || 0;
  }

  renderFilteredFiles() {
    const tbody = document.getElementById('admin-files-tbody');
    const countBadge = document.getElementById('admin-files-count-badge');
    if (!tbody) return;

    let filtered = this.files;

    // Apply docType filter
    if (this.currentFilter !== 'ALL') {
      filtered = filtered.filter(f => f.docType === this.currentFilter);
    }

    // Apply search
    if (this.searchQuery) {
      const q = this.searchQuery;
      filtered = filtered.filter(f => 
        (f.originalName && f.originalName.toLowerCase().includes(q)) ||
        (f.docType && f.docType.toLowerCase().includes(q)) ||
        (f.caseNumber && f.caseNumber.toLowerCase().includes(q)) ||
        (f.uploaderName && f.uploaderName.toLowerCase().includes(q))
      );
    }

    if (countBadge) {
      countBadge.textContent = `${filtered.length} File(s) in Repository`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-subtle); padding: 32px;">No uploaded documents match the current filter or search criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    filtered.forEach((file, index) => {
      const tr = document.createElement('tr');
      const sizeFormatted = (file.fileSize / 1024).toFixed(1) + ' KB';
      const uploadDate = new Date(file.uploadedAt).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      // Badge class
      let badgeClass = 'badge-other';
      if (file.docType === 'RC_BOOK') badgeClass = 'badge-rc';
      else if (file.docType === 'DRIVING_LICENSE') badgeClass = 'badge-dl';
      else if (file.docType === 'INSURANCE_POLICY') badgeClass = 'badge-ins';
      else if (file.docType === 'TEMPLATE_FILE') badgeClass = 'badge-tpl';
      else if (file.docType === 'FINAL_REPORT_DOCX') badgeClass = 'badge-rpt';

      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-subtle);">${index + 1}</td>
        <td>
          <div style="font-weight: 600; color: #ffffff;">${escapeHtml(file.originalName)}</div>
          <div style="font-size: 11px; color: var(--text-subtle);">${file.mimeType || 'application/octet-stream'}</div>
        </td>
        <td><span class="doc-badge ${badgeClass}">${file.docType}</span></td>
        <td style="font-family: var(--font-mono); font-size: 12px; font-weight: 600;">${escapeHtml(file.caseNumber || '-')}</td>
        <td style="font-size: 12px;">${sizeFormatted}</td>
        <td>
          <div style="font-weight: 500;">${escapeHtml(file.uploaderName || 'System')}</div>
          <div style="font-size: 11px; color: var(--text-subtle);">${uploadDate}</div>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn btn-secondary btn-sm" data-preview-id="${file.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              View
            </button>
            <a href="/api/admin/files/${file.id}/download" class="btn btn-primary btn-sm" download>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download
            </a>
          </div>
        </td>
      `;

      // Preview listener
      const btnPreview = tr.querySelector('[data-preview-id]');
      btnPreview.addEventListener('click', () => this.previewFile(file));

      tbody.appendChild(tr);
    });
  }

  async previewFile(file) {
    const modal = document.getElementById('file-preview-modal');
    const titleEl = document.getElementById('modal-file-title');
    const bodyEl = document.getElementById('modal-file-body');
    if (!modal || !bodyEl) return;

    titleEl.textContent = `File Inspector: ${file.originalName}`;
    bodyEl.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading file contents...</div>';
    modal.classList.remove('hidden');

    const ext = (file.originalName.split('.').pop() || '').toLowerCase();

    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      bodyEl.innerHTML = `
        <div style="text-align:center;">
          <img src="/api/admin/files/${file.id}/preview" style="max-width: 100%; max-height: 600px; border-radius: var(--radius-md); box-shadow: var(--shadow-md);" alt="${escapeHtml(file.originalName)}" />
        </div>
      `;
    } else if (ext === 'pdf') {
      bodyEl.innerHTML = `
        <iframe src="/api/admin/files/${file.id}/preview" style="width: 100%; height: 600px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md);"></iframe>
      `;
    } else if (['docx', 'doc'].includes(ext)) {
      bodyEl.innerHTML = `
        <div style="text-align: center; padding: 40px;">
          <div style="font-size: 48px; margin-bottom: 16px;">📄</div>
          <h3 style="font-size: 18px; margin-bottom: 8px;">Word Template / Document (.docx)</h3>
          <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 24px;">Binary OpenXML document package. Can be downloaded directly for Microsoft Word or inspection.</p>
          <a href="/api/admin/files/${file.id}/download" class="btn btn-primary" download>Download ${escapeHtml(file.originalName)}</a>
        </div>
      `;
    } else {
      // Fetch text content
      try {
        const textRes = await fetch(`/api/admin/files/${file.id}/preview`, {
          headers: window.api.getHeaders()
        });
        const text = await textRes.text();
        bodyEl.innerHTML = `<pre style="font-family: var(--font-mono); font-size: 12px; color: #cbd5e1; white-space: pre-wrap; word-break: break-word; background: #0b0f19; padding: 16px; border-radius: var(--radius-md); max-height: 550px; overflow-y: auto;">${escapeHtml(text)}</pre>`;
      } catch (err) {
        bodyEl.innerHTML = `<div style="color: var(--danger); padding: 20px;">Could not preview file: ${err.message}</div>`;
      }
    }
  }

  renderAuditLogs(logs) {
    const container = document.getElementById('audit-logs-container');
    if (!container) return;

    if (logs.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-subtle); padding: 32px;">No audit events recorded yet.</div>`;
      return;
    }

    container.innerHTML = '';
    logs.forEach(log => {
      const item = document.createElement('div');
      item.className = 'audit-item';
      const time = new Date(log.timestamp).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      item.innerHTML = `
        <div>
          <div class="audit-action">${escapeHtml(log.action)}</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
            ${escapeHtml(JSON.stringify(log.details || {}))}
          </div>
        </div>
        <div style="text-align: right;">
          <div class="audit-user">${escapeHtml(log.userName || 'System')}</div>
          <div class="audit-time">${time} &bull; ${escapeHtml(log.details?.ip || '127.0.0.1')}</div>
        </div>
      `;
      container.appendChild(item);
    });
  }
}

window.admin = new AdminManager();
