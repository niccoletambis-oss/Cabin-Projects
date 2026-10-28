import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: "Cabin | Inventory",
  description: "Thoughtful inventory management for Cabin Bed & Breakfast",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
