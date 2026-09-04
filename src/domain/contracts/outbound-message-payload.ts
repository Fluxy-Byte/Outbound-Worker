/// Payload consumido da fila `outbound.message.send` — publicado pelo
/// AI-Worker (origin="AI") e, na Fase 3, pelo Desk-Worker (origin="ATTENDANT"
/// para respostas humanas, "SYSTEM" para mensagens automáticas como
/// transferMessage/closingMessage).
export interface OutboundMessagePayload {
  /// waId pode vir ausente — contato só identificado por BSUID ainda (ver
  /// Agent-Api/prisma/schema.prisma#Target). Sem waId não dá pra enviar: a
  /// Graph API da Meta não aceita BSUID como destinatário de envio (só
  /// leitura, previsto pra julho/2026) — ver o guard em
  /// send-outbound-message.ts.
  target: { id: string; waId: string | null; name?: string | null; metadata?: Record<string, unknown> | null };
  whatsappChannel: { id: string; phoneNumberId: string; wabaId: string };
  messagingSession: { id: string; [key: string]: unknown };
  answer: { text: string; audio: string; image: string };
  // messageType/mediaUrl: só preenchido no repasse de anexo do atendente
  // (Desk-Worker). Ausente = mensagem de texto simples, como sempre foi.
  messageType?: "TEXT" | "AUDIO" | "IMAGE" | "DOCUMENT" | "STICKER";
  mediaUrl?: string;
  finishesProcessing: boolean;
  origin: "AI" | "SYSTEM" | "ATTENDANT";
  ticketId?: string;
}
