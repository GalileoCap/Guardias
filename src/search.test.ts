import { describe, expect, it } from 'vitest';
import { addDaysTo, mondayOf } from './dates';
import { BAD_CATEGORIES, PRE_QUIROFANO_BONUS, compareScores, scoreShifts } from './fairness';
import type { Score } from './fairness';
import type { HolidayLookup } from './holidays';
import { createSearch, suggestAssignments } from './search';
import type { Person, Quirofano, Settings, Shifts } from './types';

type Rng = () => number;

const mulberry32 = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const int = (rand: Rng, below: number): number => Math.floor(rand() * below);

const at = <T>(items: ArrayLike<T>, index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`sin elemento en ${index}`);
  return item;
};

const pick = <T>(rand: Rng, items: readonly T[]): T => at(items, int(rand, items.length));

const person = (id: string, active = true): Person => ({ id, name: id.toUpperCase(), color: '#888888', active });

const baseSettings: Settings = {
  quirofanoEnabled: false,
  quirofanoOrder: [],
  autoHolidays: false,
  customHolidays: [],
  countFrom: null,
};
const noHolidays: HolidayLookup = () => undefined;
const noQuirofano: Quirofano = {};

const BAD_COUNT = BAD_CATEGORIES.length;

const toScore = (raw: Float64Array): Score => ({
  bad: Array.from(raw.slice(0, BAD_COUNT)),
  fair: at(raw, BAD_COUNT),
  pre: 0,
  spacing: at(raw, BAD_COUNT + 1),
});

type QuirofanoMode = 'off' | 'all' | 'some';
type Config = { quirofano: QuirofanoMode; holidays: boolean; countFrom: boolean };

type Instance = {
  active: Person[];
  shifts: Shifts;
  quirofano: Quirofano;
  settings: Settings;
  holiday: HolidayLookup;
  free: string[];
  config: Config;
};

const randomConfig = (rand: Rng): Config => ({
  quirofano: pick<QuirofanoMode>(rand, ['off', 'all', 'some']),
  holidays: rand() < 0.5,
  countFrom: rand() < 0.3,
});

const makeInstance = (rand: Rng, groupSize: number, config: Config): Instance => {
  const active = Array.from({ length: groupSize }, (_, i) => person(`p${i}`));
  const span = 35;
  const start = addDaysTo('2026-09-01', int(rand, 28));
  const shifts: Shifts = {};
  const free: string[] = [];
  for (let day = 0; day < span; day++) {
    const date = addDaysTo(start, day);
    const roll = rand();
    if (roll < 0.1) continue;
    if (roll < 0.4) {
      shifts[date] = pick(rand, active).id;
    } else {
      shifts[date] = null;
      free.push(date);
    }
  }
  if (free.length === 0) {
    shifts[start] = null;
    free.push(start);
  }

  const holidayDates = new Set<string>();
  if (config.holidays) {
    for (let i = 0; i < 3; i++) holidayDates.add(addDaysTo(start, int(rand, span)));
  }
  const holiday: HolidayLookup = (date) => (holidayDates.has(date) ? 'Feriado' : undefined);

  const quirofano: Quirofano = {};
  if (config.quirofano !== 'off') {
    const weeks = new Set<string>();
    for (let day = 0; day < span; day++) weeks.add(mondayOf(addDaysTo(start, day)));
    for (const week of weeks) {
      if (config.quirofano === 'all' || rand() < 0.5) quirofano[week] = pick(rand, active).id;
    }
  }

  const settings: Settings = {
    ...baseSettings,
    quirofanoEnabled: config.quirofano !== 'off',
    countFrom: config.countFrom ? addDaysTo(start, int(rand, 15)) : null,
  };
  return { active, shifts, quirofano, settings, holiday, free, config };
};

const compile = (inst: Instance) =>
  createSearch(inst.active, inst.shifts, inst.quirofano, inst.settings, inst.holiday, inst.free);

const randomAssignment = (rand: Rng, size: number, groupSize: number): number[] =>
  Array.from({ length: size }, () => int(rand, groupSize));

const fullCalendar = (inst: Instance, assignment: number[]): Shifts => {
  const full: Shifts = { ...inst.shifts };
  inst.free.forEach((date, i) => {
    full[date] = at(inst.active, at(assignment, i)).id;
  });
  return full;
};

