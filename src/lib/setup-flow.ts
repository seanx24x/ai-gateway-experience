import type { SetupIntent } from './setup';

export type SetupStage = 'intent' | 'integration' | 'environment' | 'editor' | 'review';
export type SetupEditor = 'cursor' | 'vscode';
export interface SetupFeedback<T> { signature: string; prompt?: string; value: T }

/** A delayed clipboard/download result belongs to the context that requested it. */
export function currentSetupFeedback<T>(feedback: SetupFeedback<T> | null, signature: string, prompt?: string): T | null {
  return feedback?.signature === signature && feedback.prompt === prompt ? feedback.value : null;
}

/** Every intent has a review boundary; an agent never inherits app questions. */
export function setupStages(intent: SetupIntent): SetupStage[] {
  return intent === 'agent'
    ? ['intent', 'editor', 'review']
    : ['intent', 'integration', 'environment', 'editor', 'review'];
}

export function nextSetupStage(intent: SetupIntent, stage: SetupStage): SetupStage {
  if (intent === 'new' && stage === 'intent') return 'environment';
  const stages = setupStages(intent);
  const index = stages.indexOf(stage);
  return index < 0 ? 'editor' : stages[Math.min(index + 1, stages.length - 1)];
}

/** Props may hydrate after presentation state; never render an incompatible question. */
export function currentSetupStage(intent: SetupIntent, stage: SetupStage): SetupStage {
  return setupStages(intent).includes(stage) ? stage : 'editor';
}

/** Only presentation state is saved here. App choices remain in the shared domain. */
export function restoreSetupFlow(value: unknown, intent: SetupIntent): { stage: SetupStage; editor: SetupEditor } {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const stage = setupStages(intent).includes(saved.stage as SetupStage) ? saved.stage as SetupStage : 'intent';
  return { stage, editor: saved.editor === 'vscode' ? 'vscode' : 'cursor' };
}
