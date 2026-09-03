// KEEL — les langues d'INTERFACE, et l'étendue exacte de chacune.
//
// ── CE QUI EST TRADUIT, ET CE QUI NE L'EST PAS ─────────────────────────────
// La VITRINE parle deux langues, le COULOIR D'ENTRÉE aussi depuis le lot 2
// (`/join`, `/join-household`, `/app/setup`), depuis le lot 5 CINQ des neuf
// écrans de l'ESPACE COACH (`/coach`, `/coach/meals`, `/coach/templates`,
// `/coach/billing`, `/coach/clients/:id`), et depuis le lot 6 LES SEPT ÉCRANS
// DE L'APP ÉLÈVE — `/app/today`, `/app/chat`, `/app/health`, `/app/household`
// (lot 4), plus `/app/plan` et `/app/progress`; le septième, `/app/meals`, a
// été RETIRÉ le 2026-09-03 (P4) et n'a plus d'entrée dans cette table.
//
// ⚠️ CES DEUX DERNIÈRES ONT COÛTÉ TROIS `COPY` LOCAUX ET UN LOT DE FORMATAGE,
// pas de la traduction. `MealBuilder` (44 entrées, sous des noms de clés qui
// ANTICIPAIENT le seed), `CookingCapacityCard` (28) et `FoodPreferencesCard`
// (22) réimplémentaient `t()` hors du catalogue, donc ni la garde de `t()` ni
// le scanner de coutures ne les voyaient. Et `/app/progress` rendait TOUTES les
// colonnes de sa grille de rythme par `toLocaleDateString("en-GB")`: la
// déclarer sans `i18n/format.ts` aurait donné une page française dont chaque
// en-tête dit « Mon Tue Wed ».
//
// ⚠️ LE FORMATAGE EST UNE AUTORITÉ À PART, ET IL LE FALLAIT: vingt-six sites
// décidaient chacun de leur locale et se contredisaient (onze `en-GB`, dix sans
// argument donc `navigator.language`, quatre `fr-FR`, un `en-US` — dont deux
// sur le MÊME écran). Tout passe par `i18n/format.ts`, et
// `scripts/ci/i18n-lint.mjs` a une règle qui couvre aussi les appels SANS
// argument, qui étaient le défaut le plus silencieux.
//
// ⚠️ ET QUATRE ÉCRANS COACH DONT LA CAUSE N'EST PAS DU TOUT LA MÊME, ce qu'il
// faut lire avant de croire à un lot inachevé: `/coach/doctrine`,
// `/coach/protocol`, `/coach/weekly` et `/coach/import` ont leurs namespaces
// traduits DES DEUX CÔTÉS — le pack français de l'espace coach est écrit en
// entier. Ce qui les retient est que leur CORPS est écrit en anglais AILLEURS
// QUE DANS LE SEED: par une fonction edge (la synthèse du lundi, l'extraction
// d'un plan), par un module Deno partagé (les débats de doctrine et de
// composition) ou par une migration (le catalogue d'aliments). Les déclarer
// rendrait une coquille française autour du seul texte qui compte sur chacun
// de ces écrans. Le détail, et la réparation exacte, sont sur leur ligne.
//
// ⚠️ LE LOT 3 A TRADUIT DES NAMESPACES SANS TRADUIRE UNE SEULE PAGE DE PLUS, ET
// CE N'EST PAS UNE DEMI-MESURE. Les ATOMES (`unit`, `when`, `food_group`,
// `slot`, `day`, `substance`…) sont lus DYNAMIQUEMENT par `api/labels.ts`
// depuis un jeton venu de la base: ils n'appartiennent à aucun écran, et tant
// qu'ils étaient anglais AUCUNE page de plan ne pouvait basculer. La COQUILLE
// (`shell`, `chat`) a le défaut symétrique: elle est sur toutes les pages
// d'app à la fois. Les deux sont donc le socle, pas une page — les pages qui
// s'appuient dessus viennent aux lots 4 (élève) et 5 (coach).
//
// Ce n'est pas un compromis honteux, c'est une frontière qu'on déclare au lieu
// de la subir. L'alternative tentante — un `fr` partiel avec repli anglais —
// produit un écran français avec une phrase anglaise au milieu, découvert par
// un client et non par un test. R7 est explicite là-dessus: un mapping de jeton
// échoue bruyamment, il ne dégrade pas en silence.
//
// D'où la forme ci-dessous: le sous-ensemble traduit est dérivé DU TYPE, et le
// pack français est COMPLET sur ce sous-ensemble. TypeScript refuse une clé
// manquante; il ne peut donc pas exister d'écran à moitié traduit. Quand une
// page quitte le périmètre ou y entre, on déplace son namespace ici et le
// compilateur dit exactement ce qui manque.
//
// ── POURQUOI LES NOMS NE DISENT PLUS « PUBLIC » ────────────────────────────
// Ils l'ont dit tant que le périmètre s'arrêtait à la vitrine. `setup` et
// `household` sont maintenant dedans, et ce ne sont pas des surfaces publiques:
// garder `PUBLIC_*` aurait fait mentir chaque site d'appel, à commencer par la
// garde de `t()` qui décide de LEVER sur la foi de ce mot.

import { matchPath } from "react-router-dom";

import { en } from "./en";
import type { MessageKey } from "./t";

/** Les langues d'interface livrées. Ajouter une langue = ajouter son pack. */
export type UiLocale = "en" | "fr";

export const DEFAULT_UI_LOCALE: UiLocale = "en";

/**
 * Les namespaces dont le pack français est ÉCRIT.
 *
 * `legal` n'y est PAS: `Legal.tsx` ne passe par aucun `t()` aujourd'hui (zéro
 * clé dans le seed), c'est une extraction à part. Sa version française
 * d'origine est récupérable dans git (commit `0328448a`), donc ce sera de la
 * récupération et non de la traduction — mais pas ici.
 */
