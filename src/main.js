import {
  loadState, saveState, validateImportedState, upsertMetricEntry, compactState, STORAGE_KEY
} from './store.js';
import {
  dayScore, taskCompletionForDay, focusMinutesForDay, sleepMinutesForDay, spendingForDay,
  incomeForDay, habitCompletionForDay, getMetricValue, streakForMetric, summaryForRange,
  dateRange, generateInsights
} from './analytics.js';
import {
  clamp, debounce, downloadFile, escapeHtml, formatDateLong, formatDateShort, formatMinutes,
  formatMoney, formatTime, fromDateKey, isScheduled, metricCompleted, minutesBetween,
  shiftDateKey, toDateKey, uid
} from './utils.js';
import {
  cloudConfigured, getSession, pullSnapshot, pushSnapshot, signIn, signOut, signUp
} from './cloud.js';

let state = compactState(loadState());
let selectedDate = toDateKey();
let activeView = 'today';
let insightRange = 30;
let calendarCursor = new Date();
let undoAction = null;
let reminderTimer = null;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const els = {
  today: $('#todayView'), calendar: $('#calendarView'), insights: $('#insightsView'), settings: $('#settingsView'),
  prev: $('#prevDay'), next: $('#nextDay'), todayBtn: $('#todayButton'), dateButton: $('#dateButton'),
  dateLabel: $('#dateLabel'), dateEyebrow: $('#dateEyebrow'), datePicker: $('#datePicker'), theme: $('#themeButton'),
  quick: $('#quickAddButton'), modal: $('#modalBackdrop'), modalTitle: $('#modalTitle'), modalEyebrow: $('#modalEyebrow'),
  modalBody: $('#modalBody'), modalClose: $('#modalClose'), toastStack: $('#toastStack'), importInput: $('#importInput')
};

function persist({ silent = false, cloud = true } = {}) {
  saveState(state);
  if (!silent) toast('Saved');
  if (cloud && cloudConfigured() && getSession()) debouncedCloudPush();
}

const debouncedCloudPush = debounce(async () => {
  try { await pushSnapshot(state); }
  catch (error) { console.warn('Background cloud sync failed', error); }
}, 1500);

function toast(message, actionLabel, action) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `<span>${escapeHtml(message)}</span>${actionLabel ? `<button type="button">${escapeHtml(actionLabel)}</button>` : ''}`;
  if (actionLabel) node.querySelector('button').addEventListener('click', () => { action?.(); node.remove(); });
  els.toastStack.append(node);
  setTimeout(() => node.remove(), 4300);
}

function openModal(title, body, eyebrow = 'DayLens') {
  els.modalTitle.textContent = title;
  els.modalEyebrow.textContent = eyebrow;
  els.modalBody.innerHTML = body;
  els.modal.hidden = false;
  setTimeout(() => els.modal.querySelector('input, select, textarea, button')?.focus(), 0);
}
function closeModal() { els.modal.hidden = true; els.modalBody.innerHTML = ''; }

function setView(view) {
  activeView = view;
  $$('[data-view-panel]').forEach(el => el.classList.toggle('is-active', el.dataset.viewPanel === view));
  $$('[data-view]').forEach(el => el.classList.toggle('is-active', el.dataset.view === view));
  history.replaceState(null, '', `#${view}`);
  if (view === 'calendar') renderCalendar();
  if (view === 'insights') renderInsights();
  if (view === 'settings') renderSettings();
  if (view === 'today') renderToday();
  $('#main')?.focus({ preventScroll: true });
}

function updateDateUI() {
  const today = toDateKey();
  els.dateLabel.textContent = formatDateShort(selectedDate);
  els.dateEyebrow.textContent = selectedDate === today ? 'Today' : fromDateKey(selectedDate).toLocaleDateString(undefined, { weekday: 'long' });
  els.todayBtn.hidden = selectedDate === today;
  els.datePicker.value = selectedDate;
}

function applyTheme() {
  const setting = state.settings.theme;
  const resolved = setting === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : setting;
  document.documentElement.dataset.theme = resolved;
  els.theme.textContent = resolved === 'light' ? '◐' : '◒';
}

function scoreMessage(score) {
  if (score >= 85) return 'A strong day. Keep the basics steady.';
  if (score >= 65) return 'Good momentum. One focused block can lift the day.';
  if (score >= 40) return 'A mixed day. Pick one useful next action.';
  return 'Keep it simple. Log what matters and move one thing forward.';
}

function summaryRows(date) {
  const tasks = state.tasks.filter(t => t.date === date);
  const taskDone = tasks.filter(t => t.done).length;
  const sleep = sleepMinutesForDay(state, date);
  const focus = focusMinutesForDay(state, date);
  const habit = Math.round(habitCompletionForDay(state, date) * 100);
  return [
    ['Tasks', tasks.length ? `${taskDone} / ${tasks.length}` : '—'],
    ['Focus', focus ? formatMinutes(focus) : '—'],
    ['Sleep', sleep ? formatMinutes(sleep) : '—'],
    ['Habits', `${habit}%`]
  ];
}

