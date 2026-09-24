import { clamp, fromDateKey, isScheduled, mean, metricCompleted, minutesBetween, shiftDateKey, toDateKey } from './utils.js';

export function taskCompletionForDay(state, date) {
  const tasks = state.tasks.filter(t => t.date === date);
  if (!tasks.length) return 0;
  return tasks.filter(t => t.done).length / tasks.length;
}

export function focusMinutesForDay(state, date) {
  return state.workSessions
    .filter(s => s.date === date)
    .reduce((sum, s) => sum + Math.max(0, minutesBetween(s.start, s.end) - Number(s.breakMinutes || 0)), 0);
}

export function sleepMinutesForDay(state, date) {
  const record = state.sleepRecords.find(s => s.date === date);
  return record ? minutesBetween(record.bedtime, record.wakeTime) : 0;
}

export function spendingForDay(state, date) {
  return state.financeEntries
    .filter(e => e.date === date && e.kind === 'expense')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

export function incomeForDay(state, date) {
  return state.financeEntries
    .filter(e => e.date === date && e.kind === 'income')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

export function habitCompletionForDay(state, date) {
  const metrics = state.metrics.filter(m => m.active !== false && isScheduled(m, date));
  if (!metrics.length) return 0;
  const map = new Map(state.metricEntries.filter(e => e.date === date).map(e => [e.metricId, e.value]));
  return metrics.filter(m => metricCompleted(m, map.get(m.id))).length / metrics.length;
}

export function getMetricValue(state, metricId, date) {
  return state.metricEntries.find(e => e.metricId === metricId && e.date === date)?.value;
}

export function exerciseDone(state, date) {
  const exercise = state.metrics.find(m => m.slug === 'exercise' || m.category === 'exercise');
  return exercise ? metricCompleted(exercise, getMetricValue(state, exercise.id, date)) : false;
}

export function dayScore(state, date) {
  const w = state.settings.scoreWeights;
  const sleep = clamp(sleepMinutesForDay(state, date) / (8 * 60), 0, 1);
  const tasks = taskCompletionForDay(state, date);
  const focus = clamp(focusMinutesForDay(state, date) / Math.max(1, state.settings.focusGoalMinutes), 0, 1);
  const habits = habitCompletionForDay(state, date);
  const exercise = exerciseDone(state, date) ? 1 : 0;
  const parts = { sleep, tasks, focus, habits, exercise };
  const totalWeight = Object.values(w).reduce((a, b) => a + Number(b || 0), 0) || 1;
  const weighted = Object.entries(parts).reduce((sum, [key, value]) => sum + value * Number(w[key] || 0), 0);
  return Math.round((weighted / totalWeight) * 100);
}

export function dateRange(days, endDate = toDateKey()) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) result.push(shiftDateKey(endDate, -i));
  return result;
}

