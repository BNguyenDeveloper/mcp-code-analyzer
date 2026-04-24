import fs from "fs-extra";
import { GraphStore } from "../graph/graph-store";
import { analyzeImpact } from "../analyzers/impact-engine";
import { RepoAnalysis } from "../core/types";

export async function runImpact(functionName: string) {
  const repoAnalyses = (await fs.readJson("data/raw/repo-analyses.json")) as RepoAnalysis[];

  const store = new GraphStore();
  for (const analysis of repoAnalyses) {
    store.addRepoAnalysis(analysis);
  }
  store.resolveCallsByName();

  const matches = store.findFunctionsByName(functionName);

  if (matches.length === 0) {
    console.log(`No function/method found with name: ${functionName}`);
    return;
  }

  for (const fn of matches) {
    const report = analyzeImpact(store, fn);

    console.log("\n==================================================");
    console.log(`Method: ${fn.name}`);
    console.log(`Repo: ${fn.repo}`);
    console.log(`File: ${fn.file}:${fn.line}`);
    console.log(`Risk: ${report.riskLevel} (${report.riskScore})`);

    console.log("\nDirect callers:");
    if (report.directCallers.length === 0) {
      console.log("- none");
    } else {
      for (const c of report.directCallers) {
        console.log(`- ${c.repo} :: ${c.file}:${c.line} :: ${c.name}`);
      }
    }

    console.log("\nDirect callees:");
    if (report.directCallees.length === 0) {
      console.log("- none");
    } else {
      for (const c of report.directCallees) {
        console.log(`- ${c.repo} :: ${c.file}:${c.line} :: ${c.name}`);
      }
    }

    console.log("\nImpacted routes:");
    if (report.impactedRoutes.length === 0) {
      console.log("- none");
    } else {
      for (const r of report.impactedRoutes) {
        console.log(`- ${r.httpMethod} ${r.fullPath} :: ${r.className}.${r.methodName} (${r.file}:${r.line})`);
      }
    }

    console.log("\nImpacted repos:");
    for (const repo of report.impactedRepos) {
      console.log(`- ${repo}`);
    }

    console.log("\nNotes:");
    for (const note of report.notes) {
      console.log(`- ${note}`);
    }
  }
}
