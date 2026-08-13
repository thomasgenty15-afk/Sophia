import React from "react";

import { supabase } from "../../lib/supabase";
import { slotLabel } from "../api/labels";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { inputClass } from "../components/ui/Field";
import { formatDate } from "../i18n/format";
import { t } from "../i18n/t";
import type { MessageKey } from "../i18n/t";

import {
  AXES_BY_GOAL,
  type CoachTerm,
  type CoachTimingRule,
  compileProtocol,
  type FoodGroupRow,
  type GoalToken,
  type Stance,
  type StoredTimingRule,
  toProtocolInput,
  previewSentence,
  publishImpact,
  type CompiledCommitment,
} from "../api/coachProtocol";

import {
  buildFoodClasses,
  canRewriteWhy,
  type CoachFoodItem,
  defaultFrequency,
  deriveFoodRules,
  type DisplayFood,
  type FoodItemRow,
  type FrequencyRule,
  frequencyFromRow,
  frequencySentence,
  frequencyToRow,
  matchesFoodSearch,
  unitsForAxis,
} from "../api/coachFoodItems";
import {
  FOOD_PACKS,
  type FoodPack,
  packAdditions,
} from "../../../../supabase/functions/_shared/keel/food_packs.ts";
import { fillAdditions } from "../../../../supabase/functions/_shared/keel/food_fill.ts";

/**
 * `/coach/protocol` — « RECOMMENDED FOOD »: LES ALIMENTS AVEC LESQUELS LE
 * COACH CONSTRUIT.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CET ÉCRAN REMPLACE, ET POURQUOI
 * ---------------------------------------------------------------------------
 * Il demandait une posture sur 30 GROUPES abstraits — « matière grasse
 * ajoutée », « légumes non féculents » — en pastilles tri-état qu'on faisait
 * défiler d'un tap. Deux reproches, et c'était le même: illisible ET peu de
 * choix. Un coach ne pense pas en groupes, il pense en aliments.
 *
 * Il voit maintenant ~127 ALIMENTS concrets rangés dans ses catégories, il en
 * ajoute avec un « + », et chaque aliment coché ouvre un panneau où il peut —
 * S'IL VEUT — dire à quelle fréquence et pourquoi. La posture de groupe que le
 * pipeline lit est DÉRIVÉE (`_shared/keel/food_items.ts`), et l'aperçu montre
 * en permanence ce qu'elle produit.
 *
 * ---------------------------------------------------------------------------
 * DEUX ÉCHELLES SUR UN ÉCRAN, ET LA PHRASE QUI LES SÉPARE
 * ---------------------------------------------------------------------------
 * Une règle sur UN aliment n'est pas vérifiable sur une photo: l'analyse photo
 * rend des GROUPES, elle ne dira jamais « c'était de l'huile de coco ». Donc:
 *
 *   * règles par ALIMENT   -> ce que Sophia CONSTRUIT et DIT;
 *   * règles par CATÉGORIE -> ce que Sophia VÉRIFIE dans l'assiette.
 *
 * `coach.food.freq.scope_note` le dit LÀ OÙ le coach écrit la règle. Sans
 * cette phrase, deux niveaux de réglage sur le même écran redeviennent
 * exactement le « pas clair » qu'on vient de corriger.
 *
 * ---------------------------------------------------------------------------
 * LE « POURQUOI » PRÉ-REMPLI — ARBITRAGE ASSUMÉ, GARDE-FOUS STRUCTURELS
 * ---------------------------------------------------------------------------
 * Un « pourquoi » livré par KEEL et affiché sous le nom du coach fait de KEEL
 * l'autorité nutritionnelle. Arbitrage produit du 2026-08-05, pris en
 * connaissance de cause: un champ vide sur 127 aliments ne serait jamais
 * rempli, et le coach sera d'accord l'essentiel du temps.
 *
 * Ce qui rend ça tenable est structurel, pas déclaratif:
 *   1. rien n'atteint l'élève avant PUBLICATION, geste explicite avec diff;
 *   2. `why_source` trace l'origine, et l'écriture IA est CONDITIONNÉE dessus
 *      côté base — une régénération ne peut pas écraser ce que le coach a
 *      écrit. Ce dépôt a payé ce défaut exact sur la carte de défense.
 *
 * ---------------------------------------------------------------------------
 * LE BROUILLON N'EST CRÉÉ QU'À LA PREMIÈRE ÉCRITURE
 * ---------------------------------------------------------------------------
 * Ouvrir l'écran ne crée rien. Un coach qui vient regarder ne doit pas laisser
 * derrière lui un brouillon vide qui apparaîtra plus tard comme « une méthode
 * commencée » dans un diff de publication.
 */

const CLASS_LABEL: Readonly<Record<string, MessageKey>> = {
  protein: "coach.protocol.class.protein",
  vegetable: "coach.protocol.class.vegetable",
  fruit: "coach.protocol.class.fruit",
  grain: "coach.protocol.class.grain",
  legume: "coach.protocol.class.legume",
  dairy: "coach.protocol.class.dairy",
  fat: "coach.protocol.class.fat",
  beverage: "coach.protocol.class.beverage",
  discretionary: "coach.protocol.class.discretionary",
};

const STANCES: readonly { readonly value: Stance; readonly labelKey: MessageKey }[] = [
  { value: "encouraged", labelKey: "coach.food.stance.encouraged" },
  { value: "discouraged", labelKey: "coach.food.stance.discouraged" },
  { value: "excluded", labelKey: "coach.food.stance.excluded" },
];

/**
 * LES TROIS CRÉNEAUX QU'UNE RÈGLE « À TEL REPAS » PEUT VISER.
 *
 * Les VALEURS sont les jetons de `slot_vocabulary` — c'est ce que la base
 * stocke, et ça ne se traduit jamais (R1). Les MOTS viennent de `slot.*` par
 * `slotLabel`, la même table que l'écran de l'élève lit: le sélecteur écrivait
 * `breakfast` en dur des deux côtés, si bien qu'un coach en français choisissait
 * « breakfast » et relisait « Au breakfast » dans l'aperçu juste en dessous.
 */
const AT_SLOT_KEYS = ["breakfast", "lunch", "dinner"] as const;

/**
 * Le JETON de créneau qu'une phrase composée porte, remplacé par son MOT.
 *
 * `previewSentence` et `frequencySentence` sont partagés et purs: ils rendent
 * une clé et ses trous, dont `{slot}`, et ce trou vaut le jeton brut. Les deux
 * phrases sortaient donc « à breakfast » au milieu d'un écran traduit. On
 * corrige au point de RENDU plutôt que dans les deux modules — le mot n'est
 * une affaire de langue qu'ici.
 *
 * `slotLabel` LÈVE sur un jeton que le seed ne connaît pas (R7): un créneau
 * ajouté au vocabulaire sans son mot se voit au premier rendu, il ne fuit pas.
 */
function withSlotLabel(
  params?: Record<string, string | number>,
): Record<string, string | number> | undefined {
  if (!params || params.slot === undefined) return params;
  return { ...params, slot: slotLabel(String(params.slot)) };
}

