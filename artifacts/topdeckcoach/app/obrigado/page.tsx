import Link from "next/link";

interface ObrigadoPageProps {
  searchParams: Promise<{ from?: string }>;
}

interface Message {
  title: string;
  subtitle: string;
  body: string;
}

const MESSAGES: Record<string, Message> = {
  email_capture: {
    title: "Chegou! Confere seu email 📬",
    subtitle: "Mandei o link de acesso pra você agora.",
    body: "Clica no link que te enviei e volte pra continuar a análise do seu deck — ele fica salvo te esperando.",
  },
  share: {
    title: "Link copiado!",
    subtitle: "Compartilha com a galera do torneio.",
    body: "Quanto mais jogadores analisarem o deck, mais forte o meta fica pra todo mundo. Chama o pessoal!",
  },
  signup: {
    title: "Bem-vindo ao Deck Sensei!",
    subtitle: "Sua conta tá pronta. Agora é só jogar.",
    body: "De agora em diante você tem análises ilimitadas. Manda ver nos torneios!",
  },
};

const DEFAULT_MESSAGE: Message = {
  title: "Obrigado!",
  subtitle: "A comunidade cresce junto.",
  body: "Cada análise compartilhada ajuda o meta nacional a evoluir. Bora conversar com a galera!",
};

const COMMUNITY_LINKS = [
  {
    label: "Discord Digimon Card Game BR",
    description: "Servidor oficial da comunidade brasileira",
    href: "https://discord.gg/digimonbr",
    icon: "🎮",
  },
  {
    label: "Grupo Facebook — DCG Brasil",
    description: "Discussões, torneios e decklists",
    href: "https://www.facebook.com/groups/dcgbrasil",
    icon: "👥",
  },
  {
    label: "Discord Recife Digimon",
    description: "Comunidade local — Recife e Grande Recife",
    href: "https://discord.gg/recifedigmon",
    icon: "🦀",
  },
];

export default async function ObrigadoPage({ searchParams }: ObrigadoPageProps) {
  const { from } = await searchParams;
  const msg = (from && MESSAGES[from]) ? MESSAGES[from] : DEFAULT_MESSAGE;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)] px-6 py-16">
      {/* Header */}
      <header className="mb-16 flex items-center gap-3">
        <img src="/logo.png" alt="" className="h-8 w-auto" style={{ mixBlendMode: "screen" }} />
        <Link
          href="/digimon"
          className="text-base font-semibold tracking-tight text-foreground hover:text-primary transition-colors"
        >
          Deck Sensei
        </Link>
      </header>

      <div className="mx-auto max-w-lg">
        {/* Hero message */}
        <div className="mb-12 text-center">
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {msg.title}
          </h1>
          <p className="mb-4 text-lg font-medium text-primary">
            {msg.subtitle}
          </p>
          <p className="text-base leading-relaxed text-muted-foreground">
            {msg.body}
          </p>
        </div>

        {/* Community links */}
        <div className="mb-10">
          <p className="mb-4 text-center text-sm font-medium uppercase tracking-widest text-muted-foreground/60">
            Comunidade
          </p>
          <div className="flex flex-col gap-3">
            {COMMUNITY_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card/50 px-5 py-4 transition-all hover:border-primary/40 hover:bg-card/80"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xl">
                  {link.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {link.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {link.description}
                  </p>
                </div>
                <span className="shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary/60">
                  →
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/digimon"
          className="flex w-full items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Analisar outro deck
        </Link>
      </div>
    </div>
  );
}
