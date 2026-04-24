import { RepoAnalysis, RepoConfig } from "../core/types";

export interface LanguageParser {
  supports(language: string): boolean;
  parse(repo: RepoConfig): Promise<RepoAnalysis>;
}
