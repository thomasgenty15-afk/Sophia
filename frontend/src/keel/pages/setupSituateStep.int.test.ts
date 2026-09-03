import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MouthsStep, SituateStep } from "./SetupPage";
import {
  emptyFunnelState,
  type FunnelFacts,
  withPendingHouseholdSize,
} from "../api/onboarding";
import { emptyMouthDraft } from "../lib/mouthForm";
import { en } from "../i18n/en";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// LE SEUL CUL-DE-SAC TOTAL DE L'ENTONNOIR, ET SA PORTE (2026-08-19)
//
// ── LE FAIT MESURÉ ────────────────────────────────────────────────────────
// Compte réel, étape 2. La personne appuie sur « Continuer », l'écran absorbe
// le brouillon de bouche (décision du 2026-08-15, voulue), et elle se retrouve
// avec quelqu'un qu'elle ne voulait pas. Ses mots: « ça m'a rajouté une
// personne que je voulais pas, et je peux même pas la retirer et faire
// continuer ».
//
// Les deux moitiés étaient vraies, et vérifiées:
//
//   · L'AJOUT ÉTAIT MUET. Rien avant le clic ne disait que « Continuer »
//     enregistrerait la fiche, rien après ne disait qu'il l'avait fait.
//
//   · ET LE RETRAIT NE MENAIT NULLE PART. La branche se dérive du nombre de
//     bouches en `max(2, …)`: une fois le foyer créé elle reste « à deux »
//     pour toujours, l'étape 2 retient sur `missing_mouths`, et la tuile
//     « Juste moi » était grisée SANS UN MOT. Le commentaire qui justifiait ce
//     verrou renvoyait vers `/app/household` — qui ne sait retirer que des
//     membres, jamais défaire un foyer. Il n'existait aucune sortie.
//
// ⚠️ CE FICHIER NE PROUVE QUE CE QUE L'ÉCRAN DIT ET PROPOSE. La garde est en
// base (`keel_household_dissolve`, motifs `not_alone` et `household_has_plans`)
// et elle a son propre test, là où elle vit:
// `supabase/tests/keel/household_dissolve_test.sql`. Une limite d'UI n'est pas
// une limite — les deux fichiers sont nécessaires, aucun ne remplace l'autre.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait jamais collecté, et le fichier
// entier serait un silence vert.
// ===========================================================================

setChosenUiLocaleForTest("en-GB");

describe("le choix d'un compte neuf avant la création de son objectif", () => {
  const fresh: FunnelFacts = {
    branch: "pair",
    state: emptyFunnelState(),
    mouths: [],
    householdId: "household-1",
    ownMemberId: "member-1",
    isOwner: true,
    hasPlan: false,
    practicalConstraints: null,
    ownEatingSlots: null,
    ownAway: [],
  };

  it("garde la famille choisie sans inventer un objectif provisoire", () => {
    const projected = withPendingHouseholdSize(fresh, 3);
    expect(projected.branch).toBe("family");
    expect(projected.state.mouths).toBe(3);
    expect(projected.state.self.goal).toBeNull();
    expect(projected.householdId).toBe(fresh.householdId);
  });

  it("garde le solo choisi avec zéro personne à ajouter", () => {
    const projected = withPendingHouseholdSize(fresh, 1);
    expect(projected.branch).toBe("solo");
    expect(projected.state.mouths).toBe(1);
    expect(projected.state.others).toEqual([]);
  });
});

function situate(patch: {
  hasHousehold: boolean;
  hasOtherMouths: boolean;
  armed?: boolean;
}): string {
  return renderToStaticMarkup(
    createElement(SituateStep, {
      current: patch.hasHousehold ? 2 : null,
      hasHousehold: patch.hasHousehold,
      hasOtherMouths: patch.hasOtherMouths,
      isOwner: true,
      busy: false,
      onChoose: () => {},
      dissolve: {
        armed: patch.armed ?? false,
        onConfirm: () => {},
        onCancel: () => {},
      },
    }),
  );
}