export const TRANSLATED_NAMESPACES = [
  // Les deux HALLS de la refonte du 2026-08-12: `/` accueille le foyer,
  // `/pro` accueille les professionnels.
  "home",
  "pro",
  // Les six PAGES DE VENTE, une par acheteur. Un namespace par page et JAMAIS
  // de clé partagée — voir l'en-tête du bloc dans `en.ts`.
  "mealprep",
  "couples",
  "families",
  "coaches",
  "gyms",
  "communities",
  // ⚠️ `offer` EST LA SEULE EXCEPTION À « UN NAMESPACE PAR PAGE », ET C'EST UN
  // RENVERSEMENT DATÉ (2026-09-01). La règle d'origine interdit la clé
  // partagée même quand le texte est identique, pour qu'un ajustement de TON
  // fait sur une page n'aille pas s'imposer aux deux autres. Elle était juste,
  // et elle reste en vigueur pour tout le reste.
  //
  // Ce qu'elle n'a pas tenu, c'est l'autre moitié de sa propre promesse: « les
  // FAITS doivent bouger ensemble ». Mesuré sur les quatre pages du foyer:
  // `/` et `/couples` vendaient l'accès d'une autre personne 2 €, `/families`
  // le vendait 1,99 € sous un AUTRE NOM (« accompagnement »), `/meal-prep` ne
  // le vendait pas; et « premier mois offert » n'existait que sur `/families`
  // — puis disparaissait sur `/start`, c'est-à-dire au moment de décider.
  // Quatre pages, quatre offres, à un clic l'une de l'autre.
  //
  // Une offre commerciale n'est pas du ton: c'est un FAIT, et un fait se tient
  // par une source unique, comme `prices.ts` tient déjà les montants. D'où ce
  // namespace, rendu par `ui/Marketing.tsx` (`OfferLines`) sur les quatre
  // pages de vente du foyer ET sur `/start`.
  // ⛔ RIEN D'AUTRE N'ENTRE ICI. Un argument qui ne vaut que sur une page
  // retourne chez elle: c'est par là que la règle d'origine se ferait ronger.
  "offer",
  "public",
  "brand",
  "auth",
  // Traduit le 2026-08-12. `/start` s'affichait jusque-là avec un chrome
  // français autour d'un corps anglais — voir la note d'en-tête de
  // `PENDING_TRANSLATION_NAMESPACES` sur ce que « en attente » veut
  // vraiment dire pour la page qui le porte.
  "start",
  // ⚠️ L'ÉCRAN « on ne joint pas le serveur » ÉTAIT UNE COUTURE MESURÉE, pas
  // une omission de confort. `StartPage.tsx:505` rend `<ServerUnreachable />`
  // en plein milieu d'une page DÉCLARÉE traduite: un visiteur français dont le
  // backend ne répond pas lisait trois phrases anglaises là où tout le reste
  // du site lui parlait français — et en DEV, `t()` levait. Quatre clés.
  "server_unreachable",

  // ══ LE COULOIR D'ENTRÉE (lot 2) ═════════════════════════════════════════
  // Une personne s'inscrit, traverse les portes ci-dessous et arrive sur son
  // plan sans voir un mot d'anglais. Les cinq namespaces vont ensemble parce
  // que les pages qui les portent se suivent.
  //
  // `/join` — l'invitation d'un coach.
  "join",
  "invite",
  // `/join-household` — la réclamation d'une place dans un foyer.
  "household_claim",
  // `/app/setup` — le tunnel d'onboarding.
  "setup",
  // Les treize allergènes proposés. Namespace à part et pas `setup.*`: la même
  // liste est rendue par `/app/health` et par la carte de contraintes du coach,
  // donc la ranger sous le tunnel aurait déclaré une dette au nom d'un écran
  // qui ne la porte pas.
  "allergen",
  // ⚠️ `household` ENTRE PAR UN EMPRUNT DE CINQ CLÉS, PAS PAR SA PAGE.
  // `SetupPage.tsx` appelle `household.invite.error.bad_email`,
  // `household.invite.link_ready`, `household.me.unlock`,
  // `household.member.birth_date_kept` et `household.member.save`. La
  // frontière étant à la maille du NAMESPACE, l'onboarding tire les 178 clés
  // avec lui. C'est cohérent avec le parcours (`/join-household` mène à
  // `/app/household` puis à `/app/setup`), mais ça ne suffit PAS à rendre
  // `/app/household` française — voir sa ligne dans `PAGE_NAMESPACES`.
  "household",
  // Les refus nommés des deux fonctions edge de composition
  // (`copy/planRefusals.ts`). `/app/setup` les affiche dès que la génération
  // échoue, donc ils sont dans le couloir même si `plan.*` sert surtout
  // ailleurs.
  "plan",
  // ⚠️ `meals` ENTRE PAR LA GRILLE DE PRÉSENCE, ET C'EST UN EMPRUNT ASSUMÉ.
  // L'étape 4 monte `MealPickerGrid` — le MÊME tableau que `/app/plan` et
  // `/app/household`, jour × moment, par bouche. Une seconde grille sous des
  // clés `setup.*` aurait été la vraie faute: elle écrit `away_days` en
  // reprenant les jours HORS fenêtre, et deux implémentations de cette règle-là
  // finissent par en effacer la moitié.
  "meals",
  // ⚠️ `app` EST DANS LE COULOIR PAR SA GARDE DE ROUTE, PAS PAR SON CONTENU.
  // `/app/setup` est monté dans `<KeelHouseholdRoute>` (App.tsx:255), qui rend
  // `t("app.guard.checking")` pendant qu'il résout l'accès — c'est-à-dire la
  // TOUTE PREMIÈRE chose qu'on voit du tunnel. Sans cette ligne, `t()` lève en
  // DEV au premier rendu et l'écran d'entrée tombe pour tout francophone.
  // Treize clés, dont huit libellés d'onglets que `KeelAppShell` rendra le jour
  // où `shell` et `chat` suivront.
  "app",

  // ══ LES ATOMES PARTAGÉS (lot 3) ═════════════════════════════════════════
  // ⚠️ CEUX-CI NE SE RANGENT SOUS AUCUNE PAGE, ET C'EST TOUT LE PROBLÈME QU'ILS
  // POSAIENT. `api/labels.ts` les lit DYNAMIQUEMENT — `labelIn(namespace,
  // token)` où le jeton vient de la base —, donc aucun scan statique ne peut
  // dire quel écran affiche `unit.many.serving` ou `day.long.sat`. Le scanner
  // de `pageSeams.int.test.ts` ne voit littéralement pas ces clés: il cherche
  // des littéraux du seed, et `"unit.one"` n'en est pas un.
  //
  // Conséquence: ils sont atteignables depuis N'IMPORTE QUEL écran de plan, et
  // il n'existe aucune page qu'on puisse traduire sans eux. Ils entrent donc
  // ENSEMBLE, avant toute page d'app — c'est le lot bloquant.
  //
  // R1 tient tel quel: seules les VALEURS sont traduites. `unit.one.gram`,
  // `day.long.mon`, `food_group.eggs` restent des jetons ASCII snake_case
  // anglais, et `scripts/ci/token-lint.mjs` a une règle dessus.
  "unit",
  "when",
  "substance",
  "food_group",
  "photo",
  "deviation",
  "part",
  "day",
  "question",
  "slot",
  "activity",
  "event",
  "amount",
  "status",
  "common",
  "timing",
  "food_section",
  "sentence",
  "priority",
  "autonomy",
  "safety",

  // ══ LA COQUILLE DE L'APP CONNECTÉE (lot 3) ══════════════════════════════
  // `KeelAppShell` entoure CHAQUE écran d'élève et de coach. Sans ces deux-là,
  // aucune page d'app ne peut se rendre en français: la barre de navigation et
  // le compteur de non-lus sortiraient en anglais autour d'un corps traduit.
  //
  // ⚠️ `chat` ENTRE PAR LA COQUILLE, PAS SEULEMENT PAR SA PAGE. `KeelAppShell`
  // emprunte `chat.title` (le titre de la notification système) et
  // `chat.unread.aria` (le libellé accessible de la pastille): la frontière
  // étant à la maille du namespace, la coquille tire les 38 clés de la bulle
  // avec elle. C'est cohérent — la pastille et la bulle disent la même chose.
  "shell",
  "chat",

  // ══ L'APP ÉLÈVE (lot 4) ═════════════════════════════════════════════════
  // ⚠️ `meals` N'EST PAS « L'ÉCRAN /app/meals » — cet écran n'existe d'ailleurs
  // plus (retiré le 2026-09-03, P4), et le namespace lui survit ENTIER. C'est
  // le vocabulaire du MOTEUR DE REPAS — grille, sessions de cuisine, rayons,
  // énergie, cases —, et il vivait dans un `COPY` local d'`api/mealLabels.ts`.
  // Quatre écrans le montent (`/app/health` par la coquille, `/app/household`,
  // `/app/plan`, `/app/today`), donc aucun d'eux ne pouvait basculer tant
  // qu'il restait hors du seed. C'est le blocage n°1 que le lot 3 avait nommé.
  "meals",
  // `/app/health` — ce que l'élève ne peut pas manger. Son `COPY` local avait
  // déjà la forme de `t()`; la conversion n'a rien changé au rendu.
  "health",
  // `/app/today` — la journée. ⚠️ ELLE N'A PAS EU BESOIN DE `review`, ET C'EST
  // UN DÉPLACEMENT DE CODE QUI L'A PERMIS: `gapQuestion` vivait dans
  // `api/labels.ts` (le module de mots PARTAGÉ élève/coach) et rendait
  // `review.gap_question*`. L'écran du jour ATTEIGNAIT donc les 44 clés de
  // l'import du coach par un chemin qu'il n'emprunte jamais à l'exécution. La
  // fonction est maintenant dans `api/gapQuestion.ts`, lue par son unique
  // appelant — voir l'en-tête de ce fichier pour pourquoi elle est anglaise par
  // construction.
  "today",

  // ══ L'ESPACE COACH (lot 5) ══════════════════════════════════════════════
  // ⚠️ `coach` NE SE DÉCOUPE PAS PAR ÉCRAN, ET C'EST LA MAILLE QUI L'IMPOSE.
  // Les 294 clés d'origine servent NEUF surfaces (`/coach`, `/coach/doctrine`,
  // `/coach/protocol`, `/coach/meals`, `/coach/weekly`, `/coach/billing`,
  // `/coach/clients/:id`, la garde de route, la fenêtre d'invitation), plus les
  // clés neuves que le lot a rapatriées de trois catalogues parallèles
  // (`CoachBillingPage.COPY` 39, `copy/flagReasons.ts` 8, les phrases en dur de
  // `CoachWeeklyPage`). La frontière étant à la maille du NAMESPACE, aucune de
  // ces pages ne pouvait basculer sans toutes les autres.
  "coach",
  // Les quatre namespaces de l'atelier: l'import d'un plan, sa relecture,
  // l'éditeur d'engagement et la bibliothèque de modèles. Ils vont ENSEMBLE:
  // `/coach/templates` et `/coach/import` montent les quatre à eux deux, et
  // `CommitmentEditor` est partagé.
  "import",
  "review",
  "editor",
  "templates",
  // La semaine partagée (`components/WeekView.tsx`), lue par le coach sur
  // l'espace d'un élève. ⚠️ CE NAMESPACE A GAGNÉ QUATRE CLÉS AU LOT 5 et c'est
  // ce qui l'a rendu traduisible: `WeekView` empruntait
  // `progress.adherence_overall`, `progress.adherence_core`,
  // `progress.day_value` et `progress.days_value` au namespace de l'écran de
  // progression de l'élève. La maille étant le namespace, `/coach/clients/:id`
  // ATTEIGNAIT donc les 36 clés de `progress.*` — dont 29 servaient
  // `pages/ProgressPage.tsx`, que plus aucun fichier du dépôt n'importait
  // (`StudentProgressPage` est la vivante). Les quatre sont maintenant chez
  // elles, sous le nom du composant qui les rend.
  // ⟳ chantier-0903/SUIVI (A7, D7.12) — les 36 et la page sont parties le
  // 2026-09-03. `progress.*` n'existe plus dans aucun pack.
  "week",

  // ══ LES DEUX DERNIÈRES PAGES ÉLÈVE (lot 6) ══════════════════════════════
  // ⚠️ `student_progress` ET PAS `progress`, ET LE NOM EST LE POINT. `progress.*`
  // existait: 36 clés orphelines qui servaient `pages/ProgressPage.tsx`, que
  // plus aucun fichier n'importait. Le prendre aurait obligé à traduire les 36
  // mortes avec les vivantes — de la traduction payée pour un écran supprimé,
  // au motif qu'il occupe le joli nom. Le namespace porte donc le nom du
  // composant VIVANT, comme `week.*` au lot 5.
  // ⟳ chantier-0903/SUIVI (A7, D7.12) — les 36 sont parties avec la page le
  // 2026-09-03. Le namespace garde son nom quand même: le renommer aujourd'hui
  // rebaptiserait 90 clés vivantes et tous leurs appelants, pour un mot.
  "student_progress",
  // ⟳ chantier-0903/SUIVI (A7) — le SUIVI proprement dit: le bloc permanent,
  // le bloc objectif jour par jour, la courbe de poids. Il entre TRADUIT parce
  // qu'il porte les six phrases qui écrivent un kcal, et qu'une phrase
  // d'énergie à moitié traduite est exactement le défaut que
  // `energyBasis.int.test.ts` éprouve dans les DEUX langues: une base dite en
  // anglais sous un chiffre français ne se lit pas, donc ne protège personne.
  "tracking",
  // Les cinq bandes horaires d'un fait alimentaire (`lib/mealRhythm.ts`). Un
  // ATOME, comme `slot.*` qu'il ne remplace pas: un créneau est DÉCLARÉ par un
  // plan, un moment est DÉDUIT de `occurred_at`. Deux vocabulaires, deux
  // origines, et la grille de rythme rend le second.
  "moment",

  // ══ « CE QUE SOPHIA SAIT DE TOI » (lot 1D) ══════════════════════════════
  // ⚠️ IL ENTRE TRADUIT, ET CE N'EST PAS DU CONFORT. Cet écran est la surface
  // de TRANSPARENCE: il dit à la personne ce que le produit retient d'elle, et
  // lui laisse le corriger. Le livrer en anglais au milieu d'une app française
  // ferait exactement la couture de `/start` du 2026-08-12 — sur l'écran où
  // elle compte le plus, puisque c'est celui qu'on ouvre quand on se demande
  // « qu'est-ce qu'il sait de moi ? ».
  //
  // ⚠️ NAMESPACE À LUI, ET PAS `plan.*`. Les 22 clés de `FoodPreferencesCard`
  // vivent sous `plan.told.*` parce que la carte est montée sur `/app/plan`.
  // Ranger cet écran-ci sous le même préfixe referait la fausse piste que le
  // lot 6 a payée en renommant `household.envy.*` en `plan.envy.*`: une clé
  // dont le nom désigne un écran qui ne l'affiche pas.
  "known",
] as const;

