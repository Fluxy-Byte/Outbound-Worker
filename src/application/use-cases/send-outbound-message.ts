import type { Channel } from "amqplib";
import { MESSAGES_COLLECTION, type MessageDocument } from "../../domain/contracts/message-document";
import type { OutboundMessagePayload } from "../../domain/contracts/outbound-message-payload";
import { clearSessionProcessing } from "../../infrastructure/cache/redis/processing-state";
import { getMongoDb } from "../../infrastructure/database/mongo/client";
import { prisma } from "../../infrastructure/database/prisma/client";
import { sendTextMessage } from "../../infrastructure/meta/graph-api-client";
import { assertQueueWithDlq } from "../../infrastructure/queue/rabbitmq/connection";
import { QUEUE_DESK_MESSAGE_SENT } from "../../infrastructure/queue/rabbitmq/queues";

const SENDER_TYPE_BY_ORIGIN: Record<OutboundMessagePayload["origin"], MessageDocument["senderType"]> = {
  AI: "AGENT_AI",
  ATTENDANT: "ATTENDANT",
  SYSTEM: "SYSTEM",
};

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

  // Só texto é gerado pela pipeline hoje (áudio/imagem: nenhum serviço a
  // montante ainda produz isso — quando produzir, a Graph API aceita type
  // "audio"/"image" com { link } ou { id }, mesma forma de chamada).
  if (!payload.answer.text) {
    console.log(
      `[DESK-MSG][sendOutboundMessage] ticketId=${payload.ticketId ?? "-"} sem texto (áudio/imagem ainda não suportado) — ignorando envio.`,
    );
    return;
  }

  console.log(
    `[DESK-MSG][sendOutboundMessage] ticketId=${payload.ticketId ?? "-"} chamando Meta Graph API — phoneNumberId=${payload.whatsappChannel.phoneNumberId} toWaId=${payload.target.waId}`,
  );

  let externalMessageId: string;
  try {
    ({ externalMessageId } = await sendTextMessage(
      payload.whatsappChannel.phoneNumberId,
      payload.target.waId,
      payload.answer.text,
    ));
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
    messageType: "TEXT",
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
