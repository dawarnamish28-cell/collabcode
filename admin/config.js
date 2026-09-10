/**
 * CollabCode Admin Dashboard Configuration
 * 
 * In production:
 * Set API_BASE to your backend server URL (e.g. https://api.yourdomain.com)
 * Set CLIENT_URL to your main web application URL (e.g. https://yourdomain.com)
 * 
 * If running locally:
 * Defaults to backend on port 4000 and client on port 3000.
 */

window.COLLAB_ADMIN_CONFIG = {
  // Backend API Base URL (Express + Socket.io Server)
  API_BASE: (typeof window !== 'undefined' && window.location.port === '3001')
    ? 'http://localhost:4000'
    : (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
      // If hosted on admin.yourdomain.com, default API to api.yourdomain.com
      ? window.location.protocol + '//api.' + window.location.hostname.replace(/^admin\./, '')
      : 'http://localhost:4000',

  // Main Coding App URL
  CLIENT_URL: (typeof window !== 'undefined' && window.location.port === '3001')
    ? 'http://localhost:3000'
    : (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
      // If hosted on admin.yourdomain.com, default client to yourdomain.com
      ? window.location.protocol + '//' + window.location.hostname.replace(/^admin\./, '')
      : 'http://localhost:3000',
};
