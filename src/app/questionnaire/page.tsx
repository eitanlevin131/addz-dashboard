import type { Metadata } from "next";
import { PublicQuestionnaire } from "@/components/public-questionnaire";
export const metadata: Metadata = { title: "שאלון לקראת אפיון", referrer: "no-referrer", robots: { index: false, follow: false } };
export default function QuestionnairePage() { return <PublicQuestionnaire />; }