/** La tuile « Juste moi », telle qu'elle est rendue — attribut `disabled` compris. */
function soloTile(html: string): string {
  const at = html.indexOf(en["setup.situate.solo"]);
  expect(at).toBeGreaterThan(-1);
  // Le `<button>` qui la porte commence avant son libellé; on remonte jusqu'à
  // lui plutôt que de deviner la forme des classes, qui bouge.
  const open = html.lastIndexOf("<button", at);
  expect(open).toBeGreaterThan(-1);
  return html.slice(open, at);
}

describe("« Juste moi » quand un foyer existe déjà", () => {
  it("reste désarmé tant qu'il reste quelqu'un à table, ET DIT POURQUOI", () => {
    const html = situate({ hasHousehold: true, hasOtherMouths: true });
    expect(soloTile(html)).toContain("disabled");
    // ⚠️ L'ASSERTION QUI COMPTE. Le verrou existait déjà; ce qui manquait est
    // la phrase. « Un refus qui ne dit pas ce qui le lèverait n'est pas un
    // refus, c'est un mur » — et elle nomme le geste qui le lève.
    expect(html).toContain(en["setup.situate.solo_locked"]);
  });

  it("s'ouvre quand le maître est seul — il n'y a plus rien à effacer", () => {
    const html = situate({ hasHousehold: true, hasOtherMouths: false });
    expect(soloTile(html)).not.toContain("disabled");
    // Et la phrase du verrou disparaît avec lui: elle décrirait un mur absent.
    expect(html).not.toContain(en["setup.situate.solo_locked"]);
  });

  it("ne dit rien de tout ça quand aucun foyer n'existe", () => {
    const html = situate({ hasHousehold: false, hasOtherMouths: false });
    expect(soloTile(html)).not.toContain("disabled");
    expect(html).not.toContain(en["setup.situate.solo_locked"]);
  });
});

describe("la défaite du foyer se confirme, et elle dit ce qu'elle emporte", () => {
  it("n'est pas proposée avant d'avoir été armée", () => {
    const html = situate({ hasHousehold: true, hasOtherMouths: false });
    expect(html).not.toContain(en["setup.situate.dissolve_confirm"]);
    expect(html).not.toContain(en["setup.situate.dissolve_do"]);
  });

  it("armée, elle nomme CE QUI PART et CE QUI RESTE, et laisse renoncer", () => {
    const html = situate({
      hasHousehold: true,
      hasOtherMouths: false,
      armed: true,
    });
    const confirm = en["setup.situate.dissolve_confirm"];
    expect(html).toContain(confirm);
    // ⚠️ PAS SEULEMENT « une phrase est là ». Ce qui rend ce geste acceptable
    // est qu'il dise les deux moitiés: la promesse (le profil et la direction
    // survivent) est tenue en base par l'absence de cascade, et elle est
    // affirmée là-bas — ici on garde qu'elle est bien ÉNONCÉE avant le clic.
    expect(confirm).toMatch(/profile/i);
    expect(confirm).toMatch(/direction/i);
    expect(html).toContain(en["setup.situate.dissolve_do"]);
    expect(html).toContain(en["setup.situate.dissolve_cancel"]);
  });
});

// ---------------------------------------------------------------------------
// L'AUTRE MOITIÉ: « CONTINUER » NE CRÉE PLUS PERSONNE EN SILENCE
// ---------------------------------------------------------------------------

