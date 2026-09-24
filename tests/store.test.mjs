import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, migrateLegacy, validateImportedState } from '../src/store.js';

class MemoryStorage {
  constructor(values={}) { this.map = new Map(Object.entries(values)); }
  get length(){ return this.map.size; }
  key(i){ return [...this.map.keys()][i] ?? null; }
  getItem(k){ return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k,v){ this.map.set(k,String(v)); }
  removeItem(k){ this.map.delete(k); }
}

test('legacy DailyTracker data migrates without discarding tasks or work', () => {
  const storage = new MemoryStorage({
    'dailyTracker_2026-03-01': JSON.stringify({
      joints:2, bath:true, sleep:{sleep:'23:00',wake:'07:00'}, budget:{income:'100',spend:'20'},
      food:{breakfast:'Eggs'}, workouts:[{id:1,text:'Run',done:true}], tasks:[{id:2,text:'Ship',done:true}],
      work:[{id:3,start:'09:00',end:'11:00',project:'DayLens'}]
    })
  });
  const state = defaultState();
  const result = migrateLegacy(state, storage);
  assert.equal(result.importedDays, 1);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.workSessions.length, 1);
  assert.equal(state.financeEntries.length, 2);
  assert.ok(state.metrics.some(m => m.slug === 'legacy_smoking'));
  assert.ok(state.dailyNotes[0].text.includes('Legacy food diary'));
});

test('import validation rejects incomplete backups', () => {
  assert.throws(() => validateImportedState({ settings:{} }), /missing metrics/i);
});
