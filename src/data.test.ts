import { describe, expect, it } from 'vitest'
import { applyPatch, defaultSettings, diff, emptyData, normalize, removePersonFrom, taskKey } from './data'
import type { AppData } from './types'

const person = (id: string) => ({ id, name: id, color: '#fff', active: true })

const base = (): AppData => ({
  people: [person('flor'), person('ana')],
  shifts: { '2026-10-10': 'flor', '2026-10-16': 'flor', '2026-10-20': 'flor', '2026-10-21': 'ana', '2026-10-22': null },
  quirofano: { '2026-10-05': 'flor', '2026-10-12': 'flor', '2026-10-19': 'flor', '2026-10-26': 'ana' },
  tasks: {},
  taskDays: {},
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
      t1: { kind: 'curva', date: '2026-10-07', personId: 'flor' },
      t2: { kind: 'curva', date: '2026-10-14', personId: 'flor' },
      t3: { kind: 'campo', date: '2026-10-21', personId: 'flor' },
      t4: { kind: 'campo', date: '2026-10-22', personId: 'ana' },
    },
  })

  it('eliminar a una persona conserva las anotaciones pasadas y suelta las de hoy en adelante', () => {
    const d = withTasks()
    d.tasks.t5 = { kind: 'campo', date: '2026-10-16', personId: 'flor' }
    const out = removePersonFrom(d, 'flor', '2026-10-16')
    expect(Object.keys(out.tasks).sort()).toEqual(['t1', 't2', 't4'])
  })

  it('una persona con solo anotaciones pasadas queda como inactiva en la lista', () => {
    const d: AppData = { ...base(), shifts: {}, quirofano: {}, tasks: { t1: { kind: 'campo', date: '2026-10-05', personId: 'flor' } } }
    const out = removePersonFrom(d, 'flor', '2026-10-16')
    expect(out.people.find((p) => p.id === 'flor')?.active).toBe(false)
  })

  it('normalize descarta anotaciones mal formadas y acepta datos viejos sin tareas', () => {
    const ok = { kind: 'curva', date: '2026-10-12', personId: 'ana' }
    const raw = {
      people: [person('ana')],
      shifts: {},
      tasks: {
        ok,
        k: { ...ok, kind: 'otra' },
        d: { ...ok, date: 'x' },
        p: { kind: 'campo', date: '2026-10-12' },
      },
    }
    expect(normalize(raw)!.tasks).toEqual({ [taskKey('curva', '2026-10-12')]: ok })
    expect(normalize({ people: [], shifts: {} })!.tasks).toEqual({})
  })

  it('un parche agrega y borra anotaciones por clave, y descarta las de personas que ya no existen', () => {
    const doc: AppData = { ...emptyData(), people: [person('ana')], tasks: { gone: { kind: 'curva', date: '2026-10-07', personId: 'ana' } } }
    const out = applyPatch(doc, {
      tasks: { set: { n: { kind: 'campo', date: '2026-10-14', personId: 'ana' }, x: { kind: 'campo', date: '2026-10-15', personId: 'nadie' } }, del: ['gone'] },
    })
    expect(Object.keys(out.tasks)).toEqual(['campo:2026-10-14'])
  })

  it('taskKey es una clave por tarea y día', () => {
    expect(taskKey('campo', '2026-10-08')).toBe('campo:2026-10-08')
    expect(taskKey('curva', '2026-10-08')).not.toBe(taskKey('campo', '2026-10-08'))
  })

  it('hay una sola Curva y un solo Campo por día: normalize junta los repetidos y se queda con el último', () => {
    const raw = {
      people: [person('ana'), person('flor')],
      shifts: {},
      tasks: {
        u1: { kind: 'campo', date: '2026-10-08', personId: 'ana' },
        u2: { kind: 'campo', date: '2026-10-08', personId: 'flor' },
        u3: { kind: 'curva', date: '2026-10-08', personId: 'ana' },
        u4: { kind: 'campo', date: '2026-10-15', personId: 'ana' },
      },
    }
    expect(normalize(raw)!.tasks).toEqual({
      'campo:2026-10-08': { kind: 'campo', date: '2026-10-08', personId: 'flor' },
      'curva:2026-10-08': { kind: 'curva', date: '2026-10-08', personId: 'ana' },
      'campo:2026-10-15': { kind: 'campo', date: '2026-10-15', personId: 'ana' },
    })
  })

  it('dos parches sobre la misma tarea y día se reemplazan, no se suman', () => {
    const key = taskKey('curva', '2026-10-08')
    const doc: AppData = { ...emptyData(), people: [person('ana'), person('flor')], tasks: { [key]: { kind: 'curva', date: '2026-10-08', personId: 'ana' } } }
    const out = applyPatch(doc, { tasks: { set: { [key]: { kind: 'curva', date: '2026-10-08', personId: 'flor' } }, del: [] } })
    expect(Object.values(out.tasks)).toEqual([{ kind: 'curva', date: '2026-10-08', personId: 'flor' }])
  })

  it('diff solo manda las anotaciones que cambiaron', () => {
    const a = withTasks()
    expect(diff(a, structuredClone(a))).toBeNull()
    const b = structuredClone(a)
    b.tasks.t1.personId = 'ana'
    delete b.tasks.t2
    expect(diff(a, b)).toEqual({ tasks: { set: { t1: b.tasks.t1 }, del: ['t2'] } })
  })
})

