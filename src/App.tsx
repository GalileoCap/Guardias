import { useState } from 'react'
import CalendarView from './components/CalendarView'
import FairnessBar from './components/FairnessBar'
import SettingsView from './components/SettingsView'
import SyncBadge from './components/SyncBadge'

type Tab = 'plan' | 'config'

export default function App() {
  const [tab, setTab] = useState<Tab>('plan')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display flex items-center gap-2 text-3xl font-semibold italic text-primary">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-9" />
          Guardias
        </h1>
        <SyncBadge />
        <div role="tablist" className="tabs tabs-box">
          <button role="tab" className={`tab ${tab === 'plan' ? 'tab-active' : ''}`} onClick={() => setTab('plan')}>
            Calendario
          </button>
          <button role="tab" className={`tab ${tab === 'config' ? 'tab-active' : ''}`} onClick={() => setTab('config')}>
            Configuración
          </button>
        </div>
      </header>
      {tab === 'plan' ? (
        <>
          <CalendarView highlightId={highlightId} onHighlight={setHighlightId} />
          <FairnessBar highlightId={highlightId} onHighlight={setHighlightId} />
        </>
      ) : (
        <SettingsView />
      )}
    </div>
  )
}
