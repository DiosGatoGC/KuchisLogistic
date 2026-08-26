import type { AuthenticatedUser } from "../modules/auth/auth.types";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      validatedBody?: unknown;
      validatedParams?: unknown;
      validatedQuery?: unknown;
    }
  }
}

export {};
