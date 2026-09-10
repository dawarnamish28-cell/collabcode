/**
 * Global Client Configuration & Server URL Resolver
 * 
 * Auto-corrects any legacy/typo environment variables and provides
 * safe production defaults when running in the browser.
 */

export function getServerUrl() {
  const envUrl = process.env.NEXT_PUBLIC_SERVER_URL;
  if (envUrl && envUrl.trim() !== '') {
    // Auto-correct any typo if present in Vercel environment variables
    return envUrl
      .replace('collabcode-v9b6.onrender.com', 'collabcode-vc6p.onrender.com')
      .replace(/\/$/, '');
  }

  // When running on production domain/Vercel and env var is missing, default to Render
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://collabcode-vc6p.onrender.com';
  }

  return 'http://localhost:4000';
}

export const SERVER_URL = getServerUrl();
export default SERVER_URL;
