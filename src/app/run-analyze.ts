import fs from "fs-extra";
import { GraphStore } from "../graph/graph-store";
import { RepoAnalysis, AnalysisResult, Finding, FindingSeverity } from "../core/types";
import { BugAnalyzer } from "../analyzers/bug-analyzer";
import { SecurityAnalyzer } from "../analyzers/security-analyzer";
import { reportToConsole } from "../reporters/console-reporter";
import { saveJsonReports } from "../reporters/json-reporter";

export interface AnalyzeOptions {
  bugs?: boolean;
  security?: boolean;
  format?: "console" | "json" | "both";
  outputDir?: string;
}

export async function runAnalyze(options: AnalyzeOptions = {}): Promise<void> {
  const {
    bugs = true,
    security = true,
    format = "both",
    outputDir = "data/findings"
  } = options;

  console.log("Loading graph data...");

  // Load graph from indexed data
  const repoAnalyses = await fs.readJson("data/raw/repo-analyses.json") as RepoAnalysis[];
  const store = new GraphStore();

  for (const analysis of repoAnalyses) {
    store.addRepoAnalysis(analysis);
  }

  store.resolveCallsByName();
  store.buildEnhancedIndexes();

  console.log(`Loaded ${store.functions.size} functions from ${repoAnalyses.length} repo(s)\n`);

  // Run analyzers
  const allFindings: Finding[] = [];

  if (bugs) {
    console.log("Running bug detection...");
    const bugAnalyzer = new BugAnalyzer();
    const bugFindings = bugAnalyzer.analyze(store);
    allFindings.push(...bugFindings);
    console.log(`  Found ${bugFindings.length} bug(s)\n`);
  }

  if (security) {
    console.log("Running security detection...");
    const securityAnalyzer = new SecurityAnalyzer();
    const securityFindings = securityAnalyzer.analyze(store);
    allFindings.push(...securityFindings);
    console.log(`  Found ${securityFindings.length} security issue(s)\n`);
  }

  // Deduplicate findings (same file/line/rule)
  const deduplicatedFindings = deduplicateFindings(allFindings);

  if (deduplicatedFindings.length < allFindings.length) {
    console.log(`Deduplicated: ${allFindings.length - deduplicatedFindings.length} duplicate finding(s) removed\n`);
  }

  // Build result
  const result = buildAnalysisResult(deduplicatedFindings, repoAnalyses.map(r => r.repo.name));

  // Output results
  if (format === "console" || format === "both") {
    reportToConsole(result);
  }

  if (format === "json" || format === "both") {
    await saveJsonReports(result, outputDir);
  }

  console.log(`\nAnalysis complete. Total findings: ${allFindings.length}`);
}

function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const deduplicated: Finding[] = [];

  for (const finding of findings) {
    // Create unique key: file + line + rule + functionId + className
    // This prevents losing different rules on same line and adds more context
    const key = `${finding.file}:${finding.line}:${finding.ruleId}:${finding.functionId || 'none'}:${finding.className || 'none'}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(finding);
    }
  }

  return deduplicated;
}

function buildAnalysisResult(findings: Finding[], repos: string[]): AnalysisResult {
  const bySeverity: Record<FindingSeverity, number> = {
    critical: findings.filter(f => f.severity === "critical").length,
    high: findings.filter(f => f.severity === "high").length,
    medium: findings.filter(f => f.severity === "medium").length,
    low: findings.filter(f => f.severity === "low").length
  };

  const byCategory = {
    bug: findings.filter(f => f.category === "bug").length,
    security: findings.filter(f => f.category === "security").length
  };

  return {
    version: "1.0",
    timestamp: new Date().toISOString(),
    repos,
    summary: {
      total: findings.length,
      bySeverity,
      byCategory
    },
    findings: findings.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    })
  };
}
