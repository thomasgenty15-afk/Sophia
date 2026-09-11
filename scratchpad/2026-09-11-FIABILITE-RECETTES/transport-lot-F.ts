/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT F ② — L'ADAPTATEUR FOURNISSEUR CONTRÔLÉ, AU NIVEAU TRANSPORT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le plan (« Lot F », point 2) : « utiliser un adaptateur fournisseur contrôlé
 * au niveau transport sur une pile de test, ou extraire le service de
 * traitement derrière le vrai handler pour injecter ce transport. Aller jusqu'à
 * la sérialisation, l'écriture de fixtures et leur relecture par les lecteurs
 * API/UI. »
 *
 * ⛔ « AUCUN INTERRUPTEUR DE CONTOURNEMENT EXPOSÉ AUX REQUÊTES DE PRODUCTION. »
 * C'est la garde dure du point 2, et c'est ce module qui la tient :
 *
 *   · RIEN n'est ajouté à `supabase/functions/**`. Aucune branche du produit ne
 *     sait que ce fichier existe. Une requête HTTP ordinaire — celle que Kong
 *     sert depuis `functions serve` — ne peut donc PAS obtenir une réponse en
 *     conserve : le chemin qui la servirait n'existe que dans CE processus.
 *   · Le seul point d'injection est `globalThis.fetch`, dans le processus du
 *     banc, avant l'import du handler. C'est le transport, pas un drapeau.
 *   · `Deno.serve` est capturé pour RÉCUPÉRER le handler, pas pour ouvrir un
 *     port : le banc n'écoute sur rien. Il n'y a aucune adresse à atteindre.
 *
 * ── CE QUI N'EST PAS UN CONTOURNEMENT NON PLUS, ET POURQUOI ON NE S'EN SERT PAS
 *
 * `_shared/gemini.ts` porte déjà `MEGA_TEST_MODE` (l. ~420) : dès que la pile
 * est locale, il rend `MEGA_TEST_STUB: <200 premiers caractères du message>`.
 * C'est un stub de **disponibilité** — il prouve que la fonction répond sans
 * clé d'API. Le parseur de plan le REJETTE (ce n'est pas du JSON de plan), donc
 * il ne prouve RIEN du parcours de composition. Ce banc ne l'utilise pas :
 * `MEGA_TEST_MODE=0` est posé explicitement, la vraie branche fournisseur est
 * prise, et c'est le TRANSPORT qui rend la réponse archivée.
 *
 * ── LA GARDE DE DÉPENSE ───────────────────────────────────────────────────
 *
 * Tout `fetch` sortant vers un hôte qui n'est ni la pile locale ni un
 * fournisseur intercepté **jette**. Un banc qui laisserait passer un appel réel
 * ne serait pas « un banc un peu cher » : ce serait un banc dont les nombres ne
 * viennent plus de la fixture. On préfère un rouge bruyant.
 */

