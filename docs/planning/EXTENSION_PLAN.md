# EXTENSION PLAN: Java Code Intelligence System

**Project**: company-code-intel-java-phase2  
**Version**: MVP v1.0  
**Date**: 2026-04-21  
**Status**: Proposal  

---

## Executive Summary

This document outlines a comprehensive extension plan to evolve the existing Java analyzer into a full code intelligence system supporting bug detection, security analysis, logic analysis, knowledge graph capabilities, and AI-ready reasoning.

**Key Principles**:
- Preserve current architecture
- Avoid unnecessary rewrites
- Prioritize MVP implementation
- Deliver in 8 weeks

---

## 1. EXTENSION ARCHITECTURE

### **Layered Architecture (Preserving Existing Structure)**

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Layer (main.ts)                      │
│  Commands: index | impact | analyze | query | report            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer (app/)                      │
│  index-repos.ts | run-impact.ts | [NEW] run-analysis.ts         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Parser Layer (parsers/)                       │
│  java-parser.ts → [ENHANCED] + control flow extraction          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Graph Layer (graph/)                           │
│  [ENHANCED] graph-store.ts (bidirectional, indexed)             │
│  [NEW] graph-traversal.ts | graph-metrics.ts | graph-query.ts  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Analysis Engines (engines/)                    │
│  [NEW] control-flow-engine.ts - CFG builder                     │
│  [NEW] data-flow-engine.ts - Reaching definitions, liveness     │
│  [NEW] taint-engine.ts - Source-to-sink tracking                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Detectors (detectors/)                         │
│  [NEW] bug-detector.ts - Null checks, resource leaks            │
│  [NEW] security-detector.ts - Injection, XSS, auth issues       │
│  [NEW] logic-detector.ts - Business logic patterns              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                Findings Registry (findings/)                     │
│  [NEW] findings-registry.ts - Central finding aggregation       │
│  [NEW] finding-types.ts - Data models for all finding types     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Reporters (reporters/)                         │
│  [NEW] console-reporter.ts | json-reporter.ts                   │
│  [NEW] sarif-reporter.ts (GitHub/IDE) | ai-reporter.ts (LLM)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. NEW MODULES TO ADD

### **A. engines/** (Analysis Foundation)

```typescript
src/engines/
├── control-flow-engine.ts    // Builds CFG from methods
├── data-flow-engine.ts        // Tracks variable flow
└── taint-engine.ts            // Source-to-sink analysis
```

**Purpose**: Core analysis capabilities for all detectors

### **B. detectors/** (Finding Generation)

```typescript
src/detectors/
├── detector-interface.ts      // Base interface for all detectors
├── bug-detector.ts            // Null pointer, resource leaks
├── security-detector.ts       // OWASP Top 10 patterns
├── logic-detector.ts          // Business logic anti-patterns
└── rules/                     // Detection rules library
    ├── bug-rules.ts
    ├── security-rules.ts
    └── logic-rules.ts
```

**Purpose**: Pluggable detection framework

### **C. findings/** (Finding Management)

```typescript
src/findings/
├── finding-types.ts           // Finding data models
├── findings-registry.ts       // Aggregates all findings
└── finding-utils.ts           // Deduplication, ranking
```

**Purpose**: Centralized finding management

### **D. reporters/** (Output Formats)

```typescript
src/reporters/
├── reporter-interface.ts      // Base interface
├── console-reporter.ts        // Human-readable output
├── json-reporter.ts           // Machine-readable JSON
├── sarif-reporter.ts          // SARIF 2.1.0 (GitHub/IDE)
└── ai-reporter.ts             // LLM-optimized format
```

**Purpose**: Multi-format output for different consumers

### **E. graph/** (Enhanced Graph Capabilities)

```typescript
src/graph/
├── graph-store.ts             // [ENHANCED] Existing file
├── graph-traversal.ts         // [NEW] BFS/DFS, path finding
├── graph-metrics.ts           // [NEW] Centrality, clustering
└── graph-query.ts             // [NEW] Query DSL
```

**Purpose**: Advanced graph operations

---

## 3. CHANGES TO CURRENT MODULES

### **3.1 Enhance Java Parser (Main.java)**

**File**: `java-analyzer/src/main/java/com/company/analyzer/Main.java`

**Changes** (Minimal, additive only):

```java
// Add new output classes (after existing ones at line ~82)
public static class VariableInfo {
    public String methodId;
    public String varName;
    public String varType;
    public int line;
    public String assignedFrom;  // expression or method call
}

public static class ControlFlowInfo {
    public String methodId;
    public String nodeType;  // "if", "while", "try", "return", "throw"
    public int line;
    public String condition;  // for if/while
}

public static class Output {
    // ... existing fields
    public List<VariableInfo> variables = new ArrayList<>();
    public List<ControlFlowInfo> controlFlow = new ArrayList<>();
}

// Add new parsing method (call from parseMethodsAndCalls)
private static void parseVariablesAndControlFlow(
    String repoPath, 
    File file, 
    MethodDeclaration method,
    String methodId,
    Output output
) {
    // Extract variable declarations + assignments
    method.findAll(VariableDeclarator.class).forEach(var -> {
        VariableInfo vi = new VariableInfo();
        vi.methodId = methodId;
        vi.varName = var.getNameAsString();
        vi.varType = var.getType().asString();
        vi.line = var.getBegin().map(p -> p.line).orElse(-1);
        vi.assignedFrom = var.getInitializer()
            .map(Object::toString).orElse(null);
        output.variables.add(vi);
    });
    
    // Extract control flow nodes
    method.findAll(IfStmt.class).forEach(ifStmt -> {
        ControlFlowInfo cfi = new ControlFlowInfo();
        cfi.methodId = methodId;
        cfi.nodeType = "if";
        cfi.line = ifStmt.getBegin().map(p -> p.line).orElse(-1);
        cfi.condition = ifStmt.getCondition().toString();
        output.controlFlow.add(cfi);
    });
    
    // Similarly for: WhileStmt, ForStmt, TryStmt, ReturnStmt, ThrowStmt
    method.findAll(WhileStmt.class).forEach(whileStmt -> {
        ControlFlowInfo cfi = new ControlFlowInfo();
        cfi.methodId = methodId;
        cfi.nodeType = "while";
        cfi.line = whileStmt.getBegin().map(p -> p.line).orElse(-1);
        cfi.condition = whileStmt.getCondition().toString();
        output.controlFlow.add(cfi);
    });
    
    method.findAll(TryStmt.class).forEach(tryStmt -> {
        ControlFlowInfo cfi = new ControlFlowInfo();
        cfi.methodId = methodId;
        cfi.nodeType = "try";
        cfi.line = tryStmt.getBegin().map(p -> p.line).orElse(-1);
        output.controlFlow.add(cfi);
    });
    
    method.findAll(ReturnStmt.class).forEach(returnStmt -> {
        ControlFlowInfo cfi = new ControlFlowInfo();
        cfi.methodId = methodId;
        cfi.nodeType = "return";
        cfi.line = returnStmt.getBegin().map(p -> p.line).orElse(-1);
        output.controlFlow.add(cfi);
    });
    
    method.findAll(ThrowStmt.class).forEach(throwStmt -> {
        ControlFlowInfo cfi = new ControlFlowInfo();
        cfi.methodId = methodId;
        cfi.nodeType = "throw";
        cfi.line = throwStmt.getBegin().map(p -> p.line).orElse(-1);
        output.controlFlow.add(cfi);
    });
}

// Update parseMethodsAndCalls to call new method (around line 247)
private static void parseMethodsAndCalls(String repoPath, File file, CompilationUnit cu, Output output) {
    cu.findAll(MethodDeclaration.class).forEach(method -> {
        // ... existing code to create MethodInfo ...
        
        output.methods.add(mi);
        
        // NEW: Parse variables and control flow
        parseVariablesAndControlFlow(repoPath, file, method, mi.id, output);
        
        // ... rest of existing code ...
    });
}
```

