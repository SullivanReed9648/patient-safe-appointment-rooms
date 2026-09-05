import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { createRealtimeClient, InfraiError, InfraiTransportError } from "./infrai_realtime.js";
import { appointmentChannel, appointmentUpdateSchema, patientNotification } from "./notification_policy.js";

const bootstrapSchema = z.object({
  appointment_id: z.string().min(1).max(100),
  patient_id: z.string().min(1).max(100),
}).strict();

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the server");

const realtimeClient = createRealtimeClient(apiKey);

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error("Request body exceeds 16 KiB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/rooms/bootstrap") {
      const input = bootstrapSchema.parse(await readJson(request));
      const channel = appointmentChannel(input.appointment_id);
      await realtimeClient.createChannel(channel, `appointment-room:${input.appointment_id}`);
      const token = await realtimeClient.issueToken(
        input.patient_id,
        channel,
        `appointment-token:${input.appointment_id}:${input.patient_id}`,
      );
      send(response, 201, { channel, token });
      return;
    }

    if (request.method === "POST" && request.url === "/appointments/notify") {
      const input = appointmentUpdateSchema.parse(await readJson(request));
      const notification = patientNotification(input);
      const channel = appointmentChannel(input.appointment_id);
      await realtimeClient.publish(
        channel,
        notification.event,
        notification.data,
        `appointment-update:${input.appointment_id}:${input.revision}`,
      );
      send(response, 202, { channel, notification });
      return;
    }

    send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      send(response, 400, { error: "Invalid request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, message: error.message });
      return;
    }
    if (error instanceof InfraiTransportError) {
      send(response, 502, { error: "Upstream transport error" });
      return;
    }
    send(response, 400, { error: error instanceof Error ? error.message : "Invalid request" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`appointment room service listening on http://localhost:${port}`);
});
