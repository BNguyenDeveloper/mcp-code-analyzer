import { GraphStore } from "../graph/graph-store";
import { FunctionSymbol, ImpactReport, RouteInfo } from "../core/types";
import { estimateRisk } from "./risk-engine";

export function analyzeImpact(store: GraphStore, target: FunctionSymbol): ImpactReport {
  const directCallerIds = store.calls
    .filter((c) => c.calleeId === target.id)
    .map((c) => c.callerId);

  const directCalleeIds = store.calls
    .filter((c) => c.callerId === target.id && c.calleeId)
    .map((c) => c.calleeId!);

  const directCallers = uniqFunctions(
    directCallerIds
      .map((id) => store.getFunctionById(id))
      .filter(Boolean) as FunctionSymbol[]
  );

  const directCallees = uniqFunctions(
    directCalleeIds
      .map((id) => store.getFunctionById(id))
      .filter(Boolean) as FunctionSymbol[]
  );

  const impactedRoutes = findImpactedRoutes(store, target, directCallers);

  const impactedFiles = new Set<string>([
    target.file,
    ...directCallers.map((f) => f.file),
    ...directCallees.map((f) => f.file),
    ...impactedRoutes.map((r) => r.file)
  ]);

  const impactedRepos = new Set<string>([
    target.repo,
    ...directCallers.map((f) => f.repo),
    ...directCallees.map((f) => f.repo),
    ...impactedRoutes.map((r) => r.repo)
  ]);

  const riskScore = estimateRisk(target, directCallers, directCallees);

  return {
    targetSymbol: target.id,
    directCallers,
    directCallees,
    impactedFiles: Array.from(impactedFiles),
    impactedRepos: Array.from(impactedRepos),
    impactedRoutes,
    riskScore,
    riskLevel: riskScore >= 60 ? "High" : riskScore >= 25 ? "Medium" : "Low",
    notes: buildNotes(target, directCallers, directCallees, impactedRoutes)
  };
}

function findImpactedRoutes(
  store: GraphStore,
  target: FunctionSymbol,
  directCallers: FunctionSymbol[]
): RouteInfo[] {
  const routes: RouteInfo[] = [];

  routes.push(...store.getRoutesForFunction(target));

  for (const caller of directCallers) {
    routes.push(...store.getRoutesForFunction(caller));
  }

  if (target.className) {
    const controllerClasses = store.getControllerClassesUsingService(target.className);
    for (const controllerClass of controllerClasses) {
      routes.push(...store.getRoutesForControllerClass(controllerClass));
    }
  }

  return uniqRoutes(routes);
}

function buildNotes(
  target: FunctionSymbol,
  callers: FunctionSymbol[],
  callees: FunctionSymbol[],
  routes: RouteInfo[]
): string[] {
  const notes: string[] = [];

  if (target.exported) {
    notes.push("Target method is treated as public/exported in analysis.");
  }

  if (callers.length > 0) {
    notes.push(`Detected ${callers.length} direct caller(s).`);
  }

  if (callees.length > 0) {
    notes.push(`Detected ${callees.length} direct callee(s).`);
  }

  if (routes.length > 0) {
    notes.push(`Detected ${routes.length} impacted Spring route(s).`);
  }

  if (target.className) {
    notes.push(`Target belongs to class ${target.className}.`);
  }

  return notes;
}

function uniqFunctions(list: FunctionSymbol[]): FunctionSymbol[] {
  const seen = new Set<string>();
  const out: FunctionSymbol[] = [];
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function uniqRoutes(list: RouteInfo[]): RouteInfo[] {
  const seen = new Set<string>();
  const out: RouteInfo[] = [];
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
