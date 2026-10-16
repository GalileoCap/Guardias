import { describe, expect, it } from 'vitest'
import { curvaDefault, missingTaskWeeks } from './tasks'
import type { Tasks } from './types'

const t = (kind: 'curva' | 'campo', week: string, personId = 'ana') => ({ kind, week, personId })

describe('missingTaskWeeks', () => {
  it('lista las semanas sin entrada entre la primera cargada y la semana de hoy', () => {
    const tasks: Tasks = { a: t('curva', '2026-09-21'), b: t('curva', '2026-10-05') }
    // hoy (viernes 16) cae en la semana del lunes 12
    expect(missingTaskWeeks(tasks, 'curva', '2026-10-16')).toEqual(['2026-09-28', '2026-10-12'])
  })

  it('más de una entrada en la misma semana no la vuelve faltante ni rompe la cuenta', () => {
    const tasks: Tasks = { a: t('campo', '2026-10-05'), b: t('campo', '2026-10-05', 'beto'), c: t('campo', '2026-10-12') }
    expect(missingTaskWeeks(tasks, 'campo', '2026-10-16')).toEqual([])
  })

  it('cada tarea se mira por separado', () => {
    const tasks: Tasks = { a: t('curva', '2026-10-05'), b: t('curva', '2026-10-12'), c: t('campo', '2026-10-12') }
    expect(missingTaskWeeks(tasks, 'curva', '2026-10-16')).toEqual([])
    expect(missingTaskWeeks(tasks, 'campo', '2026-10-16')).toEqual([])
    expect(missingTaskWeeks({ c: t('campo', '2026-10-05') }, 'curva', '2026-10-16')).toEqual([])
  })

  it('sin ninguna entrada de esa tarea no marca nada, y las semanas futuras no faltan todavía', () => {
    expect(missingTaskWeeks({}, 'curva', '2026-10-16')).toEqual([])
    expect(missingTaskWeeks({ a: t('curva', '2026-11-02') }, 'curva', '2026-10-16')).toEqual([])
  })

  it('el lunes y el domingo de la semana en curso cuentan como esa semana', () => {
    const tasks: Tasks = { a: t('curva', '2026-10-05') }
    expect(missingTaskWeeks(tasks, 'curva', '2026-10-12')).toEqual(['2026-10-12'])
    expect(missingTaskWeeks(tasks, 'curva', '2026-10-18')).toEqual(['2026-10-12'])
    expect(missingTaskWeeks(tasks, 'curva', '2026-10-19')).toEqual(['2026-10-12', '2026-10-19'])
  })
})

describe('curvaDefault', () => {
  it('es quien tuvo quirófano la semana anterior', () => {
    expect(curvaDefault({ '2026-10-05': 'flor', '2026-10-12': 'ana' }, '2026-10-12')).toBe('flor')
  })
  it('es null si la semana anterior no tiene quirofanero', () => {
    expect(curvaDefault({ '2026-10-12': 'ana' }, '2026-10-12')).toBeNull()
  })
})
