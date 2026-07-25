import amqplib from "amqplib";
import { env } from "../src/config/env";

async function main() {
  const connection = await amqplib.connect(env.RABBITMQ_URL);
  const channel = await connection.createChannel();

  const payload = {
    target: { id: "test-target-outbound-1", waId: "5511999999999", name: "Cliente Teste" },
    whatsappChannel: { id: "test-wc-outbound-1", phoneNumberId: "903493939520850", wabaId: "1419043729557569" },
    messagingSession: { id: "test-session-outbound-1" },
    answer: { text: "Mensagem de teste do pipeline Outbound-Worker.", audio: "", image: "" },
    finishesProcessing: true,
    origin: "ATTENDANT",
    ticketId: "test-ticket-outbound-1",
  };

  channel.sendToQueue("outbound.message.send", Buffer.from(JSON.stringify(payload)), { persistent: true });
  console.log("published:", JSON.stringify(payload));

  await channel.close();
  await connection.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