// ⚠️ `landing` A DISPARU DE CETTE LISTE, ET CE N'EST PAS UN OUBLI.
// Il portait la copie de `/` quand `/` vendait au coach. Depuis la refonte, `/`
// vend au foyer et la page coach vit sous `/coaches`, avec un namespace
// réécrit. Ses 117 clés ont été retirées de `en.ts` ET de `fr.ts` dans
// le même geste: garder le namespace ici aurait gardé de la traduction payée
// pour un écran qui n'existe plus, et `parity.int.test.ts` refuse l'orpheline.

/**
 * Les namespaces qu'on a PROMIS de traduire et dont le pack n'est pas écrit.
 *
 * ⚠️ CE COMMENTAIRE A MENTI PENDANT DES MOIS, ET IL FAUT LE LIRE AVANT
 * D'AJOUTER UN NAMESPACE ICI. Il affirmait que `/gyms` et `/communities`
 * « restent en anglais quand la vitrine est en français », et que c'était
 * « une frontière VISIBLE et déclarée, pas un repli silencieux au milieu d'une
 * page ».
 *
 * C'était faux, et mesuré le 2026-08-12 sur `/start`: le CHROME de ces pages
 * (`public.*`, `brand.*`) est traduit, lui, puisqu'il est dans la liste
 * ci-dessus. Une page en attente rendait donc un en-tête et un pied de page
 * français autour d'un corps anglais — la couture n'était pas au bord de la
 * page, elle était au milieu. Aucun clic n'était nécessaire pour l'atteindre:
 * `initUiLocale` résout depuis `navigator.languages`.
 *
 * Depuis, la frontière est VRAIE et elle est portée par du code, pas par cette
 * phrase: `uiLocaleForPath` (runtime.ts) rend une page entièrement anglaise
 * dès qu'un seul de ses namespaces n'est pas traduit, chrome compris.
 *
 * ── CETTE LISTE N'EST PLUS CE QUI ARME LA GARDE ────────────────────────────
 * Elle l'a été, et c'était un trou: un namespace ni traduit ni « en attente »
 * (parce que personne n'avait pensé à l'inscrire) laissait sa page se rendre
 * en français. La garde lit maintenant la liste TRADUITE — la seule dont
 * l'absence d'une entrée est du côté sûr. Ce qui reste ici est la DETTE
 * DÉCLARÉE: ce qu'on sait devoir, et qu'un test relie à la page qui l'affiche.
 */
