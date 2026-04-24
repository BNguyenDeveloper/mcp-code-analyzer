# PRACTICAL EXTENSION PLAN: Java Code Intelligence MVP

**Project**: company-code-intel-java-phase2  
**Version**: MVP v1.0 (Practical Review)  
**Date**: 2026-04-21  
**Timeline**: 4 weeks (not 8)  
**Status**: Implementation Ready  

---

## 1. QUICK ASSESSMENT

### ✅ What is Good in Current Plan

1. **Architecture preservation**: Correctly identifies need to extend, not rewrite
2. **Layered approach**: CLI → App → Graph → Detectors → Reporters makes sense
3. **Graph enhancement**: Bidirectional indexes are essential and correct
4. **SARIF output**: Practical for GitHub integration
5. **Type definitions**: Good foundation for extensibility

### ⚠️ What is Risky / Over-Scoped

1. **Too many layers**: Separate `engines/`, `detectors/`, `findings/`, `reporters/` adds unnecessary complexity
2. **Data flow engine**: "Reaching definitions" and "liveness analysis" are academic features not needed for MVP
3. **Control flow graph**: Full CFG construction with successors/predecessors is overkill
4. **Taint engine**: Described as full inter-procedural analysis - too complex for MVP
5. **Four reporter formats**: AI-reporter and SARIF in MVP is excessive
6. **Graph metrics**: Centrality, clustering are nice-to-have, not MVP
7. **Query DSL**: Not needed for MVP
8. **8-week timeline**: Unrealistic for what's actually deliverable

### 🔴 What Must Be Fixed

1. **Collapse module structure**: Merge engines+detectors into single `analyzers/` folder
2. **Simplify detection**: Pattern-based rules only, no "engines"
3. **Remove graph-metrics.ts and graph-query.ts**: Not needed
4. **Reduce reporters**: Console + JSON only for MVP
5. **Cut timeline**: 4 weeks realistic, not 8
6. **Reduce parser changes**: Only extract what's absolutely needed
7. **Remove "logic-detector"**: Bug + Security only for MVP

---

## 2. MVP SCOPE CORRECTION

### ✅ INCLUDED in MVP (Must Have)

**Core Capabilities**:
1. Enhanced graph with bidirectional indexes
2. **3 Bug Detection Rules** (not 5):
   - Null pointer after Optional.get()
   - Resource not closed in try-catch
   - Empty catch blocks
3. **2 Security Detection Rules** (not 3):
   - SQL injection (simple pattern matching)
   - Command injection (simple pattern matching)
4. **2 Output Formats**:
   - Console (human-readable)
   - JSON (machine-readable)
5. **Single unified command**: `npm run analyze`

**Architecture**:
- Graph enhancement (bidirectional indexes)
- Simple pattern-based detectors
- Finding aggregation
- Basic reporting

### ❌ EXCLUDED from MVP (Defer to v2.0)

1. ❌ Full control flow graph (CFG)
2. ❌ Data flow engine (reaching definitions, liveness)
3. ❌ Taint engine (inter-procedural analysis)
4. ❌ SARIF reporter (defer until customers request it)
5. ❌ AI-reporter (defer until LLM integration is confirmed need)
6. ❌ Graph metrics (centrality, clustering)
7. ❌ Query DSL
8. ❌ Logic detector (transaction boundaries, idempotency)
9. ❌ Incremental analysis
10. ❌ XSS detection (requires taint analysis)
11. ❌ Variable tracking (too complex for MVP)
12. ❌ Division by zero detection (requires value analysis)

---

## 3. SIMPLIFIED ARCHITECTURE

### Before (Over-Engineered)
```
CLI → App → Parsers → Graph → Engines → Detectors → Findings → Reporters
```

### After (Practical MVP)
```
CLI → App → Parsers → Graph → Analyzers → Reporters
```

### Module Structure (Simplified)