function mouths(patch: {
  firstName?: string;
  added?: string | null;
  formOpen?: boolean;
}): string {
  return renderToStaticMarkup(
    createElement(MouthsStep, {
      mouths: [],
      maxOthers: 7,
      draft: { ...emptyMouthDraft(), firstName: patch.firstName ?? "" },
      onDraftChange: () => {},
      onAdd: () => {},
      held: null,
      failure: null,
      added: patch.added ?? null,
      formOpen: patch.formOpen ?? true,
      onOpenForm: () => {},
      onDiscard: () => {},
      onGoal: () => {},
      onBirthDate: () => {},
      onAllergyAnswer: () => {},
      onOpenDraftPreferences: () => {},
      onOpenMouthPreferences: () => {},
      mouthPrefs: null,
      knownPrefs: () => emptyMouthDraft(),
      onSaveMouthPreferences: () => {},
      onBody: () => {},
      onRemove: () => {},
      editingMemberId: null,
      onToggleEdit: () => {},
      targets: new Map(),
      onTarget: () => {},
      confirmRemove: null,
      onConfirmRemove: () => {},
      inviteFor: null,
      onInviteFor: () => {},
      inviteEmail: "",
      onInviteEmail: () => {},
      onInvite: () => {},
      invite: null,
      busy: false,
    }),
  );
}

describe("ce que « Continuer » fait de la fiche, dit des deux côtés du clic", () => {
  it("AVANT: une fiche nommée annonce qu'elle sera enregistrée, et par qui", () => {
    const html = mouths({ firstName: "Christèle" });
    expect(html).toContain(
      en["setup.mouths.next_will_save"].replace("{name}", "Christèle"),
    );
  });

  it("AVANT: rien n'est annoncé sur une fiche ouverte mais vide", () => {
    // Une phrase posée sous un formulaire vide invite à se demander de qui elle
    // parle: elle n'a personne à nommer tant qu'aucun prénom n'est tapé.
    const html = mouths({});
    expect(html).not.toContain("Continue” saves this card too");
  });

  it("APRÈS: l'ajout est nommé, et la sortie avec", () => {
    const html = mouths({ added: "Christèle" });
    const done = en["setup.mouths.added_by_next"].replace("{name}", "Christèle");
    expect(html).toContain(done);
    // ⚠️ UN ACCUSÉ QUI NE DIT PAS COMMENT LE DÉFAIRE EST UN FAIT ACCOMPLI.
    // C'est exactement ce que la personne a vécu: quelqu'un est apparu, et
    // rien ne disait que « Retirer » sur sa carte l'annule.
    expect(done).toMatch(/remove/i);
  });

  it("APRÈS: rien tant que rien n'a été absorbé", () => {
    expect(mouths({})).not.toContain("is now at the table");
  });
});

// ---------------------------------------------------------------------------
// LA FICHE D'AJOUT S'OUVRE SUR UN GESTE, ET SE REFERME SUR UN AUTRE
//
// ── LA SECONDE MOITIÉ DU MÊME SIGNALEMENT ─────────────────────────────────
// Capture à l'appui, 2026-08-19: « comment ça se fait que je peux toujours pas
// supprimer le truc qui s'est ajouté tout seul ? » — la capture montrait le
// FORMULAIRE D'AJOUT, vide. Il était monté en permanence sous la liste, avec
// les mêmes champs, le même bouton de préférences et la même phrase « rien de
// renseigné » qu'une bouche inscrite; pour seule différence, un trait de
// bordure en pointillé. Un bloc en forme de personne, que personne n'avait
// demandé et que rien ne permettait de faire disparaître.
//
// Ses mots sur la réparation: « quand une personne clique sur ajouter sans
// faire exprès, ça se déplie et il peut vouloir le supprimer tout simplement,
// donc ajoute un retirer ».
// ---------------------------------------------------------------------------