export const PENDING_TRANSLATION_NAMESPACES = [
  // ⚠️ ELLE EST VIDE, ET CE N'EST PAS « TOUT EST TRADUIT ». C'est la
  // conséquence du contrat de cette liste, qu'il faut lire avant d'y remettre
  // quoi que ce soit: `pageFrontier.int.test.ts` exige que chaque namespace
  // inscrit ici soit porté par une page DÉCLARÉE dans `PAGE_NAMESPACES`. Sans
  // cette règle, une dette pouvait être « déclarée » sans qu'aucun écran ne
  // soit forcé en anglais — c'est-à-dire sans effet.
  //
  // Après le lot 5, il ne reste que DEUX namespaces non écrits, et ni l'un ni
  // l'autre n'est une dette qu'on peut inscrire ici: `attack` et `progress`
  // sont ORPHELINS.
  //
  // ⚠️ `attack` (65 clés): plus aucun fichier du dépôt ne le lit depuis la
  // suppression de `CardsPage` (migration 20260808070000). Vérifié au lot 5 par
  // un scan de tout `frontend/src` — zéro appelant.
  //
  // ⟳ `progress` N'EXISTE PLUS (chantier-0903/SUIVI, A7, D7.12, 2026-09-03).
  // Ses 36 clés servaient `pages/ProgressPage.tsx`, que plus aucun fichier
  // n'importait (`StudentProgressPage` est la vivante); les quatre empruntées
  // par `components/WeekView.tsx` avaient été rapatriées sous `week.*` au lot
  // 5. La page et les 36 clés sont parties ensemble. Il ne reste donc qu'UN
  // namespace orphelin non écrit, `attack`.
  //
  // Les traduire serait du travail payé pour des écrans qui n'existent plus.
  // Les inscrire ici ferait rougir `pageFrontier.int.test.ts`, qui exige que
  // toute dette déclarée soit portée par une page de la table — et aucune page
  // ne les porte, précisément parce qu'ils sont morts.
] as const;

export type TranslatedNamespace = typeof TRANSLATED_NAMESPACES[number];

const TRANSLATED_NAMESPACE_SET: ReadonlySet<string> = new Set(
  TRANSLATED_NAMESPACES,
);

/** Le pack français de ce namespace est-il écrit ? */
export function isTranslatedNamespace(namespace: string): boolean {
  return TRANSLATED_NAMESPACE_SET.has(namespace);
}

/** Un namespace dont la traduction est due mais pas écrite. */
export function isPendingTranslationNamespace(namespace: string): boolean {
  return (PENDING_TRANSLATION_NAMESPACES as readonly string[])
    .includes(namespace);
}

/**
 * CHAQUE PAGE DÉCLARÉE, ET LES NAMESPACES QUI ÉCRIVENT SON CORPS.
 *
 * ── CE QUE CETTE TABLE REND POSSIBLE ───────────────────────────────────────
 * Sans elle, « traduit » est une propriété d'un namespace, et personne ne sait
 * quelle PAGE la porte. C'est exactement comme ça que la couture est née:
 * `start` n'était pas traduit, `public` l'était, et la page qui les affiche
 * tous les deux n'avait aucun moyen de le savoir. Avec elle, `uiLocaleForPath`
 * répond à la seule question qui compte — « cette page peut-elle se lire
 * entièrement en français ? » — et rend l'anglais pour toute la page sinon,
 * chrome compris.
 *
 * ── POURQUOI DES CHEMINS, ET PAS UNE PROP SUR CHAQUE PAGE ─────────────────
 * Une prop `namespace` sur `PublicHeader` marcherait, et rouillerait: la page
 * suivante l'oublierait, silencieusement, et personne ne verrait la couture
 * revenir. Une table lue depuis `location.pathname` ne s'oublie pas — au pire
 * elle est incomplète, et l'incomplétude est ce qu'un test sait vérifier.
 *
 * ── LES CLÉS SONT DES MOTIFS DE ROUTE, PAS DES CHAÎNES ────────────────────
 * Elles l'étaient (comparaison exacte) tant que le périmètre s'arrêtait à la
 * vitrine, dont chaque page a un chemin fixe. L'app est PARAMÉTRÉE
 * (`/coach/clients/:id`), donc la résolution passe par `matchPath` de
 * react-router — le même moteur que les `<Route>` de `App.tsx`, ce qui est la
 * seule façon d'être sûr que la table et le routeur parlent du même écran.
 * `matchPath` gère aussi le slash final: `/join/` est `/join`.
 *
 * ⚠️ `matchPath("/join", "/join-household")` rend `null`, vérifié. Un préfixe
 * ne capture pas: ce sont deux pages avec deux namespaces.
 *
 * ── CE QUI N'EST PAS ICI, ET POURQUOI ──────────────────────────────────────
 * Tout le reste de l'app connectée (`/app/today`, `/app/chat`, `/app/plan`,
 * `/coach/*`, `/account`, `/reset-password`, les trois écrans admin). Un
 * chemin absent de cette table se rend en ANGLAIS, ce qui est la vérité: rien
 * n'y est traduit, et la moitié de ces écrans porte encore ses phrases en dur.
 */
export const PAGE_NAMESPACES: Readonly<
  Record<string, readonly string[]>
