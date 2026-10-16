import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useMemo, useState } from 'react'
import { addDaysTo, isoOf, mondayOf } from '../dates'
import { taskKey } from '../data'
import { CATEGORIES, categoriesOf, hasIssue, rankCandidates, rotationOrder } from '../fairness'
import { useHolidayLookup, useIgnoreGhostClick, useProblems, useQuirofano } from '../hooks'
import { useStore } from '../store'
import { TASK_KINDS, campoPlan, curvaDefault, taskGaps } from '../tasks'
import type { TaskKind } from '../types'
import Icon from './Icon'

const days = (n: number) => (n === 1 ? '1 día' : `${n} días`)

function nearestLabel(before: number | null, after: number | null) {
  const nearest = Math.min(before ?? Infinity, after ?? Infinity)
  return Number.isFinite(nearest) ? ` · Más cercana: ${days(nearest)}` : ''
}

/**
 * Quién hizo la tarea (Curva o Campo) en el día: una sola persona por tarea y día, o nadie. Elegirla la anota al
 * instante. A la persona que sugiere el orden (para la Curva, quien tuvo quirófano la semana anterior; para el Campo,
 * la que sigue en la rotación del quirófano) se la marca y va primera, pero no se anota sola.
 */
function TaskRow({ kind, label, date }: { kind: TaskKind; label: string; date: string }) {
  const { people, tasks, taskDays, settings, setTask, removeTask } = useStore()
  const [open, setOpen] = useState(false)
  const monday = mondayOf(date)
  const weeks = useMemo(() => [addDaysTo(monday, -7), monday], [monday])
  const quirofano = useQuirofano(weeks)
  const entry = tasks[taskKey(kind, date)]
  // Lo que falta en la semana de este día, y a quién recomendar para el Campo
  const plan = useMemo(() => {
    const today = isoOf(new Date())
    if (kind === 'campo') {
      return campoPlan(tasks, taskDays, today, monday, addDaysTo(monday, 7), rotationOrder(people, settings), quirofano, [date])
    }
    return { ...taskGaps(tasks, taskDays, kind, today, monday, addDaysTo(monday, 7)), suggestions: {} as Record<string, string> }
  }, [tasks, taskDays, kind, date, monday, people, settings, quirofano])
  const suggested = kind === 'curva' ? curvaDefault(quirofano, date) : (plan.suggestions[date] ?? null)
  const suggestedNote = kind === 'curva' ? 'quirófano la semana anterior' : 'recomendada'
  const candidates = people.filter((p) => p.active || p.id === entry?.personId)
  const options = [...candidates.filter((p) => p.id === suggested), ...candidates.filter((p) => p.id !== suggested)]
  const current = entry && people.find((p) => p.id === entry.personId)

  const choose = (personId: string | null) => {
    if (personId) setTask(kind, date, personId)
    else removeTask(kind, date)
    setOpen(false)
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name={kind} />
        <span className="text-sm font-semibold">{label}</span>
        {plan.missing.length > 0 && <span className="badge badge-error badge-soft badge-sm">falta esta semana</span>}
        {plan.pending.includes(date) && <span className="badge badge-ghost badge-sm">toca este día</span>}
      </div>
      <button
        type="button"
        className="btn btn-sm btn-block mt-1 justify-between font-normal"
        style={current && { background: tint(current.color), borderColor: current.color }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current ? current.name : 'sin asignar'}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {current ? (
            <>
              <span className="inline-block size-3 shrink-0 rounded-full" style={{ background: current.color }} />
              <span className="truncate font-medium">{current.name}</span>
            </>
          ) : (
            <span className="text-base-content/60">Sin asignar</span>
          )}
        </span>
        <Icon name={open ? 'up' : 'down'} />
      </button>
      {open && (
        <ul role="listbox" aria-label={label} className="mt-1 flex flex-col gap-1 rounded-box border border-base-300 p-1">
          <li>
            <button
              type="button"
              role="option"
              aria-selected={!entry}
              className="btn btn-ghost btn-sm btn-block justify-start gap-2 font-normal"
              onClick={() => choose(null)}
            >
              <span className="size-3 shrink-0" />
              <span className="flex-1 text-left text-base-content/70">Sin asignar</span>
              {!entry && <Icon name="check" />}
            </button>
          </li>
          {options.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={p.id === entry?.personId}
                className="btn btn-ghost btn-sm btn-block justify-start gap-2 font-normal"
                style={{ background: tint(p.color) }}
                onClick={() => choose(p.id)}
              >
                <span className="inline-block size-3 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate text-left font-medium">{p.name}</span>
                {p.id === suggested && <span className="badge badge-success badge-sm shrink-0">{suggestedNote}</span>}
                {p.id === entry?.personId && <Icon name="check" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Fondo suave con el color de una persona. */
const tint = (color: string) => `color-mix(in oklab, ${color} 18%, transparent)`

export default function DayDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const { people, shifts, settings, setShift, removeShift } = useStore()
  const ghostGuard = useIgnoreGhostClick()
  const quirofano = useQuirofano()
  const holiday = useHolidayLookup()
  const holidayName = holiday(date)
  const problems = useProblems()
  const myProblems = shifts[date] ? problems[date] : undefined
  const exists = date in shifts
  const current = shifts[date] ?? null

  const shown = useMemo(() => {
    const keys = categoriesOf(date, holiday)
    return CATEGORIES.filter((c) => keys.includes(c.key as never))
  }, [date, holiday])
  const isWeekend = [0, 6].includes(parseISO(date).getDay())

  const candidates = useMemo(
    () => rankCandidates(date, people, shifts, quirofano, settings, holiday),
    [date, people, shifts, quirofano, settings, holiday],
  )

  const assign = (personId: string | null) => {
    setShift(date, personId)
    onClose()
  }

  return (
    <dialog className="modal modal-open modal-bottom sm:modal-middle" {...ghostGuard} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <h3 className="text-lg font-bold first-letter:uppercase">{format(parseISO(date), "EEEE d 'de' MMMM", { locale: es })}</h3>
        <div className="mt-1 flex flex-wrap gap-2">
          {holidayName && <span className="badge badge-error badge-soft">{holidayName}</span>}
          {isWeekend && <span className="badge badge-soft">Fin de semana</span>}
          {!exists && <span className="badge badge-ghost">Sin guardia cargada</span>}
        </div>

        {myProblems && (
          <div className="alert alert-warning alert-soft mt-3 py-2 text-sm">
            <ul className="list-inside list-disc">
              {myProblems.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 mb-2 flex items-center gap-2 text-sm text-base-content/70">
          <Icon name="guardia" />
          {candidates.length === 0
            ? 'No hay personas activas.'
            : candidates.every(hasIssue)
              ? 'Ninguna opción es ideal. La primera es la que menos perjudica:'
              : 'A quién asignarle (la primera es la más justa):'}
        </p>
        <ul className="flex flex-col gap-1">
          {candidates.map((c, i) => (
            <li key={c.person.id}>
              <button
                className={`btn btn-block h-auto justify-start gap-3 whitespace-normal py-2 text-left font-normal ${
                  current === c.person.id ? 'btn-primary' : 'btn-ghost border-base-300'
                }`}
                onClick={() => assign(c.person.id)}
              >
                <span className="inline-block size-3 shrink-0 rounded-full" style={{ background: c.person.color }} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                    {c.person.name}
                    {i === 0 &&
                      (hasIssue(c) ? (
                        <span className="badge badge-neutral badge-soft badge-sm">La menos mala</span>
                      ) : (
                        <span className="badge badge-success badge-sm">Recomendada</span>
                      ))}
                    {(c.gaps.before === 1 || c.gaps.after === 1) && (
                      <span className="badge badge-warning badge-sm">{c.gaps.before === 1 ? 'guardia ayer' : 'guardia mañana'}</span>
                    )}
                    {c.newSandwich > 0 && <span className="badge badge-warning badge-sm">sanguchito</span>}
                    {c.around === 'prefer' && <span className="badge badge-info badge-soft badge-sm">cerca de su quirófano</span>}
                    {c.weekend && c.weekend.streaks > 0 && (
                      <span className="badge badge-warning badge-sm">
                        {c.weekend.streaks === 2 ? 'finde entre dos suyos' : 'finde seguido'}
                      </span>
                    )}
                  </span>
                  <span className="text-xs opacity-70">
                    {[
                      ...shown.map((cat) => `${cat.short} ${c.counts[cat.key]}`),
                      ...(isWeekend ? [`Libres ${c.counts.freeWeekends}`, `Seguidos ${c.counts.consecutive}`] : []),
                    ].join(' · ')}
                    {nearestLabel(c.gaps.before, c.gaps.after)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-base-content/50">Los números no cuentan esta fecha.</p>

        <div className="mt-4 border-t border-base-300 pt-3">
          {TASK_KINDS.map((k) => (
            <TaskRow key={k.key} kind={k.key} label={k.label} date={date} />
          ))}
        </div>

        <div className="modal-action flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {exists && (
              <button
                className="btn btn-error btn-soft btn-sm"
                onClick={() => {
                  removeShift(date)
                  onClose()
                }}
              >
                Quitar guardia
              </button>
            )}
            {(!exists || current) && (
              <button className="btn btn-sm" onClick={() => assign(null)}>
                {exists ? 'Dejar sin asignar' : 'Agregar sin asignar'}
              </button>
            )}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  )
}
