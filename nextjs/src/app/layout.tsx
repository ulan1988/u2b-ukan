import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "U2B — учёт",
  description: "ERP-ядро: документы, склад, финансы",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${inter.className} bg-neutral-50 text-neutral-900`}>
        <nav className="bg-white border-b border-neutral-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-1">
            <span className="font-bold mr-4">U2B</span>
            <Link href="/documents" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-neutral-100">📥 Приход</Link>
            <Link href="/sales" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-neutral-100">📤 Расход</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
