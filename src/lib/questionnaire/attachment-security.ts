import { createHmac, timingSafeEqual } from "node:crypto";
import { attachmentPathIsSafe, type QuestionnaireAttachment } from "./attachments.ts";

export function attachmentPrefix(questionnaireId: string, secret: string) {
  return `questionnaire-assets/${createHmac("sha256", secret).update(`questionnaire-upload:${questionnaireId}`).digest("hex")}/`;
}
export function attachmentBelongsTo(pathname: string, questionnaireId: string, secret: string) {
  return attachmentPathIsSafe(pathname) && pathname.startsWith(attachmentPrefix(questionnaireId, secret));
}
export function attachmentReceipt(attachment: Omit<QuestionnaireAttachment, "receipt">, questionnaireId: string, secret: string) {
  return createHmac("sha256", secret).update(JSON.stringify(["questionnaire-file", questionnaireId, attachment.pathname, attachment.name, attachment.size, attachment.contentType])).digest("hex");
}
export function validAttachmentReceipt(attachment: QuestionnaireAttachment, questionnaireId: string, secret: string) {
  if (!attachmentBelongsTo(attachment.pathname, questionnaireId, secret) || !/^[a-f0-9]{64}$/.test(attachment.receipt)) return false;
  return timingSafeEqual(Buffer.from(attachment.receipt, "hex"), Buffer.from(attachmentReceipt(attachment, questionnaireId, secret), "hex"));
}
