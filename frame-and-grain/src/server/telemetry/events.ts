// ============================================================================
// FRAME & GRAIN — TELEMETRY & BEHAVIOURAL EVENTS MODEL
// Data layer schemas for anonymous user interaction and personalization
// ============================================================================

import { EventType, TelemetryEvent } from '@/types/index';

export function createTelemetryEvent(
  sessionId: string,
  type: EventType,
  titleKey?: string,
  metadata?: Record<string, unknown>
): TelemetryEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    sessionId,
    type,
    timestamp: Date.now(),
    titleKey,
    metadata
  };
}
