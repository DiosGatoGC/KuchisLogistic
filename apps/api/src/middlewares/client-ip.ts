import { isIP } from "node:net";
import type { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";
import type { DeploymentContext } from "../config/deployment";

const UNKNOWN_CLIENT_IP = "unknown-client";
const IPV6_SUBNET = 56;

function validIp(value: unknown) {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim();
  return candidate !== "" && isIP(candidate) !== 0 ? candidate : undefined;
}

function vercelClientIp(request: Request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor !== "string" || forwardedFor.includes(",")) return undefined;
  return validIp(forwardedFor);
}

function directClientIp(request: Request) {
  return validIp(request.ip)
    ?? validIp(request.socket.remoteAddress)
    ?? UNKNOWN_CLIENT_IP;
}

export function resolveClientIp(request: Request, deployment: DeploymentContext) {
  if (deployment.isVercel) {
    return vercelClientIp(request) ?? directClientIp(request);
  }
  return directClientIp(request);
}

export function clientIpRateLimitKey(request: Request, deployment: DeploymentContext) {
  return ipKeyGenerator(resolveClientIp(request, deployment), IPV6_SUBNET);
}
