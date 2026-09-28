import fs from "node:fs";
import { artifactPaths, loadCommittedDataset } from "../pipeline";
import type {
  CheckBase,
  Dataset,
  EditionKey,
  PipelinePaths,
  Question,
  SportPack,
} from "../types";

/** Re-derive a reported answer from committed inputs only. Never ingest or generate. */
export function verifyReportedQuestion<
  M,
  E extends EditionKey,
  T extends string,
  C extends CheckBase<E>,
  DS extends Dataset<M, E>,
  V,
>(
  pack: SportPack<M, E, T, C, DS, V>,
  paths: PipelinePaths,
  questionId: string,
): {
  outcome: "confirmed" | "not_confirmed" | "question_not_found";
  issues: string[];
} {
  const bank = JSON.parse(
    fs.readFileSync(
      artifactPaths(paths, pack.config.artifactSuffix).bank,
      "utf8",
    ),
  ) as { questions: Question<T, C>[] };
  const q = bank.questions.find((q) => q.id === questionId);
  if (!q) return { outcome: "question_not_found", issues: [] };
  const { ds, coverage } = loadCommittedDataset(pack, paths);
  const check = pack.checks[q.provenance.check.kind];
  if (!check) throw Error("Reported question has no independent check");
  const issues = [...pack.questionGuards(q, ds, coverage), ...check(q, ds)];
  return { outcome: issues.length ? "confirmed" : "not_confirmed", issues };
}
