import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans_Thai } from "next/font/google";
import AppBar from "./app-bar.tsx";
import "./globals.css";

const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Chart Sense PLK", template: "%s · Chart Sense PLK" },
  description: "สรุปเวชระเบียนผู้ป่วยใน ตรวจรหัส ICD-10-TM / ICD-9-CM และคำนวณ Thai DRG 6.3 ในเครื่อง",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${plexThai.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppBar />
        {children}
      </body>
    </html>
  );
}