describe('días fijos de Curva y Campo', () => {
  it('normalize conserva los meses bien formados (días únicos y ordenados, vacío incluido) y descarta el resto', () => {
    const raw = {
      people: [],
      shifts: {},
      taskDays: {
        'curva:2026-10': [4, 2, 2],
        'campo:2026-11': [],
        'otra:2026-10': [1],
        'curva:2026-1': [1],
        'campo:2026-10': [7],
        'curva:2026-12': 'lunes',
      },
    }
    expect(normalize(raw)!.taskDays).toEqual({ 'curva:2026-10': [2, 4], 'campo:2026-11': [] })
    expect(normalize({ people: [], shifts: {} })!.taskDays).toEqual({})
  })

  it('un parche cambia solo los meses que trae y puede borrar uno (vuelve a heredar)', () => {
    const doc: AppData = { ...emptyData(), taskDays: { 'curva:2026-10': [2], 'campo:2026-10': [3] } }
    const out = applyPatch(doc, { taskDays: { set: { 'curva:2026-11': [4] }, del: ['campo:2026-10'] } })
    expect(out.taskDays).toEqual({ 'curva:2026-10': [2], 'curva:2026-11': [4] })
  })

  it('diff manda un mes si cambió su lista de días, aunque el largo sea el mismo', () => {
    const a: AppData = { ...emptyData(), taskDays: { 'curva:2026-10': [2], 'campo:2026-10': [3] } }
    expect(diff(a, structuredClone(a))).toBeNull()
    const b = structuredClone(a)
    b.taskDays['curva:2026-10'] = [4]
    expect(diff(a, b)).toEqual({ taskDays: { set: { 'curva:2026-10': [4] }, del: [] } })
  })
})

describe('modo del grupo', () => {
  const normalized = (settings: unknown) => normalize({ people: [], shifts: {}, settings })?.settings
  const modeOf = (settings: unknown) => normalized(settings)?.mode

  it('por defecto es R1', () => {
    expect(defaultSettings.mode).toBe('r1')
    expect(modeOf({})).toBe('r1')
  })

  it('acepta r1 y r2 y descarta cualquier otro valor', () => {
    expect(modeOf({ mode: 'r2' })).toBe('r2')
    expect(modeOf({ mode: 'r1' })).toBe('r1')
    expect(modeOf({ mode: 'r3' })).toBe('r1')
    expect(modeOf({ mode: true })).toBe('r1')
  })

  it('lo guardado con el interruptor viejo del quirófano se migra: apagado es R2, prendido es R1', () => {
    expect(modeOf({ quirofanoEnabled: false })).toBe('r2')
    expect(modeOf({ quirofanoEnabled: true })).toBe('r1')
  })

  it('el modo explícito gana sobre el interruptor viejo y este no queda en los ajustes', () => {
    expect(modeOf({ mode: 'r1', quirofanoEnabled: false })).toBe('r1')
    expect(normalized({ quirofanoEnabled: false })).not.toHaveProperty('quirofanoEnabled')
  })
})
