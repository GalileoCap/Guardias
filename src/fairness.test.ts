import { describe, expect, it } from 'vitest';
import { addDaysTo } from './dates';
import {
  BAD_CATEGORIES,
  PRE_QUIROFANO_BONUS,
  categoriesOf,
  compareScores,
  evenness,
  expectedQuirofanero,
  rankCandidates,
  rotationOrder,
  scoreShifts,
  suggestQuirofano,
} from './fairness';
import type { Score } from './fairness';
import type { HolidayLookup } from './holidays';
import type { Person, Quirofano, Settings, Shifts } from './types';

const person = (id: string, active = true): Person => ({ id, name: id.toUpperCase(), color: '#888888', active });

const A = person('a');
const B = person('b');
const C = person('c');
const D = person('d');
const inactive = person('x', false);

const settings: Settings = {
  quirofanoEnabled: false,
  quirofanoOrder: [],
  autoHolidays: false,
  customHolidays: [],
  countFrom: null,
};
const noHolidays: HolidayLookup = () => undefined;
const noQuirofano: Quirofano = {};

const MONDAY = '2026-10-12';

const calendar = (start: string, owners: string[], step = 1): Shifts => {
  const shifts: Shifts = {};
  owners.forEach((owner, i) => {
    shifts[addDaysTo(start, i * step)] = owner;
  });
  return shifts;
};

const calendarOn = (dates: string[], owners: string[]): Shifts =>
  Object.fromEntries(dates.map((date, i) => [date, owners[i] ?? null]));

const scoreCalendar = (people: Person[], shifts: Shifts): Score =>
  scoreShifts(people, shifts, noQuirofano, settings, noHolidays);

const score = (over: Partial<Score> = {}): Score => ({ bad: [0, 0, 0], fair: 0.5, pre: 0, spacing: 5, ...over });

const badCount = (s: Score, category: (typeof BAD_CATEGORIES)[number]): number => {
  const index = BAD_CATEGORIES.indexOf(category);
  expect(index).toBeGreaterThanOrEqual(0);
  const value = s.bad[index];
  if (value === undefined) throw new Error(`sin entrada bad para ${category}`);
  return value;
};

describe('evenness', () => {
  it('es 1 cuando todos tienen lo mismo', () => {
    expect(evenness([2, 2, 2])).toBe(1);
  });

  it('es 1 cuando la diferencia es la mínima posible con enteros', () => {
    expect(evenness([2, 3, 2])).toBe(1);
  });

  it('es 0 cuando una sola persona hace todo', () => {
    expect(evenness([0, 0, 6])).toBe(0);
  });

  it('es null sin datos', () => {
    expect(evenness([])).toBeNull();
  });
});

describe('categoriesOf', () => {
  const sorted = (values: string[]) => [...values].sort();

  it('un día de semana común solo suma al total', () => {
    expect(categoriesOf('2026-10-14', noHolidays)).toEqual(['total']);
  });

  it('un sábado suma a total y a saturday', () => {
    expect(sorted(categoriesOf('2026-10-17', noHolidays))).toEqual(['saturday', 'total']);
  });

  it('un domingo suma a total y a sunday', () => {
    expect(sorted(categoriesOf('2026-10-18', noHolidays))).toEqual(['sunday', 'total']);
  });

  it('un día que el lookup marca como feriado suma a holiday', () => {
    const holiday: HolidayLookup = (date) => (date === '2026-10-14' ? 'Feriado' : undefined);
    expect(sorted(categoriesOf('2026-10-14', holiday))).toEqual(['holiday', 'total']);
  });
});

describe('compareScores', () => {
  it('una cosa mala anterior en el orden pesa más que cualquier cosa de las siguientes y que el reparto', () => {
    const fewerFirst = score({ bad: [0, 9, 9], fair: 0, spacing: 0 });
    const moreFirst = score({ bad: [1, 0, 0], fair: 1, spacing: 14 });
    expect(compareScores(fewerFirst, moreFirst)).toBeGreaterThan(0);
  });

  it('con la primera cosa mala empatada decide la siguiente', () => {
    const better = score({ bad: [1, 0, 5] });
    const worse = score({ bad: [1, 1, 0] });
    expect(compareScores(better, worse)).toBeGreaterThan(0);
  });

  it('con las cosas malas empatadas gana el reparto más parejo', () => {
    expect(compareScores(score({ fair: 0.8 }), score({ fair: 0.6 }))).toBeGreaterThan(0);
  });

  it('una guardia bien ubicada alrededor del quirófano suma al reparto', () => {
    const withPre = score({ fair: 0.5, pre: 1 });
    const without = score({ fair: 0.5, pre: 0 });
    expect(compareScores(withPre, without)).toBeGreaterThan(0);
  });

  it('el premio por guardia pre-quirófano se suma al parejo con el valor PRE_QUIROFANO_BONUS', () => {
    const ahead = score({ fair: 0.5 - PRE_QUIROFANO_BONUS, pre: 2 });
    const behind = score({ fair: 0.5, pre: 0 });
    expect(compareScores(ahead, behind)).toBeGreaterThan(0);
  });

  it('con todo lo demás empatado gana el que deja las guardias más separadas', () => {
    expect(compareScores(score({ spacing: 10 }), score({ spacing: 4 }))).toBeGreaterThan(0);
  });

  it('es antisimétrico para cualquier par', () => {
    const scores = [
      score(),
      score({ bad: [1, 0, 0] }),
      score({ bad: [0, 2, 0], fair: 0.9 }),
      score({ fair: 0.2, pre: 3 }),
      score({ spacing: 12 }),
    ];
    for (const a of scores) {
      for (const b of scores) {
        expect(Math.sign(compareScores(a, b)) + Math.sign(compareScores(b, a))).toBeCloseTo(0);
      }
    }
  });

  it('da 0 para puntajes iguales', () => {
    const a = score({ bad: [1, 2, 3], fair: 0.7, pre: 2, spacing: 9 });
    const b = score({ bad: [1, 2, 3], fair: 0.7, pre: 2, spacing: 9 });
    expect(compareScores(a, b) === 0).toBe(true);
  });
});