describe("la fiche d'ajout se replie", () => {
  it("repliée, il n'y a qu'un bouton — aucun champ de personne", () => {
    const html = mouths({ formOpen: false });
    expect(html).toContain(en["setup.mouths.add"]);
    // ⚠️ LES TROIS QUI FAISAIENT LE SOSIE. Le prénom, la porte des préférences
    // et sa phrase « rien de renseigné » sont exactement ce qui donnait à ce
    // bloc l'allure d'une bouche inscrite.
    expect(html).not.toContain(en["setup.people.first_name"]);
    expect(html).not.toContain(en["household.mouth.preferences_open"].replace(/\{who\}/g, en["household.mouth.who_fallback"]));
    // ⟳ 2026-09-01 — LE TROISIÈME MARQUEUR ÉTAIT `new_card_hint`, LA PHRASE
    // QUI VIENT D'ÊTRE RETIRÉE. Il est remplacé par la direction, qui est un
    // champ EN FORME DE PERSONNE — donc du même genre que les deux autres, et
    // c'est ce que ce test compte: ce qui donnait au bloc replié l'allure
    // d'une bouche inscrite.
    expect(html).not.toContain(en["setup.mouths.goal"]);
  });

  /**
   * ⛔ « OUVERTE, ELLE DIT QU'ELLE N'EST ENCORE PERSONNE » A ÉTÉ RETOURNÉ
   * (2026-09-01), et c'est un renversement assumé, pas un test réparé.
   *
   * Il exigeait `setup.mouths.new_card` (« Une fiche vide ») et
   * `new_card_hint` (« … il n'y a rien à retirer »), et il exigeait même que
   * la phrase contienne `nothing to remove`. Demandé à l'écran: « ça sert à
   * quoi ça ? […] il faut le supprimer. »
   *
   * ⚠️ CE QU'ON PEUT RETIRER SANS ROUVRIR LE DÉFAUT, ET POURQUOI. Le
   * signalement du 2026-08-19 a reçu DEUX remèdes le même jour: cette phrase,
   * et le bouton « Retirer » rendu INCONDITIONNEL (le test juste en dessous).
   * Le second rend le premier faux — il y a bien quelque chose à retirer,
   * c'est la fiche. Ce test-ci garde donc l'ÉTAT D'ARRIVÉE: la phrase est
   * partie, et le geste qu'elle niait est là.
   */
  it("ouverte, elle ne se commente plus — elle offre la sortie", () => {
    const html = mouths({ formOpen: true });
    expect(html, "la tête « Une fiche vide » est revenue")
      .not.toContain("An empty card");
    expect(html, "« il n'y a rien à retirer » est revenu")
      .not.toMatch(/nothing to remove/i);
    // LE CAS QUI PASSE, et c'est le remède qui reste: sans lui, une fiche qui
    // ne rendrait RIEN passerait les deux lignes du dessus.
    expect(html).toContain(en["setup.mouths.remove"]);
  });

  it("ouverte, elle porte « Retirer » MÊME VIDE", () => {
    // ⛔ C'EST LA DEMANDE EXACTE, ET ELLE N'EST PAS CONDITIONNELLE. Le bouton
    // existait sous le nom « Effacer cette fiche » et n'apparaissait qu'une
    // fois un champ rempli: quelqu'un qui déplie par erreur n'avait donc
    // AUCUNE sortie. Un geste qui s'ouvre sans se refermer est un piège.
    const html = mouths({ formOpen: true });
    expect(html).toContain(en["setup.mouths.remove"]);
    expect(html).toContain(en["setup.mouths.add_confirm"]);
  });

  it("un brouillon rempli la rouvre de force, même déclarée repliée", () => {
    // ⚠️ LA GARDE, PAS UNE COMMODITÉ. Le brouillon survit à des gestes qui ne
    // passent pas par ce composant, et « Continuer » l'ENREGISTRE. Une fiche
    // remplie mais repliée serait invisible ET absorbée: le défaut d'origine,
    // aggravé.
    const html = mouths({ formOpen: false, firstName: "Christèle" });
    expect(html).toContain(en["setup.people.first_name"]);
    expect(html).toContain(
      en["setup.mouths.next_will_save"].replace("{name}", "Christèle"),
    );
  });
});

