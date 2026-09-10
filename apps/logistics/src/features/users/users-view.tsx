"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { OperationalDialog } from "@/components/ui/operational-dialog";
import { SelectField } from "@/components/ui/select-field";
import { Surface } from "@/components/ui/surface";
import { useAuth } from "@/features/auth/auth-context";
import { ApiError } from "@/lib/api/client";

import { formatOperationalDate } from "../shifts/shift-formatters";
import {
  createManagedUser,
  getManagedUser,
  getManagedUsers,
  resetManagedUserPassword,
  setManagedUserActive,
  updateManagedUser,
} from "./users-api";
import { executePasswordReset, executeUserMutation } from "./users-attempts";
import { userFailureKind, usersErrorMessage } from "./users-errors";
import {
  MANAGED_USER_ROLE_LABELS,
  USER_ROLES,
  isCurrentManagedUser,
  normalizeManagedUsers,
  reconcileCreatedUser,
  runWithUserLock,
  selfAccountFollowUp,
  userActivationIsApplied,
  userUpdateIsApplied,
  validateCreateUser,
  validatePasswordReset,
  validateUpdateUser,
} from "./users-model";
import type { ManagedUser, UserStatusFilter } from "./users-types";
import type { UserRole } from "@/types/auth";

const initialCreateForm = {
  fullName: "",
  username: "",
  password: "",
  role: "WAITER" as UserRole,
  isActive: true,
};
const userRoleOptions = USER_ROLES.map((role) => ({ value: role, label: MANAGED_USER_ROLE_LABELS[role] }));

type UserDialog =
  | { kind: "edit"; user: ManagedUser }
  | { kind: "status"; user: ManagedUser }
  | { kind: "password"; user: ManagedUser }
  | null;

