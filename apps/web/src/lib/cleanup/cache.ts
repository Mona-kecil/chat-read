import { createHash } from "node:crypto";

type CachePhase = "classify" | "clean" | "segment";

const store = new Map<string, unknown>();

export const buildCacheKey = ({
  model,
  phase,
  promptVersion,
  payload,
}: {
  model: string;
  phase: CachePhase;
  promptVersion: string;
  payload: string;
}): string => {
  const hash = createHash("sha256")
    .update(`${model}\n${phase}\n${promptVersion}\n${payload}`)
    .digest("hex");
  return `${phase}:${hash}`;
};

export const getCached = <T>(key: string): T | undefined => {
  const value = store.get(key);
  return value as T | undefined;
};

export const setCached = <T>(key: string, value: T): void => {
  store.set(key, value);
};
