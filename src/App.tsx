import { useState } from 'react'
import CalendarView from './components/CalendarView'
import FairnessBar from './components/FairnessBar'
import SettingsView from './components/SettingsView'

type Tab = 'plan' | 'config'

export default function App() {
  const [tab, setTab] = useState<Tab>('plan')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Guardias</h1>
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
