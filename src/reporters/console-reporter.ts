import { AnalysisResult, Finding, FindingSeverity } from "../core/types";

export function reportToConsole(result: AnalysisResult): void {
  console.log("\n═══════════════════════════════════════");
  console.log("  ANALYSIS SUMMARY");
  console.log("═══════════════════════════════════════\n");

  console.log(`Analysis Version: ${result.version}`);
  console.log(`Total Findings: ${result.summary.total}`);

  if (result.summary.total === 0) {
    console.log("  No issues found! ✓\n");
    return;
  }

  // By Severity
  console.log("\nBy Severity:");
  const severities: FindingSeverity[] = ["critical", "high", "medium", "low"];
  for (const severity of severities) {
    const count = result.summary.bySeverity[severity] || 0;
    if (count > 0) {
      console.log(`  ${capitalize(severity)}: ${count}`);
    }
  }

  // By Category
  console.log("\nBy Category:");
  for (const [category, count] of Object.entries(result.summary.byCategory)) {
    if (count > 0) {
      console.log(`  ${capitalize(category)}: ${count}`);
    }
  }

  // Top Risky Classes
  console.log("\n═══════════════════════════════════════");
  console.log("  TOP RISKY CLASSES");
  console.log("═══════════════════════════════════════\n");

  printTopRiskyClasses(result.findings);

  // Findings by Rule
  console.log("\n═══════════════════════════════════════");
  console.log("  FINDINGS BY RULE");
  console.log("═══════════════════════════════════════\n");

  printFindingsByRule(result.findings);

  // Findings by Class
  console.log("\n═══════════════════════════════════════");
  console.log("  FINDINGS BY CLASS");
  console.log("═══════════════════════════════════════\n");

  printFindingsByClass(result.findings);

  // Top Issues (Detailed)
  console.log("\n═══════════════════════════════════════");
  console.log("  TOP ISSUES (Detailed)");
  console.log("═══════════════════════════════════════\n");

  const sortedFindings = result.findings
    .sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    })
    .slice(0, 10);

  for (const finding of sortedFindings) {
    printFinding(finding);
  }

  if (result.findings.length > 10) {
    console.log(`\n... and ${result.findings.length - 10} more issues\n`);
  }

  console.log("\n═══════════════════════════════════════\n");
}

function printFinding(finding: Finding): void {
  const severityLabel = `[${finding.severity.toUpperCase()}]`;
  console.log(`${severityLabel} ${finding.ruleName} (${finding.ruleId})`);
  console.log(`  Location: ${finding.file}:${finding.line}${finding.className ? ` (${finding.className})` : ""}`);
  console.log(`  Issue: ${finding.message}`);

  if (finding.remediation) {
    console.log(`  Recommendation: ${finding.remediation}`);
  }

  if (finding.cwe && finding.cwe.length > 0) {
    console.log(`  CWE: ${finding.cwe.join(", ")}`);
  }

  console.log(`  Confidence: ${finding.confidence}%`);
  console.log("");
}

function printTopRiskyClasses(findings: Finding[]): void {
  // Group by class and count critical/high severity issues
  const classRisk = new Map<string, { critical: number; high: number; total: number }>();

  for (const finding of findings) {
    if (!finding.className) continue;

    const className = finding.className;
    const existing = classRisk.get(className) || { critical: 0, high: 0, total: 0 };

    if (finding.severity === "critical") existing.critical++;
    if (finding.severity === "high") existing.high++;
    existing.total++;

    classRisk.set(className, existing);
  }

  // Sort by critical first, then high, then total
  const sorted = Array.from(classRisk.entries())
    .sort((a, b) => {
      if (a[1].critical !== b[1].critical) return b[1].critical - a[1].critical;
      if (a[1].high !== b[1].high) return b[1].high - a[1].high;
      return b[1].total - a[1].total;
    })
    .slice(0, 5);

  if (sorted.length === 0) {
    console.log("  No classes with identified issues.\n");
    return;
  }

  for (const [className, risk] of sorted) {
    console.log(`  ${className}`);
    console.log(`    Critical: ${risk.critical}, High: ${risk.high}, Total: ${risk.total}`);
  }
  console.log("");
}

function printFindingsByRule(findings: Finding[]): void {
  // Group by rule
  const byRule = new Map<string, Finding[]>();

  for (const finding of findings) {
    const key = finding.ruleId;
    if (!byRule.has(key)) {
      byRule.set(key, []);
    }
    byRule.get(key)!.push(finding);
  }

  // Sort by severity and count
  const sorted = Array.from(byRule.entries())
    .sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const aMax = Math.min(...a[1].map(f => severityOrder[f.severity]));
      const bMax = Math.min(...b[1].map(f => severityOrder[f.severity]));
      if (aMax !== bMax) return aMax - bMax;
      return b[1].length - a[1].length;
    });

  for (const [ruleId, ruleFindings] of sorted) {
    const sample = ruleFindings[0];
    console.log(`  [${sample.severity.toUpperCase()}] ${sample.ruleName} (${ruleId})`);
    console.log(`    Occurrences: ${ruleFindings.length}`);
  }
  console.log("");
}

function printFindingsByClass(findings: Finding[]): void {
  // Group by class
  const byClass = new Map<string, Finding[]>();

  for (const finding of findings) {
    const key = finding.className || "(no class)";
    if (!byClass.has(key)) {
      byClass.set(key, []);
    }
    byClass.get(key)!.push(finding);
  }

  // Sort by critical/high count, then total
  const sorted = Array.from(byClass.entries())
    .sort((a, b) => {
      const aCriticalHigh = a[1].filter(f => f.severity === "critical" || f.severity === "high").length;
      const bCriticalHigh = b[1].filter(f => f.severity === "critical" || f.severity === "high").length;
      if (aCriticalHigh !== bCriticalHigh) return bCriticalHigh - aCriticalHigh;
      return b[1].length - a[1].length;
    })
    .slice(0, 10);

  for (const [className, classFindings] of sorted) {
    const criticalCount = classFindings.filter(f => f.severity === "critical").length;
    const highCount = classFindings.filter(f => f.severity === "high").length;

    console.log(`  ${className}: ${classFindings.length} issue(s)`);
    if (criticalCount > 0) console.log(`    - Critical: ${criticalCount}`);
    if (highCount > 0) console.log(`    - High: ${highCount}`);
  }
  console.log("");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
