import { useCallback, useEffect, useState, type RefObject } from 'react'
import { weekOf } from '../fairness'
import { contrastText } from '../hooks'
import type { Person } from '../types'

type Row = { week: string; top: number; height: number }
type Layout = { rows: Row[]; headerTop: number | null }

/**
 * Columna a la izquierda del calendario con quién es quirofanera/o cada semana.
 * FullCalendar no tiene una columna lateral propia, así que se mide dónde cae cada fila de semana
 * en el DOM y se dibuja una etiqueta alineada con ella.
 */
export default function WeekGutter({
  containerRef,
  assigned,
  manual,
  peopleById,
  highlightId,
  onOpen,
}: {
  containerRef: RefObject<HTMLDivElement | null>
  /** Quién va cada semana (lo cargado a mano + lo autocompletado) */
  assigned: Record<string, string>
  /** Solo lo cargado a mano */
  manual: Record<string, string>
  peopleById: Map<string, Person>
  highlightId: string | null
  onOpen: (week: string) => void
}) {
  const [layout, setLayout] = useState<Layout>({ rows: [], headerTop: null })

  const measure = useCallback(() => {
    const root = containerRef.current
    if (!root) return
    const base = root.getBoundingClientRect().top
    const rows: Row[] = []
    root.querySelectorAll<HTMLElement>('.fc-daygrid-body tbody tr').forEach((tr) => {
      const date = tr.querySelector<HTMLElement>('td[data-date]')?.dataset.date
      if (!date) return
      const rect = tr.getBoundingClientRect()
      rows.push({ week: weekOf(date), top: Math.round(rect.top - base), height: Math.round(rect.height) })
    })
    const header = root.querySelector('.fc-col-header')
    const headerTop = header ? Math.round(header.getBoundingClientRect().top - base) : null
    setLayout((prev) => (JSON.stringify(prev) === JSON.stringify({ rows, headerTop }) ? prev : { rows, headerTop }))
  }, [containerRef])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    // Se mira solo el calendario (`.cal-body`): observar toda la tarjeta incluía a esta misma columna, y cada cambio
    // de ella disparaba otra medición (con el layout forzado) sin que nada hubiera cambiado de lugar.
    const body = root.querySelector('.cal-body') ?? root
    const resize = new ResizeObserver(schedule)
    const mutation = new MutationObserver(schedule)
    resize.observe(root)
    mutation.observe(body, { childList: true, subtree: true })
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutation.disconnect()
    }
  }, [containerRef, measure])

  return (
    <div className="cal-gutter pointer-events-none absolute top-0">
      {layout.headerTop !== null && (
        <div
          className="absolute hidden w-full text-center text-[10px] font-semibold uppercase text-base-content/60 sm:block"
          style={{ top: layout.headerTop + 8 }}
          title="Quirófano"
        >
          Quir.
        </div>
      )}
      {layout.rows.map(({ week, top, height }, i) => {
        const person = peopleById.get(assigned[week])
        const dimmed = highlightId !== null && person?.id !== highlightId
        return (
          <button
            key={`${week}-${i}`}
            className={`q-vertical pointer-events-auto absolute w-full rounded sm:truncate text-center text-[11px] before:absolute before:-left-1 before:-right-1 before:top-0 before:bottom-0 before:content-[''] sm:text-xs sm:before:hidden ${
              person ? 'q-chip font-medium' : 'border border-dashed border-base-content/60 italic opacity-60'
            } ${dimmed ? 'opacity-20' : ''}`}
            style={{
              top: top + 2,
              height: height - 4,
              ...(person && { background: person.color, borderColor: person.color, color: contrastText(person.color) }),
            }}
            aria-label={person ? `Quirófano: ${person.name}` : 'Quirófano: sin asignar'}
            title={
              person
                ? `Quirófano: ${person.name}${week in manual ? '' : ' (automático según el orden)'}`
                : 'Quirófano: sin asignar'
            }
            onClick={() => onOpen(week)}
          >
            <span className="hidden sm:inline">{person ? person.name : 'sin asignar'}</span>
          </button>
        )
      })}
    </div>
  )
}