```
src/
├── cli/
│   └── main.ts                    # [ENHANCED] Add analyze command
│
├── app/
│   ├── index-repos.ts             # [ENHANCED] Add buildEnhancedIndexes()
│   ├── run-impact.ts              # [UNCHANGED]
│   └── run-analyze.ts             # [NEW] Main analysis orchestrator
│
├── core/
│   ├── types.ts                   # [ENHANCED] Add Finding types
│   └── ids.ts                     # [UNCHANGED]
│
├── graph/
│   └── graph-store.ts             # [ENHANCED] Add bidirectional indexes
│
├── analyzers/                     # [NEW] Merged detectors
│   ├── analyzer-interface.ts      # Base interface
│   ├── bug-analyzer.ts            # 3 bug rules
│   ├── security-analyzer.ts       # 2 security rules
│   └── rules.ts                   # Rule definitions
│
└── reporters/                     # [NEW] Output
    ├── console-reporter.ts
    └── json-reporter.ts

java-analyzer/
└── src/main/java/.../Main.java    # [ENHANCED] Extract try-catch info only
```

**Total New Files**: 7 (not 23)  
**Total New LOC**: ~1,500 (not 3,000)  

---

## 4. REVISED IMPLEMENTATION PLAN

### Phase 1: Foundation (Week 1)

**Goal**: Graph enhancement + finding infrastructure

**Tasks**:
1. Enhance `types.ts`: Add `Finding`, `FindingSeverity`, `FindingCategory`
2. Enhance `GraphStore`: Add bidirectional indexes (`getDirectCallers`, `getDirectCallees`)
3. Update `index-repos.ts`: Call `buildEnhancedIndexes()`
4. Create `analyzer-interface.ts`: Base detection interface
5. Create `console-reporter.ts`: Basic text output
6. Create `json-reporter.ts`: JSON output

**Deliverables**:
- Bidirectional graph queries work
- Empty analyzer framework ready
- Reporter infrastructure ready

**Code Changes**:
- `types.ts`: +80 LOC
- `graph-store.ts`: +60 LOC  
- `index-repos.ts`: +2 LOC
- New files: ~300 LOC

**Total**: ~450 LOC

---

### Phase 2: Bug Detection (Week 2)

**Goal**: Implement 3 pattern-based bug rules

**Tasks**:
1. Enhance `Main.java`: Extract try-catch blocks (no variables, no CFG)
2. Update `java-parser.ts`: Parse try-catch data
3. Implement `bug-analyzer.ts`:
   - **Rule 1**: Optional.get() without isPresent() check
   - **Rule 2**: Resource opened in try but not in try-with-resources
   - **Rule 3**: Empty catch blocks
4. Create `run-analyze.ts`: Orchestrate analysis
5. Update `main.ts`: Add `analyze` command

**Deliverables**:
- 3 bug rules detect issues
- Findings stored in `data/findings/bugs.json`
- Console output shows results

**Detection Logic** (Pattern-Based, No Engine):

```typescript
// Rule 1: Unsafe Optional.get()
function detectUnsafeOptionalGet(store: GraphStore): Finding[] {
  const findings: Finding[] = [];
  
  for (const call of store.calls) {
    if (call.calleeName === "get" && call.scopeName?.includes("Optional")) {
      // Check if isPresent() called in same method
      const caller = store.getFunctionById(call.callerId);
      const sameFunctionCalls = store.calls.filter(c => c.callerId === call.callerId);
      const hasIsPresentCheck = sameFunctionCalls.some(c => c.calleeName === "isPresent");
      
      if (!hasIsPresentCheck) {
        findings.push({
          id: `BUG-001-${call.file}-${call.line}`,
          category: "bug",
          severity: "high",
          ruleId: "BUG-001",
          ruleName: "Unsafe Optional.get()",
          message: "Optional.get() called without isPresent() check",
          repo: call.repo,
          file: call.file,
          line: call.line,
          functionId: call.callerId,
          confidence: 85
        });
      }
    }
  }
  
  return findings;
}
```

**Code Changes**:
- `Main.java`: +40 LOC (try-catch extraction only)
- `java-parser.ts`: +20 LOC
- `bug-analyzer.ts`: +250 LOC
- `run-analyze.ts`: +150 LOC
- `main.ts`: +15 LOC

