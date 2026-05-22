import {
  CallRelation,
  FunctionSymbol,
  ImportRelation,
  RepoAnalysis,
  JavaClassInfo,
  RouteInfo,
  InjectionInfo,
  ParseFailure,
  TryCatchInfo,
  StringConcatInfo,
  PreparedStatementInfo,
  SuppressionInfo
} from "../core/types";

export class GraphStore {
  functions = new Map<string, FunctionSymbol>();
  calls: CallRelation[] = [];
  imports: ImportRelation[] = [];
  repoAnalyses: RepoAnalysis[] = [];

  classes: JavaClassInfo[] = [];
  routes: RouteInfo[] = [];
  injections: InjectionInfo[] = [];
  failures: ParseFailure[] = [];
  tryCatchBlocks: TryCatchInfo[] = [];
  stringConcats: StringConcatInfo[] = [];
  preparedStatements: PreparedStatementInfo[] = [];
  suppressions: SuppressionInfo[] = [];

  // Phase 1: Bidirectional indexes for direct caller/callee queries
  private callersIndex = new Map<string, Set<string>>();

  addRepoAnalysis(analysis: RepoAnalysis) {
    this.repoAnalyses.push(analysis);

    for (const fn of analysis.functions) {
      this.functions.set(fn.id, fn);
    }

    this.calls.push(...analysis.calls);
    this.imports.push(...analysis.imports);
    this.classes.push(...(analysis.classes || []));
    this.routes.push(...(analysis.routes || []));
    this.injections.push(...(analysis.injections || []));
    this.failures.push(...(analysis.failures || []));
    this.tryCatchBlocks.push(...(analysis.tryCatchBlocks || []));
    this.stringConcats.push(...(analysis.stringConcats || []));
    this.preparedStatements.push(...(analysis.preparedStatements || []));
    this.suppressions.push(...(analysis.suppressions || []));
  }

  getFunctionById(id: string): FunctionSymbol | undefined {
    return this.functions.get(id);
  }

  findFunctionsByName(name: string): FunctionSymbol[] {
    return Array.from(this.functions.values()).filter((f) => {
      if (f.name === name) return true;
      if (f.name.endsWith(`.${name}`)) return true;
      return false;
    });
  }

  getRoutesForFunction(fn: FunctionSymbol): RouteInfo[] {
    const methodName = fn.name.includes(".") ? fn.name.split(".").pop()! : fn.name;
    return this.routes.filter(
      (r) => r.className === fn.className && r.methodName === methodName
    );
  }

  getControllerClassesUsingService(serviceClassName: string): string[] {
    return this.injections
      .filter((inj) => inj.targetClassName === serviceClassName)
      .map((inj) => inj.className);
  }

  getRoutesForControllerClass(controllerClassName: string): RouteInfo[] {
    return this.routes.filter((r) => r.className === controllerClassName);
  }

  private normalizeScopeName(scopeName?: string): string | undefined {
    if (!scopeName) return undefined;
    return scopeName.replace(/^this\./, "").trim();
  }

  private getInjectedTargetClass(
    ownerClassName: string | undefined,
    fieldName: string | undefined
  ): string | undefined {
    if (!ownerClassName || !fieldName) return undefined;

    const normalizedField = this.normalizeScopeName(fieldName);

    const found = this.injections.find(
      (inj) =>
        inj.className === ownerClassName &&
        this.normalizeScopeName(inj.fieldName) === normalizedField
    );

    return found?.targetClassName;
  }

  private getFunctionsByClassAndMethod(className: string, methodName: string): FunctionSymbol[] {
    return Array.from(this.functions.values()).filter((fn) => {
      if (!fn.className) return false;
      const simpleMethod = fn.name.includes(".") ? fn.name.split(".").pop()! : fn.name;
      return fn.className === className && simpleMethod === methodName;
    });
  }

