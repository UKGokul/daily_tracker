import { metricCompleted, toDateKey, uid } from './utils.js';

export const STORAGE_KEY = 'daylens_state_v1';
export const SCHEMA_VERSION = 1;

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metrics: [
      { id: 'metric_exercise', slug: 'exercise', name: 'Exercise', type: 'boolean', category: 'exercise', unit: '', target: 1, schedule: 'daily', active: true, icon: 'activity' },
      { id: 'metric_mood', slug: 'mood', name: 'Mood', type: 'rating', category: 'wellbeing', unit: '/10', target: 7, schedule: 'daily', active: true, icon: 'sparkles' },
      { id: 'metric_water', slug: 'water', name: 'Water', type: 'quantity', category: 'wellbeing', unit: 'L', target: 2, schedule: 'daily', active: true, icon: 'droplet' },
      { id: 'metric_reading', slug: 'reading', name: 'Reading', type: 'duration', category: 'growth', unit: 'min', target: 20, schedule: 'daily', active: true, icon: 'book' }
    ],
    metricEntries: [],
    tasks: [],
    workSessions: [],
    sleepRecords: [],
    financeEntries: [],
    dailyNotes: [],
    settings: {
      currency: 'EUR',
      theme: 'system',
      focusGoalMinutes: 240,
      reminderTime: '',
      reminderEnabled: false,
      scoreWeights: { sleep: 25, exercise: 20, tasks: 25, focus: 20, habits: 10 }
    },
    migration: { legacyImported: false, importedAt: null }
  };
}

function mergeDefaults(state) {
  const base = defaultState();
  return {
    ...base,
    ...state,
    metrics: Array.isArray(state?.metrics) ? state.metrics : base.metrics,
    metricEntries: Array.isArray(state?.metricEntries) ? state.metricEntries : [],
    tasks: Array.isArray(state?.tasks) ? state.tasks : [],
    workSessions: Array.isArray(state?.workSessions) ? state.workSessions : [],
    sleepRecords: Array.isArray(state?.sleepRecords) ? state.sleepRecords : [],
    financeEntries: Array.isArray(state?.financeEntries) ? state.financeEntries : [],
    dailyNotes: Array.isArray(state?.dailyNotes) ? state.dailyNotes : [],
    settings: { ...base.settings, ...(state?.settings || {}), scoreWeights: { ...base.settings.scoreWeights, ...(state?.settings?.scoreWeights || {}) } },
    migration: { ...base.migration, ...(state?.migration || {}) }
  };
}

export function loadState(storage = localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const state = raw ? mergeDefaults(JSON.parse(raw)) : defaultState();
    if (!state.migration.legacyImported) migrateLegacy(state, storage);
    saveState(state, storage);
    return state;
  } catch (error) {
    console.error('Could not load DayLens state', error);
    return defaultState();
  }
}

export function saveState(state, storage = localStorage) {
  state.updatedAt = new Date().toISOString();
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function validateImportedState(value) {
  if (!value || typeof value !== 'object') throw new Error('Backup is not a valid DayLens object.');
  const requiredArrays = ['metrics', 'metricEntries', 'tasks', 'workSessions', 'sleepRecords', 'financeEntries', 'dailyNotes'];
  for (const key of requiredArrays) if (!Array.isArray(value[key])) throw new Error(`Backup is missing ${key}.`);
  if (!value.settings || typeof value.settings !== 'object') throw new Error('Backup is missing settings.');
  return mergeDefaults(value);
}

export function upsertMetricEntry(state, metricId, date, value) {
  const existing = state.metricEntries.find(e => e.metricId === metricId && e.date === date);
  if (existing) existing.value = value;
  else state.metricEntries.push({ id: uid('entry'), metricId, date, value, createdAt: new Date().toISOString() });
}

function findOrCreateLegacyMetric(state, slug, spec) {
  let metric = state.metrics.find(m => m.slug === slug);
  if (!metric) {
    metric = { id: uid('metric'), slug, schedule: 'daily', active: true, ...spec };
    state.metrics.push(metric);
  }
  return metric;
}

export function migrateLegacy(state, storage = localStorage) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith('dailyTracker_')) keys.push(key);
  }

  if (!keys.length) {
    state.migration = { legacyImported: true, importedAt: new Date().toISOString() };
    return { importedDays: 0 };
  }

  const smokingMetric = findOrCreateLegacyMetric(state, 'legacy_smoking', {
    name: 'Smoking', type: 'counter', category: 'custom', unit: '', target: 0, icon: 'counter'
  });
  const showerMetric = findOrCreateLegacyMetric(state, 'legacy_shower', {
    name: 'Shower', type: 'boolean', category: 'wellbeing', unit: '', target: 1, icon: 'check'
  });

  for (const key of keys.sort()) {
    const date = key.replace('dailyTracker_', '');
    let old;
    try { old = JSON.parse(storage.getItem(key)); } catch { continue; }

    if (Number(old?.joints) > 0) upsertMetricEntry(state, smokingMetric.id, date, Number(old.joints));
    if (old?.bath) upsertMetricEntry(state, showerMetric.id, date, true);

    for (const task of old?.tasks || []) {
      state.tasks.push({ id: uid('task'), date, text: task.text || 'Legacy task', done: Boolean(task.done), recurrence: 'none', createdAt: new Date().toISOString() });
    }

    const completedWorkouts = (old?.workouts || []).filter(w => w.done);
    if (completedWorkouts.length) {
      const exercise = state.metrics.find(m => m.slug === 'exercise');
      upsertMetricEntry(state, exercise.id, date, true);
    }

    if (old?.sleep?.sleep || old?.sleep?.wake) {
      state.sleepRecords.push({ id: uid('sleep'), date, bedtime: old.sleep.sleep || '', wakeTime: old.sleep.wake || '' });
    }

    for (const work of old?.work || []) {
      state.workSessions.push({ id: uid('work'), date, project: work.project || 'Legacy work', start: work.start || '', end: work.end || '', breakMinutes: 0 });
    }

    if (Number(old?.budget?.spend) > 0) {
      state.financeEntries.push({ id: uid('money'), date, kind: 'expense', amount: Number(old.budget.spend), category: 'Legacy', note: '' });
    }
    if (Number(old?.budget?.income) > 0) {
      state.financeEntries.push({ id: uid('money'), date, kind: 'income', amount: Number(old.budget.income), category: 'Legacy', note: '' });
    }

    const foods = old?.food || {};
    const foodLines = Object.entries(foods).filter(([, value]) => String(value || '').trim()).map(([meal, value]) => `${meal}: ${value}`);
    if (foodLines.length || completedWorkouts.length) {
      const parts = [];
      if (completedWorkouts.length) parts.push(`Legacy workouts: ${completedWorkouts.map(w => w.text).join(', ')}`);
      if (foodLines.length) parts.push(`Legacy food diary — ${foodLines.join(' | ')}`);
      state.dailyNotes.push({ id: uid('note'), date, text: parts.join('\n') });
    }
  }

  state.migration = { legacyImported: true, importedAt: new Date().toISOString() };
  return { importedDays: keys.length };
}

export function compactState(state) {
  const seen = new Set();
  state.metricEntries = state.metricEntries.filter(entry => {
    const key = `${entry.metricId}|${entry.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  state.metrics = state.metrics.filter(m => m && m.id && m.name && m.type);
  return state;
}

export function metricSuccessCount(state, metric) {
  return state.metricEntries.filter(e => e.metricId === metric.id && metricCompleted(metric, e.value)).length;
}
