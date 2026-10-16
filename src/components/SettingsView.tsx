import { useRef, useState } from 'react'
import { normalize } from '../data'
import { addDaysTo, isoOf } from '../dates'
import { GROUP } from '../group'
import { useStore } from '../store'
import { createGroup } from '../sync'
import Icon from './Icon'

export default function SettingsView() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PeopleCard />
      <div className="flex flex-col gap-4">
        <QuirofanoCard />
        <RulesCard />
        <HolidaysCard />
        <DataCard />
      </div>
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card card-border bg-base-100">
      <div className="card-body gap-3 p-3 sm:p-4">
        <div>
          <h2 className="card-title text-base">{title}</h2>
          {hint && <p className="text-sm text-base-content/60">{hint}</p>}
        </div>
        {children}
      </div>
    </section>
  )
}

function PeopleCard() {
  const { people, shifts, quirofano, addPerson, updatePerson, removePerson } = useStore()
  const [name, setName] = useState('')
  const today = isoOf(new Date())
  // lo que se des-asigna al eliminar: guardias de hoy en adelante y semanas de quirófano que no terminaron
  const upcomingOf = (id: string) =>
    Object.entries(shifts).filter(([d, p]) => p === id && d >= today).length +
    Object.entries(quirofano).filter(([w, p]) => p === id && addDaysTo(w, 6) >= today).length

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    addPerson(name.trim())
    setName('')
  }

  return (
    <Card title="Personas" hint="Las personas inactivas no entran en el balance ni en las sugerencias, pero conservan su historial.">
      <ul className="flex flex-col gap-2">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <input
              type="color"
              className="size-8 shrink-0 cursor-pointer rounded border border-base-300 bg-transparent"
              value={p.color}
              onChange={(e) => updatePerson(p.id, { color: e.target.value })}
            />
            <input
              className="input input-sm min-w-0 flex-1"
              value={p.name}
              onChange={(e) => updatePerson(p.id, { name: e.target.value })}
            />
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-success"
                checked={p.active}
                onChange={(e) => updatePerson(p.id, { active: e.target.checked })}
                aria-label="Activa"
              />
              <span className="hidden sm:inline">Activa</span>
            </label>
            <button
              className="btn btn-ghost btn-sm btn-square text-error"
              title="Eliminar"
              onClick={() => {
                const n = upcomingOf(p.id)
                const msg = n
                  ? `${p.name} tiene ${n} guardia(s) o semana(s) de quirófano de hoy en adelante; quedarían sin asignar. Lo ya pasado sigue a su nombre. ¿Eliminar?`
                  : `¿Eliminar a ${p.name}? Lo ya pasado sigue a su nombre.`
                if (confirm(msg)) removePerson(p.id)
              }}
            >
              <Icon name="close" />
            </button>
          </li>
        ))}
        {people.length === 0 && <li className="text-sm text-base-content/60">Todavía no hay nadie.</li>}
      </ul>
      <form className="flex gap-2" onSubmit={submit}>
        <input className="input input-sm flex-1" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-sm btn-primary" type="submit">Agregar</button>
      </form>
    </Card>
  )
}

