---
name: java-code-intelligence
description: Analyze local Java and Spring Boot repositories with the Java Code Intelligence CLI. Use when Claude Code needs to index a Java repo, run bug/security analysis, inspect findings, explain rule behavior, run impact analysis, or help fix findings through local commands.
---

# Java Code Intelligence

Use this skill to run and interpret the local Java Code Intelligence analyzer from this repository. Prefer the CLI workflow.

## Token-Efficient Defaults

Minimize source reading. Use analyzer outputs as the entry point.

Default behavior:

1. Run or reuse analyzer reports.
2. Read `data/findings/all.json` first.
3. Summarize critical and high findings before opening source files.
4. Open source only for findings that need verification, fixing, or deeper explanation.
5. When opening source, read a small region around the reported `file` and `line`.
6. Do not scan the full repository unless the user explicitly asks for broad code review or the report is missing required context.

For security findings, inspect source before claiming exploitability. Keep wording heuristic until code confirms the issue.

## Locate The Analyzer

If the user is inside the analyzer repository, use the current working directory.

If the user is inside a target Java repository, ask for or infer the analyzer repository path before running analyzer commands. Analyzer commands must run from the analyzer repository root, while `--repo-root` points to the Java repository being analyzed.

## Build Once

From the analyzer repository root:

```bash
npm install
npm run build
cd java-analyzer
mvn clean package
cd ..
```

## Analyze A Repository

Analyze the current working directory:

```bash
npm run index
npm run analyze
```

Analyze another Java repository:

```bash
npm run index -- --repo-root C:/path/to/java-service
npm run analyze
```

Set the service name explicitly when needed:

```bash
npm run index -- --repo-root C:/path/to/java-service --repo-name java-service
npm run analyze
```

Focused modes:

```bash
npm run analyze -- --bugs-only
npm run analyze -- --security-only
npm run analyze -- --json
```

## Impact Analysis

Run impact analysis after indexing:

```bash
npm run impact -- --function methodName
```

Use this before changing a method to understand direct callers, direct callees, impacted Spring routes, impacted repositories, and risk.

## Read Outputs

Read generated reports from:

- `data/findings/all.json`
- `data/findings/bugs.json`
- `data/findings/security.json`
- `data/raw/repo-analyses.json`

When summarizing findings, lead with critical and high severity issues. Include `file`, `line`, `ruleId`, `severity`, `confidence`, and `remediation` when present.

When the report is large, read and summarize in this order:

1. `summary`
2. critical findings
3. high findings
4. security findings with confidence >= 75
5. remaining findings only if the user asks

## Interpret Findings

Treat findings as prioritized review leads, not proof of exploitability.

Rules:

- `BUG-001`: unsafe `Optional.get()` without a local guard.
- `BUG-002`: potential resource leak in try/catch without try-with-resources.
- `BUG-003`: empty catch block.
- `SEC-001`: potential SQL injection or risky SQL execution pattern.
- `SEC-002`: potential command injection or risky command execution pattern.

Security rules are heuristic. Use wording like "potential", "likely", or "needs review" unless the source code proves a concrete vulnerability.

## Suppressions

Known false positives can be suppressed with an inline comment on the same line or directly above the finding:

```java
// analyzer-ignore SEC-001 safe because input is allowlisted
statement.executeQuery(sql);
```

## Common Workflows

### Full Skill Flow

1. Locate the analyzer project root.
2. Locate the target Java repository root.
3. Build the analyzer if dependencies or parser artifacts are missing.
4. Run indexing from the analyzer root with `--repo-root <target>`.
5. Run analysis from the analyzer root.
6. Read the generated JSON report.
7. Summarize findings by severity and confidence without opening source files.
8. Inspect source code only for selected high-priority findings or when the user asks for fixes.
9. Help fix likely real issues or add suppression comments for known false positives.
10. Re-run index and analysis to verify.

For "analyze this repo":

1. Build the analyzer if needed.
2. Run `npm run index -- --repo-root <target>`.
3. Run `npm run analyze`.
4. Read `data/findings/all.json`.
5. Summarize highest-risk findings first without scanning the repository.

For "security only":

1. Run `npm run index -- --repo-root <target>`.
2. Run `npm run analyze -- --security-only`.
3. Read `data/findings/security.json`.
4. Inspect source only for critical/high findings that need verification.

For "what breaks if I change this method":

1. Run `npm run index -- --repo-root <target>`.
2. Run `npm run impact -- --function <methodName>`.
3. Summarize callers, callees, routes, and risk.

For "fix findings":

1. Read `data/findings/all.json`.
2. Select critical/high findings first.
3. Open only the reported source file and nearby lines.
4. Apply focused fixes.
5. Re-run analysis and report what changed.
