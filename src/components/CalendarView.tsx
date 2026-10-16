import esLocale from '@fullcalendar/core/locales/es'
import type { DatesSetArg, DayCellContentArg, EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { addDaysTo, isoOf, mondayOf } from '../dates'
import { hasIssue, rankCandidates, rotationOrder, scoreShifts } from '../fairness'
import { TASK_KINDS, campoPlan, suggestCurva, taskGaps, weeksFromCampoStart } from '../tasks'
import { suggestAssignments } from '../search'
import { contrastText, useHolidayLookup, useProblems, useQuirofano } from '../hooks'
import { useStore } from '../store'
import type { TaskKind } from '../types'
import ApplyDialog, { type Reshuffle } from './ApplyDialog'
import DayDialog from './DayDialog'
import Icon from './Icon'
import QuirofanoDialog from './QuirofanoDialog'
import WeekGutter from './WeekGutter'

type Mode = 'assign' | 'mark'

const iso = isoOf
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// Constantes fuera del componente: si cambian de identidad, FullCalendar re-renderiza todo.
const PLUGINS = [dayGridPlugin, interactionPlugin]
const LOCALES = [esLocale]
const HEADER_TOOLBAR = { left: 'title', center: '', right: 'today prev,next' }
const BUTTON_TEXT = { today: 'Hoy' }
// Las guardias (`order` 0) van arriba en cada celda; Curva y Campo, y los avisos de que faltan, debajo
const EVENT_ORDER = 'order,title'

// El motivo de cada guardia que perjudica va como tooltip del evento
const renderEvent = (arg: EventContentArg) => {
  const { problems, soft, tip, task } = arg.event.extendedProps as {
    problems?: string[]
    soft?: boolean
    tip?: string
    task?: { kind: TaskKind; missing?: boolean; name?: string }
  }
  if (task) {
    // En el teléfono las celdas son angostas: la palabra "Curva" o "Campo" se esconde y queda el ícono
    return (
      <span title={tip} className="block truncate">
        <Icon name={task.kind} className="mr-0.5 size-2.5 -translate-y-px sm:mr-1 sm:size-3" />
        {task.missing && <span className="sm:hidden">!</span>}
        <span className="hidden sm:inline">
          {task.missing && 'Falta '}
          {TASK_KINDS.find((k) => k.key === task.kind)!.label}
        </span>
        {task.name && (
          <>
            <span className="hidden sm:inline"> ·</span> {task.name}
          </>
        )}
      </span>
    )
  }
  const tooltip = tip ?? (problems && [...problems, ...(soft ? ['(Ninguna otra persona lo haría mejor)'] : [])].join('\n'))
  // Aviso fuerte: ícono de advertencia pleno. Si no había mejor opción: el mismo ícono pero tenue, además del borde punteado
  return (
    <span title={tooltip} className="block truncate">
      {problems?.length ? (
        <span className={`hidden sm:inline ${soft ? 'opacity-50' : ''}`}>
          <Icon name="warning" className="mr-1 size-3 -translate-y-px" />
        </span>
      ) : (
        ''
      )}
      {arg.event.title}
    </span>
  )
}

export default function CalendarView({
  highlightId,
  onHighlight,
}: {
  highlightId: string | null
  onHighlight: (id: string | null) => void
}) {
  const { people, shifts, quirofano: manualQuirofano, tasks, taskDays, settings, setShift, setShifts, setTasks, removeShift } = useStore()
  const r1 = settings.mode === 'r1' // quirófano, Curva y Campo solo en R1
  const holiday = useHolidayLookup()
  const [mode, setMode] = useState<Mode>('assign')
  const [openDate, setOpenDate] = useState<string | null>(null)
  const [openWeek, setOpenWeek] = useState<string | null>(null)
  const [range, setRange] = useState<{ start: string; end: string; weeks: string[] } | null>(null)
  // Quirófano de cada semana: lo cargado a mano + lo que corresponde por el orden de rotación (incluye las semanas a la vista)
  // (también las semanas desde donde empieza la cadena de recomendaciones del Campo)
  const quirofanoWeeks = useMemo(() => (range && r1 ? weeksFromCampoStart(tasks, iso(new Date()), range.weeks) : range?.weeks), [range, r1, tasks])
  const quirofano = useQuirofano(quirofanoWeeks)
  const [showSuggestions, setShowSuggestions] = useState(true)
  // Solo en el teléfono: los interruptores quedan plegados para que el calendario aparezca sin scrollear
  const [showOptions, setShowOptions] = useState(false)
  const [showProblems, setShowProblems] = useState(true)
  const problems = useProblems()
  const cardRef = useRef<HTMLDivElement>(null)

  // Días con aviso donde ninguna persona lo haría sin problemas y la asignada es la menos mala: no hay nada mejor que cambiar
  const unavoidable = useMemo(() => {
    const set = new Set<string>()
    for (const date of Object.keys(problems)) {
      const candidates = rankCandidates(date, people, shifts, quirofano, settings, holiday)
      if (candidates.length > 0 && candidates.every(hasIssue) && candidates[0].person.id === shifts[date]) set.add(date)
    }
    return set
  }, [problems, people, shifts, quirofano, settings, holiday])

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const highlighted = highlightId ? peopleById.get(highlightId) : undefined

  // Recomendaciones de guardias siempre a la vista: las sin asignar, de las más pesadas a las más livianas, acomodadas
  // alrededor del quirófano de cada semana. Se recalculan solas con cada cambio.
  const unassignedDates = useMemo(() => Object.entries(shifts).filter(([, p]) => p === null).map(([d]) => d), [shifts])
  const suggestions = useMemo(() => {
    if (!showSuggestions) return {}
    return suggestAssignments(unassignedDates, people, shifts, quirofano, settings, holiday)
  }, [showSuggestions, unassignedDates, shifts, people, quirofano, settings, holiday])

  // Lo que aplica el botón: las recomendaciones del mes que se está viendo
  const inMonth = useMemo(
    () => Object.fromEntries(Object.entries(suggestions).filter(([d]) => range && d >= range.start && d < range.end)),
    [suggestions, range],
  )
  const [reshuffle, setReshuffle] = useState<Reshuffle | null>(null)
  const inVisibleMonth = (date: string) => !!range && date >= range.start && date < range.end

  // Completa las sin asignar. Si reacomodando también las ya cargadas (de hoy en adelante) el mes mejora, antes pregunta.
  const applySuggestions = () => {
    const today = iso(new Date())
    const movable = Object.entries(shifts)
      .filter(([date, personId]) => personId && date >= today && inVisibleMonth(date))
      .map(([date]) => date)
    const full = suggestAssignments(unassignedDates, people, shifts, quirofano, settings, holiday, movable, 3)
    const changes = movable
      .filter((date) => full[date] && full[date] !== shifts[date])
      .map((date) => ({ date, from: peopleById.get(shifts[date]!)!, to: peopleById.get(full[date])! }))
    if (changes.length === 0) {
      setShifts(inMonth)
      return applyTasks()
    }
    const reshuffleInMonth = Object.fromEntries(Object.entries(full).filter(([date]) => inVisibleMonth(date)))
    const score = (assignments: Record<string, string | null>) =>
      scoreShifts(people, { ...shifts, ...assignments }, quirofano, settings, holiday)
    setReshuffle({
      changes,
      fillOnly: inMonth,
      reshuffle: reshuffleInMonth,
      before: score({}),
      afterFill: score(inMonth),
      afterReshuffle: score(reshuffleInMonth),
    })
  }

  // Lo que falta anotar de Curva y de Campo en lo que se ve del calendario, y lo que viene, con la persona recomendada
  // en cada fecha
  const taskGapsByKind = useMemo(() => {
    if (!range || !r1) return []
    const today = iso(new Date())
    const from = range.weeks[0]
    const to = addDaysTo(range.weeks[range.weeks.length - 1], 7)
    const order = rotationOrder(people, settings)
    return TASK_KINDS.map((kind) => {
      if (kind.key === 'campo') return { kind, ...campoPlan(tasks, taskDays, today, from, to, order, quirofano) }
      const gaps = taskGaps(tasks, taskDays, kind.key, today, from, to)
      return { kind, ...gaps, suggestions: suggestCurva([...gaps.missing, ...gaps.pending], quirofano) }
    })
  }, [r1, tasks, taskDays, range, people, settings, quirofano])

  // La Curva y el Campo recomendados de lo que falta y viene en el mes que se ve; van junto con las guardias
  const tasksInMonth = useMemo(
    () =>
      taskGapsByKind.map(({ kind, missing, pending, suggestions }) => ({
        kind: kind.key,
        assignments: Object.fromEntries(
          [...missing, ...pending].filter((d) => inVisibleMonth(d) && suggestions[d]).map((d) => [d, suggestions[d]]),
        ),
      })),
    [taskGapsByKind, range],
  )
  const applyTasks = () => {
    for (const { kind, assignments } of tasksInMonth) if (Object.keys(assignments).length > 0) setTasks(kind, assignments)
  }
  const taskCount = tasksInMonth.reduce((n, t) => n + Object.keys(t.assignments).length, 0)
  const applicableCount = Object.keys(inMonth).length + taskCount

  const events = useMemo<EventInput[]>(() => {
    const emphasis = (personId: string | null | undefined) =>
      highlightId ? [personId === highlightId ? 'highlighted' : 'dimmed'] : []

    const real = Object.entries(shifts)
      .filter(([date]) => !(date in suggestions))
      .map(([date, personId]): EventInput => {
        const person = personId ? peopleById.get(personId) : undefined
        const flagged = showProblems ? problems[date] : undefined
        const soft = unavoidable.has(date)
        return {
          id: date,
          start: date,
          allDay: true,
          title: person ? person.name : 'Sin asignar',
          classNames: [...(person ? [] : ['unassigned']), ...emphasis(personId), ...(flagged ? [soft ? 'problem-soft' : 'problem'] : [])],
          extendedProps: { problems: flagged, soft, order: 0 },
          ...(person && {
            backgroundColor: person.color,
            borderColor: person.color,
            textColor: contrastText(person.color),
          }),
        }
      })
    const ghosts = Object.entries(suggestions).map(([date, personId]): EventInput => {
      const person = peopleById.get(personId)!
      return {
        id: `s-${date}`,
        start: date,
        allDay: true,
        title: `${person.name}?`,
        classNames: ['suggested', ...emphasis(personId)],
        backgroundColor: person.color,
        borderColor: person.color,
        textColor: contrastText(person.color),
        extendedProps: { date, order: 0, tip: `Recomendada: ${person.name}. Tocá el día para elegir a otra persona.` },
      }
    })
    const done = (r1 ? Object.values(tasks) : []).flatMap((t): EventInput[] => {
      const person = peopleById.get(t.personId)
      const index = TASK_KINDS.findIndex((k) => k.key === t.kind)
      if (!person || index < 0) return []
      const { label } = TASK_KINDS[index]
      return [
        {
          start: t.date,
          allDay: true,
          title: `${label} · ${person.name}`,
          classNames: ['task', ...emphasis(t.personId)],
          backgroundColor: `color-mix(in oklab, ${person.color} 22%, white)`,
          borderColor: person.color,
          textColor: 'var(--color-base-content)',
          extendedProps: { date: t.date, isTask: true, order: 1 + index * 2, task: { kind: t.kind, name: person.name }, tip: `${label}: ${person.name}` },
        },
      ]
    })
    // Un día en que toca la tarea y no está anotada: con persona recomendada si la hay, y si no un aviso o un lugar marcado
    const gapEvent = (kind: (typeof TASK_KINDS)[number], index: number, date: string, late: boolean, suggestedId?: string): EventInput => {
      const person = suggestedId ? peopleById.get(suggestedId) : undefined
      const order = 2 + index * 2
      const lateNote = late ? 'Falta anotarla. ' : ''
      if (person) {
        return {
          start: date,
          allDay: true,
          title: `${kind.label} · ${person.name}?`,
          classNames: ['task', 'task-suggested', ...(late ? ['task-late'] : []), ...emphasis(person.id)],
          backgroundColor: `color-mix(in oklab, ${person.color} 22%, white)`,
          borderColor: person.color,
          textColor: 'var(--color-base-content)',
          extendedProps: {
            date,
            isTask: true,
            order,
            task: { kind: kind.key, name: `${person.name}?` },
            tip: `${lateNote}Recomendada para ${kind.label}: ${person.name}, ${kind.key === 'curva' ? 'tuvo quirófano la semana anterior' : 'la siguiente en el orden del quirófano'}. Tocá el día para anotarla.`,
          },
        }
      }
      return {
        start: date,
        allDay: true,
        title: late ? `Falta ${kind.label}` : kind.label,
        classNames: [late ? 'task-missing' : 'task-pending'],
        extendedProps: {
          date,
          isTask: true,
          order,
          task: { kind: kind.key, missing: late },
          tip: `${late ? `Falta anotar la ${kind.label}.` : `Toca ${kind.label} este día.`} Tocá el día para anotarla.`,
        },
      }
    }
    const gaps = taskGapsByKind.flatMap(({ kind, missing, pending, suggestions }, index) => [
      ...missing.map((date) => gapEvent(kind, index, date, true, suggestions[date])),
      ...pending.map((date) => gapEvent(kind, index, date, false, suggestions[date])),
    ])
    return [...real, ...ghosts, ...done, ...gaps]
  }, [shifts, suggestions, r1, tasks, taskGapsByKind, peopleById, highlightId, problems, showProblems, unavoidable])

  // FullCalendar vuelve a dibujar todo si alguna de sus funciones cambia de identidad: las que dependen del estado
  // llaman a la versión más reciente por una ref, y las demás se memorizan.
  const handleDay = (date: string) => {
    if (mode === 'mark') {
      if (date in shifts) removeShift(date)
      else setShift(date, null)
    } else {
      setOpenDate(date)
    }
  }
  const handleDayRef = useRef(handleDay)
  handleDayRef.current = handleDay
  const onDateClick = useCallback((arg: DateClickArg) => handleDayRef.current(arg.dateStr), [])
  const onEventClick = useCallback((arg: EventClickArg) => {
    const { date, isTask } = arg.event.extendedProps
    // Tocar una tarea siempre abre el día: en "Marcar días" no debe quitar ni agregar la guardia de esa fecha
    if (isTask) setOpenDate(date)
    else handleDayRef.current(date ?? arg.event.id)
  }, [])

  const onDatesSet = useCallback((arg: DatesSetArg) => {
    const weeks: string[] = []
    const end = iso(arg.view.activeEnd)
    for (let w = mondayOf(iso(arg.view.activeStart)); w < end; w = addDaysTo(w, 7)) weeks.push(w)
    const next = {
      start: iso(arg.view.currentStart),
      end: iso(arg.view.currentEnd),
      weeks,
    }
    setRange((prev) => (prev && prev.start === next.start && prev.end === next.end ? prev : next))
  }, [])

  const dayCellClassNames = useCallback((arg: DayCellContentArg) => (holiday(iso(arg.date)) ? ['fc-holiday'] : []), [holiday])
  // Como HTML y no como elemento de React: así FullCalendar no arma un portal por cada celda en cada cambio
  const dayCellContent = useCallback(
    (arg: DayCellContentArg) => {
      const name = holiday(iso(arg.date))
      return {
        html:
          '<div class="flex flex-col items-end">' +
          `<span>${escapeHtml(arg.dayNumberText)}</span>` +
          (name ? `<span class="hidden max-w-24 truncate text-[10px] text-error sm:block" title="${escapeHtml(name)}">${escapeHtml(name)}</span>` : '') +
          '</div>',
      }
    },
    [holiday],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="join">
          <button className={`btn btn-sm join-item ${mode === 'assign' ? 'btn-primary' : ''}`} onClick={() => setMode('assign')}>
            Asignar
          </button>
          <button className={`btn btn-sm join-item ${mode === 'mark' ? 'btn-primary' : ''}`} onClick={() => setMode('mark')}>
            <span className="sm:hidden">Marcar días</span>
            <span className="hidden sm:inline">Marcar días de guardia</span>
          </button>
        </div>
        <button
          className={`btn btn-sm btn-ghost ml-auto sm:hidden ${showOptions ? 'btn-active' : ''}`}
          aria-expanded={showOptions}
          onClick={() => setShowOptions((v) => !v)}
        >
          Opciones <Icon name={showOptions ? 'up' : 'down'} />
        </button>
        <div className={`${showOptions ? 'flex' : 'hidden'} w-full flex-col gap-2 sm:flex sm:w-auto sm:flex-row sm:items-center sm:gap-3`}>
          <label className="flex cursor-pointer items-center gap-2 text-sm" title="Marca con un aviso las guardias que empeoran la justicia; al pasar el mouse se ve por qué">
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={showProblems}
              onChange={(e) => setShowProblems(e.target.checked)}
            />
            Marcar las que perjudican
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm" title="Muestra en cada guardia sin asignar a quién recomienda el balance">
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={showSuggestions}
              onChange={(e) => setShowSuggestions(e.target.checked)}
            />
            Mostrar recomendaciones
          </label>
        </div>
        {showSuggestions && (
          <button
            className="btn btn-sm btn-primary w-full sm:ml-auto sm:w-auto"
            disabled={applicableCount === 0 || people.every((p) => !p.active)}
            onClick={applySuggestions}
          >
            Aplicar recomendaciones del mes ({applicableCount})
          </button>
        )}
      </div>

      {/* Altura mínima fija: así aparecer o desaparecer el botón de resaltado no corre el resto de la página */}
      <div className="flex min-h-8 items-center gap-3">
        <span className={`min-w-0 text-sm text-base-content/60 ${highlighted ? 'hidden sm:inline' : ''}`}>
          {mode === 'assign' ? (
            <>
              <span className="sm:hidden">
                {r1 ? 'Tocá un día para asignarlo, o el quirofanero de la izquierda.' : 'Tocá un día para asignarlo.'}
              </span>
              <span className="hidden sm:inline">
                {r1
                  ? 'Tocá un día para asignarlo, o el quirofanero de la izquierda para cambiarlo. '
                  : 'Tocá un día para asignarlo. '}
                Tocá una persona de abajo para resaltar sus guardias.
              </span>
            </>
          ) : (
            'Tocá los días para agregar o quitar guardias.'
          )}
        </span>
        {/* Ancho reservado siempre desde sm: si no, el texto de ayuda cambia de largo de línea al aparecer el botón */}
        <div className="ml-auto flex min-w-0 shrink-0 justify-end sm:w-56">
          {highlighted && (
            <button className="btn btn-sm btn-ghost max-w-full gap-2" onClick={() => onHighlight(null)}>
              <span className="inline-block size-3 shrink-0 rounded-full" style={{ background: highlighted.color }} />
              <span className="truncate">Resaltando a {highlighted.name}</span>
              <Icon name="close" className="size-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/60">
        <span className="flex items-center gap-1">
          <Icon name="guardia" className="size-3.5" />
          Guardia
        </span>
        {r1 && (
          <span className="flex items-center gap-1">
            <Icon name="quirofano" className="size-3.5" />
            Quirófano
          </span>
        )}
        {r1 &&
          TASK_KINDS.map((k) => (
            <span key={k.key} className="flex items-center gap-1">
              <Icon name={k.key} className="size-3.5" />
              {k.label}
            </span>
          ))}
      </div>

      <div ref={cardRef} className={`cal-card card card-border bg-base-100 relative ${r1 ? '' : 'no-gutter'}`}>
        {r1 && (
          <WeekGutter
            containerRef={cardRef}
            assigned={quirofano}
            manual={manualQuirofano}
            peopleById={peopleById}
            highlightId={highlightId}
            onOpen={setOpenWeek}
          />
        )}
        <div className="cal-body">
          <FullCalendar
            plugins={PLUGINS}
            locales={LOCALES}
            locale="es"
            initialView="dayGridMonth"
            headerToolbar={HEADER_TOOLBAR}
            buttonText={BUTTON_TEXT}
            height="auto"
            fixedWeekCount={false}
            dayMaxEvents={false}
            events={events}
            eventContent={renderEvent}
            eventOrder={EVENT_ORDER}
            datesSet={onDatesSet}
            dateClick={onDateClick}
            eventClick={onEventClick}
            dayCellClassNames={dayCellClassNames}
            dayCellContent={dayCellContent}
          />
        </div>
      </div>

      {openDate && <DayDialog date={openDate} onClose={() => setOpenDate(null)} />}
      {reshuffle && (
        <ApplyDialog
          data={reshuffle}
          taskCount={taskCount}
          onClose={() => setReshuffle(null)}
          onFillOnly={() => {
            setShifts(reshuffle.fillOnly)
            applyTasks()
            setReshuffle(null)
          }}
          onReshuffle={() => {
            setShifts(reshuffle.reshuffle)
            applyTasks()
            setReshuffle(null)
          }}
        />
      )}
      {openWeek && r1 && <QuirofanoDialog week={openWeek} onClose={() => setOpenWeek(null)} />}
    </div>
  )
}