describe('BAD_CATEGORIES', () => {
  it('prioriza las guardias seguidas sobre los sanguchitos', () => {
    const backToBack = BAD_CATEGORIES.indexOf('backToBack');
    expect(backToBack).toBeGreaterThanOrEqual(0);
    expect(backToBack).toBeLessThan(BAD_CATEGORIES.indexOf('sandwich'));
  });
});

describe('scoreShifts', () => {
  const three = [A, B, C];
  const spread = calendar(MONDAY, [...'abc'.repeat(4)]);

  it('un calendario con guardias seguidas puntúa peor que el mismo reparto sin ellas', () => {
    const clumped = calendar(MONDAY, [...'aabbcc'.repeat(2)]);
    const spreadScore = scoreCalendar(three, spread);
    const clumpedScore = scoreCalendar(three, clumped);
    expect(badCount(spreadScore, 'backToBack')).toBe(0);
    expect(badCount(clumpedScore, 'backToBack')).toBeGreaterThan(0);
    expect(compareScores(spreadScore, clumpedScore)).toBeGreaterThan(0);
  });

  it('un sanguchito (guardia, libre, guardia) puntúa peor que no tenerlo', () => {
    const sandwiched = calendar(MONDAY, [...'abacbc'.repeat(2)]);
    const spreadScore = scoreCalendar(three, spread);
    const sandwichedScore = scoreCalendar(three, sandwiched);
    expect(badCount(sandwichedScore, 'backToBack')).toBe(0);
    expect(badCount(spreadScore, 'sandwich')).toBe(0);
    expect(badCount(sandwichedScore, 'sandwich')).toBeGreaterThan(0);
    expect(compareScores(spreadScore, sandwichedScore)).toBeGreaterThan(0);
  });

  it('una sola guardia seguida pesa más que varios sanguchitos', () => {
    const oneBackToBack = calendar(MONDAY, [...'aabcabcabcab']);
    const manySandwiches = calendar(MONDAY, [...'abacbc'.repeat(2)]);
    expect(compareScores(scoreCalendar(three, manySandwiches), scoreCalendar(three, oneBackToBack))).toBeGreaterThan(0);
  });

  it('con las mismas cosas malas, repartir parejo gana a dárselo todo a una persona', () => {
    const weekdays = ['2026-10-12', '2026-10-15', '2026-10-19', '2026-10-22', '2026-10-26', '2026-10-29'];
    const evenly = calendarOn(weekdays, [...'abcabc']);
    const allToOne = calendarOn(weekdays, [...'aaaaaa']);
    const evenScore = scoreCalendar(three, evenly);
    const oneScore = scoreCalendar(three, allToOne);
    expect(evenScore.bad).toEqual(oneScore.bad);
    expect(compareScores(evenScore, oneScore)).toBeGreaterThan(0);
  });
});

