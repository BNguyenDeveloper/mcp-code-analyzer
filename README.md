# Java Code Intelligence System

Static analysis tool for Java/Spring Boot detecting bugs and security vulnerabilities.

**Status**: Phase 5 complete (Production ready)

## Quick Start

See [QUICK_START.md](QUICK_START.md) for detailed setup and usage.

## Documentation

- [QUICK_START.md](QUICK_START.md) - Setup and usage guide
- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) - Architecture and design
- [DECISIONS.md](DECISIONS.md) - Architectural decisions

## Commands

```bash
npm install              # Install dependencies
cd java-analyzer && mvn clean package && cd ..  # Build Java parser

npm run index            # Index repositories
npm run analyze          # Run bug + security detection
npm run impact -- --function methodName  # Impact analysis
```

## Features

- **Bug Detection**: Null pointer risks, resource leaks, infinite loops
- **Security Analysis**: SQL injection, command injection detection
- **Impact Analysis**: Trace function calls and dependencies
- **Smart Detection**: AST-based concatenation detection, PreparedStatement awareness
- **Suppression Support**: `// analyzer-ignore <RULE_ID>` comments