**Total**: ~475 LOC

---

### Phase 3: Security Detection (Week 3)

**Goal**: Implement 2 pattern-based security rules (simple, no taint engine)

**Tasks**:
1. Implement `security-analyzer.ts`:
   - **Rule 1**: SQL injection via string concatenation
   - **Rule 2**: Command injection via Runtime.exec with string concatenation
2. Update `run-analyze.ts`: Integrate security analyzer

**Deliverables**:
- 2 security rules detect issues
- Findings stored in `data/findings/security.json`
- Combined output in `data/findings/all.json`

**Detection Logic** (Pattern-Based, No Taint Engine):

```typescript
// Rule: SQL Injection (Simple Pattern)
function detectSQLInjection(store: GraphStore): Finding[] {
  const findings: Finding[] = [];
  
  for (const call of store.calls) {
    // Look for JDBC execute methods
    if (["execute", "executeQuery", "executeUpdate"].includes(call.calleeName)) {
      const caller = store.getFunctionById(call.callerId);
      
      // Heuristic: If caller is in @RestController and calls SQL execution
      if (caller?.className) {
        const classInfo = store.classes.find(c => c.className === caller.className);
        if (classInfo?.stereotype === "RestController" || classInfo?.stereotype === "Controller") {
          // Controller → SQL execution = potential injection
          findings.push({
            id: `SEC-001-${call.file}-${call.line}`,
            category: "security",
            severity: "critical",
            ruleId: "SEC-001",
            ruleName: "Potential SQL Injection",
            message: "Controller method directly executes SQL query - validate input sanitization",
            repo: call.repo,
            file: call.file,
            line: call.line,
            functionId: call.callerId,
            confidence: 70,
            cwe: ["CWE-89"],
            remediation: "Use PreparedStatement with parameterized queries"
          });
        }
      }
      
      // Alternative: Look for string concatenation in query
      // (requires variable tracking - defer to v2.0)
    }
  }
  
  return findings;
}
```

**Code Changes**:
- `security-analyzer.ts`: +200 LOC
- `run-analyze.ts`: +20 LOC

**Total**: ~220 LOC

---

### Phase 4: Integration & Polish (Week 4)

**Goal**: End-to-end testing and documentation

**Tasks**:
1. Test on 2-3 real Java repos
2. Tune confidence thresholds
3. Fix false positives
4. Write README with examples
5. Create sample outputs
6. Document detection rules

**Deliverables**:
- Working end-to-end pipeline
- Documentation
- Sample reports

**Code Changes**:
- Bug fixes: ~100 LOC
- Documentation: README, examples

**Total**: ~100 LOC

---

## 5. PARSER IMPROVEMENT (MINIMAL)

### ❌ DO NOT Extract (Too Complex)

- Variable declarations and assignments
- Control flow graph nodes
- Data flow edges
- Full CFG with successors/predecessors

### ✅ DO Extract (Minimal Addition)

**Only add try-catch information for resource leak detection:**

```java
// In Main.java
public static class TryCatchInfo {
    public String methodId;
    public String file;
    public int line;
    public boolean hasCatchBlock;
    public boolean catchBlockEmpty;
    public boolean hasResources;  // try-with-resources
}

public static class Output {
    // ... existing fields
    public List<TryCatchInfo> tryCatchBlocks = new ArrayList<>();
}

private static void parseTryCatchBlocks(MethodDeclaration method, String methodId, String file, Output output) {
    method.findAll(TryStmt.class).forEach(tryStmt -> {
        TryCatchInfo info = new TryCatchInfo();
        info.methodId = methodId;
        info.file = file;
        info.line = tryStmt.getBegin().map(p -> p.line).orElse(-1);
        info.hasCatchBlock = !tryStmt.getCatchClauses().isEmpty();
        info.hasResources = !tryStmt.getResources().isEmpty();
        
        // Check if catch is empty
        if (info.hasCatchBlock) {
            info.catchBlockEmpty = tryStmt.getCatchClauses().stream()
                .allMatch(cc -> cc.getBody().getStatements().isEmpty());
        }
        
        output.tryCatchBlocks.add(info);
    });
}
```

