# Project Guide

## Overview

Java Code Intelligence System is a local static analysis tool for Java and Spring Boot repositories. It indexes Java source code, builds an in-memory graph of methods, calls, classes, routes, dependency injections, try/catch blocks, string concatenation, prepared statement usage, and suppressions, then runs heuristic analyzers over that graph.

The project has two main surfaces:

- CLI analyzer in the repository root, used with `npm run index`, `npm run analyze`, and `npm run impact`.
- Claude Code skill in `skills/java-code-intelligence/`, which tells Claude Code how to run the analyzer through the local CLI.

The analyzer is pattern-based. Findings are review leads, not formal exploit proofs. Security findings such as SQL injection and command injection are intentionally described as potential and heuristic unless the inspected code proves otherwise.

## Repository Layout

```text
java-code-intelligence/
  README.md
  package.json
  src/
    cli/main.ts                 CLI command definitions
    app/index-repos.ts          Repository indexing flow
    app/run-analyze.ts          Bug and security analysis flow
    app/run-impact.ts           Impact analysis flow
    analyzers/                  Bug, security, impact, and risk logic
    core/                       Shared types and ID helpers
    graph/graph-store.ts        In-memory graph and lookup indexes
    parsers/java/java-parser.ts TypeScript adapter for the Java parser JAR
    registry/repo-registry.ts   Infers repository identity from the selected root
    reporters/                  Console and JSON report output
  java-analyzer/
    pom.xml
    src/main/java/.../Main.java JavaParser-based AST extractor
  skills/
    java-code-intelligence/
      SKILL.md                  Portable Claude Code skill instructions
  data/
    raw/                        Indexed repository graph output
    findings/                   Analysis reports
  docs/
    PROJECT_GUIDE.md            Architecture, flow, and workflow documentation
```

## Core Concepts

The analyzer infers the target repository from the current working directory or from an explicit `--repo-root` argument.

`java-analyzer/` is a Java 17 Maven project that uses JavaParser. It walks Java source files and emits JSON describing methods, calls, Spring stereotypes, routes, dependency injection, try/catch blocks, string concatenation, prepared statements, and suppression comments.

`src/parsers/java/java-parser.ts` runs the Java analyzer JAR with `java -jar`, parses its JSON output, and normalizes it into the TypeScript data model.

`GraphStore` stores all parsed symbols and relationships. It resolves calls using dependency injection, same-class matching, and unique global method-name matching. It also builds reverse caller indexes used by impact analysis.

`BugAnalyzer` and `SecurityAnalyzer` read from `GraphStore` and emit findings. Findings include rule ID, severity, confidence, location, optional CWE mapping, and remediation.

Reporters write human-readable console output and JSON reports.

## End-to-End Flow

### 1. Select the target repository

Use the current working directory:

```bash
npm run index
```

Or pass a repository root directly:

```bash
npm run index -- --repo-root C:/path/to/my-service
```

The repository/service name is inferred from the directory name. Override it when needed:

```bash
npm run index -- --repo-root C:/path/to/my-service --repo-name my-service
```

Only Java is currently supported. The analyzer treats the selected directory as one local Java backend repository.

### 2. Build dependencies

Install root Node dependencies and build the Java parser JAR.

```bash
npm install
cd java-analyzer
mvn clean package
cd ..
```

The TypeScript project can be compiled with:

```bash
npm run build
```

### 3. Index repositories

```bash
npm run index
```

This command:

1. Infers one repository from the current working directory, or uses `--repo-root` when provided.
2. Selects the parser for the repository language.
3. Runs the Java analyzer JAR against the selected path.
4. Normalizes Java parser output into TypeScript objects.
5. Adds the repository analysis to `GraphStore`.
6. Resolves method calls where possible.
7. Builds caller/callee indexes.
8. Writes raw graph data to `data/raw/repo-analyses.json`.

### 4. Run analysis

```bash
npm run analyze
```

This command:

1. Reads `data/raw/repo-analyses.json`.
2. Rebuilds `GraphStore`.
3. Resolves calls and indexes again.
4. Runs bug detection unless disabled.
5. Runs security detection unless disabled.
6. Removes duplicate findings.
7. Prints console output.
8. Writes JSON reports to `data/findings/`.

Generated files:

- `data/findings/all.json`
- `data/findings/bugs.json`
- `data/findings/security.json`

Focused modes:

```bash
npm run analyze -- --bugs-only
npm run analyze -- --security-only
npm run analyze -- --json
npm run analyze -- --output data/custom-findings
```

### 5. Run impact analysis

```bash
npm run impact -- --function createOrder
```

Impact analysis reads the indexed graph and finds matching methods by name. For each match, it reports direct callers, direct callees, impacted Spring routes, impacted repositories, and a risk score.

Use this before changing a method when you want to understand which routes and callers might be affected.

## Detection Rules

### BUG-001: Unsafe Optional.get()

Flags likely `Optional.get()` usage without a local `isPresent`, `isEmpty`, `orElse`, or `orElseThrow` guard in the same method.

