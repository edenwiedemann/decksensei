import Link from "next/link";
import AutoVerify from "./_components/AutoVerify";

interface VerifyPageProps {
  searchParams: Promise<{ token?: string; error?: string }>;
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { token, error } = await searchParams;

  // ── Erro explícito (link inválido/expirado/já usado) ──────────────────────
  if (error === "invalid" || (!token && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[hsl(224,40%,5%)] via-[hsl(224,38%,7%)] to-[hsl(224,35%,10%)] px-6">
        <div className="w-full max-w-sm rounded-xl border border-border/60 bg-card/60 p-8 text-center shadow-xl backdrop-blur-sm">
          <div className="mb-4 flex justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-2xl">
              ✕
            </span>
          </div>
          <h1 className="mb-2 text-lg font-semibold text-foreground">
            Link inválido ou expirado
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Esse link já foi usado ou expirou. Links são válidos por 15 minutos
            e de uso único.
          </p>
          <Link
            href="/digimon"
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Pedir um novo link
          </Link>
        </div>
      </div>
    );
  }

  // ── Token presente — auto-submit do server action ─────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[hsl(224,40%,5%)] via-[hsl(224,38%,7%)] to-[hsl(224,35%,10%)] px-6">
      <div className="w-full max-w-sm rounded-xl border border-border/60 bg-card/60 p-8 text-center shadow-xl backdrop-blur-sm">
        <div className="mb-4 flex justify-center">
          <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-full bg-primary/15 text-2xl">
            ⟳
          </span>
        </div>
        <h1 className="mb-2 text-lg font-semibold text-foreground">
          Verificando seu acesso…
        </h1>
        <p className="text-sm text-muted-foreground">
          Aguarda um segundo, estamos te autenticando.
        </p>

        {/* Form oculto que auto-submete o token via server action */}
        <AutoVerify token={token!} />
      </div>
    </div>
  );
}
