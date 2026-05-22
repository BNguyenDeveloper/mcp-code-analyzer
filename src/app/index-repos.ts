import fs from "fs-extra";
import { inferRepoConfig } from "../registry/repo-registry";
import { GraphStore } from "../graph/graph-store";
import { JavaParserAdapter } from "../parsers/java/java-parser";
import { LanguageParser } from "../parsers/parser-interface";

const parsers: LanguageParser[] = [
  new JavaParserAdapter()
];

function getParser(language: string): LanguageParser {
  const parser = parsers.find((p) => p.supports(language));
  if (!parser) {
    throw new Error(`No parser available for language: ${language}`);
  }
  return parser;
}

export interface IndexOptions {
  repoRoot?: string;
  repoName?: string;
}

export async function indexAllRepos(options: IndexOptions = {}) {
  const repo = await inferRepoConfig(options.repoRoot, options.repoName);
  const store = new GraphStore();
  const parser = getParser(repo.language);

  console.log(`Indexing ${repo.name}...`);
  const analysis = await parser.parse(repo);
  store.addRepoAnalysis(analysis);

  store.resolveCallsByName();

  // Phase 1: Build bidirectional indexes for analysis
  store.buildEnhancedIndexes();

  await fs.ensureDir("data/raw");
  await fs.ensureDir("data/findings");

  await fs.writeJson("data/raw/repo-analyses.json", store.repoAnalyses, { spaces: 2 });

  console.log("Index complete.");
}
