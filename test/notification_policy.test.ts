import assert from "node:assert/strict";
import test from "node:test";
import { appointmentUpdateSchema, patientNotification } from "../src/notification_policy.js";

test("a delay becomes a patient-safe operational notification", () => {
  const update = appointmentUpdateSchema.parse({
    appointment_id: "apt_2048",
    patient_id: "patient_private_17",
    revision: 3,
    status: "clinician_delayed",
    delay_minutes: 15,
  });

  const notification = patientNotification(update);

  assert.deepEqual(notification, {
    event: "appointment.operational_update",
    data: {
      appointment_id: "apt_2048",
      status: "clinician_delayed",
      message: "Your care team is running about 15 minutes late.",
    },
  });
  assert.equal(JSON.stringify(notification).includes(update.patient_id), false);
});

test("a delay without a duration is rejected at the request boundary", () => {
  const result = appointmentUpdateSchema.safeParse({
    appointment_id: "apt_2048",
    patient_id: "patient_private_17",
    revision: 4,
    status: "clinician_delayed",
  });

  assert.equal(result.success, false);
});
