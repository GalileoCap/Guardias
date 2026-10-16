import { describe, expect, it } from 'vitest'
import { applyPatch, defaultSettings, diff, emptyData, normalize, removePersonFrom } from './data'
import type { AppData } from './types'

const person = (id: string) => ({ id, name: id, color: '#fff', active: true })

const base = (): AppData => ({
  people: [person('flor'), person('ana')],
  shifts: { '2026-10-10': 'flor', '2026-10-16': 'flor', '2026-10-20': 'flor', '2026-10-21': 'ana', '2026-10-22': null },
  quirofano: { '2026-10-05': 'flor', '2026-10-12': 'flor', '2026-10-19': 'flor', '2026-10-26': 'ana' },
  tasks: {},
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

describe('tareas (Curva y Campo)', () => {
  const withTasks = (): AppData => ({
    ...base(),
    tasks: {
      t1: { kind: 'curva', week: '2026-10-05', personId: 'flor' },
      t2: { kind: 'curva', week: '2026-10-12', personId: 'flor' },
      t3: { kind: 'campo', week: '2026-10-19', personId: 'flor' },
      t4: { kind: 'campo', week: '2026-10-19', personId: 'ana' },
    },
  })

  it('eliminar a una persona conserva las tareas de semanas terminadas y suelta las demás', () => {
    const out = removePersonFrom(withTasks(), 'flor', '2026-10-16')
    expect(Object.keys(out.tasks).sort()).toEqual(['t1', 't4'])
  })

  it('una persona con solo tareas pasadas queda como inactiva en la lista', () => {
    const d: AppData = { ...base(), shifts: {}, quirofano: {}, tasks: { t1: { kind: 'campo', week: '2026-10-05', personId: 'flor' } } }
    const out = removePersonFrom(d, 'flor', '2026-10-16')
    expect(out.people.find((p) => p.id === 'flor')?.active).toBe(false)
  })

  it('normalize descarta tareas mal formadas y acepta datos viejos sin tareas', () => {
    const raw = {
      people: [person('ana')],
      shifts: {},
      tasks: { ok: { kind: 'curva', week: '2026-10-12', personId: 'ana' }, k: { kind: 'otra', week: '2026-10-12', personId: 'ana' }, w: { kind: 'campo', week: 'x', personId: 'ana' }, p: { kind: 'campo', week: '2026-10-12' } },
    }
    expect(Object.keys(normalize(raw)!.tasks)).toEqual(['ok'])
    expect(normalize({ people: [], shifts: {} })!.tasks).toEqual({})
  })

  it('un parche agrega y borra tareas por clave, y descarta las de personas que ya no existen', () => {
    const doc: AppData = { ...emptyData(), people: [person('ana')], tasks: { gone: { kind: 'curva', week: '2026-10-05', personId: 'ana' } } }
    const out = applyPatch(doc, {
      tasks: { set: { n: { kind: 'campo', week: '2026-10-12', personId: 'ana' }, x: { kind: 'campo', week: '2026-10-12', personId: 'nadie' } }, del: ['gone'] },
    })
    expect(Object.keys(out.tasks)).toEqual(['n'])
  })

  it('diff solo manda las tareas que cambiaron', () => {
    const a = withTasks()
    expect(diff(a, structuredClone(a))).toBeNull()
    const b = structuredClone(a)
    b.tasks.t1.personId = 'ana'
    delete b.tasks.t2
    expect(diff(a, b)?.tasks).toEqual({ set: { t1: b.tasks.t1 }, del: ['t2'] })
  })
})
