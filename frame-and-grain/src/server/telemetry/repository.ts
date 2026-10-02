// ============================================================================
// FRAME & GRAIN — TELEMETRY REPOSITORY
// Persistence abstraction for telemetry events with in-memory storage
// ============================================================================

import { TelemetryEvent, EventType } from '@/types/index';

export interface ITelemetryRepository {
  recordEvent(event: TelemetryEvent): Promise<void>;
  getEventsBySession(sessionId: string): Promise<TelemetryEvent[]>;
  getEventsByType(sessionId: string, type: EventType): Promise<TelemetryEvent[]>;
  clearSession(sessionId: string): Promise<void>;
}

export class MemoryTelemetryRepository implements ITelemetryRepository {
  private events: TelemetryEvent[] = [];

  public async recordEvent(event: TelemetryEvent): Promise<void> {
    this.events.push(event);
  }

  public async getEventsBySession(sessionId: string): Promise<TelemetryEvent[]> {
    return this.events.filter((e) => e.sessionId === sessionId);
  }

  public async getEventsByType(sessionId: string, type: EventType): Promise<TelemetryEvent[]> {
    return this.events.filter((e) => e.sessionId === sessionId && e.type === type);
  }

  public async clearSession(sessionId: string): Promise<void> {
    this.events = this.events.filter((e) => e.sessionId !== sessionId);
  }
}
