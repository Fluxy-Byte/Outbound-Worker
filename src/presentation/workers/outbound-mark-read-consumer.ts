import type { Channel, ConsumeMessage } from "amqplib";
import { markMessageRead } from "../../application/use-cases/mark-message-read";
import type { MarkReadPayload } from "../../domain/contracts/mark-read-payload";
import { assertQueueWithDlq } from "../../infrastructure/queue/rabbitmq/connection";
import { QUEUE_OUTBOUND_MESSAGE_MARK_READ } from "../../infrastructure/queue/rabbitmq/queues";

export async function startOutboundMarkReadConsumer(channel: Channel): Promise<void> {
  await assertQueueWithDlq(channel, QUEUE_OUTBOUND_MESSAGE_MARK_READ);
  channel.prefetch(5);

  channel.consume(QUEUE_OUTBOUND_MESSAGE_MARK_READ, (msg) => onMessage(channel, msg));

  console.log(`Aguardando mensagens na fila ${QUEUE_OUTBOUND_MESSAGE_MARK_READ}`);
}

// markMessageRead nunca lança (best-effort) — o ack aqui é incondicional.
async function onMessage(channel: Channel, msg: ConsumeMessage | null): Promise<void> {
  if (!msg) return;

  const payload = JSON.parse(msg.content.toString()) as MarkReadPayload;
  await markMessageRead(payload);
  channel.ack(msg);
}
