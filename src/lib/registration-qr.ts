export const REGISTRATION_QR_PREFIX = "NUTPOS-REG|v1|";
export const REGISTRATION_QR_WINDOW_SECONDS = 60;

export function getRegistrationQrSlot(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / REGISTRATION_QR_WINDOW_SECONDS);
}

export function buildRegistrationQrPayload(slot = getRegistrationQrSlot()): string {
  return `${REGISTRATION_QR_PREFIX}${slot}`;
}

export function parseRegistrationQrPayload(payload: string): number | null {
  const normalized = payload.trim();
  if (!normalized.startsWith(REGISTRATION_QR_PREFIX)) return null;

  const slotRaw = normalized.slice(REGISTRATION_QR_PREFIX.length);
  if (!/^\d+$/.test(slotRaw)) return null;

  const slot = Number(slotRaw);
  if (!Number.isFinite(slot) || slot <= 0) return null;

  return slot;
}

export function getRegistrationQrSecondsRemaining(nowMs = Date.now()): number {
  const elapsedInWindow = Math.floor(nowMs / 1000) % REGISTRATION_QR_WINDOW_SECONDS;
  return REGISTRATION_QR_WINDOW_SECONDS - elapsedInWindow;
}

export function isValidRegistrationQrPayload(payload: string): boolean {
  return parseRegistrationQrPayload(payload) !== null;
}
