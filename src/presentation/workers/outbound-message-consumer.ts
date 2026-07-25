import type { Channel, ConsumeMessage } from "amqplib";
import { sendOutboundMessage } from "../../application/use-cases/send-outbound-message";
import type { OutboundMessagePayload } from "../../domain/contracts/outbound-message-payload";
import { assertQueueWithDlq } from "../../infrastructure/queue/rabbitmq/connection";
import { QUEUE_OUTBOUND_MESSAGE_SEND } from "../../infrastructure/queue/rabbitmq/queues";

export async function startOutboundMessageConsumer(channel: Channel): Promise<void> {
  await assertQueueWithDlq(channel, QUEUE_OUTBOUND_MESSAGE_SEND);
  channel.prefetch(1);

  channel.consume(QUEUE_OUTBOUND_MESSAGE_SEND, (msg) => onMessage(channel, msg));

  console.log(`Aguardando mensagens na fila ${QUEUE_OUTBOUND_MESSAGE_SEND}`);
}

async function onMessage(channel: Channel, msg: ConsumeMessage | null): Promise<void> {
  if (!msg) return;

  try {
    const payload = JSON.parse(msg.content.toString()) as OutboundMessagePayload;
    await sendOutboundMessage(channel, payload);
    channel.ack(msg);
  } catch (error) {
    console.error("Erro ao processar outbound.message.send:", error);
    channel.nack(msg, false, false);
  }
}
