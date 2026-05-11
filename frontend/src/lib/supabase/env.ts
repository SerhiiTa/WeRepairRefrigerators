export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

const REQUIRED_PUBLIC_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const warnedContexts = new Set<string>();

function readPublicEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "",
  };
}

export function getMissingSupabaseEnvVars(): string[] {
  const env = readPublicEnv();

  return REQUIRED_PUBLIC_ENV_VARS.filter((key) => {
    if (key === "NEXT_PUBLIC_SUPABASE_URL") {
      return env.url.length === 0;
    }

    return env.anonKey.length === 0;
  });
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const env = readPublicEnv();

  if (!env.url || !env.anonKey) {
    return null;
  }

  return {
    url: env.url,
    anonKey: env.anonKey,
  };
}

export function hasSupabasePublicConfig(): boolean {
  return getSupabasePublicConfig() !== null;
}

export function warnIfSupabaseEnvMissing(context: string): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const missingVars = getMissingSupabaseEnvVars();

  if (missingVars.length === 0) {
    return;
  }

  const warningKey = `${context}:${missingVars.join(",")}`;

  if (warnedContexts.has(warningKey)) {
    return;
  }

  warnedContexts.add(warningKey);
  console.warn(
    `[Supabase] ${context} is not configured. Missing ${missingVars.join(
      ", ",
    )}. The app will continue using mock data until Supabase env vars are set.`,
  );
}