export function UsersView() {
  const { user: currentUser, getAccessToken, logout } = useAuth();
  const [filter, setFilter] = useState<UserStatusFilter>("all");
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<UserDialog>(null);
  const [editForm, setEditForm] = useState({ fullName: "", username: "", role: "WAITER" as UserRole });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [blockedKeys, setBlockedKeys] = useState<Set<string>>(() => new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestRef = useRef(0);
  const locksRef = useRef(new Set<string>());

  const handleAuthError = useCallback(async (error: unknown) => {
    if (error instanceof ApiError && (error.kind === "unauthorized" || error.code === "ACCOUNT_INACTIVE")) {
      await logout();
      return true;
    }
    return false;
  }, [logout]);

  const loadUsers = useCallback(async (requestedFilter: UserStatusFilter, clearBlocked = true) => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const accessToken = await getAccessToken();
      const result = normalizeManagedUsers(await getManagedUsers(requestedFilter, accessToken));
      if (requestId !== requestRef.current) return null;
      setUsers(result.users);
      if (clearBlocked) setBlockedKeys(new Set());
      return result.users;
    } catch (error) {
      if (requestId !== requestRef.current) return null;
      if (await handleAuthError(error)) return null;
      setErrorMessage(error instanceof ApiError ? usersErrorMessage(error, "No pudimos consultar los usuarios.") : "No pudimos consultar los usuarios.");
      return null;
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  }, [getAccessToken, handleAuthError]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadUsers(filter), 0);
    return () => window.clearTimeout(initialLoad);
  }, [filter, loadUsers]);

  const block = (key: string) => setBlockedKeys((previous) => new Set(previous).add(key));
  const closeDialog = () => {
    if (busyKey) return;
    setDialog(null);
    setEditErrors({});
    setNewPassword("");
    setConfirmPassword("");
    setPasswordErrors({});
  };

  const openEdit = (managedUser: ManagedUser) => {
    setEditForm({ fullName: managedUser.fullName, username: managedUser.username, role: managedUser.role });
    setEditErrors({});
    setDialog({ kind: "edit", user: managedUser });
  };

  const handleCreate = async () => {
    if (blockedKeys.has("create")) return;
    const validation = validateCreateUser(createForm);
    setCreateErrors(validation.errors);
    if (!validation.payload) return;
    const payload = validation.payload;
    await runWithUserLock(locksRef.current, "create", async () => {
      setBusyKey("create");
      setNotice(null);
      setErrorMessage(null);
      try {
        const accessToken = await getAccessToken();
        const result = await executeUserMutation({
          mutate: () => createManagedUser(payload, accessToken),
          refetch: () => getManagedUsers("all", accessToken),
          classifyFailure: userFailureKind,
        });
        if (result.kind === "confirmed-refetch-failed" || result.kind === "unresolved") {
          block("create");
          setErrorMessage("La creación no pudo verificarse. Actualiza la lista antes de decidir otro intento.");
          return;
        }
        const decision = reconcileCreatedUser(result.authoritative.users, payload.username);
        if (decision.state === "applied") {
          setCreateForm(initialCreateForm);
          setCreateErrors({});
          setNotice(result.kind === "confirmed" ? "Usuario creado y confirmado con la lista autoritativa." : "La respuesta fue incierta; la lista autoritativa confirmó el usuario.");
          await loadUsers(filter, false);
        } else if (decision.state === "unchanged") {
          setErrorMessage("La lectura autoritativa no encontró el usuario. Revisa antes de decidir un nuevo intento.");
        } else {
          block("create");
          setErrorMessage("No pudimos atribuir la creación a un único usuario. Se requiere revisión manual.");
        }
      } catch (error) {
        if (await handleAuthError(error)) return;
        if (error instanceof ApiError) {
          if (error.code === "USER_CREATION_COMPENSATION_FAILED") block("create");
          setErrorMessage(usersErrorMessage(error));
        } else setErrorMessage("No se pudo crear el usuario.");
      } finally {
        setCreateForm((current) => ({ ...current, password: "" }));
        setBusyKey(null);
      }
    });
  };

  const handleEdit = async () => {
    if (dialog?.kind !== "edit" || blockedKeys.has(`edit:${dialog.user.id}`)) return;
    const validation = validateUpdateUser(dialog.user, editForm);
    setEditErrors(validation.errors);
    if (!validation.payload) return;
    const target = dialog.user;
    const payload = validation.payload;
    const key = `edit:${target.id}`;
    await runWithUserLock(locksRef.current, key, async () => {
      setBusyKey(key);
      setErrorMessage(null);
      setNotice(null);
      try {
        const accessToken = await getAccessToken();
        const result = await executeUserMutation({
          mutate: () => updateManagedUser(target.id, payload, accessToken),
          refetch: () => getManagedUser(target.id, accessToken),
          classifyFailure: userFailureKind,
        });
        const isSelfRoleChange = isCurrentManagedUser(target.id, currentUser?.id) && payload.role !== undefined;
        if (
          isSelfRoleChange
          && (result.kind === "confirmed-refetch-failed" || result.kind === "unresolved")
        ) {
          setDialog(null);
          window.location.reload();
          return;
        }
        if (result.kind === "confirmed-refetch-failed" || result.kind === "unresolved") {
          block(key);
          setErrorMessage("La actualización no pudo verificarse. Actualiza antes de otra acción.");
          closeDialog();
          return;
        }
        if (!userUpdateIsApplied(result.authoritative.user, payload)) {
          setErrorMessage("El usuario no refleja los cambios solicitados. Revisa antes de intentar nuevamente.");
          return;
        }
        const followUp = selfAccountFollowUp({ isSelf: isCurrentManagedUser(target.id, currentUser?.id), deactivated: false, roleChanged: payload.role !== undefined });
        setUsers((current) => current?.map((row) => row.id === target.id ? result.authoritative.user : row) ?? null);
        setDialog(null);
        setNotice(result.kind === "confirmed" ? "Usuario actualizado con estado autoritativo." : "La lectura autoritativa confirmó la actualización incierta.");
        if (followUp === "rehydrate") window.location.reload();
      } catch (error) {
        if (await handleAuthError(error)) return;
        setErrorMessage(error instanceof ApiError ? usersErrorMessage(error) : "No se pudo actualizar el usuario.");
      } finally {
        setBusyKey(null);
      }
    });
  };

  const handleStatusChange = async () => {
    if (dialog?.kind !== "status") return;
    const target = dialog.user;
    const nextActive = !target.isActive;
    const key = `status:${target.id}`;
    if (blockedKeys.has(key)) return;
    await runWithUserLock(locksRef.current, key, async () => {
      setBusyKey(key);
      setErrorMessage(null);
      setNotice(null);
      try {
        const accessToken = await getAccessToken();
        const result = await executeUserMutation({
          mutate: () => setManagedUserActive(target.id, nextActive, accessToken),
          refetch: () => getManagedUser(target.id, accessToken),
          classifyFailure: userFailureKind,
        });
        const isSelfDeactivation = isCurrentManagedUser(target.id, currentUser?.id) && !nextActive;
        if (
          isSelfDeactivation
          && (result.kind === "confirmed-refetch-failed" || result.kind === "unresolved")
        ) {
          setDialog(null);
          await logout();
          return;
        }
        if (result.kind === "confirmed-refetch-failed" || result.kind === "unresolved") {
          block(key);
          setErrorMessage("El cambio de estado no pudo verificarse. Actualiza antes de otra acción.");
          setDialog(null);
          return;
        }
        if (!userActivationIsApplied(result.authoritative.user, nextActive)) {
          setErrorMessage("El estado autoritativo no refleja la acción solicitada. Revisa antes de intentar nuevamente.");
          return;
        }
        const followUp = selfAccountFollowUp({ isSelf: isCurrentManagedUser(target.id, currentUser?.id), deactivated: !nextActive, roleChanged: false });
        setDialog(null);
        if (followUp === "logout") {
          await logout();
          return;
        }
        setNotice(result.kind === "confirmed" ? `Usuario ${nextActive ? "activado" : "desactivado"} y verificado.` : "La lectura autoritativa confirmó el cambio de estado incierto.");
        await loadUsers(filter, false);
      } catch (error) {
        if (await handleAuthError(error)) return;
        setErrorMessage(error instanceof ApiError ? usersErrorMessage(error) : "No se pudo cambiar el estado del usuario.");
      } finally {
        setBusyKey(null);
      }
    });
  };

  const handlePasswordReset = async () => {
    if (dialog?.kind !== "password") return;
    const target = dialog.user;
    const key = `password:${target.id}`;
    if (blockedKeys.has(key)) return;
    const validation = validatePasswordReset(newPassword, confirmPassword);
    setPasswordErrors(validation.errors);
    if (!validation.newPassword) return;
    const passwordForRequest = validation.newPassword;
    await runWithUserLock(locksRef.current, key, async () => {
      setBusyKey(key);
      setErrorMessage(null);
      setNotice(null);
      try {
        const accessToken = await getAccessToken();
        const result = await executePasswordReset({
          mutate: () => resetManagedUserPassword(target.id, passwordForRequest, accessToken),
          classifyFailure: userFailureKind,
        });
        setNewPassword("");
        setConfirmPassword("");
        if (result.kind === "ambiguous") {
          block(key);
          setErrorMessage("El resultado del restablecimiento es incierto. No se reenviará. Cierra, revisa la cuenta y decide explícitamente una acción posterior.");
          return;
        }
        setDialog(null);
        setNotice("Contraseña restablecida. El valor no se mostrará ni conservará.");
      } catch (error) {
        setNewPassword("");
        setConfirmPassword("");
        if (await handleAuthError(error)) return;
        setErrorMessage(error instanceof ApiError ? usersErrorMessage(error) : "No se pudo restablecer la contraseña.");
      } finally {
        setBusyKey(null);
      }
    });
  };

  if (isLoading && !users) return <LoadingState label="Consultando usuarios…" />;
  if (!users) return <ErrorState title="Usuarios no disponibles" message={errorMessage ?? "No pudimos consultar el equipo."} actionLabel="Intentar nuevamente" onAction={() => void loadUsers(filter)} />;

  return (
    <div className="users-page">
      <header className="operational-heading"><div><p className="eyebrow">Administración</p><h1>Usuarios</h1><p>Gestiona cuentas, roles, acceso y credenciales del equipo.</p></div><Button type="button" variant="secondary" loading={isLoading} onClick={() => void loadUsers(filter)}>Actualizar</Button></header>
      {(notice || errorMessage) && <div className="tables-notice" data-tone={errorMessage ? "warning" : "info"} role={errorMessage ? "alert" : "status"}>{errorMessage ?? notice}</div>}

      <div className="users-layout">
        <Surface className="user-create-card">
          <div><p className="eyebrow">Cuenta nueva</p><h2>Crear usuario</h2><p>La contraseña se envía una vez y nunca se vuelve a mostrar.</p></div>
          <Input id="create-full-name" label="Nombre completo" autoComplete="name" maxLength={120} value={createForm.fullName} error={createErrors.fullName} disabled={busyKey === "create" || blockedKeys.has("create")} onChange={(event) => setCreateForm((current) => ({ ...current, fullName: event.target.value }))} />
          <Input id="create-username" label="Usuario" autoComplete="off" maxLength={60} value={createForm.username} error={createErrors.username} disabled={busyKey === "create" || blockedKeys.has("create")} onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))} />
          <Input id="create-password" label="Contraseña inicial" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={createForm.password} error={createErrors.password} disabled={busyKey === "create" || blockedKeys.has("create")} onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))} />
          <SelectField id="create-role" label="Rol" value={createForm.role} options={userRoleOptions} error={createErrors.role} disabled={busyKey === "create" || blockedKeys.has("create")} onChange={(role) => setCreateForm((current) => ({ ...current, role }))} />
          <label className="user-active-choice"><input type="checkbox" checked={createForm.isActive} disabled={busyKey === "create" || blockedKeys.has("create")} onChange={(event) => setCreateForm((current) => ({ ...current, isActive: event.target.checked }))} /><span>Crear cuenta activa</span></label>
          {blockedKeys.has("create") ? <Button type="button" variant="secondary" loading={isLoading} onClick={() => void loadUsers(filter)}>Verificar lista</Button> : <Button type="button" loading={busyKey === "create"} onClick={() => void handleCreate()}>Crear usuario</Button>}
        </Surface>

        <Surface className="user-list-card">
          <div className="user-list-heading"><div><p className="eyebrow">Equipo registrado</p><h2>Directorio</h2></div><div className="user-filter" role="group" aria-label="Filtrar usuarios">{(["all", "active", "inactive"] as const).map((value) => <Button key={value} type="button" variant={filter === value ? "primary" : "ghost"} disabled={isLoading} onClick={() => setFilter(value)}>{value === "all" ? "Todos" : value === "active" ? "Activos" : "Inactivos"}</Button>)}</div></div>
          {users.length === 0 ? <p className="users-empty">No hay usuarios en este estado.</p> : <div className="user-list">{users.map((managedUser) => {
            const isSelf = isCurrentManagedUser(managedUser.id, currentUser?.id);
            return <article className="user-row" key={managedUser.id} data-active={managedUser.isActive}><div className="user-row__identity"><strong>{managedUser.fullName}{isSelf ? " (tú)" : ""}</strong><span>@{managedUser.username}</span></div><div className="user-row__meta"><span>{MANAGED_USER_ROLE_LABELS[managedUser.role]}</span><strong>{managedUser.isActive ? "Activo" : "Inactivo"}</strong><span>Desde {formatOperationalDate(managedUser.createdAt)}</span></div><div className="user-row__actions"><Button type="button" variant="ghost" disabled={blockedKeys.has(`edit:${managedUser.id}`)} onClick={() => openEdit(managedUser)}>Editar</Button><Button type="button" variant="ghost" disabled={blockedKeys.has(`status:${managedUser.id}`)} onClick={() => setDialog({ kind: "status", user: managedUser })}>{managedUser.isActive ? "Desactivar" : "Activar"}</Button><Button type="button" variant="secondary" disabled={blockedKeys.has(`password:${managedUser.id}`)} onClick={() => { setNewPassword(""); setConfirmPassword(""); setPasswordErrors({}); setDialog({ kind: "password", user: managedUser }); }}>Restablecer contraseña</Button></div></article>;
          })}</div>}
        </Surface>
      </div>

      {dialog?.kind === "edit" && <OperationalDialog title="Editar usuario" description={`Actualiza los datos de @${dialog.user.username}.`} busy={busyKey === `edit:${dialog.user.id}`} onClose={closeDialog} footer={<><Button type="button" variant="secondary" disabled={Boolean(busyKey)} onClick={closeDialog}>Cancelar</Button><Button type="button" loading={busyKey === `edit:${dialog.user.id}`} onClick={() => void handleEdit()}>Guardar cambios</Button></>}><div className="user-dialog-form"><Input id="edit-full-name" label="Nombre completo" maxLength={120} value={editForm.fullName} error={editErrors.fullName} onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))} /><Input id="edit-username" label="Usuario" maxLength={60} value={editForm.username} error={editErrors.username} onChange={(event) => setEditForm((current) => ({ ...current, username: event.target.value }))} /><SelectField id="edit-role" label="Rol" value={editForm.role} options={userRoleOptions} onChange={(role) => setEditForm((current) => ({ ...current, role }))} />{editErrors.form && <p className="field__error" role="alert">{editErrors.form}</p>}{isCurrentManagedUser(dialog.user.id, currentUser?.id) && editForm.role !== dialog.user.role && <p className="user-self-warning">Estás cambiando tu propio rol. La aplicación recargará tus permisos al terminar.</p>}</div></OperationalDialog>}

      {dialog?.kind === "status" && <OperationalDialog title={dialog.user.isActive ? "Desactivar usuario" : "Activar usuario"} description={`${dialog.user.fullName} · @${dialog.user.username}`} busy={busyKey === `status:${dialog.user.id}`} onClose={closeDialog} footer={<><Button type="button" variant="secondary" disabled={Boolean(busyKey)} onClick={closeDialog}>Cancelar</Button><Button type="button" loading={busyKey === `status:${dialog.user.id}`} onClick={() => void handleStatusChange()}>{dialog.user.isActive ? "Confirmar desactivación" : "Confirmar activación"}</Button></>}><p className={isCurrentManagedUser(dialog.user.id, currentUser?.id) && dialog.user.isActive ? "user-self-warning" : "user-dialog-copy"}>{dialog.user.isActive ? isCurrentManagedUser(dialog.user.id, currentUser?.id) ? "Esta es tu cuenta actual. Perderás el acceso inmediatamente y volverás al inicio de sesión." : "La cuenta perderá acceso a Logistics hasta que vuelva a activarse." : "La cuenta podrá autenticarse nuevamente con sus credenciales vigentes."}</p></OperationalDialog>}

      {dialog?.kind === "password" && <OperationalDialog title="Restablecer contraseña" description={`Nueva credencial para @${dialog.user.username}. El valor no se mostrará después.`} busy={busyKey === `password:${dialog.user.id}`} onClose={closeDialog} footer={<><Button type="button" variant="secondary" disabled={Boolean(busyKey)} onClick={closeDialog}>Cancelar</Button><Button type="button" loading={busyKey === `password:${dialog.user.id}`} disabled={blockedKeys.has(`password:${dialog.user.id}`)} onClick={() => void handlePasswordReset()}>Confirmar restablecimiento</Button></>}><div className="user-dialog-form"><Input id="reset-password" label="Nueva contraseña" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={newPassword} error={passwordErrors.password} onChange={(event) => setNewPassword(event.target.value)} /><Input id="reset-password-confirmation" label="Confirmar nueva contraseña" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={confirmPassword} error={passwordErrors.confirmation} onChange={(event) => setConfirmPassword(event.target.value)} />{blockedKeys.has(`password:${dialog.user.id}`) && <p className="user-self-warning">Resultado incierto: este formulario no permite reenviar. Cierra y actualiza antes de una nueva decisión administrativa.</p>}</div></OperationalDialog>}
    </div>
  );
}