> = {
  // ── LE MONDE DU FOYER ────────────────────────────────────────────────────
  // `server_unreachable` sur les DEUX halls et sur `/start`: les trois rendent
  // `<ServerUnreachable />` en plein milieu de la page quand le backend ne
  // répond pas à un visiteur déjà connecté (`HomePage.tsx:172`,
  // `ProPage.tsx:162`, `StartPage.tsx:505`). Trois pages déclarées traduites
  // qui basculaient sur trois phrases anglaises — et en DEV, sur un throw.
  // ⚠️ `offer` SUR LES CINQ SURFACES DU FOYER, ET SUR ELLES SEULES. C'est le
  // bloc de tarif partagé (`ui/Marketing.tsx` → `OfferLines`); il n'a rien à
  // faire sur les quatre pages professionnelles, qui vendent un SIÈGE et pas
  // un foyer. La déclarer route par route plutôt que de la verser au CHROME
  // de `pageSeams.int.test.ts` est délibéré: le chrome est ce que TOUTE page
  // porte, et une sixième page de vente qui voudrait ce bloc devra le dire
  // ici — donc quelqu'un le lira.
  "/": ["home", "offer", "server_unreachable"],
  "/meal-prep": ["mealprep", "offer"],
  "/couples": ["couples", "offer"],
  "/families": ["families", "offer"],
  // ── LE MONDE DES PROFESSIONNELS ──────────────────────────────────────────
  "/pro": ["pro", "server_unreachable"],
  "/coaches": ["coaches"],
  "/gyms": ["gyms"],
  "/communities": ["communities"],
  // ── LES PORTES FONCTIONNELLES ────────────────────────────────────────────
  // La porte UNIQUE du produit: connexion de tout le monde, réinitialisation
  // du mot de passe, confirmation d'e-mail, et inscription coach sous
  // `?role=coach`. `server_unreachable` parce que `Auth.tsx` affiche l'écran
  // « backend injoignable » sans quitter la page.
  "/auth": ["auth"],
  // Le retour du lien de confirmation d'e-mail, et donc un écran du chemin
  // heureux coach (`emailRedirectTo` d'`Auth.tsx`). Il portait cinq phrases en
  // dur et pas un seul `t()`: déclarer la page sans les extraire n'aurait rien
  // traduit du tout, les deux gestes vont ensemble.
  "/email-verified": ["auth"],
  // `auth` n'est pas là par erreur: le sélecteur de PAYS de l'inscription lit
  // `api/countries.ts`, qui pointe sur les dix-huit clés `auth.country.*`. La
  // page rendait « United States / Germany » au milieu d'un formulaire
  // français, sur le champ dont dépend le numéro d'urgence servi à la personne.
  // `offer`: la couture la plus chère du lot du 2026-09-01 passait ICI — le
  // lecteur arrivait de `/families` avec « premier mois offert » en tête et
  // trouvait un prix nu au-dessous du bouton d'envoi. La page de décision
  // porte désormais le MÊME bloc que la page qui l'a amené.
  "/start": ["start", "offer", "auth", "server_unreachable"],
  // Deux namespaces sur une seule page, et c'est le cas qui justifie le
  // tableau plutôt qu'un namespace unique: `/join` affiche le texte de
  // l'invitation (`invite.*`) au-dessus de celui de la page (`join.*`).
  // Une page se lit dans la langue du visiteur seulement si TOUS ses
  // namespaces sont traduits — un seul manquant, et la couture revient.
  "/join": ["join", "invite"],
  // `household` et `start` ne sont PAS du décor: `api/householdPlanTrace.ts`
  // rend `household.plan.*` sous la proposition de plan, et `api/freeSignup.ts`
  // rend `start.error.*` quand la création de compte échoue. Aucun scan
  // statique du JSX ne les aurait trouvés — ils viennent de deux modules d'API.
  "/join-household": ["household_claim", "household", "start", "auth"],
  // ⚠️ `/legal` EST ABSENTE, ET C'EST UN CHOIX QU'IL FAUT LIRE AVANT DE
  // L'AJOUTER. La déclarer avec `[]` marchait — « tous ses namespaces sont
  // traduits » est vrai sur l'ensemble vide — et rendait son chrome en
  // français. Mais son CORPS est mille lignes d'anglais EN DUR, hors de tout
  // `t()`: la déclaration aurait donc promis une page entièrement française
  // autour d'un texte juridique anglais, c'est-à-dire précisément la couture
  // de `/start`, en pire — sur un écran dont la valeur est d'être lisible.
  //
  // Vérifié à l'écran le 2026-08-13: en-tête et pied de page français,
  // « Legal notice & terms / Who publishes sophia-coach.ai… » en dessous.
  // Non déclarée, la page est entièrement anglaise, ce qui est la vérité.
  // Sa version française d'origine est récupérable dans git (`0328448a`);
  // l'extraction faite, la ligne revient ici avec son namespace.
  // ── LE COULOIR D'ENTRÉE, CÔTÉ CONNECTÉ ───────────────────────────────────
  // Le tunnel d'onboarding. Il ne monte PAS `KeelAppShell` (vérifié: son
  // graphe d'imports ne le contient pas), donc son chrome est celui de la
  // vitrine et il n'hérite d'aucun namespace du shell. C'est ce qui rend sa
  // traduction atteignable dans ce lot.
  // ⚠️ `meals` ENTRE PAR LA GRILLE DE PRÉSENCE DE L'ÉTAPE 4. Elle monte
  // `MealPickerGrid` — le MÊME tableau que `/app/plan` et `/app/household`,
  // jour × moment, par bouche. Une seconde grille sous des clés `setup.*`
  // aurait été la vraie faute: elle écrit `away_days` en reprenant les jours
  // HORS fenêtre, et deux implémentations de cette règle-là finissent par en
  // effacer la moitié.
  // ⚠️ `common` ENTRE PAR LE BOUTON DE FERMETURE DE `Modal`, PAS PAR LA PAGE.
  // Son `closeLabel` avait pour défaut le littéral `"Close"`; il vaut désormais
  // `common.close`, donc toute page qui monte une fenêtre sans nommer sa sortie
  // atteint ce namespace. Ici c'est la grille « Quels repas, quels jours ».
  "/app/setup": [
    "setup",
    "allergen",
    "household",
    "plan",
    "app",
    "meals",
    "common",
  ],
  // ── L'APP ÉLÈVE (lot 4) ──────────────────────────────────────────────────
  // ⚠️ CES PAGES MONTENT `KeelAppShell`, ET LES TROIS NAMESPACES DE LA
  // COQUILLE SONT DONC ÉCRITS À LA MAIN SUR CHACUNE. `pageSeams.int.test.ts`
  // ne les met PAS dans son chrome implicite (contrairement à `public` et
  // `brand`), exprès: `app` entre par la GARDE de route — `KeelStudentRoute`
  // rend `app.guard.checking` avant que la page n'existe —, et l'oublier
  // donnait un throw en DEV au tout premier rendu.
  //
  // `/app/health` — les allergies, intolérances et médicaments. `allergen`
  // parce que la liste fermée des treize dangers est rendue par son
  // formulaire, via `copy/allergens.ts`.
  "/app/health": ["health", "allergen", "app", "shell", "chat"],
  // `/app/household` — qui mange ici, ce dont chacun a envie, et ce que la
  // maison ne sert pas à qui. ELLE REVIENT DANS CETTE TABLE, d'où le lot 3
  // l'avait retirée: la raison écrite alors était `api/mealLabels.ts` et ses
  // ~120 phrases hors du seed. Elles y sont maintenant (`meals`), et les 178
  // clés de `household` étaient déjà traduites pour `/app/setup`.
  // `plan` parce que `copy/planRefusals.ts` rend les refus nommés des deux
  // fonctions edge de composition sous la proposition de plan.
  //
  // ⚠️ UNE COUTURE CONNUE ET DÉLIBÉRÉMENT LAISSÉE, LA SEULE DES CINQ PAGES
  // DÉCLARÉES AU LOT 4: `components/HouseholdMergeCard.tsx:45` formate ses
  // quatre dates avec `toLocaleDateString("en-GB", …)`, donc un francophone y
  // lit « 7 Aug » au lieu de « 7 août ». Ce n'est pas un oubli — le formatage
  // des dates est un lot à part (une seule autorité, `keel/i18n/format.ts`, et
  // la distinction entre un format d'AFFICHAGE et le `en-CA` de `dates.ts`, qui
  // est une astuce `yyyy-mm-dd` comparée et stockée, jamais lue). Elle est
  // écrite ici pour qu'elle soit trouvable, et c'est le SEUL site de format sur
  // les cinq pages: `ShoppingListPanel` passe déjà `undefined` (la locale du
  // navigateur), les trois autres pages n'en ont aucun.
  // `common` pour la même raison qu'à `/app/setup`: la fenêtre de présence.
  "/app/household": [
    "household",
    "meals",
    "plan",
    "app",
    "shell",
    "chat",
    "common",
    // ── L5, 2026-08-18 · LE POP-UP « UNE BOUCHE » ──────────────────────────
    // La fenêtre qui décrit une personne s'ouvre ici comme dans l'entonnoir, et
    // elle emprunte le MÊME vocabulaire de champ — prénom, date de naissance,
    // taille, poids, sexe. Deux jeux de libellés pour les deux mêmes champs
    // divergeraient au premier ajustement, et c'est l'écran le moins relu qui
    // aurait tort. `allergen` suit pour la même raison: les treize slugs sont
    // une DONNÉE partagée, et leur libellé se résout à l'appel.
    //
    // ⚠️ DÉCLARÉS PLUTÔT QU'ÉVITÉS, ET C'EST LE REMÈDE QUE LE SCANNER PRESCRIT
    // LUI-MÊME. `pageSeams` a rougi sur ces deux namespaces avant que quiconque
    // ouvre la page — « Ajoute son namespace à la déclaration de la page, ou
    // traduis-le ». Les deux SONT traduits; il manquait la déclaration.
    "setup",
    "allergen",
  ],
  // `/app/about-you` — CE QUE SOPHIA SAIT DE TOI (lot 1D). L'écran de
  // transparence: les six sections du §6, les anciennes notes du §7, et sur
  // chaque ligne sa provenance en clair.
  //
  // ⚠️ `slot` ET `day` NE SONT PAS DU DÉCOR: un `rhythm.set` rend son moment
  // par `slot.*` et un `logistics.set` ses jours de cuisine par `day.long.*`.
  // Les deux sont des ATOMES lus depuis un jeton venu de la BASE, donc aucun
  // scan statique ne les rattacherait à cet écran si la carte ne les écrivait
  // pas en littéral — ce qu'elle fait exprès, pour que le scanner les voie.
  //
  // ⚠️ `known` NE SUFFIT PAS TOUT SEUL, et c'est la leçon de `/start`: le
  // chrome (`app`, `shell`, `chat`) est écrit à la main comme sur les autres
  // pages d'app, parce que `app.*` entre par la GARDE DE ROUTE —
  // `KeelHouseholdRoute` rend `app.guard.checking` avant que la page n'existe.
  "/app/about-you": ["known", "slot", "day", "app", "shell", "chat"],
  // `/app/chat` — la bulle. Elle n'a coûté que le point hebdomadaire: les onze
  // libellés des six axes et des cinq crans vivaient dans `api/weeklyCheckIn.ts`
  // sous CONTRAT MOT POUR MOT avec un fichier Deno, ce qui les rendait
  // intraduisibles tant que le contrat portait sur « le libellé affiché ». Il
  // porte maintenant sur l'ANGLAIS DU SEED — la même chaîne, la même exigence —
  // et le pack français est libre. Voir la note du test.
  //
  // ⚠️ CE QUI RESTE ANGLAIS ICI N'EST PAS DE L'INTERFACE: le CONTENU des
  // messages (la réponse de Sophia, l'accusé de réception d'une photo) vient
  // des fonctions edge et relève de la locale de CONTENU (R2), pas de celle de
  // l'interface (R3). Les deux axes ne se confondent pas, et celui-ci n'est pas
  // dans ce lot.
  "/app/chat": ["chat", "app", "shell"],
  // `/app/today` — la journée. La liste la plus longue de la table, et c'est
  // la nature de cet écran: il fait la jonction entre le plan de repas
  // (`meals`), les lignes d'engagement rendues par `api/labels.ts` (les
  // ATOMES: `when`, `amount`, `sentence`, `question`, `unit`, `day`, `slot`…)
  // et la déclaration d'écart (`deviation`, `common`).
  //
  // ⚠️ `photo` N'EST PAS DU DÉCOR: `/app/today` monte l'envoi de photo de repas
  // (`api/mealPhoto.ts` et les clés `photo.*`), et une seule d'entre elles
  // suffirait à coudre l'écran.
  "/app/today": [
    "today",
    "meals",
    "photo",
    "deviation",
    "common",
    "when",
    "amount",
    "sentence",
    "question",
    "app",
    "shell",
    "chat",
  ],
  // ── LES DEUX DERNIÈRES PAGES ÉLÈVE (lot 6) ───────────────────────────────
  // `/app/plan` — le plus gros écran de l'app: 1963 lignes qui n'avaient PAS UN
  // SEUL `t()`, plus trois `COPY` locaux montés par elle (`MealBuilder` 44
  // entrées, `CookingCapacityCard` 28, `FoodPreferencesCard` 22). Les trois sont
  // dans le seed; c'est ce qui a débloqué la page, pas la traduction elle-même.
  //
  // La liste est longue parce que l'écran l'est: il règle l'objectif (`plan`),
  // compose la semaine (`meals`), rend les six axes du dimanche (`chat`), les
  // jours de cuisine (`day`) et les créneaux du rythme (`slot`, `when`,
  // `amount`, `sentence`, `question`, `unit`, `food_group`, `part`, `timing`)
  // par `api/labels.ts` et `api/mealLabels.ts`.
  //
  // ⚠️ ET DEPUIS QUE LA DEMANDE DE PLAN VIT ICI, LA LISTE NE BOUGE PAS — ce
  // qui mérite d'être écrit, parce que c'est contre-intuitif. Trois blocs sont
  // arrivés de `/app/household` (l'envie, « quelle façon de manger le plat
  // commun suit », « à table »), mais leurs clés ont été RENOMMÉES sous `plan.*`
  // au passage: `household.envy.*` → `plan.envy.*`, `household.reference.*` →
  // `plan.reference.*`, `household.portions.*` → `plan.table.*`.
  //
  // Renommer n'était PAS obligatoire — cette page déclare `household`, donc les
  // anciennes clés auraient compilé et passé toutes les gardes. C'est justement
  // la raison de le faire: une clé `household.*` rendue par l'écran du plan est
  // une fausse piste permanente pour qui grepera dans six mois, et ce dépôt a
  // déjà payé « une valeur figée survit à sa cause ».
  //
  // `household` reste déclaré ici, et ce n'est pas un reliquat: l'écran lit
  // `api/household.ts` (la place dans le foyer, la part, les refus de foyer).
  "/app/plan": [
    "plan",
    "meals",
    "moment",
    "photo",
    "deviation",
    "common",
    "when",
    "amount",
    "sentence",
    "question",
    "day",
    "slot",
    "unit",
    "food_group",
    "part",
    "timing",
    "today",
    "household",
    // ⟳ LOT 5 (2026-09-01) — `setup` EST RENDU ICI, ET UNE SEULE CLÉ LE JUSTIFIE.
    //
    // La fenêtre « À propos de toi » prévient quand la date de naissance manque
    // à quelqu'un qui porte une direction, avec la phrase de l'entonnoir:
    // `setup.missing.adult_without_birth_date`. Elle n'est PAS recopiée sous
    // `plan.*`, exprès — deux formulations du même manque divergent, et c'est
    // celle qu'on relit le moins qui garde l'ancienne. Le namespace est traduit
    // en entier (l'entonnoir en dépend), donc le déclarer ne cache aucun trou:
    // il enregistre une réutilisation, il ne l'excuse pas.
    "setup",
    "app",
    "shell",
    "chat",
  ],
  // `/app/progress` — la régularité, le journal, le rythme, les portions, le
  // poids. ⚠️ ELLE N'A PU ÊTRE DÉCLARÉE QU'APRÈS `i18n/format.ts`: son
  // `dayName()` rend TOUS les en-têtes de la grille de rythme, et il les rendait
  // par `toLocaleDateString("en-GB")`. La déclarer sans traiter ce point aurait
  // donné une page française dont chaque colonne dit « Mon Tue Wed » — la
  // couture de `/start` du 2026-08-12, sur sept colonnes à la fois.
  //
  // `food_group` vient de `lib/weekInFood.ts` (« Fritures ×3 »), `photo` de
  // `api/mealPhoto.ts` (la signature des vignettes), `unit` du symbole `kg` de
  // la pesée, et `moment` de la grille elle-même.
  "/app/progress": [
    "student_progress",
    // ⟳ chantier-0903/SUIVI (A7) — les blocs du suivi (`api/tracking.ts`,
    // `components/Tracking*.tsx`, la courbe de poids).
    "tracking",
    // ⟳ chantier-0903/SUIVI (A7) — SIX ATOMES QUI ENTRENT PAR UN SEUL APPEL,
    // et c'est le scanner de coutures qui l'a dit, pas une relecture.
    // `TrackingCards.tsx` nomme un créneau loupé par `slotLabel()`
    // (`api/labels.ts`) au lieu de recopier les six occasions sous
    // `tracking.slot.*` — une cinquième copie d'un vocabulaire est le défaut
    // que `lib/weekInFood.ts` a payé sur `food_group`. La maille de la
    // frontière étant le NAMESPACE, l'import tire avec lui les cinq autres
    // vocabulaires du module: `common`, `when`, `amount`, `sentence`,
    // `question`. Les six sont traduits en entier (`/app/plan` les déclare
    // déjà), donc les inscrire n'excuse aucun trou — ça enregistre l'emprunt.
    "slot",
    "common",
    "when",
    "amount",
    "sentence",
    "question",
    "moment",
    "food_group",
    "photo",
    "unit",
    // ⚠️ `plan` N'EST PAS DU DÉCOR, ET IL N'EST PAS RENDU NON PLUS. Cette page
    // lit `api/bodyMeasures.ts` (par `studentProgressWeight`) pour une seule
    // fonction, `datedMeasures` — mais le MODULE porte aussi la phrase de
    // tendance et les refus de saisie de `/app/plan`, qui vivent sous `plan.*`.
    // Le scanner de coutures suit les imports, pas les appels, et il a raison
    // de le faire: une refonte qui ferait rendre `readIndicator` ici n'aurait
    // aucune raison de repasser par cette table. Déclaré, donc couvert.
    "plan",
    "app",
    "shell",
    "chat",
  ],
  // ── L'ESPACE COACH (lot 5) ───────────────────────────────────────────────
  // ⚠️ CINQ ROUTES SUR NEUF, ET LES QUATRE ABSENTES LE SONT POUR UNE RAISON
  // MESURÉE, PAS PAR MANQUE DE TEMPS: le pack français de TOUT l'espace coach
  // est écrit (557 clés), et leurs quatre écrans le refusent quand même parce
  // que leur CORPS n'est pas à nous ou n'est pas traduisible d'ici. Chacune a
  // sa ligne en bas de ce bloc, avec la réparation exacte.
  //
  // Comme les pages d'élève, chacune écrit `app`, `shell` et `chat` à la main:
  // la coquille n'est pas dans le chrome implicite de `pageSeams`, exprès.
  //
  // `/coach` — la cohorte. `invite` et `common` viennent d'`InviteDialog`, que
  // la page monte une seule fois, et `api/inviteStudent.ts` rend les neuf
  // phrases de résultat d'envoi (`invite.sent`, `invite.resend_*`…).
  "/coach": ["coach", "invite", "common", "app", "shell", "chat"],
  // `/coach/meals` — la bibliothèque de recettes. Les quatre atomes viennent
  // d'`api/labels.ts`, qui compose la phrase d'un plat.
  "/coach/meals": [
    "coach",
    "amount",
    "common",
    "question",
    "sentence",
    "when",
    "app",
    "shell",
    "chat",
  ],
  // `/coach/billing` — ce que le coach paie, et pourquoi. Ses 39 phrases
  // vivaient dans un `COPY` local qui réservait DÉJÀ les noms de clés finaux.
  "/coach/billing": ["coach", "app", "shell", "chat"],
  // `/coach/templates` — la bibliothèque de modèles. La liste la plus longue de
  // l'espace coach, et c'est la nature de l'écran: il monte l'éditeur
  // d'engagement (`editor`, `safety`, `today` par `CommitmentLine`), la
  // relecture (`review`), une statistique de l'import (`import`) et tous les
  // atomes de composition de phrase.
  "/coach/templates": [
    "coach",
    "templates",
    "review",
    "editor",
    "import",
    "safety",
    "today",
    "amount",
    "common",
    "question",
    "sentence",
    "when",
    "app",
    "shell",
    "chat",
  ],
  // `/coach/clients/:id` — un coach lit l'espace d'UN élève. Le motif paramétré
  // qui a imposé `matchPath` à cette table.
  //
  // ⚠️ `week` Y EST, `progress` N'Y EST PLUS, ET C'EST UN DÉPLACEMENT DE CODE
  // QUI L'A PERMIS. `components/WeekView.tsx` empruntait quatre clés au
  // namespace de l'écran de progression de l'élève; la maille étant le
  // namespace, cette page ATTEIGNAIT donc les 36 clés de `progress.*`, dont 29
  // servaient `pages/ProgressPage.tsx` — que plus aucun fichier n'importait.
  // Les quatre sont maintenant sous `week.*`, et `progress.*` a été retiré du
  // seed avec sa page le 2026-09-03 (chantier-0903/SUIVI).
  //
  // ⚠️ `food_group` Y EST PARCE QU'UNE CINQUIÈME COPIE A ÉTÉ RETIRÉE.
  // `lib/weekInFood.ts` portait un `GROUP_LABELS` local (« Fried food »,
  // « Sugar and sweets »…) pour les quatre groupes « à l'œil », alors que le
  // seed les a — et traduits — depuis le lot 3. La fiche d'un élève rendait
  // donc « Fried food ×3 » au milieu d'une page française.
  "/coach/clients/:id": [
    "coach",
    "week",
    "allergen",
    "amount",
    "common",
    "food_group",
    "question",
    "sentence",
    "timing",
    "today",
    "when",
    "app",
    "shell",
    "chat",
  ],

  // ── CE QUI N'EST PAS DANS CETTE TABLE, ET CE QUI LE BLOQUE ───────────────
  //
  // ⚠️ LES QUATRE ÉCRANS COACH CI-DESSOUS ONT LEUR PACK FRANÇAIS ÉCRIT. Ce
  // n'est donc PAS « pas encore traduit »: c'est « la page ne peut pas tenir la
  // promesse ». Chacun rend, au milieu de son chrome, un texte anglais qui ne
  // vient pas du seed — d'une fonction edge, d'un module Deno partagé ou d'une
  // migration. Les déclarer donnerait exactement la couture de `/start` du
  // 2026-08-12: un en-tête français autour d'un corps anglais.
  //
  // `/coach/doctrine` — LA MÉTHODE DU COACH. 191 clés neuves, ~180 littéraux
  // sortis du code, et elle reste dehors pour DEUX catalogues qui ne sont pas
  // dans le front: `COMPOSITION_FORKS` (_shared/keel/composition_forks.ts) rend
  // ses `subject`, `label` et `effect` EN DUR dans la carte de composition —
  // une section permanente de la page, pas une modale —, et `STARTER_FORKS` +
  // `VOICE_QUESTIONS` (_shared/keel/doctrine_starter.ts,
  // _shared/keel/doctrine_from_forks.ts) font pareil dans les quatre façons de
  // commencer.
  //
  // ⚠️ ET LE PROBLÈME NE S'ARRÊTE PAS AUX ÉTIQUETTES, c'est ce qui en fait un
  // lot serveur et pas un collage de clés: choisir une position ÉCRIT de la
  // prose anglaise DANS la doctrine du coach (`belief.claim`,
  // `forbidden.instead`, `reason`), que la page réaffiche ensuite comme sa
  // méthode et que ses élèves lisent. Traduire les libellés seuls donnerait une
  // question française au-dessus d'une réponse anglaise que le coach s'apprête
  // à publier sous son nom. Réparation: un pack de rendu par langue sur les
  // trois modules de débats, et la locale du coach passée à
  // `buildDraftFromForkGeneration`.
  // ⚠️ NE PAS TOUCHER AUX `surfaceForms`: elles sont ce que le VERROU
  // DÉTERMINISTE matche dans la prose générée, et elles sont anglaises parce
  // que la prose l'est.
  //
  // `/coach/protocol` — LES ALIMENTS RECOMMANDÉS. Même forme, autre source: le
  // CATALOGUE d'aliments est une table, et ses libellés sont des données de
  // SEED, en anglais, écrites par la migration `20260805140000` — « Turkey
  // breast », « Mackerel », « Sardines », plus un `default_why` par ligne
  // (« Store-cupboard oily fish, no cooking, no excuse. »). L'écran EST ce
  // catalogue: un coach français y toucherait une soixantaine de noms anglais
  // sous un chrome français. Le lot 5 a fait tout ce qu'un pack de langue peut
  // faire ici — les quatre listes de départ sont passées dans le seed avec leur
  // ceinture de dérive (`pages/coachFoodPacks.int.test.ts`), et le jeton de
  // créneau rendu brut (« Au breakfast ») passe maintenant par `slot.*`.
  // Réparation: une colonne de libellé par langue sur `food_items`, ou une
  // table de traduction à côté. C'est une MIGRATION, pas un pack.
  //
  // `/coach/weekly` — LA LECTURE DU LUNDI. Tous ses namespaces sont traduits,
  // et ses neuf littéraux ont rejoint le seed. Ce qui la bloque est sa PREMIÈRE
  // CARTE, celle que l'en-tête de la page appelle « l'argument de l'écran »:
  // `coach_syntheses.narrative` est écrit par `renderSynthesisText`
  // (`_shared/keel/coach_synthesis.ts`), qui LÈVE sur toute locale autre que
  // `"en"` (R7, délibéré), et `coach_synthesis_io.ts` l'appelle avec
  // `locale: "en"` EN DUR. Le paragraphe est donc anglais par construction, et
  // non par oubli de câblage. La déclarer rendrait un chrome français autour du
  // seul bloc de texte qui compte — exactement la couture mesurée sur `/start`
  // le 2026-08-12. Réparation: un pack de rendu français côté Deno, puis la
  // locale du coach passée au job du lundi. Une ligne ici le jour où c'est fait.
  //
  // `/coach/import` — L'IMPORT D'UN PLAN. Même forme, autre cause. Le CORPS de
  // l'écran est ce que `plan-import-v1` a extrait du document: titres de lignes,
  // consignes à l'élève, descriptions de trous. La fonction edge prend un
  // `content_locale`, mais `pages/PlanImportPage.tsx` NE LE PASSE JAMAIS — le
  // défaut vaut `"en-US"` (`plan-import-v1/index.ts:83`), donc l'extraction sort
  // en anglais même pour un coach français partant d'un document français.
  // `api/gapQuestion.ts` en est la preuve visible: ses deux préambules sont des
  // expressions régulières sur « The document says / asks for … », et son
  // en-tête dit déjà que traduire `review.gap_question` produirait « une
  // coquille française autour d'un sujet anglais ». Réparation: passer la locale
  // du coach à l'extraction. Ce n'est PAS un geste de pack de langue — il change
  // ce que le modèle écrit et ce qui part en base, donc il a son lot.
  //
  // ⚠️ IL NE RESTE AUCUN ÉCRAN D'ÉLÈVE HORS DE CETTE TABLE. `/app/plan` et
  // `/app/progress` y sont entrées au lot 6, avec les trois `COPY` locaux
  // rapatriés et `i18n/format.ts` posé — voir l'en-tête du fichier.
  //
  // Ce qui reste dehors: les quatre écrans coach ci-dessus (leur corps n'est
  // pas à nous), `/legal`, `/account` et les trois écrans admin.
};

