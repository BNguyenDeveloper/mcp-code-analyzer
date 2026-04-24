export type RepoType = "frontend" | "backend" | "library" | "service" | "unknown";

export interface RepoConfig {
  name: string;
  path?: string;
  url?: string;
  branch?: string;
  language: string;
  type: RepoType;
  team?: string;
  provider?: "local" | "gitlab" | "github";
}

export interface FunctionSymbol {
  id: string;
  repo: string;
  file: string;
  name: string;
  kind: "Function" | "Method";
  exported: boolean;
  line: number;
  column?: number;
  className?: string;
}

export interface ImportRelation {
  id: string;
  repo: string;
  fromFile: string;
  importedPath: string;
  importedSymbols: string[];
  isExternal: boolean;
}

export interface CallRelation {
  id: string;
  repo: string;
  callerId: string;
  calleeName: string;
  calleeId?: string;
  file: string;
  line: number;
  scopeName?: string;
}

export interface JavaClassInfo {
  id: string;
  repo: string;
  file: string;
  packageName: string;
  className: string;
  stereotype: string;
}

export interface RouteInfo {
  id: string;
  repo: string;
  file: string;
  className: string;
  methodName: string;
  httpMethod: string;
  fullPath: string;
  line: number;
}

export interface InjectionInfo {
  id: string;
  repo: string;
  file: string;
  className: string;
  targetClassName: string;
  fieldName: string;
  injectionType: string;
}

export interface ParseFailure {
  file: string;
  errorType: string;
  message: string;
}

export interface TryCatchInfo {
  id: string;
  repo: string;
  file: string;
  methodId: string;
  line: number;
  hasCatchBlock: boolean;
  catchBlockEmpty: boolean;
  hasResources: boolean;
}

export interface StringConcatInfo {
  id: string;
  repo: string;
  file: string;
  methodId: string;
  line: number;
  operator: string; // "+" or "concat"
  inSqlContext: boolean;
  inCommandContext: boolean;
}

export interface PreparedStatementInfo {
  id: string;
  repo: string;
  file: string;
  methodId: string;
  line: number;
  usesPreparedStatement: boolean;
  usesParameterization: boolean;
}

export interface SuppressionInfo {
  repo: string;
  file: string;
  line: number;
  ruleId: string;
  reason?: string;
}

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
  tryCatchBlocks?: TryCatchInfo[];
  stringConcats?: StringConcatInfo[];
  preparedStatements?: PreparedStatementInfo[];
  suppressions?: SuppressionInfo[];
}

export interface ImpactReport {
  targetSymbol: string;
  directCallers: FunctionSymbol[];
  directCallees: FunctionSymbol[];
  impactedFiles: string[];
  impactedRepos: string[];
  impactedRoutes: RouteInfo[];
  riskScore: number;
  riskLevel: "Low" | "Medium" | "High";
  notes: string[];
}

// ============ CODE INTELLIGENCE TYPES (Phase 1) ============

export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FindingCategory = "bug" | "security";

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

  // Context
  functionId?: string;
  className?: string;

  // Metadata
  confidence: number;
  cwe?: string[];
  remediation?: string;
}

export interface AnalysisResult {
  version: string;
  timestamp: string;
  repos: string[];
  summary: {
    total: number;
    bySeverity: Record<FindingSeverity, number>;
    byCategory: Record<FindingCategory, number>;
  };
  findings: Finding[];
}
