import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * LOT A — LA SORTIE DE L'ENTONNOIR PASSE PAR L'APERÇU, ET ON LE PROUVE.
 *
 * ── LE DÉFAUT QUE CE FICHIER ÉPINGLE ──────────────────────────────────────
 * `SetupPage.compose()` appelait `generateMeal` / `generateHouseholdMeal` avec
 * `intent: "prepare_next"` — c'est-à-dire qu'il ÉCRIVAIT. Le tout premier plan
 * de quelqu'un, le seul moment où il décide de rester, arrivait donc sans qu'il
 * l'ait vu, sans le CONSTAT qui dit pourquoi ces jours-là, et sans aucun geste
 * pour dire « pas comme ça ».
 *
 * La fenêtre d'aperçu (`PlanDraftDialog`, `intent: "draft"`, ZÉRO écriture)
 * existait déjà depuis le 2026-08-13. Elle n'était montée que sur `/app/plan`:
 * en venant de l'inscription, on ne la rencontrait jamais.
 *
 * ── POURQUOI CE TEST LIT LA SOURCE PLUTÔT QUE DE MONTER L'ÉCRAN ───────────
 * Ce qu'il faut prouver est un CÂBLAGE — quel appel part, avec quel `intent`,
 * depuis quel bouton. Monter `SetupPage` demanderait une session, une base et
 * deux appels modèle de 100 à 200 secondes chacun; le fait à garder tient dans
 * la source, et il tient à ne PAS régresser. Le parcours réel, lui, est fait à
 * la main et consigné au rapport: les deux se complètent, aucun ne remplace
 * l'autre.
 *
 * ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`.
 * `SetupPage.tsx` PARLE longuement de `generateMeal` dans ses en-têtes, et un
 * grep naïf compterait ces morts-là comme des vivants.
 */

const ROOT = resolve(__dirname, "../../../..");

function code(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at < 0) return line;
      // `https://` et les autres `:` collés ne sont pas des commentaires.
      if (at > 0 && line[at - 1] === ":") return line;
      return line.slice(0, at);
    })
    .join("\n");
}

