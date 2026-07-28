export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 px-6 text-center gap-6">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
           className="text-slate-500" aria-hidden>
        <path d="M3 3l18 18M8.5 8.5A5 5 0 0 0 7 12c0 2.76 2.24 5 5 5a5 5 0 0 0 3.5-1.5M12 2a10 10 0 0 1 7.07 17.07M1.42 9A16 16 0 0 1 12 6c.53 0 1.05.03 1.57.08"/>
      </svg>
      <div>
        <h1 className="text-2xl font-semibold mb-2">No connection</h1>
        <p className="text-slate-400 text-sm max-w-xs">
          LOSPOR requires a network connection. Please check your internet and try again.
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
