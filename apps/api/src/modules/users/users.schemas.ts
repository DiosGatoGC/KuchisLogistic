import { z } from "zod";

const userRoleSchema = z.enum([
  "ADMIN",
  "MANAGER",
  "WAITER",
  "CASHIER",
  "KITCHEN",
]);

const fullNameSchema = z.string().trim().min(1).max(120);
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(60)
  .regex(
    /^[a-z0-9._-]+$/,
    "Solo se permiten letras, números, punto, guion y guion bajo."
  );
const passwordSchema = z.string().min(8).max(72);

export const userIdParamsSchema = z.object({ id: z.uuid() }).strict();

export const listUsersQuerySchema = z
  .object({ status: z.enum(["active", "inactive"]).optional() })
  .strict();

export const createUserSchema = z
  .object({
    fullName: fullNameSchema,
    username: usernameSchema,
    password: passwordSchema,
    role: userRoleSchema,
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateUserSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    username: usernameSchema.optional(),
    role: userRoleSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debes enviar al menos un campo para actualizar.",
  });

export const resetPasswordSchema = z
  .object({ newPassword: passwordSchema })
  .strict();

export type UserIdParams = z.infer<typeof userIdParamsSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserBody = z.infer<typeof createUserSchema>;
export type UpdateUserBody = z.infer<typeof updateUserSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
