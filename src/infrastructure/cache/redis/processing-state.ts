import { redis } from "./client";

function processingKey(messagingSessionId: string): string {
  return `processing:session:${messagingSessionId}`;
}

/// Libera o flag de "sessão em processamento no AI-Worker" setado pelo
/// Inbound-Service (mesma chave, ver
/// Inbound-Service/src/application/webhook/processing-state-service.ts) —
/// chamado quando a resposta final de um turno de IA sai pro cliente.
export async function clearSessionProcessing(messagingSessionId: string): Promise<void> {
  await redis.del(processingKey(messagingSessionId));
}
