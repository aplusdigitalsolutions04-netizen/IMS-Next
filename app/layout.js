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

export const metadata = {
  title: "IMS-APDS",
  description: "A Plus Digital Solutions — Inventory Management System",
  manifest: "/manifest.json",
  icons: {
    icon: "/Apluslogo.jpeg",
    shortcut: "/aplus.png",
    apple: "/icons/icon-192.png",
  },
};


export const viewport = {
  themeColor: "#4f46e5",
};

import { ThemeProvider } from "@/components/ThemeProvider";
import PwaRegister from "@/components/PwaRegister";
import DisableRightClick from "@/components/DisableRightClick";

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem enableColorScheme={false} disableTransitionOnChange>
          <PwaRegister />
          <DisableRightClick />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
