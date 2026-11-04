import type { Metadata, Viewport } from "next";
import "@fontsource/yeseva-one/400.css";
import "@fontsource/hind/400.css";
import "@fontsource/hind/500.css";
import "@fontsource/hind/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wedding Betting",
  description: "A fictional-money betting game for wedding guests.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#a80f4f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="toran" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
