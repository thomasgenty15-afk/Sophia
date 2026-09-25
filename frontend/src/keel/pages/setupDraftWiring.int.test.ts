import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { sourceFamily } from "../../test/sourceFamily";

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
  return sourceFamily(resolve(ROOT, rel))
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
    // ⟳ 2026-09-15 · LOT B — `onProgress` voyage en 5ᵉ argument ; le préfixe
    // suffit à épingler l'intention.
    expect(api).toContain('callGenerator(input, "draft"');
    expect(api).toContain("const payload = await callGenerator(");
    expect(api).toContain("draft_id: draftId");
    expect(api).toContain("adopting_draft: true");
  });

  it("l’adoption est bornée et ne relance pas le modèle avant son écriture", () => {
    const api = code("frontend/src/keel/api/planDraft.ts");
    expect(api).toContain("draft_id: draftId");
    expect(api).toContain("adopting_draft: true");
    expect(api).toContain('headers: { "x-request-id": requestId }');
    // ⟳ 2026-09-14 · BÊTA 2B — LA BORNE A CHANGÉ DE FORME, ET DE PORTÉE. Elle
    // était un littéral posé sur la SEULE adoption
    // (`...(intent === "draft" ? {} : { timeout: 120_000 })`): l'aperçu — le
    // geste qui termine l'entonnoir — n'en avait aucune et attendait
    // indéfiniment. Les deux intentions partagent maintenant la même
    // constante, écrite une fois dans `mealGeneration.ts`.
    // ⟳ 2026-09-14 (même jour, plus tard) — ET ELLE A ENCORE CHANGÉ DE FORME:
    // notre propre `AbortController` au lieu de l'option de la bibliothèque.
    // Même seconde, mais l'option rendait un `FunctionsFetchError` impossible
    // à distinguer d'un réseau coupé, et l'écran affichait sa chaîne anglaise.
    expect(api).toContain(
      "setTimeout(() => deadline.abort(), PLAN_CLIENT_TIMEOUT_MS)",
    );
    expect(api).toContain("signal: deadline.signal,");
    expect(api).toContain("await settleInterruptedGeneration(requestId)");
    expect(api).toContain('if (recovered.kind === "in_flight")');
    // ⛔ ET ELLE RESTE SOUS LA PASSERELLE. Kong coupe à 150 s (`read_timeout`,
    // « to match hosted project »): une borne au-dessus rendrait une erreur de
    // passerelle au lieu d'une phrase du produit, et une borne trop basse
    // abandonnerait des générations qui reviennent (116 à 144 s mesurées).
    const api2 = code("frontend/src/keel/api/mealGeneration.ts");
    expect(api2).toContain("export const PLAN_CLIENT_TIMEOUT_MS = 145_000;");
    // ⟳ 2026-09-15 · LOT E — deux baux et un tick de relance ; 235 s s'arrêtait
    // 60 s AVANT le bail, et `plan_expired` était inatteignable.
    expect(api2).toContain(
      "export const PLAN_RECOVERY_WAIT_MS = 2 * PLAN_LEASE_DEADLINE_MS + PLAN_RELAUNCH_GRACE_MS;",
    );
    expect(api2).toContain("export const GATEWAY_READ_TIMEOUT_MS = 150_000;");
    // ⛔ ET L'ANCIENNE FORME NE DOIT PAS REVENIR: c'est elle qui laissait une
    // des deux intentions sans borne.
    expect(api).not.toContain('intent === "draft" ? {} : { timeout');

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
      // ⟳ 2026-09-12 · FERMETURE LOT 1 — LES SITES QUI PORTAIENT CETTE
      // COUPURE N'APPELLENT PLUS LE MODÈLE. Les sept rattrapages d'amont
      // déposent leur constat, et UNE SEULE décision part après la garde
      // finale. La propriété épinglée ici est la même, sur le site qui reste :
      // aucune relance sur une adoption ni sur une reprise locale.
      // ⟳ 2026-09-24 — la reprise locale rouvre l'appel pour UN cas : un repas
      // manquant ou un défaut de sécurité DANS une case demandée
      // (`c4EditRepair`, faux hors `edit_cells`). Une adoption ne l'ouvre
      // toujours pas. Détail épinglé dans `portion_sizing_wiring_test.ts`.
      expect(server, rel).toContain(
        rel.includes("household")
          ? "if (!c4Stop && (improvementRetries || c4EditRepair) && c4Decision.call) {"
          : `if (!c4Stop && ${gate} && c4Decision.call) {`,
      );
      if (rel.includes("household")) {
        expect(server, rel).toContain("const c4EditMust = editing\n");
      }
      // ⛔ ET IL N'Y A QU'UN SEUL APPEL DE RÉPARATION DANS TOUTE LA LANE.
      expect(
        (server.match(/kind: "repair",/g) ?? []).length,
        rel,
      ).toBe(1);
    }
  });

  it("un aperçu en vol se retrouve au rechargement de `/app/plan`", () => {
    const plan = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
    expect(plan).toContain("recoverLatestDraft()");
    // ⟳ 2026-09-15 · LOT B — la reprise rapporte le stade (`onProgress`).
    expect(plan).toContain("waitForDraft(recoverable.draftId,");
  });

  /**
   * ⛔ MESURÉ LE 2026-09-21 : la reprise était câblée sur les deux pages et
   * ne rouvrait JAMAIS la fenêtre en développement. `StrictMode` monte
   * l'effet deux fois ; la garde `recoveredDraftFor.current = userId` posée
   * AVANT l'`await` laissait le premier passage annulé par son nettoyage et
   * le second refusé par la garde. Une requête partait (200, la ligne `done`
   * dedans) et son résultat était jeté. La garde se pose à l'atterrissage.
   */
  for (const rel of ["frontend/src/keel/pages/StudentWeekPlanPage.tsx", "frontend/src/keel/pages/SetupPage.tsx"]) {
    it(`la garde de reprise se pose APRÈS la lecture, jamais avant — ${rel.split("/").pop()}`, () => {
      const src = code(rel);
      const start = src.indexOf("const recoveredDraftFor = React.useRef");
      expect(start, "l'effet de reprise a disparu").toBeGreaterThan(0);
      const effet = src.slice(start, src.indexOf("cancelled = true;", start));
      const read = effet.indexOf("await recoverLatestDraft()");
      const guard = effet.indexOf("recoveredDraftFor.current = userId");
      expect(read).toBeGreaterThan(0);
      expect(guard, "la garde n'est plus posée").toBeGreaterThan(0);
      expect(guard, "la garde est posée avant la lecture : morte sous StrictMode").toBeGreaterThan(read);
      expect(effet.slice(read, guard), "la garde doit se poser dans le `finally` du passage").toContain("finally {");
      expect((effet.match(/recoveredDraftFor\.current = userId/g) ?? []).length).toBe(1);
    });
  }

  /**
   * ⟳ 2026-09-23 — SIGNALÉ : génération lancée sur `/app/plan`, un tour sur
   * « Foyer », retour — l'écran d'attente avait disparu. La reprise suivait la
   * ligne en silence : `PlanComposingCard` n'était rendue que sur l'état du
   * geste lancé dans le montage précédent. Même défaut dans l'entonnoir, où
   * l'attente ne se lisait que dans le bouton, en bas de la dernière étape.
   */
  it("une composition en vol retrouvée au retour remet l'écran d'attente", () => {
    const plan = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
    const setup = code("frontend/src/keel/pages/SetupPage.tsx");
    const builder = code("frontend/src/keel/components/MealBuilder.tsx");
    expect(plan).toContain('if (recoverable.state === "in_flight") setResumingDraft(true);');
    for (const src of [plan, setup]) {
      expect(src).toContain("setResumingDraft(false);");
    }
    expect(plan).toContain("resumedComposition={resumingDraft ? { progress: draftProgress } : null}");
    expect(builder).toContain("const building = launching || resumed !== null;");
    expect(builder).toContain("<PlanComposingCard progress={composingProgress}");
    // ⟳ 2026-09-25 — PLUS DE CARTE DANS L'ENTONNOIR (demandé : elle est pour
    // la plateforme). Un ajustement repris rouvre la fenêtre sur l'aperçu
    // d'avant (`recoverPreviewBehind`) et « Ajuster le plan » tourne; une
    // première composition reprise montre la démonstration, comme sans
    // rechargement. ⟳ 2026-09-25 — gardée sur la COMPOSITION (`composeBusy`
    // ou `resumingDraft`), plus sur `busy`, qui sert aussi aux enregistrements.
    expect(setup).not.toContain("<PlanComposingCard");
    expect(setup).toContain("behind = await recoverPreviewBehind(recoverable.draftId);");
    expect(setup).toContain("setResumedAdjusting(true);");
    expect(setup).toContain("resumedAdjusting={resumedAdjusting}");
    expect(setup).toContain("{((composeBusy || resumingDraft) && draft === null) || demoOpen ? (");
  });

  /**
   * ⟳ 2026-09-21 — L'APERÇU ROUVRE SUR SA SURFACE D'ORIGINE. Chaque page
   * signe la demande (`origin`), la ligne la garde (`request_body`), et au
   * rechargement la page qui n'est pas l'origine renvoie vers celle qui
   * l'est : « Laisser tomber » ramène ainsi là où on était.
   */
  it("l'aperçu porte son origine et se rouvre sur sa surface", () => {
    const plan = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
    const setup = code("frontend/src/keel/pages/SetupPage.tsx");
    const api = code("frontend/src/keel/api/planDraft.ts");
    const builder = code("frontend/src/keel/components/MealBuilder.tsx");
    expect(plan).toContain('origin: "plan",');
    expect(builder, "MealBuilder n'est monté que sur /app/plan").toContain('origin: "plan",');
    expect(setup).toContain('origin: "setup",');
    expect(api).toContain("origin: input.origin,");
    expect(api).toContain("origin:request_body->>origin");
    expect(plan).toContain('if (recoverable.origin === "setup") {');
    expect(plan).toContain("navigate(DRAFT_ORIGIN_PATH.setup, { replace: true });");
    expect(setup).toContain('if (recoverable.origin === "plan") {');
    expect(setup).toContain("navigate(DRAFT_ORIGIN_PATH.plan, { replace: true });");
  });

  /**
   * ⟳ 2026-09-21 — L'APERÇU REPRIS GARDE SA SOURCE. Un brouillon qui
   * remplaçait le plan courant, rouvert après rechargement, s'adoptait en
   * `prepare_next` : le serveur refusait le chevauchement, bouton mort.
   */
  it("l'aperçu repris sur `/app/plan` retrouve ce qu'il remplace", () => {
    const plan = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
    const api = code("frontend/src/keel/api/planDraft.ts");
    expect(api).toContain("replaces:request_body->>replaces");
    const effet = plan.slice(plan.indexOf("const recoveredDraftFor = React.useRef"), plan.indexOf("askForDraft = React.useCallback"));
    expect(effet).toContain('intent: recoverable.replaces === null ? "prepare_next" : "replace_current",');
    expect(effet).toContain("replaces: recoverable.replaces,");
    expect(effet.indexOf("setDraftSource({"), "la source se pose AVANT l'aperçu").toBeLessThan(effet.indexOf("setDraft(recovered)"));
    // ⟳ 2026-09-22 — SA demande, pas la devinette de la page : mesuré à
    // minuit, un brouillon « remplace le courant » recomposé sur la fenêtre
    // SUIVANTE, et un « aujourd'hui » d'hier refusé `bad_window`.
    expect(effet).toContain("input: recoverable.input ?? draftInput(),");
    expect(api).toContain("request_body\"");
    expect(api).toContain("input: readComposeInput(row.request_body),");
    const compose = plan.slice(plan.indexOf("onCompose={async () => {"), plan.indexOf("onEditCells={async (id, cells) => {"));
    expect(compose).toContain("windowFromToday(draftSource?.input ?? draftInput(), todayIso())");
    const edit = plan.slice(plan.indexOf("onEditCells={async (id, cells) => {"), plan.indexOf("onEditCells={async (id, cells) => {") + 400);
    expect(edit).toContain("windowFromToday(draftSource?.input ?? draftInput(), todayIso())");
  });

  // ⟳ 2026-09-24 — MESURÉ : un brouillon de 3 jours composé la veille, repris à
  // la réouverture de l'entonnoir, recevait « Changer » avec la fenêtre par
  // défaut de la page (7 jours) — `draft_mismatch`, aucun plat changé.
  it("l'entonnoir reprend la fenêtre de SA demande, et ses reprises partent de là", () => {
    const setup = code("frontend/src/keel/pages/SetupPage.tsx");
    const effet = setup.slice(setup.indexOf("const recoveredDraftFor = React.useRef"));
    const afterSet = effet.slice(effet.indexOf("setDraft(recovered);"), effet.indexOf("setComposeFailure(null);"));
    // La demande relue d'abord (la veille de cuisine est ajoutée par le
    // serveur, jamais renvoyée ajoutée), la fenêtre rangée à défaut.
    expect(afterSet).toContain("const asked = recoverable.input?.window;");
    expect(afterSet).toContain(': recovered.plan;');
    expect(afterSet, "la fenêtre ne revient pas avec l'aperçu").toContain("setWindowStart(startsOn);");
    expect(afterSet).toContain("setWindowEnd(addDays(startsOn, durationDays - 1));");
    expect(afterSet, "un départ passé ne doit pas être repris").toContain("startsOn >= browserLocalDate()");
    for (const call of [
      "readNote(note, draftInput().window)",
      "editCells(draftInput(), id, cells)",
      "editExclusions(draftInput(), id, {}, swaps)",
      "readRejections(id, rejections, draftInput().window)",
      "replaceDishes(draftInput(), id, rejections)",
    ]) {
      expect(setup, `« ${call} » absent`).toContain(call);
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
