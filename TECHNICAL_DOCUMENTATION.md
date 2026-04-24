# Technical Documentation: mcp-code-analyzer

**Document Version:** 1.1.0  
**Last Updated:** 2026-04-24  
**Implementation Version:** v1.1.0 (includes correctness improvements)  
**Project Status:** Functional (Phase 5 complete, ongoing improvements)  
**Target Audience:** New developers joining the project

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Data Flow](#data-flow)
4. [Core Components](#core-components)
5. [Detection Rules](#detection-rules)
6. [Function Call Flow](#function-call-flow)
7. [Business Rules](#business-rules)
8. [Dependencies](#dependencies)
9. [Risky and Unclear Logic](#risky-and-unclear-logic)
10. [Configuration](#configuration)
11. [Extension Points](#extension-points)

---

## 1. Project Overview

### Purpose
**mcp-code-analyzer** is a static analysis tool for Java/Spring Boot codebases that detects bugs and security vulnerabilities using pattern-based heuristics and AST (Abstract Syntax Tree) analysis.

### Key Characteristics
- **Approach:** Pattern-based detection (NOT data flow / taint analysis)
- **Technology Stack:** TypeScript (orchestration) + Java (JavaParser for AST)
- **Analysis Type:** Heuristic-based with confidence scores (60-95%)
- **Target:** Java/Spring Boot applications
- **Output:** JSON reports + console output with findings grouped by severity

### What It Does
1. Parses Java source code into AST using JavaParser
2. Extracts code patterns: functions, calls, classes, routes, injections, try-catch blocks
3. Builds in-memory call graph with bidirectional indexes
4. Runs detection rules for bugs and security issues
5. Filters out suppressed findings
6. Generates findings with severity, confidence, and remediation advice

### What It Does NOT Do
- ❌ Data flow / taint analysis
- ❌ Control flow graph construction
- ❌ Type inference
- ❌ Deep inter-procedural analysis (limited to 2-3 hops)
- ❌ Value tracking / symbolic execution
- ❌ Framework-specific deep analysis (Spring Security internals, etc.)

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Entry Point                          │
│                    (src/cli/main.ts)                        │
│                                                             │
│  Commands: index | analyze | impact                        │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────▼────────────────────────────┐
        │       Application Layer                 │
        │  - src/app/index-repos.ts              │
        │  - src/app/run-analyze.ts              │
        │  - src/app/run-impact.ts               │
        └────────────┬────────────────────────────┘
                     │
        ┌────────────▼─────────────────────────────┐
        │      Parser Layer                        │
        │  - JavaParserAdapter (TS wrapper)        │
        │  - Calls Java Analyzer JAR               │
        └────────────┬─────────────────────────────┘
                     │ spawn java process
        ┌────────────▼────────────────────────────────┐
        │      Java Analyzer (JAR)                    │
        │  - com.company.analyzer.Main                │
        │  - Uses JavaParser 3.25.10                  │
        │  - AST Traversal & Pattern Extraction       │
        │  - Outputs JSON                             │
        └────────────┬────────────────────────────────┘
                     │ JSON output
        ┌────────────▼────────────────────────────────┐
        │      Data Storage                           │
        │  - data/raw/repo-analyses.json              │
        │  - Raw AST extraction data                  │
        └────────────┬────────────────────────────────┘
                     │
        ┌────────────▼────────────────────────────────┐
        │      GraphStore (In-Memory)                 │
        │  - Loads JSON data                          │
        │  - Builds call graph                        │
        │  - Creates bidirectional indexes            │
        │  - Call resolution (DI-aware)               │
        └────────────┬────────────────────────────────┘
                     │
        ┌────────────▼──────────┬─────────────────────┐
        │                       │                     │
   ┌────▼───────┐       ┌──────▼──────┐      ┌──────▼────────┐
   │ BugAnalyzer│       │SecurityAnalyzer│    │ ImpactEngine  │
   │ (3 rules)  │       │  (2 rules)    │    │(risk analysis)│
   └────┬───────┘       └──────┬────────┘    └───────────────┘
        │                      │
        │   ┌──────────────────┘
        │   │
   ┌────▼───▼────┐
   │  Findings[] │ (deduplicated, suppression-filtered)
   └────┬────────┘
        │
   ┌────▼──────────────┬─────────────────┐
   │                   │                 │
┌──▼─────────┐  ┌──────▼──────┐  ┌──────▼───────┐
│Console     │  │JSON Reporter│  │ MCP Server   │
│Reporter    │  │(all/bugs/   │  │(API wrapper) │
│(summary)   │  │ security)   │  │              │
└────────────┘  └─────────────┘  └──────────────┘
```

### Layer Breakdown

**Layer 1: CLI** - Command routing using `commander`  
**Layer 2: Application** - Orchestration logic  
**Layer 3: Parser** - TypeScript wrapper for Java analyzer  
**Layer 4: Java Analyzer** - AST parsing and pattern extraction  
**Layer 5: Storage** - JSON files on disk  
**Layer 6: GraphStore** - In-memory graph database  
**Layer 7: Analyzers** - Detection rule engines  
**Layer 8: Reporters** - Output formatting  

---

## 3. Data Flow

### Complete Analysis Flow

```
1. User runs: npm run index
   ↓
2. CLI (main.ts) → indexAllRepos()
   ↓
3. Load repos.json configuration
   ↓
4. For each repo:
   ↓
5. JavaParserAdapter.parse(repo)
   ↓
6. Execute: java -jar java-analyzer-1.0.0.jar <repoPath>
   ↓
7. Java Analyzer walks .java files
   ↓
8. For each file:
   - Parse with JavaParser → CompilationUnit (AST)
   - Extract classes (with stereotypes: @Controller, @Service, etc.)
   - Extract methods (with line numbers, class context)
   - Extract method calls (with scope names)
   - Extract try-catch blocks (with emptiness, resources)
   - Extract string concatenations (+ operator with literals)
   - Extract PreparedStatement usage (with ? placeholders)
   - Extract suppression comments (// analyzer-ignore RULE-ID)
   - Extract routes (@GetMapping, @PostMapping, etc.)
   - Extract dependency injections (@Autowired, constructor)
   ↓
9. Output JSON to stdout
   ↓
10. JavaParserAdapter receives JSON
   ↓
11. Transform to RepoAnalysis object with normalized IDs
   ↓
12. GraphStore.addRepoAnalysis(analysis)
   ↓
13. Store functions, calls, classes, etc. in Maps/Arrays
   ↓
14. GraphStore.resolveCallsByName()
   - Match calls to callees via:
     a) Dependency injection (scope → injected class)
     b) Same-class methods (scope="this" or no scope)
     c) Simple name matching (fallback)
   ↓
15. GraphStore.buildEnhancedIndexes()
   - Build callersIndex: Map<calleeId, Set<callerIds>>
   ↓
16. Save to data/raw/repo-analyses.json
   ↓
17. User runs: npm run analyze
   ↓
18. CLI → runAnalyze()
   ↓
19. Load data/raw/repo-analyses.json
   ↓
20. Rebuild GraphStore from JSON
   ↓
21. Run BugAnalyzer.analyze(store)
   - Rule BUG-001: Unsafe Optional.get()
   - Rule BUG-002: Resource leaks
   - Rule BUG-003: Empty catch blocks
   ↓
22. Run SecurityAnalyzer.analyze(store)
   - Rule SEC-001: SQL injection patterns
   - Rule SEC-002: Command injection patterns
   ↓
23. For each finding:
   - Check store.isSuppressed(file, line, ruleId)
   - Filter if suppressed
   ↓
24. Deduplicate findings (same file:line:rule)
   ↓
25. Build AnalysisResult with summary stats
   ↓
26. reportToConsole(result) - formatted output
   ↓
27. saveJsonReports(result, outputDir)
   - data/findings/all.json
   - data/findings/bugs.json
   - data/findings/security.json
```

### Key Data Structures

**RepoAnalysis** (from Java analyzer):
```typescript
{
  repo: RepoConfig,
  functions: FunctionSymbol[],    // Methods extracted
  calls: CallRelation[],          // Method calls
  classes: JavaClassInfo[],       // Classes with stereotypes
  routes: RouteInfo[],            // Spring REST endpoints
  injections: InjectionInfo[],    // @Autowired, constructor DI
  tryCatchBlocks: TryCatchInfo[], // Try-catch structures
  stringConcats: StringConcatInfo[], // + operators
  preparedStatements: PreparedStatementInfo[], // PreparedStatement usage
  suppressions: SuppressionInfo[] // Inline suppression comments
}
```

**Finding** (output):
```typescript
{
  id: string,              // Unique ID: RULE-file-line
  category: "bug" | "security",
  severity: "critical" | "high" | "medium" | "low",
  ruleId: string,          // e.g., "SEC-001"
  ruleName: string,        // e.g., "Potential SQL Injection"
  message: string,         // Human-readable description
  repo: string,
  file: string,
  line: number,
  functionId?: string,
  className?: string,
  confidence: number,      // 60-95%
  cwe?: string[],          // e.g., ["CWE-89"]
  remediation?: string     // Fix advice
}
```

---

## 4. Core Components

### 4.1 GraphStore (src/graph/graph-store.ts)

**Purpose:** In-memory graph database holding all parsed code relationships.

**Data Members:**
```typescript
functions: Map<string, FunctionSymbol>      // O(1) function lookup
calls: CallRelation[]                       // All method calls
classes: JavaClassInfo[]                    // All classes
routes: RouteInfo[]                         // Spring REST endpoints
injections: InjectionInfo[]                 // DI relationships
tryCatchBlocks: TryCatchInfo[]              // Try-catch structures
stringConcats: StringConcatInfo[]           // String concatenations
preparedStatements: PreparedStatementInfo[] // PreparedStatement usage
suppressions: SuppressionInfo[]             // Suppression comments

// Indexes
callersIndex: Map<calleeId, Set<callerIds>> // Reverse lookup: who calls me?
```

**Key Methods:**

**`addRepoAnalysis(analysis)`**
- Adds all extracted data from Java analyzer
- Populates functions map, calls array, classes, etc.

**`resolveCallsByName()`** - CRITICAL METHOD
- Links CallRelation.calleeName → CallRelation.calleeId
- Resolution strategy:
  1. **DI resolution**: If scope matches injected field, resolve to injected class
     - Example: `userService.findById()` → resolve `userService` via `@Autowired UserService userService`
  2. **Same-class resolution**: If scope="this" or no scope, match within class
     - Example: `this.validateOrder()` → find `validateOrder` in same class
  3. **Simple name fallback**: Match by method name alone (if unique)
     - Example: `calculateTax()` → find any `calculateTax` method
- **Limitation:** Cannot resolve interface calls, polymorphism, or reflection

**`buildEnhancedIndexes()`**
- Builds `callersIndex` for O(1) reverse lookup
- For each call: map calleeId → Set of callerIds
- Enables `getDirectCallers()` queries

**`getDirectCallers(fnId)` / `getDirectCallees(fnId)`**
- Bidirectional call graph traversal
- Used by impact analysis

**`isSuppressed(file, line, ruleId)`**
- Checks if finding should be suppressed
- Matches within ±2 lines (comment could be before or on same line)
- Returns true if suppression comment found for this rule

**`usesPreparedStatement(fnId)` / `usesParameterization(fnId)`**
- Checks if function uses `PreparedStatement` with `?` placeholders
- Used to reduce false positives in SQL injection detection

**`getCallChain(startFnId, depth)`**
- Multi-hop call traversal (depth 2-3)
- Returns all call chains starting from function
- Uses DFS with cycle detection

---

### 4.2 BugAnalyzer (src/analyzers/bug-analyzer.ts)

**Purpose:** Detects common bug patterns.

**Rules Implemented:**

#### Rule BUG-001: Unsafe Optional.get()

**Pattern Detection:**
```java
// FLAGGED CODE:
Optional<User> opt = userRepository.findById(id);
User user = opt.get(); // No guard check

// SAFE CODE:
Optional<User> opt = userRepository.findById(id);
if (opt.isPresent()) {
  User user = opt.get();
}
```

**Detection Logic:**
1. Find all calls to `.get()` method
2. Check if same function calls Optional-related methods (`findById`, `findFirst`, `ofNullable`, etc.)
3. Check if guard methods exist: `isPresent()`, `isEmpty()`, `orElse()`, `orElseThrow()`
4. If no guard found → flag as unsafe

**Severity Tuning:**
- Controller class: HIGH (user-facing)
- Service/Repository: MEDIUM (internal)

**Confidence:** 75% (may miss guards in other methods)

**Remediation:** Use `orElseThrow()` or check with `isPresent()` first

---

#### Rule BUG-002: Potential Resource Leak

**Pattern Detection:**
```java
// FLAGGED CODE:
try {
  FileInputStream fis = new FileInputStream(file); // Not in try-with-resources
  fis.read(data);
} catch (Exception e) { }

// SAFE CODE:
try (FileInputStream fis = new FileInputStream(file)) { // try-with-resources
  fis.read(data);
} catch (Exception e) { }
```

**Detection Logic:**
1. Find all try-catch blocks WITHOUT try-with-resources
2. Check if function contains I/O method calls: `read`, `write`, `execute`, `query`, `connect`
3. If I/O operations found → flag as potential leak

**Severity Tuning:**
- Database/network I/O (`execute`, `query`, `connect`): HIGH
- File I/O (`read`, `write`): MEDIUM

**Confidence:** 70% (may flag resources closed in finally blocks)

**Remediation:** Use try-with-resources pattern

---

#### Rule BUG-003: Empty Catch Block

**Pattern Detection:**
```java
// FLAGGED CODE:
try {
  riskyOperation();
} catch (Exception e) {
  // Empty - exception silently ignored
}

// SAFE CODE:
try {
  riskyOperation();
} catch (Exception e) {
  logger.error("Operation failed", e);
}
```

**Detection Logic:**
1. Find all try-catch blocks
2. Check if catch block has zero statements
3. If empty → flag as exception swallowing

**Severity Tuning:**
- Controller/public methods: MEDIUM (user-facing)
- Internal methods: LOW

**Confidence:** 95% (direct AST check, very reliable)

**Remediation:** Log exception or rethrow

---

### 4.3 SecurityAnalyzer (src/analyzers/security-analyzer.ts)

**Purpose:** Detects security vulnerability patterns.

**Rules Implemented:**

#### Rule SEC-001: Potential SQL Injection (Heuristic)

**Pattern Detection:**
```java
// FLAGGED CODE (Controller executing SQL):
@RestController
public class UserController {
  public User getUser(String id) {
    String sql = "SELECT * FROM users WHERE id = " + id; // Concatenation!
    stmt.executeQuery(sql); // In Controller!
  }
}

// SAFE CODE:
@RestController
public class UserController {
  @Autowired UserService userService;
  
  public User getUser(String id) {
    return userService.findById(id); // Delegates to service layer
  }
}
```

**Detection Logic (v1.1.0+):**
1. Find all SQL execution calls: `execute()`, `executeQuery()`, `executeUpdate()`
2. **If in Controller class:**
   - Check for string concatenation (+ operator in SQL context)
   - Check if PreparedStatement with `?` placeholders used
   - **v1.1.0 behavior:** PreparedStatement detection adjusts severity/confidence, does NOT skip finding
   - Calculate adjusted severity and confidence based on signals
3. **If outside Repository/Service:**
   - Flag as HIGH severity (architectural smell)

**Confidence Calculation (v1.1.0+):**
- **With SQL concatenation:**
  - 90% (base) → 70% if PreparedStatement detected
- **With method concatenation:**
  - 85% (base) → 65% if PreparedStatement detected
- **With parameters:**
  - 75% (base) → 55% if PreparedStatement detected
- **PreparedStatement only:**
  - 50% (architectural smell, lower risk)
- **Outside Repository/Service:** 60%

**Severity (v1.1.0+):**
- CRITICAL: SQL concatenation without PreparedStatement in Controller
- HIGH: SQL concatenation with PreparedStatement, or method concat, or params in Controller
- MEDIUM: PreparedStatement detected without concatenation in Controller
- HIGH: Outside Repository/Service

**CWE:** CWE-89 (SQL Injection)

**Remediation:** Use PreparedStatement with parameterized queries, move SQL to service layer

**Limitation:** Cannot prove user input reaches SQL (no taint analysis)

---

#### Rule SEC-002: Potential Command Injection (Heuristic)

**Pattern Detection:**
```java
// FLAGGED CODE (Controller executing commands):
@RestController
public class AdminController {
  public String runScript(String scriptName) {
    String cmd = "bash /scripts/" + scriptName; // Concatenation!
    Runtime.getRuntime().exec(cmd); // In Controller!
  }
}

// SAFER CODE:
// Avoid command execution in Controllers entirely
// If required, validate against allowlist
```

**Detection Logic:**
1. Find all command execution calls:
   - `Runtime.exec()`
   - `ProcessBuilder` instantiation
   - `ProcessBuilder.start()`
2. **If in Controller class:**
   - Check for string concatenation (+ operator in command context)
   - Check if method has parameters
   - Flag as CRITICAL
3. **If in exported/public method:**
   - Flag as HIGH

**Confidence Calculation:**
- 95%: + operator + parameters
- 90%: + operator in command context
- 85%: Method concatenation + parameters
- 80%: Method has parameters
- 75%: Base (Controller)
- 65%: Exported method

**Severity:** CRITICAL (Controller), HIGH (exported)

**CWE:** CWE-78 (Command Injection)

**Remediation:** Avoid command execution in web endpoints, use allowlists, validate inputs

**Limitation:** Cannot prove user input reaches command (no taint analysis)

---

### 4.4 Java Analyzer (java-analyzer/src/main/java/com/company/analyzer/Main.java)

**Purpose:** Parses Java source code and extracts patterns for analysis.

**Technology:** JavaParser 3.25.10 (AST library for Java)

**Main Flow:**
```java
1. main(String[] args)
   - Receive repository path
   - Configure JavaParser for Java 17
   - Walk all .java files (exclude target/, build/, generated/)
   
2. parseFile(repoPath, file, output)
   - Parse file → CompilationUnit (AST root)
   - Call: parseClasses()
   - Call: parseInjections()
   - Call: parseMethodsAndCalls()
   - Handle errors → add to ParseFailure list
   
3. parseClasses(...)
   - Find all ClassOrInterfaceDeclaration nodes
   - Extract: packageName, className
   - Detect stereotype: @RestController, @Controller, @Service, @Repository, @Component
   - Add to output.classes
   
4. parseInjections(...)
   - Find ConstructorDeclaration nodes → constructor injection
   - Find @Autowired FieldDeclaration nodes → field injection
   - Extract: className, targetClassName, fieldName, injectionType
   - Add to output.injections
   
5. parseMethodsAndCalls(...)
   For each MethodDeclaration:
   
   a) Extract method info
      - className, methodName, line number
      - Add to output.methods
   
   b) Extract method calls
      - Find MethodCallExpr nodes
      - Extract: calleeName, scopeName (e.g., "userService" in userService.findById())
      - Add to output.calls
   
   c) Extract try-catch blocks
      - Find TryStmt nodes
      - Detect: hasCatchBlock, catchBlockEmpty, hasResources (try-with-resources)
      - Add to output.tryCatchBlocks
   
   d) Extract string concatenations
      - Find BinaryExpr nodes with PLUS operator
      - Check if either side is StringLiteralExpr
      - Detect context: inSqlContext (SELECT, INSERT, UPDATE, DELETE keywords)
      - Detect context: inCommandContext (SH, BASH, CMD, EXEC keywords)
      - Add to output.stringConcats
   
   e) Extract PreparedStatement usage
      - Find ObjectCreationExpr with type "PreparedStatement"
      - Find method calls: prepareStatement()
      - Detect parameterization: check for "?" in query string
      - Add to output.preparedStatements
   
   f) Extract suppression comments
      - Find comments with "analyzer-ignore" or "@suppress"
      - Parse: ruleId, reason (optional)
      - Add to output.suppressions
   
   g) Extract Spring routes (if in Controller)
      - Find method annotations: @GetMapping, @PostMapping, @PutMapping, etc.
      - Extract: httpMethod, path (from annotation)
      - Combine class-level @RequestMapping path with method path
      - Add to output.routes

