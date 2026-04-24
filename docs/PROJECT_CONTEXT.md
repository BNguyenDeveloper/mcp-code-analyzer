# PROJECT_CONTEXT.md

## Project Overview

**Name**: Java Code Intelligence System - Phase 2  
**Purpose**: Static analysis tool for Java/Spring Boot codebases detecting bugs and security vulnerabilities  
**Approach**: Pattern-based heuristic detection using AST analysis and call graph traversal  
**Language**: TypeScript (orchestration) + Java (JavaParser-based AST analyzer)

## Current Status

**Phases Completed**: 5 of 5 (MVP complete)  
**Production Ready**: Yes  
**Last Updated**: 2026-04-21

### Phase Summary

- **Phase 1** (Foundation): Finding types, GraphStore with bidirectional indexes, analyzer interface, reporters
- **Phase 2** (Bug Detection): 3 rules - Unsafe Optional.get(), Resource leaks, Empty catch blocks
- **Phase 3** (Security Detection): 2 rules - SQL injection (SEC-001), Command injection (SEC-002)
- **Phase 4** (Polish): Context-aware severity, deduplication, enhanced reporting, version tracking
- **Phase 5** (Accuracy): AST-based string concatenation detection, PreparedStatement detection, suppression mechanism

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLI (main.ts)                        │
│              index | analyze | impact                   │
└───────────────────┬─────────────────────────────────────┘
                    │
        ┌───────────▼───────────┐
        │  run-analyze.ts       │
        │  run-impact.ts        │
        │  index-repos.ts       │
        └───────────┬───────────┘
                    │
        ┌───────────▼────────────────────────┐
        │      Java Analyzer (JAR)           │
        │   - JavaParser AST traversal       │
        │   - Extracts: functions, calls,    │
        │     classes, routes, try-catch,    │
        │     string concat, suppressions    │
        └───────────┬────────────────────────┘
                    │
        ┌───────────▼───────────┐
        │  RepoAnalysis (JSON)  │
        │  data/raw/repo-analyses.json │
        └───────────┬───────────┘
                    │
        ┌───────────▼───────────────────────┐
        │      GraphStore                   │
        │  - Functions, Calls, Classes      │
        │  - Bidirectional indexes          │
        │  - Call resolution via DI         │
        │  - Helper methods                 │
        └───────────┬───────────────────────┘
                    │
        ┌───────────▼────────────┬──────────────────┐
        │                        │                  │
   ┌────▼─────┐          ┌──────▼────────┐   ┌─────▼──────┐
   │  BugAnalyzer │       │ SecurityAnalyzer │ │ ImpactEngine │
   │  - BUG-001   │       │  - SEC-001      │  │ (risk calc) │
   │  - BUG-002   │       │  - SEC-002      │  └────────────┘
   │  - BUG-003   │       └─────────────────┘
   └──────────────┘
                    │
            ┌───────▼────────┬───────────────────────┤
            │                │                       │
   ┌────────▼─────┐   ┌──────▼────────┐    ┌───────▼──────┐
   │ ConsoleReporter │ │  JSONReporter  │    │ Finding[]    │
   │ - Groupings    │  │ - all.json     │    │ - Suppressed │
   │ - Top risks    │  │ - bugs.json    │    │ - Deduped    │
   └────────────────┘  │ - security.json│    └──────────────┘
                       └─────────────────┘
```

## Core Components

### 1. Java Analyzer (`java-analyzer/`)

**Technology**: Java 17 + JavaParser 3.25.10  
**Build**: Maven  
**Output**: JSON (`RepoAnalysis`)

**Extracts**:
- Functions/methods (with class, line, exported status)
- Method calls (with scope, callee name)
- Classes (with Spring stereotypes: @Controller, @Service, @Repository)
- Routes (@GetMapping, @PostMapping, etc.)
- Dependency injections (@Autowired, constructor)
- Try-catch blocks (with emptiness, resources)
- String concatenations (BinaryExpr with + operator)
- PreparedStatement usage (with parameterization)
- Suppression comments (`// analyzer-ignore RULE-ID`)

**Key**: All pattern extraction happens here via AST traversal. No dynamic analysis.

### 2. GraphStore (`src/graph/graph-store.ts`)

**Purpose**: In-memory graph database for code relationships

