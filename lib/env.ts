import { z } from "zod";

export function cleanEnvString(s: string | undefined): string {
  if (s === undefined) return "";
  let t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

const serverSchema = z.object({
  SESSION_SECRET: z.string(),
  CRON_SECRET: z.string().optional(),
});

export type ServerEnv = {
  SESSION_SECRET: string;
  CRON_SECRET?: string;
};

export function getServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse({
    SESSION_SECRET: process.env.SESSION_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  });

  if (!parsed.success) {
    throw new Error(
      `환경 변수: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }

  const session = cleanEnvString(parsed.data.SESSION_SECRET);
  if (session.length < 16) {
    throw new Error("SESSION_SECRET은 16자 이상으로 설정해 주세요.");
  }

  const cronRaw = cleanEnvString(parsed.data.CRON_SECRET);
  let cron: string | undefined;
  if (cronRaw.length > 0 && cronRaw.length < 8) {
    throw new Error("CRON_SECRET은 8자 이상이거나 비워 두세요.");
  }
  if (cronRaw.length >= 8) cron = cronRaw;

  return { SESSION_SECRET: session, CRON_SECRET: cron };
}
