import type { Card, CardKind } from './types';

// "Discuss in Claude": opens the Claude app on a card, through the Endgame connector.

/**
 * Optional: a Claude project per course (claude.ai/project/…), each with the Endgame
 * connector on and the instructions from README. Without one, a new chat opens instead.
 */
export const CLAUDE_PROJECTS: Partial<Record<CardKind, string>> = {};

/** Starts with the card title so Claude names the chat after it. */
export const discussPrompt = (card: Pick<Card, 'id' | 'title'>) =>
  `Endgame · ${card.title}\n\nOpen Endgame card ${card.id} with the Endgame connector and let's discuss it.`;

/**
 * A project link can't carry a prompt, so the prompt is copied for pasting there;
 * a new chat gets it filled in.
 */
export function discussLink(card: Pick<Card, 'id' | 'title' | 'kind'>, projects = CLAUDE_PROJECTS): { url: string; copy?: string } {
  const prompt = discussPrompt(card);
  const project = projects[card.kind];
  return project ? { url: project, copy: prompt } : { url: `https://claude.ai/new?q=${encodeURIComponent(prompt)}` };
}
