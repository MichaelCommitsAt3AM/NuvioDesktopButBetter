import { createContext, useContext } from 'react';

export const ReadOnlyReasonContext = createContext<string | null>(null);
export const useReadOnlyReason = () => useContext(ReadOnlyReasonContext);
export function matchesReadOnlyReason(message: string, reason: string | null) {
  return reason !== null && message.replace(/^BridgeError:\s*/, '').trim() === reason;
}