describe('rankCandidates', () => {
  const target = '2026-10-14';
  const shifts: Shifts = {
    '2026-10-08': 'a',
    '2026-10-09': 'd',
    '2026-10-13': 'b',
    [target]: null,
    '2026-10-15': 'c',
  };
  const active = [A, B, C, D];

  it('quien armaría una guardia seguida (ayer o mañana) nunca queda por encima de quien no', () => {
    const order = rankCandidates(target, active, shifts, noQuirofano, settings, noHolidays).map((c) => c.person.id);
    for (const clashing of ['b', 'c']) {
      for (const clear of ['a', 'd']) {
        expect(order.indexOf(clear)).toBeGreaterThanOrEqual(0);
        expect(order.indexOf(clear)).toBeLessThan(order.indexOf(clashing));
      }
    }
  });

  it('devuelve solo a las personas activas', () => {
    const ranked = rankCandidates(target, [...active, inactive], shifts, noQuirofano, settings, noHolidays);
    expect(ranked.map((c) => c.person.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('va de mejor a peor según el puntaje del reparto completo', () => {
    const ranked = rankCandidates(target, active, shifts, noQuirofano, settings, noHolidays);
    for (let i = 1; i < ranked.length; i++) {
      const previous = ranked[i - 1];
      const current = ranked[i];
      if (!previous || !current) throw new Error('falta un candidato');
      expect(compareScores(previous.score, current.score)).toBeGreaterThanOrEqual(0);
    }
  });

  it('el puntaje de cada candidata es el del reparto completo con ese día asignado a ella', () => {
    const ranked = rankCandidates(target, active, shifts, noQuirofano, settings, noHolidays);
    expect(ranked).toHaveLength(active.length);
    for (const candidate of ranked) {
      const full = scoreCalendar(active, { ...shifts, [target]: candidate.person.id });
      expect(candidate.score.bad).toEqual(full.bad);
      expect(candidate.score.fair).toBeCloseTo(full.fair, 9);
      expect(candidate.score.pre).toBeCloseTo(full.pre, 9);
      expect(candidate.score.spacing).toBeCloseTo(full.spacing, 9);
    }
  });
});

describe('rotación del quirófano', () => {
  const people = [A, B, C, D];
  const withOrder = (quirofanoOrder: string[]): Settings => ({ ...settings, quirofanoEnabled: true, quirofanoOrder });

  describe('rotationOrder', () => {
    it('conserva el orden configurado y saca a quienes están inactivos', () => {
      const order = rotationOrder([A, B, C, person('d', false)], withOrder(['c', 'd', 'a']));
      expect(order).toEqual(['c', 'a']);
    });

    it('sin orden configurado usa a todas las activas en el orden de la lista', () => {
      expect(rotationOrder([A, inactive, B, C], withOrder([]))).toEqual(['a', 'b', 'c']);
    });
  });

  describe('expectedQuirofanero', () => {
    const order = ['a', 'b', 'c'];

    it('avanza en la rotación una semana por semana desde la asignada y vuelve al primero', () => {
      const assigned: Quirofano = { '2026-10-05': 'b' };
      expect(expectedQuirofanero('2026-10-12', assigned, order)).toBe('c');
      expect(expectedQuirofanero('2026-10-19', assigned, order)).toBe('a');
    });

    it('retrocede en la rotación para las semanas anteriores a la asignada', () => {
      const assigned: Quirofano = { '2026-10-05': 'b' };
      expect(expectedQuirofanero('2026-09-28', assigned, order)).toBe('a');
      expect(expectedQuirofanero('2026-09-21', assigned, order)).toBe('c');
    });

    it('cuenta desde la semana asignada más cercana', () => {
      const assigned: Quirofano = { '2026-10-05': 'a', '2026-10-26': 'c' };
      expect(expectedQuirofanero('2026-10-19', assigned, order)).toBe('b');
    });

    it('si dos asignadas están a la misma distancia toma la anterior', () => {
      const assigned: Quirofano = { '2026-10-05': 'a', '2026-10-19': 'a' };
      expect(expectedQuirofanero('2026-10-12', assigned, order)).toBe('b');
    });

    it('sin ninguna asignada, semanas seguidas avanzan de a uno en la rotación', () => {
      const weeks = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
      const positions = weeks.map((week) => {
        const expected = expectedQuirofanero(week, noQuirofano, order);
        return expected === null ? -1 : order.indexOf(expected);
      });
      expect(positions.every((p) => p >= 0)).toBe(true);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBe(((positions[i - 1] ?? -1) + 1) % order.length);
      }
    });
  });

  describe('suggestQuirofano', () => {
    it('llena todas las semanas sin asignar siguiendo la rotación y no toca las ya asignadas', () => {
      const weeks = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'];
      const assigned: Quirofano = { '2026-10-05': 'b' };
      const suggested = suggestQuirofano(weeks, people, assigned, withOrder(['a', 'b', 'c']));
      expect({ ...assigned, ...suggested }).toEqual({
        '2026-10-05': 'b',
        '2026-10-12': 'c',
        '2026-10-19': 'a',
        '2026-10-26': 'b',
        '2026-11-02': 'c',
      });
    });

    it('el orden en que se pasan las semanas no cambia lo propuesto', () => {
      const chronological = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
      const shuffled = ['2026-10-19', '2026-10-05', '2026-10-26', '2026-10-12'];
      const config = withOrder(['a', 'b', 'c']);
      expect(suggestQuirofano(shuffled, people, noQuirofano, config)).toEqual(
        suggestQuirofano(chronological, people, noQuirofano, config),
      );
    });

    it('sin orden configurado rota entre las activas en el orden de la lista', () => {
      const weeks = ['2026-10-05', '2026-10-12', '2026-10-19'];
      const assigned: Quirofano = { '2026-10-05': 'a' };
      const suggested = suggestQuirofano(weeks, [A, inactive, C], assigned, withOrder([]));
      expect({ ...assigned, ...suggested }).toEqual({ '2026-10-05': 'a', '2026-10-12': 'c', '2026-10-19': 'a' });
    });
  });
});