describe('createSearch', () => {
  it('size es la cantidad de fechas a repartir', () => {
    const inst = makeInstance(mulberry32(5), 3, { quirofano: 'off', holidays: false, countFrom: false });
    expect(compile(inst).size).toBe(inst.free.length);
  });

  describe.each([3, 4])('scoreOf con un grupo de %i activos', (groupSize) => {
    it('da lo mismo que scoreShifts del calendario completo: cosas malas exactas, parejo y espaciado casi iguales', () => {
      const rand = mulberry32(1000 + groupSize);
      const seen = BAD_CATEGORIES.map(() => false);
      for (let n = 0; n < 200; n++) {
        const inst = makeInstance(rand, groupSize, randomConfig(rand));
        const search = compile(inst);
        for (let round = 0; round < 3; round++) {
          const assignment = randomAssignment(rand, inst.free.length, groupSize);
          const label = `caso ${n} ronda ${round} ${JSON.stringify(inst.config)}`;
          const expected = scoreShifts(
            inst.active,
            fullCalendar(inst, assignment),
            inst.quirofano,
            inst.settings,
            inst.holiday,
          );
          const actual = search.scoreOf(assignment);
          expect(actual.length, label).toBe(BAD_COUNT + 2);
          expect(Array.from(actual.slice(0, BAD_COUNT)), label).toEqual(expected.bad);
          expect(at(actual, BAD_COUNT), label).toBeCloseTo(expected.fair + PRE_QUIROFANO_BONUS * expected.pre, 6);
          expect(at(actual, BAD_COUNT + 1), label).toBeCloseTo(expected.spacing, 6);
          expected.bad.forEach((count, i) => {
            if (count > 0) seen[i] = true;
          });
        }
      }
      expect(seen.every(Boolean), 'cada cosa mala aparece en algún caso').toBe(true);
    });
  });
});