**Impact**: 
- Adds 2 new output arrays
- ~150 lines of code
- Backward compatible (existing parsers ignore new fields)

---

### **3.2 Enhance TypeScript Type System**

**File**: `src/core/types.ts`

**Changes** (Append to end of file):

```typescript
// ============ ENHANCED TYPES FOR CODE INTELLIGENCE ============

// Control Flow Graph
export interface CFGNode {
  id: string;
  methodId: string;
  nodeType: "entry" | "exit" | "statement" | "condition" | "branch" | "throw" | "return";
  line?: number;
  code?: string;
  successors: string[];  // outgoing edges
  predecessors: string[]; // incoming edges
}

// Data Flow
export interface VariableDeclaration {
  id: string;
  methodId: string;
  varName: string;
  varType: string;
  line: number;
  assignedFrom?: string;
}

export interface DataFlowEdge {
  from: string;  // variable ID or method call
  to: string;    // variable ID or parameter
  type: "assignment" | "parameter" | "return";
}

// Findings
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingCategory = "bug" | "security" | "logic" | "performance" | "style";

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  ruleId: string;
  ruleName: string;
  message: string;
  
  // Location
  repo: string;
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  
  // Context
  functionId?: string;
  className?: string;
  methodName?: string;
  
  // Evidence
  codeSnippet?: string;
  dataFlow?: DataFlowPath;
  relatedLocations?: Array<{
    file: string;
    line: number;
    message: string;
  }>;
  
  // Metadata
  confidence: number;  // 0-100
  cwe?: string[];      // CWE IDs for security
  cvss?: number;       // CVSS score for security
  remediation?: string;
  references?: string[];
}

export interface DataFlowPath {
  source: string;      // Starting point (e.g., "request.getParameter")
  sink: string;        // Ending point (e.g., "statement.execute")
  steps: DataFlowStep[];
}

export interface DataFlowStep {
  functionId: string;
  line: number;
  operation: string;
}

export interface AnalysisReport {
  metadata: {
    timestamp: string;
    version: string;
    repos: string[];
    analysisType: "full" | "incremental";
  };
  
  summary: {
    totalFindings: number;
    bySeverity: Record<FindingSeverity, number>;
    byCategory: Record<FindingCategory, number>;
    filesAnalyzed: number;
    functionsAnalyzed: number;
  };
  
  findings: Finding[];
  
  // AI-ready context
  codeContext?: {
    functionId: string;
    callers: string[];
    callees: string[];
    complexity: number;
  }[];
}

// Graph Query Support
export interface GraphQueryResult {
  functions: FunctionSymbol[];
  calls: CallRelation[];
  routes: RouteInfo[];
  metrics?: {
    depth: number;
    breadth: number;
    complexity: number;
  };
}

// Enhanced RepoAnalysis (extends existing interface)
export interface EnhancedRepoAnalysis extends RepoAnalysis {
  variables?: VariableDeclaration[];
  controlFlowNodes?: CFGNode[];
}
```

**Impact**: 
- ~200 lines of code
- No breaking changes (pure additions)

---

### **3.3 Enhance GraphStore**

**File**: `src/graph/graph-store.ts`

**Changes** (Add to end of class, before closing brace at line 160):

```typescript
export class GraphStore {
  // ... existing fields
  
  // NEW: Enhanced indexes
  private callersIndex = new Map<string, Set<string>>();  // calleeId → callerIds
  private calleesIndex = new Map<string, Set<string>>();  // callerId → calleeIds
  
  // NEW: Enhanced data
  variables: VariableDeclaration[] = [];
  cfgNodes = new Map<string, CFGNode[]>();  // methodId → CFG nodes
  
  // NEW: Build reverse indexes (call after resolveCallsByName)
  buildEnhancedIndexes() {
    // Build caller index
    for (const call of this.calls) {
      if (call.calleeId) {
        if (!this.callersIndex.has(call.calleeId)) {
          this.callersIndex.set(call.calleeId, new Set());
        }
        this.callersIndex.get(call.calleeId)!.add(call.callerId);
        
        if (!this.calleesIndex.has(call.callerId)) {
          this.calleesIndex.set(call.callerId, new Set());
        }
        this.calleesIndex.get(call.callerId)!.add(call.calleeId);
      }
    }
    
    console.log(`Built indexes: ${this.callersIndex.size} callees with callers, ${this.calleesIndex.size} callers with callees`);
  }
  
  // NEW: Transitive traversal
  getTransitiveCallers(fnId: string, maxDepth = 10): FunctionSymbol[] {
    const visited = new Set<string>();
    const result: FunctionSymbol[] = [];
    const queue: Array<[string, number]> = [[fnId, 0]];
    
    while (queue.length > 0) {
      const [currentId, depth] = queue.shift()!;
      
      if (visited.has(currentId) || depth > maxDepth) continue;
      visited.add(currentId);
      
      const callers = this.callersIndex.get(currentId);
      if (callers) {
        for (const callerId of callers) {
          const fn = this.getFunctionById(callerId);
          if (fn && !visited.has(callerId)) {
            result.push(fn);
            queue.push([callerId, depth + 1]);
          }
        }
      }
    }
    
    return result;
  }
  
  getTransitiveCallees(fnId: string, maxDepth = 10): FunctionSymbol[] {
    const visited = new Set<string>();
    const result: FunctionSymbol[] = [];
    const queue: Array<[string, number]> = [[fnId, 0]];
    
    while (queue.length > 0) {
      const [currentId, depth] = queue.shift()!;
      
      if (visited.has(currentId) || depth > maxDepth) continue;
      visited.add(currentId);
      
      const callees = this.calleesIndex.get(currentId);
      if (callees) {
        for (const calleeId of callees) {
          const fn = this.getFunctionById(calleeId);
          if (fn && !visited.has(calleeId)) {
            result.push(fn);
            queue.push([calleeId, depth + 1]);
          }
        }
      }
    }
    
    return result;
  }
  
  // NEW: Get all paths between two functions
  findCallPaths(fromId: string, toId: string, maxDepth = 5): FunctionSymbol[][] {
    const paths: FunctionSymbol[][] = [];
    const currentPath: string[] = [];
    
    const dfs = (currentId: string, depth: number) => {
      if (depth > maxDepth) return;
      if (currentPath.includes(currentId)) return; // avoid cycles
      
      currentPath.push(currentId);
      
      if (currentId === toId) {
        const path = currentPath
          .map(id => this.getFunctionById(id))
          .filter(Boolean) as FunctionSymbol[];
        paths.push(path);
      } else {
        const callees = this.calleesIndex.get(currentId);
        if (callees) {
          for (const calleeId of callees) {
            dfs(calleeId, depth + 1);
          }
        }
      }
      
      currentPath.pop();
    };
    
    dfs(fromId, 0);
    return paths;
  }
  
  // NEW: Get direct callers
  getDirectCallers(fnId: string): FunctionSymbol[] {
    const callerIds = this.callersIndex.get(fnId);
    if (!callerIds) return [];
    
    return Array.from(callerIds)
      .map(id => this.getFunctionById(id))
      .filter(Boolean) as FunctionSymbol[];
  }
  
  // NEW: Get direct callees
  getDirectCallees(fnId: string): FunctionSymbol[] {
    const calleeIds = this.calleesIndex.get(fnId);
    if (!calleeIds) return [];
    
    return Array.from(calleeIds)
      .map(id => this.getFunctionById(id))
      .filter(Boolean) as FunctionSymbol[];
  }
}
```

