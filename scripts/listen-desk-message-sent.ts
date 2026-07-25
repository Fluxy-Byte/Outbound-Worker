import amqplib from "amqplib";
import { env } from "../src/config/env";

async function main() {
  const connection = await amqplib.connect(env.RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue("desk.message.sent.dlq", { durable: true });
  await channel.assertQueue("desk.message.sent", {
    durable: true,
    deadLetterExchange: "",
    deadLetterRoutingKey: "desk.message.sent.dlq",
  });

  console.log("listening on desk.message.sent for up to 20s...");

  const timeout = setTimeout(() => {
    console.log("TIMEOUT: no message received on desk.message.sent within 20s");
    process.exit(1);
  }, 20000);

  channel.consume("desk.message.sent", (msg) => {
    if (!msg) return;
    console.log("RECEIVED on desk.message.sent:", msg.content.toString());
    channel.ack(msg);
    clearTimeout(timeout);
    setTimeout(() => process.exit(0), 500);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
