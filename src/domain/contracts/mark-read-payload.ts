export interface MarkReadPayload {
  /// Opcional na prática: alguns publishers (ex: Desk-API) não mandam esse
  /// campo — sempre resolver o canal com fallback pro phoneNumberId (ver
  /// mark-message-read.ts), nunca assumir que está presente.
  whatsappChannelId?: string;
  phoneNumberId: string;
  externalMessageId: string;
  typingIndicator: boolean;
}
