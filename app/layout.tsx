import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Summit Video",
  description: "A simple two-person browser video call app.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
