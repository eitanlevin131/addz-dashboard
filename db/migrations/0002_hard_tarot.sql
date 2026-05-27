ALTER TABLE "automation_reports" ADD COLUMN "sent_emails" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_reports" ADD COLUMN "opened_emails" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_reports" ADD COLUMN "clicked_emails" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_reports" ADD COLUMN "sent_sms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_reports" ADD COLUMN "clicked_sms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_reports" ADD COLUMN "total_entered" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_reports" ADD COLUMN "total_completed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_reports" ADD COLUMN "failed_messages" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaign_reports" DROP COLUMN "sent_emails";--> statement-breakpoint
ALTER TABLE "email_campaign_reports" DROP COLUMN "opened_emails";--> statement-breakpoint
ALTER TABLE "email_campaign_reports" DROP COLUMN "clicked_emails";--> statement-breakpoint
ALTER TABLE "email_campaign_reports" DROP COLUMN "sent_sms";--> statement-breakpoint
ALTER TABLE "email_campaign_reports" DROP COLUMN "clicked_sms";--> statement-breakpoint
ALTER TABLE "email_campaign_reports" DROP COLUMN "total_entered";--> statement-breakpoint
ALTER TABLE "email_campaign_reports" DROP COLUMN "total_completed";--> statement-breakpoint
ALTER TABLE "email_campaign_reports" DROP COLUMN "failed_messages";