// ---------------------------------------------------------------------------
// LA CARTE D'UNE PERSONNE INSCRITE NE S'ÉDITE QU'AU BOUTON
//
// ── LE DÉFAUT, ET IL EST DOUBLE ───────────────────────────────────────────
// Signalé le 2026-08-19: « si je mets "perdre du poids", ça demande pas le
// poids de target ni le rythme de perte […] il faut un modifier (et si on
// clique pas sur modifier on peut rien modifier, à part "renseigner ses
// préférences alimentaires") ».
//
//   · LA DONNÉE ÉTAIT INATTEIGNABLE. Le poids visé et le curseur n'existaient
//     que sur la fiche d'AJOUT. Une bouche inscrite sans direction, puis passée
//     à « Perdre du poids » depuis sa carte, ne pouvait JAMAIS recevoir de
//     cible depuis cet écran — et rien ne le disait.
//   · ET LA CARTE ÉTAIT UN FORMULAIRE ARMÉ EN PERMANENCE. Dix contrôles qui
//     écrivent en base au moindre clic, empilés sous chaque prénom.
// ---------------------------------------------------------------------------

function withMouth(patch: {
  editing?: boolean;
  onFile?: boolean;
  maxOthers?: number;
  goal?: "fat_loss" | "maintenance" | null;
  targets?: Map<string, { targetWeightKg: number | null; paceKgPerWeek: number | null }> | null;
}): string {
  const mouth = {
    memberId: "m-1",
    claimed: false,
    eatingSlots: null,
    away: [],
    firstName: "Christèle",
    kind: "adult" as const,
    birthDate: patch.onFile ? "on-file" : null,
    goal: patch.goal === undefined ? "fat_loss" : patch.goal,
    allergiesReviewed: true,
    diet: null,
    heightCm: 165,
    weightKg: 70,
    gender: "female" as const,
    activityLevel: "trains_some" as const,
    // ② LES DEUX AXES (2026-08-20) — c'est EUX que la carte rend maintenant.
    // Le cran ci-dessus reste sur la fiche comme repli nommé, mais l'entonnoir
    // ne le pose plus: il mélangeait une journée et un sport, et forçait à
    // n'en dire qu'un.
    dayActivity: "seated" as const,
    sportFrequency: "1_2" as const,
  };
  return renderToStaticMarkup(
    createElement(MouthsStep, {
      mouths: [mouth],
      maxOthers: patch.maxOthers ?? 7,
      draft: emptyMouthDraft(),
      onDraftChange: () => {},
      onAdd: () => {},
      held: null,
      failure: null,
      added: null,
      formOpen: false,
      onOpenForm: () => {},
      onDiscard: () => {},
      onGoal: () => {},
      onBirthDate: () => {},
      onAllergyAnswer: () => {},
      onOpenDraftPreferences: () => {},
      onOpenMouthPreferences: () => {},
      mouthPrefs: null,
      knownPrefs: () => emptyMouthDraft(),
      onSaveMouthPreferences: () => {},
      onBody: () => {},
      onRemove: () => {},
      editingMemberId: patch.editing ? "m-1" : null,
      onToggleEdit: () => {},
      birthDates: patch.onFile
        ? new Map([["m-1", "1971-08-18"]])
        : new Map<string, string>(),
      targets: patch.targets === undefined
        ? new Map([["m-1", { targetWeightKg: null, paceKgPerWeek: null }]])
        : patch.targets,
      onTarget: () => {},
      confirmRemove: null,
      onConfirmRemove: () => {},
      inviteFor: null,
      onInviteFor: () => {},
      inviteEmail: "",
      onInviteEmail: () => {},
      onInvite: () => {},
      invite: null,
      busy: false,
    }),
  );
}

