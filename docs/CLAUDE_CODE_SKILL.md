# Claude Code Skill Setup

This project can be used in Claude Code as a skill. You do not need an MCP server.

The skill source is:

```text
skills/java-code-intelligence/
```

## Option 1: Install As A Personal Skill

Use this when you want the skill available in every Claude Code project.

### Windows PowerShell

Run from this repository root:

```powershell
.\scripts\install-claude-code-skill.ps1
```

Manual equivalent:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills" | Out-Null
Copy-Item -Recurse -Force ".\skills\java-code-intelligence" "$env:USERPROFILE\.claude\skills\java-code-intelligence"
```

### macOS/Linux

Run from this repository root:

```bash
bash scripts/install-claude-code-skill.sh
```

Manual equivalent:

```bash
mkdir -p ~/.claude/skills
cp -R skills/java-code-intelligence ~/.claude/skills/java-code-intelligence
```

You can override the install root:

```bash
CLAUDE_SKILLS_DIR=/path/to/skills bash scripts/install-claude-code-skill.sh
```

## Option 2: Install As A Project Skill

Use this when you want the skill available only inside one repository.

### Windows PowerShell

Run from the target repository root:

```powershell
New-Item -ItemType Directory -Force ".\.claude\skills" | Out-Null
Copy-Item -Recurse -Force "C:\path\to\mcp-code-analyzer\skills\java-code-intelligence" ".\.claude\skills\java-code-intelligence"
```

Replace `C:\path\to\mcp-code-analyzer` with the real path to this analyzer project.

### macOS/Linux

Run from the target repository root:

```bash
mkdir -p .claude/skills
cp -R /path/to/mcp-code-analyzer/skills/java-code-intelligence .claude/skills/java-code-intelligence
```

Replace `/path/to/mcp-code-analyzer` with the real path to this analyzer project.

## Verify The Skill

Start Claude Code:

```bash
claude
```

Invoke the skill directly:

```text
/java-code-intelligence
```

Or ask naturally:

```text
Use Java Code Intelligence to analyze this repository.
```

## Skill Flow

### 1. User Invokes The Skill

Inside Claude Code, the user can invoke the skill directly:

```text
/java-code-intelligence analyze this repository
```

Or ask naturally:

```text
Use Java Code Intelligence to check this service for security issues.
```

### 2. Claude Locates The Analyzer

Claude Code must know two paths:

- Analyzer project root: this project, where `package.json`, `src/`, and `java-analyzer/` live.
- Target Java repository root: the Java/Spring Boot project to analyze.

If Claude Code is running inside this analyzer project, it can use the current directory as the analyzer root.

If Claude Code is running inside the target Java project, provide the analyzer path when needed:

```text
Analyzer project is at C:/Absolute_Softwares/Mcp-tool/mcp-code-analyzer. Analyze the current repository.
```

### 3. Claude Builds The Analyzer If Needed

Claude Code will use the skill instructions to run the analyzer CLI:

```bash
npm install
npm run build
cd java-analyzer
mvn clean package
cd ..
```

This only needs to be done once per fresh checkout or after dependency/parser changes.

### 4. Claude Indexes The Target Java Repository

For a target repository:

```bash
npm run index -- --repo-root C:/path/to/java-service
```

If the service name should be explicit:

```bash
npm run index -- --repo-root C:/path/to/java-service --repo-name java-service
```

Indexing writes:

```text
data/raw/repo-analyses.json
```

### 5. Claude Runs Analysis

Run all rules:

```bash
npm run analyze
```

Run only security rules:

```bash
npm run analyze -- --security-only
```

Run only bug rules:

```bash
npm run analyze -- --bugs-only
```

Reports are generated in:

```text
data/findings/all.json
data/findings/bugs.json
data/findings/security.json
```

### 6. Claude Reads And Summarizes Findings

Claude reads the JSON reports and summarizes findings in priority order:

1. Critical security findings
2. High severity findings
3. Medium and low findings
4. Suppression or false-positive notes

Each finding summary should include:

- `ruleId`
- `severity`
- `confidence`
- `file`
- `line`
- `remediation`

Security findings are heuristic. Claude should use language such as "potential", "likely", or "needs review" unless the code proves exploitability.

To reduce token usage, Claude should read reports before opening source files and should only inspect source around selected critical/high findings or when the user asks for fixes.

### 7. Claude Helps Fix Or Suppress Findings

For likely real issues, Claude can inspect the source code and propose or apply a fix.

For known false positives, Claude can add a suppression comment on the same line or directly above the finding:

```java
// analyzer-ignore SEC-001 safe because input is allowlisted
statement.executeQuery(sql);
```

### 8. Claude Re-runs Analysis

After fixes, Claude should re-run:

```bash
npm run index -- --repo-root C:/path/to/java-service
npm run analyze
```

Then confirm whether the target findings are gone or explain any remaining risk.

### 9. Optional Impact Analysis

Before changing a method, Claude can run:

```bash
npm run impact -- --function methodName
```

Claude should summarize direct callers, direct callees, impacted routes, impacted repositories, and risk level.

## Updating The Skill

After editing `skills/java-code-intelligence/SKILL.md`, reinstall or recopy the folder to the Claude Code skill location you use.

Personal install:

```powershell
.\scripts\install-claude-code-skill.ps1
```

or:

```bash
bash scripts/install-claude-code-skill.sh
```

For personal skills:

```text
~/.claude/skills/java-code-intelligence/
```

For project skills:

```text
.claude/skills/java-code-intelligence/
```