**Data Structures**:
```typescript
functions: Map<string, FunctionSymbol>
calls: CallRelation[]
classes: JavaClassInfo[]
routes: RouteInfo[]
injections: InjectionInfo[]
tryCatchBlocks: TryCatchInfo[]
stringConcats: StringConcatInfo[]
preparedStatements: PreparedStatementInfo[]
suppressions: SuppressionInfo[]
```

**Indexes**:
- `callersIndex`: Map<calleeId, Set<callerIds>> - O(1) reverse lookup

**Key Methods**:
- `resolveCallsByName()`: Links calls to callees via method name matching
- `getDirectCallers()`, `getDirectCallees()`: Bidirectional traversal
- `isSuppressed()`: Check if finding should be filtered
- `usesPreparedStatement()`, `usesParameterization()`: Reduce false positives
- `getCallChain()`: Multi-hop traversal (depth 2-3)

**Call Resolution Strategy**:
1. Check DI: If scope matches injected field, resolve to injected class
2. Check same-class: If no scope or scope="this", resolve within class
3. Fallback: Match by simple method name

### 3. Analyzers (`src/analyzers/`)

**Interface**:
```typescript
interface Analyzer {
  name: string;
  category: "bug" | "security";
  analyze(store: GraphStore): Finding[];
}
```

**BugAnalyzer** (3 rules):
- BUG-001: Unsafe Optional.get() - Detects get() without isPresent/isEmpty/orElse (75% conf)
- BUG-002: Resource leak - Try-catch without try-with-resources + I/O calls (70% conf)
- BUG-003: Empty catch block - Catch with no statements (95% conf)

**SecurityAnalyzer** (2 rules):
- SEC-001: SQL injection - SQL execution in Controllers or outside Repository/Service (60-90% conf)
- SEC-002: Command injection - Runtime.exec/ProcessBuilder in Controllers (65-95% conf)

**Confidence Tuning**:
- Base confidence (pattern match)
- +25% if AST detects + operator in SQL/command context
- +10-15% if method has parameters
- Skip if PreparedStatement with ? placeholders (SEC-001 only)

**Severity Tuning**:
- Controllers/public methods: Higher severity (user-facing)
- Service/Repository: Lower severity (internal)
- Database I/O: Higher severity than file I/O

### 4. Reporters (`src/reporters/`)

**ConsoleReporter**:
- Summary (total, by severity, by category)
- Top risky classes (most critical/high issues)
- Findings by rule (occurrence counts)
- Findings by class (issue distribution)
- Top 10 detailed findings

**JSONReporter**:
- `all.json`: All findings
- `bugs.json`: Bug findings only
- `security.json`: Security findings only
- Includes `version: "1.0"` field

### 5. Impact Engine (`src/analyzers/impact-engine.ts`)

**Purpose**: Analyze impact of changing a function

**Outputs**:
- Direct callers/callees
- Impacted routes (Spring endpoints)
- Impacted files/repos
- Risk score (0-100)
- Risk level (Low/Medium/High)

**Usage**: `npm run impact -- --function methodName`

## Detection Rules

### BUG-001: Unsafe Optional.get()

**Pattern**: `get()` call + Optional-related methods in same function, no guard
**Detection**: Method call analysis
**Confidence**: 75%
**Severity**: Medium (Service) → High (Controller)
**False Positives**: Guards in other methods
**False Negatives**: Optional from different libraries

### BUG-002: Potential Resource Leak

**Pattern**: Try-catch without try-with-resources + I/O method calls
**Detection**: Try-catch structure + method call analysis
**Confidence**: 70%
**Severity**: Medium (file I/O) → High (DB/network)
**False Positives**: Resources closed in finally blocks
**False Negatives**: Variable lifecycle tracking needed

### BUG-003: Empty Catch Block

**Pattern**: Catch block with zero statements
**Detection**: Direct AST check
**Confidence**: 95%
**Severity**: Low (internal) → Medium (public/Controller)
**False Positives**: Very rare (intentionally empty for specific reasons)
**False Negatives**: None (pattern is direct)

### SEC-001: Potential SQL Injection (Heuristic)

**Pattern**: SQL execution (execute/executeQuery/executeUpdate) in Controller OR outside Repository/Service
**Detection**: Method call + class stereotype
**Enhancements**:
- +25% confidence if AST detects + operator with SQL keywords
- Skip if PreparedStatement with ? placeholders detected
- +10% confidence if method has parameters

**Confidence**: 60-90%
- 90%: + operator in SQL string
- 75%: Method with parameters
- 65%: Base (Controller executing SQL)
- 60%: Outside Repository/Service

