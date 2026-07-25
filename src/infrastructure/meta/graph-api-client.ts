import { env } from "../../config/env";

const GRAPH_API_BASE = "https://graph.facebook.com/v22.0";

export class MetaGraphApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "MetaGraphApiError";
  }
}

interface SendTextResult {
  externalMessageId: string;
}

export async function sendTextMessage(phoneNumberId: string, toWaId: string, text: string): Promise<SendTextResult> {
  const response = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toWaId,
      type: "text",
      text: { body: text },
    }),
  });

  const body = (await response.json().catch(() => null)) as { messages?: { id: string }[]; error?: unknown } | null;

  if (!response.ok) {
    throw new MetaGraphApiError(`Meta Graph API respondeu ${response.status}`, response.status, body);
  }

  const externalMessageId = body?.messages?.[0]?.id;
  if (!externalMessageId) {
    throw new MetaGraphApiError("Resposta da Meta sem id de mensagem.", response.status, body);
  }

  return { externalMessageId };
}

/// Chamada somente-leitura, usada só para validar se o token/número configurado
/// é uma credencial viva antes de tentar enviar algo de verdade.
export async function checkPhoneNumberCredential(phoneNumberId: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}?fields=id,display_phone_number`, {
    headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` },
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}
