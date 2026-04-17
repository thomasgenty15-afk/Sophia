import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
}

function uuidv4(): string {
  // Use Web Crypto when available (browser).
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  // Fallback (should be rare in modern browsers).
  const s = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${s()}${s()}-${s()}-${s()}-${s()}-${s()}${s()}${s()}`;
}

const CLIENT_REQUEST_ID = uuidv4();

export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseAnonKey || 'placeholder-key',
  {
    global: {
      headers: {
        // Best-effort client correlation id for all requests (Edge Functions + PostgREST).
        // For per-message tracing, callers can still override x-request-id at call-site if needed.
        'x-sophia-client-request-id': CLIENT_REQUEST_ID,
        'x-client-request-id': CLIENT_REQUEST_ID,
      },
    },
  },
);
