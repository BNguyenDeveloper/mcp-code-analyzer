import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "path";
import {
  RepoAnalysis,
  RepoConfig,
  FunctionSymbol,
  CallRelation,
  JavaClassInfo,
  RouteInfo,
  InjectionInfo,
  ParseFailure,
  TryCatchInfo
} from "../../core/types";
import {
  makeJavaCallId,
  makeJavaClassId,
  makeJavaFunctionId,
  makeJavaInjectionId,
  makeJavaRouteId
} from "../../core/ids";

const execFileAsync = promisify(execFile);

export class JavaParserAdapter {
  supports(language: string): boolean {
    return language.toLowerCase() === "java";
  }

  async parse(repo: RepoConfig): Promise<RepoAnalysis> {
    if (!repo.path) {
      throw new Error(`Java repo ${repo.name} must have a local path`);
    }

    const jarPath = path.resolve("java-analyzer/target/java-analyzer-1.0.0.jar");

    const { stdout, stderr } = await execFileAsync("java", ["-jar", jarPath, repo.path], {
      maxBuffer: 50 * 1024 * 1024
    });

    if (stderr) {
      const trimmed = stderr.trim();
      if (trimmed.length > 0) {
        console.warn(trimmed);
      }
    }

    const parsed = JSON.parse(stdout);

    const functions: FunctionSymbol[] = (parsed.methods || []).map((m: any) => ({
      id: makeJavaFunctionId(repo.name, m.id),
      repo: repo.name,
      file: m.file,
      name: `${m.className}.${m.methodName}`,
      kind: "Method",
      exported: true,
      line: m.line,
      className: m.className
    }));

    const calls: CallRelation[] = (parsed.calls || []).map((c: any) => ({
      id: makeJavaCallId(repo.name, c.callerId, c.calleeName, c.line),
      repo: repo.name,
      callerId: makeJavaFunctionId(repo.name, c.callerId),
      calleeName: c.calleeName,
      file: c.file,
      line: c.line,
      scopeName: c.scopeName || undefined
    }));

    const classes: JavaClassInfo[] = (parsed.classes || []).map((c: any) => ({
      id: makeJavaClassId(repo.name, c.id),
      repo: repo.name,
      file: c.file,
      packageName: c.packageName,
      className: c.className,
      stereotype: c.stereotype
    }));

    const routes: RouteInfo[] = (parsed.routes || []).map((r: any) => ({
      id: makeJavaRouteId(repo.name, r.id),
      repo: repo.name,
      file: r.file,
      className: r.className,
      methodName: r.methodName,
      httpMethod: r.httpMethod,
      fullPath: r.fullPath,
      line: r.line
    }));

    const injections: InjectionInfo[] = (parsed.injections || []).map((i: any) => ({
      id: makeJavaInjectionId(repo.name, i.id),
      repo: repo.name,
      file: i.file,
      className: i.className,
      targetClassName: i.targetClassName,
      fieldName: i.fieldName,
      injectionType: i.injectionType
    }));

    const failures: ParseFailure[] = (parsed.failures || []).map((f: any) => ({
      file: f.file,
      errorType: f.errorType,
      message: f.message
    }));

    const tryCatchBlocks: TryCatchInfo[] = (parsed.tryCatchBlocks || []).map((tc: any) => ({
      id: `${repo.name}::${tc.id}`,
      repo: repo.name,
      file: tc.file,
      methodId: makeJavaFunctionId(repo.name, tc.methodId),
      line: tc.line,
      hasCatchBlock: tc.hasCatchBlock,
      catchBlockEmpty: tc.catchBlockEmpty,
      hasResources: tc.hasResources
    }));

    const stringConcats = (parsed.stringConcats || []).map((sc: any) => ({
      id: `${repo.name}::${sc.id}`,
      repo: repo.name,
      file: sc.file,
      methodId: makeJavaFunctionId(repo.name, sc.methodId),
      line: sc.line,
      operator: sc.operator,
      inSqlContext: sc.inSqlContext,
      inCommandContext: sc.inCommandContext
    }));

    const preparedStatements = (parsed.preparedStatements || []).map((ps: any) => ({
      id: `${repo.name}::${ps.id}`,
      repo: repo.name,
      file: ps.file,
      methodId: makeJavaFunctionId(repo.name, ps.methodId),
      line: ps.line,
      usesPreparedStatement: ps.usesPreparedStatement,
      usesParameterization: ps.usesParameterization
    }));

    const suppressions = (parsed.suppressions || []).map((s: any) => ({
      repo: repo.name,
      file: s.file,
      line: s.line,
      ruleId: s.ruleId,
      reason: s.reason
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
      tryCatchBlocks,
      stringConcats,
      preparedStatements,
      suppressions
    };
  }
}
