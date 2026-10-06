import * as Sentry from "@sentry/nextjs";

type LogData = Record<string, unknown> | undefined;

export const logger = {
  info: (event: string, data?: LogData) => {
    console.log(JSON.stringify({ level: "info", event, ...data, ts: new Date().toISOString() }));
  },
  warn: (event: string, data?: LogData) => {
    console.warn(JSON.stringify({ level: "warn", event, ...data, ts: new Date().toISOString() }));
  },
  error: (event: string, data?: LogData) => {
    console.error(JSON.stringify({ level: "error", event, ...data, ts: new Date().toISOString() }));
    // Routes catch their errors and return 500, so onRequestError never sees
    // them; forward logged errors explicitly. No-op when Sentry has no DSN.
    Sentry.captureMessage(event, { level: "error", extra: data });
  },
};
