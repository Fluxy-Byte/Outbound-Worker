import type { MarkReadPayload } from "../../domain/contracts/mark-read-payload";
import { sendReadReceipt } from "../../infrastructure/meta/graph-api-client";

/// Best-effort: leitura/"digitando..." é um detalhe de UX, não uma mensagem —
/// uma falha aqui (rate limit da Meta, token expirado etc.) não deve virar
/// retry/DLQ, só log. O consumer sempre dá ack.
export async function markMessageRead(payload: MarkReadPayload): Promise<void> {
  try {
    await sendReadReceipt(payload.phoneNumberId, payload.externalMessageId, {
      typingIndicator: payload.typingIndicator,
    });
  } catch (error) {
    console.error(
      `[DESK-MSG][markMessageRead] falha ao marcar leitura/digitando (externalMessageId=${payload.externalMessageId}):`,
      error,
    );
  }
}