// ── LA PILE ET LES CLÉS, LUES DANS `supabase/.env` ────────────────────────
//
// ⛔ AUCUNE VALEUR N'EST ÉCRITE DANS CE FICHIER. Le banc lit le même fichier
// que `functions serve`, pour que « le handler du banc » et « le handler servi »
// aient la même configuration. Un banc configuré à part mesure un autre moteur.
export function loadDotEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let text = "";
  try {
    text = Deno.readTextFileSync(path);
  } catch {
    return out;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export interface CannedExchange {
  /** `generate-household-meal-v1` ou `…​.composition_fill` */
  readonly source: string;
  /** Le modèle nommé par l'archive — sert à router, jamais à décider. */
  readonly model: string;
  /** Le texte EXACT rendu par le fournisseur, avant tout parseur du moteur. */
  readonly outputText: string;
  /** Le prompt système archivé — sert d'empreinte de routage. */
  readonly systemPrompt: string;
}

/**
 * ⚠️ LE RETAILLAGE — CE QU'IL FAIT, ET CE QU'IL NE FAUT PAS LUI FAIRE DIRE.
 *
 * Les deux réponses archivées ont été composées le 2026-09-11 à **15 h 07**
 * locales, sur une grille de **7 cases** : `fri/dinner` + samedi ×3 + dimanche
 * ×3. Rejouées le soir (mesuré à **19 h 42**), la grille du produit n'a plus que
 * **6 cases** : le vendredi entier tombe par `spent_first_day_dropped: fri
 * (shopping_cutoff)`. Le premier tir du banc l'a montré en clair — 422
 * `mouth_unfed` sur `sun/dinner`, parce que le plafond de 6 plats jetait le 7ᵉ.
 *
 * ⛔ CE N'EST PAS UN DÉFAUT DU MOTEUR, ET CE N'EST PAS NON PLUS UN DÉTAIL À
 * TAIRE : c'est la preuve que l'heure locale décide de la grille, et que la
 * fixture ne fige pas l'heure. Le retaillage retire **la case que la grille
 * d'aujourd'hui n'a pas**, et rien d'autre :
 *
 *   · le plat du jour retiré, et sa ligne de `member_portions` ;
 *   · sa séance de cuisine est **déplacée**, jamais supprimée — `prep_chicken`
 *     est cuisiné le vendredi et mangé le samedi matin : la jeter orphelinerait
 *     une préparation que les six plats restants emploient.
 *
 * ⛔ AUCUN GRAMME, AUCUN INGRÉDIENT, AUCUNE MÉTHODE, AUCUNE LISTE DE COURSES
 * N'EST TOUCHÉE. Ce qui est mesuré ensuite reste la réponse du modèle du
 * 2026-09-11 — moins une case que la journée d'aujourd'hui ne demande pas.
 */
export function retaillerReponse(
  outputText: string,
  args: { dropDays: readonly string[]; moveCookingTo: string },
): { text: string; dishesBefore: number; dishesAfter: number; moved: string[] } {
  const plan = JSON.parse(outputText) as Record<string, unknown>;
  const dishes = Array.isArray(plan.dishes) ? plan.dishes as Record<string, unknown>[] : [];
  const drop = new Set(args.dropDays);
  const before = dishes.length;
  plan.dishes = dishes.filter((d) => !drop.has(String(d.day ?? "")));
  const portions = Array.isArray(plan.member_portions)
    ? plan.member_portions as Record<string, unknown>[]
    : [];
  plan.member_portions = portions.filter((p) => !drop.has(String(p.day ?? "")));
  const sessions = Array.isArray(plan.cooking_sessions)
    ? plan.cooking_sessions as Record<string, unknown>[]
    : [];
  const moved: string[] = [];
  const kept: Record<string, unknown>[] = [];
  for (const s of sessions) {
    const day = String(s.day ?? "");
    if (!drop.has(day)) {
      kept.push(s);
      continue;
    }
    const ids = Array.isArray(s.preparation_ids) ? s.preparation_ids as string[] : [];
    moved.push(...ids);
    const target = kept.find((k) => String(k.day ?? "") === args.moveCookingTo);
    if (target) {
      const existing = Array.isArray(target.preparation_ids)
        ? target.preparation_ids as string[]
        : [];
      target.preparation_ids = [...new Set([...ids, ...existing])];
      target.total_minutes = Number(target.total_minutes ?? 0) +
        Number(s.total_minutes ?? 0);
      target.run_through = `${String(s.run_through ?? "")} ${String(target.run_through ?? "")}`
        .trim();
    } else {
      kept.push({ ...s, day: args.moveCookingTo });
    }
  }
  plan.cooking_sessions = kept;
  return {
    text: JSON.stringify(plan),
    dishesBefore: before,
    dishesAfter: (plan.dishes as unknown[]).length,
    moved,
  };
}

export interface TransportCall {
  readonly url: string;
  readonly model: string;
  readonly matched: string | null;
  readonly bodyBytes: number;
  readonly atMs: number;
}

export interface ControlledTransport {
  /** Les appels fournisseur interceptés, dans l'ordre. */
  readonly calls: TransportCall[];
  /** Les hôtes refusés (aucun n'est attendu). */
  readonly refused: string[];
  restore(): void;
}

/**
 * Le routage est une DÉCISION NOMMÉE, pas une heuristique de ressemblance.
 *
 * ⛔ ON NE COMPARE PAS LE PROMPT ENVOYÉ AU PROMPT ARCHIVÉ. Les deux diffèrent
 * forcément : la date du jour, l'heure locale, les identifiants de bouche et le
 * catalogue ont bougé depuis le 2026-09-11 15 h. Un routage par ressemblance
 * rendrait « la mauvaise réponse » sur un écart d'un caractère, et surtout il
 * ferait croire que le prompt n'a pas changé. On route donc sur le MODÈLE
 * DEMANDÉ, qui est la seule chose que l'appelant choisit explicitement :
 *
 *   · `gpt-5.6-luna`  → la composition        (`keelGenerationModel()`)
 *   · tout le reste   → `composition_fill`    (`gpt-5.4-nano` dans l'archive)
 *
 * Et on COMPTE les appels par nature : c'est le « coût : appels réels par
 * nature » que le tableau du plan réclame.
 */
export function installControlledTransport(args: {
  readonly compositionModel: string;
  readonly composition: CannedExchange;
  readonly fill: CannedExchange;
  /** Hôtes de la pile locale, laissés passer vers le vrai réseau. */
  readonly passThroughHosts: readonly string[];
}): ControlledTransport {
  const realFetch = globalThis.fetch;
  const calls: TransportCall[] = [];
  const refused: string[] = [];
  const t0 = Date.now();

  const providerHosts = new Set([
    "api.openai.com",
    "generativelanguage.googleapis.com",
  ]);

  const adapter: typeof fetch = async (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      host = "";
    }

    if (args.passThroughHosts.includes(host)) {
      return await realFetch(input as RequestInfo, init);
    }

    if (!providerHosts.has(host)) {
      // ⛔ ET ON JETTE. Un hôte inconnu qui passerait en silence ferait d'un
      // banc « hors dépense » un banc dont personne ne connaît la facture.
      refused.push(host || url);
      throw new Error(
        `LOT F — transport contrôlé : sortie REFUSÉE vers « ${host || url} ». ` +
          `Seuls la pile locale (${args.passThroughHosts.join(", ")}) et les ` +
          `fournisseurs interceptés sont permis.`,
      );
    }

    // ⚠️ `RequestInit` a plusieurs formes dans les bibliothèques de ce dépôt
    // (Deno, DOM, client HTTP) et `body` n'est pas déclaré sur toutes. On lit
    // le champ par un accès indexé plutôt que de perdre le typecheck du banc.
    const rawInit = (init ?? {}) as Record<string, unknown>;
    const rawBody = typeof rawInit.body === "string" ? rawInit.body : "";
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch { /* un corps illisible reste routé par défaut sur le remplissage */ }
    const model = String(payload?.model ?? "").trim();

    const canned = model === args.compositionModel ? args.composition : args.fill;
    calls.push({
      url,
      model,
      matched: canned.source,
      bodyBytes: rawBody.length,
      atMs: Date.now() - t0,
    });

    // La forme de l'API « Responses » d'OpenAI, telle que
    // `outputTextFromOpenAIResponse` la lit : `output_text` suffit.
    const body = {
      id: `resp_lotf_${calls.length}`,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      model,
      status: "completed",
      output_text: canned.outputText,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
      service_tier: "priority",
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  globalThis.fetch = adapter;
  return {
    calls,
    refused,
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

/**
 * Capture le handler que `Deno.serve` recevrait, SANS ouvrir de port.
 *
 * ⛔ C'est ce qui rend le banc inatteignable de l'extérieur. `Deno.serve(h)`
 * lierait le port 8000 ; ici on garde `h` et on rend un objet de serveur
 * inerte. Le handler est ensuite appelé DIRECTEMENT avec un `Request`, ce qui
 * est exactement « extraire le service de traitement derrière le vrai handler »
 * — sans réécrire une ligne du handler.
 */
export function captureServeHandler(): {
  handlerPromise: Promise<(req: Request) => Promise<Response>>;
  restore(): void;
} {
  const realServe = Deno.serve;
  let resolveHandler: (h: (req: Request) => Promise<Response>) => void = () => {};
  const handlerPromise = new Promise<(req: Request) => Promise<Response>>((r) => {
    resolveHandler = r;
  });
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (a: unknown, b?: unknown) => {
    const handler = (typeof a === "function" ? a : b) as (
      req: Request,
    ) => Promise<Response>;
    resolveHandler(handler);
    return {
      finished: Promise.resolve(),
      addr: { transport: "tcp", hostname: "127.0.0.1", port: 0 },
      shutdown: () => Promise.resolve(),
      ref: () => {},
      unref: () => {},
      // deno-lint-ignore no-explicit-any
    } as any;
  };
  return {
    handlerPromise,
    restore() {
      // deno-lint-ignore no-explicit-any
      (Deno as any).serve = realServe;
    },
  };
}

/** Les deux échanges archivés, lus dans les fixtures figées du lot 0. */
export function cannedFromFixtures(
  fixturesDir: string,
  requestId: string,
): { composition: CannedExchange; fill: CannedExchange } {
  const raw = JSON.parse(
    Deno.readTextFileSync(`${fixturesDir}/echanges.json`),
  ) as { evenements: Record<string, unknown>[] };
  const pick = (source: string): CannedExchange => {
    const success = raw.evenements.find((e) =>
      String(e.request_id) === requestId && String(e.source) === source &&
      String(e.status) === "success"
    );
    const start = raw.evenements.find((e) =>
      String(e.request_id) === requestId && String(e.source) === source &&
      String(e.status) === "attempt_start"
    );
    if (!success) {
      throw new Error(`fixture absente : ${source} / ${requestId}`);
    }
    return {
      source,
      model: String(success.model ?? ""),
      outputText: String(success.output_text ?? ""),
      systemPrompt: String(start?.system_prompt ?? ""),
    };
  };
  return {
    composition: pick("generate-household-meal-v1"),
    fill: pick("generate-household-meal-v1.composition_fill"),
  };
}
