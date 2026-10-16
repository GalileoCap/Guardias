import { describe, expect, it } from 'vitest'
import { defaultSettings } from './data'
import { removePersonFrom } from './data'
import type { AppData } from './types'

const person = (id: string) => ({ id, name: id, color: '#fff', active: true })

const base = (): AppData => ({
  people: [person('flor'), person('ana')],
  shifts: { '2026-10-10': 'flor', '2026-10-16': 'flor', '2026-10-20': 'flor', '2026-10-21': 'ana', '2026-10-22': null },
  quirofano: { '2026-10-05': 'flor', '2026-10-12': 'flor', '2026-10-19': 'flor', '2026-10-26': 'ana' },
  settings: { ...defaultSettings, quirofanoOrder: ['flor', 'ana'] },
})

describe('removePersonFrom', () => {
  it('deja a la persona en las guardias pasadas y des-asigna la de hoy y las futuras', () => {
    const out = removePersonFrom(base(), 'flor', '2026-10-16')
    expect(out.shifts['2026-10-10']).toBe('flor')
    expect(out.shifts['2026-10-16']).toBeNull()
    expect(out.shifts['2026-10-20']).toBeNull()
    expect(out.shifts['2026-10-21']).toBe('ana')
  })

  it('conserva los quirofanismos de semanas terminadas y suelta la semana en curso y las futuras', () => {
    const out = removePersonFrom(base(), 'flor', '2026-10-16')
    expect(out.quirofano['2026-10-05']).toBe('flor')
    // la semana del 12 al 18 incluye hoy: no terminó
    expect(out.quirofano['2026-10-12']).toBeUndefined()
    expect(out.quirofano['2026-10-19']).toBeUndefined()
    expect(out.quirofano['2026-10-26']).toBe('ana')
  })

  it('con historial queda en la lista como inactiva y fuera de la rotación del quirófano', () => {
    const out = removePersonFrom(base(), 'flor', '2026-10-16')
    expect(out.people.find((p) => p.id === 'flor')).toMatchObject({ active: false })
    expect(out.settings.quirofanoOrder).toEqual(['ana'])
  })

  it('sin nada pasado desaparece de la lista', () => {
    const d = base()
    d.shifts = { '2026-10-20': 'flor' }
    d.quirofano = {}
    const out = removePersonFrom(d, 'flor', '2026-10-16')
    expect(out.people.map((p) => p.id)).toEqual(['ana'])
    expect(out.shifts['2026-10-20']).toBeNull()
  })

  it('no toca a las demás personas', () => {
    const out = removePersonFrom(base(), 'flor', '2026-10-16')
    expect(out.people.find((p) => p.id === 'ana')).toEqual(person('ana'))
  })
})