**Impact**: 
- ~150 lines of code
- All additive (no changes to existing methods)

---

### **3.4 Update index-repos.ts**

**File**: `src/app/index-repos.ts`

**Changes** (at line 30):

```typescript
export async function indexAllRepos() {
  const repos = await loadRepoConfigs();
  const store = new GraphStore();

  for (const repo of repos) {
    const parser = getParser(repo.language);

    console.log(`Indexing ${repo.name}...`);
    const analysis = await parser.parse(repo);
    store.addRepoAnalysis(analysis);
  }

  store.resolveCallsByName();
  
  // NEW: Build enhanced indexes
  store.buildEnhancedIndexes();

  await fs.ensureDir("data/raw");
  await fs.ensureDir("data/graph");
  
  // NEW: Create additional directories
  await fs.ensureDir("data/enhanced");
  await fs.ensureDir("data/findings");
  await fs.ensureDir("data/reports");

  await fs.writeJson("data/raw/repo-analyses.json", store.repoAnalyses, { spaces: 2 });
  await fs.writeJson("data/graph/functions.json", Array.from(store.functions.values()), { spaces: 2 });
  await fs.writeJson("data/graph/calls.json", store.calls, { spaces: 2 });
  await fs.writeJson("data/graph/imports.json", store.imports, { spaces: 2 });
  await fs.writeJson("data/graph/classes.json", store.classes, { spaces: 2 });
  await fs.writeJson("data/graph/routes.json", store.routes, { spaces: 2 });
  await fs.writeJson("data/graph/injections.json", store.injections, { spaces: 2 });
  await fs.writeJson("data/graph/parse-failures.json", store.failures, { spaces: 2 });
  
  // NEW: Write enhanced data
  await fs.writeJson("data/enhanced/variables.json", store.variables, { spaces: 2 });

  console.log("Index complete.");
}
```

**Impact**: 
- 5 lines added
- 3 new directories created

---

### **3.5 Update Java Parser Adapter**

**File**: `src/parsers/java/java-parser.ts`

**Changes** (in parse method, after line 98):

```typescript
const injections: InjectionInfo[] = (parsed.injections || []).map((i: any) => ({
  id: makeJavaInjectionId(repo.name, i.id),
  repo: repo.name,
  file: i.file,
  className: i.className,
  targetClassName: i.targetClassName,
  fieldName: i.fieldName,
  injectionType: i.injectionType
}));

// NEW: Parse variables
const variables: VariableDeclaration[] = (parsed.variables || []).map((v: any) => ({
  id: `${makeJavaFunctionId(repo.name, v.methodId)}#${v.varName}@L${v.line}`,
  methodId: makeJavaFunctionId(repo.name, v.methodId),
  varName: v.varName,
  varType: v.varType,
  line: v.line,
  assignedFrom: v.assignedFrom
}));

const failures: ParseFailure[] = (parsed.failures || []).map((f: any) => ({
  file: f.file,
  errorType: f.errorType,
  message: f.message
}));

if (failures.length > 0) {
  console.warn(`Java parser skipped ${failures.length} file(s) in repo ${repo.name}`);
}

return {
  repo,
  files: [],
  functions,
  imports: [],
  calls,
  classes,
  routes,
  injections,
  failures,
  variables  // NEW: Add this field
};
```

**Impact**: 
- ~15 lines of code addition
- Import VariableDeclaration type

---

### **3.6 Update CLI (main.ts)**

**File**: `src/cli/main.ts`

**Changes** (after line 22):

```typescript
program
  .command("impact")
  .description("Analyze impact for a method name")
  .requiredOption("-f, --function <name>", "Method name, e.g. createOrder or OrderService.createOrder")
  .action(async (opts) => {
    await runImpact(opts.function);
  });

// NEW: Add analyze command
program
  .command("analyze")
  .description("Run code intelligence analysis")
  .option("--bugs", "Run bug detection")
  .option("--security", "Run security analysis")
  .option("--logic", "Run logic analysis")
  .option("--all", "Run all analyses (default)", true)
  .action(async (opts) => {
    const { runAnalysis } = await import("../app/run-analysis");
    await runAnalysis({
      bugs: opts.all || opts.bugs,
      security: opts.all || opts.security,
      logic: opts.all || opts.logic
    });
  });

// NEW: Add report command
program
  .command("report")
  .description("Generate analysis reports")
  .option("-f, --format <type>", "Output format: console, json, sarif, ai", "console")
  .option("-o, --output <path>", "Output file path")
  .action(async (opts) => {
    const { generateReport } = await import("../app/run-report");
    await generateReport({
      format: opts.format,
      output: opts.output
    });
  });

program.parseAsync(process.argv);
```

**Impact**: 
- ~30 lines added
- 2 new commands

---

## 4. DATA MODEL DESIGN

### **4.1 Enhanced RepoAnalysis**

```typescript
// Extension to existing RepoAnalysis interface
export interface RepoAnalysis {
  repo: RepoConfig;
  files: string[];
  functions: FunctionSymbol[];
  imports: ImportRelation[];
  calls: CallRelation[];
  classes?: JavaClassInfo[];
  routes?: RouteInfo[];
  injections?: InjectionInfo[];
  failures?: ParseFailure[];
  variables?: VariableDeclaration[];      // NEW
  controlFlowNodes?: CFGNode[];           // NEW (future)
}
```

### **4.2 Findings Schema**

```typescript
// Core finding structure (optimized for multiple consumers)
export interface Finding {
  // Unique ID: <category>-<ruleId>-<file>-<line>
  id: string;
  
  // Classification
  category: FindingCategory;
  severity: FindingSeverity;
  ruleId: string;
  ruleName: string;
  message: string;
  
  // Location (SARIF-compatible)
  repo: string;
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  
  // Context (AI-ready)
  functionId?: string;
  className?: string;
  methodName?: string;
  
  // Evidence (for complex findings)
  codeSnippet?: string;
  dataFlow?: DataFlowPath;
  relatedLocations?: Array<{
    file: string;
    line: number;
    message: string;
  }>;
  
