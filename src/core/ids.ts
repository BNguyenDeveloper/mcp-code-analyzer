export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function makeJavaFunctionId(repo: string, rawId: string): string {
  return `repo://${repo}/symbol/${normalizePath(rawId)}`;
}

export function makeJavaCallId(repo: string, callerId: string, calleeName: string, line: number): string {
  return `repo://${repo}/call/${encodeURIComponent(callerId)}->${calleeName}@L${line}`;
}

export function makeJavaClassId(repo: string, rawId: string): string {
  return `repo://${repo}/class/${normalizePath(rawId)}`;
}

export function makeJavaRouteId(repo: string, rawId: string): string {
  return `repo://${repo}/route/${normalizePath(rawId)}`;
}

export function makeJavaInjectionId(repo: string, rawId: string): string {
  return `repo://${repo}/inject/${normalizePath(rawId)}`;
}
