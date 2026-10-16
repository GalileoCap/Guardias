import { describe, expect, it } from 'vitest'
import { curvaDefault, missingTaskWeeks } from './tasks'
import type { Tasks } from './types'

const t = (kind: 'curva' | 'campo', date: string, personId = 'ana') => ({ kind, date, personId })

describe('missingTaskWeeks', () => {
  it('lista los lunes de las semanas terminadas sin anotación, desde la primera anotada', () => {
    const tasks: Tasks = { a: t('curva', '2026-09-23'), b: t('curva', '2026-10-13') }
    // hoy es viernes 16: la semana del 12 sigue en curso
    expect(missingTaskWeeks(tasks, 'curva', '2026-10-16')).toEqual(['2026-09-28', '2026-10-05'])
  })

  it('varias anotaciones en una semana no la vuelven faltante, y el día de la semana da igual', () => {
    const tasks: Tasks = { a: t('campo', '2026-10-05'), b: t('campo', '2026-10-11', 'beto'), c: t('campo', '2026-10-08') }
    expect(missingTaskWeeks(tasks, 'campo', '2026-10-16')).toEqual([])
  })

  it('cada tarea se mira por separado', () => {
    const tasks: Tasks = { a: t('curva', '2026-10-01'), b: t('curva', '2026-10-12'), c: t('campo', '2026-10-12') }
    expect(missingTaskWeeks(tasks, 'curva', '2026-10-26')).toEqual(['2026-10-05', '2026-10-19'])
    expect(missingTaskWeeks(tasks, 'campo', '2026-10-26')).toEqual(['2026-10-19'])
  })

  it('sin anotaciones de esa tarea no marca nada, ni las semanas anteriores a la primera', () => {
    expect(missingTaskWeeks({}, 'curva', '2026-10-16')).toEqual([])
    expect(missingTaskWeeks({ a: t('campo', '2026-10-05') }, 'curva', '2026-10-16')).toEqual([])
  })

  it('la semana en curso no falta hasta que pasa su domingo', () => {
    const tasks: Tasks = { a: t('curva', '2026-10-05') }
    expect(missingTaskWeeks(tasks, 'curva', '2026-10-12')).toEqual([])
    expect(missingTaskWeeks(tasks, 'curva', '2026-10-18')).toEqual([])
    expect(missingTaskWeeks(tasks, 'curva', '2026-10-19')).toEqual(['2026-10-12'])
  })

  it('las semanas futuras no faltan', () => {
    expect(missingTaskWeeks({ a: t('curva', '2026-11-02') }, 'curva', '2026-10-16')).toEqual([])
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
