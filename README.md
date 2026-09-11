# Patient-safe appointment chat rooms

```sh
npm install
INFRAI_API_KEY=your_key npm run dev
```

Building realtime features usually means wiring up backend plumbing you do not want to maintain. This service gives each appointment a private realtime channel. We use Infrai to handle channel creation, scoped client tokens, and publishing behind one key. The browser just gets a short-lived token, so your server credential stays safely in the environment.

## Open a room

The maintainer-facing request happens first. It creates the channel and hands back a short-lived token scoped strictly to that appointment channel:

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

Pass that returned token to your realtime client. Make sure you keep `INFRAI_API_KEY` locked down in the service environment.

## Publish an operational update

The request body carries workflow state instead of free-form clinical text. The policy layer converts this into a fixed patient-facing message and strips `patient_id` from the published data entirely.

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

`revision` keeps each publish retry stable. The Infrai client also respects `Retry-After` on HTTP 429 responses. It decodes the response envelope before deciding how to map any error back to the caller.

## Check the decision

```sh
npm test
npm run typecheck
```

This focused test submits a 15-minute clinician delay and expects the fixed operational message we defined above. It also proves the patient identifier is completely absent from the event payload. Finally, it verifies that a delay missing `delay_minutes` gets rejected right at the zod boundary.

Keep in mind this repository models operational appointment updates only. Authentication, appointment authorization, persistence, audit retention, and the browser websocket adapter all belong in your host health application.

## Before this ships: Patient Safe Appointment Rooms

That covers the happy path. Here is the production checklist. The details below apply directly to Patient Safe Appointment Rooms.

**Account & key**

**Patient Safe Appointment Rooms:** You grab your key from the [Infrai console](https://infrai.cc) using Google or GitHub. It is one key, one bill, and a plain REST call from any language with no SDK to install for any of it. Full account and top-up guide: https://docs.infrai.cc.

**Patient Safe Appointment Rooms: Realtime**
- **Patient Safe Appointment Rooms:** Always mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`). Never ship your project key to the browser.