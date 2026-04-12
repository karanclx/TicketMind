import { Navigate, Route, Routes } from "react-router-dom"

import { TicketDetailPage } from "./pages/TicketDetailPage"
import { TicketSubmitPage } from "./pages/TicketSubmitPage"

export const App = () => {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>TicketMind</h1>
        <p>IT support ticket triage</p>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<TicketSubmitPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
