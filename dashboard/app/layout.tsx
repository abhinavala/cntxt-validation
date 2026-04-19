import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warden Dashboard",
  description: "Warden monitoring dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 bg-gray-900">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <span className="text-lg font-semibold text-white">Warden</span>
            <Link
              href="/timeline"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Timeline
            </Link>
            <Link
              href="/credentials"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Credentials
            </Link>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
