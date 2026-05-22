# Usage Guide

This guide shows how to use Java Code Intelligence from the CLI and from Claude Code.

## Requirements

- Node.js 18+
- Java JDK 17+
- Maven
- A local Java or Spring Boot repository to analyze

## 1. Install And Build

Run from this analyzer project root:

```bash
npm install
npm run build
cd java-analyzer
mvn clean package
cd ..
```

The Java parser JAR must exist before indexing:

```text
java-analyzer/target/java-analyzer-1.0.0.jar
```

## 2. Analyze The Current Repository

If your current working directory is the Java repository to analyze:

```bash
npm run index
npm run analyze
```

## 3. Analyze Another Repository

Run from this analyzer project root and pass the target Java repository:

```bash
npm run index -- --repo-root C:/path/to/java-service
npm run analyze
```

Set a readable service name:

```bash
npm run index -- --repo-root C:/path/to/java-service --repo-name java-service
npm run analyze
```

## 4. Focus Analysis

Run only bug rules:

```bash
npm run analyze -- --bugs-only
```

Run only security rules:

```bash
npm run analyze -- --security-only
```

Write JSON reports without console report:

```bash
npm run analyze -- --json
```

Write reports to a custom directory:

```bash
npm run analyze -- --output data/custom-findings
```

## 5. Read Reports

Reports are generated in:

```text
data/findings/all.json
data/findings/bugs.json
data/findings/security.json
```

Raw indexed graph data is generated in:

```text
data/raw/repo-analyses.json
```

When reviewing results, start with:

1. Critical findings
2. High findings
3. Security findings with higher confidence
4. Medium and low findings

Security findings are heuristic review leads. Confirm the source code before treating them as proven vulnerabilities.

## 6. Run Impact Analysis

After indexing, inspect the impact of changing a method:

```bash
npm run impact -- --function createOrder
```

The output includes:

- Direct callers
- Direct callees
- Impacted Spring routes
- Impacted repositories
- Risk score and risk level

## 7. Use With Claude Code Skill

Install the skill:

Windows PowerShell:

```powershell
.\scripts\install-claude-code-skill.ps1
```

macOS/Linux:

```bash
bash scripts/install-claude-code-skill.sh
```

Then start Claude Code:

```bash
claude
```

Invoke the skill:

```text
/java-code-intelligence analyze this repository
```

Or ask naturally:

```text
Use Java Code Intelligence to check this Spring Boot service for security issues.
```

## 8. Common Claude Code Prompts

Analyze all findings:

```text
/java-code-intelligence analyze this repository and summarize critical/high findings first.
```

Token-efficient analysis:

```text
/java-code-intelligence analyze this repository. Read reports first, do not scan source unless needed for critical/high findings.
```

Security only:

```text
/java-code-intelligence run security-only analysis for this repository.
```

Impact analysis:

```text
/java-code-intelligence show impact if I change createOrder.
```

Fix findings:

```text
/java-code-intelligence inspect the high severity findings and propose fixes.
```

Focused fix with less source reading:

```text
/java-code-intelligence fix only critical/high findings. Open only the reported files and nearby lines.
```

## 9. Suppress Known False Positives

Add a suppression comment on the same line or directly above the finding:

```java
// analyzer-ignore SEC-001 safe because input is allowlisted
statement.executeQuery(sql);
```

Then re-run:

```bash
npm run index -- --repo-root C:/path/to/java-service
npm run analyze
```

## Troubleshooting

### Java parser JAR not found

Build the Java analyzer:

```bash
cd java-analyzer
mvn clean package
cd ..
```

### Repository path not found

Use an absolute path for `--repo-root`:

```bash
npm run index -- --repo-root C:/projects/my-service
```

### No findings generated

Check:

- The target repository contains `.java` files.
- The target repository path is correct.
- `npm run index` completed successfully.
- `data/raw/repo-analyses.json` was generated.

### Claude Code does not use the skill

Call it directly:

```text
/java-code-intelligence analyze this repository
```

Or install it as a project skill:

```text
.claude/skills/java-code-intelligence/SKILL.md
```
