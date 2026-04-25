import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  contractCopilotFeedbackRequestSchema,
  type ContractCopilotApiErrorResponse,
  type ContractCopilotFeedbackDraft,
  type ContractCopilotFeedbackRequest,
  type ContractCopilotFeedbackSuccessResponse,
} from "../../../src/ai/workflows/contractCopilot/api.ts";
import { validateWithSchema } from "../../../src/ai/core/validation.ts";

const projectRoot = "/Users/StarJ/Desktop/Senority+";
const feedbackDraftsPath = path.join(projectRoot, "reports", "contract-copilot-feedback-drafts.json");

function jsonResponse(status: number, body: ContractCopilotFeedbackSuccessResponse | ContractCopilotApiErrorResponse) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s.]/g, " ").replace(/\s+/g, " ").trim();
}

function extractSectionRefs(value: string | undefined) {
  const text = value ?? "";
  const matches =
    text.match(
      /\bsection\s+\d{1,2}(?:\s*[A-Z](?:\.?\d+)?)?(?:\.\d+)?|\b\d{1,2}\s*[A-Z](?:\.?\d+)?\b|§\s*\d{1,2}(?:\s*[A-Z](?:\.?\d+)?)?/gi
    ) ?? [];
  return Array.from(
    new Set(
      matches.map((item) =>
        item
          .replace(/^§\s*/i, "Section ")
          .replace(/\s+/g, " ")
          .replace(/(\d{1,2})([A-Z])/i, "$1 $2")
          .replace(/([A-Z])(\d+)/i, "$1.$2")
          .trim()
      )
    )
  );
}

function inferRiskLevel(feedback: ContractCopilotFeedbackRequest["userFeedback"]) {
  switch (feedback) {
    case "answer_wrong":
    case "missing_source":
      return "high" as const;
    case "support_wrong":
      return "medium" as const;
    case "needs_better_explanation":
      return "medium" as const;
    default:
      return "low" as const;
  }
}

function inferMustInclude(input: ContractCopilotFeedbackRequest) {
  const seeds = [input.correctedAnswer ?? "", input.expectedSource ?? "", input.question]
    .join(" ")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 3)
    .slice(0, 6);
  return Array.from(new Set(seeds));
}

function inferMustNotInclude(input: ContractCopilotFeedbackRequest) {
  const visibleSections = input.supportCards.map((item) => item.section).filter(Boolean);
  if (input.userFeedback === "support_wrong" && visibleSections.length > 0) {
    return visibleSections.slice(0, 3);
  }
  return [];
}

function inferExpectedSupportAnchors(input: ContractCopilotFeedbackRequest): ContractCopilotFeedbackDraft["expectedSupportAnchors"] {
  const expectedSourceText = input.expectedSource ?? "";
  const sourceHints = [expectedSourceText, ...input.supportCards.map((item) => `${item.sourceId} ${item.section}`)].join(" ");
  const sectionRefs = extractSectionRefs(sourceHints);
  const source =
    /scheduler/i.test(sourceHints)
      ? "Scheduler Manual"
      : /compensation/i.test(sourceHints)
        ? "Compensation Manual"
        : "PWA";

  const terms = Array.from(
    new Set(
      normalizeText([input.question, expectedSourceText].join(" "))
        .split(" ")
        .filter((token) => token.length > 3)
        .slice(0, 6)
    )
  );

  return [
    {
      source,
      section: sectionRefs[0],
      terms: terms.length > 0 ? terms : undefined,
      required: input.userFeedback !== "looks_right",
      role: "primary",
    },
  ].filter((item) => item.section || (item.terms?.length ?? 0) > 0);
}

function buildDraft(input: ContractCopilotFeedbackRequest): ContractCopilotFeedbackDraft {
  const selectedLane =
    typeof input.debugPayload?.selectedLane === "string" && input.debugPayload.selectedLane.trim().length > 0
      ? input.debugPayload.selectedLane.trim()
      : "contract_scenario_retrieval";
  return {
    id: `beta-feedback-${Date.now()}`,
    question: input.question,
    expectedLane: selectedLane,
    expectedSupportAnchors: inferExpectedSupportAnchors(input),
    mustInclude: inferMustInclude(input),
    mustNotInclude: inferMustNotInclude(input),
    riskLevel: inferRiskLevel(input.userFeedback),
    category: "beta_reported",
  };
}

async function readExistingDrafts() {
  try {
    const raw = await readFile(feedbackDraftsPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function handleContractCopilotFeedbackRoute(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: "Use POST for Contract Copilot feedback.",
      },
    });
  }

  let parsedRequest: ContractCopilotFeedbackRequest;
  try {
    parsedRequest = validateWithSchema(
      contractCopilotFeedbackRequestSchema,
      await request.json(),
      "contractCopilotFeedbackRequest"
    );
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: {
        code: "invalid_request",
        message: error instanceof Error ? error.message : "Invalid feedback body.",
      },
    });
  }

  const draft = buildDraft(parsedRequest);
  const existingDrafts = await readExistingDrafts();
  const record = {
    submittedAt: new Date().toISOString(),
    question: parsedRequest.question,
    answer: parsedRequest.answer,
    supportCards: parsedRequest.supportCards,
    debugPayload: parsedRequest.debugPayload ?? null,
    userFeedback: parsedRequest.userFeedback,
    correctedAnswer: parsedRequest.correctedAnswer ?? null,
    expectedSource: parsedRequest.expectedSource ?? null,
    draft,
  };

  await mkdir(path.dirname(feedbackDraftsPath), { recursive: true });
  await writeFile(feedbackDraftsPath, JSON.stringify([...existingDrafts, record], null, 2));

  return jsonResponse(200, {
    ok: true,
    draftId: draft.id,
    reportPath: feedbackDraftsPath,
    draft,
  });
}
