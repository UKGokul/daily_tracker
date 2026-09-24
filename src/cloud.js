const SESSION_KEY = 'daylens_supabase_session';

function config() {
  const cfg = globalThis.DAYLENS_CONFIG || {};
  const url = String(cfg.supabaseUrl || '').replace(/\/$/, '');
  const key = String(cfg.supabaseAnonKey || '');
  return { url, key, configured: Boolean(url && key) };
}

export function cloudConfigured() {
  return config().configured;
}

export function getSession(storage = localStorage) {
  try { return JSON.parse(storage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function setSession(session, storage = localStorage) {
  if (session) storage.setItem(SESSION_KEY, JSON.stringify(session));
  else storage.removeItem(SESSION_KEY);
}

async function authRequest(path, body) {
  const { url, key, configured } = config();
  if (!configured) throw new Error('Cloud sync is not configured. Copy config.example.js to config.js and add your Supabase URL and anon key.');
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || 'Authentication failed.');
  return data;
}

export async function signUp(email, password) {
  const data = await authRequest('signup', { email, password });
  if (data.access_token) setSession(data);
  return data;
}

export async function signIn(email, password) {
  const data = await authRequest('token?grant_type=password', { email, password });
  setSession(data);
  return data;
}

export function signOut() {
  setSession(null);
}

async function ensureSession() {
  const { url, key, configured } = config();
  if (!configured) throw new Error('Cloud sync is not configured.');
  let session = getSession();
  if (!session) throw new Error('Sign in first.');
  const expiresAt = session.expires_at ? Number(session.expires_at) * 1000 : 0;
  if (expiresAt && Date.now() > expiresAt - 60_000 && session.refresh_token) {
    const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key }, body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const data = await response.json();
    if (!response.ok) { setSession(null); throw new Error('Cloud session expired. Please sign in again.'); }
    session = data;
    setSession(session);
  }
  return { session, url, key };
}

export async function pushSnapshot(state) {
  const { session, url, key } = await ensureSession();
  const userId = session.user?.id;
  const response = await fetch(`${url}/rest/v1/daylens_snapshots?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', apikey: key,
      Authorization: `Bearer ${session.access_token}`,
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ user_id: userId, state, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error((await response.text()) || 'Could not sync to cloud.');
}

export async function pullSnapshot() {
  const { session, url, key } = await ensureSession();
  const userId = session.user?.id;
  const response = await fetch(`${url}/rest/v1/daylens_snapshots?user_id=eq.${encodeURIComponent(userId)}&select=state,updated_at&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}` }
  });
  if (!response.ok) throw new Error((await response.text()) || 'Could not load cloud data.');
  const rows = await response.json();
  return rows[0] || null;
}
