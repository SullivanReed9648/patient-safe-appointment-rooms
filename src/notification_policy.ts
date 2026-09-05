import { z } from "zod";

export const appointmentUpdateSchema = z.object({
  appointment_id: z.string().min(1).max(100),
  patient_id: z.string().min(1).max(100),
  revision: z.number().int().nonnegative(),
  status: z.enum(["confirmed", "clinician_delayed", "ready", "completed", "cancelled"]),
  delay_minutes: z.number().int().min(1).max(240).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "clinician_delayed" && value.delay_minutes === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["delay_minutes"],
      message: "delay_minutes is required when the clinician is delayed",
    });
  }
  if (value.status !== "clinician_delayed" && value.delay_minutes !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["delay_minutes"],
      message: "delay_minutes is only accepted for a clinician delay",
    });
  }
});

export type AppointmentUpdate = z.infer<typeof appointmentUpdateSchema>;

export type PatientNotification = {
  event: "appointment.operational_update";
  data: {
    appointment_id: string;
    status: AppointmentUpdate["status"];
    message: string;
  };
};

export function patientNotification(update: AppointmentUpdate): PatientNotification {
  const messages: Record<AppointmentUpdate["status"], string> = {
    confirmed: "Your appointment is confirmed.",
    clinician_delayed: `Your care team is running about ${update.delay_minutes} minutes late.`,
    ready: "Your care team is ready. You can join the appointment room.",
    completed: "Your appointment is complete.",
    cancelled: "Your appointment was cancelled. Contact the clinic to reschedule.",
  };

  return {
    event: "appointment.operational_update",
    data: {
      appointment_id: update.appointment_id,
      status: update.status,
      message: messages[update.status],
    },
  };
}

export function appointmentChannel(appointmentId: string): string {
  return `appointment:${appointmentId}`;
}