  // Metadata
  confidence: number;      // 0-100
  cwe?: string[];          // CWE IDs for security
  cvss?: number;           // CVSS score for security
  remediation?: string;
  references?: string[];
}
```

**Design Rationale**:
1. **id**: Deterministic for deduplication
2. **category/severity**: Two-axis classification
3. **location**: SARIF-compatible for IDE integration
4. **dataFlow**: Evidence trail for taint analysis
5. **confidence**: Enables threshold filtering
6. **cwe/cvss**: Industry-standard security metadata

### **4.3 Graph Storage Schema**

```
data/
├── raw/
│   └── repo-analyses.json           # Existing: Full parse output
│
├── graph/                            # Existing: Basic graph
│   ├── functions.json
│   ├── calls.json
│   ├── classes.json
│   ├── routes.json
│   ├── injections.json
│   ├── imports.json
│   └── parse-failures.json
│
├── enhanced/                         # NEW: Enhanced analysis
│   ├── variables.json                # Variable declarations
│   ├── cfg-nodes.json                # Control flow graph nodes (future)
│   ├── callers-index.json            # Reverse call index
│   └── graph-metrics.json            # Centrality, complexity (future)
│
├── findings/                         # NEW: Analysis results
│   ├── bugs.json                     # Bug findings
│   ├── security.json                 # Security findings
│   ├── logic.json                    # Logic findings
│   └── all-findings.json             # Aggregated findings
│
└── reports/                          # NEW: Export formats
    ├── summary.json                  # High-level summary
    ├── sarif.json                    # SARIF 2.1.0 format
    └── ai-context.json               # LLM-optimized format
```

### **4.4 AI-Ready Format Design**

```typescript
// Optimized for LLM consumption (context window efficiency)
export interface AICodeContext {
  metadata: {
    repo: string;
    analysisDate: string;
    codebaseStats: {
      totalFunctions: number;
      totalClasses: number;
      totalRoutes: number;
      linesOfCode: number;
    };
  };
  
  // Per-function context (for targeted analysis)
  functions: Array<{
    id: string;
    signature: string;  // e.g., "OrderService.createOrder(OrderDTO): Order"
    location: string;   // file:line
    
    // Structural context
    callers: Array<{ id: string; name: string; location: string }>;
    callees: Array<{ id: string; name: string; location: string }>;
    routes?: Array<{ method: string; path: string }>;
    
    // Complexity metrics
    cyclomaticComplexity?: number;
    linesOfCode?: number;
    dependencies: number;
    
    // Findings related to this function
    findings: Array<{
      severity: FindingSeverity;
      category: FindingCategory;
      message: string;
      line: number;
    }>;
    
    // Code snippet (if needed for AI analysis)
    code?: string;
  }>;
  
  // Graph-level insights
  insights: {
    criticalFunctions: Array<{
      id: string;
      name: string;
      reason: string;  // "High centrality", "Many security findings"
    }>;
    riskHotspots: Array<{
      file: string;
      findingCount: number;
      highestSeverity: FindingSeverity;
    }>;
    architecturalPatterns: {
      layers: string[];
      violations: Array<{
        from: string;
        to: string;
        reason: string;
      }>;
    };
  };
}
```

**Design Rationale**:
1. **Hierarchical**: Metadata → Functions → Insights
2. **Compact**: Only essential context (token-efficient)
3. **Self-contained**: Each function has full local context
4. **Actionable**: Insights section highlights priority areas
5. **Extensible**: Easy to add new insight types

---

## 5. EXECUTION PIPELINE

### **5.1 MVP Pipeline (3 Phases)**

```
PHASE 1: INDEXING (Enhanced)
─────────────────────────────
npm run index
  ├─ Parse Java files (existing + control flow extraction)
  ├─ Build basic graph (existing)
  ├─ Build enhanced indexes (NEW)
  ├─ Calculate graph metrics (NEW - future)
  └─ Write data/ outputs
  
Time: ~same as current (marginal overhead <10%)
Output: data/raw/, data/graph/, data/enhanced/

─────────────────────────────────────────────────────────────

PHASE 2: ANALYSIS (NEW)
───────────────────────
npm run analyze [--bugs] [--security] [--logic] [--all]
  ├─ Load graph from data/
  ├─ Initialize detectors
  ├─ Run selected analyses:
  │   ├─ BugDetector
  │   │   ├─ Null pointer checks
  │   │   ├─ Resource leak detection
  │   │   ├─ Exception handling issues
  │   │   └─ Dead code detection
  │   │
  │   ├─ SecurityDetector
  │   │   ├─ SQL injection (taint analysis)
  │   │   ├─ Command injection
  │   │   └─ XSS vulnerabilities
  │   │
  │   └─ LogicDetector
  │       ├─ Transaction boundary issues
  │       ├─ Idempotency violations
  │       └─ Business logic anti-patterns
  │
  ├─ Aggregate findings
  ├─ Deduplicate & rank
  └─ Write findings/ outputs
  
