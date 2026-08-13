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

async function postMessage(phoneNumberId: string, accessToken: string, body: Record<string, unknown>): Promise<SendTextResult> {
  const response = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseBody = (await response.json().catch(() => null)) as { messages?: { id: string }[]; error?: unknown } | null;

  if (!response.ok) {
    throw new MetaGraphApiError(`Meta Graph API respondeu ${response.status}`, response.status, responseBody);
  }

  const externalMessageId = responseBody?.messages?.[0]?.id;
  if (!externalMessageId) {
    throw new MetaGraphApiError("Resposta da Meta sem id de mensagem.", response.status, responseBody);
  }

  return { externalMessageId };
}

export async function sendTextMessage(phoneNumberId: string, toWaId: string, text: string, accessToken: string): Promise<SendTextResult> {
  return postMessage(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to: toWaId,
    type: "text",
    text: { body: text },
  });
}

type MediaMessageType = "image" | "audio" | "document" | "sticker";

/// image/document aceitam caption; document também aceita filename (Meta
/// mostra ele no card do anexo pro cliente). audio/sticker não têm caption.
export async function sendMediaMessage(
  phoneNumberId: string,
  toWaId: string,
  type: MediaMessageType,
  mediaUrl: string,
  accessToken: string,
  options: { caption?: string; filename?: string } = {},
): Promise<SendTextResult> {
  const media: Record<string, unknown> = { link: mediaUrl };
  if (options.caption && (type === "image" || type === "document")) media.caption = options.caption;
  if (options.filename && type === "document") media.filename = options.filename;

  return postMessage(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to: toWaId,
    type,
    [type]: media,
  });
}

/// Marca a última mensagem do cliente como lida (tique azul) e, opcionalmente,
/// liga o indicador "digitando..." no WhatsApp do cliente — mesma chamada da
/// Cloud API pros dois casos (typing_indicator só fica ativo por ~25s ou até
/// a próxima mensagem ser enviada, o que vier primeiro).
export async function sendReadReceipt(
  phoneNumberId: string,
  messageId: string,
  accessToken: string,
  options: { typingIndicator?: boolean } = {},
): Promise<void> {
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  };
  if (options.typingIndicator) {
    body.typing_indicator = { type: "text" };
  }

  const response = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new MetaGraphApiError(`Meta Graph API respondeu ${response.status} ao marcar leitura`, response.status, errorBody);
  }
}

/// Chamada somente-leitura, usada só para validar se o token/número configurado
/// é uma credencial viva antes de tentar enviar algo de verdade.
export async function checkPhoneNumberCredential(phoneNumberId: string, accessToken: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}?fields=id,display_phone_number`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}
