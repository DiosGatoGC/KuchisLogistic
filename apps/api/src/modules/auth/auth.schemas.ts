import { z } from "zod";

export const loginSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(60)
      .regex(
        /^[a-z0-9._-]+$/,
        "Solo se permiten letras, números, punto, guion y guion bajo."
      ),
    password: z.string().min(1).max(4_096),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