describe("une carte inscrite ne s'édite qu'au bouton « Modifier »", () => {
  it("en couple, la fiche d'ajout disparaît après l'unique autre personne", () => {
    const html = withMouth({ maxOthers: 1 });
    expect(html).not.toContain(en["setup.mouths.add"]);
    expect(html).not.toContain('id="setup-mouth-name"');
  });

  it("au repos: aucun contrôle armé, mais la porte des préférences reste", () => {
    const html = withMouth({});
    expect(html).toContain(en["setup.mouths.edit"]);
    // Les contrôles qui écrivent en base ne sont PAS montés.
    expect(html).not.toContain('id="setup-mouth-g-m-1"');
    expect(html).not.toContain('id="setup-mouth-date-m-1"');
    // ⚠️ L'EXCEPTION EST NOMMÉE, PAS SUBIE: la fenêtre des préférences a son
    // propre bouton d'enregistrement, donc elle ne peut rien écrire par
    // mégarde. C'est la seule chose qui reste atteignable au repos.
    expect(html).toContain(en["household.mouth.preferences_open"].replace(/\{who\}/g, en["household.mouth.who_fallback"]));
    // Et « Retirer » aussi — c'est la sortie, pas une modification.
    expect(html).toContain(en["setup.mouths.remove"]);
  });

  it("en édition: les contrôles reviennent, et le libellé change", () => {
    const html = withMouth({ editing: true });
    expect(html).toContain(en["setup.mouths.edit_done"]);
    expect(html).toContain('id="setup-mouth-g-m-1"');
  });

  it("⛔ en édition ET direction qui bouge: la CIBLE est enfin là", () => {
    // C'est la donnée qui était inatteignable. Sans cette assertion, on
    // pourrait retirer les deux champs et le mode édition aurait toujours
    // l'air de marcher.
    const html = withMouth({ editing: true, goal: "fat_loss" });
    expect(html).toContain('id="setup-row-m-1-target-weight"');
  });

  it("direction qui NE bouge PAS: pas de cible — la base la refuse", () => {
    // `target_needs_direction_check`: une cible sur `maintenance` n'a pas de
    // sens, et un champ qui échoue à tous les coups est pire qu'un champ
    // absent, « parce qu'il promet ».
    const html = withMouth({ editing: true, goal: "maintenance" });
    expect(html).not.toContain('id="setup-row-m-1-target-weight"');
  });

  it("⛔ lecture non faite: AUCUN champ de cible, même en édition", () => {
    // `setMemberTarget` REMPLACE la paire. Un formulaire monté sur du vide non
    // lu effacerait la cible déjà posée au premier enregistrement — la
    // cicatrice `mount-snapshot-forms-need-a-loading-gate`, prise par le bout
    // qui coûte une donnée et pas un affichage.
    const html = withMouth({ editing: true, goal: "fat_loss", targets: null });
    expect(html).not.toContain('id="setup-row-m-1-target-weight"');
  });
});


// ---------------------------------------------------------------------------
// ⛔ « MODIFIER » DOIT DONNER ACCÈS À CE QU'ON SAIT DÉJÀ
//
// Signalé le 2026-08-19, capture à l'appui: « quand on clique sur modifier sur
// un profil déjà ajouté, on n'a pas accès à date de naissance, poids etc. ».
// Les deux blocs étaient conditionnés à l'ABSENCE du fait:
//
//   · le corps ne se rendait que si taille, poids OU sexe manquaient — donc une
//     faute de frappe sur un poids était définitive, aucun écran de l'entonnoir
//     ne permettait de la corriger;
//   · la date de naissance ne se rendait que si elle manquait — et à la place,
//     une phrase disait « laisse ce champ vide pour la garder, ou choisis une
//     nouvelle date pour la remplacer », en parlant d'un champ absent.
// ---------------------------------------------------------------------------

describe("« Modifier » ouvre AUSSI ce qui est déjà renseigné", () => {
  it("le corps se réédite, et les champs arrivent REMPLIS", () => {
    const html = withMouth({ editing: true });
    // ⚠️ « rempli » compte autant que « présent »: `set_member_body` est
    // tout-ou-rien, donc des champs vides sur un corps connu le reposeraient à
    // vide au premier Enregistrer.
    expect(html).toContain('value="165"');
    expect(html).toContain('value="70"');
    expect(html).toContain('<option value="female" selected=""');
  });

  it("la date de naissance a son champ, même déjà en base", () => {
    const html = withMouth({ editing: true });
    expect(html).toContain('id="setup-mouth-date-m-1"');
  });
});


