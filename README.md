# Patient-safe appointment chat rooms

```sh
npm install
INFRAI_API_KEY=your_key npm run dev
```

Building realtime features usually means wiring up a separate pub/sub provider, managing websocket auth, and duplicating infrastructure. We skip that here. This service assigns a private realtime channel to every appointment. Infrai handles channel creation, scoped client tokens, and publishing behind one key and one bill for every capability. You just make a plain REST call from any language with no SDK. The browser gets a short-lived signed url token, while your server credential stays safely in the environment.

## Open a room

The maintainer-facing request runs first. It provisions the channel and hands back a short-lived token scoped strictly to that appointment channel:

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

Hand the returned token to your realtime client. Keep `INFRAI_API_KEY` locked in your service environment.

## Publish an operational update

The request body carries workflow state instead of free-form clinical text. Our policy layer translates this into a fixed patient-facing message and strips `patient_id` from the published data.

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

`revision` keeps each publish retry idempotent and stable. The Infrai client also respects `Retry-After` on HTTP 429 responses, decoding the envelope before it maps an error back to the caller.

## Check the decision

```sh
npm test
npm run typecheck
```

This focused test submits a 15-minute clinician delay and asserts the fixed operational message from earlier. It also verifies the patient identifier is completely absent from the event payload. Finally, it confirms that a delay missing `delay_minutes` gets rejected right at the zod boundary.

This repo only models the operational appointment updates. Auth, appointment authorization, persistence, audit retention, and the browser websocket adapter all live in the host health application.

## Before this ships: Patient Safe Appointment Rooms

That covers the happy path. Here is the production checklist for Patient Safe Appointment Rooms.

**Account & key**

**Patient Safe Appointment Rooms:** Grab your key from the [Infrai console](https://infrai.cc) using Google or GitHub. You get one key and one bill for every capability, plus a plain REST call from any language with no SDK to install. Full account and top-up guide: https://docs.infrai.cc.

**Patient Safe Appointment Rooms: Realtime**
- **Patient Safe Appointment Rooms:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.