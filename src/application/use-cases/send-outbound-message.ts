import type { Channel } from "amqplib";
import { MESSAGES_COLLECTION, type MessageDocument } from "../../domain/contracts/message-document";
import type { OutboundMessagePayload } from "../../domain/contracts/outbound-message-payload";
import { clearSessionProcessing } from "../../infrastructure/cache/redis/processing-state";
import { getMongoDb } from "../../infrastructure/database/mongo/client";
import { prisma } from "../../infrastructure/database/prisma/client";
import { sendMediaMessage, sendTextMessage } from "../../infrastructure/meta/graph-api-client";
import { assertQueueWithDlq } from "../../infrastructure/queue/rabbitmq/connection";
import { QUEUE_DESK_MESSAGE_SENT } from "../../infrastructure/queue/rabbitmq/queues";

const SENDER_TYPE_BY_ORIGIN: Record<OutboundMessagePayload["origin"], MessageDocument["senderType"]> = {
  AI: "AGENT_AI",
  ATTENDANT: "ATTENDANT",
  SYSTEM: "SYSTEM",
};

const MEDIA_TYPE_BY_MESSAGE_TYPE = {
  AUDIO: "audio",
  IMAGE: "image",
  DOCUMENT: "document",
  STICKER: "sticker",
} as const;

/// Envia a resposta pro cliente via Meta, grava o histórico no Mongo,
/// atualiza Target.lastInteractionAt e, se a origem foi um atendente humano,
/// avisa o Desk-Worker (fila desk.message.sent) pra reconciliar o
/// TicketMessage correspondente com o id do documento Mongo.
export async function sendOutboundMessage(channel: Channel, payload: OutboundMessagePayload): Promise<void> {
  console.log(
    `[DESK-MSG][sendOutboundMessage] início — origin=${payload.origin} ticketId=${payload.ticketId ?? "-"} targetId=${payload.target.id} waId=${payload.target.waId}`,
  );

  // Libera o flag de "sessão em processamento" assim que o turno de IA
  // termina — independente do resultado do envio abaixo, o AI-Worker já
  // concluiu o processamento desse lote.
  if (payload.origin === "AI" && payload.finishesProcessing) {
    await clearSessionProcessing(payload.messagingSession.id);
  }

  // messageType+mediaUrl só vêm preenchidos no repasse de anexo do atendente
  // (Desk-Worker) — o resto da pipeline (IA, transferMessage, closingMessage)
  // sempre manda texto puro em answer.text.
  const mediaType = payload.messageType ? MEDIA_TYPE_BY_MESSAGE_TYPE[payload.messageType as keyof typeof MEDIA_TYPE_BY_MESSAGE_TYPE] : undefined;
  const isMedia = Boolean(payload.mediaUrl) && Boolean(mediaType);

  if (!isMedia && !payload.answer.text) {
    console.log(`[DESK-MSG][sendOutboundMessage] ticketId=${payload.ticketId ?? "-"} sem texto nem mídia — ignorando envio.`);
    return;
  }

  console.log(
    `[DESK-MSG][sendOutboundMessage] ticketId=${payload.ticketId ?? "-"} chamando Meta Graph API — phoneNumberId=${payload.whatsappChannel.phoneNumberId} toWaId=${payload.target.waId} tipo=${isMedia ? mediaType : "text"}`,
  );

  const dbChannel = await prisma.whatsappChannel.findUniqueOrThrow({
    where: { id: payload.whatsappChannel.id },
    select: { metaAccessToken: true },
  });
  if (!dbChannel.metaAccessToken) {
    throw new Error(`WhatsApp Channel ${payload.whatsappChannel.id} não tem token de acesso da Meta cadastrado.`);
  }
  const accessToken = dbChannel.metaAccessToken;

  let externalMessageId: string;
  try {
    if (isMedia) {
      ({ externalMessageId } = await sendMediaMessage(
        payload.whatsappChannel.phoneNumberId,
        payload.target.waId,
        mediaType!,
        payload.mediaUrl!,
        accessToken,
        { caption: payload.answer.text || undefined, filename: payload.answer.text || undefined },
      ));
    } else {
      ({ externalMessageId } = await sendTextMessage(
        payload.whatsappChannel.phoneNumberId,
        payload.target.waId,
        payload.answer.text,
        accessToken,
      ));
    }
  } catch (error) {
    console.error(`[DESK-MSG][sendOutboundMessage] ticketId=${payload.ticketId ?? "-"} falha ao chamar Meta Graph API:`, error);
    throw error;
  }

  console.log(
    `[DESK-MSG][sendOutboundMessage] ticketId=${payload.ticketId ?? "-"} Meta Graph API respondeu OK — externalMessageId=${externalMessageId}`,
  );

  const target = await prisma.target.update({
    where: { id: payload.target.id },
    data: { lastInteractionAt: new Date() },
  });

  const db = await getMongoDb();
  const document: MessageDocument = {
    organizationId: target.organizationId,
    targetId: payload.target.id,
    whatsappChannelId: payload.whatsappChannel.id,
    messagingSessionId: payload.messagingSession.id,
    direction: "OUTBOUND",
    senderType: SENDER_TYPE_BY_ORIGIN[payload.origin],
    messageType: isMedia ? payload.messageType! : "TEXT",
    mediaUrl: isMedia ? payload.mediaUrl : undefined,
    externalMessageId,
    text: payload.answer.text,
    createdAt: new Date(),
  };

  const insertResult = await db.collection<MessageDocument>(MESSAGES_COLLECTION).insertOne(document);
  console.log(
    `[DESK-MSG][sendOutboundMessage] ticketId=${payload.ticketId ?? "-"} histórico gravado no Mongo — mongoMessageId=${insertResult.insertedId.toString()}`,
  );

  if (payload.origin === "ATTENDANT" && payload.ticketId) {
    await assertQueueWithDlq(channel, QUEUE_DESK_MESSAGE_SENT);
    channel.sendToQueue(
      QUEUE_DESK_MESSAGE_SENT,
      Buffer.from(
        JSON.stringify({
          ticketId: payload.ticketId,
          mongoMessageId: insertResult.insertedId.toString(),
          sentAt: new Date().toISOString(),
        }),
      ),
      { persistent: true },
    );
    console.log(`[DESK-MSG][sendOutboundMessage] ticketId=${payload.ticketId} publicado em desk.message.sent (reconciliação)`);
  }

  console.log(`[DESK-MSG][sendOutboundMessage] ticketId=${payload.ticketId ?? "-"} concluído com sucesso`);
}
