"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  evidenceId: number;
  initialUrl: string;
}

type Modal = "none" | "verify" | "reject";

export default function VerifyRejectButtons({ evidenceId, initialUrl }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>("none");
  const [url, setUrl] = useState(initialUrl);
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleVerify() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/evidences/${evidenceId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url || undefined, verification_note: note || undefined }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      setModal("none");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/evidences/${evidenceId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `Erro ${res.status}`);
      }
      setModal("none");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setModal("verify")}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
        >
          ✓ Verificar
        </button>
        <button
          onClick={() => setModal("reject")}
          className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive/80 transition-colors hover:bg-destructive/20"
        >
          ✕ Rejeitar
        </button>
      </div>

      {/* Verify Modal */}
      {modal === "verify" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-border/50 bg-card shadow-2xl">
            <div className="border-b border-border/40 px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">Confirmar verificação</h2>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">URL da fonte</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-md border border-border/50 bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nota de verificação (opcional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border/50 bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none resize-none"
                  placeholder="Ex: confirmado via resultado oficial do torneio"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border/40 px-5 py-3">
              <button
                onClick={() => setModal("none")}
                className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleVerify}
                disabled={loading}
                className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? "Verificando…" : "Confirmar verificação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {modal === "reject" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border/50 bg-card shadow-2xl">
            <div className="border-b border-border/40 px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">Rejeitar evidência</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">A evidência será deletada permanentemente.</p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Motivo (opcional)</label>
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full rounded-md border border-border/50 bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                  placeholder="Ex: dados incorretos, fonte não confiável"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border/40 px-5 py-3">
              <button
                onClick={() => setModal("none")}
                className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={loading}
                className="rounded-md bg-destructive px-4 py-1.5 text-xs font-semibold text-white hover:bg-destructive/80 disabled:opacity-50"
              >
                {loading ? "Deletando…" : "Deletar evidência"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
