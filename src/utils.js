export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function uid(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function toDateKey(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function shiftDateKey(key, amount) {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + amount);
  return toDateKey(d);
}

export function formatDateLong(key) {
  return fromDateKey(key).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

export function formatDateShort(key) {
  return fromDateKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function minutesBetween(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

export function formatMinutes(minutes) {
  const mins = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatTime(time) {
  if (!time) return '—';
  const [hoursRaw, minutes] = time.split(':');
  let hours = Number(hoursRaw);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

export function formatMoney(value, currency = 'EUR') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`;
  }
}

export function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
}

export function debounce(fn, wait = 250) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

export function downloadFile(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function isScheduled(metric, dateKey) {
  const day = fromDateKey(dateKey).getDay();
  switch (metric.schedule) {
    case 'weekdays': return day >= 1 && day <= 5;
    case 'weekends': return day === 0 || day === 6;
    case 'weekly': return day === Number(metric.scheduleDay ?? 1);
    default: return true;
  }
}

export function metricCompleted(metric, value) {
  if (value === undefined || value === null || value === '') return false;
  const target = Number(metric.target ?? 1);
  switch (metric.type) {
    case 'boolean': return Boolean(value);
    case 'counter':
    case 'quantity':
    case 'duration':
    case 'currency': return Number(value) >= target;
    case 'rating': return Number(value) >= target;
    case 'text': return String(value).trim().length > 0;
    case 'time': return Boolean(value);
    default: return false;
  }
}

export function stableSortByDate(items) {
  return [...items].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}