// ── LES TROIS POSTURES RESTENT COLORÉES, ET C'EST JUSTE ───────────────────
// Une posture est un VERDICT que le coach a rendu sur un aliment, pas une
// catégorie: « encouragé » se lit ok, « découragé » se lit attention, « exclu »
// se lit refus. Ce sont exactement trois des quatre familles d'état du produit,
// et la charte réserve la couleur saturée à ça (§2). Elles ne bougent donc pas.
//
// ⚠️ UNE SEULE CHOSE A CHANGÉ: `rose` est devenu `red`. Le rouge du produit est
// `red-*` — c'est ce que `Badge tone="critical"` rend (`bg-red-50 text-red-700`)
// — et `rose` en était une CINQUIÈME famille, à quelques degrés de lui. Deux
// familles pour un seul sens, c'est la façon dont un vocabulaire d'état se perd:
// le lecteur apprend deux fois « refus » et n'en reconnaît plus aucun.
const STANCE_PILL: Readonly<Record<Stance, string>> = {
  encouraged: "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium",
  discouraged: "border-amber-500 bg-amber-50 text-amber-800 font-medium",
  excluded: "border-red-500 bg-red-50 text-red-700 font-medium",
};
const NEUTRAL_PILL = "border-line-strong bg-paper text-ink-soft";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-protocol-v1`;

type Phase = "loading" | "ready" | "error";

/**
 * Une ligne de `coach_food_proposals` — ce qu'un document du coach a dit d'un
 * aliment, en attente de son arbitrage.
 *
 * `quote` n'est pas facultatif, ni ici ni en base (`quote text not null`): une
 * proposition sans citation n'est pas une lecture du document, c'est une
 * invention — et une invention est indiscernable d'une lecture une fois
 * affichée à côté des autres.
 */
interface FoodProposalRow {
  id: string;
  term: string;
  quote: string;
  stance: Stance;
  food_group_ref: string;
  food_item_ref: string | null;
  source_label: string | null;
}

export function CoachProtocolPage() {
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [errorText, setErrorText] = React.useState<string | null>(null);

  const [coachId, setCoachId] = React.useState<string | null>(null);
  const [protocolId, setProtocolId] = React.useState<string | null>(null);
  const [groups, setGroups] = React.useState<FoodGroupRow[]>([]);
  const [catalog, setCatalog] = React.useState<FoodItemRow[]>([]);
  const [picked, setPicked] = React.useState<CoachFoodItem[]>([]);
  const [activeStudents, setActiveStudents] = React.useState(0);
  const [goal, setGoal] = React.useState<GoalToken>("fat_loss");

  // LUS, PLUS ÉDITÉS ICI — et lus exprès.
  //
  // Les éditeurs « Timing rules » et « Your words » ont été retirés de cet
  // écran (2026-08-05): il ne parle plus que d'aliments. Mais les deux tables
  // existent, le compilateur les lit toujours, et `coach_terms` décide même du
  // TITRE des engagements produits.
  //
  // Cesser de les charger changerait donc en silence ce que « What Sophia will
  // check » annonce, sans qu'aucune ligne n'ait été supprimée en base. On les
  // charge, on les passe au compilateur, et l'aperçu continue de dire la
  // vérité. Personne ne perd de règle parce qu'un écran a maigri.
  const [timingRules, setTimingRules] = React.useState<StoredTimingRule[]>([]);
  const [terms, setTerms] = React.useState<CoachTerm[]>([]);
  const [published, setPublished] = React.useState<CompiledCommitment[]>([]);
  const [publishedAt, setPublishedAt] = React.useState<string | null>(null);

  /**
   * CE QU'UN DOCUMENT DU COACH A DIT, EN ATTENTE DE SON ARBITRAGE.
   *
   * Écrit par `coach-doctrine-v1: compile_document` dans `coach_food_proposals`,
   * jamais dans `coach_food_items`. La distinction est la garde de tout ce lot:
   * la table de la MÉTHODE est compilée, publiée, puis lue par le générateur et
   * l'évaluateur — une ligne posée là par un modèle qui a mal lu une page
   * deviendrait une règle appliquée au nom du coach sans qu'il ait rien validé.
   *
   * Chaque proposition porte la CITATION du document. C'est elle qui permet de
   * trancher en une seconde, et c'est le seul signal qui distingue « le
   * document le dit » de « le modèle l'a déduit ».
   */
  const [proposals, setProposals] = React.useState<FoodProposalRow[]>([]);

  /**
   * Les listes de départ restent accessibles APRÈS le premier remplissage.
   *
   * La carte s'affiche d'office sur une liste vide — c'est là qu'elle sert. Mais
   * un coach qui a coché douze aliments à la main et veut ensuite la base
   * « cuisine minimale » ne doit pas avoir à tout supprimer pour la revoir.
   */
  const [packsOpen, setPacksOpen] = React.useState(false);

  const [query, setQuery] = React.useState("");
  const [openClasses, setOpenClasses] = React.useState<Set<string>>(new Set());
  const [openFood, setOpenFood] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const groupLabel = React.useCallback(
    (slug: string) => {
      const row = groups.find((g) => g.slug === slug);
      return row ? t(row.label_i18n_key as MessageKey) : slug;
    },
    [groups],
  );

  // ---- chargement -------------------------------------------------------
  // FAIL LOUD, SHOW NOTHING. Une lecture ratée rend l'erreur, jamais un état
  // vide: « vous n'avez rien coché » et « nous n'avons pas pu lire votre
  // liste » sont deux phrases différentes, et montrer la première pour la
  // seconde invite un coach à tout refaire.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) throw new Error("no session");

        const coach = await supabase
          .from("coaches")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (coach.error) throw new Error(coach.error.message);

        const [groupRows, itemRows] = await Promise.all([
          supabase.from("food_groups").select("slug, class, label_i18n_key"),
          supabase
            .from("food_items")
            .select(
              "slug, food_group_ref, label, count_axis, typical_amount, typical_unit, default_why, sort_order",
            ),
        ]);
        if (groupRows.error) throw new Error(groupRows.error.message);
        if (itemRows.error) throw new Error(itemRows.error.message);

        if (cancelled) return;
        setCoachId(coach.data?.id ?? null);
        setGroups((groupRows.data ?? []) as FoodGroupRow[]);
        setCatalog((itemRows.data ?? []) as FoodItemRow[]);

        if (coach.data?.id) {
          const pending = await supabase
            .from("coach_food_proposals")
            .select("id, term, quote, stance, food_group_ref, food_item_ref, source_label")
            .eq("coach_id", coach.data.id)
            .eq("status", "pending")
            .order("created_at", { ascending: true });
          if (pending.error) throw new Error(pending.error.message);
          if (!cancelled) setProposals((pending.data ?? []) as FoodProposalRow[]);

          const clients = await supabase
            .from("coach_clients")
            .select("status")
            .eq("coach_id", coach.data.id);
          if (clients.error) throw new Error(clients.error.message);
          if (!cancelled) {
            setActiveStudents(
              (clients.data ?? []).filter((c) => c.status === "active").length,
            );
          }
          await loadProtocol(coach.data.id, cancelled);
        }
        if (!cancelled) setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        setErrorText(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadProtocol(cid: string, cancelled: boolean) {
    const protocols = await supabase
      .from("coach_protocols")
      .select("id, version, status, published_at")
      .eq("coach_id", cid);
    if (protocols.error) throw new Error(protocols.error.message);

    const draft = (protocols.data ?? []).find((p) => p.status === "draft");
    const live = (protocols.data ?? []).find((p) => p.status === "published");
    if (!cancelled) setProtocolId(draft?.id ?? null);

    const ids = [draft?.id, live?.id].filter(Boolean) as string[];
    if (ids.length === 0) return;

    const [foodItems, timing, coachTerms] = await Promise.all([
      supabase.from("coach_food_items").select("*").in("protocol_id", ids),
      supabase.from("coach_timing_rules").select("*").in("protocol_id", ids),
      supabase.from("coach_terms").select("term, food_group_ref").eq("coach_id", cid),
    ]);
    if (foodItems.error) throw new Error(foodItems.error.message);
    if (timing.error) throw new Error(timing.error.message);
    if (coachTerms.error) throw new Error(coachTerms.error.message);
    if (cancelled) return;

    setTerms((coachTerms.data ?? []) as CoachTerm[]);
    setPicked(
      (foodItems.data ?? [])
        .filter((r) => r.protocol_id === draft?.id)
        .map(rowToFoodItem),
    );
    setTimingRules(
      (timing.data ?? [])
        .filter((r) => r.protocol_id === draft?.id)
        .map((r) => ({ id: r.id as string, rule: rowToTimingRule(r) })),
    );

    if (live) {
      setPublishedAt(live.published_at as string | null);
      const liveItems = (foodItems.data ?? [])
        .filter((r) => r.protocol_id === live.id)
        .map(rowToFoodItem);
      setPublished([
        ...compileProtocol(
          {
            coachId: cid,
            contentLocale: "en-GB",
            foodRules: deriveFoodRules(liveItems).rules,
            timingRules: (timing.data ?? [])
              .filter((r) => r.protocol_id === live.id)
              .map(rowToTimingRule),
            terms: (coachTerms.data ?? []) as CoachTerm[],
          },
          null,
        ),
      ]);
    }
  }

  // ---- le brouillon, créé à la PREMIÈRE écriture seulement ---------------
  async function ensureDraft(): Promise<string> {
    if (protocolId) return protocolId;
    if (!coachId) throw new Error("no coach");
    // `coach_protocols_one_draft_per_coach_idx` garantit qu'il n'y en a qu'un.
    // Deux onglets qui écrivent en même temps doivent se disputer LA MÊME
    // ligne, pas fabriquer deux brouillons divergents.
    const existing = await supabase
      .from("coach_protocols")
      .select("id")
      .eq("coach_id", coachId)
      .eq("status", "draft")
      .maybeSingle();
    if (existing.data?.id) {
      setProtocolId(existing.data.id);
      return existing.data.id;
    }
    const versions = await supabase
      .from("coach_protocols")
      .select("version")
      .eq("coach_id", coachId)
      .order("version", { ascending: false })
      .limit(1);
    const next = (versions.data?.[0]?.version ?? 0) + 1;
    const created = await supabase
      .from("coach_protocols")
      .insert({ coach_id: coachId, version: next, status: "draft", content_locale: "en-GB" })
      .select("id")
      .single();
    if (created.error) throw new Error(created.error.message);
    setProtocolId(created.data.id);
    return created.data.id;
  }

  // ---- les écritures ----------------------------------------------------
  // Chacune relit sa ligne écrite et remonte CE QUE LA BASE A ACCEPTÉ, jamais
  // ce qu'on croit avoir envoyé. C'est la leçon « accusé fantôme » de ce
  // dépôt: un écran qui affiche un état qu'aucune ligne ne porte est un
  // mensonge qui se découvre plus tard, ailleurs.
  const [busy, setBusy] = React.useState(false);

  // UNE ÉCRITURE RATÉE SE VOIT, ET N'EFFACE PAS L'ÉCRAN.
  //
  // Deux erreurs distinctes, deux rendus distincts, et les confondre coûte
  // cher dans les deux sens. Une LECTURE ratée remplace la page: on ne sait
  // pas ce que le coach a écrit, donc on ne montre rien plutôt qu'un état
  // faux. Une ÉCRITURE ratée, elle, laisse une page parfaitement valide — la
  // remplacer ferait perdre au coach tout ce qu'il regardait pour un insert
  // refusé.
  //
  // Ce qu'on ne fait SURTOUT pas, c'est ce que faisait la première version de
  // cet écran: ranger l'erreur dans un état que rien ne rend. La pastille ne
  // collait pas, aucun message n'apparaissait, et le coach recliquait. C'est
  // l'accusé fantôme servi à l'envers.
  const [writeError, setWriteError] = React.useState<string | null>(null);

  async function pickFood(food: DisplayFood) {
    if (food.picked) {
      setOpenFood(openFood === food.key ? null : food.key);
      return;
    }
    setBusy(true);
    try {
      const pid = await ensureDraft();
      const source = catalog.find((c) => c.slug === food.catalogSlug);
      const inserted = await supabase
        .from("coach_food_items")
        .insert({
          protocol_id: pid,
          coach_id: coachId,
          food_item_ref: food.catalogSlug,
          label: food.label,
          food_group_ref: food.foodGroupRef,
          stance: "encouraged",
          // Le pré-remplissage. `seeded` et pas `coach`: tant que le coach n'y
          // a pas touché, ce ne sont pas ses mots — et c'est ce qui autorise
          // l'IA à les réécrire.
          why: source?.default_why ?? null,
          why_source: source?.default_why ? "seeded" : "coach",
        })
        .select("*")
        .single();
      if (inserted.error) throw new Error(inserted.error.message);
      setWriteError(null);
      setPicked((prev) => [...prev, rowToFoodItem(inserted.data)]);
      setOpenFood(food.key);
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function patchItem(item: CoachFoodItem, patch: Record<string, unknown>) {
    const updated = await supabase
      .from("coach_food_items")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .select("*")
      .single();
    if (updated.error) {
      setWriteError(updated.error.message);
      return;
    }
    setWriteError(null);
    const next = rowToFoodItem(updated.data);
    setPicked((prev) => prev.map((p) => (p.id === item.id ? next : p)));
  }

  async function removeItem(item: CoachFoodItem) {
    const del = await supabase.from("coach_food_items").delete().eq("id", item.id);
    if (del.error) {
      setWriteError(del.error.message);
      return;
    }
    setWriteError(null);
    setPicked((prev) => prev.filter((p) => p.id !== item.id));
    setOpenFood(null);
  }

  async function addCustomFood(term: string, fallbackGroup: string) {
    const pid = await ensureDraft();
    let group = fallbackGroup;
    let why: string | null = null;
    let whySource: CoachFoodItem["why_source"] = "coach";
    try {
      const res = await callFn<{
        food_group_ref?: string;
        why?: string | null;
      }>({ action: "classify_food", term });
      if (res.food_group_ref && groups.some((g) => g.slug === res.food_group_ref)) {
        group = res.food_group_ref;
      }
      if (res.why) {
        why = res.why;
        whySource = "ai";
      }
    } catch {
      // Le classement rate: on n'abandonne PAS l'ajout. Le coach a demandé un
      // aliment, il l'obtient — sur la catégorie qu'il a choisie lui-même, et
      // l'écran le dit. Perdre son geste parce qu'un modèle n'a pas répondu
      // serait lui faire payer notre panne.
    }
    const inserted = await supabase
      .from("coach_food_items")
      .insert({
        protocol_id: pid,
        coach_id: coachId,
        food_item_ref: null,
        label: term,
        food_group_ref: group,
        stance: "encouraged",
        why,
        why_source: whySource,
      })
      .select("*")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    const next = rowToFoodItem(inserted.data);
    setPicked((prev) => [...prev, next]);
    setOpenFood(next.id);
  }

  /**
   * LE COACH ADOPTE UNE LECTURE DE SON DOCUMENT.
   *
   * ── `why_source: "coach"` ET PAS `"ai"`, ET C'EST UN ARBITRAGE ──────────
   * Le `why` posé ici est la CITATION du document — les mots du coach, écrits
   * par lui, qu'il vient de relire et d'adopter d'un clic. `why_source` est un
   * cliquet: l'écriture IA est conditionnée (`where why_source <> 'coach'`),
   * donc marquer `"coach"` interdit à une régénération d'écraser sa phrase par
   * une phrase générée. Marquer `"ai"` autoriserait exactement ça — c'est le
   * défaut déjà payé sur la carte de défense.
   *
   * Une quatrième valeur `"document"` a été envisagée et écartée: elle se
   * comporterait à l'identique de `"coach"` partout, ce que R6 interdit (pas de
   * valeur d'enum sans branche nommée qui la lit).
   *
   * L'ordre compte: on écrit la ligne de méthode D'ABORD, on résout la
   * proposition ENSUITE. L'inverse laisserait une proposition marquée
   * `accepted` sans ligne derrière si l'insert échoue — un fantôme, et le coach
   * croirait avoir un aliment qu'il n'a pas.
   */
  async function acceptProposal(p: FoodProposalRow) {
    const pid = await ensureDraft();
    const inserted = await supabase
      .from("coach_food_items")
      .insert({
        protocol_id: pid,
        coach_id: coachId,
        food_item_ref: p.food_item_ref,
        label: p.term,
        food_group_ref: p.food_group_ref,
        stance: p.stance,
        why: p.quote,
        why_source: "coach",
      })
      .select("*")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);

    const resolved = await supabase
      .from("coach_food_proposals")
      .update({ status: "accepted", resolved_at: new Date().toISOString() })
      .eq("id", p.id);
    if (resolved.error) throw new Error(resolved.error.message);

    setPicked((prev) => [...prev, rowToFoodItem(inserted.data)]);
    setProposals((prev) => prev.filter((x) => x.id !== p.id));
    setOpenFood(inserted.data.id as string);
  }

  /**
   * ÉCARTER N'EST PAS UN VERROU SUR L'ALIMENT.
   *
   * Le coach écarte une LECTURE d'un document, pas le saumon. Un autre document
   * peut en dire autre chose, et l'index partiel de la base (`where status =
   * 'pending'`) est écrit pour que ce soit possible.
   */
  async function dismissProposal(p: FoodProposalRow) {
    const resolved = await supabase
      .from("coach_food_proposals")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", p.id);
    if (resolved.error) throw new Error(resolved.error.message);
    setProposals((prev) => prev.filter((x) => x.id !== p.id));
  }

  /**
   * POSER UNE LISTE DE DÉPART.
   *
   * ── CE QUE ÇA N'EST PAS ────────────────────────────────────────────────
   * Une écriture d'un genre nouveau. Chaque ligne est exactement ce que pose le
   * tap manuel juste au-dessus (`pickFood`): posture `encouraged`, `why` repris
   * de `food_items.default_why`, `why_source: 'seeded'`. `seeded` et pas
   * `coach`: tant que le coach n'y a pas touché, ce ne sont pas ses mots — et
   * c'est ce qui autorise l'IA à les réécrire depuis SA doctrine.
   *
   * ── CE QU'ON N'ÉCRASE JAMAIS ───────────────────────────────────────────
   * Ce que le coach a déjà. `packAdditions` retire les aliments déjà présents:
   * s'il a marqué le beurre `excluded`, un pack qui le propose ne le retourne
   * pas. Un préréglage n'a pas d'avis contre le coach.
   *
   * L'insert est fait EN UNE FOIS: les lignes d'un pack se posent ensemble ou
   * pas du tout. Un pack à moitié écrit serait pire qu'un pack refusé — le
   * coach croirait avoir une base cohérente et en aurait un morceau.
   */
  async function addPack(pack: FoodPack) {
    const pid = await ensureDraft();
    const slugs = packAdditions(pack, picked.map((p) => p.food_item_ref));
    if (slugs.length === 0) return;
    const rows = slugs.map((slug) => {
      const source = catalog.find((c) => c.slug === slug);
      if (!source) throw new Error(`pack ${pack.key} references ${slug}, absent from the catalogue`);
      return {
        protocol_id: pid,
        coach_id: coachId,
        food_item_ref: slug,
        label: source.label,
        food_group_ref: source.food_group_ref,
        stance: "encouraged",
        why: source.default_why ?? null,
        why_source: source.default_why ? "seeded" : "coach",
      };
    });
    const inserted = await supabase.from("coach_food_items").insert(rows).select("*");
    if (inserted.error) throw new Error(inserted.error.message);
    setPicked((prev) => [...prev, ...(inserted.data ?? []).map(rowToFoodItem)]);
    setPacksOpen(false);
  }

  /**
   * PRÉ-REMPLIR DEPUIS LA MÉTHODE DÉJÀ ÉCRITE.
   *
   * Un coach qui a rédigé sa doctrine a déjà dit comment il nourrit ses élèves;
   * lui redemander en 127 pastilles est du travail qu'on peut lui épargner.
   *
   * ── LE SERVEUR DÉCIDE, L'ÉCRAN ÉCRIT ───────────────────────────────────
   * `fill_from_doctrine` ne touche pas la base: il rend une SÉLECTION
   * `{slug, stance}`. Les gardes (catalogue fermé, trace obligatoire sur un
   * `excluded`) vivent là-bas, et l'insert passe par le MÊME chemin que le tap
   * manuel et les packs. Dupliquer le chemin d'écriture aurait produit deux
   * provenances divergentes sur la même table.
   *
   * ── LA STANCE VIENT DU SERVEUR, LE RESTE DU CATALOGUE ──────────────────
   * Contrairement à `addPack`, la posture n'est pas toujours `encouraged`: la
   * doctrine du coach peut écarter un aliment. Le `why` et le libellé, eux,
   * viennent du catalogue comme partout ailleurs — `why_source: 'seeded'`, donc
   * l'IA pourra les réécrire et le coach les reprendre.
   *
   * On n'écrase jamais ce qu'il a déjà: `fillAdditions` retire les aliments
   * présents, quelle que soit la posture qu'il leur a donnée.
   */
  async function fillFromDoctrine() {
    const res = await callFn<{
      selection?: { slug: string; stance: string }[];
      source?: string;
      reason?: string;
    }>({ action: "fill_from_doctrine" });
    if (!res.selection) throw new Error(res.reason ?? "fill_failed");

    const pid = await ensureDraft();
    const additions = fillAdditions(
      res.selection as { slug: string; stance: "encouraged" | "discouraged" | "excluded" }[],
      picked.map((p) => p.food_item_ref),
    );
    if (additions.length === 0) return;

    const rows = additions.flatMap((sel) => {
      const source = catalog.find((c) => c.slug === sel.slug);
      // Le serveur a déjà vérifié le catalogue; si un slug manque ICI c'est que
      // les deux vues divergent. On saute la ligne plutôt que de jeter tout le
      // remplissage — mais on ne l'invente pas non plus.
      if (!source) return [];
      return [{
        protocol_id: pid,
        coach_id: coachId,
        food_item_ref: sel.slug,
        label: source.label,
        food_group_ref: source.food_group_ref,
        stance: sel.stance,
        why: source.default_why ?? null,
        why_source: source.default_why ? "seeded" : "coach",
      }];
    });
    if (rows.length === 0) return;

    const inserted = await supabase.from("coach_food_items").insert(rows).select("*");
    if (inserted.error) throw new Error(inserted.error.message);
    setPicked((prev) => [...prev, ...(inserted.data ?? []).map(rowToFoodItem)]);
  }

  async function rewriteWhy(item: CoachFoodItem) {
    const res = await callFn<{ why?: string | null; reason?: string }>({
      action: "draft_why",
      item_id: item.id,
    });
    if (!res.why) throw new Error(res.reason ?? "no_why");
    // La ligne est relue depuis la base: l'écriture est conditionnée
    // (`where why_source <> 'coach'`) côté serveur, donc l'écran ne doit pas
    // supposer qu'elle a eu lieu.
    const fresh = await supabase
      .from("coach_food_items")
      .select("*")
      .eq("id", item.id)
      .single();
    if (fresh.data) {
      setPicked((prev) => prev.map((p) => (p.id === item.id ? rowToFoodItem(fresh.data) : p)));
    }
  }

  // ---- la compilation, en direct ----------------------------------------
  const derived = React.useMemo(() => deriveFoodRules(picked), [picked]);

  const compiled = React.useMemo(
    () =>
      compileProtocol(
        {
          ...toProtocolInput({ stances: {}, timingRules, terms }, coachId ?? "", "en-GB"),
          foodRules: derived.rules,
        },
        null,
      ),
    [derived, timingRules, terms, coachId],
  );

  const impact = React.useMemo(
    () => publishImpact(published, compiled, activeStudents),
    [published, compiled, activeStudents],
  );

  const classes = React.useMemo(
    () => buildFoodClasses(catalog, groups, picked),
    [catalog, groups, picked],
  );

  const searching = query.trim().length > 0;
  const anyMatch = classes.some((c) => c.foods.some((f) => matchesFoodSearch(f, query)));

  const shell = {
    variant: "coach",
    // `wide` parce que l'aperçu vit À CÔTÉ de l'édition: en `narrow` la seconde
    // colonne n'a pas la place d'exister et l'aperçu retomberait sur un autre
    // écran — le coach cocherait à l'aveugle.
    width: "wide",
    title: t("coach.protocol.title"),
    subtitle: t("coach.protocol.subtitle"),
  } as const;

  if (phase === "loading") {
    return (
      <KeelAppShell {...shell}>
        <p className="p-4 text-ink-soft">…</p>
      </KeelAppShell>
    );
  }

  if (phase === "error") {
    return (
      <KeelAppShell {...shell}>
        <Card tone="warning">
          <p className="font-medium">{t("coach.protocol.load_error")}</p>
          {errorText && <p className="mt-1 text-sm text-ink-soft">{errorText}</p>}
        </Card>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell {...shell}>
      {writeError && (
        <Card tone="warning" className="mb-4">
          <p className="font-medium">{t("coach.food.write_failed")}</p>
          <p className="mt-1 text-sm text-ink-soft">{writeError}</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {/*
            ── CE QU'UN DOCUMENT A DIT, EN ATTENTE D'UN ARBITRAGE ──────────
            En haut, avant les catégories: c'est une décision à prendre, pas une
            liste à parcourir. Rangée plus bas, elle attendrait indéfiniment.

            Chaque ligne montre LA CITATION. Sans elle le coach devrait aller
            rouvrir son PDF pour trancher — donc il ne trancherait pas, et une
            liste qu'on ne tranche pas finit par être acceptée en bloc.
          */}
          {proposals.length > 0 && (
            <Card className="mb-4">
              <SectionLabel>{t("coach.food.proposals.title")}</SectionLabel>
              <p className="mt-2 text-sm text-ink-soft">
                {t("coach.food.proposals.hint", { count: String(proposals.length) })}
              </p>
              <ul className="mt-3 divide-y divide-line">
                {proposals.map((p) => (
                  <li key={p.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{p.term}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STANCE_PILL[p.stance]}`}>
                        {t(
                          STANCES.find((s) => s.value === p.stance)?.labelKey ??
                            ("coach.protocol.stance.encouraged" as MessageKey),
                        )}
                      </span>
                      <span className="text-xs text-ink-soft">{groupLabel(p.food_group_ref)}</span>
                    </div>
                    <blockquote className="mt-1 border-l-2 border-line pl-3 text-sm italic text-ink-soft">
                      {p.quote}
                    </blockquote>
                    {p.source_label && (
                      <p className="mt-1 text-xs text-ink-soft">{p.source_label}</p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await acceptProposal(p);
                            setWriteError(null);
                          } catch (e) {
                            setWriteError(e instanceof Error ? e.message : String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {t("coach.food.proposals.accept")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await dismissProposal(p);
                            setWriteError(null);
                          } catch (e) {
                            setWriteError(e instanceof Error ? e.message : String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {t("coach.food.proposals.dismiss")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-soft">
                {t("coach.food.proposals.footer")}
              </p>
            </Card>
          )}

          {/*
            ── LES LISTES DE DÉPART ────────────────────────────────────────
            127 aliments, aucun coché, et un coach qui n'a pas dix minutes:
            l'écran est juste, il est vide, donc il le reste.

            Un pack se nomme par un STYLE (« méditerranéen », « cuisine
            minimale »), jamais par un résultat (« pack perte de gras »). C'est
            la ligne exacte où KEEL deviendrait l'autorité nutritionnelle, et
            `food_packs_test.ts` la tient. Que des `encouraged`: ce qu'un coach
            garde HORS de l'assiette est bien plus personnel, et ça reste un
            geste manuel.
          */}
          {(picked.length === 0 || packsOpen) && (
            <Card className="mb-4">
              {/*
                ── DEPUIS SA MÉTHODE, AVANT LES PACKS ────────────────────────
                Un coach qui a écrit sa doctrine a DÉJÀ dit comment il nourrit
                ses élèves. Lui proposer un pack de style avant de lire ce qu'il
                a écrit, c'est lui demander de choisir un style qu'il vient de
                décrire. Les packs restent en dessous: ils servent celui qui
                n'a rien écrit — et le serveur refuse d'ailleurs proprement
                (`no_doctrine`) quand il n'y a rien à lire.
              */}
              {/* L'EMPHASE PASSE DE LA COULEUR À LA PLACE ET AU POIDS. Le cadre
                  était un gris 900 — un trait presque noir, plus fort que
                  celui de n'importe quelle carte de l'écran, pour dire « celui-ci
                  d'abord ». La charte n'a pas de neutre aussi sombre, et emprunter
                  la marque pour un CADRE la ferait sortir de son rôle (elle marque
                  la navigation et l'action). Ce panneau est déjà premier et son
                  titre est déjà le seul en gras de la carte: c'est ça qui dit
                  « d'abord ». */}
              <div className="mb-4 rounded-card border border-line-strong bg-paper-2 p-3">
                <p className="text-sm font-medium text-ink">
                  {t("coach.food.fill.title")}
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-soft">
                  {t("coach.food.fill.hint")}
                </p>
                <div className="mt-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await fillFromDoctrine();
                        setWriteError(null);
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        // `no_doctrine` n'est pas une panne: c'est un coach qui
                        // n'a rien écrit. On lui dit quoi faire au lieu de
                        // l'envoyer chercher une erreur.
                        setWriteError(
                          msg === "no_doctrine" ? t("coach.food.fill.no_doctrine") : msg,
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {t("coach.food.fill.cta")}
                  </Button>
                </div>
              </div>

              <SectionLabel>{t("coach.food.packs.title")}</SectionLabel>
              <p className="mt-2 text-sm text-ink-soft">{t("coach.food.packs.hint")}</p>
              <div className="mt-3 space-y-3">
                {FOOD_PACKS.map((pack) => {
                  const additions = packAdditions(pack, picked.map((p) => p.food_item_ref));
                  return (
                    <div key={pack.key} className="rounded-card border border-line p-3">
                      {/* LE NOM ET LA PHRASE VIENNENT DU SEED, PAS DU MODULE.
                          `FOOD_PACKS` est du code Deno partagé avec le serveur:
                          ses `label`/`blurb` servent aussi là-bas et restent en
                          anglais. Ce que le coach LIT est indexé par la clé du
                          pack — et `coachFoodPacks.int.test.ts` refuse un pack
                          dont les deux clés ne sont pas dans les deux packs de
                          langue, parce que `t()` lève sur une clé inconnue et
                          ferait tomber cette carte. */}
                      <p className="text-sm font-medium text-ink">
                        {t(`coach.food.pack.${pack.key}.label` as MessageKey)}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-soft">
                        {t(`coach.food.pack.${pack.key}.blurb` as MessageKey)}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <Button
                          size="sm"
                          disabled={busy || additions.length === 0}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await addPack(pack);
                              setWriteError(null);
                            } catch (e) {
                              setWriteError(e instanceof Error ? e.message : String(e));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {/* Le bouton annonce ce qu'il fera VRAIMENT, pas la
                              taille du pack: dire 26 et en poser 4 est un
                              bouton qui ment. */}
                          {t("coach.food.packs.add", { count: String(additions.length) })}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-ink-soft">{t("coach.food.packs.footer")}</p>
              {packsOpen && (
                <button
                  type="button"
                  onClick={() => setPacksOpen(false)}
                  className="mt-3 text-xs text-ink underline decoration-dotted underline-offset-2"
                >
                  {t("common.close")}
                </button>
              )}
            </Card>
          )}

          {picked.length > 0 && !packsOpen && (
            <button
              type="button"
              onClick={() => setPacksOpen(true)}
              className="mb-4 text-xs text-ink underline decoration-dotted underline-offset-2 hover:text-ink"
            >
              {t("coach.food.packs.reopen")}
            </button>
          )}

          {/* ── LES AXES: des QUESTIONS, jamais des réponses ──────────────── */}
          {picked.length === 0 && (
            <Card className="mb-4">
              <SectionLabel>{t("coach.protocol.axes.title")}</SectionLabel>
              <div className="mb-3 flex flex-wrap gap-2">
                {(AXES_BY_GOAL[goal] ?? []).map((axis) => (
                  <Button
                    key={axis.labelKey}
                    size="sm"
                    onClick={() =>
                      setOpenClasses((prev) => new Set([...prev, ...axis.classes]))}
                  >
                    {t(axis.labelKey)}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-ink-soft">{t("coach.protocol.axes.footer")}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {(Object.keys(AXES_BY_GOAL) as GoalToken[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGoal(g)}
                    className={`rounded-full border px-2 py-1 text-xs ${
                      g === goal
                        ? "border-fig-700 bg-fig-700 text-paper"
                        : "border-line-strong bg-paper text-ink-soft hover:bg-fig-50"
                    }`}
                  >
                    {/* `coach.goal.*` et plus `coach.protocol.goal.*`: les six
                        objectifs existaient en double, ici et dans
                        `GOAL_LABELS` (api/coachDoctrine.ts), avec des mots
                        différents pour le même jeton. Un seul préfixe désormais.
                        `coach.protocol.goal.all` / `.limit` ne bougent pas: ce
                        sont deux options de sélecteur, pas des objectifs. */}
                    {t(`coach.goal.${g}` as MessageKey)}
                  </button>
                ))}
              </div>
            </Card>
          )}

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("coach.protocol.search_placeholder")}
            className={`${inputClass} mb-4`}
            aria-label={t("coach.protocol.search_placeholder")}
          />

          {searching && !anyMatch && (
            <p className="mb-4 text-sm text-ink-soft">
              {t("coach.protocol.search_empty", { query })}
            </p>
          )}

          <p className="mb-3 text-xs text-ink-soft">{t("coach.food.pick_hint")}</p>

          {/* ── LES CATÉGORIES ────────────────────────────────────────────── */}
          <div className="space-y-3">
            {classes.map(({ className, foods, pickedCount }) => {
              const shown = foods.filter((f) => matchesFoodSearch(f, query));
              if (shown.length === 0) return null;
              // Une recherche ouvre d'office les catégories qui matchent:
              // chercher puis cliquer pour déplier serait deux gestes là où le
              // coach en a demandé un.
              const open = searching || openClasses.has(className);
              return (
                <Card key={className} padded={false}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between p-4 text-left"
                    aria-expanded={open}
                    onClick={() =>
                      setOpenClasses((prev) => {
                        const copy = new Set(prev);
                        if (copy.has(className)) copy.delete(className);
                        else copy.add(className);
                        return copy;
                      })}
                  >
                    <span className="font-medium">
                      {CLASS_LABEL[className] ? t(CLASS_LABEL[className]) : className}
                    </span>
                    <span className="flex items-center gap-2">
                      {pickedCount > 0 && <Badge tone="info">{pickedCount}</Badge>}
                      <span aria-hidden className="text-ink-soft">{open ? "−" : "+"}</span>
                    </span>
                  </button>

                  {open && (
                    <div className="px-4 pb-4">
                      <div className="flex flex-wrap gap-2">
                        {shown.map((food) => {
                          const stance = food.picked?.stance;
                          return (
                            <button
                              key={food.key}
                              type="button"
                              disabled={busy}
                              onClick={() => pickFood(food)}
                              // Au pouce: 44 px de haut minimum, la cible
                              // tactile en deçà de laquelle on rate une
                              // pastille sur deux.
                              className={`min-h-[44px] rounded-full border px-3 py-2 text-sm ${
                                stance ? STANCE_PILL[stance] : NEUTRAL_PILL
                              } ${openFood === food.key ? "ring-2 ring-fig-600" : ""}`}
                              aria-pressed={Boolean(food.picked)}
                              aria-expanded={openFood === food.key}
                            >
                              {food.label}
                              {food.catalogSlug === null && (
                                <span className="ml-1 text-[10px] uppercase tracking-wide opacity-60">
                                  {t("coach.food.custom_badge")}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <AddFoodRow
                        className={className}
                        groups={groups}
                        onAdd={addCustomFood}
                        groupLabel={groupLabel}
                      />

                      {/* LE PANNEAU — un seul ouvert à la fois. Deux panneaux
                          dépliés sur 375 px poussent les pastilles hors de
                          l'écran et le coach perd le fil de ce qu'il cochait. */}
                      {shown
                        .filter((f) => f.picked && openFood === f.key)
                        .map((f) => (
                          <FoodPanel
                            key={`panel-${f.key}`}
                            food={f}
                            item={f.picked!}
                            onPatch={patchItem}
                            onRemove={removeItem}
                            onRewrite={rewriteWhy}
                          />
                        ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {derived.conflicts.length > 0 && (
            <Card className="mt-4" tone="warning">
              <SectionLabel>{t("coach.food.conflict.title")}</SectionLabel>
              <ul className="mt-2 space-y-2 text-sm text-ink">
                {derived.conflicts.map((c) => (
                  <li key={c.food_group_ref}>
                    {t("coach.food.conflict.line", {
                      group: groupLabel(c.food_group_ref),
                      forList: c.forLabels.join(", "),
                      againstList: c.againstLabels.join(", "),
                    })}
                  </li>
                ))}
              </ul>
            </Card>
          )}

        </div>

        {/* ── L'APERÇU ─────────────────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <SectionLabel>{t("coach.protocol.preview.title")}</SectionLabel>
            {compiled.length === 0
              ? <p className="text-sm text-ink-soft">{t("coach.protocol.preview.empty")}</p>
              : (
                <ul className="space-y-2 text-sm">
                  {compiled.map((line) => {
                    const s = previewSentence(line.preview, groupLabel);
                    return (
                      <li key={line.template_commitment_key} className="text-ink">
                        {t(s.key, withSlotLabel(s.params))}
                      </li>
                    );
                  })}
                </ul>
              )}

            <div className="mt-4 border-t pt-4">
              {publishedAt
                ? (
                  <p className="mb-2 text-xs text-ink-soft">
                    {t("coach.protocol.published_at", {
                      date: formatDate(publishedAt),
                    })}
                  </p>
                )
                : (
                  <p className="mb-2 text-xs text-ink-soft">
                    {t("coach.protocol.never_published")}
                  </p>
                )}

              {impact.noop
                ? <p className="text-sm text-ink-soft">{t("coach.protocol.publish.noop")}</p>
                : confirming
                ? (
                  <div className="space-y-2">
                    <p className="text-sm text-ink">
                      {t("coach.protocol.publish.impact", {
                        added: impact.added,
                        removed: impact.removed,
                        changed: impact.changed,
                        students: impact.students,
                      })}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm">
                        {t("coach.protocol.publish.confirm")}
                      </Button>
                      <Button size="sm" onClick={() => setConfirming(false)}>
                        {t("coach.protocol.publish.cancel")}
                      </Button>
                    </div>
                  </div>
                )
                : (
                  <Button variant="primary" onClick={() => setConfirming(true)}>
                    {t("coach.protocol.publish")}
                  </Button>
                )}
            </div>
          </Card>
        </aside>
      </div>
    </KeelAppShell>
  );
}

// ---------------------------------------------------------------------------
// LE PANNEAU D'UN ALIMENT — posture, fréquence, pourquoi
// ---------------------------------------------------------------------------
// Tout y est FACULTATIF sauf la posture, et l'écran le dit. Un panneau qui a
// l'air d'un formulaire à remplir transforme 127 aliments en 127 corvées, et
// le coach s'arrête au troisième.

function FoodPanel({
  food,
  item,
  onPatch,
  onRemove,
  onRewrite,
}: {
  food: DisplayFood;
  item: CoachFoodItem;
  onPatch: (item: CoachFoodItem, patch: Record<string, unknown>) => Promise<void>;
  onRemove: (item: CoachFoodItem) => Promise<void>;
  onRewrite: (item: CoachFoodItem) => Promise<void>;
}) {
  const [why, setWhy] = React.useState(item.why ?? "");
  const [rewriting, setRewriting] = React.useState(false);
  const [whyError, setWhyError] = React.useState<string | null>(null);

  // La ligne peut changer sous nos pieds (réécriture IA): on resynchronise sur
  // l'identité de la ligne ET sur son texte, sinon le champ garderait
  // l'ancienne valeur et la prochaine frappe écraserait la nouvelle.
  React.useEffect(() => {
    setWhy(item.why ?? "");
  }, [item.id, item.why]);

  // Le « pourquoi » se sauve à la SORTIE du champ, pas à chaque frappe: un
  // update par caractère fabrique une file d'écritures dont la dernière n'est
  // pas forcément la plus récente.
  function commitWhy() {
    const next = why.trim();
    if (next === (item.why ?? "").trim()) return;
    // Toucher au texte le fait passer en `coach` — c'est ce qui verrouille
    // l'IA côté base. Effacer le champ le rend à nouveau réécrivable.
    void onPatch(item, {
      why: next || null,
      why_source: next ? "coach" : "seeded",
    });
  }

  const freq = item.frequency;

  return (
    <div className="mt-4 rounded-card border border-line-strong bg-paper-2 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-medium">{food.label}</span>
        <button
          type="button"
          className="text-xs text-ink-soft underline"
          onClick={() => void onRemove(item)}
        >
          {t("coach.food.remove")}
        </button>
      </div>

      {/* La posture — trois boutons explicites, pas un cycle. Un tap qui fait
          défiler quatre états oblige à taper trois fois pour revenir en
          arrière, et personne ne devine l'ordre. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STANCES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => void onPatch(item, { stance: s.value })}
            aria-pressed={item.stance === s.value}
            className={`min-h-[36px] rounded-full border px-3 py-1.5 text-sm ${
              item.stance === s.value ? STANCE_PILL[s.value] : NEUTRAL_PILL
            }`}
          >
            {t(s.labelKey)}
          </button>
        ))}
      </div>

      {/* La fréquence */}
      <div className="mb-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
          {t("coach.food.freq.title")}
        </p>
        {freq
          ? (
            <FrequencyEditor
              food={food}
              rule={freq}
              onChange={(next) => void onPatch(item, frequencyToRow(next))}
            />
          )
          : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-soft">{t("coach.food.freq.none")}</span>
              <Button
                size="sm"
                onClick={() =>
                  void onPatch(
                    item,
                    frequencyToRow(
                      defaultFrequency(
                        { count_axis: food.countAxis, typical_amount: food.typicalAmount },
                        item.stance,
                      ),
                    ),
                  )}
              >
                {t("coach.food.freq.set")}
              </Button>
            </div>
          )}
        <p className="mt-2 text-xs leading-5 text-ink-soft">
          {t("coach.food.freq.scope_note")}
        </p>
      </div>

      {/* Le pourquoi */}
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
          {t("coach.food.why.title")}
        </p>
        <textarea
          className={inputClass}
          rows={3}
          value={why}
          placeholder={t("coach.food.why.placeholder")}
          onChange={(e) => setWhy(e.target.value)}
          onBlur={commitWhy}
          aria-label={t("coach.food.why.title")}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {item.why_source === "seeded" && (
            <span className="text-xs text-ink-soft">{t("coach.food.why.seeded")}</span>
          )}
          {item.why_source === "ai" && (
            <span className="text-xs text-ink-soft">{t("coach.food.why.ai")}</span>
          )}
          {canRewriteWhy(item) && (
            <Button
              size="sm"
              disabled={rewriting}
              onClick={async () => {
                setRewriting(true);
                setWhyError(null);
                try {
                  await onRewrite(item);
                } catch (e) {
                  setWhyError(
                    String(e instanceof Error ? e.message : e) === "no_doctrine"
                      ? t("coach.food.why.no_doctrine")
                      : t("coach.food.why.failed"),
                  );
                } finally {
                  setRewriting(false);
                }
              }}
            >
              {rewriting ? t("coach.food.why.rewriting") : t("coach.food.why.rewrite")}
            </Button>
          )}
        </div>
        {whyError && <p className="mt-1 text-xs text-amber-800">{whyError}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L'ÉDITEUR DE FRÉQUENCE — quatre gabarits, les unités de l'ALIMENT
// ---------------------------------------------------------------------------

const FREQ_TEMPLATES: readonly {
  readonly key: FrequencyRule["template"];
  readonly labelKey: MessageKey;
}[] = [
  { key: "amount_per_period", labelKey: "coach.food.freq.tpl.amount_per_period" },
  { key: "every_meal", labelKey: "coach.food.freq.tpl.every_meal" },
  { key: "not_after", labelKey: "coach.food.freq.tpl.not_after" },
  { key: "at_slot", labelKey: "coach.food.freq.tpl.at_slot" },
];

function FrequencyEditor({
  food,
  rule,
  onChange,
}: {
  food: DisplayFood;
  rule: FrequencyRule;
  onChange: (next: FrequencyRule | null) => void;
}) {
  function switchTemplate(template: FrequencyRule["template"]) {
    if (template === rule.template) return;
    // Changer de gabarit remplace la règle ENTIÈRE. Un merge laisserait
    // traîner le trou du gabarit précédent, et la CHECK de la base refuserait
    // l'écriture — le coach perdrait son geste sans comprendre pourquoi.
    switch (template) {
      case "amount_per_period":
        onChange(
          defaultFrequency(
            { count_axis: food.countAxis, typical_amount: food.typicalAmount },
            "encouraged",
          ),
        );
        return;
      case "every_meal":
        onChange({ template });
        return;
      case "not_after":
        onChange({ template, cutoff_local: "21:00" });
        return;
      case "at_slot":
        onChange({ template, slot_key: "breakfast" });
        return;
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {FREQ_TEMPLATES.map((tpl) => (
          <button
            key={tpl.key}
            type="button"
            onClick={() => switchTemplate(tpl.key)}
            aria-pressed={rule.template === tpl.key}
            className={`rounded-full border px-2 py-1 text-xs ${
              rule.template === tpl.key
                ? "border-fig-700 bg-fig-700 text-paper"
                : "border-line-strong bg-paper text-ink-soft hover:bg-fig-50"
            }`}
          >
            {t(tpl.labelKey)}
          </button>
        ))}
      </div>

      {rule.template === "amount_per_period" && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${inputClass} w-auto`}
            value={rule.direction}
            onChange={(e) =>
              onChange({ ...rule, direction: e.target.value as "at_least" | "at_most" })}
            aria-label={t("coach.food.freq.title")}
          >
            <option value="at_least">{t("coach.food.freq.at_least")}</option>
            <option value="at_most">{t("coach.food.freq.at_most")}</option>
          </select>
          <input
            type="number"
            min={1}
            step="any"
            className={`${inputClass} w-20`}
            value={rule.amount}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) onChange({ ...rule, amount: n });
            }}
            aria-label={t("coach.food.freq.title")}
          />
          {/* L'unité de l'AXE en tête — c'est tout l'intérêt du catalogue: le
              coach qui ouvre le panneau d'une huile voit des millilitres, pas
              des « portions » à convertir dans sa tête. */}
          <select
            className={`${inputClass} w-auto`}
            value={rule.amount_unit}
            onChange={(e) =>
              onChange({
                ...rule,
                amount_unit: e.target.value as "portion" | "g" | "ml" | "unit",
              })}
            aria-label={t("coach.food.freq.title")}
          >
            {unitsForAxis(food.countAxis).map((u) => (
              <option key={u} value={u}>
                {u === "portion"
                  ? t("coach.food.freq.unit.portion.many")
                  : u === "unit"
                  ? "×"
                  : u}
              </option>
            ))}
          </select>
          <select
            className={`${inputClass} w-auto`}
            value={rule.period}
            onChange={(e) => onChange({ ...rule, period: e.target.value as "day" | "week" })}
            aria-label={t("coach.food.freq.title")}
          >
            <option value="day">{t("coach.food.freq.period.day")}</option>
            <option value="week">{t("coach.food.freq.period.week")}</option>
          </select>
        </div>
      )}

      {rule.template === "not_after" && (
        <input
          type="time"
          className={`${inputClass} w-auto`}
          value={rule.cutoff_local}
          onChange={(e) => onChange({ ...rule, cutoff_local: e.target.value })}
          aria-label={t("coach.food.freq.tpl.not_after")}
        />
      )}

      {rule.template === "at_slot" && (
        <select
          className={`${inputClass} w-auto`}
          value={rule.slot_key}
          onChange={(e) => onChange({ ...rule, slot_key: e.target.value })}
          aria-label={t("coach.food.freq.tpl.at_slot")}
        >
          {AT_SLOT_KEYS.map((key) => (
            <option key={key} value={key}>{slotLabel(key)}</option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm text-ink">
          {frequencySentence(rule, (key, params) => t(key, withSlotLabel(params)))}
        </span>
        <button
          type="button"
          className="text-xs text-ink-soft underline"
          onClick={() => onChange(null)}
        >
          {t("coach.food.freq.clear")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LE « + » — un aliment que le catalogue ne connaît pas
// ---------------------------------------------------------------------------
// Le rattachement est PROPOSÉ par le serveur et AFFICHÉ, jamais imposé en
// silence: un rattachement muet est un mensonge sur ce que Sophia vérifiera
// vraiment. Le fallback est la catégorie sous laquelle le coach a cliqué —
// c'est déjà une intention, et elle est meilleure qu'un défaut arbitraire.

function AddFoodRow({
  className,
  groups,
  onAdd,
  groupLabel,
}: {
  className: string;
  groups: readonly FoodGroupRow[];
  onAdd: (term: string, fallbackGroup: string) => Promise<void>;
  groupLabel: (slug: string) => string;
}) {
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [working, setWorking] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  const inClass = groups.filter((g) => g.class === className);
  const [group, setGroup] = React.useState(inClass[0]?.slug ?? "");

  React.useEffect(() => {
    if (!group && inClass[0]) setGroup(inClass[0].slug);
  }, [group, inClass]);

  if (!open) {
    return (
      <button
        type="button"
        className="mt-3 text-sm text-ink-soft underline"
        onClick={() => setOpen(true)}
      >
        {t("coach.food.add")}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-card border border-dashed border-line-strong p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("coach.food.add.placeholder")}
          className={`${inputClass} w-auto flex-1`}
          aria-label={t("coach.food.add")}
        />
        <select
          className={`${inputClass} w-auto`}
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          aria-label={t("coach.food.add.treated_as", { group: "" })}
        >
          {inClass.map((g) => (
            <option key={g.slug} value={g.slug}>{groupLabel(g.slug)}</option>
          ))}
        </select>
        {/* ⛔ CE BOUTON A PERDU SA FIGUE, ET C'EST LA CONTRAINTE DU KIT: une
            seule action principale par vue rendue. Cet écran en portait TROIS
            (le maximum du produit), et deux d'entre elles sont rendues en même
            temps — « Publier » en pied de page et ce « Ajouter » dès que le sas
            est ouvert. Celle qui garde la marque est « Publier »: c'est le geste
            qui atteint les élèves. Ajouter un aliment hors catalogue est une
            manœuvre locale dans un sas replié par défaut.
            (Le `primary` de « Confirmer la publication » n'en est pas un
            troisième: il REMPLACE « Publier » à l'écran, jamais à côté.) */}
        <Button
          size="sm"
          disabled={working || term.trim().length === 0}
          onClick={async () => {
            setWorking(true);
            setFailed(null);
            try {
              await onAdd(term.trim(), group);
              setTerm("");
              setOpen(false);
            } catch {
              setFailed(term.trim());
            } finally {
              setWorking(false);
            }
          }}
        >
          {working ? t("coach.food.add.thinking") : t("coach.food.add.submit")}
        </Button>
        <button
          type="button"
          className="text-xs text-ink-soft underline"
          onClick={() => {
            setOpen(false);
            setTerm("");
            setFailed(null);
          }}
        >
          {t("coach.food.add.cancel")}
        </button>
      </div>
      <p className="text-xs text-ink-soft">
        {t("coach.food.add.treated_as", { group: groupLabel(group) })}
      </p>
      {failed && (
        <p className="text-xs text-amber-800">
          {t("coach.food.add.failed", { term: failed })}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

async function callFn<T>(payload: Record<string, unknown>): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    // Le code de raison du serveur voyage jusqu'à l'écran: `no_doctrine` et
    // « ça a raté » ne veulent pas dire la même chose au coach qui lit.
    throw new Error(String(json?.reason ?? json?.error ?? `HTTP ${res.status}`));
  }
  return json as T;
}

function rowToFoodItem(row: Record<string, unknown>): CoachFoodItem {
  return {
    id: String(row.id),
    food_item_ref: (row.food_item_ref ?? null) as string | null,
    label: String(row.label),
    food_group_ref: row.food_group_ref as CoachFoodItem["food_group_ref"],
    stance: row.stance as Stance,
    frequency: frequencyFromRow(row),
    why: (row.why ?? null) as string | null,
    why_source: (row.why_source ?? "coach") as CoachFoodItem["why_source"],
  };
}

function rowToTimingRule(r: Record<string, unknown>): CoachTimingRule {
  const base = {
    food_group_ref: r.food_group_ref as CoachTimingRule["food_group_ref"],
    goal_scope: (r.goal_scope ?? []) as GoalToken[],
    rationale: (r.rationale ?? null) as string | null,
  };
  const template = r.template as CoachTimingRule["template"];
  switch (template) {
    case "portions_per_period":
      return {
        ...base,
        template,
        direction: r.direction as "at_least" | "at_most",
        portions: Number(r.portions),
        period: r.period as "day" | "week",
      };
    case "group_every_meal":
      return { ...base, template };
    case "no_group_after":
      return { ...base, template, cutoff_local: String(r.cutoff_local) };
    case "group_at_slot":
      return {
        ...base,
        template,
        slot_key: r.slot_key as Extract<
          CoachTimingRule,
          { template: "group_at_slot" }
        >["slot_key"],
      };
  }
}

export default CoachProtocolPage;
