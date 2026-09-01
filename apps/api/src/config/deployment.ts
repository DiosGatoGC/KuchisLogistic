export interface DeploymentContext {
  isVercel: boolean;
}

export function resolveDeploymentContext(
  environment: Readonly<Record<string, string | undefined>> = process.env
): DeploymentContext {
  return { isVercel: environment.VERCEL === "1" };
}
