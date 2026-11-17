import type { Logger, System } from "../../app/ports";

export const realSystem: System = { now: () => Date.now(), random: () => Math.random() };

/** A controllable clock and deterministic randomness, for tests. */
export function fakeSystem(start = Date.UTC(2026, 10, 16, 12)) {
  let now = start;
  return {
    now: () => now,
    random: () => 0,
    advance(ms: number) {
      now += ms;
    },
  };
}

export function consoleLogger(): Logger {
  const line = (level: string, event: string, fields?: Record<string, unknown>) => {
    const time = new Date().toISOString().slice(11, 19);
    const extra = fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : "";
    return `${time} ${level} ${event}${extra}`;
  };
  return {
    info: (event, fields) => console.log(line("info ", event, fields)),
    warn: (event, fields) => console.warn(line("warn ", event, fields)),
    error: (event, fields) => console.error(line("error", event, fields)),
  };
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
