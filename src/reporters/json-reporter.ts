import fs from "fs-extra";
import path from "path";
import { AnalysisResult } from "../core/types";

export async function saveJsonReports(result: AnalysisResult, outputDir = "data/findings"): Promise<void> {
  await fs.ensureDir(outputDir);

  // Save complete report
  await fs.writeJson(path.join(outputDir, "all.json"), result, { spaces: 2 });

  // Save by category
  const bugFindings = result.findings.filter(f => f.category === "bug");
  if (bugFindings.length > 0) {
    const bugResult = { ...result, findings: bugFindings };
    bugResult.summary.total = bugFindings.length;
    await fs.writeJson(path.join(outputDir, "bugs.json"), bugResult, { spaces: 2 });
  }

  const securityFindings = result.findings.filter(f => f.category === "security");
  if (securityFindings.length > 0) {
    const securityResult = { ...result, findings: securityFindings };
    securityResult.summary.total = securityFindings.length;
    await fs.writeJson(path.join(outputDir, "security.json"), securityResult, { spaces: 2 });
  }

  console.log(`\nResults saved to:`);
  console.log(`  - ${outputDir}/all.json`);
  if (bugFindings.length > 0) {
    console.log(`  - ${outputDir}/bugs.json`);
  }
  if (securityFindings.length > 0) {
    console.log(`  - ${outputDir}/security.json`);
  }
}
