export function getEnv(key: string): string | undefined;

export function getEnv<T extends string[]>(keys: [...T]): { [K in T[number]]: string | undefined };

export function getEnv(keyOrKeys: string | string[]) {
  if (Array.isArray(keyOrKeys)) {
    return keyOrKeys.reduce(
      (acc, key) => {
        acc[key] = process.env[key];
        return acc;
      },
      {} as Record<string, string | undefined>,
    );
  }
  return process.env[keyOrKeys];
}
