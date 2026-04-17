const UNIVERSAL_PHASE_OFFSET = 1;

export function getDisplayPhaseOrder(phaseOrder: number): number {
  return phaseOrder + UNIVERSAL_PHASE_OFFSET;
}

export function getDisplayTotalPhases(phaseCount: number): number {
  return phaseCount > 0 ? phaseCount + UNIVERSAL_PHASE_OFFSET : 0;
}
