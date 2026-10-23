// Lets the lesson screen tell the feed to move on after DONE/Skip there.
let pending: string | null = null;

export function requestAdvance(cardId: string) {
  pending = cardId;
}

export function takeAdvance(): string | null {
  const id = pending;
  pending = null;
  return id;
}
