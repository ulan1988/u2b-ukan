import type { Metadata, Viewport } from "next";
import AppNav from "@/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "U2B ERP — управление заказами",
  description: "U2B — ERP-автоматизация бизнеса: заявки, склад, финансы.",
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
      </body>
    </html>
  );
}