function renderToday() {
  updateDateUI();
  const score = dayScore(state, selectedDate);
  const financeNet = incomeForDay(state, selectedDate) - spendingForDay(state, selectedDate);
  els.today.innerHTML = `
    <div class="page-heading">
      <div><span class="eyebrow">Daily cockpit</span><h1>${selectedDate === toDateKey() ? greeting() : escapeHtml(formatDateLong(selectedDate))}</h1><p>${escapeHtml(scoreMessage(score))}</p></div>
      <button class="button button-secondary button-small" data-action="export-ics">Export day to calendar</button>
    </div>
    <div class="hero-grid">
      <article class="card hero-card">
        <div><span class="eyebrow">Your day at a glance</span><h2>Build awareness, not a perfect streak.</h2><p>DayLens combines your tasks, habits, sleep, focus and spending into one lightweight picture of the day.</p></div>
        <div class="score-ring" style="--score:${score}"><div><strong>${score}</strong><span>day score</span></div></div>
      </article>
      <article class="card summary-card"><h3>Today’s signals</h3>${summaryRows(selectedDate).map(([label, value]) => `<div class="summary-row"><span>${label}</span><strong>${value}</strong></div>`).join('')}</article>
    </div>
    <div class="dashboard-grid">
      <article class="card section-card span-7" id="tasksCard">${renderTasks()}</article>
      <article class="card section-card span-5" id="metricsCard">${renderMetrics()}</article>
      <article class="card section-card span-4" id="sleepCard">${renderSleep()}</article>
      <article class="card section-card span-8" id="focusCard">${renderFocus()}</article>
      <article class="card section-card span-5" id="financeCard">${renderFinance(financeNet)}</article>
      <article class="card section-card span-7" id="noteCard">${renderNote()}</article>
    </div>`;
}

function renderTasks() {
  const tasks = state.tasks.filter(t => t.date === selectedDate);
  const done = tasks.filter(t => t.done).length;
  return `
    <div class="card-heading"><div><h2>Plan</h2><p>${tasks.length ? `${done} of ${tasks.length} completed` : 'Keep the list intentionally short.'}</p></div><span class="badge ${tasks.length && done === tasks.length ? 'badge-success' : ''}">${tasks.length ? Math.round(done / tasks.length * 100) : 0}%</span></div>
    <div class="task-list">${tasks.length ? tasks.map(task => `
      <div class="task-row ${task.done ? 'is-done' : ''}">
        <input class="task-check" type="checkbox" aria-label="Mark ${escapeHtml(task.text)} complete" data-action="toggle-task" data-id="${task.id}" ${task.done ? 'checked' : ''}/>
        <div><div class="task-title">${escapeHtml(task.text)}</div><div class="task-meta">${task.recurrence !== 'none' ? `Repeats ${escapeHtml(task.recurrence)}` : 'One-time task'}</div></div>
        <div class="row-actions"><button data-action="edit-task" data-id="${task.id}" aria-label="Edit task">✎</button><button data-action="delete-task" data-id="${task.id}" aria-label="Delete task">×</button></div>
      </div>`).join('') : `<div class="empty-state"><strong>No tasks yet</strong>Add only what deserves attention today.</div>`}</div>
    <form class="inline-form" data-form="add-task"><input class="input" name="text" maxlength="140" placeholder="Add a task…" aria-label="New task" required/><button class="button button-primary button-small">Add</button></form>`;
}

function activeMetricsForDate() { return state.metrics.filter(m => m.active !== false && isScheduled(m, selectedDate)); }

function renderMetrics() {
  const metrics = activeMetricsForDate();
  const completed = metrics.filter(m => metricCompleted(m, getMetricValue(state, m.id, selectedDate))).length;
  return `<div class="card-heading"><div><h2>Track</h2><p>Custom signals for this day.</p></div><span class="badge ${metrics.length && completed === metrics.length ? 'badge-success' : ''}">${completed}/${metrics.length}</span></div>
    <div class="metric-grid">${metrics.map(renderMetricCard).join('')}</div>
    <div style="margin-top:12px"><button class="button button-quiet button-small" data-action="manage-trackers">＋ Manage trackers</button></div>`;
}

function renderMetricCard(metric) {
  const value = getMetricValue(state, metric.id, selectedDate);
  const complete = metricCompleted(metric, value);
  const streak = streakForMetric(state, metric, selectedDate);
  const targetText = metric.type === 'boolean' ? `${streak} day streak` : `Target ${metric.target ?? 1}${metric.unit ? ` ${metric.unit}` : ''}`;
  let control = '';
  if (metric.type === 'boolean') control = `<label class="toggle"><input type="checkbox" data-action="metric-input" data-id="${metric.id}" ${value ? 'checked' : ''}/><span></span></label>`;
  else if (metric.type === 'counter') control = `<div class="counter-control"><button data-action="metric-step" data-id="${metric.id}" data-step="-1" aria-label="Decrease ${escapeHtml(metric.name)}">−</button><span class="metric-value">${Number(value || 0)}</span><button data-action="metric-step" data-id="${metric.id}" data-step="1" aria-label="Increase ${escapeHtml(metric.name)}">＋</button></div>`;
  else if (metric.type === 'rating') control = `<div style="display:grid;gap:6px;width:100%"><div class="metric-control"><span class="metric-value">${value || '—'}<small style="font-size:10px;color:var(--muted)">/10</small></span></div><input type="range" min="1" max="10" step="1" value="${value || 5}" data-action="metric-range" data-id="${metric.id}" aria-label="${escapeHtml(metric.name)} rating"/></div>`;
  else {
    const inputType = metric.type === 'time' ? 'time' : metric.type === 'text' ? 'text' : 'number';
    const step = ['quantity', 'currency'].includes(metric.type) ? '0.1' : '1';
    control = `<input class="input" style="padding:7px 9px" type="${inputType}" step="${step}" value="${escapeHtml(value ?? '')}" data-action="metric-value" data-id="${metric.id}" aria-label="${escapeHtml(metric.name)} value" placeholder="0"/>`;
  }
  const progress = metric.type !== 'boolean' && metric.type !== 'text' && metric.type !== 'time' ? clamp((Number(value || 0) / Math.max(1, Number(metric.target || 1))) * 100, 0, 100) : complete ? 100 : 0;
  return `<div class="metric-card ${complete ? 'is-complete' : ''}"><div class="metric-top"><div><div class="metric-name">${escapeHtml(metric.name)}</div><div class="metric-target">${escapeHtml(targetText)}</div></div><span>${complete ? '✓' : '○'}</span></div><div>${control}${metric.type !== 'rating' ? `<div class="progress" style="margin-top:8px"><span style="width:${progress}%"></span></div>` : ''}</div></div>`;
}

