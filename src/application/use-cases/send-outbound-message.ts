import type { Channel } from "amqplib";
import { MESSAGES_COLLECTION, type MessageDocument } from "../../domain/contracts/message-document";
import type { OutboundMessagePayload } from "../../domain/contracts/outbound-message-payload";
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
  // Só texto é gerado pela pipeline hoje (áudio/imagem: nenhum serviço a
  // montante ainda produz isso — quando produzir, a Graph API aceita type
  // "audio"/"image" com { link } ou { id }, mesma forma de chamada).
  if (!payload.answer.text) {
    console.log("Mensagem sem texto (áudio/imagem ainda não suportado) — ignorando envio.");
    return;
  }

  const { externalMessageId } = await sendTextMessage(
    payload.whatsappChannel.phoneNumberId,
    payload.target.waId,
    payload.answer.text,
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
  }
}
