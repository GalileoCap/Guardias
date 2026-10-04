import esLocale from '@fullcalendar/core/locales/es'
import type { DatesSetArg, EventContentArg, EventInput } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import { addDays, format, startOfWeek } from 'date-fns'
import { useMemo, useRef, useState } from 'react'
import { hasIssue, rankCandidates, suggestAssignments } from '../fairness'
import { contrastText, useHolidayLookup, useProblems, useQuirofano } from '../hooks'
import { useStore } from '../store'
import DayDialog from './DayDialog'
import QuirofanoDialog from './QuirofanoDialog'
import WeekGutter from './WeekGutter'

type Mode = 'assign' | 'mark'

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

// Constantes fuera del componente: si cambian de identidad, FullCalendar re-renderiza todo.
const PLUGINS = [dayGridPlugin, interactionPlugin]
const LOCALES = [esLocale]
const HEADER_TOOLBAR = { left: 'title', center: '', right: 'today prev,next' }
const BUTTON_TEXT = { today: 'Hoy' }

// El motivo de cada guardia que perjudica va como tooltip del evento
const renderEvent = (arg: EventContentArg) => {
  const { problems, soft, tip } = arg.event.extendedProps as { problems?: string[]; soft?: boolean; tip?: string }
  const tooltip = tip ?? (problems && [...problems, ...(soft ? ['(Ninguna otra persona lo haría mejor)'] : [])].join('\n'))
  // Aviso fuerte: ⚠ pleno. Si no había mejor opción: el mismo ícono pero tenue, además del borde punteado
  return (
    <span title={tooltip} className="block truncate">
      {problems?.length ? <span className={`hidden sm:inline ${soft ? 'opacity-50' : ''}`}>⚠ </span> : ''}
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
  const { people, shifts, quirofano: manualQuirofano, settings, setShift, setShifts, removeShift } = useStore()
  const holiday = useHolidayLookup()
  const [mode, setMode] = useState<Mode>('assign')
  const [openDate, setOpenDate] = useState<string | null>(null)
  const [openWeek, setOpenWeek] = useState<string | null>(null)
  const [range, setRange] = useState<{ start: string; end: string; weeks: string[] } | null>(null)
  // Quirófano de cada semana: lo cargado a mano + lo que corresponde por el orden de rotación (incluye las semanas a la vista)
  const quirofano = useQuirofano(range?.weeks)
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
  const suggestions = useMemo(() => {
    if (!showSuggestions) return {}
    const unassigned = Object.entries(shifts).filter(([, p]) => p === null).map(([d]) => d)
    return suggestAssignments(unassigned, people, shifts, quirofano, settings, holiday)
  }, [showSuggestions, shifts, people, quirofano, settings, holiday])

  // Lo que aplica el botón: las recomendaciones del mes que se está viendo
  const inMonth = useMemo(
    () => Object.fromEntries(Object.entries(suggestions).filter(([d]) => range && d >= range.start && d < range.end)),
    [suggestions, range],
  )
  const applicableCount = Object.keys(inMonth).length
  const applySuggestions = () => setShifts(inMonth)

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
          extendedProps: { problems: flagged, soft },
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
        extendedProps: { date, tip: `Recomendada: ${person.name}. Tocá el día para elegir a otra persona.` },
      }
    })
    return [...real, ...ghosts]
  }, [shifts, suggestions, peopleById, highlightId, problems, showProblems, unavoidable])

  const handleDay = (date: string) => {
    if (mode === 'mark') {
      if (date in shifts) removeShift(date)
      else setShift(date, null)
    } else {
      setOpenDate(date)
    }
  }

  const onDatesSet = (arg: DatesSetArg) => {
    const weeks: string[] = []
    for (let w = startOfWeek(arg.view.activeStart, { weekStartsOn: 1 }); w < arg.view.activeEnd; w = addDays(w, 7)) {
      weeks.push(iso(w))
    }
    const next = {
      start: iso(arg.view.currentStart),
      end: iso(arg.view.currentEnd),
      weeks,
    }
    setRange((prev) => (prev && prev.start === next.start && prev.end === next.end ? prev : next))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="join">
          <button className={`btn btn-sm join-item ${mode === 'assign' ? 'btn-primary' : ''}`} onClick={() => setMode('assign')}>
            Asignar
          </button>
          <button className={`btn btn-sm join-item ${mode === 'mark' ? 'btn-primary' : ''}`} onClick={() => setMode('mark')}>
            Marcar días<span className="hidden sm:inline">&nbsp;de guardia</span>
          </button>
        </div>
        <button
          className={`btn btn-sm btn-ghost ml-auto sm:hidden ${showOptions ? 'btn-active' : ''}`}
          aria-expanded={showOptions}
          onClick={() => setShowOptions((v) => !v)}
        >
          Opciones {showOptions ? '▴' : '▾'}
        </button>
        <div className={`${showOptions ? 'flex' : 'hidden'} w-full flex-col gap-2 sm:flex sm:w-auto sm:flex-row sm:items-center sm:gap-3`}>
          <label className="flex cursor-pointer items-center gap-2 text-sm" title="Marca con ⚠ las guardias que empeoran la justicia; al pasar el mouse se ve por qué">
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
              <span className="sm:hidden">Tocá un día para asignarlo, o el quirofanero de la izquierda.</span>
              <span className="hidden sm:inline">
                Tocá un día para asignarlo, o el quirofanero de la izquierda para cambiarlo. Tocá una persona de abajo para resaltar sus guardias.
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
              <span className="truncate">Resaltando a {highlighted.name} ✕</span>
            </button>
          )}
        </div>
      </div>

      <div ref={cardRef} className="cal-card card card-border bg-base-100 relative">
        <WeekGutter
          containerRef={cardRef}
          assigned={quirofano}
          manual={manualQuirofano}
          peopleById={peopleById}
          highlightId={highlightId}
          onOpen={setOpenWeek}
        />
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
            datesSet={onDatesSet}
            dateClick={(arg) => handleDay(arg.dateStr)}
            eventClick={(arg) => handleDay(arg.event.extendedProps.date ?? arg.event.id)}
            dayCellClassNames={(arg) => (holiday(iso(arg.date)) ? ['fc-holiday'] : [])}
            dayCellContent={(arg) => {
              const name = holiday(iso(arg.date))
              return (
                <div className="flex flex-col items-end">
                  <span>{arg.dayNumberText}</span>
                  {name && (
                    <span className="hidden max-w-24 truncate text-[10px] text-error sm:block" title={name}>{name}</span>
                  )}
                </div>
              )
            }}
          />
        </div>
      </div>

      {openDate && <DayDialog date={openDate} onClose={() => setOpenDate(null)} />}
      {openWeek && <QuirofanoDialog week={openWeek} onClose={() => setOpenWeek(null)} />}
    </div>
  )
}
