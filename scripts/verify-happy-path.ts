// Verifica a parte do pipeline que não depende de um envio real aceito pela
// Meta (que exige o destinatário estar na allowlist do número de teste) —
// grava no Mongo, atualiza Target, publica desk.message.sent — usando um
// externalMessageId simulado, exatamente como sendOutboundMessage faria após
// um envio bem-sucedido de verdade.
import amqplib from "amqplib";
import { MESSAGES_COLLECTION, type MessageDocument } from "../src/domain/contracts/message-document";
import { getMongoDb } from "../src/infrastructure/database/mongo/client";
import { prisma } from "../src/infrastructure/database/prisma/client";
import { env } from "../src/config/env";

async function main() {
  const fakeExternalMessageId = "wamid.TEST_HAPPY_PATH_" + Date.now();

  const target = await prisma.target.update({
    where: { id: "test-target-outbound-1" },
    data: { lastInteractionAt: new Date() },
  });

  const db = await getMongoDb();
  const document: MessageDocument = {
    organizationId: target.organizationId,
    targetId: target.id,
    whatsappChannelId: "test-wc-outbound-1",
    messagingSessionId: "test-session-outbound-1",
    direction: "OUTBOUND",
    senderType: "ATTENDANT",
    messageType: "TEXT",
    externalMessageId: fakeExternalMessageId,
    text: "Mensagem de teste do happy path (Meta simulada).",
    createdAt: new Date(),
  };
  const insertResult = await db.collection<MessageDocument>(MESSAGES_COLLECTION).insertOne(document);
  console.log("Mongo insert ok:", insertResult.insertedId.toString());
  console.log("Target.lastInteractionAt updated:", target.lastInteractionAt);

  const connection = await amqplib.connect(env.RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue("desk.message.sent.dlq", { durable: true });
  await channel.assertQueue("desk.message.sent", {
    durable: true,
    deadLetterExchange: "",
    deadLetterRoutingKey: "desk.message.sent.dlq",
  });
  channel.sendToQueue(
    "desk.message.sent",
    Buffer.from(
      JSON.stringify({
        ticketId: "test-ticket-outbound-1",
        mongoMessageId: insertResult.insertedId.toString(),
        sentAt: new Date().toISOString(),
      }),
    ),
    { persistent: true },
  );
  console.log("published desk.message.sent");
  await channel.close();
  await connection.close();

  const found = await db.collection<MessageDocument>(MESSAGES_COLLECTION).findOne({ _id: insertResult.insertedId });
  console.log("Mongo doc verified:", JSON.stringify(found));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
