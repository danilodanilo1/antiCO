type LogLevel = "info" | "warn" | "error" | "debug";

function format(level: LogLevel, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  info: (message: string) => console.log(format("info", message)),
  warn: (message: string) => console.warn(format("warn", message)),
  error: (message: string) => console.error(format("error", message)),
  debug: (message: string) => {
    if (process.env.DEBUG) console.debug(format("debug", message));
  },
};
