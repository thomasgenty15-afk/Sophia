import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "../lib/supabase";
import { getBaseDeViePayload } from "../lib/baseDeVie";
import type {
  UserAttackCardRow,
  UserDefenseCardRow,
  UserInspirationItemRow,
  UserPotionSessionRow,
  UserSupportCardRow,
  UserTransformationBaseDeViePayload,
  UserTransformationRow,
} from "../types/v2";

export type BaseDeVieArsenalItemKind =
  | "defense_card"
  | "attack_card"
  | "support_card"
  | "potion"
  | "inspiration";

export type BaseDeVieArsenalItem = {
  id: string;
  transformationId: string;
  kind: BaseDeVieArsenalItemKind;
  title: string;
  subtitle: string | null;
  preview: string;
  detail: string;
  generatedAt: string;
};

export type BaseDeVieTransformationRecord = {
  transformation: UserTransformationRow;
  payload: UserTransformationBaseDeViePayload | null;
  arsenal: BaseDeVieArsenalItem[];
};

function toDefenseItem(card: UserDefenseCardRow): BaseDeVieArsenalItem | null {
  if (!card.transformation_id) return null;
  const impulseLabels = card.content.impulses.map((impulse) => impulse.label).filter(Boolean);
  const preview = impulseLabels.length > 0
    ? impulseLabels.slice(0, 2).join(" • ")
    : "Carte de défense préparée dans cette transformation.";
  const detail = card.content.impulses.length > 0
    ? card.content.impulses.map((impulse) =>
      `${impulse.label}\n${impulse.generic_defense}`
    ).join("\n\n")
    : preview;

  return {
    id: card.id,
    transformationId: card.transformation_id,
    kind: "defense_card",
    title: "Carte de défense",
    subtitle: impulseLabels[0] ?? null,
    preview,
    detail,
    generatedAt: card.generated_at,
  };
}

function toAttackItem(card: UserAttackCardRow): BaseDeVieArsenalItem | null {
  if (!card.transformation_id) return null;
  const techniqueTitles = card.content.techniques
    .map((technique) => technique.title)
    .filter(Boolean)
    .slice(0, 3);

  return {
    id: card.id,
    transformationId: card.transformation_id,
    kind: "attack_card",
    title: "Carte d'attaque",
    subtitle: techniqueTitles[0] ?? null,
    preview: card.content.summary || "Carte d'attaque générée dans cette transformation.",
    detail: [
      card.content.summary,
      techniqueTitles.length > 0 ? `Techniques: ${techniqueTitles.join(", ")}` : "",
    ].filter(Boolean).join("\n\n"),
    generatedAt: card.generated_at,
  };
}

function toSupportItem(card: UserSupportCardRow): BaseDeVieArsenalItem | null {
  if (!card.transformation_id) return null;
  return {
    id: card.id,
    transformationId: card.transformation_id,
    kind: "support_card",
    title: "Carte d'appui",
    subtitle: card.content.support_goal || null,
    preview: card.content.reminder || card.content.support_goal || "Carte d'appui générée.",
    detail: [
      card.content.support_goal,
      card.content.reminder,
      card.content.moments.length > 0 ? `Moments: ${card.content.moments.join(", ")}` : "",
    ].filter(Boolean).join("\n\n"),
    generatedAt: card.generated_at,
  };
}

function toPotionItem(session: UserPotionSessionRow): BaseDeVieArsenalItem | null {
  if (!session.transformation_id) return null;
  return {
    id: session.id,
    transformationId: session.transformation_id,
    kind: "potion",
    title: session.content.potion_name || "Potion",
    subtitle: session.potion_type,
    preview: session.content.instant_response || "Potion activée dans cette transformation.",
    detail: [
      session.content.instant_response,
      session.content.suggested_next_step,
    ].filter(Boolean).join("\n\n"),
    generatedAt: session.generated_at,
  };
}

function toInspirationItem(item: UserInspirationItemRow): BaseDeVieArsenalItem | null {
  if (!item.transformation_id) return null;
  return {
    id: item.id,
    transformationId: item.transformation_id,
    kind: "inspiration",
    title: item.title,
    subtitle: item.angle,
    preview: item.body,
    detail: item.body,
    generatedAt: item.generated_at,
  };
}