function QuirofanoCard() {
  const { people, settings, updateSettings } = useStore()
  const byId = new Map(people.map((p) => [p.id, p]))
  const order = settings.quirofanoOrder.filter((id) => byId.has(id))
  const outside = people.filter((p) => !order.includes(p.id))
  const setOrder = (ids: string[]) => updateSettings({ quirofanoOrder: ids })

  const move = (i: number, delta: number) => {
    const j = i + delta
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
  }

  const toggle = (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        className="toggle toggle-primary toggle-sm"
        checked={settings.quirofanoEnabled}
        onChange={(e) => updateSettings({ quirofanoEnabled: e.target.checked })}
      />
      <span className="font-medium">Usar quirófano</span>
    </label>
  )

  if (!settings.quirofanoEnabled) {
    return (
      <Card
        title="Quirófano"
        hint="Apagado: el calendario no muestra al quirofanero y las guardias se reparten sin tener en cuenta ninguna semana de quirófano. Lo ya cargado se conserva por si lo volvés a prender."
      >
        {toggle}
      </Card>
    )
  }

  return (
    <Card
      title="Orden del quirófano"
      hint="Cada semana le toca a la persona siguiente de la lista; al llegar al final vuelve a la primera. El calendario completa solo el quirófano con este orden: si fijás a alguien a mano en una semana, las siguientes siguen desde ahí."
    >
      {toggle}
      {order.length === 0 ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-base-content/60">Sin orden definido: se rota por el orden de la lista de personas.</span>
          <button
            className="btn btn-sm"
            disabled={people.length === 0}
            onClick={() => setOrder(people.map((p) => p.id))}
          >
            Definir orden
          </button>
        </div>
      ) : (
        <>
          <ol className="flex flex-col gap-1">
            {order.map((id, i) => {
              const p = byId.get(id)!
              return (
                <li key={id} className="flex items-center gap-2">
                  <span className="w-5 text-right text-sm text-base-content/50">{i + 1}.</span>
                  <span className="inline-block size-3 rounded-full" style={{ background: p.color }} />
                  <span className={`flex-1 ${p.active ? '' : 'text-base-content/50'}`}>
                    {p.name}
                    {!p.active && ' (inactiva: se saltea)'}
                  </span>
                  <button className="btn btn-ghost btn-sm sm:btn-xs" disabled={i === 0} title="Subir" onClick={() => move(i, -1)}>
                    <Icon name="arrowUp" />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm sm:btn-xs"
                    disabled={i === order.length - 1}
                    title="Bajar"
                    onClick={() => move(i, 1)}
                  >
                    <Icon name="arrowDown" />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm sm:btn-xs text-error"
                    title="Sacar de la rotación"
                    onClick={() => setOrder(order.filter((x) => x !== id))}
                  >
                    <Icon name="close" />
                  </button>
                </li>
              )
            })}
          </ol>
          <p className="text-xs text-base-content/60">
            Después de {byId.get(order[order.length - 1])!.name} vuelve {byId.get(order[0])!.name}.
          </p>
        </>
      )}
      {order.length > 0 && outside.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-base-content/60">Fuera de la rotación:</span>
          {outside.map((p) => (
            <button key={p.id} className="btn btn-xs" onClick={() => setOrder([...order, p.id])}>
              + {p.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-base-content/60">
        Alrededor de su semana de quirófano, a cada persona se le prefiere dar guardia de lunes a viernes de la semana anterior,
        el domingo previo y el viernes de su semana.
      </p>
    </Card>
  )
}

function RulesCard() {
  const { settings, updateSettings } = useStore()
  return (
    <Card title="Reglas del balance">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Contar guardias desde</span>
        <span className="flex items-center gap-2">
          <input
            type="date"
            className="input input-sm"
            value={settings.countFrom ?? ''}
            onChange={(e) => updateSettings({ countFrom: e.target.value || null })}
          />
          {settings.countFrom && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => updateSettings({ countFrom: null })}>
              Todo el historial
            </button>
          )}
        </span>
        <span className="text-xs text-base-content/60">Lo anterior se sigue viendo en el calendario pero no pesa en el balance.</span>
      </label>
    </Card>
  )
}

function HolidaysCard() {
  const { settings, updateSettings } = useStore()
  const [date, setDate] = useState('')
  const [name, setName] = useState('')

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!date) return
    const rest = settings.customHolidays.filter((h) => h.date !== date)
    updateSettings({ customHolidays: [...rest, { date, name: name.trim() || 'Feriado' }].sort((a, b) => a.date.localeCompare(b.date)) })
    setDate('')
    setName('')
  }

  return (
    <Card title="Feriados">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="toggle toggle-sm"
          checked={settings.autoHolidays}
          onChange={(e) => updateSettings({ autoHolidays: e.target.checked })}
        />
        Usar feriados nacionales de Argentina
      </label>
      <div>
        <div className="mb-1 text-sm font-medium">Feriados propios (puentes, días no laborables, etc.)</div>
        <ul className="mb-2 flex flex-col gap-1">
          {settings.customHolidays.map((h) => (
            <li key={h.date} className="flex items-center gap-2 text-sm">
              <span className="tabular-nums">{h.date}</span>
              <span className="flex-1">{h.name}</span>
              <button
                className="btn btn-ghost btn-xs text-error"
                onClick={() => updateSettings({ customHolidays: settings.customHolidays.filter((x) => x.date !== h.date) })}
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
        <form className="flex flex-wrap gap-2" onSubmit={add}>
          <input type="date" className="input input-sm w-40 shrink-0" value={date} onChange={(e) => setDate(e.target.value)} required />
          <input className="input input-sm min-w-32 flex-1" placeholder="Nombre (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-sm" type="submit">Agregar</button>
        </form>
      </div>
    </Card>
  )
}

function DataCard() {
  const { people, shifts, quirofano, settings, importData, reset } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ people, shifts, quirofano, settings }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `guardias-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      alert('Enlace copiado. Cualquiera que lo tenga puede editar este grupo.')
    } catch {
      prompt('Copiá el enlace:', location.href)
    }
  }

  const share = async () => {
    if (!confirm('Se crea un grupo en el servidor con los datos actuales y pasás a trabajar ahí. Cualquiera que tenga el enlace podrá editarlo. ¿Seguir?')) return
    try {
      const url = await createGroup({ people, shifts, quirofano, settings })
      location.href = url
    } catch (e) {
      alert(`No pude crear el grupo. ${e instanceof Error ? e.message : ''}`)
    }
  }

  const importJson = async (file: File) => {
    try {
      const data = normalize(JSON.parse(await file.text()))
      if (!data) throw new Error('formato')
      if (confirm(`Esto reemplaza todos los datos actuales${GROUP ? ' para todo el grupo' : ''}. ¿Seguir?`)) importData(data)
    } catch {
      alert('No pude leer ese archivo.')
    }
  }

  return (
    <Card
      title="Datos"
      hint={
        GROUP
          ? 'Grupo compartido: los cambios se guardan en el servidor y los ve cualquiera que tenga el enlace. Importar o borrar todo afecta a todo el grupo.'
          : 'Todo vive en este navegador (localStorage). Compartilo con un enlace para editarlo entre varias personas, y exportá un respaldo de vez en cuando.'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {GROUP ? (
          <button className="btn btn-sm btn-primary" onClick={copyLink}>Copiar enlace del grupo</button>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={share}>Compartir…</button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm" onClick={exportJson}>Exportar JSON</button>
        <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>Importar JSON</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importJson(f)
            e.target.value = ''
          }}
        />
        <button
          className="btn btn-sm btn-error btn-soft ml-auto"
          onClick={() =>
            confirm(`Se borran personas, guardias y configuración${GROUP ? ' de todo el grupo' : ''}. ¿Seguro?`) && reset()
          }
        >
          Borrar todo
        </button>
      </div>
    </Card>
  )
}
