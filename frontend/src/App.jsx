/**
 * src/App.jsx
 * ENIGMA Dashboard – root component.
 *
 * Layout:
 *   ┌──────────────── Header ─────────────────┐
 *   │  Stats bar (total / verified / failed)  │
 *   ├─────────────────┬───────────────────────┤
 *   │   Live Feed     │   History Table       │
 *   └─────────────────┴───────────────────────┘
 */
import { useState } from 'react';
import { useEntropy }        from './hooks/useEntropy.js';
import ConnectionBadge       from './components/ConnectionBadge.jsx';
import StatsBar              from './components/StatsBar.jsx';
import LiveFeed              from './components/LiveFeed.jsx';
import HistoryTable          from './components/HistoryTable.jsx';

export default function App() {
  const { records, connected, connectionStatus, stats } = useEntropy();
  const [activeTab, setActiveTab] = useState('feed');  /* 'feed' | 'history' */

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-white/10 bg-gray-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-sm font-black">
              E
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-none">ENIGMA</h1>
              <p className="text-[10px] text-white/30 leading-none mt-0.5">
                Entropy Verification System
              </p>
            </div>
          </div>

          <ConnectionBadge status={connectionStatus} />
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Stats */}
        <StatsBar stats={stats} />

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-white/10">
          {[
            { id: 'feed',    label: 'Live Feed' },
            { id: 'history', label: 'History'   },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
                ${activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-white/40 hover:text-white/70'}
              `}
            >
              {tab.label}
              {tab.id === 'feed' && records.length > 0 && (
                <span className="ml-2 text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded-full">
                  {records.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Panels */}
        {activeTab === 'feed' && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest">
                Real-time Entropy Events
              </h2>
              {connected && (
                <span className="text-[11px] text-emerald-400 animate-pulse">
                  ● Streaming
                </span>
              )}
            </div>
            <LiveFeed records={records} />
          </section>
        )}

        {activeTab === 'history' && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest">
                Historical Records
              </h2>
              <span className="text-xs text-white/30">{records.length} records loaded</span>
            </div>
            <HistoryTable records={records} />
          </section>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 mt-16 py-6 text-center text-xs text-white/20">
        ENIGMA · Chain of Trust: Entropy → Hash → Signature → Verification → Storage
      </footer>
    </div>
  );
}