function sortByGeneratedAtDesc(left: BaseDeVieArsenalItem, right: BaseDeVieArsenalItem) {
  return right.generatedAt.localeCompare(left.generatedAt);
}

export function useBaseDeVie(
  cycleId: string | null,
  transformations: UserTransformationRow[],
) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<BaseDeVieTransformationRecord[]>([]);

  const completedTransformations = useMemo(
    () => transformations
      .filter((transformation) => transformation.status === "completed")
      .sort((left, right) =>
        (right.completed_at ?? right.updated_at).localeCompare(left.completed_at ?? left.updated_at)
      ),
    [transformations],
  );

  const refresh = useCallback(async () => {
    if (!cycleId) {
      setRecords([]);
      setLoading(false);
      return;
    }

    if (completedTransformations.length === 0) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const transformationIds = completedTransformations.map((item) => item.id);
      const [
        defenseResult,
        attackResult,
        supportResult,
        potionResult,
        inspirationResult,
      ] = await Promise.all([
        supabase
          .from("user_defense_cards")
          .select("*")
          .eq("cycle_id", cycleId)
          .eq("scope_kind", "transformation")
          .in("transformation_id", transformationIds),
        supabase
          .from("user_attack_cards")
          .select("*")
          .eq("cycle_id", cycleId)
          .eq("scope_kind", "transformation")
          .in("transformation_id", transformationIds),
        supabase
          .from("user_support_cards")
          .select("*")
          .eq("cycle_id", cycleId)
          .eq("scope_kind", "transformation")
          .in("transformation_id", transformationIds),
        supabase
          .from("user_potion_sessions")
          .select("*")
          .eq("cycle_id", cycleId)
          .eq("scope_kind", "transformation")
          .eq("status", "completed")
          .in("transformation_id", transformationIds),
        supabase
          .from("user_inspiration_items")
          .select("*")
          .eq("cycle_id", cycleId)
          .eq("scope_kind", "transformation")
          .in("status", ["suggested", "active"])
          .in("transformation_id", transformationIds),
      ]);

      if (defenseResult.error) throw defenseResult.error;
      if (attackResult.error) throw attackResult.error;
      if (supportResult.error) throw supportResult.error;
      if (potionResult.error) throw potionResult.error;
      if (inspirationResult.error) throw inspirationResult.error;

      const arsenalByTransformation = new Map<string, BaseDeVieArsenalItem[]>();
      const appendItem = (item: BaseDeVieArsenalItem | null) => {
        if (!item) return;
        const group = arsenalByTransformation.get(item.transformationId) ?? [];
        group.push(item);
        arsenalByTransformation.set(item.transformationId, group);
      };

      ((defenseResult.data as UserDefenseCardRow[] | null) ?? []).forEach((card) =>
        appendItem(toDefenseItem(card))
      );
      ((attackResult.data as UserAttackCardRow[] | null) ?? []).forEach((card) =>
        appendItem(toAttackItem(card))
      );
      ((supportResult.data as UserSupportCardRow[] | null) ?? []).forEach((card) =>
        appendItem(toSupportItem(card))
      );
      ((potionResult.data as UserPotionSessionRow[] | null) ?? []).forEach((session) =>
        appendItem(toPotionItem(session))
      );
      ((inspirationResult.data as UserInspirationItemRow[] | null) ?? []).forEach((item) =>
        appendItem(toInspirationItem(item))
      );

      setRecords(
        completedTransformations.map((transformation) => ({
          transformation,
          payload: getBaseDeViePayload(transformation.base_de_vie_payload),
          arsenal: (arsenalByTransformation.get(transformation.id) ?? []).sort(sortByGeneratedAtDesc),
        })),
      );
    } catch (error) {
      console.error("[useBaseDeVie] refresh failed", error);
      setRecords(
        completedTransformations.map((transformation) => ({
          transformation,
          payload: getBaseDeViePayload(transformation.base_de_vie_payload),
          arsenal: [],
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [completedTransformations, cycleId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    loading,
    records,
    refresh,
  };
}
