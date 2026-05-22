import { Command } from "commander";
import { indexAllRepos } from "../app/index-repos";
import { runImpact } from "../app/run-impact";

const program = new Command();

program.name("company-code-intel-java-phase2");

program
  .command("index")
  .description("Index the current Java repository or a provided repository root")
  .option("--repo-root <path>", "Java repository root (defaults to current working directory)")
  .option("--repo-name <name>", "Repository/service name (defaults to directory name)")
  .action(async (opts) => {
    await indexAllRepos({
      repoRoot: opts.repoRoot,
      repoName: opts.repoName
    });
  });

program
  .command("impact")
  .description("Analyze impact for a method name")
  .requiredOption("-f, --function <name>", "Method name, e.g. createOrder or OrderService.createOrder")
  .action(async (opts) => {
    await runImpact(opts.function);
  });

program
  .command("analyze")
  .description("Run code analysis (bugs + security)")
  .option("--bugs-only", "Run only bug detection")
  .option("--security-only", "Run only security detection (Phase 3)")
  .option("--json", "Output JSON only (no console)")
  .option("--output <dir>", "Output directory for JSON files", "data/findings")
  .action(async (opts) => {
    const { runAnalyze } = await import("../app/run-analyze");
    await runAnalyze({
      bugs: !opts.securityOnly,
      security: !opts.bugsOnly,
      format: opts.json ? "json" : "both",
      outputDir: opts.output
    });
  });

program.parseAsync(process.argv);
