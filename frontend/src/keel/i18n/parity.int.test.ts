// KEEL — ce que le TYPE ne peut pas dire sur le pack français.
//
// `TranslatedMessages` garantit déjà qu'aucune clé publique ne manque: `fr.ts`
// ne compile pas sans elles. Ces ceintures-ci gardent le reste — et le reste
// est ce qui casse en silence.

import { describe, expect, it } from "vitest";
import { en } from "./en";
import { fr } from "./fr";
import {
  isTranslatedMessageKey,
  TRANSLATED_NAMESPACES,
  PENDING_TRANSLATION_NAMESPACES,
} from "./catalog";

/** `{date}`, `{count}` — les trous que `t()` remplit à l'appel. */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("pack français de la vitrine", () => {
  it("porte exactement les clés publiques, ni plus ni moins", () => {
    // Le type couvre le « ni moins ». Le « ni plus » compte aussi: une clé
    // française orpheline est du travail de traduction payé pour un écran qui
    // ne l'affiche plus, et elle survit aux suppressions sans bruit.
    const frKeys = Object.keys(fr).sort();
    const publicKeys = Object.keys(en).filter(isTranslatedMessageKey).sort();
    expect(frKeys).toEqual(publicKeys);
  });

  it("garde les MÊMES trous d'interpolation que l'anglais", () => {
    // LA ceinture de plus forte valeur du lot. Si `en` porte `{date}` et que la
    // traduction écrit `{jour}`, le type est content, le test de clés est
    // content, et `t()` lève au rendu — en DEV chez nous si on ouvre la page,
    // sinon chez un visiteur. Rien d'autre ne l'attrape.
    const mismatches: string[] = [];
    for (const key of Object.keys(fr) as Array<keyof typeof fr>) {
      const a = placeholders(en[key]);
      const b = placeholders(fr[key]);
      if (a.join(",") !== b.join(",")) {
        mismatches.push(`${key}: en={${a.join(",")}} fr={${b.join(",")}}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("ne recopie pas l'anglais pour faire verdir la CI", () => {
    // Une valeur identique à l'anglais est presque toujours une clé oubliée.
    // Les exceptions sont réelles mais rares, et chacune est une ligne VISIBLE
    // en diff — c'est tout l'intérêt d'une liste explicite plutôt que d'un
    // seuil de tolérance.
    const legitimatelyIdentical = new Set<string>([
      "brand.wordmark", // un nom de marque
      "public.footer.contact_email", // une adresse
      "public.footer.contact", // « Contact » s'écrit pareil dans les deux langues
      "public.locale.en", // un sélecteur nomme chaque langue DANS sa langue
      "public.locale.fr",
      // Les NOMS de langue du champ d'inscription. Même raison que les deux
      // au-dessus, et c'est la seule règle qui vaille pour un sélecteur de
      // langue: « English » se dit « English » dans les deux packs, sinon un
      // anglophone perdu dans une interface française ne retrouve pas sa
      // langue dans la liste. Les traduire serait le bug.
      "public.language.en",
      "public.language.fr",
      "public.locale.switch_to_en",
      "public.locale.switch_to_fr",
      // ── LES CITATIONS D'ÉCRAN PRODUIT ────────────────────────────────────
      // ⚠️ CETTE RUBRIQUE A CHANGÉ DE SENS LE 2026-08-13, ET IL FAUT LIRE
      // POURQUOI AVANT D'Y AJOUTER QUOI QUE CE SOIT.
      //
      // Elle disait: une maquette reprend le vrai champ MOT POUR MOT (S10, « on
      // ne montre pas un écran qu'on n'a pas »), or l'app authentifiée est
      // ANGLAISE PAR CHOIX, donc traduire la citation montrerait un écran qui
      // n'existe dans aucune langue. Le raisonnement était juste; sa prémisse ne
      // l'est plus. Les lots 4, 5 et 6 ont traduit les sept écrans élève et cinq
      // écrans coach: `TRANSLATED_NAMESPACES` ne s'arrête plus à la vitrine.
      //
      // La règle est donc devenue son propre inverse: une citation d'écran doit
      // être traduite EXACTEMENT COMME LE PRODUIT LA REND — c'est-à-dire depuis
      // sa clé produit, jamais réécrite à la main. Ce qui reste ici est ce que
      // le produit lui-même ne traduit pas: un nom propre, un identifiant de
      // code, un chiffre, un mot commun aux deux langues.
      //
      // ⚠️ TRENTE-SEPT ENTRÉES SONT SORTIES D'ICI LE 2026-08-13, ET AUCUNE
      // N'A ÉTÉ « CORRIGÉE ». La refonte par la douleur a supprimé les sections
      // qui les portaient: la maquette du lundi et celle du tap du soir sur
      // `/coaches` (la grille a donné le lundi à `/gyms` et au hall `/pro`, et
      // le tap du soir n'est aucune des trois lignes de la page), et le fil de
      // discussion de `/gyms`. Une entrée d'exception qui survit à sa clé est
      // une exception qui protège quelque chose d'inexistant — et le jour où
      // le nom revient pour autre chose, elle le blanchit en silence.
      //
      // ⚠️ ET HUIT DE PLUS SONT SORTIES LE 2026-08-13, POUR LA RAISON INVERSE.
      // La maquette du lundi de `/gyms` gardait `gyms.fig.monday_app`,
      // `_worth`, `_r1`, `_r2`, `_r3`, `_s1`, `_s2`, `_s3` en anglais au nom de
      // cette règle — sous une légende qui jure que ce sont les mots du
      // produit. Or l'app N'EST PLUS anglaise depuis le lot 5: le lundi d'un
      // gérant francophone dit « Cette semaine » et « À qui écrire ». La
      // règle avait survécu à sa cause, et l'exception la protégeait.
      // Les huit sont traduites depuis leur clé produit; seuls les trois
      // PRÉNOMS restent identiques, et la légende dit qu'ils sont inventés.
      "gyms.fig.monday_n1",
      "gyms.fig.monday_n2",
      "gyms.fig.monday_n3",
      // Des IDENTIFIANTS de code cités mot pour mot. Les traduire apprendrait
      // au lecteur une forme que le produit ne rend jamais — même règle que
      // `coach.doctrine.forbidden.token_placeholder` plus bas.
      "families.fig_union.code", // `safety_constraints_unreadable`
      "families.fig_age.code", // `minor_student`
      // ── LES PAYS QUI S'ÉCRIVENT PAREIL DANS LES DEUX LANGUES ─────────────
      // Le sélecteur de pays de `/auth` (inscription coach) est traduit — les
      // quinze autres le sont visiblement (« États-Unis », « Royaume-Uni »,
      // « Pays-Bas »…). Ces trois-là s'écrivent à l'identique en anglais et en
      // français: les « traduire » demanderait d'inventer une différence.
      "auth.country.fr",
      "auth.country.ca",
      "auth.country.pt",
      // ── LES CHIFFRES ET LES MOTS COMMUNS AUX DEUX LANGUES ────────────────
      // Un prix est un fait commercial, pas de la langue. ⚠️ `gyms.price.seat`
      // était ici, et il n'y est PLUS parce que la clé n'existe plus: les sept
      // clés dont la valeur était un montant nu sont sorties du catalogue au
      // lot 6 (`i18n/prices.ts` + `formatPrice`). Elles avaient déjà divergé
      // DANS le pack anglais — « €12.99 » sur deux pages, « 12,99 € » sur deux
      // autres. Ce qui reste ci-dessous sont des ARITHMÉTIQUES d'exemple, pas
      // nos tarifs.
      "gyms.fig.money_in_value",
      "gyms.fig.money_out_value",
      "gyms.fig.money_keep_value",
      "gyms.fig.money_uptake_value", // « 37 clients » — le mot est le même
      "mealprep.start.ask_allergies", // « Allergies » s'écrit pareil
      // ── LES NOMS PROPRES ET LES SIGNATURES ───────────────────────────────
      // Un prénom de figure et une signature ne se traduisent pas. « — Marc »
      // est le nom que le coach a écrit; « — Sophia » est la marque, et c'est
      // précisément le fait que `/gyms` vend (la salle délègue, l'agent signe
      // du nom de la maison et jamais du sien).
      "families.fig_table.m4", // « Jo »
      "families.fig_union.m4", // le même « Jo », deux figures plus loin
      // ⚠️ `coaches.lock.demo.sign` A QUITTÉ CETTE LISTE le 2026-08-13. La
      // signature de la démonstration était « — Marc » des deux côtés; elle est
      // devenue « — your name » / « — ton nom », parce que la fiche est celle du
      // LECTEUR (ses étiquettes disent « ce que tu as écrit »). Elle se traduit
      // donc, et n'a plus rien à faire ici.
      "gyms.fig.house_sign", // « — Sophia »
      // Un cadratin n'est pas un mot: il dit « rien ici », dans les deux
      // langues.
      "families.fig_union.none",
      // ── LES DEUX OBJECTIFS QUI S'ÉCRIVENT PAREIL ─────────────────────────
      // Ce sont les libellés produit des six objectifs. Les quatre autres sont
      // bien traduits (« Perte de gras », « Prise de muscle », « Santé »,
      // « Maintien »), ce qui montre que la table n'est pas recopiée.
      "couples.goal.recomposition",
      "couples.goal.performance",
      // ── LOT 2 · LE COULOIR D'ENTRÉE ──────────────────────────────────────
      // `Nutella` est une marque, et c'est l'exemple du champ « ce que cette
      // maison ne sert pas ».
      "household.restriction.placeholder",
      // « min » est l'abréviation de minute dans les deux langues (et c'est
      // l'abréviation NORMALISÉE, pas un anglicisme). « {n} h » en face, lui,
      // diffère bien de « {n} hr ».
      "setup.plan.time_minutes",
      // « Gluten » est le même mot. Les douze autres allergènes diffèrent tous
      // (« Arachides », « Fruits à coque », « Crustacés »…), et ce sont les
      // termes de l'étiquetage réglementaire français.
      "allergen.gluten",
      // La forme COURTE de l'onglet du plan. « Plan » est le mot dans les deux
      // langues, et c'est le seul des dix onglets dans ce cas — sa forme
      // longue, elle, diffère bien (« Le plan de ma semaine »). Le raccourci
      // existe parce qu'une colonne de la barre du téléphone fait 75 px.
      "app.nav.plan.short",

      // ══ LOT 3 · LES ATOMES PARTAGÉS ═══════════════════════════════════════
      // ⚠️ CE BLOC EST LONG, ET C'EST LA NATURE DE CE QU'IL COUVRE. Les atomes
      // sont des tables de NOMENCLATURE — symboles d'unités, noms de molécules,
      // ponctuation de composition. Une nomenclature internationale s'écrit à
      // l'identique par construction, et « traduire » un symbole SI reviendrait
      // à inventer une différence qu'aucun lecteur français ne reconnaîtrait.
      //
      // La preuve que la table est traduite et non recopiée est dans ce qui
      // n'est PAS ici: « heure/heures » (hour/hours), « UI » (IU), « µg »
      // (mcg), « comprimé » (tablet), « dosette » (scoop), « séance »
      // (session), « répétition » (rep), « cuivre » (copper), « sel » (salt),
      // « millepertuis » (St John's wort) — trente-huit substances sur
      // quarante et onze unités sur vingt-deux diffèrent.

      // ── Les SYMBOLES d'unités, forme en toutes lettres ──────────────────
      // `kcal`, `g`, `mg`, `ml`, `L`, `km`, `kg`, `C`: symboles SI ou d'usage
      // international, identiques au singulier comme au pluriel.
      "unit.one.kcal",
      "unit.many.kcal",
      "unit.one.g",
      "unit.many.g",
      "unit.one.mg",
      "unit.many.mg",
      "unit.one.ml",
      "unit.many.ml",
      "unit.one.l",
      "unit.many.l",
      "unit.one.km",
      "unit.many.km",
      "unit.one.kg",
      "unit.many.kg",
      "unit.one.celsius",
      "unit.many.celsius",
      // « minute(s) », « capsule(s) », « point(s) », « portion(s) » s'écrivent
      // exactement pareil dans les deux langues, au singulier comme au pluriel.
      "unit.one.min",
      "unit.many.min",
      "unit.one.capsule",
      "unit.many.capsule",
      "unit.one.point",
      "unit.many.point",
      "unit.one.portion",
      "unit.many.portion",
      // ⚠️ CES QUATRE SONT VIDES DES DEUX CÔTÉS, ET LE VIDE EST LA VALEUR.
      // `quantity()` (api/labels.ts) teste `word === ""` pour n'imprimer que le
      // nombre: l'unité d'horloge et l'unité `none` n'ont pas de mot. Les
      // remplir en français ajouterait un mot que la phrase ne demande pas.
      "unit.one.hhmm",
      "unit.many.hhmm",
      "unit.one.none",
      "unit.many.none",
      // ── Les mêmes symboles, en pastille ────────────────────────────────
      "unit.kcal",
      "unit.g",
      "unit.mg",
      "unit.ml",
      "unit.l",
      "unit.min",
      "unit.h",
      "unit.km",
      "unit.kg",
      // Lot 6 — le centimètre du tour de taille de `/app/plan`. Symbole SI.
      "unit.cm",
      "unit.capsule",
      "unit.portion",
      "unit.celsius",
      "unit.point",
      "unit.none",
      // ── La NOMENCLATURE des substances ─────────────────────────────────
      // Noms internationaux (DCI, éléments, plantes) identiques en français.
      // « Ashwagandha » est un nom sanskrit repris tel quel dans les deux
      // langues; les autres sont des éléments ou des acides aminés.
      "substance.zinc",
      "substance.gluten",
      "substance.ashwagandha",
      "substance.potassium",
      "substance.coq10",
      "substance.nac",
      "substance.glycine",
      "substance.taurine",
      // ── La PONCTUATION de composition ──────────────────────────────────
      // `sentence.separator` est un tiret cadratin entouré d'espaces, et
      // `sentence.amount_of` ne porte plus que l'ORDRE des deux moitiés depuis
      // que la préposition est passée dans `food_group.of.*` (voir l'en-tête de
      // ce bloc dans `en.ts`). Ni l'un ni l'autre ne contient de mot.
      "sentence.separator",
      "sentence.amount_of",
      // ── Les mots communs aux deux langues ──────────────────────────────
      "photo.portion_label", // « Portion »
      "event.source.photo", // « Photo »
      "chat.photo.label",
      "chat.title", // le prénom du produit
      "chat.settings.toggle", // « Notifications »
      "part.actions", // « Actions »
      "part.observations", // « Observations »
      "activity.nutrition", // « Nutrition »
      "shell.nav.doctrine", // « Doctrine »
      "shell.nav.menu", // « Menu »

      // ══ LOT 4 · L'APP ÉLÈVE ══════════════════════════════════════════════
      // Trois points de suspension sur le bouton pendant l'enregistrement. Ce
      // n'est pas un mot, c'est un état — et les deux boutons qui le portent
      // (la grille des repas, la carte du rythme) le portent à l'identique.
      "meals.picker.saving",
      "meals.rhythm.saving",
      // « {n} kcal » — le symbole d'énergie, seul avec son nombre. Même raison
      // que les vingt-deux `unit.*` ci-dessus: une unité ne se traduit pas.
      // Les six autres phrases `meals.energy.*` qui le contiennent, elles,
      // diffèrent bien (« sur la journée », « dont {addon} ajoutées »…).
      "meals.energy.dish",
      // ⚠️ CETTE VALEUR N'EST QU'UN TROU. `today.slot_header` vaut « {slot} »
      // dans les deux langues: le mot rendu vient de `slot.*`, qui est traduit
      // depuis le lot 3. Y écrire quoi que ce soit d'autre ajouterait un mot
      // que l'en-tête de créneau ne demande pas.
      "today.slot_header",

      // ══ LOT 5 · L'ESPACE COACH ═══════════════════════════════════════════
      // Neuf clés sur 557, et chacune a sa raison. La preuve que le pack est
      // rédigé et non recopié est dans ce qui n'est PAS ici: « Sièges facturés
      // ce mois-ci », « À qui écrire », « Aliments recommandés », « Maille
      // d'échange », « Granularité » — les cinq cent quarante-huit autres
      // diffèrent toutes.
      //
      // « Visible » s'écrit à l'identique, et c'est le mot qui appartient à la
      // paire de la carte: son geste jumeau est `coach.meals.archive`
      // (« Masquer aux élèves »). « Affiché » casserait l'appariement.
      "coach.meals.status_active",
      // ⚠️ CES DEUX-LÀ SONT VIDES DES DEUX CÔTÉS, ET LE VIDE EST LA VALEUR.
      // L'axe `count` compte des aliments à l'unité: `frequencySentence`
      // (api/coachFoodItems.ts) écrase les espaces et rend « au plus 2 par
      // jour ». Y mettre un mot ajouterait une unité que la phrase ne demande
      // pas — même mécanique que `unit.one.none`. Elles sont donc AUSSI dans
      // `compositionFragments`, plus bas.
      "coach.food.freq.unit.count.one",
      "coach.food.freq.unit.count.many",
      // Symboles SI, comme les vingt-deux `unit.*` du lot 3.
      "coach.food.freq.unit.g",
      "coach.food.freq.unit.ml",
      // « interaction » est le même mot dans les deux langues, et c'est le mot
      // JUSTE ici: le registre compte des événements de base, pas des échanges
      // — « messages » ou « échanges » rendrait la colonne fausse.
      "coach.billing.interactions",
      "coach.billing.interaction_one",
      // « Substance » est le mot français exact, et le seed porte déjà un
      // namespace `substance.*` traduit sous ce nom.
      "editor.substance_ref",
      // « Description » est le mot français. Son voisin `editor.title`
      // (« Titre ») et `templates.field_title` (« Nom ») diffèrent bien, eux.
      "templates.field_description",
      // ⚠️ CETTE VALEUR N'EST PAS DE LA PROSE, C'EST UN FORMAT. Le champ « la
      // chose elle-même » d'un interdit attend un JETON ASCII snake_case, parce
      // que le verrou déterministe branche dessus (`_shared/keel/doctrine.ts`:
      // « `token` is ASCII snake_case (R1) because code branches on it »). Une
      // première rédaction l'avait traduit en `six_petits_repas` — ce qui
      // apprend au coach une forme que le moteur ne reconnaît pas. R1 impose
      // l'identité; `scripts/ci/token-lint.mjs` porte l'exception jumelle.
      "coach.doctrine.forbidden.token_placeholder",
      // « Doctrine » est le même mot, et il l'est DÉJÀ dans cette liste pour
      // l'onglet (`shell.nav.doctrine`). Le titre de la page porte le mot de
      // l'onglet, exprès: deux mots pour un écran, c'est un écran qu'on croit
      // avoir quitté.
      "coach.doctrine.title",

      // ══ LOT 6 · LES DEUX DERNIÈRES PAGES ÉLÈVE ════════════════════════════
      // Quatre clés sur 300, et la preuve que le pack est rédigé est dans ce
      // qui n'est PAS ici: « Serré », « Confortable », « Prendre du muscle »,
      // « Tour de taille », « ton poids monte » — les 296 autres diffèrent.
      //
      // « 30 minutes » s'écrit à l'identique. Ses deux voisines, elles, sont
      // bien traduites (« 15 minutes — j'entre et je sors », « Une heure, ça ne
      // me dérange pas »), ce qui montre que la table n'est pas recopiée.
      "plan.cooking.time_30",
      // Trois points de suspension sur un bouton pendant une écriture. Ce n'est
      // pas un mot, c'est un état — même raison que `meals.picker.saving` et
      // `meals.rhythm.saving` ci-dessus.
      "plan.busy",
    ]);
    const copied = (Object.keys(fr) as Array<keyof typeof fr>)
      .filter((key) => !legitimatelyIdentical.has(key))
      .filter((key) => fr[key].trim() === en[key].trim());
    expect(copied).toEqual([]);
  });

  it("n'a ni valeur vide ni espace de bord", () => {
    // ⚠️ SEPT CLÉS ÉCHAPPENT À CETTE RÈGLE, ET LEUR ESPACE — OU LEUR VIDE — EST
    // LA VALEUR. Ce sont les fragments que `api/labels.ts` COMPOSE:
    //
    //   · `sentence.separator` (" — ") est collé par `clauses.join()`; rogné,
    //     il souderait « Tous les jours—2 portions ».
    //   · `sentence.tracked_suffix` (" · suivi, pas noté") est concaténé à la
    //     phrase finie; rogné, il donnerait « …légumes· suivi, pas noté ».
    //   · les cinq unités SANS MOT (`hhmm`, `none`) sont vides parce que
    //     `quantity()` teste exactement `word === ""` pour n'imprimer que le
    //     nombre. Une chaîne non vide y ajouterait un mot.
    //
    // Le seed anglais porte les mêmes bords aux mêmes clés: l'exception dit que
    // la traduction a COPIÉ une forme, pas qu'elle a oublié un mot.
    const compositionFragments = new Set<string>([
      "sentence.separator",
      "sentence.tracked_suffix",
      "unit.one.hhmm",
      "unit.many.hhmm",
      "unit.one.none",
      "unit.many.none",
      "unit.none",
      // Lot 5 · même mécanique, chez le coach: l'axe `count` de la fréquence
      // d'un aliment n'a PAS de mot d'unité. `frequencySentence`
      // (api/coachFoodItems.ts) écrase les espaces, et « au plus 2 par jour »
      // est la phrase voulue. Les deux formes sont vides dans les deux langues.
      "coach.food.freq.unit.count.one",
      "coach.food.freq.unit.count.many",
      // Lot 6 · deux fragments de composition de `/app/plan`.
      //
      // `plan.trend.and` (" and " / " et ") est collé par `observed.join()`
      // dans `api/bodyMeasures.ts`; rogné, il souderait « ton poidsmonteet ton
      // tour de taille ».
      //
      // `plan.told.summary_pending` (" · {count} en attente") est concaténé à
      // la ligne repliée de la carte des préférences; rogné, il donnerait
      // « 3 choses que tu m'as dites· 2 en attente ».
      "plan.trend.and",
      "plan.told.summary_pending",
    ]);
    const bad = (Object.keys(fr) as Array<keyof typeof fr>)
      .filter((key) => !compositionFragments.has(key))
      .filter((key) => fr[key] !== fr[key].trim() || fr[key] === "");
    expect(bad).toEqual([]);

    // La ceinture de l'exception: chaque clé dispensée doit porter EXACTEMENT
    // la même forme de bord que l'anglais. Sans ça, la liste ci-dessus
    // deviendrait un permis de laisser traîner un espace.
    const drifted = [...compositionFragments]
      .filter((key) => fr[key as keyof typeof fr] !== undefined)
      .filter((key) => {
        const f = fr[key as keyof typeof fr];
        const e = en[key as keyof typeof en];
        return (f === "") !== (e === "") ||
          (f !== f.trimStart()) !== (e !== e.trimStart()) ||
          (f !== f.trimEnd()) !== (e !== e.trimEnd());
      });
    expect(drifted).toEqual([]);
  });

  it("la frontière déclarée est cohérente: aucun namespace des deux côtés", () => {
    // `TRANSLATED_NAMESPACES` est la promesse « traduit »; la liste d'attente est la
    // promesse « pas encore ». Un namespace dans les deux serait une frontière
    // qui ment, et c'est exactement ce qu'on refuse de livrer.
    const overlap = PENDING_TRANSLATION_NAMESPACES
      .filter((ns) => (TRANSLATED_NAMESPACES as readonly string[]).includes(ns));
    expect(overlap).toEqual([]);
  });

  it("chaque namespace en attente existe VRAIMENT dans le seed", () => {
    // Sans ça, la liste d'attente vieillit: un namespace renommé ou supprimé y
    // resterait comme une dette qu'on croit avoir, et personne ne le saurait.
    const missing = PENDING_TRANSLATION_NAMESPACES.filter((ns) =>
      !Object.keys(en).some((key) => key.startsWith(`${ns}.`))
    );
    expect(missing).toEqual([]);
  });
});
