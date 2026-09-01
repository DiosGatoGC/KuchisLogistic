export type SafeLogValue = string | number | boolean | null | undefined;
export type SafeLogRecord = Record<string, SafeLogValue>;

export interface ApiLogger {
  info(record: SafeLogRecord): void;
  error(record: SafeLogRecord): void;
}

function serialize(record: SafeLogRecord) {
  return JSON.stringify(record);
}

export const jsonConsoleLogger: ApiLogger = {
  info(record) {
    console.info(serialize(record));
  },
  error(record) {
    console.error(serialize(record));
  },
};

export const silentLogger: ApiLogger = {
  info() {},
  error() {},
};

export function safeErrorType(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : "Error";
}
