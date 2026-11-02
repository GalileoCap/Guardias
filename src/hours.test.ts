import { describe, expect, it } from 'vitest'
import { defaultSettings } from './data'
import { extraHours, minutesOf, shiftHoursByPerson, shiftSpan, withAdvance, withExtension } from './hours'
import type { Shifts } from './types'

const people = ['ana', 'flor', 'sol'].map((id) => ({ id, name: id, color: '#fff', active: true }))

describe('horas extra', () => {
  it('son lo que la extensión pasa de las 8:30', () => {
    expect(extraHours('2026-11-06', { extensions: { '2026-11-06': '12:00' }, advances: {} })).toBe(3.5)
    expect(extraHours('2026-11-05', { extensions: { '2026-11-06': '12:00' }, advances: {} })).toBe(0)
  })
})

describe('adelantos', () => {
  // Sábado 7 y domingo 8 de Luli; el lunes 9 de Sofi se adelanta al domingo a las 18
  const relays = { extensions: {}, advances: { '2026-11-09': '18:00' } }
  const holiday = () => undefined

  it('la guardia adelantada arranca el día anterior y la anterior termina a esa hora', () => {
    expect(shiftSpan('2026-11-09', relays, holiday)).toEqual({ start: minutesOf('18:00') - 24 * 60, end: 24 * 60 + minutesOf('08:30') })
    expect(shiftSpan('2026-11-08', relays, holiday)).toEqual({ start: minutesOf('08:30'), end: minutesOf('18:00') })
  })

  it('suma desde que arranca hasta las 8:30 del día de la guardia', () => {
    expect(extraHours('2026-11-09', relays)).toBe(14.5)
    expect(extraHours('2026-11-08', relays)).toBe(0)
  })
})

describe('un relevo es extensión o adelanto', () => {
  it('adelantar el domingo borra la extensión del sábado y extender el sábado borra el adelanto del domingo', () => {
    const extended = { extensions: { '2026-11-07': '18:00' }, advances: {} }
    expect(withAdvance(extended, '2026-11-08', '12:00')).toEqual({ extensions: {}, advances: { '2026-11-08': '12:00' } })
    const advanced = { extensions: {}, advances: { '2026-11-08': '12:00' } }
    expect(withExtension(advanced, '2026-11-07', '18:00')).toEqual({ extensions: { '2026-11-07': '18:00' }, advances: {} })
  })

  it('relevos distintos conviven', () => {
    const extended = { extensions: { '2026-11-07': '12:00' }, advances: {} }
    expect(withAdvance(extended, '2026-11-09', '18:00')).toEqual({ extensions: { '2026-11-07': '12:00' }, advances: { '2026-11-09': '18:00' } })
  })
})

describe('horas de guardia', () => {
  const holiday = (date: string) => (date === '2026-11-23' ? 'Día de la Soberanía' : undefined)
  const none = { extensions: {}, advances: {} }

  it('un día hábil son 16,5 h y un sábado, domingo o feriado 24 h; las sin asignar no cuentan', () => {
    const shifts: Shifts = { '2026-11-03': 'ana', '2026-11-07': 'ana', '2026-11-23': 'flor', '2026-11-24': null }
    expect(shiftHoursByPerson(people, shifts, none, defaultSettings, holiday)).toEqual({ ana: 40.5, flor: 24, sol: 0 })
  })

  it('una extensión y un adelanto corren las horas de las dos guardias del relevo', () => {
    // sábado de ana extendido hasta el domingo a las 18; el lunes de sol adelantado al domingo a las 18: flor hace solo de 18 a 18
    const shifts: Shifts = { '2026-11-07': 'ana', '2026-11-08': 'flor', '2026-11-09': 'sol' }
    expect(shiftHoursByPerson(people, shifts, { extensions: { '2026-11-07': '18:00' }, advances: {} }, defaultSettings, holiday)).toEqual({ ana: 33.5, flor: 14.5, sol: 16.5 })
    expect(shiftHoursByPerson(people, shifts, { extensions: {}, advances: { '2026-11-09': '18:00' } }, defaultSettings, holiday)).toEqual({ ana: 24, flor: 9.5, sol: 38.5 })
  })

  it('respetan "contar desde"', () => {
    const shifts: Shifts = { '2026-10-31': 'ana', '2026-11-03': 'ana' }
    expect(shiftHoursByPerson(people, shifts, none, { ...defaultSettings, countFrom: '2026-11-01' }, holiday)).toEqual({ ana: 16.5, flor: 0, sol: 0 })
  })
})