/**
 * Les namespaces de la page servie à ce chemin, ou `null` s'il n'est pas
 * déclaré.
 *
 * Point de résolution UNIQUE: `isDeclaredPagePath` et `uiLocaleForPath` en
 * dépendent tous les deux, et ils DOIVENT répondre du même écran — une page
 * qui dit « oui, je suis déclarée » à `t()` et que la locale n'a pas servie
 * est précisément la situation où le throw de DEV accuse à tort.
 *
 * L'égalité exacte est essayée d'abord: c'est le cas de toutes les pages
 * d'aujourd'hui, et ça met un motif paramétré (`/coach/clients/:id`) hors
 * d'état de capturer une page statique déclarée plus bas dans la table.
 */
export function namespacesForPath(
  pathname: string,
): readonly string[] | null {
  const path = String(pathname ?? "").trim();
  if (path === "") return null;
  const exact = Object.prototype.hasOwnProperty.call(PAGE_NAMESPACES, path)
    ? PAGE_NAMESPACES[path]
    : undefined;
  if (exact !== undefined) return exact;
  for (const [pattern, namespaces] of Object.entries(PAGE_NAMESPACES)) {
    if (matchPath(pattern, path) !== null) return namespaces;
  }
  return null;
}

/**
 * Cette page A-T-ELLE PROMIS de se rendre entièrement dans la langue du
 * visiteur ?
 *
 * Une page déclarée dans `PAGE_NAMESPACES` a fait cette promesse. C'est
 * ce qui permet à `t()` de distinguer, en DEV, deux situations que rien ne
 * distinguait: une clé anglaise sur une page qu'on n'a jamais promis de
 * traduire (la frontière qui marche) et une clé anglaise sur une page qu'on a
 * promise (une couture, qui ne se voit qu'à l'exécution).
 */
