const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class TunnelService {
  constructor() {
    this.process = null;
    this.publicUrl = null;
    this.isStarting = false;
    this.cloudflaredBin = path.join(__dirname, '..', 'bin', 'cloudflared.exe');
    this.projectDir = path.resolve(__dirname, '..', '..');
  }

  async start(port = 4000) {
    if (process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
      console.log('[TunnelService] Running in cloud production environment. Public URL is provided by cloud host.');
      return null;
    }
    if (this.process || this.isStarting) return this.publicUrl;
    this.isStarting = true;

    if (!fs.existsSync(this.cloudflaredBin)) {
      console.warn('[TunnelService] cloudflared.exe not found at:', this.cloudflaredBin);
      this.isStarting = false;
      return null;
    }

    return new Promise((resolve) => {
      console.log(`[TunnelService] Starting Cloudflare global secure tunnel for port ${port}...`);

      this.process = spawn(this.cloudflaredBin, ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let resolved = false;

      const handleOutput = (data) => {
        const text = data.toString();
        // Look for https://*.trycloudflare.com
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !this.publicUrl) {
          this.publicUrl = match[0];
          console.log(`=======================================================`);
          console.log(`🌍 GLOBAL PUBLIC WEB LINK (Accessible from ANY Network):`);
          console.log(`👉 ${this.publicUrl}`);
          console.log(`=======================================================`);

          this.saveShortcuts(this.publicUrl);

          if (!resolved) {
            resolved = true;
            this.isStarting = false;
            resolve(this.publicUrl);
          }
        }
      };

      this.process.stdout.on('data', handleOutput);
      this.process.stderr.on('data', handleOutput);

      this.process.on('close', (code) => {
        console.log(`[TunnelService] Cloudflare tunnel closed with code ${code}. Auto-reconnecting in 3s...`);
        this.process = null;
        this.publicUrl = null;
        this.isStarting = false;
        setTimeout(() => this.start(port), 3000);
      });

      this.process.on('error', (err) => {
        console.error('[TunnelService] Tunnel error:', err.message);
        this.isStarting = false;
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      });

      // Timeout safety: if URL not detected in 15 seconds, resolve with what we have
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.isStarting = false;
          resolve(this.publicUrl);
        }
      }, 15000);
    });
  }

  saveShortcuts(url) {
    try {
      const publicTxt = path.join(this.projectDir, 'PUBLIC_URL.txt');
      fs.writeFileSync(publicTxt, `AutoSurveyX Global Public Link:\n${url}\n\nAccessible from ANY computer, laptop, or phone across ANY network!`);

      const publicUrlFile = path.join(this.projectDir, 'Public_AutoSurveyX_Link.url');
      const urlContent = `[InternetShortcut]\nURL=${url}\nIconIndex=0\nIconFile=C:\\Windows\\System32\\shell32.dll\n`;
      fs.writeFileSync(publicUrlFile, urlContent);
    } catch (e) {
      console.warn('[TunnelService] Could not write shortcut files:', e.message);
    }
  }

  getPublicUrl() {
    return this.publicUrl;
  }
}

module.exports = new TunnelService();
