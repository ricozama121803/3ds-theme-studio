import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "3DS Theme Studio",
  description: "Make custom Nintendo 3DS Home Menu themes from your own pictures, colours, music and sounds.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='3' y='2' width='26' height='13' rx='3' fill='%23ff4d63'/%3E%3Crect x='6' y='17' width='20' height='13' rx='3' fill='%234f8cff'/%3E%3Cellipse cx='11.5' cy='8.4' rx='2.7' ry='3.1' fill='white'/%3E%3Cellipse cx='20.5' cy='8.4' rx='2.7' ry='3.1' fill='white'/%3E%3Ccircle cx='12' cy='8.8' r='1.45' fill='%2314141c'/%3E%3Ccircle cx='21' cy='8.8' r='1.45' fill='%2314141c'/%3E%3C/svg%3E",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-neutral-950 font-sans text-neutral-200 antialiased`}>
        {children}
      </body>
    </html>
  );
}
