import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useMemo, useState } from 'react'
import { addDaysTo, isoOf, mondayOf } from '../dates'
import { contrastText, useQuirofano } from '../hooks'
import { useStore } from '../store'
import { curvaDefault, missingTaskWeeks } from '../tasks'
import type { Person, TaskKind } from '../types'
import Icon from './Icon'

const KINDS: { kind: TaskKind; label: string }[] = [
  { kind: 'curva', label: 'Curva' },
  { kind: 'campo', label: 'Campo' },
]
const PAGE = 12
const fmt = (week: string) => `${format(parseISO(week), 'd MMM', { locale: es })} – ${format(parseISO(addDaysTo(week, 6)), 'd MMM', { locale: es })}`

function Chip({ person, onRemove }: { person: Person | undefined; onRemove: () => void }) {
  return (
    <span
      className="badge badge-lg gap-1 border-0 pr-1"
      style={person && { background: person.color, color: contrastText(person.color) }}
    >
      {person?.name ?? '¿?'}
      <button className="btn btn-ghost btn-xs btn-circle size-5 min-h-0 p-0" aria-label={`Quitar a ${person?.name ?? 'esta persona'}`} onClick={onRemove}>
        <Icon name="close" className="size-3" />
      </button>
    </span>
  )
}

export default function TasksView() {
  const { people, tasks, addTask, removeTask } = useStore()
  const today = isoOf(new Date())
  const thisWeek = mondayOf(today)
  const [shown, setShown] = useState(PAGE)

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const active = people.filter((p) => p.active)

  const first = useMemo(() => Object.values(tasks).map((t) => t.week).sort()[0] ?? thisWeek, [tasks, thisWeek])
  // de la semana que viene hacia atrás, hasta la primera cargada
  const weeks = useMemo(() => {
    const all: string[] = []
    for (let w = addDaysTo(thisWeek, 7); w >= first || all.length < 4; w = addDaysTo(w, -7)) all.push(w)
    return all
  }, [first, thisWeek])
  const visible = weeks.slice(0, shown)

  const quirofano = useQuirofano(useMemo(() => [...weeks, addDaysTo(weeks[weeks.length - 1], -7)], [weeks]))
  const missing = useMemo(
    () => Object.fromEntries(KINDS.map(({ kind }) => [kind, new Set(missingTaskWeeks(tasks, kind, today))])),
    [tasks, today],
  ) as Record<TaskKind, Set<string>>

  const remove = (id: string) => {
    const t = tasks[id]
    if (confirm(`¿Quitar ${t.kind === 'curva' ? 'la Curva' : 'el Campo'} de ${peopleById.get(t.personId)?.name ?? 'esta persona'}?`)) removeTask(id)
  }

  const totalMissing = KINDS.reduce((n, { kind }) => n + missing[kind].size, 0)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-base-content/60">
        Curva y Campo van todas las semanas, a veces más de una vez. No cuentan en la justicia ni en las recomendaciones.
        {totalMissing > 0 && <span className="ml-1 font-medium text-warning">Faltan {totalMissing} semana{totalMissing === 1 ? '' : 's'} (resaltadas).</span>}
      </p>
      <ul className="flex flex-col gap-2">
        {visible.map((week) => {
          const q = peopleById.get(quirofano[week])
          return (
            <li key={week} className="card card-border bg-base-100 p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">
                  {fmt(week)}
                  {week === thisWeek && <span className="badge badge-primary badge-sm ml-2">Esta semana</span>}
                </span>
                {q && <span className="text-xs text-base-content/60">Quirófano: {q.name}</span>}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {KINDS.map(({ kind, label }) => {
                  const entries = Object.entries(tasks).filter(([, t]) => t.kind === kind && t.week === week)
                  const isMissing = missing[kind].has(week)
                  const preset = kind === 'curva' ? curvaDefault(quirofano, week) : null
                  const presetPerson = preset ? peopleById.get(preset) : undefined
                  return (
                    <div
                      key={kind}
                      className={`rounded-lg border p-2 ${isMissing ? 'border-warning bg-warning/15' : 'border-base-300'}`}
                      data-missing={isMissing || undefined}
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-base-content/60">
                        {label}
                        {isMissing && (
                          <span className="badge badge-warning badge-sm normal-case">
                            <Icon name="warning" className="mr-1 size-3" />
                            Falta
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {entries.map(([id, t]) => (
                          <Chip key={id} person={peopleById.get(t.personId)} onRemove={() => remove(id)} />
                        ))}
                        {presetPerson?.active && !entries.some(([, t]) => t.personId === presetPerson.id) && (
                          <button className="btn btn-sm btn-outline" onClick={() => addTask(kind, week, presetPerson.id)}>
                            + {presetPerson.name}
                          </button>
                        )}
                        <select
                          className="select select-sm w-auto max-w-40"
                          aria-label={`Agregar ${label} de la semana del ${fmt(week)}`}
                          value=""
                          onChange={(e) => e.target.value && addTask(kind, week, e.target.value)}
                        >
                          <option value="">{presetPerson?.active ? 'Otra persona…' : 'Agregar…'}</option>
                          {active.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>
      {shown < weeks.length && (
        <button className="btn btn-ghost btn-sm self-center" onClick={() => setShown(shown + PAGE)}>
          Ver semanas anteriores
        </button>
      )}
    </div>
  )
}
