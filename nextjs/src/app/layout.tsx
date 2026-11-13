import type { Metadata, Viewport } from "next";
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
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          // Колесо мыши НЕ меняет число в поле: снимаем фокус, иначе прокрутка страницы
          // накручивала суммы в накладной (крутилки у number-полей убраны в globals.css).
          document.addEventListener('wheel', function (e) {
            var el = document.activeElement;
            if (el && el.tagName === 'INPUT' && el.type === 'number' && el === e.target) el.blur();
          }, { passive: true });
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); });
          }
        `}} />
      </body>
    </html>
  );
}
