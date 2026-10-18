import "dotenv/config";
import { Resend } from "resend";
import { getEnv } from "./get-env";

export interface transportMailType {
  email: string;
  subject: string;
  message: any;
}

const { SENDER_EMAIL, REPLYTO_EMAIL, RESEND_API_KEY } = getEnv(["SENDER_EMAIL", "REPLYTO_EMAIL", "RESEND_API_KEY"]);

const resend = new Resend(RESEND_API_KEY!);

export async function sendMail(formData: transportMailType) {
  try {
    await resend.emails.send({
      from: SENDER_EMAIL!,
      to: formData.email,
      subject: formData.subject,
      html: formData.message,
      ...(REPLYTO_EMAIL && { replyTo: REPLYTO_EMAIL }),
    });
  } catch (error) {
    throw error;
  }
}
