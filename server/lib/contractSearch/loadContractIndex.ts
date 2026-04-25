import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { contractRuleIndex } from "../../../src/data/contractCopilot/contractRuleIndex.ts";
import type { ContractDocumentChunk } from "../../../src/ai/retrieval/contracts/documentTypes.ts";

const projectRoot = "/Users/StarJ/Desktop/Senority+";
const parsedDir = path.join(projectRoot, "Delta data", "parsed", "contracts");
const pwaIndexPath = path.join(parsedDir, "pwaDocumentIndex.json");
const compensationIndexPath = path.join(parsedDir, "compensationManualIndex.json");
const schedulerIndexPath = path.join(parsedDir, "schedulerManualIndex.json");

type StoredContractIndex = {
  generatedAtIso: string;
  chunks: ContractDocumentChunk[];
  structuredPayTables?: {
    source: string;
    rows: Array<{
      equipmentLabel: string;
      seat: string;
      longevityYear: number;
      hourlyRate: number;
    }>;
  };
};

function buildSeededSchedulerChunks() {
  const chunks: ContractDocumentChunk[] = [];

  for (const rule of contractRuleIndex) {
    for (const [index, reference] of rule.references.entries()) {
      if (reference.sourceId !== "scheduler_manual") {
        continue;
      }
      chunks.push({
        id: `seeded-scheduler:${rule.id}:${index}`,
        source: "scheduler_manual",
        page: 0,
        section: reference.section,
        title: rule.title,
        text: reference.quoteSnippet ?? rule.summary,
        crossRefs: [],
        tags: ["scheduler", ...rule.title.toLowerCase().split(/\s+/)],
        nearbyIds: [],
        isDefinition: /definition/i.test(reference.section) || /definition/i.test(rule.title),
        isException: /exception|conflict/i.test(reference.section) || /exception|conflict/i.test(rule.title),
      });
    }
  }

  return chunks;
}

export function ensureContractParsedDir() {
  mkdirSync(parsedDir, { recursive: true });
}

export function loadContractDocumentIndex() {
  const seededSchedulerChunks = buildSeededSchedulerChunks();
  const compensationParsed = existsSync(compensationIndexPath)
    ? (JSON.parse(readFileSync(compensationIndexPath, "utf8")) as StoredContractIndex)
    : null;
  const schedulerParsed = existsSync(schedulerIndexPath)
    ? (JSON.parse(readFileSync(schedulerIndexPath, "utf8")) as StoredContractIndex)
    : null;
  const compensationChunks = compensationParsed?.chunks?.length ? compensationParsed.chunks : [];
  const compensationStructuredPayRows = compensationParsed?.structuredPayTables?.rows?.length
    ? compensationParsed.structuredPayTables.rows
    : [];
  const schedulerChunks = schedulerParsed?.chunks?.length ? schedulerParsed.chunks : seededSchedulerChunks;

  if (!existsSync(pwaIndexPath)) {
    return {
      pwaChunks: [] as ContractDocumentChunk[],
      compensationChunks,
      compensationStructuredPayRows,
      schedulerChunks,
      hasPwaIndex: false,
      hasCompensationIndex: Boolean(compensationParsed?.chunks?.length),
      hasSchedulerIndex: Boolean(schedulerParsed?.chunks?.length),
      pwaIndexPath,
      compensationIndexPath,
      schedulerIndexPath,
    };
  }

  const parsed = JSON.parse(readFileSync(pwaIndexPath, "utf8")) as StoredContractIndex;
  return {
    pwaChunks: parsed.chunks ?? [],
    compensationChunks,
    compensationStructuredPayRows,
    schedulerChunks,
    hasPwaIndex: true,
    hasCompensationIndex: Boolean(compensationParsed?.chunks?.length),
    hasSchedulerIndex: Boolean(schedulerParsed?.chunks?.length),
    pwaIndexPath,
    compensationIndexPath,
    schedulerIndexPath,
  };
}