export function streakForMetric(state, metric, endDate = toDateKey()) {
  let streak = 0;
  let cursor = endDate;
  let safety = 0;
  while (safety++ < 4000) {
    if (!isScheduled(metric, cursor)) {
      cursor = shiftDateKey(cursor, -1);
      continue;
    }
    const value = getMetricValue(state, metric.id, cursor);
    if (!metricCompleted(metric, value)) break;
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

export function summaryForRange(state, dates) {
  const taskRates = dates.map(d => taskCompletionForDay(state, d)).filter((_, i) => state.tasks.some(t => t.date === dates[i]));
  const sleep = dates.map(d => sleepMinutesForDay(state, d)).filter(Boolean);
  const focus = dates.map(d => focusMinutesForDay(state, d));
  const scores = dates.map(d => dayScore(state, d));
  const exerciseDays = dates.filter(d => exerciseDone(state, d)).length;
  const habitRates = dates.map(d => habitCompletionForDay(state, d));
  return {
    consistency: Math.round(mean(habitRates) * 100),
    averageSleepMinutes: Math.round(mean(sleep)),
    focusMinutes: focus.reduce((a, b) => a + b, 0),
    taskCompletion: Math.round(mean(taskRates) * 100),
    exerciseDays,
    averageScore: Math.round(mean(scores)),
    spending: dates.reduce((sum, d) => sum + spendingForDay(state, d), 0)
  };
}

function pairedAverage(rows, predicate, valueFn) {
  const yes = rows.filter(predicate).map(valueFn).filter(Number.isFinite);
  const no = rows.filter(r => !predicate(r)).map(valueFn).filter(Number.isFinite);
  return { yes: mean(yes), no: mean(no), yesN: yes.length, noN: no.length };
}

export function generateInsights(state, dates) {
  const rows = dates.map(date => ({
    date,
    sleep: sleepMinutesForDay(state, date),
    taskRate: taskCompletionForDay(state, date),
    focus: focusMinutesForDay(state, date),
    exercise: exerciseDone(state, date),
    spend: spendingForDay(state, date),
    score: dayScore(state, date)
  }));
  const insights = [];

  const sleepTask = pairedAverage(
    rows.filter(r => r.sleep > 0 && state.tasks.some(t => t.date === r.date)),
    r => r.sleep >= 420,
    r => r.taskRate
  );
  if (sleepTask.yesN >= 2 && sleepTask.noN >= 2) {
    const diff = Math.round((sleepTask.yes - sleepTask.no) * 100);
    insights.push({
      tone: diff >= 0 ? 'positive' : 'neutral',
      title: 'Sleep and task completion',
      body: `On days with at least 7 hours of sleep, your task completion was ${Math.abs(diff)} percentage points ${diff >= 0 ? 'higher' : 'lower'}.`,
      confidence: Math.min(99, 40 + (sleepTask.yesN + sleepTask.noN) * 4)
    });
  }

  const exerciseTask = pairedAverage(
    rows.filter(r => state.tasks.some(t => t.date === r.date)),
    r => r.exercise,
    r => r.taskRate
  );
  if (exerciseTask.yesN >= 2 && exerciseTask.noN >= 2) {
    const diff = Math.round((exerciseTask.yes - exerciseTask.no) * 100);
    insights.push({
      tone: diff >= 0 ? 'positive' : 'neutral',
      title: 'Exercise and execution',
      body: `Task completion was ${Math.abs(diff)} percentage points ${diff >= 0 ? 'higher' : 'lower'} on exercise days.`,
      confidence: Math.min(99, 40 + (exerciseTask.yesN + exerciseTask.noN) * 4)
    });
  }

  const firstHalf = rows.slice(0, Math.floor(rows.length / 2));
  const secondHalf = rows.slice(Math.floor(rows.length / 2));
  if (firstHalf.length >= 5 && secondHalf.length >= 5) {
    const first = mean(firstHalf.map(r => r.score));
    const second = mean(secondHalf.map(r => r.score));
    const delta = Math.round(second - first);
    insights.push({
      tone: delta >= 0 ? 'positive' : 'neutral',
      title: 'Momentum',
      body: `Your average day score is ${Math.abs(delta)} points ${delta >= 0 ? 'higher' : 'lower'} in the recent half of this period.`,
      confidence: 75
    });
  }

  const weekdaySpend = Array.from({ length: 7 }, (_, day) => {
    const values = rows.filter(r => fromDateKey(r.date).getDay() === day).map(r => r.spend).filter(v => v > 0);
    return { day, avg: mean(values), n: values.length };
  }).filter(x => x.n >= 2);
  if (weekdaySpend.length >= 2) {
    const max = weekdaySpend.reduce((a, b) => a.avg > b.avg ? a : b);
    const name = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date(2026, 0, 4 + max.day));
    insights.push({ tone: 'neutral', title: 'Spending pattern', body: `${name} currently has your highest average spending in this period.`, confidence: 65 });
  }

  if (!insights.length) {
    insights.push({ tone: 'neutral', title: 'Keep tracking', body: 'Log at least two weeks of sleep, tasks, exercise and spending to unlock reliable pattern insights.', confidence: 100 });
  }
  return insights.slice(0, 4);
}