describe("l'entonnoir sort par l'aperçu, pas par l'écriture", () => {
  const src = code("frontend/src/keel/pages/SetupPage.tsx");

  /**
   * LE CAS QUI FAIT TOUT LE TEST. Un seul de ces deux appels qui revient, et
   * le lot est défait: le bouton de fin écrirait de nouveau sans montrer.
   */
  it("plus aucun appel d'écriture directe depuis l'entonnoir", () => {
    expect(src, "le générateur individuel écrit de nouveau depuis l'entonnoir")
      .not.toContain("generateMeal(");
    expect(src, "le générateur de foyer écrit de nouveau depuis l'entonnoir")
      .not.toContain("generateHouseholdMeal(");
  });

  it("le bouton de fin demande un aperçu", () => {
    expect(src, "`composeDraft` n'est plus appelé").toContain("composeDraft(");
    // ⚠️ `guardCompose` ET PLUS `guard`, DEPUIS LE 2026-08-15. Le refus du
    // bouton de fin atterrissait dans le bandeau du HAUT de la page, à
    // plusieurs écrans du geste: « je clique et rien ne se passe ». Ce qui est
    // épinglé ici est l'APPEL À `askForDraft` depuis le bouton — quel que soit
    // le garde qui l'enveloppe, il ne doit jamais redevenir une écriture
    // directe.
    expect(src, "le bouton de fin ne demande plus l'aperçu").toContain(
      "guardCompose(askForDraft)",
    );
  });

  /**
   * ⛔ LA FENÊTRE EST MONTÉE, ET ELLE REÇOIT LE CONSTAT.
   *
   * `rationale={[]}` posé en dur aurait rendu MUET le constat, c'est-à-dire la
   * moitié de ce lot: la fenêtre se serait ouverte, le plan se serait affiché,
   * et « pourquoi ces jours-là » n'aurait été nulle part. C'est très exactement
   * la cicatrice `mine={null}` d'une carte voisine, qui a rendu muet un lot
   * entier sans qu'aucun test ne bouge.
   */
  it("la fenêtre est montée, et `rationale` a bien quitté les props", () => {
    expect(src, "la fenêtre d'aperçu n'est plus montée").toContain(
      "<PlanDraftDialog",
    );
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-11 — CETTE ASSERTION N'ASSERTAIT RIEN
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ ELLE ÉTAIT ÉCRITE `toContain()` — SANS ARGUMENT. Le retrait de
    // `rationale` (décision produit du 2026-09-09) avait laissé le commentaire
    // et emporté la chaîne. `tsc` le voyait (« Expected 1 arguments, but got
    // 0 »), `vitest` non: le cas restait VERT en ne vérifiant rien.
    //
    // ⚠️ C'est la forme la plus coûteuse d'un test mort: il a l'air de garder
    // quelque chose. On ne le supprime donc pas — on lui rend la propriété
    // INVERSE, celle que la décision produit a créée: `rationale` ne doit plus
    // être passé au dialogue.
    expect(src, "`rationale` est revenu dans les props du dialogue").not.toMatch(
      /rationale\s*=/,
    );
  });

  /**
   * L'ADOPTION EST LE SEUL CHEMIN QUI ÉCRIT, et elle écrit par le module
   * partagé — jamais par un appel refait ici.
   */
  it("adopter écrit par `writeFromDraft`, en `prepare_next`", () => {
    expect(src, "l'adoption n'écrit plus").toContain("writeFromDraft(");
    expect(src, "l'adoption a changé d'intention").toContain('"prepare_next"');
  });

  /**
   * ⛔ LA GARDE INVERSE, ET ELLE COMPTE AUTANT QUE LES AUTRES.
   *
   * Sans elle, ce fichier ne distinguerait pas « on a branché l'aperçu » de
   * « on a cassé la sortie ». Un aperçu qu'on ne peut pas adopter est un
   * entonnoir sans sortie — et l'atterrissage est le PLAN, jamais `/app/today`:
   * quelqu'un qui vient d'adopter a un plan, et c'est ce qu'il doit voir.
   */
  it("l'entonnoir a toujours une sortie, et elle mène au plan", () => {
    expect(src, "l'atterrissage a bougé").toContain(
      'navigate("/app/plan", { replace: true })',
    );
  });

  /**
   * LA SOURCE UNIQUE DES ENTRÉES. Les trois gestes (aperçu, reprise, adoption)
   * passent par `draftInput`: deux corps de requête écrits séparément
   * divergeraient, et la divergence se paierait dans le sens le plus cher — un
   * plan composé pour une vie que la personne n'a pas, parce que l'adoption
   * aurait « oublié » la fenêtre.
   */
  it("les trois gestes partagent le même constructeur d'entrées", () => {
    const calls = src.match(/draftInput\(/g) ?? [];
    // La définition + les trois appels.
    expect(calls.length, "un geste s'est mis à écrire son propre corps")
      .toBeGreaterThanOrEqual(4);
    // ⟳ 2026-09-10 · LOT 7 — IL N'Y A PLUS DE LANE À DÉCIDER. Ce cas exigeait
    // `chooseGenerator({` ici, pour que la règle ne soit pas recopiée en `if`
    // dans la page. La règle a disparu avec le second moteur: ce qui la
    // remplace est l'absence de tout choix — donc c'est l'ABSENCE qu'on épingle.
    expect(src, "un choix de moteur est revenu dans la page")
      .not.toMatch(/generate-(household-)?meal-v1/);
    expect(src, "un sélecteur « pour moi / pour le foyer » est apparu")
      .not.toMatch(/lane:/);
  });
});

describe("l'aperçu du plan reste le rendu unique, et il n'écrit rien", () => {
  /**
   * ⛔ CE QUI AUTORISE À BRANCHER L'ENTONNOIR DESSUS. `intent: "draft"` saute
   * la SEULE écriture et garde toutes les gardes amont. Si ce fait cessait
   * d'être vrai, le premier plan de quelqu'un s'écrirait au premier « refaire ».
   */
  it("`composeDraft` demande bien `draft`, et `writeFromDraft` ne le fait pas", () => {
    const api = code("frontend/src/keel/api/planDraft.ts");
    expect(api).toContain('callGenerator(input, "draft")');
    expect(api).toContain("callGenerator(input, intent, replaces)");
  });

  it("l’adoption est bornée et ne relance pas le modèle avant son écriture", () => {
    const api = code("frontend/src/keel/api/planDraft.ts");
    expect(api).toContain('if (intent !== "draft") body.adopting_draft = true');
    expect(api).toContain('{ timeout: 120_000 }');

    for (const rel of [
      "supabase/functions/generate-household-meal-v1/index.ts",
      "supabase/functions/generate-household-meal-v1/index.ts",
    ]) {
      const server = code(rel);
      expect(server, rel).toContain("DRAFT_ADOPTION_MODEL_TIMEOUT_MS = 100_000");
      expect(server, rel).toContain("plan_adoption_timed_out");
      // ⟳ 2026-09-09 — sur la lane foyer la coupure porte un nom, parce
      // qu'elle vaut aussi pour la reprise locale (`edit_cells`) :
      // `improvementRetries = !adoptingDraft && !editing`. La lane solo n'a
      // pas de reprise locale et garde le littéral.
      const gate = rel.includes("household") ? "improvementRetries" : "!adoptingDraft";
      if (rel.includes("household")) {
        expect(server, rel).toContain("const improvementRetries = !adoptingDraft && !editing;");
      }
      expect(server, rel).toContain(`anchorMissingBefore > 0 && ${gate}`);
      expect(server, rel).toContain(`instruction && ${gate}`);
    }
  });

  it("un plan écrit malgré une réponse perdue sort du tunnel au rechargement", () => {
    const setup = code("frontend/src/keel/pages/SetupPage.tsx");
    expect(setup).toContain("if (read.hasPlan)");
    expect(setup).toContain('navigate("/app/plan", { replace: true })');
  });

  /**
   * LE RENDU EST MONTÉ DEUX FOIS, ET IL EST LE MÊME. `PlanDraftDialog` monte
   * `PlanResult`, extrait exprès pour ça: un second rendu divergerait au
   * premier correctif, et c'est celui qu'on regarde le moins qui garderait
   * l'ancien comportement.
   */
  it("la fenêtre monte `PlanResult`, elle ne rend pas un plan à elle", () => {
    const dialog = code("frontend/src/keel/components/plan/PlanDraftDialog.tsx");
    expect(dialog).toContain("<PlanResult");
  });
});

describe("le prénom du maître atteint la colonne que le prompt lit", () => {
  /**
   * ── LE DÉFAUT MESURÉ LE 2026-08-18, SUR UN PROMPT RÉEL ──────────────────
   * `/app/setup` §2 rend « FIRST NAME — How the plan names your serving ». Il
   * n'écrivait que `profiles.full_name`. Or le roster
   * (`keel_household_roster_for`) ne rend QUE `household_members.first_name`,
   * et c'est ce prénom-là que le brief de portions, la liste d'ids et les
   * règles de maison citent au modèle.
   *
   * `keel_household_create` n'y recopie le premier mot du `full_name` QU'UNE
   * FOIS — l'arbitrage est écrit dans la RPC: « s'il renomme son profil plus
   * tard, son prénom au foyer ne suit pas; il le change au foyer ».
   *
   * Résultat mesuré: « Sacha » tapé à l'écran, `Student` servi au modèle six
   * fois. Le champ réaffichait même « Student » au retour, puisqu'il LIT le
   * roster et ÉCRIVAIT le profil.
   *
   * ⚠️ Ce test lit la SOURCE, comme les autres de ce fichier: ce qu'il faut
   * garder est un câblage, et `saveSelf` ne se monte pas sans base ni session.
   */
  it("`saveSelf` appelle `setMemberName`, pas seulement `saveOwnProfile`", () => {
    const src = code("frontend/src/keel/pages/SetupPage.tsx");
    expect(src, "la porte du prénom de foyer est importée").toContain(
      "setMemberName",
    );
    const save = src.slice(src.indexOf("function saveSelf("));
    const body = save.slice(0, save.indexOf("\n  function "));
    expect(body, "`saveSelf` écrit le profil").toContain("saveOwnProfile(");
    expect(
      body,
      "`saveSelf` écrit AUSSI la ligne de foyer — sans quoi le plan nomme le maître avec le prénom figé à la création",
    ).toContain("setMemberName(");
  });
});
