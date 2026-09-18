import type { MarkReadPayload } from "../../domain/contracts/mark-read-payload";
import { prisma } from "../../infrastructure/database/prisma/client";
import { sendReadReceipt } from "../../infrastructure/meta/graph-api-client";
import { recordMessageLog } from "./message-log-service";

/// Best-effort: leitura/"digitando..." é um detalhe de UX, não uma mensagem —
/// uma falha aqui (rate limit da Meta, token expirado etc.) não deve virar
/// retry/DLQ, só log. O consumer sempre dá ack.
export async function markMessageRead(payload: MarkReadPayload): Promise<void> {
  await recordMessageLog(payload.externalMessageId, "start");
  try {
    const dbChannel = await prisma.channel.findUnique({
      where: payload.whatsappChannelId ? { id: payload.whatsappChannelId } : { phoneNumberId: payload.phoneNumberId },
      select: { metaAccessToken: true },
    });
    if (!dbChannel?.metaAccessToken) {
      console.warn(
        `[DESK-MSG][markMessageRead] canal ${payload.whatsappChannelId ?? payload.phoneNumberId} sem token da Meta — ignorando.`,
      );
      return;
    }

    await sendReadReceipt(payload.phoneNumberId, payload.externalMessageId, dbChannel.metaAccessToken, {
      typingIndicator: payload.typingIndicator,
    });
  } catch (error) {
    console.error(
      `[DESK-MSG][markMessageRead] falha ao marcar leitura/digitando (externalMessageId=${payload.externalMessageId}):`,
      error,
    );
  } finally {
    await recordMessageLog(payload.externalMessageId, "end");
  }
}
