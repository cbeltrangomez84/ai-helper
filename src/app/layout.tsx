import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://print-task-creator.local"),
  title: "Print Task Creator",
  description: "Capture spoken requirements and create formatted tasks instantly.",
  applicationName: "Print Task Creator",
  icons: {
    icon: [
      { url: "/icons/task-creator.png", type: "image/png", sizes: "72x72" },
      { url: "/icons/task-creator-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/task-creator-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Print Task Creator",
  },
  formatDetection: {
    telephone: false,
  },
  themeColor: "#312e81",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