  resolveCallsByName() {
    const bySimpleMethodName = new Map<string, FunctionSymbol[]>();
    let unresolvedCount = 0;
    let ambiguousCount = 0;

    for (const fn of this.functions.values()) {
      const simple = fn.name.includes(".") ? fn.name.split(".").pop()! : fn.name;
      if (!bySimpleMethodName.has(simple)) {
        bySimpleMethodName.set(simple, []);
      }
      bySimpleMethodName.get(simple)!.push(fn);
    }

    for (const call of this.calls) {
      const callerFn = this.getFunctionById(call.callerId);
      const callerClassName = callerFn?.className;
      const scopeName = this.normalizeScopeName(call.scopeName);

      // Strategy 1: DI-based resolution (highest confidence)
      if (callerClassName && scopeName) {
        const targetClassName = this.getInjectedTargetClass(callerClassName, scopeName);

        if (targetClassName) {
          const matchedByInjection = this.getFunctionsByClassAndMethod(
            targetClassName,
            call.calleeName
          );

          if (matchedByInjection.length === 1) {
            call.calleeId = matchedByInjection[0].id;
            console.log(
              `[resolve] ${callerFn?.name} -> ${targetClassName}.${call.calleeName} via DI scope=${scopeName}`
            );
            continue;
          } else if (matchedByInjection.length > 1) {
            console.warn(
              `[resolve] Ambiguous DI resolution: ${callerFn?.name} -> ${targetClassName}.${call.calleeName} (${matchedByInjection.length} matches)`
            );
            ambiguousCount++;
            continue; // Don't resolve ambiguous calls
          }
        }

        // Strategy 2: Same-class resolution for "this" scope
        if (scopeName === "this") {
          const sameClassMatches = this.getFunctionsByClassAndMethod(
            callerClassName,
            call.calleeName
          );
          if (sameClassMatches.length === 1) {
            call.calleeId = sameClassMatches[0].id;
            console.log(
              `[resolve] ${callerFn?.name} -> ${callerClassName}.${call.calleeName} via this`
            );
            continue;
          } else if (sameClassMatches.length > 1) {
            console.warn(
              `[resolve] Ambiguous same-class resolution: ${callerFn?.name} -> ${call.calleeName} (${sameClassMatches.length} matches)`
            );
            ambiguousCount++;
            continue;
          }
        }
      }

      // Strategy 3: Same-class resolution for unscoped calls
      if (callerClassName && !scopeName) {
        const sameClassMatches = this.getFunctionsByClassAndMethod(
          callerClassName,
          call.calleeName
        );
        if (sameClassMatches.length === 1) {
          call.calleeId = sameClassMatches[0].id;
          console.log(
            `[resolve] ${callerFn?.name} -> ${callerClassName}.${call.calleeName} via same-class`
          );
          continue;
        } else if (sameClassMatches.length > 1) {
          console.warn(
            `[resolve] Ambiguous same-class resolution: ${callerFn?.name} -> ${call.calleeName} (${sameClassMatches.length} matches)`
          );
          ambiguousCount++;
          continue;
        }
      }

      // Strategy 4: Simple name fallback - ONLY if unique globally
      const matched = bySimpleMethodName.get(call.calleeName) || [];
      if (matched.length === 1) {
        call.calleeId = matched[0].id;
        console.log(
          `[resolve] ${callerFn?.name || call.callerId} -> ${call.calleeName} via unique-global-match`
        );
      } else if (matched.length > 1) {
        console.warn(
          `[resolve] Ambiguous global resolution: ${call.calleeName} has ${matched.length} implementations - not resolving`
        );
        ambiguousCount++;
      } else {
        unresolvedCount++;
      }
    }

    console.log(`Call resolution complete: ${unresolvedCount} unresolved, ${ambiguousCount} ambiguous (not resolved)`);
  }

  // Phase 1: Build bidirectional index for direct caller/callee queries
  buildEnhancedIndexes() {
    this.callersIndex.clear();

    for (const call of this.calls) {
      if (call.calleeId) {
        if (!this.callersIndex.has(call.calleeId)) {
          this.callersIndex.set(call.calleeId, new Set());
        }
        this.callersIndex.get(call.calleeId)!.add(call.callerId);
      }
    }

    console.log(`Built bidirectional indexes: ${this.callersIndex.size} functions have callers`);
  }