**Severity**: Critical (Controller) → High (other)
**CWE**: CWE-89

**Limitations**:
- Cannot detect SQL injection in service layer without taint analysis
- Cannot verify if PreparedStatement.setString() actually called
- May flag parameterized queries in Controllers (architectural smell still valid)

### SEC-002: Potential Command Injection (Heuristic)

**Pattern**: Runtime.exec() or ProcessBuilder in Controller OR exported method
**Detection**: Method call (exec, ProcessBuilder, start) + class stereotype
**Enhancements**:
- +20% confidence if AST detects + operator with command keywords
- +15% confidence if has concatenation + parameters

**Confidence**: 65-95%
- 95%: + operator + parameters
- 90%: + operator in command
- 80%: Method with parameters
- 75%: Base (Controller executing command)
- 65%: Exported method

**Severity**: Critical (Controller) → High (exported)
**CWE**: CWE-78

**Limitations**:
- Cannot track if user input reaches command without taint analysis
- May flag safe hardcoded commands (use suppression)

## Key Design Principles

### 1. Pattern-Based Only

**What we do**: Match AST patterns, method calls, class structures  
**What we don't do**: Data flow analysis, taint tracking, value propagation

**Why**: Simplicity, speed, predictability, MVP scope

### 2. Heuristic-Based Detection

**All findings marked**: "Potential" and "Heuristic"  
**Confidence scores**: 60-95% (never 100%)  
**Philosophy**: Better to flag architectural smells than miss real vulnerabilities

### 3. Explainable Rules

**Each rule has**:
- Clear pattern description
- Detection logic explanation
- Known limitations documented
- Example vulnerable code
- Remediation advice

**No black boxes**: Developers understand why code was flagged

### 4. False Positive Management

**Strategies**:
1. PreparedStatement detection (skip safe code)
2. Suppression comments (developer override)
3. Context-aware severity (prioritize user-facing)
4. Confidence scores (indicate certainty)

**Trade-off**: Accept some false positives for architectural value

### 5. Zero Breaking Changes

**All 5 phases**: Additive only  
**All improvements**: Backward compatible  
**Philosophy**: Stability over feature velocity

## Important Constraints

### What We Intentionally Do NOT Do

#### 1. No Taint Analysis
**Not doing**: Track data flow from source (user input) to sink (SQL/command)  
**Why**: Complex, slow, scope creep beyond MVP  
**Alternative**: Pattern-based + architectural guidance  
**Future**: v2.0 may add simple taint tracking (2-3 hops)

#### 2. No Control Flow Graphs
**Not doing**: Build CFG, analyze branches, loops  
**Why**: Over-engineering for current rules  
**Alternative**: Direct AST pattern matching  
**Future**: Not planned unless specific rule needs it

#### 3. No Inter-Procedural Analysis (Deep)
**Not doing**: Track data across multiple method calls  
**Why**: Requires complex points-to analysis  
**Alternative**: Call chain traversal (depth 2-3, infrastructure ready)  
**Future**: v2.0 may use for taint analysis

#### 4. No Type Inference
**Not doing**: Infer types of variables  
**Why**: JavaParser provides basic types, complex inference not needed  
**Alternative**: Heuristics (method names, class stereotypes)  
**Future**: Not planned

#### 5. No Framework-Specific Deep Analysis
**Not doing**: Spring Security policy analysis, ORM query optimization  
**Why**: Requires framework internals knowledge  
**Alternative**: General patterns (SQL execution, command execution)  
**Future**: Could add Spring-specific rules in v1.5+

#### 6. No Value Analysis
**Not doing**: Track concrete values of variables  
**Why**: Requires symbolic execution or abstract interpretation  
**Alternative**: Structural patterns only  
**Future**: Not planned

## Current Capabilities

### Detection
- ✅ 5 detection rules (3 bug, 2 security)
- ✅ Confidence scoring (60-95%)
- ✅ CWE mapping (CWE-89, CWE-78)
- ✅ Context-aware severity
- ✅ Suppression mechanism (inline comments)
- ✅ PreparedStatement false positive reduction
- ✅ AST-based string concatenation detection
- ✅ Deduplication (same file/line/rule)

### Analysis
- ✅ Spring Boot route extraction
- ✅ Dependency injection resolution
- ✅ Call graph construction
- ✅ Bidirectional indexes (caller/callee)
- ✅ Impact analysis (callers, callees, routes, risk)
- ✅ Call chain traversal (depth 2-3)

