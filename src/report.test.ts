import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultPaths, artifactPaths } from "./pipeline";
import { verifyReportedQuestion } from "./validate/report";
import type { AnySportPack } from "./types";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "scorewit-report-"));
try {
  const paths = defaultPaths(root);
  fs.mkdirSync(paths.dataDir, { recursive: true });
  fs.mkdirSync(paths.datasetDir, { recursive: true });
  fs.writeFileSync(
    path.join(paths.datasetDir, "tournaments.json"),
    JSON.stringify([{ edition: 2026, matches: [{ goals: 3 }] }]),
  );
  fs.writeFileSync(path.join(paths.datasetDir, "meta.json"), "{}");
  const pack = {
    config: { artifactSuffix: "test" },
    loadDataset: (raw: any) => ({
      tournaments: raw,
      byEdition: new Map(raw.map((t: any) => [t.edition, t])),
    }),
    questionGuards: () => [],
    checks: {
      goals: (q: any, ds: any) =>
        q.answer === ds.byEdition.get(2026).matches[0].goals
          ? []
          : ["answer mismatch"],
    },
  } as unknown as AnySportPack;
  const questions = [
    {
      id: "good",
      answer: 3,
      provenance: { check: { kind: "goals", edition: 2026 } },
    },
    {
      id: "bad",
      answer: 4,
      provenance: { check: { kind: "goals", edition: 2026 } },
    },
  ];
  fs.writeFileSync(
    artifactPaths(paths, "test").bank,
    JSON.stringify({ questions }),
  );
  assert.equal(
    verifyReportedQuestion(pack, paths, "good").outcome,
    "not_confirmed",
  );
  assert.equal(verifyReportedQuestion(pack, paths, "bad").outcome, "confirmed");
  assert.equal(
    verifyReportedQuestion(pack, paths, "missing").outcome,
    "question_not_found",
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(artifactPaths(paths, "test").bank, "utf8"))
      .questions,
    questions,
  );
  console.log(
    "report validator: independently checked good, wrong and missing questions; frozen inputs unchanged",
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
