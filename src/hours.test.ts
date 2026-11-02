import { describe, expect, it } from 'vitest'
import { defaultSettings } from './data'
import { extraHours, extraHoursByPerson, minutesOf, shiftSpan, withAdvance, withExtension } from './hours'
import type { Extensions, Shifts } from './types'

const people = ['ana', 'flor', 'sol'].map((id) => ({ id, name: id, color: '#fff', active: true }))

describe('horas extra', () => {
  it('son lo que la extensión pasa de las 8:30', () => {
    expect(extraHours('2026-11-06', { extensions: { '2026-11-06': '12:00' }, advances: {} })).toBe(3.5)
    expect(extraHours('2026-11-05', { extensions: { '2026-11-06': '12:00' }, advances: {} })).toBe(0)
  })

  it('se suman por la persona asignada a cada guardia extendida; las sin asignar no cuentan', () => {
    const shifts: Shifts = { '2026-11-06': 'ana', '2026-11-13': 'ana', '2026-11-07': 'flor', '2026-11-14': null }
    const ext: Extensions = { '2026-11-06': '12:00', '2026-11-13': '09:30', '2026-11-07': '10:30', '2026-11-14': '12:00' }
    expect(extraHoursByPerson(people, shifts, { extensions: ext, advances: {} }, defaultSettings)).toEqual({ ana: 4.5, flor: 2, sol: 0 })
  })

  it('respetan "contar desde"', () => {
    const shifts: Shifts = { '2026-10-30': 'ana', '2026-11-06': 'ana', '2026-11-13': 'flor' }
    const ext: Extensions = { '2026-10-30': '12:00', '2026-11-06': '12:00', '2026-11-13': '12:00' }
    const settings = { ...defaultSettings, countFrom: '2026-11-01' }
    expect(extraHoursByPerson(people, shifts, { extensions: ext, advances: {} }, settings)).toEqual({ ana: 3.5, flor: 3.5, sol: 0 })
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

  it('las horas extra de cada persona suman extensiones y adelantos', () => {
    const shifts: Shifts = { '2026-11-06': 'ana', '2026-11-08': 'flor', '2026-11-09': 'sol' }
    const both = { extensions: { '2026-11-06': '12:00' }, advances: { '2026-11-09': '18:00' } }
    expect(extraHoursByPerson(people, shifts, both, defaultSettings)).toEqual({ ana: 3.5, flor: 0, sol: 14.5 })
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
