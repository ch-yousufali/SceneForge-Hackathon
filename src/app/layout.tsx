import type { Metadata, Viewport } from "next";
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

const description =
  "Describe a place in one sentence and get an instant 3D blockout — layout, lighting, palette and mood — ready to export to your game engine.";

export const metadata: Metadata = {
  title: "SceneForge — Text to 3D Blockout",
  description,
  applicationName: "SceneForge",
  keywords: ["level design", "blockout", "greybox", "game development", "3D", "scene layout", "indie games"],
  openGraph: {
    title: "SceneForge — Text to 3D Blockout",
    description,
    type: "website",
  },
  twitter: { card: "summary", title: "SceneForge — Text to 3D Blockout", description },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