**Impact**: +30 LOC in Main.java (not 150)

---

## 6. DETECTOR SCOPE (FIXED)

### MVP Rules (5 Total)

#### Bug Detection (3 rules)

| ID | Name | Complexity | Detection Method |
|----|------|------------|------------------|
| BUG-001 | Unsafe Optional.get() | Low | Pattern: get() without isPresent() in same method |
| BUG-002 | Resource Leak in Try-Catch | Low | Pattern: try without resources, has catch |
| BUG-003 | Empty Catch Block | Low | Pattern: catch with empty body |

#### Security Detection (2 rules)

| ID | Name | Complexity | Detection Method |
|----|------|------------|------------------|
| SEC-001 | SQL Injection Risk | Medium | Pattern: Controller → SQL execution |
| SEC-002 | Command Injection Risk | Medium | Pattern: Controller → Runtime.exec() |

### ❌ Deferred to v2.0

- Division by zero (requires value analysis)
- Unreachable code (requires CFG)
- XSS (requires taint analysis)
- Null pointer beyond Optional (requires value analysis)
- CSRF (requires framework-specific analysis)
- Auth bypass (requires complex logic)

---

## 7. KNOWLEDGE GRAPH (SIMPLIFIED)

### Keep (Essential)

```typescript
export class GraphStore {
  // Existing
  functions: Map<string, FunctionSymbol>;
  calls: CallRelation[];
  imports: ImportRelation[];
  classes: JavaClassInfo[];
  routes: RouteInfo[];
  injections: InjectionInfo[];
  
  // NEW: Bidirectional indexes (simple)
  private callersIndex: Map<string, Set<string>>;  // calleeId → callerIds
  
  buildEnhancedIndexes() {
    for (const call of this.calls) {
      if (call.calleeId) {
        if (!this.callersIndex.has(call.calleeId)) {
          this.callersIndex.set(call.calleeId, new Set());
        }
        this.callersIndex.get(call.calleeId)!.add(call.callerId);
      }
    }
  }
  
  getDirectCallers(fnId: string): FunctionSymbol[] {
    const callerIds = this.callersIndex.get(fnId) || new Set();
    return Array.from(callerIds)
      .map(id => this.getFunctionById(id))
      .filter(Boolean) as FunctionSymbol[];
  }
}
```

**Impact**: +40 LOC (not 150)

### ❌ Remove (Not MVP)

- `graph-traversal.ts` (transitive queries defer to v2.0)
- `graph-metrics.ts` (centrality, clustering)
- `graph-query.ts` (query DSL)
- Path finding algorithms
- Transitive caller/callee (use direct only)

---

## 8. CLI SIMPLIFICATION

### MVP CLI (Single Unified Command)

```bash
# Run everything (index + analyze + report)
npm run analyze

# Or run steps separately
npm run index          # Parse and build graph (existing)
npm run analyze:only   # Run analyzers on existing graph
npm run impact         # Impact analysis (existing, unchanged)
```

### Command Implementation

```typescript
// src/cli/main.ts
program
  .command("analyze")
  .description("Run code analysis (bugs + security)")
  .option("--bugs-only", "Run only bug detection")
  .option("--security-only", "Run only security detection")
  .option("--json", "Output JSON instead of console")
  .action(async (opts) => {
    const { runAnalyze } = await import("../app/run-analyze");
    await runAnalyze({
      bugs: !opts.securityOnly,
      security: !opts.bugsOnly,
      format: opts.json ? "json" : "console"
    });
  });
```

### ❌ Remove from MVP

- `npm run intel` (unnecessary wrapper)
- `--incremental` flag (defer to v2.0)
- `--max-depth` (not using transitive)
- `--min-confidence` (hardcode thresholds in MVP)
- Separate `report` command (integrate into analyze)

---

## 9. DATA MODEL (SIMPLIFIED)

### Finding Type (Essential Only)