function renderSleep() {
  const record = state.sleepRecords.find(s => s.date === selectedDate) || { bedtime: '', wakeTime: '' };
  const duration = minutesBetween(record.bedtime, record.wakeTime);
  return `<div class="card-heading"><div><h2>Sleep</h2><p>Bedtime belongs to the previous evening; wake time belongs to this date.</p></div>${duration ? `<span class="badge badge-success">${formatMinutes(duration)}</span>` : ''}</div>
    <form data-form="sleep"><div class="dual-input"><div class="form-field"><label>Bedtime</label><input class="input" type="time" name="bedtime" value="${record.bedtime}"/></div><div class="form-field"><label>Wake time</label><input class="input" type="time" name="wakeTime" value="${record.wakeTime}"/></div></div><button class="button button-secondary button-small" style="margin-top:12px">Save sleep</button></form>`;
}

function renderFocus() {
  const sessions = state.workSessions.filter(s => s.date === selectedDate);
  const total = focusMinutesForDay(state, selectedDate);
  return `<div class="card-heading"><div><h2>Focus & work</h2><p>Log intentional work blocks, not passive screen time.</p></div><div class="data-kpi"><strong>${formatMinutes(total)}</strong><span>today</span></div></div>
    <div class="session-list">${sessions.length ? sessions.map(s => `<div class="session-row"><span>◷</span><div><div class="task-title">${escapeHtml(s.project)}</div><div class="row-meta">${formatTime(s.start)} → ${formatTime(s.end)} · ${formatMinutes(Math.max(0, minutesBetween(s.start, s.end) - Number(s.breakMinutes || 0)))}${minutesBetween(s.start, s.end) && s.end < s.start ? ' · overnight' : ''}${s.breakMinutes ? ` · ${s.breakMinutes}m break` : ''}</div></div><div class="row-actions"><button data-action="edit-work" data-id="${s.id}" aria-label="Edit work session">✎</button><button data-action="delete-work" data-id="${s.id}" aria-label="Delete work session">×</button></div></div>`).join('') : `<div class="empty-state"><strong>No focus blocks logged</strong>Add a session when you finish a meaningful block of work.</div>`}</div>
    <button class="button button-secondary button-small" style="margin-top:12px" data-action="add-work">＋ Log focus session</button>`;
}

function renderFinance(net) {
  const rows = state.financeEntries.filter(e => e.date === selectedDate);
  const spend = spendingForDay(state, selectedDate);
  const income = incomeForDay(state, selectedDate);
  return `<div class="card-heading"><div><h2>Money</h2><p>Lightweight awareness, not full accounting.</p></div><span class="badge">${formatMoney(net, state.settings.currency)} net</span></div>
    <div class="summary-row"><span>Spent</span><strong>${formatMoney(spend, state.settings.currency)}</strong></div><div class="summary-row"><span>Income</span><strong>${formatMoney(income, state.settings.currency)}</strong></div>
    <div class="money-list" style="margin-top:10px">${rows.slice(-4).reverse().map(e => `<div class="money-row"><span>${e.kind === 'expense' ? '−' : '+'}</span><div><div class="task-title">${escapeHtml(e.category || 'Other')}</div><div class="row-meta">${escapeHtml(e.note || e.kind)}</div></div><div class="row-actions"><strong style="font-size:12px">${formatMoney(e.amount, state.settings.currency)}</strong><button data-action="delete-money" data-id="${e.id}" aria-label="Delete entry">×</button></div></div>`).join('')}</div>
    <button class="button button-secondary button-small" style="margin-top:12px" data-action="add-money">＋ Add transaction</button>`;
}

function renderNote() {
  const note = state.dailyNotes.find(n => n.date === selectedDate);
  return `<div class="card-heading"><div><h2>Daily note</h2><p>One place for context the numbers cannot capture.</p></div><span class="badge">autosaves</span></div><textarea class="textarea" id="dailyNote" placeholder="What mattered today? What helped or got in the way?">${escapeHtml(note?.text || '')}</textarea>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.';
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart); date.setDate(gridStart.getDate() + i);
    const key = toDateKey(date); const score = dayScore(state, key); const same = date.getMonth() === month;
    const tracked = [state.tasks.some(t => t.date === key), sleepMinutesForDay(state, key) > 0, focusMinutesForDay(state, key) > 0];
    cells.push(`<button class="calendar-day ${same ? '' : 'is-muted'} ${key === toDateKey() ? 'is-today' : ''} ${key === selectedDate ? 'is-selected' : ''}" data-action="calendar-date" data-date="${key}"><span class="day-number">${date.getDate()}</span><span class="day-score">${score || '—'}</span><span class="day-dots">${tracked.map(on => `<span class="${on ? 'on' : ''}"></span>`).join('')}</span></button>`);
  }
  els.calendar.innerHTML = `<div class="page-heading"><div><span class="eyebrow">Calendar</span><h1>See the shape of your month.</h1><p>Scores are context, not judgment. Open any day to inspect or edit what happened.</p></div></div>
    <article class="card section-card"><div class="calendar-toolbar"><button class="icon-button" data-action="calendar-prev" aria-label="Previous month">‹</button><div class="calendar-month">${first.toLocaleDateString(undefined, { month:'long', year:'numeric' })}</div><button class="icon-button" data-action="calendar-next" aria-label="Next month">›</button></div><div class="calendar-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="calendar-weekday">${d}</div>`).join('')}${cells.join('')}</div></article>`;
}

