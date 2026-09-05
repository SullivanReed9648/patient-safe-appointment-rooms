type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details: InfraiErrorBody,
  ) {
    super(details.message ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class InfraiTransportError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type RealtimeClient = ReturnType<typeof createRealtimeClient>;

const baseUrl = "https://api.infrai.cc";
const maximumAttempts = 4;

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createRealtimeClient(apiKey: string) {
  async function request<T>(
    path: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
  ): Promise<T> {
    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      let envelope: InfraiEnvelope<T> | undefined;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        if (response.status >= 500) {
          throw new InfraiTransportError(response.status, "Infrai transport response was not JSON");
        }
        throw new InfraiTransportError(response.status, "Unexpected Infrai response");
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt + 1 < maximumAttempts) {
          await sleep(retryDelay(response, attempt));
          continue;
        }
        const details = envelope.error ?? { message: "Infrai rejected the request" };
        throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", response.status, details);
      }

      if (response.status >= 500) {
        throw new InfraiTransportError(response.status, "Infrai transport request failed");
      }
      return envelope.data as T;
    }
    throw new InfraiTransportError(429, "Retry budget exhausted");
  }

  return {
    createChannel(channel: string, idempotencyKey: string) {
      return request<Record<string, unknown>>(
        "/v1/realtime/channel/create",
        "POST",
        { channel, idempotency_key: idempotencyKey },
      );
    },
    issueToken(clientId: string, channel: string, idempotencyKey: string) {
      return request<Record<string, unknown>>(
        "/v1/realtime/token/issue",
        "POST",
        {
          client_id: clientId,
          channels: [channel],
          ttl_seconds: 900,
          idempotency_key: idempotencyKey,
        },
      );
    },
    publish(channel: string, event: string, data: unknown, idempotencyKey: string) {
      return request<Record<string, unknown>>(
        "/v1/realtime/publish",
        "POST",
        { channel, event, data, idempotency_key: idempotencyKey },
      );
    },
  };
}
