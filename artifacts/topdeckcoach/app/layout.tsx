import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deck Sensei",
  description:
    "Análise estratégica de decks de TCG por inteligência artificial, em português brasileiro.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
