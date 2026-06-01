import type { MissionCompletionPayload } from '../../services/missionsApi';

export interface GameProps {
  metadata: Record<string, unknown>;
  points: number;
  /** Child age if known (drives smart difficulty); null when unknown. */
  age: number | null;
  /** Called once with the completion payload to score the mission. */
  onComplete: (payload: MissionCompletionPayload) => void;
  /** Called when the child quits without finishing (triggers escape penalty). */
  onQuit: () => void;
}
