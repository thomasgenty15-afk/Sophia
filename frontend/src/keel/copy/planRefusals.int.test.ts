import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { en } from "../i18n/en";
import {
  EDGE_REFUSAL_KEYS,
  edgeRefusalKey,
  HOUSEHOLD_REFUSAL_KEYS,
  householdErrorKey,
  householdRefusalKey,
  MERGE_SETTING_REFUSAL_KEYS,
  MERGE_SKIP_KEYS,
  mergeCardRefusalKey,
  mergeCardSkipKey,
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
 * LA SOURCE SANS SES COMMENTAIRES.
 *
 * ⚠️ CICATRICE DU DÉPÔT: un audit d'appelants qui grep la source brute compte
 * les MORTS. Un `includes("…")` vrai grâce à une ligne de commentaire est un
 * faux vert, et ce fichier-ci sert précisément à séparer « le code appelle » de
 * « quelqu'un en a parlé ». Les blocs partent, les lignes aussi — sauf quand le
 * `//` suit un deux-points, qui fait une URL et pas un commentaire.
 */
function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at < 0) return line;
      if (at > 0 && line[at - 1] === ":") return line;
      return line.slice(0, at);
    })
    .join("\n");
}

/** Le corps d'une fonction plpgsql, borné par ses deux `$function$`. */
function plpgsqlBody(sql: string, fn: string): string {
  const start = sql.indexOf(`create or replace function ${fn}(`);
  expect(start, `${fn}: déclaration introuvable`).toBeGreaterThan(0);
  const open = sql.indexOf("as $function$", start);
  expect(open, `${fn}: corps introuvable`).toBeGreaterThan(start);
  const close = sql.indexOf("$function$;", open + 1);
  expect(close, `${fn}: fin de corps introuvable`).toBeGreaterThan(open);
  return sql.slice(open, close);
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

  /**
   * D1 — LE LECTEUR REVERSE LE VOCABULAIRE DES FENÊTRES DANS `skipped[]`.
   *
   * ⚠️ CE QUE LE SCAN D'À CÔTÉ NE PEUT PAS VOIR, PAR CONSTRUCTION. Il lit les
   * déclarations `export const SKIP_… = "…"`; `skip(pair.refusal)` n'en est pas
   * une, et sa valeur ne se connaît qu'à l'exécution. Deux jetons de fenêtre
   * arrivaient donc en jargon sous le nom d'une personne — mesuré:
   * « Zoe — merge_windows_disjoint ».
   *
   * Le correctif est au SITE D'APPEL (`mergeCardSkipKey`), pas dans
   * `MERGE_SKIP_KEYS`: ces jetons ont déjà leurs mots dans `EDGE_REFUSAL_KEYS`,
   * et les y ajouter ferait deux phrases pour un mot ET casserait la bijection
   * inverse juste au-dessus. Ce test épingle donc les deux moitiés: le
   * reversement existe encore côté serveur, et la chaîne de l'écran le couvre.
   */
  it("traduit AUSSI les refus de FENÊTRE que le lecteur range dans skipped[]", () => {
    const src = withoutComments(
      source("supabase/functions/_shared/keel/household_merge_notice.ts"),
    );
    // La forme d'appel qui fait tout le défaut, dans le CODE et pas dans une
    // ligne de commentaire qui en parle.
    expect(src, "skip(pair.refusal) a disparu: ce test garde un chemin mort")
      .toMatch(/skip\(\s*pair\.refusal\s*\)/);

    const windowTokens = [...sharedConstants()]
      .filter(([name]) => name.startsWith("MERGE_WINDOW"))
      .map(([, value]) => value);
    expect(windowTokens.length, "les refus de fenêtre ont changé de nom").toBe(3);

    for (const token of windowTokens) {
      // La table des SKIP_* ne les connaît PAS, et ne DOIT pas les connaître.
      expect(mergeSkipKey(token), token).toBeNull();
      // …et l'écran les rend quand même en mots, par le repli.
      expect(mergeCardSkipKey(token), token).not.toBeNull();
    }

    // Les deux jetons que la QA a lus en clair, nommés. Un test qui ne dirait
    // que « les trois sont couverts » resterait vert le jour où le scan des
    // constantes cesse de voir le fichier.
    expect(mergeCardSkipKey("merge_windows_disjoint")).toBe(
      "plan.refusal.merge_windows_disjoint",
    );
    expect(mergeCardSkipKey("merge_window_all_past")).toBe(
      "plan.refusal.merge_window_all_past",
    );
  });

  it("garde la phrase de `skipped[]` quand un jeton vit dans les DEUX tables", () => {
    // `merge_quota_exhausted` est un refus de geste ET un motif de
    // non-proposition, avec deux phrases écrites exprès. L'ordre du repli
    // décide laquelle un maître lit sous le nom d'une personne — et la QA a
    // mesuré celle de `skipped[]`.
    expect(mergeCardSkipKey("merge_quota_exhausted")).toBe(
      "household.merge.skip.merge_quota_exhausted",
    );
    expect(edgeRefusalKey("merge_quota_exhausted")).toBe(
      "plan.refusal.merge_quota_exhausted",
    );
  });

  it("laisse sortir un motif inconnu tel quel (R7)", () => {
    expect(mergeCardSkipKey("some_new_token")).toBeNull();
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * D2 — LES DEUX RPC DE RÉGLAGE, CONFRONTÉES À LEUR SOURCE SQL.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ LE TROU QUE CE BLOC BOUCHE. `MERGE_SETTING_REFUSAL_KEYS` n'était confronté
 * à RIEN: la seule vérification était que ses valeurs existent dans `en.ts`,
 * c'est-à-dire qu'une table de cinq lignes est bien écrite en anglais. Les deux
 * RPC en refusent NEUF, et quatre d'entre eux ne venaient pas de cette table
 * (`not_owner`, `no_household`, `not_a_member`, `not_authenticated`). Deux
 * arrivaient quand même en mots par la table des refus edge; les deux autres
 * arrivaient en jargon — `not_a_member` mesuré deux fois en HTTP réel.
 *
 * On teste les CHAÎNES, pas les tables: c'est la composition qui décide ce
 * qu'un humain lit, et elle diffère d'un écran à l'autre. Les deux fonctions
 * appelées ici sont exactement celles qu'appellent `HouseholdMergeCard.tsx` et
 * `HouseholdPage.tsx`.
 */
describe("les refus des deux RPC de réglage de fusion", () => {
  const MIGRATION = "supabase/migrations/20260812160000_household_merge_settings.sql";

  function settingReasons(): string[] {
    const sql = source(MIGRATION);
    const found = new Set<string>();
    for (
      const fn of [
        "public.keel_household_mute_merge_proposals",
        "public.keel_household_dismiss_merge_notice",
      ]
    ) {
      const body = plpgsqlBody(sql, fn);
      const reasons = [...body.matchAll(/'reason',\s*'([a-z_]+)'/g)].map((m) => m[1]);
      // Chaque RPC prise SÉPARÉMENT doit avoir rendu quelque chose: une borne
      // qui glisserait sur la mauvaise fonction laisserait l'autre à zéro sans
      // que le total ne bouge beaucoup.
      expect(reasons.length, `${fn}: aucun refus lu`).toBeGreaterThan(4);
      for (const reason of reasons) found.add(reason);
    }
    return [...found];
  }

  it("chaque motif des deux RPC arrive en mots sur les DEUX écrans", () => {
    const reasons = settingReasons();
    expect(reasons.length).toBeGreaterThan(7);

    // La carte de proposition: `merge`, `unmerge`, et « refuser » partent de là.
    expect(reasons.filter((r) => mergeCardRefusalKey(r) === null)).toEqual([]);
    // `/app/household`: le réglage discret (D17) part de là.
    expect(reasons.filter((r) => householdErrorKey(r) === null)).toEqual([]);
  });

  it("nomme les deux motifs que la QA a lus en jargon", () => {
    // LE CAS QUI PASSE, et il est nominatif. `not_a_member` était sur le chemin
    // des deux RPC et sur aucune table que la carte consultait; `not_authenticated`
    // n'était sur AUCUNE des deux, écrans compris.
    for (const token of ["not_a_member", "not_authenticated"]) {
      expect(mergeCardRefusalKey(token), `carte: ${token}`).not.toBeNull();
      expect(householdErrorKey(token), `foyer: ${token}`).not.toBeNull();
    }
    // Une session périmée dit la MÊME chose des deux côtés du produit: le jeton
    // du portail edge et celui des RPC pointent sur une seule phrase.
    expect(householdErrorKey("not_authenticated")).toBe(
      edgeRefusalKey("Unauthorized"),
    );
  });

  it("n'invente aucun motif que les deux RPC ne rendent pas", () => {
    const emitted = new Set(settingReasons());
    expect(
      Object.keys(MERGE_SETTING_REFUSAL_KEYS).filter((r) => !emitted.has(r)),
    ).toEqual([]);
  });

  it("laisse sortir un motif inconnu tel quel (R7)", () => {
    expect(mergeCardRefusalKey("some_new_token")).toBeNull();
    expect(householdErrorKey("some_new_token")).toBeNull();
  });
});

describe("la liste fermée des refus de foyer", () => {
  it("ne perd aucun motif au passage de `HouseholdPage` au module partagé", () => {
    // La table VIENT d'un `switch` privé de l'écran du foyer. Une ligne oubliée
    // pendant le déménagement se lirait comme un jeton brut, sur un écran que
    // ce lot ne mesure pas. Le catalogue est le témoin: chaque `household.error.*`
    // écrit dans `en.ts` doit rester atteignable.
    const written = Object.keys(en).filter((k) => k.startsWith("household.error."));
    expect(written.length).toBeGreaterThan(10);
    const reachable = new Set<string>(Object.values(HOUSEHOLD_REFUSAL_KEYS));
    expect(written.filter((k) => !reachable.has(k))).toEqual([]);
  });

  it("les deux chaînes ne disent pas la même chose du même mot", () => {
    // `not_owner` vit dans la table du foyer ET dans celle des refus edge, et
    // les deux phrases sont justes chacune à sa place: sur `/app/household`
    // « seul le maître peut faire ça » (l'écran refuse un réglage), sur la
    // carte de proposition « le serveur a refusé CE geste ». C'est l'ordre de
    // chaque chaîne qui décide, et le déménagement de la table ne l'a pas
    // touché — un `householdRefusalKey` remonté en tête de la chaîne de la
    // carte se verrait ici.
    expect(householdErrorKey("not_owner")).toBe(householdRefusalKey("not_owner"));
    expect(householdErrorKey("not_owner")).toBe("household.error.not_owner");
    expect(mergeCardRefusalKey("not_owner")).toBe("plan.refusal.not_owner");

    // ⚠️ CE QUI N'EST PAS PROUVÉ ICI, ET IL FAUT LE DIRE: l'ordre INTERNE de
    // `householdErrorKey`. Ses deux tables sont aujourd'hui disjointes — aucun
    // mot ne vit dans les deux — donc les inverser ne changerait rien, et un
    // test qui prétendrait le contraire serait vert pour rien. Le jour où un
    // motif se dédouble, c'est la bijection d'à côté (« n'invente aucun
    // motif ») qui le fera remarquer.
  });
});

/**
 * LES DEUX ÉCRANS APPELLENT BIEN LES CHAÎNES, ET PAS UN MAILLON.
 *
 * ⚠️ SANS CE TEST, LES TROIS PRÉCÉDENTS SONT VERTS POUR RIEN. Ils prouvent
 * qu'une fonction rend une clé; ils ne prouvent pas que l'écran l'appelle. Le
 * défaut mesuré était exactement là: `mergeSkipKey` seul, `edgeRefusalKey ??
 * mergeSettingRefusalKey` sans troisième maillon — deux compositions parfaites
 * de tables parfaites.
 */
describe("le câblage des écrans", () => {
  it("la carte de proposition passe par les chaînes, jamais par un maillon nu", () => {
    const src = withoutComments(
      source("frontend/src/keel/components/HouseholdMergeCard.tsx"),
    );
    expect(src).toContain("mergeCardSkipKey(");
    expect(src).toContain("mergeCardRefusalKey(");
    expect(src, "un maillon nu est revenu: le repli de D1 est perdu")
      .not.toContain("mergeSkipKey(");
    expect(src, "un maillon nu est revenu: le repli de D2 est perdu")
      .not.toContain("mergeSettingRefusalKey(");
  });

  it("l'écran du foyer passe par la même chaîne, dans son ordre à lui", () => {
    const src = withoutComments(source("frontend/src/keel/pages/HouseholdPage.tsx"));
    expect(src).toContain("householdErrorKey(");
    expect(src).not.toContain("mergeSettingRefusalKey(");
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
      ...Object.values(HOUSEHOLD_REFUSAL_KEYS),
    ];
    expect(keys.filter((k) => !(k in en))).toEqual([]);
  });
});