function lineChart(dates, values) {
  const width = 760, height = 200, pad = 22;
  const max = Math.max(100, ...values), min = 0;
  const pts = values.map((v, i) => {
    const x = pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / Math.max(1, max - min)) * (height - pad * 2);
    return [x, y];
  });
  const path = pts.map((p,i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${path} L ${pts.at(-1)?.[0] || pad} ${height-pad} L ${pts[0]?.[0] || pad} ${height-pad} Z`;
  const labels = [0, Math.floor((dates.length-1)/2), dates.length-1].filter((v,i,a) => a.indexOf(v)===i).map(i => `<text class="chart-label" x="${pts[i]?.[0] || 0}" y="${height-2}" text-anchor="middle">${escapeHtml(formatDateShort(dates[i]))}</text>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Day score trend"><defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${[25,50,75,100].map(v => { const y=height-pad-(v/100)*(height-pad*2); return `<line class="chart-grid-line" x1="${pad}" x2="${width-pad}" y1="${y}" y2="${y}"/>`; }).join('')}<path class="chart-area" d="${area}"/><path class="chart-line" d="${path}"/>${pts.map(p=>`<circle class="chart-dot" cx="${p[0]}" cy="${p[1]}" r="3"/>`).join('')}${labels}</svg>`;
}

function renderHeatmap(days = 120) {
  const dates = dateRange(days);
  return `<div class="heatmap" aria-label="Day score heatmap">${dates.map(d => { const s = dayScore(state,d); const level = s >= 80 ? 4 : s >= 60 ? 3 : s >= 35 ? 2 : s > 0 ? 1 : 0; return `<span class="heat ${level ? `l${level}` : ''}" title="${formatDateShort(d)}: ${s}"></span>`; }).join('')}</div>`;
}

function renderInsights() {
  const days = insightRange === 0 ? Math.max(30, Math.min(365, daysTrackedSpan())) : insightRange;
  const dates = dateRange(days);
  const summary = summaryForRange(state, dates);
  const insights = generateInsights(state, dates);
  const scores = dates.map(d => dayScore(state,d));
  els.insights.innerHTML = `<div class="page-heading"><div><span class="eyebrow">Insights</span><h1>What seems to shape your days?</h1><p>These are descriptive patterns from your own logs—not causal conclusions. More consistent data makes them more useful.</p></div><div class="range-tabs">${[[7,'7D'],[30,'30D'],[90,'90D'],[0,'Year']].map(([v,l])=>`<button data-action="range" data-range="${v}" class="${insightRange===v?'is-active':''}">${l}</button>`).join('')}</div></div>
    <div class="kpi-grid">
      ${kpi('Consistency', `${summary.consistency}%`)}${kpi('Avg sleep', summary.averageSleepMinutes ? formatMinutes(summary.averageSleepMinutes) : '—')}${kpi('Focus', formatMinutes(summary.focusMinutes))}${kpi('Tasks', `${summary.taskCompletion}%`)}${kpi('Exercise', `${summary.exerciseDays}d`)}${kpi('Avg score', `${summary.averageScore}`)}
    </div>
    <div class="dashboard-grid">
      <article class="card chart-card span-8"><div class="card-heading"><div><h2>Day score trend</h2><p>Weighted from your current score settings.</p></div></div><div class="chart">${lineChart(dates,scores)}</div></article>
      <article class="card section-card span-4"><div class="card-heading"><div><h2>Patterns</h2><p>Deterministic analysis, no black-box AI.</p></div></div><div class="insight-list">${insights.map(i => `<div class="insight"><strong>${escapeHtml(i.title)}</strong><p>${escapeHtml(i.body)}</p><footer>Evidence confidence ${i.confidence}% · association only</footer></div>`).join('')}</div></article>
      <article class="card section-card span-12"><div class="card-heading"><div><h2>Consistency heatmap</h2><p>The last 120 days. Brighter cells indicate higher day scores.</p></div></div>${renderHeatmap(120)}</article>
    </div>`;
}

function kpi(label, value) { return `<article class="card kpi"><small>${label}</small><strong>${value}</strong></article>`; }
function daysTrackedSpan() {
  const dates = [...state.tasks.map(x=>x.date), ...state.metricEntries.map(x=>x.date), ...state.sleepRecords.map(x=>x.date), ...state.workSessions.map(x=>x.date)].filter(Boolean).sort();
  if (!dates.length) return 30;
  return Math.max(1, Math.ceil((fromDateKey(dates.at(-1)) - fromDateKey(dates[0])) / 86400000) + 1);
}

function renderSettings() {
  const session = getSession();
  els.settings.innerHTML = `<div class="page-heading"><div><span class="eyebrow">Settings</span><h1>Make DayLens yours.</h1><p>Configure the signals you care about, your score weights, privacy and optional sync.</p></div></div>
    <div class="settings-grid"><div>
      <section class="card settings-section"><div class="card-heading"><div><h2>Trackers</h2><p>Use a flexible metric instead of hard-coded lifestyle widgets.</p></div><button class="button button-primary button-small" data-action="add-tracker">＋ Add tracker</button></div><div class="tracker-list">${state.metrics.map(m => `<div class="tracker-row"><div><strong>${escapeHtml(m.name)}</strong><small>${escapeHtml(m.type)} · ${escapeHtml(m.schedule || 'daily')} · target ${escapeHtml(m.target ?? 1)} ${escapeHtml(m.unit || '')}</small></div><div class="row-actions"><button data-action="toggle-tracker" data-id="${m.id}" aria-label="${m.active === false ? 'Enable' : 'Disable'} tracker">${m.active === false ? '○' : '●'}</button><button data-action="edit-tracker" data-id="${m.id}" aria-label="Edit tracker">✎</button><button data-action="delete-tracker" data-id="${m.id}" aria-label="Delete tracker">×</button></div></div>`).join('')}</div></section>
      <section class="card settings-section"><div class="card-heading"><div><h2>Day score</h2><p>Weights are normalized automatically; they do not need to total 100.</p></div></div>${Object.entries(state.settings.scoreWeights).map(([key,value])=>`<label class="weight-row"><span>${capitalize(key)}</span><input type="range" min="0" max="50" step="5" value="${value}" data-action="score-weight" data-key="${key}"/><strong>${value}</strong></label>`).join('')}<div class="settings-row"><div><strong>Focus goal</strong><p>Used when scoring focus/work time.</p></div><input class="input" style="width:110px" type="number" min="0" step="15" value="${state.settings.focusGoalMinutes}" data-action="focus-goal"/></div></section>
      <section class="card settings-section"><div class="card-heading"><div><h2>Preferences</h2><p>Appearance and local reminders.</p></div></div>
        <div class="settings-row"><div><strong>Theme</strong><p>System follows your device preference.</p></div><select class="select" style="width:130px" data-action="theme-select"><option value="system" ${state.settings.theme==='system'?'selected':''}>System</option><option value="dark" ${state.settings.theme==='dark'?'selected':''}>Dark</option><option value="light" ${state.settings.theme==='light'?'selected':''}>Light</option></select></div>
        <div class="settings-row"><div><strong>Currency</strong><p>Used for lightweight income and spending logs.</p></div><select class="select" style="width:110px" data-action="currency"><option>EUR</option><option>USD</option><option>GBP</option><option>INR</option><option>NOK</option></select></div>
        <div class="settings-row"><div><strong>Daily reminder</strong><p>Browser notifications work while DayLens is open. Use the calendar export for OS-level reminders.</p></div><div style="display:flex;gap:6px"><input class="input" type="time" style="width:110px" value="${state.settings.reminderTime || ''}" data-action="reminder-time"/><label class="toggle"><input type="checkbox" data-action="reminder-enabled" ${state.settings.reminderEnabled?'checked':''}/><span></span></label></div></div>
      </section>
    </div><div>
      <section class="card settings-section"><div class="card-heading"><div><h2>Privacy & backup</h2><p>Local-first by default.</p></div></div><div class="settings-row"><div><strong>Export backup</strong><p>Download all DayLens data as JSON.</p></div><button class="button button-secondary button-small" data-action="export-json">Export</button></div><div class="settings-row"><div><strong>Import backup</strong><p>Valid DayLens backups replace the current local dataset.</p></div><button class="button button-secondary button-small" data-action="import-json">Import</button></div><div class="settings-row"><div><strong>Calendar export</strong><p>Export the selected day’s tasks as an .ics file.</p></div><button class="button button-secondary button-small" data-action="export-ics">.ics</button></div></section>
      <section class="card settings-section"><div class="card-heading"><div><h2>Cloud sync</h2><p>Optional Supabase authentication and cross-device snapshot sync.</p></div></div>${renderCloud(session)}</section>
      <section class="card settings-section"><div class="card-heading"><div><h2>About</h2><p>DayLens 1.0</p></div></div><div class="cloud-status"><strong>Privacy-first personal analytics.</strong><p>Your logs stay local unless you explicitly configure and use cloud sync. Insights are calculated in your browser.</p></div></section>
    </div></div>`;
  const currencySelect = $('[data-action="currency"]'); if (currencySelect) currencySelect.value = state.settings.currency;
}

function renderCloud(session) {
  if (!cloudConfigured()) return `<div class="cloud-status"><strong>Cloud sync is not configured</strong><p>Copy <code>config.example.js</code> to <code>config.js</code>, add your Supabase URL and public anon key, then run the provided SQL schema.</p></div>`;
  if (!session) return `<div class="cloud-status"><strong>Configured · signed out</strong><p>Sign in to sync an encrypted transport session with a row protected by Supabase RLS.</p></div><div class="form-grid" style="margin-top:12px"><div class="form-field full"><label>Email</label><input class="input" id="cloudEmail" type="email" autocomplete="email"/></div><div class="form-field full"><label>Password</label><input class="input" id="cloudPassword" type="password" autocomplete="current-password"/></div></div><div class="form-actions"><button class="button button-secondary button-small" data-action="cloud-signup">Create account</button><button class="button button-primary button-small" data-action="cloud-signin">Sign in</button></div>`;
  return `<div class="cloud-status"><strong>Signed in</strong><p>${escapeHtml(session.user?.email || 'Cloud account')} · local changes can sync to your private snapshot.</p></div><div class="form-actions"><button class="button button-secondary button-small" data-action="cloud-pull">Pull cloud copy</button><button class="button button-secondary button-small" data-action="cloud-push">Push now</button><button class="button button-quiet button-small" data-action="cloud-signout">Sign out</button></div>`;
}

function capitalize(v) { return v.charAt(0).toUpperCase() + v.slice(1); }

function taskModal(task = null) {
  openModal(task ? 'Edit task' : 'Add task', `<form data-form="task-modal"><input type="hidden" name="id" value="${task?.id || ''}"/><div class="form-grid"><div class="form-field full"><label>Task</label><input class="input" name="text" maxlength="140" value="${escapeHtml(task?.text || '')}" required autofocus/></div><div class="form-field"><label>Date</label><input class="input" name="date" type="date" value="${task?.date || selectedDate}" required/></div><div class="form-field"><label>Repeat</label><select class="select" name="recurrence"><option value="none">No repeat</option><option value="daily" ${task?.recurrence==='daily'?'selected':''}>Daily</option><option value="weekly" ${task?.recurrence==='weekly'?'selected':''}>Weekly</option></select></div></div><div class="form-actions"><button type="button" class="button button-quiet" data-action="close-modal">Cancel</button><button class="button button-primary">${task ? 'Save changes' : 'Add task'}</button></div></form>`, 'Plan');
}

function workModal(session = null) {
  openModal(session ? 'Edit focus session' : 'Log focus session', `<form data-form="work-modal"><input type="hidden" name="id" value="${session?.id || ''}"/><div class="form-grid"><div class="form-field full"><label>Project / description</label><input class="input" name="project" maxlength="120" value="${escapeHtml(session?.project || '')}" required/></div><div class="form-field"><label>Start</label><input class="input" name="start" type="time" value="${session?.start || ''}" required/></div><div class="form-field"><label>End</label><input class="input" name="end" type="time" value="${session?.end || ''}" required/></div><div class="form-field"><label>Break (minutes)</label><input class="input" name="breakMinutes" type="number" min="0" step="5" value="${session?.breakMinutes || 0}"/></div><div class="form-field"><label>Date</label><input class="input" name="date" type="date" value="${session?.date || selectedDate}" required/></div></div><p class="form-help">If end time is earlier than start time, DayLens treats the session as crossing midnight.</p><div class="form-actions"><button type="button" class="button button-quiet" data-action="close-modal">Cancel</button><button class="button button-primary">Save session</button></div></form>`, 'Focus');
}

function moneyModal() {
  openModal('Add transaction', `<form data-form="money-modal"><div class="form-grid"><div class="form-field"><label>Type</label><select class="select" name="kind"><option value="expense">Expense</option><option value="income">Income</option></select></div><div class="form-field"><label>Amount (${state.settings.currency})</label><input class="input" name="amount" type="number" min="0" step="0.01" required/></div><div class="form-field"><label>Category</label><input class="input" name="category" maxlength="40" placeholder="Food, transport, salary…" required/></div><div class="form-field"><label>Date</label><input class="input" name="date" type="date" value="${selectedDate}" required/></div><div class="form-field full"><label>Note</label><input class="input" name="note" maxlength="100" placeholder="Optional context"/></div></div><div class="form-actions"><button type="button" class="button button-quiet" data-action="close-modal">Cancel</button><button class="button button-primary">Add</button></div></form>`, 'Money');
}

function trackerModal(metric = null) {
  const types = ['boolean','counter','quantity','duration','rating','text','currency','time'];
  openModal(metric ? 'Edit tracker' : 'Create tracker', `<form data-form="tracker-modal"><input type="hidden" name="id" value="${metric?.id || ''}"/><div class="form-grid"><div class="form-field full"><label>Name</label><input class="input" name="name" maxlength="40" value="${escapeHtml(metric?.name || '')}" required/></div><div class="form-field"><label>Type</label><select class="select" name="type">${types.map(t=>`<option value="${t}" ${metric?.type===t?'selected':''}>${capitalize(t)}</option>`).join('')}</select></div><div class="form-field"><label>Unit</label><input class="input" name="unit" maxlength="12" value="${escapeHtml(metric?.unit || '')}" placeholder="L, min, km…"/></div><div class="form-field"><label>Target</label><input class="input" name="target" type="number" step="0.1" value="${metric?.target ?? 1}"/></div><div class="form-field"><label>Schedule</label><select class="select" name="schedule"><option value="daily" ${metric?.schedule==='daily'?'selected':''}>Daily</option><option value="weekdays" ${metric?.schedule==='weekdays'?'selected':''}>Weekdays</option><option value="weekends" ${metric?.schedule==='weekends'?'selected':''}>Weekends</option><option value="weekly" ${metric?.schedule==='weekly'?'selected':''}>Weekly</option></select></div><div class="form-field"><label>Category</label><select class="select" name="category"><option value="wellbeing">Wellbeing</option><option value="exercise" ${metric?.category==='exercise'?'selected':''}>Exercise</option><option value="growth" ${metric?.category==='growth'?'selected':''}>Growth</option><option value="custom" ${metric?.category==='custom'?'selected':''}>Custom</option></select></div></div><div class="form-actions"><button type="button" class="button button-quiet" data-action="close-modal">Cancel</button><button class="button button-primary">Save tracker</button></div></form>`, 'Track');
}

function quickAddModal() {
  openModal('Quick add', `<div class="quick-grid"><button class="quick-option" data-action="quick-task"><strong>Task</strong><small>Add something you want to complete.</small></button><button class="quick-option" data-action="add-work"><strong>Focus session</strong><small>Log time spent on meaningful work.</small></button><button class="quick-option" data-action="add-money"><strong>Transaction</strong><small>Capture an expense or income.</small></button><button class="quick-option" data-action="manage-trackers"><strong>Tracker</strong><small>Create a custom habit or metric.</small></button></div>`);
}

function deleteWithUndo(collection, id, label) {
  const index = collection.findIndex(x => x.id === id); if (index < 0) return;
  const [item] = collection.splice(index, 1); persist({ silent:true }); renderActive();
  undoAction = () => { collection.splice(index, 0, item); persist({ silent:true }); renderActive(); };
  toast(`${label} deleted.`, 'Undo', () => { undoAction?.(); undoAction = null; });
}

function renderActive() { if (activeView === 'today') renderToday(); else if (activeView === 'calendar') renderCalendar(); else if (activeView === 'insights') renderInsights(); else renderSettings(); }

function exportJson() { downloadFile(`daylens-backup-${toDateKey()}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('Backup downloaded.'); }
function exportIcs() {
  const tasks = state.tasks.filter(t => t.date === selectedDate && !t.done);
  const escape = value => String(value).replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
  const dt = selectedDate.replaceAll('-','');
  const events = tasks.map(t => `BEGIN:VEVENT\nUID:${t.id}@daylens\nDTSTART;VALUE=DATE:${dt}\nDTEND;VALUE=DATE:${shiftDateKey(selectedDate,1).replaceAll('-','')}\nSUMMARY:${escape(t.text)}\nDESCRIPTION:Exported from DayLens\nEND:VEVENT`).join('\n');
  const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//DayLens//EN\nCALSCALE:GREGORIAN\n${events}\nEND:VCALENDAR`;
  downloadFile(`daylens-${selectedDate}.ics`, ics, 'text/calendar'); toast(tasks.length ? `${tasks.length} task${tasks.length===1?'':'s'} exported.` : 'Calendar file exported with no open tasks.');
}

function setupReminder() {
  clearInterval(reminderTimer);
  if (!state.settings.reminderEnabled || !state.settings.reminderTime) return;
  reminderTimer = setInterval(() => {
    const now = new Date(); const current = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const marker = `daylens_reminded_${toDateKey(now)}_${current}`;
    if (current === state.settings.reminderTime && !sessionStorage.getItem(marker)) {
      sessionStorage.setItem(marker,'1');
      if (Notification.permission === 'granted') new Notification('DayLens check-in', { body: 'Take a minute to close the loop on your day.' });
      else toast('Daily check-in: take a minute to update your day.');
    }
  }, 30000);
}

async function enableNotifications() {
  if (!('Notification' in window)) { toast('Notifications are not supported by this browser.'); return; }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') toast('Notification permission was not granted.');
}

function formDataObject(form) { return Object.fromEntries(new FormData(form).entries()); }

function handleSubmit(event) {
  const form = event.target.closest('form'); if (!form) return;
  const kind = form.dataset.form; if (!kind) return;
  event.preventDefault(); const data = formDataObject(form);
  if (kind === 'add-task') { state.tasks.push({ id: uid('task'), date: selectedDate, text: data.text.trim(), done:false, recurrence:'none', createdAt:new Date().toISOString() }); form.reset(); persist({silent:true}); renderToday(); toast('Task added.'); }
  if (kind === 'task-modal') {
    const existing = state.tasks.find(t=>t.id===data.id);
    if (existing) Object.assign(existing,{text:data.text.trim(),date:data.date,recurrence:data.recurrence}); else state.tasks.push({id:uid('task'),text:data.text.trim(),date:data.date,recurrence:data.recurrence,done:false,createdAt:new Date().toISOString()});
    persist({silent:true}); closeModal(); renderToday(); toast(existing?'Task updated.':'Task added.');
  }
  if (kind === 'sleep') {
    let record = state.sleepRecords.find(s=>s.date===selectedDate);
    if (!record) { record={id:uid('sleep'),date:selectedDate,bedtime:'',wakeTime:''}; state.sleepRecords.push(record); }
    record.bedtime=data.bedtime; record.wakeTime=data.wakeTime; persist({silent:true}); renderToday(); toast('Sleep updated.');
  }
  if (kind === 'work-modal') {
    const duration = minutesBetween(data.start,data.end) - Number(data.breakMinutes||0);
    if (duration <= 0 || duration > 24*60) { toast('Check the session times and break duration.'); return; }
    const existing=state.workSessions.find(s=>s.id===data.id); const next={project:data.project.trim(),start:data.start,end:data.end,breakMinutes:Number(data.breakMinutes||0),date:data.date};
    if(existing) Object.assign(existing,next); else state.workSessions.push({id:uid('work'),...next}); persist({silent:true}); closeModal(); renderToday(); toast(existing?'Session updated.':'Focus session added.');
  }
  if (kind === 'money-modal') { state.financeEntries.push({id:uid('money'),date:data.date,kind:data.kind,amount:Number(data.amount),category:data.category.trim(),note:data.note.trim()}); persist({silent:true}); closeModal(); renderToday(); toast('Transaction added.'); }
  if (kind === 'tracker-modal') {
    const existing=state.metrics.find(m=>m.id===data.id); const next={name:data.name.trim(),type:data.type,unit:data.unit.trim(),target:Number(data.target||1),schedule:data.schedule,category:data.category,active:true};
    if(existing) Object.assign(existing,next); else state.metrics.push({id:uid('metric'),slug:`custom_${Date.now()}`,...next}); persist({silent:true}); closeModal(); renderSettings(); toast(existing?'Tracker updated.':'Tracker created.');
  }
}

function handleChange(event) {
  const el = event.target; const action = el.dataset.action; if (!action) return;
  if (action === 'toggle-task') { const t=state.tasks.find(x=>x.id===el.dataset.id); if(t){t.done=el.checked;persist({silent:true});renderToday();} }
  if (action === 'metric-input') { upsertMetricEntry(state,el.dataset.id,selectedDate,el.checked); persist({silent:true});renderToday(); }
  if (action === 'metric-range' || action === 'metric-value') { upsertMetricEntry(state,el.dataset.id,selectedDate, action==='metric-range'||el.type==='number' ? Number(el.value) : el.value); persist({silent:true}); if(action==='metric-range') renderToday(); }
  if (action === 'score-weight') { state.settings.scoreWeights[el.dataset.key]=Number(el.value); persist({silent:true}); renderSettings(); }
  if (action === 'focus-goal') { state.settings.focusGoalMinutes=Math.max(0,Number(el.value||0));persist({silent:true}); }
  if (action === 'theme-select') { state.settings.theme=el.value;persist({silent:true});applyTheme();renderSettings(); }
  if (action === 'currency') { state.settings.currency=el.value;persist({silent:true});renderSettings(); }
  if (action === 'reminder-time') { state.settings.reminderTime=el.value;persist({silent:true});setupReminder(); }
  if (action === 'reminder-enabled') { state.settings.reminderEnabled=el.checked;persist({silent:true}); if(el.checked) enableNotifications();setupReminder(); }
}

function handleInput(event) {
  if (event.target.id === 'dailyNote') {
    let note=state.dailyNotes.find(n=>n.date===selectedDate);
    if(!note){note={id:uid('note'),date:selectedDate,text:''};state.dailyNotes.push(note);}
    note.text=event.target.value; debouncedSaveNote();
  }
}
const debouncedSaveNote = debounce(()=>persist({silent:true}),450);

async function handleClick(event) {
  const button = event.target.closest('[data-action], [data-view]'); if (!button) return;
  if (button.dataset.view) { setView(button.dataset.view); return; }
  const action=button.dataset.action;
  if(action==='close-modal'){closeModal();return;}
  if(action==='quick-task'){taskModal();return;}
  if(action==='add-work'){workModal();return;}
  if(action==='add-money'){moneyModal();return;}
  if(action==='manage-trackers'){closeModal();setView('settings');return;}
  if(action==='add-tracker'){trackerModal();return;}
  if(action==='edit-task'){taskModal(state.tasks.find(t=>t.id===button.dataset.id));return;}
  if(action==='edit-work'){workModal(state.workSessions.find(s=>s.id===button.dataset.id));return;}
  if(action==='edit-tracker'){trackerModal(state.metrics.find(m=>m.id===button.dataset.id));return;}
  if(action==='delete-task'){deleteWithUndo(state.tasks,button.dataset.id,'Task');return;}
  if(action==='delete-work'){deleteWithUndo(state.workSessions,button.dataset.id,'Focus session');return;}
  if(action==='delete-money'){deleteWithUndo(state.financeEntries,button.dataset.id,'Transaction');return;}
  if(action==='delete-tracker'){
    const metric=state.metrics.find(m=>m.id===button.dataset.id); if(!metric)return;
    if(['exercise','mood','water','reading'].includes(metric.slug)){toast('Default trackers can be disabled instead of deleted.');return;}
    deleteWithUndo(state.metrics,metric.id,'Tracker'); state.metricEntries=state.metricEntries.filter(e=>e.metricId!==metric.id);persist({silent:true});renderSettings();return;
  }
  if(action==='toggle-tracker'){const m=state.metrics.find(x=>x.id===button.dataset.id);if(m){m.active=m.active===false;persist({silent:true});renderSettings();}return;}
  if(action==='metric-step'){const m=state.metrics.find(x=>x.id===button.dataset.id);const current=Number(getMetricValue(state,m.id,selectedDate)||0);upsertMetricEntry(state,m.id,selectedDate,Math.max(0,current+Number(button.dataset.step)));persist({silent:true});renderToday();return;}
  if(action==='calendar-prev'){calendarCursor.setMonth(calendarCursor.getMonth()-1);renderCalendar();return;}
  if(action==='calendar-next'){calendarCursor.setMonth(calendarCursor.getMonth()+1);renderCalendar();return;}
  if(action==='calendar-date'){selectedDate=button.dataset.date;calendarCursor=fromDateKey(selectedDate);setView('today');return;}
  if(action==='range'){insightRange=Number(button.dataset.range);renderInsights();return;}
  if(action==='export-json'){exportJson();return;}
  if(action==='import-json'){els.importInput.click();return;}
  if(action==='export-ics'){exportIcs();return;}
  if(action==='cloud-signout'){signOut();renderSettings();toast('Signed out.');return;}
  if(action==='cloud-signup'||action==='cloud-signin'){
    const email=$('#cloudEmail')?.value.trim(),password=$('#cloudPassword')?.value;if(!email||!password){toast('Enter email and password.');return;}
    try{if(action==='cloud-signup'){const result=await signUp(email,password);toast(result.access_token?'Account created and signed in.':'Account created. Check your email if confirmation is required.');}else{await signIn(email,password);toast('Signed in.');}renderSettings();}catch(e){toast(e.message);}return;
  }
  if(action==='cloud-push'){try{await pushSnapshot(state);toast('Cloud copy updated.');}catch(e){toast(e.message);}return;}
  if(action==='cloud-pull'){try{const row=await pullSnapshot();if(!row){toast('No cloud copy exists yet.');return;}state=validateImportedState(row.state);saveState(state);renderSettings();toast('Cloud copy loaded.');}catch(e){toast(e.message);}return;}
}

function bind() {
  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleInput);
  els.prev.addEventListener('click',()=>{selectedDate=shiftDateKey(selectedDate,-1);renderToday();});
  els.next.addEventListener('click',()=>{selectedDate=shiftDateKey(selectedDate,1);renderToday();});
  els.todayBtn.addEventListener('click',()=>{selectedDate=toDateKey();renderToday();});
  els.dateButton.addEventListener('click',()=>els.datePicker.showPicker?.() || els.datePicker.click());
  els.datePicker.addEventListener('change',()=>{if(els.datePicker.value){selectedDate=els.datePicker.value;renderToday();}});
  els.quick.addEventListener('click',quickAddModal);
  els.theme.addEventListener('click',()=>{const resolved=document.documentElement.dataset.theme;state.settings.theme=resolved==='dark'?'light':'dark';persist({silent:true});applyTheme();if(activeView==='settings')renderSettings();});
  els.modalClose.addEventListener('click',closeModal);
  els.modal.addEventListener('click',e=>{if(e.target===els.modal)closeModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!els.modal.hidden)closeModal();});
  els.importInput.addEventListener('change', async ()=>{
    const file=els.importInput.files?.[0]; if(!file)return;
    try{const imported=validateImportedState(JSON.parse(await file.text()));state=imported;saveState(state);renderActive();toast('Backup imported successfully.');}catch(e){toast(`Import failed: ${e.message}`);}finally{els.importInput.value='';}
  });
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',()=>{if(state.settings.theme==='system')applyTheme();});
}

function init() {
  applyTheme(); bind(); setupReminder();
  const hash=location.hash.replace('#',''); if(['today','calendar','insights','settings'].includes(hash)) activeView=hash;
  setView(activeView); updateDateUI();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  if(state.migration?.legacyImported && state.migration.importedAt && !sessionStorage.getItem('daylens_migration_notice')) {
    sessionStorage.setItem('daylens_migration_notice','1');
    toast('Legacy DailyTracker data was migrated into the new DayLens model.');
  }
}

init();