import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrewTools",
  description:
    "Everything you need. One place. Seniority, pay, and reserve tools brought together in one clean, mobile-first experience for pilots.",
  metadataBase: new URL("https://crewtools.app"),
  openGraph: {
    title: "CrewTools",
    description:
      "Everything you need. One place. Seniority, pay, and reserve tools brought together in one clean, mobile-first experience for pilots.",
    url: "https://crewtools.app",
    siteName: "CrewTools",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CrewTools",
    description:
      "Everything you need. One place. Seniority, pay, and reserve tools brought together in one clean, mobile-first experience for pilots.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
