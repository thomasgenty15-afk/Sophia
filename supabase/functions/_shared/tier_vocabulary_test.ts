// ===========================================================================
// LE VOCABULAIRE DE PALIER — LES QUATRE SITES, PROUVÉS PAR UN TEST
//
// Le vocabulaire d'accès vit à QUATRE endroits, dans trois langages et deux
// runtimes:
//
//   1. `profiles_access_tier_check`        (SQL, supabase/migrations)
//   2. `subscriptions_tier_check`          (SQL, supabase/migrations)
//   3. `supabase/functions/_shared/billing-tier.ts`      (Deno)
//   4. `frontend/src/lib/entitlements.ts`                (navigateur)
//
// Ils bougent ENSEMBLE OU AUCUN. Un jeton ajouté à trois sites sur quatre ne
// casse rien à la compilation: il produit un compte qui paie et que l'écran
// traite comme 'none', c'est-à-dire à qui on propose d'acheter un produit
// qu'il a déjà. Ça ne se voit pas en test — sauf ici.
//
// CE FICHIER LIT LES QUATRE FICHIERS. C'est le même remède que
// `billing-tier_test.ts` applique au seuil d'élève actif (« a constant
// duplicated across two runtimes drifts »), étendu à une liste de jetons.
//
// ⚠️ LA MIGRATION N'EST PAS CITÉE PAR SON NOM. On cherche la DERNIÈRE
// migration qui (re)pose chaque contrainte: c'est celle qui est en vigueur.
// Coder `20260811030000` en dur rendrait ce test faux-vert le jour où
// quelqu'un repose la contrainte ailleurs — exactement la panne qu'il existe
// pour empêcher.
// ===========================================================================

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type EffectiveTier,
  isKeelTier,
  tierGrantsProtocolExecution,
} from "./billing-tier.ts";

const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);
const BILLING_TIER_TS = new URL("./billing-tier.ts", import.meta.url);
const ENTITLEMENTS_TS = new URL(
  "../../../frontend/src/lib/entitlements.ts",
  import.meta.url,
);

/** Les deux jetons du foyer (chantier 1). */
const HOUSEHOLD_TOKENS = ["household", "household_member"] as const;

async function migrationFilesSorted(): Promise<string[]> {
  const names: string[] = [];
  for await (const e of Deno.readDir(MIGRATIONS_DIR)) {
    if (e.isFile && e.name.endsWith(".sql")) names.push(e.name);
  }
  return names.sort();
}

/**
 * Le corps de la DERNIÈRE définition de cette contrainte dans les migrations.
 * On rend le texte entre `add constraint <nom> check (` et le `;` qui suit —
 * assez pour affirmer la présence ou l'absence d'un jeton, sans parser du SQL.
 */
async function lastConstraintBody(constraintName: string): Promise<string> {
  let found = "";
  let foundIn = "";
  for (const name of await migrationFilesSorted()) {
    const sql = await Deno.readTextFile(new URL(name, MIGRATIONS_DIR));
    const re = new RegExp(
      `add\\s+constraint\\s+${constraintName}\\s+check\\s*\\(([\\s\\S]*?)\\)\\s*;`,
      "gi",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      found = m[1];
      foundIn = name;
    }
  }
  assert(found, `${constraintName} introuvable dans supabase/migrations`);
  assert(foundIn, "fichier de migration non identifié");
  return found;
}

// ---------------------------------------------------------------------------
// SITE 1 — profiles_access_tier_check
// ---------------------------------------------------------------------------

Deno.test("site 1/4 · profiles_access_tier_check porte les deux jetons du foyer", async () => {
  const body = await lastConstraintBody("profiles_access_tier_check");
  for (const token of HOUSEHOLD_TOKENS) {
    assert(
      body.includes(`'${token}'`),
      `profiles_access_tier_check n'admet pas '${token}': un profil de foyer ne ` +
        `pourrait pas porter son palier, et l'écriture échouerait à l'exécution`,
    );
  }
  // Les paliers d'avant restent valides: les retirer orphelinerait les lignes
  // vivantes (c'est pour ça que les trois paliers grand public morts sont
  // toujours dans la CHECK).
  for (const kept of ["none", "trial", "coach", "student", "system", "alliance", "architecte"]) {
    assert(body.includes(`'${kept}'`), `le palier '${kept}' a disparu de la CHECK`);
  }
});

// ---------------------------------------------------------------------------
// SITE 2 — subscriptions_tier_check, ET SON ABSENCE VOLONTAIRE
// ---------------------------------------------------------------------------