export function isDeclaredPagePath(pathname: string): boolean {
  return namespacesForPath(pathname) !== null;
}

/**
 * Les clés du périmètre traduit, DÉRIVÉES du seed anglais.
 *
 * Un type littéral de gabarit plutôt qu'une liste tenue à la main: une clé
 * ajoutée à `en.ts` sous un namespace traduit entre ici toute seule, et le pack
 * français cesse de compiler tant qu'elle n'est pas traduite. Une liste
 * manuelle aurait exactement le défaut inverse — elle vieillit en silence.
 */
export type TranslatedMessageKey = Extract<
  MessageKey,
  `${TranslatedNamespace}.${string}`
>;

/** Un pack français est COMPLET sur son périmètre, ou il ne compile pas. */
export type TranslatedMessages = Record<TranslatedMessageKey, string>;

/**
 * Les clés traduites présentes dans le seed, à l'exécution.
 *
 * Le type ci-dessus est effacé à la compilation; `t()` a besoin de savoir, à
 * l'exécution, si une clé donnée relève du périmètre. Dérivé du seed par le
 * même préfixe, donc les deux ne peuvent pas diverger.
 */
export const TRANSLATED_MESSAGE_KEYS: ReadonlySet<string> = new Set(
  Object.keys(en).filter((key) =>
    TRANSLATED_NAMESPACES.some((ns) => key.startsWith(`${ns}.`))
  ),
);

