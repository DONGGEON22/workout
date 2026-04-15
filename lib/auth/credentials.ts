import { z } from "zod";

/** 표시 이름: 2글자 이상 (가입·로그인 동일 규칙) */
export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "이름은 2글자 이상 입력해 주세요.")
  .max(32, "이름은 32글자까지 가능합니다.");

/** 간편 비밀번호: 숫자 4자리 */
export const pinSchema = z
  .string()
  .regex(/^\d{4}$/, "비밀번호는 숫자 4자리여야 합니다.");

export const registerBodySchema = z.object({
  displayName: displayNameSchema,
  password: pinSchema,
});

export const loginBodySchema = z.object({
  displayName: displayNameSchema,
  password: pinSchema,
});

export function formatZodFieldErrors(err: z.ZodError): string {
  const f = err.flatten().fieldErrors;
  const first = Object.values(f).flat()[0];
  return typeof first === "string" ? first : "입력을 확인해 주세요.";
}
