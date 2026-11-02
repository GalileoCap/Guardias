import { describe, expect, it } from 'vitest'
import { defaultSettings } from './data'
import { extraHours, extraHoursByPerson } from './hours'
import type { Extensions, Shifts } from './types'

const people = ['ana', 'flor', 'sol'].map((id) => ({ id, name: id, color: '#fff', active: true }))

describe('horas extra', () => {
  it('son lo que la extensión pasa de las 8:30', () => {
    expect(extraHours('2026-11-06', { '2026-11-06': '12:00' })).toBe(3.5)
    expect(extraHours('2026-11-05', { '2026-11-06': '12:00' })).toBe(0)
  })

  it('se suman por la persona asignada a cada guardia extendida; las sin asignar no cuentan', () => {
    const shifts: Shifts = { '2026-11-06': 'ana', '2026-11-13': 'ana', '2026-11-07': 'flor', '2026-11-14': null }
    const ext: Extensions = { '2026-11-06': '12:00', '2026-11-13': '09:30', '2026-11-07': '10:30', '2026-11-14': '12:00' }
    expect(extraHoursByPerson(people, shifts, ext, defaultSettings)).toEqual({ ana: 4.5, flor: 2, sol: 0 })
  })

  it('respetan "contar desde"', () => {
    const shifts: Shifts = { '2026-10-30': 'ana', '2026-11-06': 'ana', '2026-11-13': 'flor' }
    const ext: Extensions = { '2026-10-30': '12:00', '2026-11-06': '12:00', '2026-11-13': '12:00' }
    const settings = { ...defaultSettings, countFrom: '2026-11-01' }
    expect(extraHoursByPerson(people, shifts, ext, settings)).toEqual({ ana: 3.5, flor: 3.5, sol: 0 })
  })
})