export function isTranslatedMessageKey(
  key: string,
): key is TranslatedMessageKey {
  return TRANSLATED_MESSAGE_KEYS.has(key);
}

/**
 * Normalise une valeur de langue quelconque vers une locale d'interface livrée.
 *
 * Tolérant par nature — l'entrée vient d'une URL, d'un `localStorage` ou d'un
 * `navigator.languages`, trois sources qu'on ne contrôle pas. Ce n'est PAS une
 * violation de R7: R7 porte sur les mappings de JETONS, où une valeur inconnue
 * est un bug; ici une valeur inconnue est un visiteur avec un navigateur
 * espagnol, et le défaut anglais est la bonne réponse.
 */
export function parseUiLocale(raw: string | null | undefined): UiLocale {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value.startsWith("fr")) return "fr";
  return DEFAULT_UI_LOCALE;
}

/**
 * Compose la valeur à écrire dans `profiles.locale` — en ne changeant QUE le
 * sous-tag de langue, jamais la région.
 *
 * ⚠️ CETTE FONCTION TOUCHE UN CHEMIN DE SÉCURITÉ. Côté serveur,
 * `crisis_resources.ts` dérive le PAYS du sous-tag région de la locale quand
 * `profiles.country` est NULL. Écrire « fr-FR » pour un coach britannique
 * changerait le numéro d'urgence servi à ses élèves — c'est l'incident mesuré
 * qui a motivé la migration `20260804180000` (un élève britannique s'est vu
 * servir le 3114 avec `fallbackUsed: false`).
 *
 * En ne bougeant que la langue, `fr-GB` reste britannique: le résolveur de
 * crise répond exactement la même chose qu'avant le clic.
 */
export function composeProfileLocale(
  next: UiLocale,
  currentProfileLocale: string | null | undefined,
): string {
  const current = String(currentProfileLocale ?? "").trim();
  const region = /^[a-z]{2}-([A-Z]{2})$/.exec(current)?.[1];
  const base = next === "fr" ? "fr" : "en";
  if (region) return `${base}-${region}`;
  // Sans région connue, on ne l'invente pas: le défaut de chaque langue.
  return next === "fr" ? "fr-FR" : "en-US";
}