// ---------------------------------------------------------------------------
// ⛔ LA CARTE RELIT CE QU'ELLE A ÉCRIT
//
// Signalé le 2026-08-19: « j'ai l'impression que la date de naissance, ses
// journées comment elles sont, ne s'enregistrent pas ». Vérifié en base: tout y
// était. Le défaut était à la RELECTURE — et du point de vue de qui remplit,
// « pas réaffiché » et « pas enregistré » sont la même chose.
//
// La cause: les tuiles d'activité lisaient un brouillon local parti de `null`.
// Elles lisaient `m.activityLevel` tant qu'une seconde branche existait pour le
// cas « corps déjà connu »; cette branche a disparu avec la réouverture du corps
// en édition, et la semence n'a pas suivi.
// ---------------------------------------------------------------------------

describe("la carte réaffiche ce que la base porte", () => {
  it("les DEUX AXES enregistrés sont COCHÉS", () => {
    // ⛔ CE TEST PORTAIT SUR LE CRAN MÉLANGÉ, ET IL A CHANGÉ D'OBJET LE
    // 2026-08-20 — pas de garde. Ce qu'il tient est inchangé: **la carte
    // réaffiche ce que la base porte**. C'est la cicatrice « formulaire figé au
    // montage » — « j'ai l'impression que ses journées comment elles sont ne
    // s'enregistre pas », alors que la base l'avait bien.
    //
    // ⚠️ LES DEUX SONT VÉRIFIÉS, PAS UN. `activityFactorOf` n'applique le
    // croisement que si les deux sont là; une carte qui n'en réafficherait
    // qu'un ferait perdre l'autre au premier enregistrement, et la fiche
    // retomberait en silence sur son cran d'avant.
    const html = withMouth({ editing: true });
    // ⚠️ LA TUILE EST UN `<button aria-pressed>`, pas un radio: c'est
    // `aria-pressed` qui porte le choix, et c'est aussi la SEULE chose qui le
    // dise à un lecteur d'écran (la bordure teintée ne compte pas — WCAG
    // 1.4.1). L'assertion vise donc l'attribut, pas la classe.
    for (const id of ["setup-row-m-1-day-seated", "setup-row-m-1-sport-1_2"]) {
      const at = html.indexOf(`id="${id}"`);
      expect(at, `tuile absente: ${id}`).toBeGreaterThan(-1);
      const tag = html.slice(at, html.indexOf(">", at));
      expect(tag).toContain('aria-pressed="true"');
    }
    // ⛔ ET LE CRAN MÉLANGÉ N'EST PLUS RENDU. S'il revenait à côté des deux
    // axes, l'écran poserait DEUX fois la même question dans deux vocabulaires,
    // et `activityFactorOf` n'en lirait qu'un — celui qu'on regarde le moins.
    expect(html).not.toContain('id="setup-row-m-1-activity-trains_some"');
  });

  it("⛔ la DATE elle-même est dans le champ, pas juste « renseignée »", () => {
    // ── LE ROSTER NE LA REND PAS, ET C'ÉTAIT LA VRAIE CAUSE ───────────────
    // « Pourquoi quand c'est fermé il y a marqué "Renseignée", autant
    // l'afficher — parce que quand je déplie, elle ne s'affiche pas non plus »
    // (2026-08-19). Le champ ne pouvait rien montrer: la date n'arrivait pas
    // jusqu'au navigateur. `keel_household_member_birth_date_for_owner` l'ouvre
    // au SEUL maître du foyer — le roster continue de la taire aux autres
    // bouches, ce qui est la règle qu'il porte.
    const html = withMouth({ editing: true, onFile: true });
    expect(html).toContain('value="1971-08-18"');
  });

  it("et le résumé, carte fermée, montre la date au lieu d'un état", () => {
    const html = withMouth({ onFile: true });
    expect(html).not.toContain(en["setup.mouths.summary_on_file"]);
  });
});