- Category: bug
- Typical severity: medium, high in controllers
- Confidence: 75

### BUG-002: Potential Resource Leak

Flags try/catch blocks that do not use try-with-resources and contain I/O-like operations such as `read`, `write`, `execute`, `query`, or `connect`.

- Category: bug
- Typical severity: medium or high
- Confidence: 70

### BUG-003: Empty Catch Block

Flags catch blocks with no statements.

- Category: bug
- Typical severity: low or medium
- Confidence: 95

### SEC-001: Potential SQL Injection

Flags SQL execution methods such as `execute`, `executeQuery`, and `executeUpdate` when they appear in risky contexts, especially controllers or code outside repository/service layers. Confidence rises when SQL string concatenation is detected and drops when parameterized `PreparedStatement` usage is detected.

- Category: security
- CWE: CWE-89
- Typical severity: medium, high, or critical
- Confidence: 50 to 90

### SEC-002: Potential Command Injection

Flags command execution patterns such as `Runtime.exec`, `ProcessBuilder`, and `start`, especially in controllers or exported methods. Confidence rises when command string concatenation and method parameters are detected.

- Category: security
- CWE: CWE-78
- Typical severity: high or critical
- Confidence: 65 to 95

## Suppressions

Suppress a known false positive with an inline comment on the same line or directly above the flagged line.

```java
// analyzer-ignore SEC-001 safe because the query is generated from an allowlisted report ID
statement.executeQuery(sql);
```

The current matcher checks the same line and previous line for the same file and rule ID.

## Claude Code Skill Flow

The Claude Code skill is the preferred integration. It lives at `skills/java-code-intelligence/SKILL.md`.

Use it by copying or installing the folder into a Claude Code skills directory, such as:

```text
~/.claude/skills/java-code-intelligence/
```

When triggered, the skill tells Claude Code to:

1. Build the analyzer if needed.
2. Run `npm run index -- --repo-root <target-java-repo>`.
3. Run `npm run analyze` or a focused mode.
4. Read `data/findings/*.json`.
5. Summarize findings as heuristic review leads.

For Claude Code install commands, see [CLAUDE_CODE_SKILL.md](CLAUDE_CODE_SKILL.md).

## How To Work On The Project

### Add or tune a rule

1. Decide whether the rule belongs in `src/analyzers/bug-analyzer.ts` or `src/analyzers/security-analyzer.ts`.
2. Check whether the Java parser already extracts the data needed by the rule.
3. If new AST data is required, update `java-analyzer/src/main/java/com/company/analyzer/Main.java`.
4. Map any new parser fields in `src/parsers/java/java-parser.ts`.
5. Add or update TypeScript interfaces in `src/core/types.ts`.
6. Use `GraphStore` helpers or add a focused helper if the rule needs graph queries.
7. Emit findings with stable `ruleId`, clear `message`, useful `confidence`, and actionable `remediation`.
8. Run `npm run index` and `npm run analyze` against a test repository.

### Add parser output

1. Extend the Java analyzer output model.
2. Extract the data with JavaParser AST traversal.
3. Include the data in the Java analyzer JSON response.
4. Normalize IDs in `src/parsers/java/java-parser.ts`.
5. Store the data in `GraphStore`.
6. Add helpers only when multiple analyzers need the same query.

### Update reporting

Console output lives in `src/reporters/console-reporter.ts`. JSON output lives in `src/reporters/json-reporter.ts`. Keep JSON shape stable because scripts, skills, and downstream automation can read those files.

### Update Claude Code skill behavior

Skill instructions live in `skills/java-code-intelligence/SKILL.md`. Keep the skill concise and focused on commands, output locations, rule interpretation, and finding summary guidance.

## Development Commands

```bash
npm install
npm run build
cd java-analyzer && mvn clean package && cd ..
npm run index
npm run index -- --repo-root C:/path/to/my-service
npm run index -- --repo-root C:/path/to/my-service --repo-name my-service
npm run analyze
npm run analyze -- --bugs-only
npm run analyze -- --security-only
npm run impact -- --function methodName
```

## Outputs And Data Contracts

Raw indexed data:

```text
data/raw/repo-analyses.json
```

Findings:

```text
data/findings/all.json
data/findings/bugs.json
data/findings/security.json
```

Each finding contains:

- `id`
- `category`
- `severity`
- `ruleId`
- `ruleName`
- `message`
- `repo`
- `file`
- `line`
- `functionId`
- `className`
- `confidence`
- `cwe`
- `remediation`

## Known Limitations

- No taint analysis.
- No control-flow graph.
- No deep inter-procedural data flow.
- No full Java type inference.
- Call resolution is heuristic and can miss polymorphism, reflection, and interface dispatch.
- Security findings can be false positives when safe parameterization or validation happens outside the detected pattern.
- Analysis is local-only and Java-only.

Treat findings as prioritized code review leads. Critical and high findings should be inspected first, especially when they are in controllers, public methods, or request-handling paths.