Time: ~1-5 seconds per 1000 functions (heuristic-based)
Output: data/findings/*.json

─────────────────────────────────────────────────────────────

PHASE 3: REPORTING (NEW)
────────────────────────
npm run report [--format json|sarif|ai|console] [--output <path>]
  ├─ Load findings from data/findings/
  ├─ Load graph context (for AI format)
  ├─ Generate requested format:
  │   ├─ console: Human-readable terminal output
  │   ├─ json: Structured JSON
  │   ├─ sarif: SARIF 2.1.0 (GitHub/IDE compatible)
  │   └─ ai: LLM-optimized context
  └─ Output to stdout or file
  
Time: <1 second
Output: data/reports/*.json or stdout
```

### **5.2 Unified Pipeline (Single Command)**

```bash
npm run intel [options]

Options:
  --repos <path>        Repos config (default: repos.json)
  --analyze <types>     Analysis types: bugs,security,logic,all (default: all)
  --report <format>     Output format: console,json,sarif,ai (default: console)
  --output <dir>        Output directory (default: data/)
  --max-depth <n>       Transitive analysis depth (default: 10)
  --min-confidence <n>  Min confidence threshold (default: 70)
  --verbose            Show detailed progress
```

**Implementation** (`src/app/run-intel.ts`):

```typescript
export interface IntelOptions {
  repos?: string;
  analyze: string[];
  report: string[];
  output: string;
  maxDepth: number;
  minConfidence: number;
  verbose: boolean;
}

export async function runIntelligence(options: IntelOptions) {
  const startTime = Date.now();
  
  console.log("═══════════════════════════════════════");
  console.log("  Java Code Intelligence System");
  console.log("═══════════════════════════════════════\n");
  
  // Phase 1: Indexing
  console.log("Phase 1: Indexing repositories...");
  await indexAllRepos();
  const indexTime = Date.now() - startTime;
  console.log(`✓ Indexing complete (${(indexTime / 1000).toFixed(2)}s)\n`);
  
  // Phase 2: Analysis
  console.log("Phase 2: Running analysis...");
  const findings = await runAnalysis({
    types: options.analyze,
    maxDepth: options.maxDepth,
    minConfidence: options.minConfidence,
    verbose: options.verbose
  });
  const analysisTime = Date.now() - startTime - indexTime;
  console.log(`✓ Analysis complete (${(analysisTime / 1000).toFixed(2)}s)`);
  console.log(`  Found ${findings.length} issues\n`);
  
  // Phase 3: Reporting
  console.log("Phase 3: Generating reports...");
  await generateReports(findings, {
    formats: options.report,
    outputDir: options.output
  });
  const reportTime = Date.now() - startTime - indexTime - analysisTime;
  console.log(`✓ Reports generated (${(reportTime / 1000).toFixed(2)}s)\n`);
  
  // Summary
  const totalTime = Date.now() - startTime;
  console.log("═══════════════════════════════════════");
  console.log(`Total time: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Total findings: ${findings.length}`);
  console.log("═══════════════════════════════════════");
}
```

### **5.3 Incremental Analysis (Performance Optimization)**

```bash
# First run: Full analysis
npm run intel

# Subsequent runs: Incremental (only changed files)
npm run intel --incremental

# Force full re-analysis
npm run intel --force
```

**Implementation** (`src/app/incremental.ts`):

```typescript
interface FileMetadata {
  path: string;
  hash: string;
  lastAnalyzed: string;
  findings: string[];  // Finding IDs
}

export async function detectChangedFiles(
  repos: RepoConfig[]
): Promise<Map<string, string[]>> {
  const metadataPath = "data/.metadata.json";
  const previousMetadata = await loadMetadata(metadataPath);
  const changedFiles = new Map<string, string[]>();
  
  for (const repo of repos) {
    if (!repo.path) continue;
    
    const files = await getAllJavaFiles(repo.path);
    for (const file of files) {
      const currentHash = await hashFile(file);
      const previous = previousMetadata.get(file);
      
      if (!previous || previous.hash !== currentHash) {
        if (!changedFiles.has(repo.name)) {
          changedFiles.set(repo.name, []);
        }
        changedFiles.get(repo.name)!.push(file);
      }
    }
  }
  
  return changedFiles;
}

export async function incrementalAnalysis(
  store: GraphStore,
  changedFiles: Map<string, string[]>
): Promise<Finding[]> {
  // Load previous findings
  const previousFindings = await loadPreviousFindings();
  
  // Invalidate findings for changed files
  const validFindings = previousFindings.filter(
    f => !isFileChanged(f.file, changedFiles)
  );
  
  // Re-analyze only affected functions
  const affectedFunctions = getAffectedFunctions(store, changedFiles);
  const newFindings = await analyzeFunctions(store, affectedFunctions);
  
  // Merge and deduplicate
  return [...validFindings, ...newFindings];
}
```

**Performance Benefits**:
- 10x faster for small changes (<10% of codebase)
- Preserves valid findings from unchanged code
- Updates only transitive dependencies

---

## 6. IMPLEMENTATION ROADMAP (MVP)

### **Week 1-2: Foundation**

**Goal**: Enhanced graph + basic detection framework

**Tasks**:
1. ✅ Update `types.ts` with new interfaces
2. ✅ Enhance `GraphStore` with indexes + traversal methods
3. ✅ Implement `graph-traversal.ts` (path finding, BFS/DFS)
4. ✅ Update `index-repos.ts` to call `buildEnhancedIndexes()`
5. ✅ Add basic `finding-types.ts` and `findings-registry.ts`
6. ✅ Update `package.json` with new dependencies (if needed)

**Deliverables**:
- Enhanced graph with bidirectional indexes
- Transitive caller/callee queries working
- Foundation for finding storage

**Testing**:
- Unit tests for graph traversal
- Verify index correctness
- Performance test on 1000+ function codebase

---

### **Week 3-4: Bug Detection (MVP)**

**Goal**: Detect 5 common bugs

**Tasks**:
1. ✅ Extend `Main.java` to extract variable info
2. ✅ Update `java-parser.ts` to parse variable data
3. ✅ Implement `data-flow-engine.ts` (basic reaching definitions)
4. ✅ Implement `bug-detector.ts` with rules:
   - Null pointer after Optional.get()
   - Resource not closed (FileInputStream, Connection, Statement)
   - Exception swallowing (empty catch block)
   - Potential division by zero
   - Unreachable code after return
5. ✅ Implement `detector-interface.ts` (base interface)
6. ✅ Add `npm run analyze --bugs` command
7. ✅ Create test cases for each rule

**Deliverables**:
- Bug findings in JSON format
- Console output with bug details
- 5 working detection rules

**Testing**:
- Create test files with known bugs
- Verify each rule detects expected issues
- Measure false positive rate (<20%)

---

### **Week 5-6: Security Detection (MVP)**

**Goal**: Detect 3 critical security issues

**Tasks**:
1. ✅ Implement `taint-engine.ts`:
   - Define source patterns (HTTP input methods)
   - Define sink patterns (SQL, command execution)
   - Track taint through assignments (1-2 levels)
   - Track taint through method calls
2. ✅ Implement `security-detector.ts` with rules:
   - SQL injection (HTTP input → SQL execution)
   - Command injection (HTTP input → Runtime.exec)
   - XSS (HTTP input → response.write without encoding)
3. ✅ Add `npm run analyze --security` command
4. ✅ Implement data flow path reporting
5. ✅ Create test cases with vulnerable code

**Deliverables**:
- Security findings with data flow traces
- Taint analysis engine
- 3 working security rules

**Testing**:
- Test with OWASP vulnerable samples
- Verify data flow paths are correct
- Measure false positive rate (<15% for security)

---

### **Week 7: Reporting**

**Goal**: Multi-format output for different consumers

**Tasks**:
1. ✅ Implement `reporter-interface.ts`
2. ✅ Implement `console-reporter.ts`:
   - Summary statistics
   - Top 10 critical findings
   - Grouped by severity
3. ✅ Implement `json-reporter.ts`:
   - Structured JSON output
   - Include all finding metadata
4. ✅ Implement `sarif-reporter.ts`:
   - SARIF 2.1.0 format
   - GitHub/VS Code compatible
5. ✅ Implement `ai-reporter.ts`:
   - LLM-optimized context
   - Function-centric view
   - Include graph context
6. ✅ Add `npm run report` command
7. ✅ Test with GitHub Code Scanning

**Deliverables**:
- 4 output format reporters
- SARIF file uploadable to GitHub
- AI context consumable by LLM

**Testing**:
- Validate SARIF with official validator
- Test GitHub Code Scanning integration
- Verify AI context with sample LLM prompts

---

### **Week 8: Integration & Polish**

**Goal**: End-to-end pipeline + documentation

**Tasks**:
1. ✅ Implement `run-intel.ts` (unified pipeline)
2. ✅ Add `--incremental` support (optional)
3. ✅ Performance optimization:
   - Profile bottlenecks
   - Optimize graph traversal
   - Add caching where beneficial
4. ✅ Documentation:
   - Update README with new commands
   - Add ARCHITECTURE.md
   - Add DETECTOR_RULES.md (rule catalog)
   - Add EXAMPLES.md (sample outputs)
5. ✅ Integration testing:
   - Test on 3+ real Java projects
   - Validate finding accuracy
   - Measure performance
6. ✅ Create demo video/screenshots

**Deliverables**:
- Production-ready MVP
- Complete documentation
- Performance benchmarks
- Demo materials

**Testing**:
- End-to-end tests on real codebases
- Performance tests (10k+ functions)
- Acceptance testing with stakeholders

---

## 7. MVP FEATURE MATRIX

| Feature | MVP v1.0 | Future v2.0 |
|---------|----------|-------------|
| **Bug Detection** |
| Null pointer checks | ✅ | ✅ |
| Resource leaks | ✅ | ✅ |
| Exception handling | ✅ | ✅ |
| Dead code | ✅ | ✅ |
| Type safety | ❌ | ✅ |
| Concurrency bugs | ❌ | ✅ |
| **Security** |
| SQL injection | ✅ | ✅ |
| Command injection | ✅ | ✅ |
| XSS | ✅ | ✅ |
| CSRF | ❌ | ✅ |
| Auth bypass | ❌ | ✅ |
| Secrets detection | ❌ | ✅ |
| Dependency CVEs | ❌ | ✅ |
| **Logic Analysis** |
| Transitive impact | ✅ | ✅ |
| Control flow | ✅ (basic) | ✅ (full CFG) |
| Data flow | ✅ (1-level) | ✅ (inter-procedural) |
| Symbolic execution | ❌ | ✅ |
| Business rules | ❌ | ✅ |
| **Graph** |
| Bidirectional index | ✅ | ✅ |
| Transitive queries | ✅ | ✅ |
| Path finding | ✅ | ✅ |
| Graph metrics | ❌ | ✅ |
| Query DSL | ❌ | ✅ |
| Visualization | ❌ | ✅ |
| **Reporting** |
| Console | ✅ | ✅ |
| JSON | ✅ | ✅ |
| SARIF | ✅ | ✅ |
| AI-optimized | ✅ | ✅ |
| HTML dashboard | ❌ | ✅ |
| PDF reports | ❌ | ✅ |
| **Performance** |
| Incremental analysis | ⚠️ (optional) | ✅ |
| Parallel analysis | ❌ | ✅ |
| Distributed mode | ❌ | ✅ |

**Legend**: ✅ Included | ❌ Not included | ⚠️ Partially implemented

---

## 8. CODE SIZE ESTIMATION

| Module | New Lines | Changed Lines | Files | Risk Level |
|--------|-----------|---------------|-------|------------|
| **Java Parser** | +150 | +20 | 1 | Low |
| **types.ts** | +200 | 0 | 1 | None |
| **graph-store.ts** | +150 | 0 | 1 | Low |
| **index-repos.ts** | +5 | +1 | 1 | None |
| **java-parser.ts** | +15 | 0 | 1 | None |
| **main.ts (CLI)** | +50 | +10 | 1 | Low |
| **graph-traversal.ts** | +200 | - | 1 (new) | - |
| **data-flow-engine.ts** | +300 | - | 1 (new) | - |
| **taint-engine.ts** | +250 | - | 1 (new) | - |
| **detector-interface.ts** | +50 | - | 1 (new) | - |
| **bug-detector.ts** | +400 | - | 1 (new) | - |
| **security-detector.ts** | +350 | - | 1 (new) | - |
| **logic-detector.ts** | +200 | - | 1 (new) | - |
| **finding-types.ts** | +100 | - | 1 (new) | - |
| **findings-registry.ts** | +150 | - | 1 (new) | - |
| **reporter-interface.ts** | +30 | - | 1 (new) | - |
| **console-reporter.ts** | +150 | - | 1 (new) | - |
| **json-reporter.ts** | +100 | - | 1 (new) | - |
| **sarif-reporter.ts** | +250 | - | 1 (new) | - |
| **ai-reporter.ts** | +200 | - | 1 (new) | - |
| **run-intel.ts** | +200 | - | 1 (new) | - |
| **run-analysis.ts** | +150 | - | 1 (new) | - |
| **run-report.ts** | +100 | - | 1 (new) | - |
| **TOTAL** | **~3,000** | **~30** | **23 files** | **Low** |

**Comparison**:
- Current codebase: ~1,500 LOC
- MVP codebase: ~4,500 LOC (3x growth)
- **All changes are additive** (no breaking changes)
- Risk is minimal (existing code mostly unchanged)

---

## 9. EXAMPLE USAGE (MVP)

### **Scenario 1: Full Analysis (Single Command)**

```bash
npm run intel

# Output:
═══════════════════════════════════════
  Java Code Intelligence System
═══════════════════════════════════════

Phase 1: Indexing repositories...
  Indexing my-java-project...
  [resolve] OrderController.createOrder -> OrderService.createOrder via scope=orderService
  [resolve] OrderService.createOrder -> OrderRepository.save via scope=orderRepository
  Built indexes: 245 callees with callers, 245 callers with callees
✓ Indexing complete (2.34s)

Phase 2: Running analysis...
  Running bug detection... 12 findings
  Running security detection... 3 findings
  Running logic analysis... 5 findings
✓ Analysis complete (1.89s)
  Found 20 issues

Phase 3: Generating reports...
  Generated: data/reports/summary.json
  Generated: data/reports/all-findings.json
✓ Reports generated (0.12s)

═══════════════════════════════════════
Total time: 4.35s
Total findings: 20
═══════════════════════════════════════

SUMMARY
─────────────────────────────────────
Total Findings: 20
  Critical: 2
  High: 5
  Medium: 8
  Low: 5

By Category:
  Security: 3
  Bug: 12
  Logic: 5

TOP ISSUES
─────────────────────────────────────

[CRITICAL] SQL Injection in OrderService.createOrder
  File: src/main/java/com/example/service/OrderService.java:45
  Rule: SEC-001 (SQL Injection via Taint Analysis)
  Confidence: 95%
  
  Data Flow:
    1. Source: request.getParameter("orderId")
       → OrderController.java:23
    2. Passed to: OrderService.createOrder(orderId)
       → OrderController.java:24
    3. Used in: statement.execute("SELECT * FROM orders WHERE id = " + orderId)
       → OrderService.java:45
  
  Remediation:
    Use PreparedStatement with parameterized queries:
    statement.execute("SELECT * FROM orders WHERE id = ?", orderId)
  
  References:
    - CWE-89: SQL Injection
    - OWASP Top 10 2021: A03 Injection

─────────────────────────────────────

[HIGH] Resource Leak in FileProcessor.processFile
  File: src/main/java/com/example/util/FileProcessor.java:23
  Rule: BUG-002 (Resource Not Closed)
  Confidence: 90%
  
  Issue:
    FileInputStream opened at line 23 but not closed on exception path
  
  Code:
    23: FileInputStream fis = new FileInputStream(filePath);
    24: // ... processing ...
    30: return result;  // Exception thrown before close()
  
  Remediation:
    Use try-with-resources:
    try (FileInputStream fis = new FileInputStream(filePath)) {
      // ... processing ...
    }

─────────────────────────────────────

[HIGH] Null Pointer Risk in UserService.getUser
  File: src/main/java/com/example/service/UserService.java:67
  Rule: BUG-001 (Unsafe Optional.get())
  Confidence: 85%
  
  Issue:
    Optional.get() called without isPresent() check
  
  Code:
    66: Optional<User> user = userRepository.findById(id);
    67: return user.get();  // Potential NoSuchElementException
  
  Remediation:
    Use Optional.orElseThrow():
    return user.orElseThrow(() -> new UserNotFoundException(id));
```

---

### **Scenario 2: Security-Only Analysis**

```bash
npm run intel --analyze security --report sarif

# Output:
═══════════════════════════════════════
  Java Code Intelligence System
═══════════════════════════════════════

Phase 1: Indexing repositories...
✓ Indexing complete (2.34s)

Phase 2: Running analysis...
  Running security detection... 3 findings
✓ Analysis complete (0.67s)

Phase 3: Generating reports...
  Generated: data/reports/sarif.json
✓ Reports generated (0.08s)

═══════════════════════════════════════
Security Findings: 3
  Critical: 2
  High: 1
═══════════════════════════════════════

# SARIF file can be uploaded to GitHub Code Scanning
# or opened in VS Code with SARIF extension
```

**SARIF Output** (`data/reports/sarif.json`):

```json
{
  "version": "2.1.0",
  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "Java Code Intelligence",
          "version": "1.0.0",
          "informationUri": "https://github.com/your-org/java-code-intel",
          "rules": [
            {
              "id": "SEC-001",
              "name": "SqlInjection",
              "shortDescription": {
                "text": "SQL Injection Vulnerability"
              },
              "helpUri": "https://cwe.mitre.org/data/definitions/89.html",
              "properties": {
                "tags": ["security", "injection"],
                "precision": "high"
              }
            }
          ]
        }
      },
      "results": [
        {
          "ruleId": "SEC-001",
          "level": "error",
          "message": {
            "text": "SQL Injection: Untrusted data flows to SQL execution"
          },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": {
                  "uri": "src/main/java/com/example/service/OrderService.java"
                },
                "region": {
                  "startLine": 45,
                  "startColumn": 5
                }
              }
            }
          ],
          "codeFlows": [
            {
              "threadFlows": [
                {
                  "locations": [
                    {
                      "location": {
                        "physicalLocation": {
                          "artifactLocation": {
                            "uri": "src/main/java/com/example/controller/OrderController.java"
                          },
                          "region": {
                            "startLine": 23
                          }
                        },
                        "message": {
                          "text": "Source: request.getParameter(\"orderId\")"
                        }
                      }
                    },
                    {
                      "location": {
                        "physicalLocation": {
                          "artifactLocation": {
                            "uri": "src/main/java/com/example/service/OrderService.java"
                          },
                          "region": {
                            "startLine": 45
                          }
                        },
                        "message": {
                          "text": "Sink: statement.execute()"
                        }
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

---

### **Scenario 3: AI-Assisted Code Review**

```bash
npm run intel --report ai --output ai-context.json

# Feed to LLM:
# "Review this codebase for security issues: <paste ai-context.json>"
```

**AI Context Output** (`ai-context.json`):

```json
{
  "metadata": {
    "repo": "my-java-project",
    "analysisDate": "2026-04-21T10:30:00Z",
    "codebaseStats": {
      "totalFunctions": 245,
      "totalClasses": 48,
      "totalRoutes": 23,
      "linesOfCode": 12543
    }
  },
  "functions": [
    {
      "id": "repo://my-java-project/symbol/OrderService.java#OrderService.createOrder@L45",
      "signature": "OrderService.createOrder(String orderId): Order",
      "location": "src/main/java/com/example/service/OrderService.java:45",
      "callers": [
        {
          "id": "repo://my-java-project/symbol/OrderController.java#OrderController.createOrder@L23",
          "name": "OrderController.createOrder",
          "location": "OrderController.java:23"
        }
      ],
      "callees": [
        {
          "id": "repo://my-java-project/symbol/OrderRepository.java#OrderRepository.save@L12",
          "name": "OrderRepository.save",
          "location": "OrderRepository.java:12"
        }
      ],
      "routes": [
        {
          "method": "POST",
          "path": "/api/orders"
        }
      ],
      "dependencies": 5,
      "findings": [
        {
          "severity": "critical",
          "category": "security",
          "message": "SQL Injection: Untrusted data flows to SQL execution",
          "line": 45
        }
      ],
      "code": "public Order createOrder(String orderId) {\n  String query = \"SELECT * FROM orders WHERE id = \" + orderId;\n  return jdbcTemplate.query(query, ...);\n}"
    }
  ],
  "insights": {
    "criticalFunctions": [
      {
        "id": "repo://my-java-project/symbol/OrderService.java#OrderService.createOrder@L45",
        "name": "OrderService.createOrder",
        "reason": "SQL injection vulnerability (CRITICAL)"
      },
      {
        "id": "repo://my-java-project/symbol/AuthService.java#AuthService.validateToken@L78",
        "name": "AuthService.validateToken",
        "reason": "High centrality (called by 23 functions)"
      }
    ],
    "riskHotspots": [
      {
        "file": "src/main/java/com/example/service/OrderService.java",
        "findingCount": 3,
        "highestSeverity": "critical"
      }
    ]
  }
}
```

---

### **Scenario 4: Bug Detection Only**

```bash
npm run analyze --bugs

# Output:
Running bug detection...

BUG FINDINGS
─────────────────────────────────────
Total: 12 issues
  High: 5
  Medium: 4
  Low: 3

[HIGH] Resource Leak (5 instances)
  - FileProcessor.java:23
  - DatabaseConnection.java:45
  - ImageUploader.java:67
  - LogWriter.java:89
  - ConfigReader.java:102

[HIGH] Unsafe Optional.get() (2 instances)
  - UserService.java:67
  - ProductService.java:134

[MEDIUM] Empty Catch Block (4 instances)
  - ErrorHandler.java:23
  - RetryLogic.java:45
  - CacheManager.java:78
  - TaskExecutor.java:91

[LOW] Unreachable Code (3 instances)
  - OrderProcessor.java:156
  - PaymentHandler.java:201
  - ShippingService.java:289

Findings saved to: data/findings/bugs.json
```

---

### **Scenario 5: Custom Report Format**

```bash
# Generate multiple formats at once
npm run report --format json,sarif,ai

# Or use unified command
npm run intel --report json,sarif,ai

# Output:
Generated reports:
  ✓ data/reports/all-findings.json
  ✓ data/reports/sarif.json
  ✓ data/reports/ai-context.json
```

---

## 10. VALIDATION & SUCCESS METRICS

### **MVP Success Criteria**

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Accuracy** |
| Precision (Bug) | ≥80% | Manual review of 100 findings |
| Precision (Security) | ≥85% | Manual review of all security findings |
| Recall (Security) | ≥90% | Test against OWASP Benchmark |
| False Positive Rate | <20% | User feedback after 1 month |
| **Performance** |
| Indexing Speed | <5 min for 10k methods | Benchmark on large repos |
| Analysis Speed | <5 sec for 1k methods | Benchmark on large repos |
| Memory Usage | <2GB for 100k LOC | Monitor during execution |
| **Coverage** |
| Rule Coverage | 8/8 MVP rules | Unit tests |
| Detection Rate | ≥90% per rule | Test suites |
| **Usability** |
| Single-command execution | 100% | CLI testing |
| Setup time | <5 minutes | New user testing |
| **Integration** |
| SARIF Validation | 100% pass | Official SARIF validator |
| GitHub Upload | Success | Manual testing |
| VS Code Import | Success | Manual testing |

### **Testing Strategy**

#### **1. Unit Tests**

```typescript
// Example: graph-store.test.ts
describe("GraphStore", () => {
  it("should build bidirectional indexes", () => {
    const store = new GraphStore();
    // ... add test data
    store.buildEnhancedIndexes();
    
    expect(store.getDirectCallers("fnId")).toHaveLength(3);
    expect(store.getDirectCallees("fnId")).toHaveLength(2);
  });
  
  it("should find transitive callers", () => {
    const store = new GraphStore();
    // ... add test data
    const callers = store.getTransitiveCallers("fnId", 3);
    
    expect(callers).toHaveLength(5);
    expect(callers.map(f => f.name)).toContain("RootCaller");
  });
});
```

#### **2. Integration Tests**

```typescript
// Example: end-to-end.test.ts
describe("End-to-End Pipeline", () => {
  it("should detect SQL injection", async () => {
    await indexAllRepos();
    const findings = await runAnalysis({ types: ["security"] });
    
    const sqlInjection = findings.find(f => f.ruleId === "SEC-001");
    expect(sqlInjection).toBeDefined();
    expect(sqlInjection?.severity).toBe("critical");
    expect(sqlInjection?.dataFlow).toBeDefined();
  });
});
```

#### **3. Benchmark Suite**

```bash
# Test against known vulnerable applications
npm run test:benchmark

# Runs against:
# - OWASP WebGoat (Java)
# - OWASP Benchmark
# - Custom vulnerable samples
```

#### **4. Performance Tests**

```bash
# Performance profiling
npm run test:performance

# Tests:
# - 1,000 functions: <2s analysis
# - 10,000 functions: <20s analysis
# - 100,000 functions: <5min analysis
```

---

## 11. RISKS & MITIGATION

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **False Positives** | High | Medium | - Tune confidence thresholds<br>- Add suppression mechanism<br>- User feedback loop |
| **Performance Issues** | Medium | Low | - Profile and optimize<br>- Add incremental mode<br>- Implement caching |
| **JavaParser Limitations** | Medium | Low | - Document limitations<br>- Fallback to heuristics<br>- Consider alternative parsers for v2.0 |
| **SARIF Incompatibility** | Low | Low | - Validate against official schema<br>- Test with GitHub/VS Code |
| **Scope Creep** | High | Medium | - Strict MVP definition<br>- Defer v2.0 features<br>- Regular scope reviews |
| **Integration Complexity** | Medium | Low | - Test early with real repos<br>- Incremental integration |

---

## 12. FUTURE ENHANCEMENTS (v2.0+)

### **Post-MVP Features** (Priority Order)

1. **Graph Metrics & Query DSL** (2-3 weeks)
   - Centrality calculations (PageRank, betweenness)
   - Query language for complex graph queries
   - Architectural insights (layering violations)

2. **Advanced Security** (3-4 weeks)
   - CSRF detection
   - Authentication/authorization analysis
   - Secrets scanning (regex + entropy)
   - Dependency vulnerability scanning (SBOM + CVE)

3. **Concurrency Analysis** (4-5 weeks)
   - Race condition detection
   - Deadlock detection
   - Thread-safety analysis

4. **Symbolic Execution** (6-8 weeks)
   - SMT solver integration (Z3)
   - Path condition generation
   - Constraint solving for complex bugs

5. **Visualization** (2-3 weeks)
   - Interactive call graph (D3.js)
   - Dependency visualization
   - Finding heatmaps

6. **Multi-Language Support** (4-6 weeks per language)
   - Kotlin support
   - Scala support
   - Cross-language analysis

7. **IDE Plugins** (3-4 weeks per IDE)
   - VS Code extension
   - IntelliJ plugin
   - Eclipse plugin

---

## 13. APPENDIX

### **A. Detector Rules Catalog**

#### **Bug Detection Rules**

| Rule ID | Name | Severity | Description |
|---------|------|----------|-------------|
| BUG-001 | Unsafe Optional.get() | High | Optional.get() without isPresent() check |
| BUG-002 | Resource Not Closed | High | Resource opened but not closed on all paths |
| BUG-003 | Empty Catch Block | Medium | Exception caught but not handled |
| BUG-004 | Division By Zero | Medium | Potential division by zero |
| BUG-005 | Unreachable Code | Low | Code after return/throw statement |

#### **Security Detection Rules**

| Rule ID | Name | Severity | Description | CWE |
|---------|------|----------|-------------|-----|
| SEC-001 | SQL Injection | Critical | HTTP input flows to SQL execution | CWE-89 |
| SEC-002 | Command Injection | Critical | HTTP input flows to Runtime.exec() | CWE-78 |
| SEC-003 | XSS | High | HTTP input flows to response without encoding | CWE-79 |

#### **Logic Detection Rules**

| Rule ID | Name | Severity | Description |
|---------|------|----------|-------------|
| LOG-001 | Missing @Transactional | Medium | Database operations without transaction |
| LOG-002 | Non-idempotent PUT | Medium | PUT endpoint modifies state non-idempotently |

---

### **B. Architecture Diagram**

```
┌────────────────────────────────────────────────────────┐
│                     USER INTERFACE                      │
│  CLI Commands: index | analyze | report | intel         │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│                  APPLICATION LAYER                      │
│  - index-repos.ts: Orchestrates parsing & indexing     │
│  - run-analysis.ts: Executes detectors                 │
│  - run-report.ts: Generates output formats             │
│  - run-intel.ts: Unified pipeline                      │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│                    PARSER LAYER                         │
│  Java Parser (JavaParser AST) → RepoAnalysis          │
│  - Classes, Methods, Calls, Routes, Injections        │
│  - Variables, Control Flow Nodes                      │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│                     GRAPH LAYER                         │
│  GraphStore: Central knowledge graph                   │
│  - Functions Map (id → FunctionSymbol)                │
│  - Calls Array (callerId → calleeId)                  │
│  - Bidirectional Indexes (callers ↔ callees)         │
│  - Traversal APIs (transitive, path finding)          │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│                   ENGINE LAYER                          │
│  - ControlFlowEngine: Builds CFG                       │
│  - DataFlowEngine: Tracks variable flow               │
│  - TaintEngine: Source-to-sink analysis               │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│                   DETECTOR LAYER                        │
│  - BugDetector: Null checks, resource leaks           │
│  - SecurityDetector: Injection, XSS                   │
│  - LogicDetector: Business logic patterns             │
│  → All produce: Finding[]                             │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│                  FINDINGS REGISTRY                      │
│  - Aggregates findings from all detectors              │
│  - Deduplicates by id                                  │
│  - Ranks by severity + confidence                      │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│                   REPORTER LAYER                        │
│  - ConsoleReporter: Human-readable                     │
│  - JsonReporter: Structured JSON                       │
│  - SarifReporter: GitHub/IDE compatible                │
│  - AIReporter: LLM-optimized                          │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│                       OUTPUT                            │
│  - data/findings/*.json                                │
│  - data/reports/*.json                                 │
│  - stdout (console)                                    │
└────────────────────────────────────────────────────────┘
```

---

### **C. Package.json Updates**

```json
{
  "name": "company-code-intel-java-phase2",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "dev": "ts-node src/cli/main.ts",
    "index": "ts-node src/cli/main.ts index",
    "impact": "ts-node src/cli/main.ts impact",
    "analyze": "ts-node src/cli/main.ts analyze",
    "report": "ts-node src/cli/main.ts report",
    "intel": "ts-node src/cli/main.ts intel",
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "fs-extra": "^11.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.1",
    "@types/jest": "^29.5.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.7.2"
  }
}
```

---

## SUMMARY

This extension plan provides a **clear, actionable roadmap** to evolve the existing Java analyzer into a comprehensive code intelligence system.

**Key Highlights**:

✅ **Preserves Architecture**: All changes are additive, minimal risk  
✅ **MVP Focus**: 8-week timeline with clear deliverables  
✅ **Practical**: Addresses real-world needs (bugs, security, AI integration)  
✅ **Scalable**: Clear path from MVP to v2.0+  
✅ **Production-Ready**: SARIF output, GitHub integration, multiple formats  

**Next Steps**:

1. **Approve** this extension plan
2. **Allocate** development resources (1-2 developers)
3. **Start** Week 1 implementation (foundation layer)
4. **Review** progress weekly
5. **Deploy** MVP after Week 8

---

**Document Version**: 1.0  
**Last Updated**: 2026-04-21  
**Author**: Senior Engineer Assessment  
**Status**: Awaiting Approval
