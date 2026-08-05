import type { Metadata, Viewport } from "next";
import AppNav from "@/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "U2B ERP — управление заказами",
  description: "U2B — ERP-автоматизация бизнеса: заявки, склад, финансы.",
  manifest: "/manifest.json",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon-180.png" },
  appleWebApp: { capable: true, title: "U2B ERP", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#211f1c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <AppNav />
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); });
          }
        `}} />
      </body>
    </html>
  );
}