### Reporting
- ✅ Console output (grouped by class, rule, severity)
- ✅ JSON output (all, bugs, security)
- ✅ Top risky classes identification
- ✅ Remediation advice
- ✅ Version tracking

### CLI
- ✅ `npm run index` - Index repositories
- ✅ `npm run analyze` - Run analysis
- ✅ `npm run analyze --bugs-only` - Bug detection only
- ✅ `npm run analyze --security-only` - Security only
- ✅ `npm run analyze --json` - JSON output only
- ✅ `npm run impact -- --function X` - Impact analysis

## Known Limitations

### Detection Limitations

**String Concatenation**:
- Only detects + operator when one side is StringLiteralExpr
- Misses: `String s = "SELECT"; s = s + " FROM users";`
- Acceptable: Most vulnerable code has at least one literal

**PreparedStatement Detection**:
- Detects prepareStatement() call and ? placeholders
- Does NOT verify setString()/setInt() actually called
- May skip code that would fail at runtime
- Acceptable: Better to skip than false positive

**Optional.get() Detection**:
- Heuristic: Checks if Optional methods called in same function
- Misses: Guard checks in other methods
- May flag: Optional from non-JDK libraries
- Acceptable: Encourages local guard checks

**Resource Leak Detection**:
- Pattern: Try-catch without try-with-resources + I/O methods
- Misses: Resources properly closed in finally blocks
- May flag: Framework-managed resources
- Acceptable: Architectural smell is valid

**SQL/Command Injection**:
- Cannot prove user input reaches SQL/command (no taint analysis)
- Cannot detect injection in service layer
- Cannot handle complex multi-hop paths
- Acceptable: Flags architectural smells + obvious patterns

### Architectural Limitations

**Call Resolution**:
- Resolves via: DI, same-class, simple name matching
- Misses: Interface calls without DI, polymorphism, reflection
- Accuracy: ~70-80% for typical Spring Boot apps

**Suppression**:
- ±2 line tolerance can suppress wrong findings
- No project-wide suppression config (only inline comments)
- Future: Add `.analyzer-ignore.json` in v1.2

**Performance**:
- Pattern-based, so relatively fast
- GraphStore is in-memory (limited by RAM)
- No incremental analysis (re-analyzes entire codebase)

## Design Philosophy

### 1. Practical Over Perfect

We choose patterns that catch 80% of real vulnerabilities over complex analysis that catches 95% but is fragile and slow.

### 2. Transparency Over Black Box

Every finding explains its detection logic, confidence, and limitations. Developers should understand and trust the tool.

### 3. Architectural Guidance Over Proof

Flagging Controllers executing SQL is valuable even without proving user input reaches it. Bad architecture increases risk.

### 4. Developer Empowerment

Suppression mechanism lets developers manage false positives without modifying the analyzer. They know their code best.

### 5. Stability Over Features

5 phases completed with zero breaking changes. Incremental improvement without disruption.

### 6. Documentation as Code

Comprehensive phase documentation captures rationale, trade-offs, and decisions for future maintainers.

## Future Directions

### v1.2 - Quick Wins (2-3 weeks)
- Detect StringBuilder.append() in SQL/command context
- Add suppression config file (`.analyzer-ignore.json`)
- Detect more PreparedStatement patterns (CallableStatement)
- More I/O method patterns (open, close, flush)

### v1.5 - More Rules (4-6 weeks)
- CSRF detection (missing tokens in POST endpoints)
- XSS detection (unescaped output in templates)
- Path traversal (file operations with user input patterns)
- Insecure deserialization
- Hardcoded credentials
- Insecure random number generation

### v2.0 - Taint Analysis (8-12 weeks)
- Track @PathVariable, @RequestParam, @RequestBody through call chains
- Use existing call chain infrastructure (depth 2-3)
- Confirm SQL/command injection with data flow proof
- Increase confidence to 95%+ with taint evidence
- Still pattern-based (no symbolic execution)

### v2.5 - SARIF & Integration (4-6 weeks)
- SARIF reporter for GitHub Code Scanning
- IDE plugins (VS Code, IntelliJ)
- CI/CD integration examples (GitHub Actions, GitLab CI)
- Web dashboard (optional)

### v3.0 - Advanced Analysis (12+ weeks)
- Inter-procedural taint analysis (deeper than 2-3 hops)
- Framework-specific rules (Spring Security, etc.)
- Cross-file analysis (currently single-repo)
- Incremental analysis (only changed files)