describe('optimize', () => {
  const ITERATIONS = 150;

  const instances = (count: number, seed: number) => {
    const rand = mulberry32(seed);
    return Array.from({ length: count }, (_, i) => {
      const groupSize = i % 2 === 0 ? 3 : 4;
      const inst = makeInstance(rand, groupSize, randomConfig(rand));
      return { inst, groupSize, search: compile(inst), initial: randomAssignment(rand, inst.free.length, groupSize) };
    });
  };

  it('nunca devuelve un reparto peor que el inicial', () => {
    for (const [n, { inst, search, initial }] of instances(16, 11).entries()) {
      const before = toScore(search.scoreOf(initial));
      const result = search.optimize(initial, ITERATIONS, 1);
      const after = toScore(search.scoreOf(result));
      expect(compareScores(after, before), `caso ${n} ${JSON.stringify(inst.config)}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('con la misma semilla devuelve exactamente lo mismo', () => {
    for (const [n, { search, initial }] of instances(8, 12).entries()) {
      const first = Array.from(search.optimize(initial, ITERATIONS, 42));
      const second = Array.from(search.optimize(initial, ITERATIONS, 42));
      expect(second, `caso ${n}`).toEqual(first);
    }
  });

  it('devuelve un índice de persona activa para cada fecha', () => {
    for (const [n, { groupSize, search, initial }] of instances(10, 13).entries()) {
      const result = Array.from(search.optimize(initial, ITERATIONS, 3));
      expect(result.length, `caso ${n}`).toBe(initial.length);
      for (const index of result) {
        expect(Number.isInteger(index), `caso ${n}`).toBe(true);
        expect(index, `caso ${n}`).toBeGreaterThanOrEqual(0);
        expect(index, `caso ${n}`).toBeLessThan(groupSize);
      }
    }
  });

  it('encuentra un reparto mejor cuando parte de uno pésimo (todo para la misma persona)', () => {
    const active = [person('p0'), person('p1'), person('p2'), person('p3')];
    const free = Array.from({ length: 12 }, (_, i) => addDaysTo('2026-10-12', i));
    const shifts: Shifts = Object.fromEntries(free.map((date) => [date, null]));
    const search = createSearch(active, shifts, noQuirofano, baseSettings, noHolidays, free);
    const allToOne = free.map(() => 0);
    const before = toScore(search.scoreOf(allToOne));
    const result = search.optimize(allToOne, 1000, 7);
    const after = toScore(search.scoreOf(result));
    expect(compareScores(after, before)).toBeGreaterThan(0);
  });
});

describe('suggestAssignments', () => {
  const active = [person('p0'), person('p1'), person('p2'), person('p3')];
  const activeIds = active.map((p) => p.id);
  const people = [...active, person('x', false)];

  type Plan = { shifts: Shifts; dates: string[]; unassigned: string[]; fixed: string[]; outsideUnassigned: string[] };

  const makePlan = (rand: Rng): Plan => {
    const start = addDaysTo('2026-10-01', int(rand, 20));
    const shifts: Shifts = {};
    const all = Array.from({ length: 21 }, (_, i) => addDaysTo(start, i));
    for (const date of all) shifts[date] = rand() < 0.25 ? pick(rand, active).id : null;
    const dates = all.slice(0, 14);
    return {
      shifts,
      dates,
      unassigned: dates.filter((date) => shifts[date] === null),
      fixed: all.filter((date) => shifts[date] !== null),
      outsideUnassigned: all.slice(14).filter((date) => shifts[date] === null),
    };
  };

  const plans = (count: number, seed: number): Plan[] => {
    const rand = mulberry32(seed);
    return Array.from({ length: count }, () => makePlan(rand));
  };

  const suggest = (plan: Plan, movable?: string[]): Record<string, string> =>
    suggestAssignments(plan.dates, people, plan.shifts, noQuirofano, baseSettings, noHolidays, movable);

  it('propone a una persona activa para cada fecha sin asignar de dates', () => {
    for (const [n, plan] of plans(8, 21).entries()) {
      const result = suggest(plan);
      for (const date of plan.unassigned) {
        expect(activeIds, `plan ${n} ${date}`).toContain(result[date]);
      }
    }
  });

  it('nunca propone fechas fuera de dates (sin movable)', () => {
    for (const [n, plan] of plans(8, 22).entries()) {
      for (const date of Object.keys(suggest(plan))) expect(plan.dates, `plan ${n}`).toContain(date);
    }
  });

  it('sin movable no cambia las guardias ya asignadas de dates', () => {
    for (const [n, plan] of plans(8, 26).entries()) {
      const result = suggest(plan);
      for (const date of plan.dates) {
        const current = plan.shifts[date];
        if (current !== null) expect(result[date] ?? current, `plan ${n} ${date}`).toBe(current);
      }
    }
  });

  it('con movable propone solo para fechas sin asignar de dates o de movable, y para todas las primeras', () => {
    for (const [n, plan] of plans(8, 23).entries()) {
      const result = suggest(plan, plan.fixed);
      const allowed = new Set([...plan.unassigned, ...plan.fixed]);
      for (const date of Object.keys(result)) expect(allowed.has(date), `plan ${n} ${date}`).toBe(true);
      for (const date of plan.unassigned) expect(Object.keys(result), `plan ${n}`).toContain(date);
      for (const date of plan.outsideUnassigned) expect(Object.keys(result), `plan ${n}`).not.toContain(date);
    }
  });

  it('de movable (fuera de dates) devuelve solo lo que cambia', () => {
    for (const [n, plan] of plans(10, 24).entries()) {
      const movable = plan.fixed.filter((date) => !plan.dates.includes(date));
      const result = suggest(plan, movable);
      for (const date of movable) {
        if (date in result) expect(result[date], `plan ${n} ${date}`).not.toBe(plan.shifts[date]);
      }
    }
  });

  it('con movable reacomoda guardias ya cargadas cuando el reparto actual es pésimo', () => {
    const dates = Array.from({ length: 10 }, (_, i) => addDaysTo('2026-10-12', i));
    const shifts: Shifts = Object.fromEntries(dates.map((date) => [date, 'p0']));
    const [hole] = dates;
    if (hole === undefined) throw new Error('sin fechas');
    shifts[hole] = null;
    const movable = dates.filter((date) => date !== hole);

    const result = suggestAssignments(dates, people, shifts, noQuirofano, baseSettings, noHolidays, movable);
    const merged: Shifts = { ...shifts, ...result };
    const untouched: Shifts = { ...shifts, [hole]: 'p0' };

    expect(movable.some((date) => date in result)).toBe(true);
    expect(
      compareScores(
        scoreShifts(active, merged, noQuirofano, baseSettings, noHolidays),
        scoreShifts(active, untouched, noQuirofano, baseSettings, noHolidays),
      ),
    ).toBeGreaterThan(0);
  });

  it('sin fechas sin asignar ni movable no cambia ninguna guardia', () => {
    const dates = Array.from({ length: 5 }, (_, i) => addDaysTo('2026-10-12', i));
    const shifts: Shifts = Object.fromEntries(dates.map((date, i) => [date, at(activeIds, i % 4)]));
    const result = suggestAssignments(dates, people, shifts, noQuirofano, baseSettings, noHolidays);
    expect({ ...shifts, ...result }).toEqual(shifts);
  });

  it('queda al menos tan bien como llenar las mismas fechas por turnos (round-robin)', () => {
    for (const [n, plan] of plans(12, 25).entries()) {
      if (plan.unassigned.length === 0) continue;
      const proposed: Shifts = { ...plan.shifts, ...suggest(plan) };
      const naive: Shifts = { ...plan.shifts };
      plan.unassigned.forEach((date, i) => {
        naive[date] = at(activeIds, i % activeIds.length);
      });
      const diff = compareScores(
        scoreShifts(active, proposed, noQuirofano, baseSettings, noHolidays),
        scoreShifts(active, naive, noQuirofano, baseSettings, noHolidays),
      );
      expect(diff, `plan ${n}`).toBeGreaterThanOrEqual(0);
    }
  });
});
