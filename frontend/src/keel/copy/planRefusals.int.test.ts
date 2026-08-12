import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { en } from "../i18n/en";
import {
  EDGE_REFUSAL_KEYS,
  edgeRefusalKey,
  MERGE_SETTING_REFUSAL_KEYS,
  MERGE_SKIP_KEYS,
  mergeSkipKey,
  validationRefusalKey,
  VALIDATION_REFUSAL_KEYS,
} from "./planRefusals";

/**
 * LE TEST DE DÉRIVE — le seul lien entre les refus du serveur et leurs mots.
 *
 * Il LIT les sources plutôt que de les importer: les fonctions edge sont du
 * Deno/JSR qu'un test Vite ne charge pas, et lire la déclaration suffit à
 * attraper la panne qui arrive vraiment — un refus ajouté (ou renommé) d'un
 * seul côté. C'est le patron de `flagReasons.int.test.ts`, écrit après qu'un
 * coach a lu `silent_5d` sur son écran du lundi.
 *
 * ⚠️ LA MOITIÉ QUI COMPTE EST LA SECONDE: « n'invente aucun jeton ». Une
 * étiquette pour un refus que le serveur ne produit plus est du texte écrit,
 * relu, traduit — et inatteignable. C'est ce qui avait laissé
 * `restriction_flag` vivre des mois à côté du vrai `restriction_signal`.
 */

const ROOT = resolve(__dirname, "../../../..");