Deno.test("site 2/4 · 'household' est vendable, 'household_member' ne l'est PAS", async () => {
  const body = await lastConstraintBody("subscriptions_tier_check");
  assert(
    body.includes("'household'"),
    "subscriptions_tier_check n'admet pas 'household': le compte maître ne peut " +
      "pas porter l'abonnement qu'on lui vend",
  );
  // L'INVARIANT LE PLUS IMPORTANT DE CE FICHIER, et le seul qui s'affirme par
  // une ABSENCE. 'household_member' est HÉRITÉ: le maître paie. S'il apparaît
  // sur une ligne d'abonnement, quelqu'un vient de mettre sur une facture un
  // accès dont on a promis qu'il ne coûterait rien à celui qui l'a.
  assert(
    !/'household_member'/.test(body),
    "subscriptions_tier_check admet 'household_member' — un droit hérité vient " +
      "d'être rendu facturable, exactement comme si 'student' y entrait",
  );
  assert(
    !/'student'/.test(body),
    "subscriptions_tier_check admet 'student' — même faute, l'autre droit hérité",
  );
});

// ---------------------------------------------------------------------------
// SITE 3 — billing-tier.ts (Deno) : preuve PAR LE COMPORTEMENT
// ---------------------------------------------------------------------------

Deno.test("site 3/4 · le backend reconnaît les deux jetons", () => {
  for (const token of HOUSEHOLD_TOKENS) {
    assert(isKeelTier(token), `isKeelTier('${token}') est faux`);
    assert(
      tierGrantsProtocolExecution(token),
      `tierGrantsProtocolExecution('${token}') est faux: un foyer qui paie serait ` +
        `éjecté des chemins qu'il vient d'acheter`,
    );
  }
  // Le type porte les jetons: si l'un d'eux quittait `KeelTier`, ces
  // affectations ne compileraient plus (`deno check`).
  const a: EffectiveTier = "household";
  const b: EffectiveTier = "household_member";
  assertEquals([a, b], ["household", "household_member"]);
});

// ---------------------------------------------------------------------------
// SITE 4 — frontend/src/lib/entitlements.ts
// ---------------------------------------------------------------------------
//
// Lu comme TEXTE et pas importé: ce fichier appartient à l'autre runtime (il
// lit `import.meta.env`, et il est compilé par vite, pas par deno). On affirme
// donc que les jetons sont présents DANS LES TROIS ENDROITS qui décident —
// le type, le normaliseur, et le lecteur d'abonnement — plutôt qu'une seule
// fois quelque part. Le versant comportemental est prouvé côté vitest
// (`frontend/src/lib/entitlements.test.ts`).

Deno.test("site 4/4 · le frontend porte les deux jetons partout où il décide", async () => {
  const src = await Deno.readTextFile(ENTITLEMENTS_TS);
  // On retire les commentaires: une mention en commentaire est exactement le
  // faux-vert que ce dépôt a déjà payé (`wiring-check` fait le même geste).
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  for (const token of HOUSEHOLD_TOKENS) {
    const hits = code.split(`"${token}"`).length - 1;
    assert(
      hits >= 3,
      `'${token}' n'apparaît que ${hits} fois dans le CODE de entitlements.ts. ` +
        `Il en faut au moins trois: le type KeelTier, normalizeAccessTierValue ` +
        `(sans quoi le palier s'effondre sur 'none' et l'écran propose d'acheter ` +
        `à quelqu'un qui paie déjà) et getEffectiveTier.`,
    );
  }
});

// ---------------------------------------------------------------------------
// LE CONTRÔLE CROISÉ — ce que les deux runtimes doivent dire pareil
// ---------------------------------------------------------------------------

Deno.test("les deux runtimes admettent EXACTEMENT le même vocabulaire", async () => {
  const backend = await Deno.readTextFile(BILLING_TIER_TS);
  const frontend = await Deno.readTextFile(ENTITLEMENTS_TS);
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const tokensOf = (src: string) => {
    const m = strip(src).match(/export type KeelTier\s*=\s*([^;]+);/);
    assert(m, "KeelTier introuvable");
    return (m![1].match(/"([a-z_]+)"/g) ?? []).map((t) => t.replace(/"/g, "")).sort();
  };

  assertEquals(
    tokensOf(backend),
    tokensOf(frontend),
    "KeelTier diverge entre le backend et le frontend: un jeton connu d'un seul " +
      "côté est un accès que l'un accorde et que l'autre ignore",
  );
  assertEquals(
    tokensOf(backend),
    ["coach", "household", "household_member", "student"],
  );
});
