import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "addz Growth OS",
    template: "%s | addz Growth OS",
  },
  applicationName: "addz Growth OS",
  description: "מערכת הביצועים והתפעול של addz לניהול פעילות אימייל, SMS ואוטומציות",
  icons: {
    icon: "/addz-logo.svg",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
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
