/** Versioned ranking policy. Defaults intentionally preserve Graft 0.18.0. */
export interface RankingPolicyV1 {
  version: 1;
  graphWeight: number;
  graphRescueFloor: number;
  scopeParticipationRatio: number;
  workspaceStrongFloor: number;
  workspaceHighFloor: number;
  workspaceRrfK: number;
}

export const DEFAULT_RANKING_POLICY: Readonly<RankingPolicyV1> = Object.freeze({
  version: 1,
  graphWeight: 0.5,
  graphRescueFloor: 0.15,
  scopeParticipationRatio: 0.25,
  workspaceStrongFloor: 0.1,
  workspaceHighFloor: 0.5,
  workspaceRrfK: 60,
});

export const RANKING_POLICY_ID = "graft-ranking-v1";