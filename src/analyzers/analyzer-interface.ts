import { Finding } from "../core/types";
import { GraphStore } from "../graph/graph-store";

export interface Analyzer {
  name: string;
  category: "bug" | "security";
  analyze(store: GraphStore): Finding[];
}