```typescript
export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FindingCategory = "bug" | "security";

export interface Finding {
  id: string;                    // Unique: <category>-<ruleId>-<file>-<line>
  category: FindingCategory;
  severity: FindingSeverity;
  ruleId: string;
  ruleName: string;
  message: string;
  
  // Location
  repo: string;
  file: string;
  line: number;
  
  // Context
  functionId?: string;
  className?: string;
  
  // Metadata
  confidence: number;           // 0-100
  cwe?: string[];              // For security findings only
  remediation?: string;
}

export interface AnalysisResult {
  timestamp: string;
  repos: string[];
  summary: {
    total: number;
    bySeverity: Record<FindingSeverity, number>;
    byCategory: Record<FindingCategory, number>;
  };
  findings: Finding[];
}
```

### ❌ Remove (Not MVP)

- `DataFlowPath` (no taint analysis)
- `DataFlowStep` (no taint analysis)
- `CFGNode` (no CFG)
- `VariableDeclaration` (no variable tracking)
- `relatedLocations` (single location only)
- `codeSnippet` (defer to v2.0)
- `cvss` score (just use severity)

---

## 10. FILE ORGANIZATION (FINAL)

### Directory Structure

```
data/
├── raw/
│   └── repo-analyses.json       # Existing
├── graph/                        # Existing
│   ├── functions.json
│   ├── calls.json
│   ├── classes.json
│   ├── routes.json
│   └── injections.json
└── findings/                     # NEW
    ├── bugs.json                 # Bug findings
    ├── security.json             # Security findings
    └── all.json                  # Combined findings + summary
```

**No need for**: `enhanced/`, `reports/`, multiple subdirectories

---

## 11. REALISTIC TIMELINE

| Week | Phase | Deliverable | LOC |
|------|-------|-------------|-----|
| **1** | Foundation | Graph + Finding types + Reporters | ~450 |
| **2** | Bug Detection | 3 bug rules working | ~475 |
| **3** | Security Detection | 2 security rules working | ~220 |
| **4** | Polish | Testing + Docs | ~100 |
| **Total** | **4 weeks** | **MVP Complete** | **~1,245** |

**Not 8 weeks, not 3,000 LOC**

---

## 12. IMPLEMENTATION CHECKLIST

### Week 1: Foundation

- [ ] Add Finding types to `types.ts`
- [ ] Add bidirectional index to `GraphStore`
- [ ] Create `analyzer-interface.ts`
- [ ] Create `console-reporter.ts`
- [ ] Create `json-reporter.ts`
- [ ] Update `index-repos.ts` to build indexes
- [ ] Test: Verify graph queries work

### Week 2: Bug Detection

- [ ] Update `Main.java` with try-catch extraction
- [ ] Update `java-parser.ts` to parse try-catch
- [ ] Implement `bug-analyzer.ts` with 3 rules
- [ ] Create `run-analyze.ts` orchestrator
- [ ] Update `main.ts` CLI with analyze command
- [ ] Test: Detect bugs in sample code

### Week 3: Security Detection

- [ ] Implement `security-analyzer.ts` with 2 rules
- [ ] Integrate into `run-analyze.ts`
- [ ] Test: Detect security issues in sample code
- [ ] Tune confidence thresholds

### Week 4: Polish

- [ ] Test on 2-3 real repos
- [ ] Fix false positives
- [ ] Write README
- [ ] Document rules
- [ ] Create example outputs

---

## 13. EXAMPLE OUTPUT (MVP)