  // Phase 1: Get direct callers of a function
  getDirectCallers(fnId: string): FunctionSymbol[] {
    const callerIds = this.callersIndex.get(fnId);
    if (!callerIds) return [];

    return Array.from(callerIds)
      .map(id => this.getFunctionById(id))
      .filter(Boolean) as FunctionSymbol[];
  }

  // Phase 1: Get direct callees of a function
  getDirectCallees(fnId: string): FunctionSymbol[] {
    const calleeIds = this.calls
      .filter(c => c.callerId === fnId && c.calleeId)
      .map(c => c.calleeId!);

    return Array.from(new Set(calleeIds))
      .map(id => this.getFunctionById(id))
      .filter(Boolean) as FunctionSymbol[];
  }

  // Phase 2: Get all calls within a specific function
  getCallsInFunction(fnId: string): CallRelation[] {
    return this.calls.filter(c => c.callerId === fnId);
  }

  // Phase 2: Get try-catch blocks for a function
  getTryCatchBlocksForFunction(fnId: string): TryCatchInfo[] {
    return this.tryCatchBlocks.filter(tc => tc.methodId === fnId);
  }

  // Phase 2: Check if a method is called within a function
  isMethodCalledInFunction(fnId: string, methodName: string): boolean {
    return this.calls.some(c =>
      c.callerId === fnId && c.calleeName === methodName
    );
  }

  // Get string concatenations in a function
  getStringConcatsInFunction(fnId: string): StringConcatInfo[] {
    return this.stringConcats.filter(sc => sc.methodId === fnId);
  }

  // Check if function uses PreparedStatement
  usesPreparedStatement(fnId: string): boolean {
    return this.preparedStatements.some(ps => ps.methodId === fnId && ps.usesPreparedStatement);
  }

  // Check if function uses parameterized queries
  usesParameterization(fnId: string): boolean {
    return this.preparedStatements.some(ps => ps.methodId === fnId && ps.usesParameterization);
  }

  // Check if a finding should be suppressed
  isSuppressed(file: string, line: number, ruleId: string): boolean {
    // Improved suppression matching to reduce accidental suppressions:
    // 1. Exact same-line match (comment on same line)
    // 2. Previous line match (comment directly above)
    // Removed: Broad ±2 matching to avoid suppressing unrelated findings
    return this.suppressions.some(s => {
      if (s.file !== file || s.ruleId !== ruleId) {
        return false;
      }

      // Same line (e.g., stmt.execute(sql); // analyzer-ignore SEC-001)
      if (s.line === line) {
        return true;
      }

      // Previous line (e.g., // analyzer-ignore SEC-001\n stmt.execute(sql);)
      if (s.line === line - 1) {
        return true;
      }

      return false;
    });
  }

  // Get call chain depth (simple 2-3 hop traversal)
  getCallChain(startFnId: string, depth: number = 2): FunctionSymbol[][] {
    const chains: FunctionSymbol[][] = [];
    const visited = new Set<string>();

    const traverse = (fnId: string, currentChain: FunctionSymbol[], remainingDepth: number) => {
      if (remainingDepth === 0) {
        if (currentChain.length > 1) {
          chains.push([...currentChain]);
        }
        return;
      }

      const fn = this.getFunctionById(fnId);
      if (!fn || visited.has(fnId)) return;

      visited.add(fnId);
      currentChain.push(fn);

      const callees = this.getDirectCallees(fnId);
      if (callees.length === 0 && currentChain.length > 1) {
        chains.push([...currentChain]);
      }

      for (const callee of callees) {
        traverse(callee.id, currentChain, remainingDepth - 1);
      }

      currentChain.pop();
      visited.delete(fnId);
    };

    traverse(startFnId, [], depth);
    return chains;
  }
}
