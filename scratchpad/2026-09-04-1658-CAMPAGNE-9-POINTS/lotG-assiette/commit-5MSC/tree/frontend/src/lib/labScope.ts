export type LabScopeInput =
  | {
      kind: "transformation";
      cycleId: string;
      transformationId: string;
    }
  | {
      kind: "out_of_plan";
      cycleId: string;
    }
  | null;