```bash
$ npm run analyze

Analyzing repositories...
  ✓ Indexed my-java-project (245 functions)
  ✓ Built graph indexes

Running bug detection...
  Found 8 issues

Running security detection...
  Found 2 issues

─────────────────────────────────────────
ANALYSIS SUMMARY
─────────────────────────────────────────
Total Findings: 10
  Critical: 2
  High: 5
  Medium: 3

By Category:
  Bug: 8
  Security: 2

TOP ISSUES
─────────────────────────────────────────

[CRITICAL] Potential SQL Injection (SEC-001)
  Location: OrderService.java:45 (OrderService.createOrder)
  Issue: Controller method directly executes SQL query
  Recommendation: Use PreparedStatement with parameterized queries
  Confidence: 70%

[HIGH] Unsafe Optional.get() (BUG-001)
  Location: UserService.java:67 (UserService.getUser)
  Issue: Optional.get() called without isPresent() check
  Confidence: 85%

[HIGH] Resource Leak in Try-Catch (BUG-002)
  Location: FileProcessor.java:23 (FileProcessor.process)
  Issue: Resource opened in try but not using try-with-resources
  Confidence: 90%

[MEDIUM] Empty Catch Block (BUG-003)
  Location: ErrorHandler.java:34 (ErrorHandler.handle)
  Issue: Exception caught but not handled (empty catch)
  Confidence: 95%

... (6 more issues)

Results saved to:
  - data/findings/all.json
  - data/findings/bugs.json
  - data/findings/security.json
```

---

## 14. SUCCESS CRITERIA (MVP)

| Metric | Target | Realistic? |
|--------|--------|------------|
| Rules Implemented | 5 | ✅ Yes |
| False Positive Rate | <30% | ✅ Yes (pattern-based) |
| Performance | <10s for 10k functions | ✅ Yes (no complex analysis) |
| Setup Time | <5 minutes | ✅ Yes |
| Code Added | <1,500 LOC | ✅ Yes |
| Timeline | 4 weeks | ✅ Yes |

---

## 15. WHAT WE'RE NOT DOING (AND WHY)

| Feature | Why Deferred |
|---------|--------------|
| Full taint analysis | Too complex, requires inter-procedural analysis |
| Control flow graph | Not needed for pattern-based rules |
| Data flow engine | Academic feature, overkill for MVP |
| Variable tracking | Complex, low ROI for MVP |
| SARIF output | No customer demand yet |
| AI-optimized output | No LLM integration plan yet |
| Graph metrics | Nice-to-have, not essential |
| Query DSL | Over-engineering |
| Incremental analysis | Performance optimization, not core feature |
| Transitive analysis | Direct dependencies sufficient for MVP |

---

## 16. V2.0 ROADMAP (POST-MVP)

**Only if MVP proves valuable:**

1. **Enhanced Security** (2-3 weeks)
   - Add taint analysis (1-level only)
   - XSS detection
   - Add 3 more security rules

2. **SARIF Output** (1 week)
   - Implement if customers request GitHub integration

3. **Transitive Impact** (1-2 weeks)
   - Add transitive caller/callee queries
   - Impact depth analysis

4. **Graph Visualization** (2 weeks)
   - DOT export
   - Interactive graph (if needed)

5. **More Bug Rules** (ongoing)
   - Add rules based on user feedback

---

## SUMMARY: KEY CHANGES FROM ORIGINAL PLAN

| Aspect | Original Plan | Practical Plan |
|--------|---------------|----------------|
| **Timeline** | 8 weeks | 4 weeks |
| **LOC Added** | ~3,000 | ~1,245 |
| **New Modules** | 23 files | 7 files |
| **Layers** | 7 layers | 4 layers |
| **Bug Rules** | 5 | 3 |
| **Security Rules** | 3 | 2 |
| **Reporters** | 4 formats | 2 formats |
| **Parser Changes** | 150 LOC | 30 LOC |
| **Graph Features** | Transitive, metrics, query DSL | Direct queries only |
| **Data Flow** | Full engine | None |
| **Control Flow** | Full CFG | None |
| **Taint Analysis** | Inter-procedural | None |

**Result**: Deliverable MVP that provides value without over-engineering

---

## FINAL RECOMMENDATION

**Start with Phase 1 this week.** After 1 week, we'll have:
- Enhanced graph
- Reporter infrastructure
- Clear path for detector implementation

**Decision point after Week 2**: If bug detection is working well and providing value, continue. If not, pivot or adjust scope.

**This is a working system, not a research project.**

---

**Document Version**: 1.0 (Practical Review)  
**Approved for Implementation**: Pending  
**Next Step**: Begin Week 1 tasks
