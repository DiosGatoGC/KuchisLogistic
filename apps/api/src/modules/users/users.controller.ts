import type { RequestHandler } from "express";
import { sendSuccess } from "../../http/responses";
import type {
  CreateUserBody,
  ListUsersQuery,
  ResetPasswordBody,
  UpdateUserBody,
  UserIdParams,
} from "./users.schemas";
import { usersService } from "./users.service";

export const listUsers: RequestHandler = async (req, res, next) => {
  try {
    const { status } = req.validatedQuery as ListUsersQuery;
    sendSuccess(res, { users: await usersService.list(status) });
  } catch (error) {
    next(error);
  }
};

export const getUser: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.validatedParams as UserIdParams;
    sendSuccess(res, { user: await usersService.getById(id) });
  } catch (error) {
    next(error);
  }
};

export const createUser: RequestHandler = async (req, res, next) => {
  try {
    const user = await usersService.create(req.validatedBody as CreateUserBody);
    sendSuccess(res, { user }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateUser: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.validatedParams as UserIdParams;
    const user = await usersService.update(
      id,
      req.validatedBody as UpdateUserBody
    );
    sendSuccess(res, { user });
  } catch (error) {
    next(error);
  }
};

function setUserActive(isActive: boolean): RequestHandler {
  return async (req, res, next) => {
    try {
      const { id } = req.validatedParams as UserIdParams;
      const user = await usersService.setActive(id, isActive);
      sendSuccess(res, { user });
    } catch (error) {
      next(error);
    }
  };
}

export const activateUser = setUserActive(true);
export const deactivateUser = setUserActive(false);

export const resetUserPassword: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.validatedParams as UserIdParams;
    const { newPassword } = req.validatedBody as ResetPasswordBody;
    await usersService.resetPassword(id, newPassword);
    sendSuccess(res, { success: true });
  } catch (error) {
    next(error);
  }
};
