/// Payload consumido da fila `outbound.message.send` — publicado pelo
/// AI-Worker (origin="AI") e, na Fase 3, pelo Desk-Worker (origin="ATTENDANT"
/// para respostas humanas, "SYSTEM" para mensagens automáticas como
/// transferMessage/closingMessage).
export interface OutboundMessagePayload {
  target: { id: string; waId: string; name?: string | null; metadata?: Record<string, unknown> | null };
  whatsappChannel: { id: string; phoneNumberId: string; wabaId: string };
  messagingSession: { id: string; [key: string]: unknown };
  answer: { text: string; audio: string; image: string };
  finishesProcessing: boolean;
  origin: "AI" | "SYSTEM" | "ATTENDANT";
  ticketId?: string;
}
