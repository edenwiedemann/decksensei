"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA",
  "MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN",
  "RO","RR","RS","SC","SE","SP","TO",
];

interface AuthRequiredModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ModalPhase = "form" | "loading" | "sent";

export default function AuthRequiredModal({
  open,
  onOpenChange,
}: AuthRequiredModalProps) {
  const [phase, setPhase] = useState<ModalPhase>("form");
  const [email, setEmail] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [fieldError, setFieldError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError("");

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError("Coloca um e-mail válido.");
      return;
    }

    setPhase("loading");

    try {
      await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          city: cidade.trim() || undefined,
          state: estado || undefined,
        }),
      });
    } catch {
      // Segue p/ "sent" mesmo em erro de rede — anti-enumeration
    }

    setPhase("sent");
  }

  function handleClose(open: boolean) {
    if (!open) {
      // Reseta estado ao fechar
      setPhase("form");
      setEmail("");
      setCidade("");
      setEstado("");
      setFieldError("");
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {phase === "sent" ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-3xl">
              ✉
            </div>
            <DialogHeader>
              <DialogTitle>Confere o seu e-mail</DialogTitle>
              <DialogDescription className="mt-1">
                Enviei o link pro{" "}
                <span className="font-medium text-foreground">{email}</span> —
                clica nele pra continuar. Ele expira em 15 minutos.
              </DialogDescription>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Quando você clicar, a análise do deck retoma automaticamente.
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Cria sua conta pra continuar</DialogTitle>
              <DialogDescription>
                Leva 30 segundos — só email, sem senha. Mandamos um link de
                acesso direto.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="auth-email">E-mail</Label>
                <Input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={phase === "loading"}
                  required
                />
                {fieldError && (
                  <p className="text-xs text-destructive">{fieldError}</p>
                )}
              </div>

              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="auth-cidade">
                    Cidade{" "}
                    <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="auth-cidade"
                    type="text"
                    placeholder="Recife"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    disabled={phase === "loading"}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="auth-estado">
                    UF{" "}
                    <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <select
                    id="auth-estado"
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    disabled={phase === "loading"}
                    className="h-10 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">—</option>
                    {UF_LIST.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={phase === "loading"}>
                {phase === "loading" ? "Enviando..." : "Receber link de acesso"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Sem spam. Sem senha. Só você e seu deck.
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
