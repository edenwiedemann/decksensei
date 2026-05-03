"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface GameFormProps {
  mode: "create" | "edit";
  initialId?: string;
  initialName?: string;
  initialConfig?: string;
}

const PARSER_EXAMPLE = JSON.stringify(
  {
    line_patterns: [
      "^\\s*(\\d+)\\s*x?\\s+([A-Za-z]{1,4}\\d*-\\d+)(?:\\s+(.+?))?\\s*$",
    ],
    groups: { quantity: 1, code: 2, name: 3 },
    section_markers: { egg: ["egg deck", "ovos"] },
    comment_prefixes: ["#", "//"],
  },
  null,
  2,
);

const CARD_API_EXAMPLE = JSON.stringify(
  {
    url_template: "https://api.exemplo.com/card/{code}",
    search_url_template: "https://api.exemplo.com/search?name={query}",
    response_path: "$[0]",
    field_mapping: {
      code: "id",
      name: "name",
      color: "color",
      type: "type",
      level: "level",
      playCost: "play_cost",
      dp: "dp",
      attribute: "attribute",
      mainEffect: "main_effect",
      inheritedEffect: "source_effect",
      imageUrl: "image_url",
    },
    image_url_template: "",
    rate_limit: { max: 10, window_sec: 10 },
    headers: { Accept: "application/json" },
    timeout_ms: 8000,
  },
  null,
  2,
);

