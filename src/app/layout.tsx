import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flashy Growth Desk",
  description: "דאשבורד פנימי לניהול לקוחות Flashy ואימייל מרקטינג",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
