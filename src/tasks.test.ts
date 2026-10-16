import { describe, expect, it } from 'vitest'
import { curvaDefault, taskGaps, taskWeekdays } from './tasks'
import type { TaskDays, Tasks } from './types'

const t = (kind: 'curva' | 'campo', date: string, personId = 'ana') => ({ kind, date, personId })

const RANGE = ['2026-09-01', '2026-12-01'] as const
const gaps = (tasks: Tasks, taskDays: TaskDays, kind: 'curva' | 'campo', today: string, [from, to]: readonly [string, string] = RANGE) =>
  taskGaps(tasks, taskDays, kind, today, from, to)

describe('taskWeekdays', () => {
  const days: TaskDays = { 'curva:2026-09': [1], 'curva:2026-11': [2, 4], 'campo:2026-10': [] }

  it('un mes sin configurar hereda del último mes configurado hacia atrás', () => {
    expect(taskWeekdays(days, 'curva', '2026-09')).toEqual([1])
    expect(taskWeekdays(days, 'curva', '2026-10')).toEqual([1])
    expect(taskWeekdays(days, 'curva', '2026-11')).toEqual([2, 4])
    expect(taskWeekdays(days, 'curva', '2027-03')).toEqual([2, 4])
  })

  it('antes del primer mes configurado, o sin nada, no hay días', () => {
    expect(taskWeekdays(days, 'curva', '2026-08')).toEqual([])
    expect(taskWeekdays({}, 'curva', '2026-10')).toEqual([])
  })

  it('una configuración vacía es explícita: corta la herencia', () => {
    expect(taskWeekdays({ 'campo:2026-09': [3], ...days }, 'campo', '2026-11')).toEqual([])
  })

  it('cada tarea tiene los suyos', () => {
    expect(taskWeekdays(days, 'campo', '2026-09')).toEqual([])
  })
})

describe('taskGaps sin días fijos', () => {
  it('lista los lunes de las semanas terminadas sin anotación, desde la primera anotada', () => {
    const tasks: Tasks = { a: t('curva', '2026-09-23'), b: t('curva', '2026-10-13') }
    // hoy es viernes 16: la semana del 12 sigue en curso
    expect(gaps(tasks, {}, 'curva', '2026-10-16').missing).toEqual(['2026-09-28', '2026-10-05'])
  })

  it('varias anotaciones en una semana no la vuelven faltante, y el día de la semana da igual', () => {
    const tasks: Tasks = { a: t('campo', '2026-10-05'), b: t('campo', '2026-10-11', 'beto'), c: t('campo', '2026-10-08') }
    expect(gaps(tasks, {}, 'campo', '2026-10-16').missing).toEqual([])
  })

  it('cada tarea se mira por separado', () => {
    const tasks: Tasks = { a: t('curva', '2026-10-01'), b: t('curva', '2026-10-12'), c: t('campo', '2026-10-12') }
    expect(gaps(tasks, {}, 'curva', '2026-10-26').missing).toEqual(['2026-10-05', '2026-10-19'])
    expect(gaps(tasks, {}, 'campo', '2026-10-26').missing).toEqual(['2026-10-19'])
  })

  it('sin anotaciones de esa tarea no marca nada, ni las semanas anteriores a la primera', () => {
    expect(gaps({}, {}, 'curva', '2026-10-16')).toEqual({ missing: [], pending: [] })
    expect(gaps({ a: t('campo', '2026-10-05') }, {}, 'curva', '2026-10-16').missing).toEqual([])
  })

  it('la semana en curso no falta hasta que pasa su domingo, y las futuras tampoco', () => {
    const tasks: Tasks = { a: t('curva', '2026-10-05') }
    expect(gaps(tasks, {}, 'curva', '2026-10-12').missing).toEqual([])
    expect(gaps(tasks, {}, 'curva', '2026-10-18').missing).toEqual([])
    expect(gaps(tasks, {}, 'curva', '2026-10-19').missing).toEqual(['2026-10-12'])
    expect(gaps({ a: t('curva', '2026-11-02') }, {}, 'curva', '2026-10-16').missing).toEqual([])
  })

  it('nunca hay pendientes: no se sabe qué día toca', () => {
    expect(gaps({ a: t('curva', '2026-10-05') }, {}, 'curva', '2026-10-16').pending).toEqual([])
  })
})

