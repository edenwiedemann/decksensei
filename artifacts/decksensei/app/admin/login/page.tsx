"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (res.ok) {
        router.push("/admin");
        return;
      }

      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(
        res.status === 401
          ? "Email ou senha incorretos."
          : (body?.error ?? "Erro inesperado — tenta de novo."),
      );
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[hsl(240,30%,5%)] via-[hsl(240,25%,7%)] to-[hsl(240,22%,9%)] px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/logo.png" alt="Deck Sensei" className="mx-auto mb-4 h-20 w-auto" style={{ mixBlendMode: "screen" }} />
          <p className="text-xs uppercase tracking-widest text-muted-foreground/60">
            Deck Sensei
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            Painel Admin
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-border/60 bg-card/60 p-6 shadow-xl backdrop-blur-sm"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoFocus
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-password">Senha</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive/80">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading || !email || !password}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
