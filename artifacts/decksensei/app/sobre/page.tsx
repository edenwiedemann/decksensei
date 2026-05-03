import Link from "next/link";

export const metadata = {
  title: "Sobre — Deck Sensei",
  description: "A história por trás do Deck Sensei.",
};

export default function SobrePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)]">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center gap-3 border-b border-border/40 px-6 py-3 backdrop-blur-sm">
        <img
          src="/logo.png"
          alt=""
          className="h-8 w-auto"
          style={{ mixBlendMode: "screen" }}
        />
        <span className="text-base font-semibold tracking-tight text-foreground">
          Deck Sensei
        </span>
        <span className="ml-auto">
          <Link
            href="/digimon"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Voltar ao app
          </Link>
        </span>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Sobre o Deck Sensei
        </h1>

        <div className="mt-8 space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            O Deck Sensei nasceu de uma brincadeira de pai e filho. Meu filho
            [NOME_FILHO] começou a jogar Digimon Card Game e ficava me pedindo
            para analisar o deck dele depois de cada rodada. Eu não entendia
            nada do jogo — mas sabia que a IA poderia ajudar.
          </p>

          <p>
            O que era pra ser um script rápido virou uma plataforma: análise
            estratégica em tempo real, meta atualizado, sugestões de troca
            baseadas no que está sendo jogado em torneios ao redor do mundo.
          </p>

          <p>
            Hoje o Deck Sensei é usado pela comunidade de Recife e por
            jogadores de todo o Brasil. O objetivo continua o mesmo: ajudar
            qualquer jogador, do iniciante ao competitivo, a entender melhor o
            próprio deck.
          </p>
        </div>

        {/* Comunidade */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-foreground">
            Entre na comunidade
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Discussões de meta, decklists e novidades dos torneios locais.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="https://discord.gg/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-card/60 px-5 py-3 text-sm font-medium text-foreground transition-all hover:border-primary/50 hover:bg-card/80"
            >
              <span className="text-base">💬</span>
              Discord
            </a>

            <a
              href="https://wa.me/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-card/60 px-5 py-3 text-sm font-medium text-foreground transition-all hover:border-primary/50 hover:bg-card/80"
            >
              <span className="text-base">📱</span>
              WhatsApp
            </a>

            <a
              href="https://instagram.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-card/60 px-5 py-3 text-sm font-medium text-foreground transition-all hover:border-primary/50 hover:bg-card/80"
            >
              <span className="text-base">📸</span>
              Instagram
            </a>
          </div>
        </div>

        {/* Voltar */}
        <div className="mt-16 border-t border-border/30 pt-8">
          <Link
            href="/digimon"
            className="text-sm text-primary hover:underline"
          >
            ← Analisar meu deck
          </Link>
        </div>
      </main>
    </div>
  );
}
