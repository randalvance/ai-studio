import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Rail } from "@/components/rail";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Video Studio",
  description: "Generate images, video and audio with catalog models, organized by project.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex font-sans">
        <Rail />
        <div className="flex min-h-screen flex-1 min-w-0">{children}</div>
      </body>
    </html>
  );
}