function source(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

/**
 * Les constantes de refus exportées par les modules partagés, résolues par leur
 * VALEUR. Le générateur écrit `error: MERGE_QUOTA_EXHAUSTED` — un scan qui ne
 * lirait que les littéraux manquerait le seul refus de L7, c'est-à-dire
 * exactement celui que le registre nomme comme non mappé.
 */
function sharedConstants(): Map<string, string> {
  const out = new Map<string, string>();
  for (
    const rel of [
      "supabase/functions/_shared/keel/household_merge.ts",
      "supabase/functions/_shared/keel/household_merge_quota.ts",
      "supabase/functions/_shared/keel/household_merge_notice.ts",
    ]
  ) {
    for (
      const m of source(rel).matchAll(
        /export const ([A-Z][A-Z0-9_]*)\s*=\s*"([a-z0-9_]+)"/g,
      )
    ) {
      out.set(m[1], m[2]);
    }
  }
  return out;
}

/** Tout ce qu'une fonction edge peut rendre dans `error` ou dans `refusal`. */
function edgeTokens(): string[] {
  const constants = sharedConstants();
  const tokens = new Set<string>();
  for (
    const rel of [
      "supabase/functions/generate-meal-v1/index.ts",
      "supabase/functions/generate-household-meal-v1/index.ts",
    ]
  ) {
    const src = source(rel);
    // ── CE QUI PART AU CLIENT: toujours un `error:` DANS un `jsonResponse` ──
    // Scanner `error:` partout ramassait les journaux d'incident
    // (`logEdgeFunctionError({… error: x, metadata: {source: "…"}})`) et
    // exigeait des mots pour des noms de tables. La borne est donc la forme de
    // la réponse, pas la proximité.
    for (const m of src.matchAll(/jsonResponse\(\s*req\s*,\s*\{/g)) {
      const block = src.slice(m.index ?? 0, (m.index ?? 0) + 400);
      const line = block.match(/\n\s*error:\s*([^\n]*)/) ?? block.match(/error:\s*([^\n]*)/);
      if (!line) continue;
      const literal = line[1].match(/^"([A-Za-z0-9_]+)"/);
      if (literal) {
        tokens.add(literal[1]);
        continue;
      }
      // Un refus rendu par une CONSTANTE (`error: MERGE_QUOTA_EXHAUSTED,`) —
      // le seul refus de L7, c'est-à-dire exactement celui que le registre
      // nomme comme non mappé.
      const named = line[1].match(/^([A-Z][A-Z0-9_]+)/);
      if (named) {
        const value = constants.get(named[1]);
        expect(value, `${rel}: constante de refus ${named[1]} introuvable`).toBeTruthy();
        if (value) tokens.add(value);
      }
    }
    // ── LES REFUS DES RÉSOLVEURS, avant toute dépense ───────────────────────
    // ⚠️ ON NE LIT PAS SEULEMENT `refusal: "…"`. Deux refus de défusion sont
    // rendus par un TERNAIRE (`refusal: x === CONST ? "a" : "b"`), et la
    // première rédaction de ce scan ne les voyait pas — elle les a d'ailleurs
    // dénoncés comme « inventés » à sa première exécution. On lit donc la
    // valeur entière de la propriété, bornée par le `detail:` qui la suit
    // toujours: une prose de `detail` porte des espaces et des majuscules,
    // elle ne passe pas le filtre snake_case.
    for (const m of src.matchAll(/refusal:/g)) {
      const from = m.index ?? 0;
      const rest = src.slice(from, from + 260);
      const stop = rest.indexOf("detail:");
      for (
        const lit of (stop > 0 ? rest.slice(0, stop) : rest).matchAll(/"([a-z0-9_]+)"/g)
      ) {
        tokens.add(lit[1]);
      }
    }
    // Les refus rendus par une CONSTANTE. Un identifiant qu'on ne sait pas
    // résoudre fait échouer le test plutôt que de disparaître: un jeton non vu
    // est un jeton non mappé, et c'est précisément le défaut qu'on garde.
    for (const m of src.matchAll(/(?:error|refusal):\s*([A-Z][A-Z0-9_]+)\s*,/g)) {
      const value = constants.get(m[1]);
      expect(value, `${rel}: constante de refus ${m[1]} introuvable`).toBeTruthy();
      if (value) tokens.add(value);
    }
  }
  // Les trois refus de fenêtre voyagent depuis `bestMergePair` par
  // `refusal: best.refusal`, une expression qu'aucun scan de littéral ne voit.
  // Ils sont pourtant les plus fréquents à l'écran: « ces deux plans ne
  // partagent aucun jour » est la réponse la plus courante à une fusion.
  for (const [name, value] of constants) {
    if (name.startsWith("MERGE_WINDOW")) tokens.add(value);
  }
  return [...tokens];
}

describe("les refus des fonctions edge ont tous des mots", () => {
  it("couvre chaque jeton que les deux générateurs peuvent rendre", () => {
    const tokens = edgeTokens();
    // Un scan qui ne trouve rien serait vert par accident: le décor doit
    // prouver qu'il a lu quelque chose avant de prouver qu'il couvre tout.
    expect(tokens.length).toBeGreaterThan(20);
    const missing = tokens.filter((token) => !(token in EDGE_REFUSAL_KEYS));
    expect(missing).toEqual([]);
  });

  it("n'invente aucun jeton que le serveur ne rend pas", () => {
    const emitted = new Set(edgeTokens());
    const orphans = Object.keys(EDGE_REFUSAL_KEYS).filter((t) => !emitted.has(t));
    expect(orphans).toEqual([]);
  });

  it("nomme les refus que chaque lot avait laissés en dette", () => {
    // Le cas qui PASSE, et il est nominatif: ces six-là sont écrits au registre
    // comme « l'utilisateur voit le jeton brut », un lot après l'autre. Un test
    // qui ne dirait que « tout est couvert » resterait vert le jour où le scan
    // cesse de voir la moitié des fichiers.
    for (
      const token of [
        "household_frozen",
        "window_fully_away",
        "all_members_have_own_plan",
        "merge_quota_exhausted",
        "merge_windows_disjoint",
        "unmerge_member_not_merged",
      ]
    ) {
      expect(edgeRefusalKey(token), token).not.toBeNull();
    }
  });

  it("rend null sur un jeton inconnu, plutôt qu'une phrase passe-partout", () => {
    // R7: l'appelant affiche alors le jeton tel quel. « Une erreur est
    // survenue » ne se rapporte pas; `some_new_token` se rapporte.
    expect(edgeRefusalKey("some_new_token")).toBeNull();
  });
});

describe("les refus de la prise de main", () => {
  it("couvre chaque motif de keel_validate_meal_plan", () => {
    // La RPC vit en SQL: on lit la migration qui la déclare, entre sa
    // signature et le `revoke` qui la clôt.
    const sql = source(
      "supabase/migrations/20260811080000_meal_plan_kind_and_validation.sql",
    );
    const start = sql.indexOf("function public.keel_validate_meal_plan(p_plan uuid)");
    expect(start).toBeGreaterThan(0);
    const body = sql.slice(start, sql.indexOf("revoke all on function public.keel_validate_meal_plan"));
    const reasons = [...body.matchAll(/'reason',\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.filter((r) => !(r in VALIDATION_REFUSAL_KEYS))).toEqual([]);
  });

  it("ne traite PAS `already` comme un refus", () => {
    // ⚠️ La RPC est idempotente sous concurrence et rend `{ok:true,
    // already:true}` quand le plan était déjà validé. Le ranger parmi les
    // refus ferait d'un double-clic une erreur rouge.
    expect(validationRefusalKey("already")).toBeNull();
    expect(validationRefusalKey("not_your_plan")).not.toBeNull();
  });
});

describe("les motifs de non-proposition", () => {
  it("couvre chaque SKIP_* du lecteur de propositions", () => {
    const src = source("supabase/functions/_shared/keel/household_merge_notice.ts");
    const declared = [...src.matchAll(/export const SKIP_[A-Z_]+ = "([a-z_]+)"/g)]
      .map((m) => m[1]);
    // `SKIP_QUOTA_EXHAUSTED` est un ALIAS de la constante de L7 (`= MERGE_QUOTA_EXHAUSTED`),
    // donc invisible au scan de littéraux: il est nommé ici pour que sa
    // disparition se voie.
    const all = [...declared, "merge_quota_exhausted"];
    expect(all.length).toBeGreaterThan(4);
    expect(all.filter((r) => !(r in MERGE_SKIP_KEYS))).toEqual([]);
    expect(Object.keys(MERGE_SKIP_KEYS).filter((r) => !all.includes(r))).toEqual([]);
  });

  it("rend une clé pour chaque motif, et null au-delà", () => {
    expect(mergeSkipKey("proposals_muted")).not.toBeNull();
    expect(mergeSkipKey("nothing_like_this")).toBeNull();
  });
});

describe("toutes les clés citées existent dans le catalogue", () => {
  it("aucune table ne pointe sur une clé absente de en.ts", () => {
    // Le type `MessageKey` le garantit à la compilation — et ce dépôt a mesuré
    // qu'un `as MessageKey` glissé quelque part désarme le compilateur sans
    // rien casser. La ceinture coûte trois lignes.
    const keys = [
      ...Object.values(EDGE_REFUSAL_KEYS),
      ...Object.values(VALIDATION_REFUSAL_KEYS),
      ...Object.values(MERGE_SKIP_KEYS),
      ...Object.values(MERGE_SETTING_REFUSAL_KEYS),
    ];
    expect(keys.filter((k) => !(k in en))).toEqual([]);
  });
});