## Critical Files

**Entry Points**:
- `src/cli/main.ts` - CLI commands
- `src/app/index-repos.ts` - Indexing orchestration
- `src/app/run-analyze.ts` - Analysis orchestration

**Core Logic**:
- `src/graph/graph-store.ts` - Graph database
- `src/analyzers/bug-analyzer.ts` - Bug detection rules
- `src/analyzers/security-analyzer.ts` - Security detection rules

**Data Extraction**:
- `java-analyzer/src/main/java/com/company/analyzer/Main.java` - AST traversal

**Configuration**:
- `repos.json` - Repository configuration
- `package.json` - npm scripts

**Documentation**:
- `IMPLEMENTATION_COMPLETE.md` - Project summary
- `PHASE1-5_COMPLETE.md` - Detailed phase documentation
- `QUICK_START.md` - User guide
- `DECISIONS.md` - Architectural decisions
- `PROJECT_CONTEXT.md` - This file

## Testing Strategy

**Current**:
- Integration tests via `npm run analyze` on test code
- Manual verification of findings
- Test files: `test-java-code/src/main/java/com/example/*.java`

**Test Coverage**:
- BUG-001: Optional.get() without guards ✅
- BUG-002: Try-catch resource leaks ✅
- BUG-003: Empty catch blocks ✅
- SEC-001: SQL injection patterns ✅
- SEC-002: Command injection patterns ✅
- PreparedStatement detection ✅
- Suppression filtering ✅
- String concatenation detection ✅

**Missing** (future):
- Unit tests for individual analyzer methods
- Regression test suite
- Performance benchmarks

## Dependencies

**Runtime**:
- Node.js (TypeScript execution)
- Java 17+ (for java-analyzer JAR)

**NPM Packages**:
- `commander` - CLI framework
- `fs-extra` - File system utilities

**Java Dependencies**:
- JavaParser 3.25.10 - AST parsing
- Jackson - JSON serialization

**Build Tools**:
- TypeScript compiler
- Maven (for Java analyzer)

## Performance Characteristics

**Indexing** (test-java-code, 5 classes, 23 functions):
- Parse time: ~2.7s
- Graph build: ~0.1s
- Total: ~2.8s

**Analysis** (5 rules, 23 functions):
- Bug detection: ~0.1s
- Security detection: ~0.2s
- Reporting: ~0.05s
- Total: ~0.35s

**Memory**:
- GraphStore: ~48MB for test codebase
- Scales linearly with codebase size

**Bottlenecks**:
- JavaParser (AST parsing) - largest time cost
- GraphStore in-memory - RAM limit for very large codebases
- No incremental analysis - re-parses everything

## Configuration

**Repository Config** (`repos.json`):
```json
[
  {
    "name": "my-app",
    "path": "/path/to/code",
    "language": "java",
    "type": "backend"
  }
]
```

**Suppression** (inline):
```java
// analyzer-ignore SEC-001 This is safe because X
stmt.executeQuery(sql);

// @suppress BUG-002 Framework manages resource
fis.read(data);
```

**CLI Options**:
```bash
npm run analyze              # All detections
npm run analyze --bugs-only  # Bugs only
npm run analyze --security-only # Security only
npm run analyze --json       # JSON output only
npm run analyze --output dir # Custom output
```

## Maintenance Notes

**Adding New Rules**:
1. Add detection logic to analyzer (bug-analyzer.ts or security-analyzer.ts)
2. Add test case to test-java-code/
3. Run analysis and verify detection
4. Document in PHASEX_COMPLETE.md
5. No breaking changes allowed

**Modifying Existing Rules**:
- OK: Increase confidence/accuracy
- OK: Reduce false positives
- NOT OK: Remove detections (breaking for users)
- NOT OK: Change finding IDs (breaks suppressions)

**Cleanup Policy**:
- Delete only "safe to delete" items (proven unused)
- Keep items marked "uncertain" (conservative)
- Document all deletions in CLEANUP_APPLIED.md

**Documentation Requirements**:
- Every phase gets PHASEX_COMPLETE.md
- Trade-offs and limitations documented
- Test results included
- No marketing language

---

**Project**: Java Code Intelligence System  
**Status**: Production Ready (Phase 5 complete)  
**Architecture**: Pattern-based static analysis  
**Philosophy**: Practical, explainable, stable  
**Next**: v1.2 quick wins or v2.0 taint analysis
