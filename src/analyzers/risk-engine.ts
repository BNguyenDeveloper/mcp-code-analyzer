import { FunctionSymbol } from "../core/types";

export function estimateRisk(
  target: FunctionSymbol,
  directCallers: FunctionSymbol[],
  directCallees: FunctionSymbol[]
): number {
  let score = 0;

  if (target.exported) score += 20;
  if (directCallers.length >= 3) score += 20;
  if (directCallees.length >= 3) score += 10;

  const n = target.name.toLowerCase();

  if (n.includes("create")) score += 15;
  if (n.includes("update")) score += 15;
  if (n.includes("delete")) score += 20;
  if (n.includes("save")) score += 20;
  if (n.includes("auth")) score += 20;
  if (n.includes("token")) score += 15;
  if (n.includes("time") || n.includes("date") || n.includes("utc")) score += 15;
  if (n.includes("repository")) score += 10;
  if (n.includes("service")) score += 10;
  if (n.includes("controller")) score += 10;

  return score;
}
