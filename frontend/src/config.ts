// Dynamic Backend Configuration
export const getBackendUrl = (): string => {
  const env = (import.meta as any).env;
  if (env && env.VITE_API_URL) {
    return (env.VITE_API_URL as string).replace(/\/$/, '');
  }
  // Auto-connect to deployed Render backend when hosted on Vercel
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return 'https://codemeet-2rqu.onrender.com';
  }
  return '';
};

export const BACKEND_URL = getBackendUrl();
export const API_BASE = BACKEND_URL ? `${BACKEND_URL}/api/v1` : '/api/v1';

export const getWsUrl = (path: string = '/yjs'): string => {
  if (BACKEND_URL) {
    const wsProto = BACKEND_URL.startsWith('https') ? 'wss' : 'ws';
    const host = BACKEND_URL.replace(/^https?:\/\//, '');
    return `${wsProto}://${host}${path}`;
  }
  const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${wsProto}://${window.location.host}${path}`;
};
