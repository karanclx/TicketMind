import { useNavigate } from "react-router-dom"

import { createTicket } from "../api"
import { TicketForm } from "../components/TicketForm"
import type { TicketRequest } from "../types"

export const TicketSubmitPage = () => {
  const navigate = useNavigate()

  const handleSubmit = async (payload: TicketRequest): Promise<void> => {
    const created = await createTicket(payload)
    navigate(`/tickets/${created.id}`)
  }

  return <TicketForm onSubmit={handleSubmit} />
}
