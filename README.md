# Java Code Intelligence System

Static analysis tool for Java and Spring Boot repositories. It indexes source code, builds a method and class relationship graph, then runs heuristic bug, security, and impact analysis.

**Status**: Production-ready local analyzer.

## Quick Start

```bash
npm install
cd java-analyzer
mvn clean package
cd ..

npm run index
npm run analyze
```

By default, `npm run index` analyzes the current working directory. To analyze another Java repository without editing any config file, pass `--repo-root`:

```bash
npm run index -- --repo-root C:/path/to/my-service
npm run analyze
```

You can also set the service/repository name explicitly:

```bash
npm run index -- --repo-root C:/path/to/my-service --repo-name my-service
```

Generated reports are written to:

- `data/findings/all.json`
- `data/findings/bugs.json`
- `data/findings/security.json`

## Documentation

- [docs/USAGE.md](docs/USAGE.md) - How to install, run, analyze, read reports, and use the Claude Code skill
- [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md) - Project details, architecture, flow, skill usage, and development workflow
- [docs/CLAUDE_CODE_SKILL.md](docs/CLAUDE_CODE_SKILL.md) - How to install this project as a Claude Code skill
- [skills/java-code-intelligence/SKILL.md](skills/java-code-intelligence/SKILL.md) - Portable Claude Code skill for using the analyzer through the local CLI

## How It Works

1. `npm run index` infers the Java repository from the current working directory, or from `--repo-root`.
2. The command runs the JavaParser-based analyzer JAR against that repository.
3. The TypeScript parser adapter normalizes Java parser output into shared project types.
4. `GraphStore` stores methods, calls, classes, routes, dependency injection, try/catch blocks, string concatenation, prepared statement usage, and suppressions.
5. The graph resolves method calls using dependency injection, same-class matching, and unique method-name matching.
6. `npm run analyze` runs bug and security analyzers over the graph.
7. Console and JSON reporters summarize findings.
8. `npm run impact -- --function methodName` traces callers, callees, impacted routes, and risk for a method.

## Commands

```bash
npm run build                         # Compile TypeScript
npm run index                         # Index current working directory
npm run index -- --repo-root C:/repo  # Index a specific Java repository
npm run analyze                       # Run bug and security detection
npm run analyze -- --bugs-only        # Run only bug rules
npm run analyze -- --security-only    # Run only security rules
npm run analyze -- --json             # Write JSON without console report
npm run impact -- --function saveUser # Analyze impact for a method
```

## Features

- **Bug Detection**: Unsafe `Optional.get()`, resource leak patterns, empty catch blocks
- **Security Analysis**: Potential SQL injection and command injection patterns
- **Impact Analysis**: Trace function calls and dependencies
- **Smart Detection**: AST-based concatenation detection, PreparedStatement awareness
- **Suppression Support**: `// analyzer-ignore <RULE_ID>` comments
- **Claude Code Skill**: Use the analyzer from Claude Code through the local CLI

## Claude Code Skill

Use the repo-local skill at:

```text
skills/java-code-intelligence/SKILL.md
```

Install or copy that folder into your Claude Code skills directory, for example:

```text
~/.claude/skills/java-code-intelligence/
```

Quick install from this repository:

```powershell
.\scripts\install-claude-code-skill.ps1
```

or:

```bash
bash scripts/install-claude-code-skill.sh
```

Then ask Claude Code to use the `java-code-intelligence` skill to analyze a Java repository. The skill tells Claude Code to run the local CLI commands directly:

```bash
npm run index -- --repo-root C:/path/to/java-service
npm run analyze
```

For Claude Code installation steps, see [docs/CLAUDE_CODE_SKILL.md](docs/CLAUDE_CODE_SKILL.md).

See [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md) for the full flow and maintenance notes.
