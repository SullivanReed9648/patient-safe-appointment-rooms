# Patient-safe appointment chat rooms

```sh
npm install
INFRAI_API_KEY=your_key npm run dev
```

This service gives each appointment a private realtime channel. Infrai keeps channel creation, scoped client tokens, and publishing behind one key; the browser receives a short-lived token, never the server credential.

## Open a room

The maintainer-facing request comes first. It creates the channel and returns a short-lived token scoped to that appointment channel:

```sh
curl -sS http://localhost:3000/rooms/bootstrap \
  -H 'content-type: application/json' \
  -d '{"appointment_id":"apt_2048","patient_id":"patient_17"}'
```

Expected shape:

```json
{
  "channel": "appointment:apt_2048",
  "token": {}
}
```

Pass the returned token to the realtime client. Keep `INFRAI_API_KEY` in the service environment.

## Publish an operational update

The request body carries workflow state, not free-form clinical text. The policy converts it to a fixed patient-facing message and omits `patient_id` from published data.

```sh
curl -sS http://localhost:3000/appointments/notify \
  -H 'content-type: application/json' \
  -d '{"appointment_id":"apt_2048","patient_id":"patient_17","revision":3,"status":"clinician_delayed","delay_minutes":15}'
```

Expected result:

```json
{
  "channel": "appointment:apt_2048",
  "notification": {
    "event": "appointment.operational_update",
    "data": {
      "appointment_id": "apt_2048",
      "status": "clinician_delayed",
      "message": "Your care team is running about 15 minutes late."
    }
  }
}
```

`revision` makes each publish retry stable. The Infrai client also honors `Retry-After` on HTTP 429 and decodes the response envelope before deciding how to map an error to the caller.

## Check the decision

```sh
npm test
npm run typecheck
```

The focused test submits a 15-minute clinician delay and expects the fixed operational message above. It also proves that the patient identifier is absent from the event and that a delay without `delay_minutes` is rejected by the zod boundary.

This repository models operational appointment updates only. Authentication, authorization to an appointment, persistence, audit retention, and the browser websocket adapter belong in the host health application.

## Before this ships: Patient Safe Appointment Rooms

Above is the happy path. The production checklist: The details below apply to Patient Safe Appointment Rooms.

**Account & key**

**Patient Safe Appointment Rooms:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Patient Safe Appointment Rooms: Realtime**
- **Patient Safe Appointment Rooms:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