describe('taskGaps con días fijos', () => {
  // martes = 2, jueves = 4. Hoy: viernes 16/10/2026.
  const tue: TaskDays = { 'curva:2026-10': [2] }
  const today = '2026-10-16'

  it('falta el día que tocaba y ya pasó; los que vienen quedan pendientes', () => {
    const tasks: Tasks = { a: t('curva', '2026-10-06') }
    expect(gaps(tasks, tue, 'curva', today, ['2026-10-01', '2026-11-01'])).toEqual({
      missing: ['2026-10-13'],
      pending: ['2026-10-20', '2026-10-27'],
    })
  })

  it('hacerla otro día de la semana cuenta: esa semana no falta', () => {
    const tasks: Tasks = { a: t('curva', '2026-10-06'), b: t('curva', '2026-10-14') }
    expect(gaps(tasks, tue, 'curva', today).missing).toEqual([])
  })

  it('con dos días por semana, falta el que no tiene anotación', () => {
    const days: TaskDays = { 'curva:2026-10': [2, 4] }
    const tasks: Tasks = { a: t('curva', '2026-10-06'), b: t('curva', '2026-10-08'), c: t('curva', '2026-10-13') }
    expect(gaps(tasks, days, 'curva', today).missing).toEqual(['2026-10-15'])
    expect(gaps(tasks, days, 'curva', '2026-10-14', ['2026-10-01', '2026-11-01'])).toEqual({
      missing: [],
      pending: ['2026-10-15', '2026-10-20', '2026-10-22', '2026-10-27', '2026-10-29'],
    })
  })

  it('se cuenta por cantidad: dos anotaciones en la semana cubren dos días, sean cuales sean', () => {
    const days: TaskDays = { 'curva:2026-10': [2, 4] }
    const tasks: Tasks = { a: t('curva', '2026-10-06'), b: t('curva', '2026-10-08'), c: t('curva', '2026-10-13'), d: t('curva', '2026-10-13', 'beto') }
    expect(gaps(tasks, days, 'curva', today).missing).toEqual([])
  })

  it('el día de hoy sin anotación todavía no falta: está pendiente', () => {
    const tasks: Tasks = { a: t('curva', '2026-10-06') }
    const out = gaps(tasks, tue, 'curva', '2026-10-13')
    expect(out.missing).toEqual([])
    expect(out.pending[0]).toBe('2026-10-13')
  })

  it('los días cambian de mes a mes, y la semana que cruza el mes usa el de cada fecha', () => {
    const days: TaskDays = { 'curva:2026-10': [2], 'curva:2026-11': [4] }
    const out = gaps({ a: t('curva', '2026-10-06') }, days, 'curva', today)
    expect(out.pending).toEqual(['2026-10-20', '2026-10-27', '2026-11-05', '2026-11-12', '2026-11-19', '2026-11-26'])
  })

  it('un mes sin configurar hereda los días del anterior', () => {
    const out = gaps({ a: t('curva', '2026-10-06') }, tue, 'curva', today, ['2026-11-01', '2026-11-30'])
    expect(out.pending).toEqual(['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24'])
  })

  it('sin anotaciones todavía muestra lo pendiente pero no marca faltantes del pasado', () => {
    const out = gaps({}, tue, 'curva', today)
    expect(out.missing).toEqual([])
    expect(out.pending[0]).toBe('2026-10-20')
  })

  it('las semanas anteriores a la primera anotación no faltan', () => {
    expect(gaps({ a: t('curva', '2026-10-13') }, tue, 'curva', today).missing).toEqual([])
  })

  it('solo devuelve fechas dentro del rango pedido', () => {
    const tasks: Tasks = { a: t('curva', '2026-09-01'), b: t('curva', '2026-09-08') }
    const out = gaps(tasks, tue, 'curva', today, ['2026-10-12', '2026-10-26'])
    expect(out.missing).toEqual(['2026-10-13'])
    expect(out.pending).toEqual(['2026-10-20'])
  })

  it('cada tarea con sus días', () => {
    const days: TaskDays = { 'curva:2026-10': [2], 'campo:2026-10': [4] }
    expect(gaps({ a: t('campo', '2026-10-01') }, days, 'campo', today, ['2026-10-01', '2026-10-31'])).toEqual({
      missing: ['2026-10-08', '2026-10-15'],
      pending: ['2026-10-22', '2026-10-29'],
    })
  })
})

describe('curvaDefault', () => {
  const quirofano = { '2026-10-05': 'flor', '2026-10-12': 'ana' }

  it('es quien tuvo quirófano la semana anterior a la de la fecha', () => {
    expect(curvaDefault(quirofano, '2026-10-12')).toBe('flor')
    expect(curvaDefault(quirofano, '2026-10-18')).toBe('flor')
    expect(curvaDefault(quirofano, '2026-10-19')).toBe('ana')
  })

  it('es null si la semana anterior no tiene quirofanero', () => {
    expect(curvaDefault(quirofano, '2026-10-07')).toBeNull()
    expect(curvaDefault(quirofano, '2026-10-26')).toBeNull()
  })
})
