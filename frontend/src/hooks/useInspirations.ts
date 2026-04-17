import { useCallback, useEffect, useState } from "react";

import type { LabScopeInput } from "../lib/labScope";
import { supabase } from "../lib/supabase";
import type { UserInspirationItemRow } from "../types/v2";

export type UseInspirationsResult = {
  loading: boolean;
  generating: boolean;
  items: UserInspirationItemRow[];
  generate: () => Promise<void>;
  refresh: () => Promise<void>;
};

function applyScopeFilter<TQuery extends {
  eq: (column: string, value: unknown) => TQuery;
  is: (column: string, value: null) => TQuery;
}>(query: TQuery, scope: Exclude<LabScopeInput, null>) {
  const base = query
    .eq("cycle_id", scope.cycleId)
    .eq("scope_kind", scope.kind);
  return scope.kind === "transformation"
    ? base.eq("transformation_id", scope.transformationId)
    : base.is("transformation_id", null);
}

export function useInspirations(scope: LabScopeInput): UseInspirationsResult {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [items, setItems] = useState<UserInspirationItemRow[]>([]);

  const refresh = useCallback(async () => {
    if (!scope) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await applyScopeFilter(
        supabase
          .from("user_inspiration_items")
          .select("*")
          .in("status", ["suggested", "active"]),
        scope,
      ).order("generated_at", { ascending: false });

      if (error) throw error;
      setItems((data as UserInspirationItemRow[] | null) ?? []);
    } catch (error) {
      console.error("[useInspirations] refresh failed:", error);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = useCallback(async () => {
    if (!scope || generating) return;
    setGenerating(true);
    try {
      const { error } = await supabase.functions.invoke("generate-inspiration-v1", {
        body: {
          scope_kind: scope.kind,
          transformation_id:
            scope.kind === "transformation" ? scope.transformationId : undefined,
        },
      });
      if (error) throw error;
      await refresh();
    } catch (error) {
      console.error("[useInspirations] generate failed:", error);
    } finally {
      setGenerating(false);
    }
  }, [scope, generating, refresh]);

  return {
    loading,
    generating,
    items,
    generate,
    refresh,
  };
}
