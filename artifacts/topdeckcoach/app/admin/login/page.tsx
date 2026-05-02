"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLoginPage() {
  const router = useRouter();
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
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/admin/analyses");
        return;
      }

      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(
        res.status === 401
          ? "Senha incorreta."
          : (body?.error ?? "Erro inesperado — tenta de novo."),
      );
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[hsl(224,40%,5%)] via-[hsl(224,38%,7%)] to-[hsl(224,35%,10%)] px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground/60">
            TopdeckCoach
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
              <Label htmlFor="admin-password">Senha</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoFocus
                required
              />
            </div>

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive/80">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading || !password}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
