import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { AttributionLog } from "@/components/AttributionLog";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "NextFlow — LLM Workflow Builder",
  description: "Build, run, and inspect Gemini-powered LLM workflows visually.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${inter.variable} font-sans antialiased`}>
          <AttributionLog />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
