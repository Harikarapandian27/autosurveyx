// API Client for AutoSurveyor Pro
class ApiClient {
  constructor() {
    this.baseUrl = window.location.origin;
  }

  getToken() {
    return localStorage.getItem('surveyor_token');
  }

  setToken(token) {
    if (token) {
      localStorage.setItem('surveyor_token', token);
    } else {
      localStorage.removeItem('surveyor_token');
    }
  }

  getHeaders(customHeaders = {}) {
    const headers = { ...customHeaders };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.getHeaders(options.headers || {});
    
    // Automatically stringify body if it's an object and not FormData
    let body = options.body;
    if (body && !(body instanceof FormData) && typeof body === 'object') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        body
      });

      // Handle 401 Unauthorized
      if (response.status === 401) {
        if (!endpoint.includes('/api/auth/login')) {
          this.setToken(null);
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `HTTP error ${response.status}`);
        }
        return data;
      }

      if (!response.ok) {
        let errText = await response.text();
        try {
          const jsonErr = JSON.parse(errText);
          if (jsonErr && jsonErr.error) throw new Error(jsonErr.error);
        } catch (parseErr) {
          if (parseErr.message && !parseErr.message.includes('JSON') && !parseErr.message.startsWith('Unexpected token')) {
            throw parseErr;
          }
        }

        if (errText.includes('<pre>')) {
          const match = errText.match(/<pre>([\s\S]*?)<\/pre>/i);
          if (match) {
            errText = match[1].replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/g, ' ').trim();
            errText = errText.split('\n')[0].trim();
          }
        } else if (errText.includes('<html') || errText.includes('<!DOCTYPE')) {
          errText = errText.replace(/<style[\s\S]*?<\/style>/gi, '')
                           .replace(/<script[\s\S]*?<\/script>/gi, '')
                           .replace(/<[^>]+>/g, ' ')
                           .replace(/\s+/g, ' ')
                           .trim();
        }
        throw new Error(errText || `HTTP error ${response.status}`);
      }

      return response;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err.message);
      if (err.name === 'TypeError' && (err.message === 'Failed to fetch' || err.message.includes('fetch'))) {
        throw new Error('Connection failed: Server is unreachable or the connection was interrupted. Please ensure the backend is active at port 4000 and try again.');
      }
      throw err;
    }
  }

  // Auth endpoints
  login(email, password, otp) {
    return this.request('/api/auth/login', { method: 'POST', body: { email, password, otp } });
  }

  sendLoginOtp(email) {
    return this.request('/api/auth/send-login-otp', { method: 'POST', body: { email } });
  }

  loginWithOtp(email, otp) {
    return this.request('/api/auth/login-with-otp', { method: 'POST', body: { email, otp } });
  }

  forgotPassword(email) {
    return this.request('/api/auth/forgot-password', { method: 'POST', body: { email } });
  }

  resetPassword(email, otp, newPassword) {
    return this.request('/api/auth/reset-password', { method: 'POST', body: { email, otp, newPassword } });
  }

  register(userData) {
    return this.request('/api/auth/register', { method: 'POST', body: userData });
  }

  getMe() {
    return this.request('/api/auth/me');
  }

  getDemoUsers() {
    return this.request('/api/auth/demo-users');
  }

  // Survey endpoints
  getSurveys(search = '') {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.request(`/api/surveys${q}`);
  }

  getSurvey(id) {
    return this.request(`/api/surveys/${id}`);
  }

  createSurvey(data) {
    return this.request('/api/surveys', { method: 'POST', body: data });
  }

  uploadDocuments(surveyId, files, docTypes = {}) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('documents', file);
    }
    formData.append('docTypes', JSON.stringify(docTypes));
    return this.request(`/api/surveys/${surveyId}/upload-docs`, {
      method: 'POST',
      body: formData
    });
  }

  uploadTemplate(surveyId, templateFile, templateName = '') {
    const formData = new FormData();
    formData.append('template', templateFile);
    if (templateName) formData.append('templateName', templateName);
    return this.request(`/api/surveys/${surveyId}/upload-template`, {
      method: 'POST',
      body: formData
    });
  }

  selectTemplate(surveyId, templateId) {
    return this.request(`/api/surveys/${surveyId}/select-template`, {
      method: 'POST',
      body: { templateId }
    });
  }

  analyzeReferencePreview(referenceFile) {
    const formData = new FormData();
    formData.append('reference', referenceFile);
    return this.request('/api/surveys/analyze-reference-preview', {
      method: 'POST',
      body: formData
    });
  }

  uploadReference(surveyId, referenceFile) {
    const formData = new FormData();
    formData.append('reference', referenceFile);
    return this.request(`/api/surveys/${surveyId}/upload-reference`, {
      method: 'POST',
      body: formData
    });
  }

  extractData(surveyId) {
    return this.request(`/api/surveys/${surveyId}/extract`, { method: 'POST' });
  }

  verifyFields(surveyId, fields) {
    return this.request(`/api/surveys/${surveyId}/verify`, { method: 'PUT', body: { fields } });
  }

  generateReport(surveyId) {
    return this.request(`/api/surveys/${surveyId}/generate`, { method: 'POST' });
  }

  deleteSurvey(surveyId) {
    return this.request(`/api/surveys/${surveyId}`, { method: 'DELETE' });
  }

  // Admin endpoints
  getAdminStats() {
    return this.request('/api/admin/stats');
  }

  getAdminFiles(filters = {}) {
    const params = new URLSearchParams();
    if (filters.docType) params.append('docType', filters.docType);
    if (filters.search) params.append('search', filters.search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/admin/files${qs}`);
  }

  getAdminTemplates() {
    return this.request('/api/admin/templates');
  }

  getAdminLogs(limit = 100) {
    return this.request(`/api/admin/logs?limit=${limit}`);
  }
}

window.api = new ApiClient();
