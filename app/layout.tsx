import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import StoreProvider from "@/src/components/StoreProvider";
import QueryProvider from "@/src/components/QueryProvider";
import AccountProvider from "@/src/components/AccountProvider";
import Header from "@/src/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Personal Finance",
    template: "%s | Personal Finance",
  },
  description: "Track accounts, manage 50/20/30 envelope budgets, and monitor savings goals.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <StoreProvider>
          <QueryProvider>
            <AccountProvider>
              <Header />
              {children}
            </AccountProvider>
          </QueryProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
