import test from 'node:test';
import assert from 'node:assert/strict';
import { dayScore, focusMinutesForDay, sleepMinutesForDay, taskCompletionForDay, streakForMetric } from '../src/analytics.js';
import { defaultState, upsertMetricEntry } from '../src/store.js';
import { minutesBetween } from '../src/utils.js';

function stateFor(date='2026-09-24') {
  const state = defaultState();
  state.tasks.push(
    { id:'t1', date, text:'One', done:true },
    { id:'t2', date, text:'Two', done:false }
  );
  state.workSessions.push({ id:'w1', date, project:'Build', start:'22:30', end:'01:00', breakMinutes:30 });
  state.sleepRecords.push({ id:'s1', date, bedtime:'23:30', wakeTime:'07:00' });
  return state;
}

test('minutesBetween handles sessions that cross midnight', () => {
  assert.equal(minutesBetween('22:30','01:00'), 150);
});

test('task completion is a rate rather than a raw count', () => {
  assert.equal(taskCompletionForDay(stateFor(), '2026-09-24'), 0.5);
});

test('focus minutes subtract breaks', () => {
  assert.equal(focusMinutesForDay(stateFor(), '2026-09-24'), 120);
});

test('sleep duration uses previous-evening semantics', () => {
  assert.equal(sleepMinutesForDay(stateFor(), '2026-09-24'), 450);
});

test('day score stays bounded from zero to one hundred', () => {
  const state = stateFor();
  const exercise = state.metrics.find(m => m.slug === 'exercise');
  upsertMetricEntry(state, exercise.id, '2026-09-24', true);
  const score = dayScore(state, '2026-09-24');
  assert.ok(score >= 0 && score <= 100);
});

test('metric streak walks backward across completed days', () => {
  const state = defaultState();
  const metric = state.metrics.find(m => m.slug === 'exercise');
  for (const date of ['2026-09-22','2026-09-23','2026-09-24']) upsertMetricEntry(state, metric.id, date, true);
  assert.equal(streakForMetric(state, metric, '2026-09-24'), 3);
});