const VALIDATOR_EXAMPLE = JSON.stringify(
  {
    main_deck_size: { min: 60, max: 60 },
    aux_decks: {},
    max_copies_per_card: 4,
    color_warning_threshold: 3,
  },
  null,
  2,
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryParseJson(s: string): [any, string | null] {
  try {
    return [JSON.parse(s), null];
  } catch (e) {
    return [null, (e as Error).message];
  }
}

export default function GameForm({
  mode,
  initialId = "",
  initialName = "",
  initialConfig = "",
}: GameFormProps) {
  const router = useRouter();

  const [gameId, setGameId] = useState(initialId);
  const [gameName, setGameName] = useState(initialName);
  const [parserJson, setParserJson] = useState(() => {
    if (initialConfig) {
      const [c] = tryParseJson(initialConfig);
      return c?.parser ? JSON.stringify(c.parser, null, 2) : PARSER_EXAMPLE;
    }
    return PARSER_EXAMPLE;
  });
  const [cardApiJson, setCardApiJson] = useState(() => {
    if (initialConfig) {
      const [c] = tryParseJson(initialConfig);
      return c?.card_api
        ? JSON.stringify(c.card_api, null, 2)
        : CARD_API_EXAMPLE;
    }
    return CARD_API_EXAMPLE;
  });
  const [validatorJson, setValidatorJson] = useState(() => {
    if (initialConfig) {
      const [c] = tryParseJson(initialConfig);
      return c?.validator
        ? JSON.stringify(c.validator, null, 2)
        : VALIDATOR_EXAMPLE;
    }
    return VALIDATOR_EXAMPLE;
  });

  const [extraConfig, setExtraConfig] = useState(() => {
    if (initialConfig) {
      const [c] = tryParseJson(initialConfig);
      if (c) {
        const {
          parser: _p,
          card_api: _ca,
          validator: _v,
          id: _id,
          name: _n,
          ...rest
        } = c;
        return JSON.stringify(rest, null, 2);
      }
    }
    return JSON.stringify(
      {
        card_code_pattern: "^[A-Z]{2,4}\\d*-\\d+$",
        card_code_examples: [],
        deck_rules: {
          main_deck_size: 60,
          egg_deck_min: 0,
          egg_deck_max: 0,
          max_copies_per_card: 4,
        },
      },
      null,
      2,
    );
  });

  // ── Teste ─────────────────────────────────────────────────────────────────
  const [sampleDecklist, setSampleDecklist] = useState("");
  const [sampleCardCode, setSampleCardCode] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testPassed, setTestPassed] = useState(false);

  const handleTest = useCallback(async () => {
    const [parser, parserErr] = tryParseJson(parserJson);
    const [card_api, cardApiErr] = tryParseJson(cardApiJson);
    const [validator, validatorErr] = tryParseJson(validatorJson);

    if (parserErr || cardApiErr || validatorErr) {
      setTestResult(
        `JSON inválido:\n${[parserErr, cardApiErr, validatorErr].filter(Boolean).join("\n")}`,
      );
      setTestPassed(false);
      return;
    }

    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/games/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? ""}`,
        },
        body: JSON.stringify({
          parser,
          card_api,
          validator,
          sample_decklist: sampleDecklist,
          sample_card_code: sampleCardCode,
        }),
      });
      const data = (await res.json()) as {
        parser?: unknown;
        card?: unknown;
        validation?: unknown;
        errors: string[];
      };
      setTestResult(JSON.stringify(data, null, 2));
      setTestPassed(data.errors.length === 0);
    } catch (e) {
      setTestResult(`Erro: ${(e as Error).message}`);
      setTestPassed(false);
    } finally {
      setTestLoading(false);
    }
  }, [parserJson, cardApiJson, validatorJson, sampleDecklist, sampleCardCode]);

  // ── Salvar ─────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    const [parser, parserErr] = tryParseJson(parserJson);
    const [card_api, cardApiErr] = tryParseJson(cardApiJson);
    const [validator, validatorErr] = tryParseJson(validatorJson);
    const [extra, extraErr] = tryParseJson(extraConfig);

    const errs = [parserErr, cardApiErr, validatorErr, extraErr].filter(
      Boolean,
    );
    if (errs.length > 0) {
      setSaveError(`JSON inválido:\n${errs.join("\n")}`);
      return;
    }
    if (!gameId.trim()) {
      setSaveError("ID é obrigatório.");
      return;
    }
    if (!gameName.trim()) {
      setSaveError("Nome é obrigatório.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    const config = { ...extra, parser, card_api, validator };

    try {
      const url =
        mode === "create"
          ? "/api/admin/games"
          : `/api/admin/games/${gameId}`;
      const method = mode === "create" ? "POST" : "PUT";
      const body =
        mode === "create"
          ? { id: gameId, name: gameName, config }
          : { name: gameName, config };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok) {
        setSaveError(data.error ?? "Erro ao salvar.");
        return;
      }

      router.push("/admin/games");
      router.refresh();
    } catch (e) {
      setSaveError(`Erro: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [
    mode,
    gameId,
    gameName,
    parserJson,
    cardApiJson,
    validatorJson,
    extraConfig,
    router,
  ]);

  return (
    <div className="space-y-8">
      {/* ── Seção 1: Identidade ─────────────────────────────────── */}
      <Section title="Identidade" icon="🎮">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              ID (slug único)
            </label>
            <input
              type="text"
              value={gameId}
              onChange={(e) =>
                setGameId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }
              disabled={mode === "edit"}
              placeholder="ex: lorcana, one-piece, swu"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Nome do jogo
            </label>
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="ex: Lorcana, One Piece Card Game"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Config extra (card_code_pattern, deck_rules, etc.)
          </label>
          <JsonTextarea
            value={extraConfig}
            onChange={setExtraConfig}
            rows={8}
          />
        </div>
      </Section>

      {/* ── Seção 2: Parser ─────────────────────────────────────── */}
      <Section title="Parser de decklist" icon="📋">
        <p className="text-xs text-muted-foreground">
          Define como linhas da decklist são reconhecidas.{" "}
          <code className="rounded bg-muted/30 px-1">line_patterns</code>:
          lista de regex com capture groups. <code>groups</code>: índices dos
          grupos (1-based). <code>section_markers</code>: linhas que ativam
          decks auxiliares.
        </p>
        <JsonTextarea value={parserJson} onChange={setParserJson} rows={14} />
      </Section>

      {/* ── Seção 3: Card API ───────────────────────────────────── */}
      <Section title="Card API" icon="🔌">
        <p className="text-xs text-muted-foreground">
          <code className="rounded bg-muted/30 px-1">url_template</code>: use{" "}
          <code>{"{code}"}</code> onde a API espera o código.{" "}
          <code>response_path</code>: <code>$</code> = raiz,{" "}
          <code>$[0]</code> = primeiro elemento.{" "}
          <code>field_mapping</code>: campo interno → caminho dot-notation na
          resposta.
        </p>
        <JsonTextarea value={cardApiJson} onChange={setCardApiJson} rows={22} />
      </Section>

      {/* ── Seção 4: Validator ──────────────────────────────────── */}
      <Section title="Regras de validação" icon="✅">
        <p className="text-xs text-muted-foreground">
          <code className="rounded bg-muted/30 px-1">main_deck_size</code>:{" "}
          min e max do deck principal.{" "}
          <code>aux_decks</code>: Record com nome da seção → min/max.
        </p>
        <JsonTextarea
          value={validatorJson}
          onChange={setValidatorJson}
          rows={10}
        />
      </Section>

      {/* ── Seção 5: Teste ──────────────────────────────────────── */}
      <Section title="Teste de configuração" icon="🧪">
        <p className="text-xs text-muted-foreground">
          Preencha uma decklist de exemplo e/ou um código de carta para
          verificar o parser, o validator e a Card API antes de salvar.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Decklist de exemplo
            </label>
            <textarea
              rows={6}
              value={sampleDecklist}
              onChange={(e) => setSampleDecklist(e.target.value)}
              placeholder={"4 BT13-040 Magnamon\n4 BT20-083 Omekamon\n..."}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-primary/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Código de carta de exemplo
            </label>
            <input
              type="text"
              value={sampleCardCode}
              onChange={(e) => setSampleCardCode(e.target.value)}
              placeholder="ex: BT13-007"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none"
            />
            <button
              onClick={handleTest}
              disabled={testLoading}
              className="mt-3 w-full rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {testLoading ? "Testando…" : "Testar config"}
            </button>
          </div>
        </div>
        {testResult && (
          <pre
            className={`mt-3 overflow-auto rounded-lg border px-4 py-3 text-xs leading-relaxed ${
              testPassed
                ? "border-green-500/30 bg-green-500/5 text-green-400"
                : "border-red-500/30 bg-red-500/5 text-red-400"
            }`}
          >
            {testResult}
          </pre>
        )}
      </Section>

      {/* ── Salvar ─────────────────────────────────────────────── */}
      {saveError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {saveError}
        </p>
      )}
      <div className="flex items-center justify-between border-t border-border/40 pt-6">
        <a
          href="/admin/games"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Cancelar
        </a>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving
            ? "Salvando…"
            : mode === "create"
              ? "Criar jogo"
              : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-6">
      <div className="mb-5 flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function JsonTextarea({
  value,
  onChange,
  rows = 10,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleChange = (v: string) => {
    onChange(v);
    try {
      JSON.parse(v);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  };

  return (
    <div>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
        className={`w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs text-foreground focus:outline-none ${
          jsonError
            ? "border-red-500/60 focus:border-red-500/80"
            : "border-border/60 focus:border-primary/60"
        }`}
      />
      {jsonError && (
        <p className="mt-1 text-xs text-red-400">{jsonError}</p>
      )}
    </div>
  );
}