// ---------------------------------------------------------------------------
// ⛔ LE RÉCAPITULATIF DES PRÉFÉRENCES LIT LA BASE
//
// Signalé le 2026-08-19: « toutes les préférences alimentaires de tout le monde
// ont sauté ». Deux défauts empilés, et il faut les deux pour comprendre:
//
//   · rien n'était ÉCRIT — la fenêtre éditait un brouillon dont l'écrivain (le
//     bouton d'enregistrement de la fiche) venait d'être retiré. Corrigé sur
//     `onClose`, qui écrit quel que soit le chemin de fermeture;
//   · et rien n'était MONTRÉ — le récapitulatif se calculait sur le brouillon
//     de la fenêtre OUVERTE, donc il rendait `emptyMouthDraft()` pour toute
//     bouche dont la fenêtre était fermée. Même remplies, les préférences
//     n'auraient rien affiché.
//
// Ce fichier garde le second. Le premier est un écrivain, il se prouve en base.
// ---------------------------------------------------------------------------

/** Les props inertes de `MouthsStep` — seul ce que le cas mesure est passé. */
function baseMouthsProps() {
  return {
    maxOthers: 7,
    draft: emptyMouthDraft(),
    onDraftChange: () => {},
    onAdd: () => {},
    held: null,
    failure: null,
    added: null,
    formOpen: false,
    onOpenForm: () => {},
    onDiscard: () => {},
    onGoal: () => {},
    onBirthDate: () => {},
    onAllergyAnswer: () => {},
    onOpenDraftPreferences: () => {},
    onOpenMouthPreferences: () => {},
    onSaveMouthPreferences: () => {},
    onBody: () => {},
    onRemove: () => {},
    editingMemberId: null,
    onToggleEdit: () => {},
    onSaveAndClose: () => {},
    targets: new Map(),
    birthDates: new Map(),
    onTarget: () => {},
    confirmRemove: null,
    onConfirmRemove: () => {},
    inviteFor: null,
    onInviteFor: () => {},
    inviteEmail: "",
    onInviteEmail: () => {},
    onInvite: () => {},
    invite: null,
    busy: false,
  };
}

describe("le récapitulatif des préférences dit ce que la base porte", () => {
  it("une bouche dont la fenêtre est FERMÉE montre quand même ce qu'on sait", () => {
    const html = renderToStaticMarkup(
      createElement(MouthsStep, {
        ...baseMouthsProps(),
        mouths: [{
          memberId: "m-1",
          claimed: false,
          eatingSlots: null,
          away: [],
          firstName: "Christèle",
          kind: "adult" as const,
          birthDate: null,
          goal: "maintenance" as const,
          allergiesReviewed: true,
          diet: "vegetarian" as const,
          heightCm: 165,
          weightKg: 70,
          gender: "female" as const,
          activityLevel: null,
        }],
        // AUCUNE fenêtre ouverte — c'est le cas qui rendait vide.
        mouthPrefs: null,
        knownPrefs: () => ({
          ...emptyMouthDraft(),
          diet: "vegetarian",
          allergiesNone: true,
        }),
      } as never),
    );
    expect(html).not.toContain(en["household.mouth.preferences_empty"]);
  });

  it("⛔ et sans rien en base, il dit qu'il n'y a rien", () => {
    // Le cas qui passe: sans lui, un récapitulatif qui annoncerait TOUJOURS du
    // contenu laisserait l'assertion d'à côté verte pour la mauvaise raison.
    const html = renderToStaticMarkup(
      createElement(MouthsStep, {
        ...baseMouthsProps(),
        mouths: [{
          memberId: "m-1",
          claimed: false,
          eatingSlots: null,
          away: [],
          firstName: "Christèle",
          kind: "adult" as const,
          birthDate: null,
          goal: null,
          allergiesReviewed: false,
          diet: null,
          heightCm: 165,
          weightKg: 70,
          gender: "female" as const,
          activityLevel: null,
        }],
        mouthPrefs: null,
        knownPrefs: () => emptyMouthDraft(),
      } as never),
    );
    expect(html).toContain(en["household.mouth.preferences_empty"]);
  });
});
