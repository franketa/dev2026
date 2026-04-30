/**
 * VALENTÍN BRESSAN - Negocios Inmobiliarios | API Client
 * Capa de acceso a datos que conecta con el backend Express + SQLite
 */
window.API = {
  _baseUrl: '',

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  },

  async _fetch(url, options = {}) {
    const res = await fetch(this._baseUrl + url, {
      ...options,
      headers: { ...this._headers(), ...options.headers }
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error || `Error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  },

  // Properties
  async getProperties() {
    return this._fetch('/api/properties');
  },

  async getProperty(id) {
    return this._fetch(`/api/properties/${id}`);
  },

  async createProperty(data) {
    return this._fetch('/api/properties', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateProperty(id, data) {
    return this._fetch(`/api/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteProperty(id) {
    return this._fetch(`/api/properties/${id}`, {
      method: 'DELETE'
    });
  },

  async uploadImages(propertyId, files) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('images', file);
    }
    const token = this.getToken();
    const res = await fetch(`${this._baseUrl}/api/properties/${propertyId}/images`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Error ${res.status}`);
    }
    return res.json();
  },

  async deleteImage(propertyId, filename) {
    return this._fetch(`/api/properties/${propertyId}/images/${filename}`, {
      method: 'DELETE'
    });
  },

  // Auth
  async login(email, password) {
    const data = await this._fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data.token) {
      localStorage.setItem('auth_token', data.token);
    }
    return data;
  },

  async verifyToken() {
    try {
      await this._fetch('/api/auth/verify');
      return true;
    } catch {
      this.logout();
      return false;
    }
  },

  getToken() {
    return localStorage.getItem('auth_token');
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  logout() {
    localStorage.removeItem('auth_token');
  }
};