6. Output JSON to stdout
   - Jackson serialization
   - Pretty-printed JSON
```

**Key AST Patterns:**

**Detecting Spring Stereotypes:**
```java
// Check if class has annotation
@RestController // → stereotype = "RestController"
@Service        // → stereotype = "Service"
@Repository     // → stereotype = "Repository"
```

**Detecting Dependency Injection:**
```java
// Constructor injection
public UserController(UserService userService) { ... }
// → injection: className=UserController, targetClassName=UserService, fieldName=userService

// Field injection
@Autowired
private UserService userService;
// → injection: className=UserController, targetClassName=UserService, fieldName=userService
```

**Detecting String Concatenation:**
```java
String sql = "SELECT * FROM users WHERE id = " + userId;
// → BinaryExpr with PLUS operator
// → Left: StringLiteralExpr ("SELECT...")
// → Right: variable (userId)
// → inSqlContext = true (contains "SELECT")
```

**Detecting PreparedStatement:**
```java
PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
// → MethodCallExpr: prepareStatement
// → Argument contains "?" → usesParameterization = true
```

---

### 4.5 MCP Server (mcp-server/server.ts)

**Purpose:** Exposes analyzer as MCP (Model Context Protocol) tool for AI assistants.

**Architecture:** Thin wrapper that:
1. Temporarily modifies `repos.json` configuration
2. Runs analyzer commands (`npm run index`, `npm run analyze`)
3. Reads findings from JSON files
4. Restores original configuration
5. Returns results to MCP client

**Tools Exposed:**

**1. analyze_repo**
- Input: `repoRoot` (absolute path), `mode` (all/bugs/security), `repoName` (optional)
- Flow:
  1. Validate repository path (exists, is directory, no path traversal)
  2. Backup existing `repos.json` (if exists)
  3. Write temporary `repos.json` with target repo
  4. Run `npm run index` (parse and index)
  5. Run `npm run analyze` (run detection rules)
  6. Read findings from `data/findings/*.json`
  7. Restore original `repos.json`
  8. Return findings JSON
- Error Handling: Always restores config in finally block

**2. read_findings**
- Input: `file` (all.json / bugs.json / security.json)
- Flow:
  1. Read from `data/findings/` directory
  2. Return JSON contents
- Use Case: Read results without re-running analysis

**3. get_project_context**
- Input: None
- Flow:
  1. Read `PROJECT_CONTEXT.md`
  2. Return markdown content
- Use Case: AI assistant reads project documentation

**Security Considerations:**
- Path validation: Prevents path traversal attacks
- Backup/restore: Ensures original config not lost on errors
- Command execution: Uses `execAsync` with hardcoded npm commands (no user input in commands)
- Logs to stderr: stdout reserved for MCP protocol
- **Note:** Commands are string-based (e.g., `"npm run index"`), but no user input is interpolated into command strings

---

## 5. Detection Rules

### Detection Rule Summary

| Rule ID | Name | Category | Severity | Confidence | CWE |
|---------|------|----------|----------|------------|-----|
| BUG-001 | Unsafe Optional.get() | Bug | Medium-High | 75% | N/A |
| BUG-002 | Potential Resource Leak | Bug | Medium-High | 70% | N/A |
| BUG-003 | Empty Catch Block | Bug | Low-Medium | 95% | N/A |
| SEC-001 | Potential SQL Injection | Security | Critical-High | 60-90% | CWE-89 |
| SEC-002 | Potential Command Injection | Security | Critical-High | 65-95% | CWE-78 |

### Severity Tuning Context

**Controllers/REST endpoints:**
- User-facing code → higher severity
- Direct exposure to untrusted input

**Service/Repository layers:**
- Internal code → lower severity
- Should have input validation from upper layers

**Critical I/O operations:**
- Database/network: Higher severity (connection leaks, SQL injection)
- File I/O: Lower severity (less immediate impact)

---

## 6. Function Call Flow

### Use Case: Running Full Analysis

```
User: npm run analyze

1. package.json → ts-node src/cli/main.ts analyze
2. src/cli/main.ts:
   - program.command("analyze").action(async (opts) => {
       const { runAnalyze } = await import("../app/run-analyze");
       await runAnalyze({ bugs: true, security: true, format: "both" });
     })

3. src/app/run-analyze.ts → runAnalyze(options)
   3.1. Load data/raw/repo-analyses.json → RepoAnalysis[]
   3.2. Create GraphStore instance
   3.3. For each analysis: store.addRepoAnalysis(analysis)
   3.4. store.resolveCallsByName() [CRITICAL - call resolution]
   3.5. store.buildEnhancedIndexes() [Build callersIndex]
   3.6. new BugAnalyzer().analyze(store) → Finding[]
        - detectUnsafeOptionalGet()
        - detectResourceLeaks()
        - detectEmptyCatchBlocks()
        - Filter: store.isSuppressed()
   3.7. new SecurityAnalyzer().analyze(store) → Finding[]
        - detectSQLInjection()
        - detectCommandInjection()
        - Filter: store.isSuppressed()
   3.8. deduplicateFindings() [Remove same file:line:rule]
   3.9. buildAnalysisResult() [Add summary stats]
   3.10. reportToConsole(result) [Console output]
   3.11. saveJsonReports(result, outputDir) [JSON files]

4. src/reporters/console-reporter.ts → reportToConsole(result)
   - Print summary (total, by severity, by category)
   - Print top risky classes
   - Print findings by rule
   - Print findings by class
   - Print top 10 detailed findings

5. src/reporters/json-reporter.ts → saveJsonReports(result, outputDir)
   - Write data/findings/all.json
   - Write data/findings/bugs.json (filter category="bug")
   - Write data/findings/security.json (filter category="security")
```

### Use Case: Indexing Repository

```
User: npm run index

1. package.json → ts-node src/cli/main.ts index
2. src/cli/main.ts → indexAllRepos()
3. src/app/index-repos.ts → indexAllRepos()
   3.1. loadRepoConfigs() → repos.json
   3.2. For each repo:
        - getParser(repo.language) → JavaParserAdapter
        - parser.parse(repo) → RepoAnalysis
        - store.addRepoAnalysis(analysis)
   3.3. store.resolveCallsByName() [Call resolution]
   3.4. store.buildEnhancedIndexes() [Index building]
   3.5. Save data/raw/repo-analyses.json

4. src/parsers/java/java-parser.ts → JavaParserAdapter.parse(repo)
   4.1. Get JAR path: java-analyzer/target/java-analyzer-1.0.0.jar
   4.2. execFileAsync("java", ["-jar", jarPath, repo.path])
   4.3. Wait for process completion
   4.4. Parse stdout JSON
   4.5. Transform to RepoAnalysis with normalized IDs
        - makeJavaFunctionId(repo, methodId)
        - makeJavaClassId(repo, classId)
        - makeJavaRouteId(repo, routeId)
   4.6. Return RepoAnalysis

5. Java Process: java-analyzer/src/main/java/com/company/analyzer/Main.java
   5.1. Configure JavaParser for Java 17
   5.2. Walk repo directory tree
   5.3. For each .java file:
        - parseFile(repoPath, file, output)
        - Extract: classes, methods, calls, routes, injections, try-catch, etc.
   5.4. Output JSON to stdout
```

### Use Case: Call Resolution (COMPLEX)

```
Scenario: Resolving userService.findById() call in OrderController

1. GraphStore.resolveCallsByName()

2. For call: { callerId: "OrderController.createOrder", calleeName: "findById", scopeName: "userService" }

3. Get caller function:
   - callerFn = getFunctionById(call.callerId)
   - callerClassName = "OrderController"

4. Normalize scope:
   - scopeName = "userService" (strip "this." if present)

5. Try DI resolution:
   - getInjectedTargetClass("OrderController", "userService")
   - Search injections[] for: className=OrderController, fieldName=userService
   - Found: targetClassName = "UserService"
   - getFunctionsByClassAndMethod("UserService", "findById")
   - Found unique match: UserService.findById
   - Set call.calleeId = "UserService.findById"
   - RESOLUTION SUCCESSFUL ✓

Alternative: Same-class resolution
   - If scopeName="this" or no injection found
   - getFunctionsByClassAndMethod(callerClassName, "findById")
   - If unique match → set calleeId

Alternative: Fallback to simple name
   - If no DI, no same-class match
   - Look up calleeName in bySimpleMethodName map
   - If unique match globally → set calleeId
   - If multiple matches → leave calleeId undefined (ambiguous)
```

---

## 7. Business Rules

### Rule Selection Philosophy

**Pattern-Based, Not Data Flow:**
- All rules match AST patterns, method calls, class structures
- NO taint analysis, data flow tracking, or value propagation
- Trade-off: Simpler, faster, but less precise

**Heuristic-Based Detection:**
- All findings are "Potential" or "Heuristic"
- Confidence scores indicate certainty (60-95%, never 100%)
- Philosophy: Flag architectural smells even without proof

**Architectural Guidance:**
- Controllers executing SQL is flagged even if parameterized (bad architecture)
- Empty catch blocks are always bad (swallowing exceptions)
- Direct JDBC outside Repository layer is flagged

**False Positive Management:**
1. **PreparedStatement detection:** Skip SEC-001 if parameterized query detected
2. **Suppression mechanism:** Developers can suppress with inline comments
3. **Context-aware severity:** Prioritize user-facing code (Controllers)
4. **Confidence scores:** Indicate certainty level

### Suppression Rules

**Syntax:**
```java
// analyzer-ignore SEC-001 This is safe because connection is read-only
stmt.executeQuery(sql);

// @suppress BUG-002 Framework manages resource lifecycle
fis.read(data);
```

**Matching:**
- File path must match exactly
- Line number within ±2 lines (tolerance for comment placement)
- Rule ID must match exactly

**Limitations:**
- No project-wide suppression config (only inline comments)
- ±2 line tolerance can suppress wrong findings
- Future improvement: Add `.analyzer-ignore.json` file

---

## 8. Dependencies

### Runtime Dependencies

**NPM Packages:**
- `commander@^12.1.0` - CLI framework (command parsing, options)
- `fs-extra@^11.2.0` - File system utilities (enhanced fs with promises)

**Dev Dependencies:**
- `@types/node@^22.10.1` - TypeScript type definitions for Node.js
- `ts-node@^10.9.2` - TypeScript execution environment (run TS directly)
- `typescript@^5.7.2` - TypeScript compiler

**Java Dependencies (maven):**
- `JavaParser@3.25.10` - Java AST parsing library
- `Jackson` - JSON serialization (ObjectMapper)

**System Requirements:**
- Node.js (TypeScript execution)
- Java 17+ (for Java analyzer JAR execution)

### No External APIs

- ❌ No database connections
- ❌ No external web service calls
- ❌ No third-party API integrations
- ✅ Pure local file system operations
- ✅ Subprocess execution (java -jar)

---

## 9. Risky and Unclear Logic

### 9.1 ~~IMPROVED~~: Call Resolution via Dependency Injection

**Location:** `src/graph/graph-store.ts` → `resolveCallsByName()`

**Issue (Improved in v1.1.0):**
- ~~Previously resolved ambiguous calls by simple name matching (could pick wrong method)~~
- ~~No visibility into ambiguous or unresolved calls~~

**Risk Scenario:**
```java
// UserService.java
public class UserService {
  public User findById(Long id) { ... }
}

// ProductService.java
public class ProductService {
  public Product findById(Long id) { ... } // Same method name!
}

// OrderController.java - NO DI
public class OrderController {
  public void createOrder() {
    findById(1L); // Was: randomly resolved | Now: NOT resolved with warning
  }
}
```

**Current Implementation (v1.1.0+):**

**Resolution Strategy (Prioritized):**
1. **DI-based resolution:** `userService.findById()` → resolve to `UserService.findById` via injection
   - Logs: `[resolve] OrderController.createOrder -> UserService.findById via DI scope=userService`
2. **Same-class "this":** `this.validateOrder()` → resolve within class
   - Logs: `[resolve] via this`
3. **Same-class unscoped:** `validateOrder()` → resolve within class
   - Logs: `[resolve] via same-class`
4. **Unique global match:** Only if method name is globally unique
   - Logs: `[resolve] via unique-global-match`
5. **Ambiguous:** Multiple matches → DON'T resolve (safer than guessing)
   - Logs: `[resolve] Ambiguous global resolution: findById has 2 implementations - not resolving`

**Summary Logging:**
```
Call resolution complete: 14620 unresolved, 2557 ambiguous (not resolved)
```

**Benefits:**
- ✅ No incorrect resolutions (ambiguous calls not resolved)
- ✅ Detailed logs for debugging
- ✅ Clear visibility into resolution success rate
- ⚠️ Some calls remain unresolved (but were likely wrong before)

**Accuracy:** ~70-80% for typical Spring Boot projects (unchanged, but now more transparent)

**Status:** ✅ IMPROVED - Safer resolution with better visibility

---

### 9.2 ~~IMPROVED~~: PreparedStatement Handling

**Location:** `src/analyzers/security-analyzer.ts` → `detectSQLInjection()`

**Issue (Improved in v1.1.0):**
- ~~Previously skipped SEC-001 completely when PreparedStatement detected~~
- ~~Caused false negatives when unsafe SQL concatenation existed alongside PreparedStatement~~

**Example False Negative (Improved):**
```java
// Was: SEC-001 completely skipped (false negative)
// Now: SEC-001 reported with lowered severity/confidence
PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
String sql = "SELECT * FROM users WHERE id = " + userId; // Unsafe!
stmt.executeQuery(sql); // Now flagged as HIGH severity
```

**Current Implementation (v1.1.0+):**
- No longer skips SEC-001 when PreparedStatement detected
- Instead, adjusts severity and confidence:
  - SQL concat + PreparedStatement: severity = HIGH, confidence = 70%
  - Method concat + PreparedStatement: severity = HIGH, confidence = 65%
  - Parameters + PreparedStatement: severity = MEDIUM, confidence = 55%
  - No concat + PreparedStatement: severity = MEDIUM, confidence = 50%
- Message includes note about PreparedStatement detection

**What is still NOT checked:**
- Does NOT verify `setString()`, `setInt()`, etc. actually called
- Does NOT track if placeholders match parameter count
- Does NOT ensure PreparedStatement instance is actually used

**Trade-off Decision:**
- **Chosen:** Report finding with adjusted severity (reduce false negatives while acknowledging PreparedStatement)
- **Previous:** Skip completely (caused false negatives)
- **Rationale:** Better to flag with context than miss unsafe SQL

**Status:** ✅ IMPROVED - Now reports findings with appropriate severity/confidence adjustments

---

### 9.3 ~~FIXED~~: String Concatenation Context Detection

**Location:** `java-analyzer/src/main/java/com/company/analyzer/Main.java` → `parseMethodsAndCalls()`

**Issue (Fixed in v1.1.0):**
- ~~Previously used `binaryExpr.getLeft().toString()` which included variable names~~
- ~~Caused false positives when variable names contained SQL keywords~~

**Example False Positive (Fixed):**
```java
String selectFile = "data.txt";
String path = selectFile + ".backup"; // Was: inSqlContext = true (WRONG)
                                      // Now: inSqlContext = false (CORRECT)
```

**Current Implementation (v1.1.0+):**
```java
// Check left side if it's a string literal
if (binaryExpr.getLeft() instanceof StringLiteralExpr) {
    String leftLiteral = ((StringLiteralExpr) binaryExpr.getLeft()).getValue().toUpperCase();
    sci.inSqlContext = leftLiteral.contains("SELECT") || leftLiteral.contains("INSERT") ||
                       leftLiteral.contains("UPDATE") || leftLiteral.contains("DELETE") ||
                       leftLiteral.contains("FROM") || leftLiteral.contains("WHERE");
}
// Same for right side
```

**Status:** ✅ FIXED - Now only checks actual string literal values, not variable names

---

### 9.4 ~~IMPROVED~~: Suppression Matching Precision

**Location:** `src/graph/graph-store.ts` → `isSuppressed()`

**Issue (Improved in v1.1.0):**
- ~~Previously used ±2 line tolerance~~
- ~~Could suppress unrelated findings nearby~~

**Risk Scenario (Fixed):**
```java
Line 50: // analyzer-ignore SEC-001 This query is safe
Line 51: stmt.executeQuery(sql1); // Suppressed correctly ✓
Line 52: stmt.executeQuery(sql2); // Was: suppressed | Now: NOT suppressed ✓
Line 53: stmt.executeQuery(sql3); // Was: suppressed | Now: NOT suppressed ✓
```

**Current Implementation (v1.1.0+):**
```typescript
// Exact same-line match
if (s.line === line) return true;

// Previous line match (comment directly above)
if (s.line === line - 1) return true;

return false;  // No broad ±2 tolerance
```

**Valid Suppression Placements:**
```java
// Option 1: Previous line
// analyzer-ignore SEC-001
stmt.executeQuery(sql);

// Option 2: Same line
stmt.executeQuery(sql); // analyzer-ignore SEC-001
```

**Migration:**
- If existing suppression stops working, move comment to same line or immediately above
- No tolerance for reformatting (intentional - more precise)

**Status:** ✅ IMPROVED - More precise, reduces accidental suppressions

---

### 9.5 ~~FIXED~~: Deduplication Logic

**Location:** `src/app/run-analyze.ts` → `deduplicateFindings()`

**Issue (Fixed in v1.1.0):**
- ~~Previously used simple key: `file:line:ruleId`~~
- ~~Lost different findings on same line with different rule IDs~~

**Risk Scenario (Fixed):**
```java
Line 50: User u = opt.get(); String sql = "SELECT * FROM users WHERE id = " + id;
```

**Both on line 50:**
- BUG-001: Unsafe Optional.get()
- SEC-001: SQL injection

**Previous Behavior:** Only first finding kept (WRONG) ❌  
**Current Behavior:** Both findings kept (CORRECT) ✅

**Current Implementation (v1.1.0+):**
```typescript
// Enhanced key with more context
const key = `${finding.file}:${finding.line}:${finding.ruleId}:${finding.functionId || 'none'}:${finding.className || 'none'}`;
```

**Key Components:**
- `file` - File path
- `line` - Line number
- `ruleId` - Rule identifier (BUG-001, SEC-001, etc.)
- `functionId` - Function/method ID
- `className` - Class name

**Benefits:**
- ✅ Different rules on same line preserved
- ✅ More context for accurate deduplication
- ✅ True duplicates still removed

**Status:** ✅ FIXED - Enhanced deduplication preserves all legitimate findings

---

## 10. Configuration

### repos.json

**Location:** Project root

**Schema:**
```json
[
  {
    "name": "my-app",               // Repository identifier
    "path": "C:/path/to/repo",      // Absolute path to Java source root
    "language": "java",             // Only "java" supported
    "type": "backend"               // backend|frontend|library|service
  }
]
```

**Used By:**
- `src/app/index-repos.ts` → loads configuration
- `mcp-server/server.ts` → temporarily overwrites for MCP calls

---

### Suppression Syntax

**Inline Comments:**
```java
// analyzer-ignore <RULE-ID> [optional reason]
// @suppress <RULE-ID> [optional reason]
```

**Examples:**
```java
// analyzer-ignore SEC-001 Connection is read-only mode
stmt.executeQuery(sql);

// @suppress BUG-002 Resource managed by Spring framework
fis.read(data);
```

**Parsed By:** Java analyzer (`Main.java` → `parseSuppression()`)

---

## 11. Extension Points

### Adding New Detection Rules

**Steps:**

1. **Decide Category:**
   - Bug detection → Add to `BugAnalyzer` (`src/analyzers/bug-analyzer.ts`)
   - Security detection → Add to `SecurityAnalyzer` (`src/analyzers/security-analyzer.ts`)

2. **Extract Required Data (if needed):**
   - If new AST patterns required → modify `java-analyzer/Main.java`
   - Add new data structure (e.g., `LoopInfo`)
   - Extract in `parseMethodsAndCalls()`
   - Add to `Output` class
   - Update `JavaParserAdapter.parse()` to transform data

3. **Implement Detection Method:**
   ```typescript
   private detectYourRule(store: GraphStore): Finding[] {
     const findings: Finding[] = [];
     
     // Iterate over relevant data
     for (const item of store.yourData) {
       // Pattern matching logic
       if (matchesPattern(item)) {
         // Severity tuning
         const severity = item.isController ? "high" : "medium";
         
         findings.push({
           id: `YOUR-RULE-${item.file}-${item.line}`,
           category: "bug", // or "security"
           severity,
           ruleId: "YOUR-RULE",
           ruleName: "Your Rule Name",
           message: "Description of issue",
           repo: item.repo,
           file: item.file,
           line: item.line,
           confidence: 75,
           remediation: "How to fix"
         });
       }
     }
     
     return findings;
   }
   ```

4. **Call in analyze():**
   ```typescript
   analyze(store: GraphStore): Finding[] {
     const findings: Finding[] = [];
     findings.push(...this.detectYourRule(store));
     return findings.filter(f => !store.isSuppressed(f.file, f.line, f.ruleId));
   }
   ```

5. **Test:**
   - Add test case to `test-java-code/`
   - Run `npm run analyze`
   - Verify detection

6. **Document:**
   - Update `PROJECT_CONTEXT.md` with rule details
   - Document limitations, false positives
   - Add example vulnerable code

---

### Adding New Language Support

**Architecture:** Parser abstraction via `LanguageParser` interface

**Steps:**

1. **Create Parser Adapter:**
   ```typescript
   // src/parsers/python/python-parser.ts
   export class PythonParserAdapter implements LanguageParser {
     supports(language: string): boolean {
       return language.toLowerCase() === "python";
     }
     
     async parse(repo: RepoConfig): Promise<RepoAnalysis> {
       // Implement parsing logic
     }
   }
   ```

2. **Register Parser:**
   ```typescript
   // src/app/index-repos.ts
   const parsers: LanguageParser[] = [
     new JavaParserAdapter(),
     new PythonParserAdapter() // Add here
   ];
   ```

3. **Implement AST Extraction:**
   - Option A: Build Python analyzer JAR (using javaparser equivalent for Python)
   - Option B: Use Python AST library directly (e.g., `ast` module via subprocess)
   - Option C: Use existing Python linter output (pylint, flake8)

4. **Map to Common Data Model:**
   - Transform Python AST → `FunctionSymbol`, `CallRelation`, etc.
   - Handle language differences (e.g., decorators vs annotations)

5. **Extend Analyzers:**
   - Add Python-specific rules
   - Reuse existing rules where applicable (e.g., empty except blocks)

---

### Adding New Reporters

**Steps:**

1. **Create Reporter:**
   ```typescript
   // src/reporters/sarif-reporter.ts
   export async function saveSarifReport(result: AnalysisResult, outputPath: string) {
     // Transform to SARIF format
     const sarif = {
       version: "2.1.0",
       runs: [{
         tool: { driver: { name: "java-code-intel" } },
         results: result.findings.map(f => ({
           ruleId: f.ruleId,
           level: severityToSarifLevel(f.severity),
           message: { text: f.message },
           locations: [{
             physicalLocation: {
               artifactLocation: { uri: f.file },
               region: { startLine: f.line }
             }
           }]
         }))
       }]
     };
     
     await fs.writeJson(outputPath, sarif, { spaces: 2 });
   }
   ```

2. **Call from runAnalyze():**
   ```typescript
   // src/app/run-analyze.ts
   if (format === "sarif" || format === "all") {
     await saveSarifReport(result, path.join(outputDir, "report.sarif"));
   }
   ```

---

### Adding MCP Tools

**Steps:**

1. **Add Tool Definition:**
   ```typescript
   // mcp-server/server.ts
   server.setRequestHandler(ListToolsRequestSchema, async () => {
     return {
       tools: [
         // ... existing tools ...
         {
           name: "analyze_impact",
           description: "Analyze impact of changing a function",
           inputSchema: {
             type: "object",
             properties: {
               functionName: { type: "string" }
             },
             required: ["functionName"]
           }
         }
       ]
     };
   });
   ```

2. **Implement Tool Handler:**
   ```typescript
   server.setRequestHandler(CallToolRequestSchema, async (request) => {
     switch (request.params.name) {
       case "analyze_impact":
         result = await analyzeImpact(request.params.arguments as any);
         break;
       // ... other tools ...
     }
   });
   ```

3. **Add Implementation:**
   ```typescript
   async function analyzeImpact(params: { functionName: string }): Promise<any> {
     // Load graph, run impact analysis
     // Return results
   }
   ```

---

## Glossary

**AST (Abstract Syntax Tree):** Tree representation of source code structure, parsed from syntax.

**Call Graph:** Directed graph where nodes are functions and edges are call relationships (caller → callee).

**DI (Dependency Injection):** Design pattern where dependencies are provided externally (e.g., Spring @Autowired).

**Heuristic Detection:** Pattern-based detection without definitive proof (uses confidence scores).

**JavaParser:** Java library for parsing Java source code into AST.

**MCP (Model Context Protocol):** Protocol for exposing tools to AI assistants.

**Pattern-Based Analysis:** Matching code patterns without tracking data flow or execution paths.

**PreparedStatement:** JDBC API for parameterized SQL queries (prevents SQL injection).

**Stereotype:** Spring annotation indicating class role (@Controller, @Service, @Repository).

**Suppression:** Mechanism to ignore specific findings via inline comments.

**Taint Analysis:** Tracking untrusted data flow from sources (user input) to sinks (SQL, commands).

---

## Quick Reference

### File Locations

**Entry Points:**
- CLI: `src/cli/main.ts`
- MCP Server: `mcp-server/server.ts`

**Core Logic:**
- GraphStore: `src/graph/graph-store.ts`
- BugAnalyzer: `src/analyzers/bug-analyzer.ts`
- SecurityAnalyzer: `src/analyzers/security-analyzer.ts`
- Java Analyzer: `java-analyzer/src/main/java/com/company/analyzer/Main.java`

**Application Layer:**
- Indexing: `src/app/index-repos.ts`
- Analysis: `src/app/run-analyze.ts`
- Impact: `src/app/run-impact.ts`

**Reporters:**
- Console: `src/reporters/console-reporter.ts`
- JSON: `src/reporters/json-reporter.ts`

**Data Files:**
- Configuration: `repos.json`
- Raw data: `data/raw/repo-analyses.json`
- Findings: `data/findings/{all,bugs,security}.json`

### Commands

```bash
# Index repositories
npm run index

# Run full analysis
npm run analyze

# Bugs only
npm run analyze -- --bugs-only

# Security only
npm run analyze -- --security-only

# Impact analysis
npm run impact -- --function methodName

# Build Java analyzer
cd java-analyzer && mvn clean package
```

### Detection Rules Quick Reference (v1.1.0)

- **BUG-001:** Optional.get() without guard → 75% confidence, Medium-High severity
- **BUG-002:** Try-catch resource leaks → 70% confidence, Medium-High severity
- **BUG-003:** Empty catch blocks → 95% confidence, Low-Medium severity
- **SEC-001:** SQL injection patterns → 50-90% confidence, Critical-Medium severity (adjusted for PreparedStatement)
- **SEC-002:** Command injection patterns → 65-95% confidence, Critical-High severity

---

**End of Technical Documentation**
