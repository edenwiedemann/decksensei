import type { Metadata } from "next";
import "./globals.css";
import PostHogInit from "./_components/PostHogInit";

export const metadata: Metadata = {
  title: "Deck Sensei",
  description:
    "Análise estratégica de decks de TCG por inteligência artificial, em português brasileiro.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <PostHogInit />
        {children}
      </body>
    </html>
  );
}
