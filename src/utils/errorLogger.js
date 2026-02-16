/**
 * errorLogger.js
 * Stores transfer errors, warnings, and system events for the
 * Osher AI admin dashboard. In-memory with 500-event circular buffer.
 * Nothing technical is ever sent to end users.
 */

const MAX_EVENTS = 500;
const events     = [];

const LEVELS = { error: "error", warn: "warn", info: "info", transfer: "transfer" };

function log(level, source, message, details = {}) {
  const event = {
    id:        Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    details,
  };
  events.unshift(event); // newest first
  if (events.length > MAX_EVENTS) events.pop();

  // Still log to Render console for full details
  const prefix = `[${level.toUpperCase()}][${source}]`;
  if (level === "error") console.error(prefix, message, details);
  else console.log(prefix, message);

  return event;
}

module.exports = {
  error:    (source, message, details)  => log(LEVELS.error,    source, message, details),
  warn:     (source, message, details)  => log(LEVELS.warn,     source, message, details),
  info:     (source, message, details)  => log(LEVELS.info,     source, message, details),
  transfer: (source, message, details)  => log(LEVELS.transfer, source, message, details),
  getEvents: (limit = 100, level = null) => {
    const filtered = level ? events.filter(e => e.level === level) : events;
    return filtered.slice(0, limit);
  },
  getStats: () => ({
    total:     events.length,
    errors:    events.filter(e => e.level === "error").length,
    warnings:  events.filter(e => e.level === "warn").length,
    transfers: events.filter(e => e.level === "transfer").length,
    since:     events.length ? events[events.length - 1].timestamp : null,
  }),
  clear: () => { events.length = 0; },
};
