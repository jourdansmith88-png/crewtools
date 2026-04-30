import type {
  ParseMiCrewScreenshotsOutput,
  ParsedScreenshotRotation,
  UploadedImage,
  UploadedEvidenceSummary,
} from "./types.ts";

type ScreenshotParserLeg = {
  day?: string | null;
  flightNumber?: string | null;
  carrier?: string | null;
  type: "flight" | "deadhead" | "unknown";
  origin?: string | null;
  destination?: string | null;
  depTime?: string | null;
  arrTime?: string | null;
  blockMinutes?: number | null;
  turnMinutes?: number | null;
  isDeadhead?: boolean;
  legKind?: "operating" | "deadhead";
  confirmationCode?: string | null;
  sourceText?: string | null;
  sourceImageIndex?: number;
};

type ScreenshotParserOutput = ParsedScreenshotRotation & {
  parseConfidence: "high" | "medium" | "low";
  missingParseItems: string[];
};

type StructuredParseResult = {
  rotations: ScreenshotParserOutput[];
  structuredJsonParseError?: string;
  fallbackRegexLegsParsed: number;
  extractionNotes: string[];
};

function optionalString(value: unknown): string | null | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | null | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseClockToMinutes(value: string | undefined | null) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function clipPreview(value: string, maxLength = 1000) {
  return value.trim().slice(0, maxLength);
}

function buildRawTextSystemPrompt() {
  return [
    "You are the CrewTools MiCrew OCR extraction layer.",
    "These are Delta MiCrew rotation screenshots.",
    "Read the visible text exactly as it appears.",
    "Do not summarize.",
    "Do not calculate pay.",
    "Preserve row order.",
    "Pay special attention to header fields, flight rows, deadhead rows, Blk lines, Dep lines, Arr lines, Turn lines, layover lines, and rest lines.",
  ].join(" ");
}

function buildStructuringSystemPrompt() {
  return [
    "You are the CrewTools MiCrew screenshot structuring layer.",
    "You will receive raw visible text already extracted from Delta MiCrew screenshots.",
    "Extract visible flight and deadhead legs first.",
    "Rotation header fields are helpful but optional.",
    "Do not reject a rotation if header fields are missing.",
    "Preserve any visible leg that has at least a route, origin/destination, flight number, or block value.",
    "Return only JSON.",
  ].join(" ");
}

async function callVisionForRawText(
  images: UploadedImage[],
  sourceType: "original" | "rerouted",
  model: string,
  apiKey: string,
): Promise<{ rawVisibleText: string; rawVisionResponsePreview: string }> {
  console.log("[rp-parser] model called:", {
    called: true,
    sourceType,
    model,
    imageCount: images.length,
    imageNames: images.map((image) => image.name),
  });
  const startedAt = Date.now();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: buildRawTextSystemPrompt(),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Source type: ${sourceType}`,
                `Image count: ${images.length}`,
                "Read these Delta MiCrew screenshots and return the visible text exactly as plain text.",
                "Separate each screenshot with headings like [IMAGE 0], [IMAGE 1], etc.",
                "Include every visible line that looks like a leg row, route, dep, arr, blk, turn, credit, report, release, layover, or rest line.",
                "Do not summarize.",
              ].join("\n"),
            },
            ...images.map((image) => ({
              type: "image_url" as const,
              image_url: { url: image.dataUrl },
            })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision raw-text extraction failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string; type?: string }> } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  const rawVisibleText =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((item) => (typeof item?.text === "string" ? item.text : "")).join("")
        : "";
  console.log("[rp-parser-time] raw text extraction ms:", Date.now() - startedAt);
  return {
    rawVisibleText: rawVisibleText.trim(),
    rawVisionResponsePreview: clipPreview(rawVisibleText),
  };
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    return fenced.trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function normalizeLeg(candidate: unknown, sourceImageIndexDefault: number): ScreenshotParserLeg | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const leg = candidate as Record<string, unknown>;
  const normalized: ScreenshotParserLeg = {
    day: optionalString(leg.day),
    type: leg.type === "flight" || leg.type === "deadhead" || leg.type === "unknown" ? leg.type : "unknown",
    flightNumber: optionalString(leg.flightNumber),
    carrier: optionalString(leg.carrier),
    origin: optionalString(leg.origin),
    destination: optionalString(leg.destination),
    depTime: optionalString(leg.depTime),
    arrTime: optionalString(leg.arrTime),
    blockMinutes: optionalNumber(leg.blockMinutes),
    turnMinutes: optionalNumber(leg.turnMinutes),
    isDeadhead: typeof leg.isDeadhead === "boolean" ? leg.isDeadhead : undefined,
    legKind: leg.legKind === "deadhead" || leg.legKind === "operating" ? leg.legKind : undefined,
    confirmationCode: optionalString(leg.confirmationCode),
    sourceText: optionalString(leg.sourceText),
    sourceImageIndex:
      typeof leg.sourceImageIndex === "number" && Number.isFinite(leg.sourceImageIndex)
        ? leg.sourceImageIndex
        : sourceImageIndexDefault,
  };
  const hasLegIdentity =
    Boolean(normalized.flightNumber) ||
    Boolean(normalized.blockMinutes != null) ||
    Boolean(normalized.origin && normalized.destination) ||
    Boolean(normalized.origin) ||
    Boolean(normalized.destination);
  if (!hasLegIdentity) {
    return null;
  }
  return normalized;
}

function normalizeRotationCandidate(
  candidate: unknown,
  sourceType: "original" | "rerouted",
  sourceImageIndexDefault: number,
): ScreenshotParserOutput | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const rotation = candidate as Record<string, unknown>;
  const legs = Array.isArray(rotation.legs)
    ? rotation.legs
        .map((leg) => normalizeLeg(leg, sourceImageIndexDefault))
        .filter((leg): leg is ScreenshotParserLeg => Boolean(leg))
    : [];
  const layovers = Array.isArray(rotation.layovers)
    ? rotation.layovers.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  return {
    sourceType,
    rotationNumber: optionalString(rotation.rotationNumber),
    dateRange: optionalString(rotation.dateRange),
    base: optionalString(rotation.base),
    creditMinutes: optionalNumber(rotation.creditMinutes),
    blockMinutes: optionalNumber(rotation.blockMinutes),
    tafbMinutes: optionalNumber(rotation.tafbMinutes),
    reportTime: optionalString(rotation.reportTime),
    releaseTime: optionalString(rotation.releaseTime),
    layovers,
    legs,
    parseConfidence:
      rotation.parseConfidence === "high" || rotation.parseConfidence === "medium" || rotation.parseConfidence === "low"
        ? rotation.parseConfidence
        : legs.length >= 4
          ? "high"
          : legs.length >= 2
            ? "medium"
            : "low",
    missingParseItems: Array.isArray(rotation.missingParseItems)
      ? rotation.missingParseItems.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function dedupeLegs(legs: ScreenshotParserLeg[]) {
  const seen = new Set<string>();
  const deduped: ScreenshotParserLeg[] = [];
  for (const leg of legs) {
    const key = [
      leg.day ?? "",
      leg.flightNumber ?? "",
      leg.origin ?? "",
      leg.destination ?? "",
      leg.depTime ?? "",
      leg.arrTime ?? "",
      leg.blockMinutes ?? "",
      leg.turnMinutes ?? "",
      leg.type,
      leg.sourceImageIndex ?? "",
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(leg);
  }
  return deduped;
}

function mergeRotations(sourceType: "original" | "rerouted", rotations: ScreenshotParserOutput[]): ParsedScreenshotRotation {
  return {
    sourceType,
    rotationNumber: rotations.find((item) => item.rotationNumber)?.rotationNumber,
    dateRange: rotations.find((item) => item.dateRange)?.dateRange,
    base: rotations.find((item) => item.base)?.base,
    creditMinutes: rotations.find((item) => item.creditMinutes != null)?.creditMinutes,
    blockMinutes: rotations.find((item) => item.blockMinutes != null)?.blockMinutes,
    tafbMinutes: rotations.find((item) => item.tafbMinutes != null)?.tafbMinutes,
    reportTime: rotations.find((item) => item.reportTime)?.reportTime,
    releaseTime: rotations.find((item) => item.releaseTime)?.releaseTime,
    layovers: Array.from(new Set(rotations.flatMap((item) => item.layovers ?? []))),
    parseConfidence:
      rotations.some((item) => item.parseConfidence === "high")
        ? "high"
        : rotations.some((item) => item.parseConfidence === "medium")
          ? "medium"
          : "low",
    missingParseItems: Array.from(new Set(rotations.flatMap((item) => item.missingParseItems ?? []))),
    legs: dedupeLegs(rotations.flatMap((rotation) => rotation.legs ?? [])),
  };
}

function buildRawTextPreview(imageName: string, rawVisibleText: string) {
  return `${imageName}: ${clipPreview(rawVisibleText)}`;
}

function rawTextSuggestsLegs(rawVisibleText: string) {
  return /\b[A-Z]{3}-[A-Z]{3}\b|\bD?\s*(?:DL)?\d{2,4}\b|\bBlk[-:\s]+\d{1,2}:\d{2}\b/i.test(rawVisibleText);
}

function splitImageSections(rawVisibleText: string) {
  const matches = Array.from(rawVisibleText.matchAll(/\[IMAGE\s+(\d+)\]/gi));
  if (matches.length === 0) {
    return [{ imageIndex: 0, text: rawVisibleText }];
  }
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? rawVisibleText.length) : rawVisibleText.length;
    return {
      imageIndex: Number(match[1] ?? 0),
      text: rawVisibleText.slice(start, end).trim(),
    };
  });
}

function parseRegexLegsFromRawText(
  rawVisibleText: string,
  sourceType: "original" | "rerouted",
): { rotation: ScreenshotParserOutput; fallbackRegexLegsParsed: number } {
  const sections = splitImageSections(rawVisibleText);
  const legs: ScreenshotParserLeg[] = [];
  const layovers = new Set<string>();
  const missingParseItems: string[] = [];

  for (const section of sections) {
    const lines = section.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      const layoverMatch = line.match(/LAYOVER:\s*([A-Z]{3})/i);
      if (layoverMatch?.[1]) {
        layovers.add(layoverMatch[1].toUpperCase());
      }

      const routeMatch = line.match(/(?:^|\b)(D\s+|D\/H\s+)?(?:(DL|OO|9E|YX|EV|MQ|G7|PT|WN|AA|UA|AS)\s*)?(\d{2,4})\s*[: ]\s*([A-Z]{3})-([A-Z]{3})/i);
      if (!routeMatch) {
        continue;
      }

      const deadheadIndicator =
        Boolean(routeMatch[1]) ||
        /\bdeadhead\b|\bd\/h\b|\bdh\b|\bpos\b|\bpositive space\b/i.test(line);
      const carrier = routeMatch[2]?.toUpperCase() ?? "DL";
      const flightNumber = routeMatch[3] ? `${carrier}${routeMatch[3]}` : undefined;
      const origin = routeMatch[4]?.toUpperCase();
      const destination = routeMatch[5]?.toUpperCase();
      let depTime: string | undefined;
      let arrTime: string | undefined;
      let blockMinutes: number | undefined;
      let turnMinutes: number | undefined;
      let day: string | undefined;
      let confirmationCode: string | undefined;
      let sourceText = line;

      for (let lookahead = index; lookahead < Math.min(lines.length, index + 6); lookahead += 1) {
        const lookaheadLine = lines[lookahead]!;
        if (lookahead > index && /(?:^|\b)(D\s+|D\/H\s+)?(?:(?:DL|OO|9E|YX|EV|MQ|G7|PT|WN|AA|UA|AS)\s*)?\d{2,4}\s*[: ]\s*[A-Z]{3}-[A-Z]{3}/i.test(lookaheadLine)) {
          break;
        }
        const depMatch = lookaheadLine.match(/Dep-\s*(\d{3,4})(?:\s+\d{1,2}[A-Z]{3})?/i);
        const arrMatch = lookaheadLine.match(/Arr-\s*(\d{3,4})(?:\s+\d{1,2}[A-Z]{3})?/i);
        const blockMatch = lookaheadLine.match(/Blk-\s*(\d{1,2}):(\d{2})/i);
        const turnMatch = lookaheadLine.match(/Turn-\s*(\d{1,2}):(\d{2})/i);
        const dayMatch = lookaheadLine.match(/\b(\d{1,2}[A-Z]{3})\b/i);
        const confirmationMatch =
          lookaheadLine.match(/(?:Confirmation\s*#|confirmation\s*code[:\s#]*|record locator[:\s#]*|PNR[:\s#]*)([A-Z0-9]{5,8})/i)?.[1];
        if (depMatch?.[1]) {
          depTime = depMatch[1];
        }
        if (arrMatch?.[1]) {
          arrTime = arrMatch[1];
        }
        if (blockMatch?.[0]) {
          blockMinutes = parseClockToMinutes(`${blockMatch[1]}:${blockMatch[2]}`);
        }
        if (turnMatch?.[0]) {
          turnMinutes = parseClockToMinutes(`${turnMatch[1]}:${turnMatch[2]}`);
        }
        if (dayMatch?.[1]) {
          day = dayMatch[1].toUpperCase();
        }
        if (confirmationMatch) {
          confirmationCode = confirmationMatch.toUpperCase();
        }
        if (lookahead > index) {
          sourceText += ` | ${lookaheadLine}`;
        }
      }

      legs.push({
        day,
        type: deadheadIndicator ? "deadhead" : "flight",
        flightNumber,
        carrier,
        origin,
        destination,
        depTime,
        arrTime,
        blockMinutes,
        turnMinutes,
        isDeadhead: deadheadIndicator,
        legKind: deadheadIndicator ? "deadhead" : "operating",
        confirmationCode,
        sourceText,
        sourceImageIndex: section.imageIndex,
      });
    }
  }

  if (legs.length === 0) {
    missingParseItems.push("Fallback regex parsing could not find leg rows.");
  }

  return {
    rotation: {
      sourceType,
      rotationNumber: undefined,
      dateRange: undefined,
      base: undefined,
      creditMinutes: undefined,
      blockMinutes: undefined,
      tafbMinutes: undefined,
      reportTime: undefined,
      releaseTime: undefined,
      layovers: Array.from(layovers),
      parseConfidence: legs.length >= 4 ? "medium" : legs.length > 0 ? "low" : "low",
      missingParseItems,
      legs: dedupeLegs(legs),
    },
    fallbackRegexLegsParsed: legs.length,
  };
}

async function structureRawText(
  imageLabel: string,
  sourceType: "original" | "rerouted",
  rawVisibleText: string,
  model: string,
  apiKey: string,
): Promise<StructuredParseResult> {
  const startedAt = Date.now();
  let rawResponseText = "";
  let structuredJsonParseError: string | undefined;
  let extractionNotes: string[] = [];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: buildStructuringSystemPrompt(),
          },
          {
            role: "user",
            content: [
              `Source type: ${sourceType}`,
              `Image label: ${imageLabel}`,
              "Extract rows like:",
              "- D DL833 : SLC-BUR",
              "- DL828 : BUR-SLC",
              "- Dep- 1503 26MAR",
              "- Arr- 1554 26MAR",
              "- Blk- 1:48",
              "- Turn- 0:42",
              "- LAYOVER: DTW",
              "- Rest- 14:40",
              "Return strict JSON in this shape:",
              '{"rotations":[{"sourceType":"original|rerouted","rotationNumber":null,"dateRange":null,"base":null,"creditMinutes":null,"blockMinutes":null,"tafbMinutes":null,"reportTime":null,"releaseTime":null,"layovers":[],"legs":[{"day":null,"type":"flight|deadhead|unknown","flightNumber":null,"carrier":null,"origin":null,"destination":null,"depTime":null,"arrTime":null,"blockMinutes":null,"turnMinutes":null,"isDeadhead":false,"legKind":"operating|deadhead","confirmationCode":null,"sourceText":null,"sourceImageIndex":0}],"parseConfidence":"low|medium|high","missingParseItems":[]}]}',
              "If visible, preserve DH/DEADHEAD/POS indicators and any confirmation code / record locator / PNR per leg.",
              "Header fields may be null or omitted.",
              "Legs are the priority.",
              "Raw visible text follows:",
              rawVisibleText,
            ].join("\n"),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Structured screenshot parse failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string; type?: string }> } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    rawResponseText =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((item) => (typeof item?.text === "string" ? item.text : "")).join("")
          : "";
  } catch (error) {
    structuredJsonParseError = error instanceof Error ? error.message : String(error);
  }

  let parsedRotations: ScreenshotParserOutput[] = [];
  if (!structuredJsonParseError && rawResponseText.trim()) {
    try {
      const extractedJson = extractJsonObject(rawResponseText);
      const parsed = JSON.parse(extractedJson) as { rotations?: unknown[] };
      parsedRotations = Array.isArray(parsed.rotations)
        ? parsed.rotations
            .map((rotation) => normalizeRotationCandidate(rotation, sourceType, 0))
            .filter((rotation): rotation is ScreenshotParserOutput => Boolean(rotation))
        : [];
    } catch (error) {
      structuredJsonParseError = error instanceof Error ? error.message : String(error);
    }
  }

  let fallbackRegexLegsParsed = 0;
  if (parsedRotations.every((rotation) => rotation.legs.length === 0) && rawTextSuggestsLegs(rawVisibleText)) {
    const fallback = parseRegexLegsFromRawText(rawVisibleText, sourceType);
    fallbackRegexLegsParsed = fallback.fallbackRegexLegsParsed;
    extractionNotes.push(`Fallback regex legs parsed: ${fallbackRegexLegsParsed}`);
    if (parsedRotations.length === 0) {
      parsedRotations = [fallback.rotation];
    } else {
      parsedRotations = parsedRotations.map((rotation, index) =>
        index === 0
          ? {
              ...rotation,
              layovers: Array.from(new Set([...(rotation.layovers ?? []), ...(fallback.rotation.layovers ?? [])])),
              legs: dedupeLegs([...(rotation.legs ?? []), ...(fallback.rotation.legs ?? [])]),
              missingParseItems: Array.from(
                new Set([...(rotation.missingParseItems ?? []), ...(fallback.rotation.missingParseItems ?? [])]),
              ),
            }
          : rotation,
      );
    }
  }

  if (parsedRotations.every((rotation) => rotation.legs.length === 0) && rawTextSuggestsLegs(rawVisibleText)) {
    extractionNotes.push("Raw text was extracted, but structured leg parsing failed.");
  }

  console.log("[rp-parser-time] structure extraction ms:", Date.now() - startedAt);
  return {
    rotations: parsedRotations,
    structuredJsonParseError: structuredJsonParseError || undefined,
    fallbackRegexLegsParsed,
    extractionNotes,
  };
}

export async function parseMiCrewScreenshots(args: {
  originalImages: UploadedImage[];
  changedImages: UploadedImage[];
  uploadedEvidenceSummary: UploadedEvidenceSummary;
}): Promise<ParseMiCrewScreenshotsOutput> {
  console.log("[rp-parser] received images", {
    originalImagesLength: args.originalImages.length,
    changedImagesLength: args.changedImages.length,
    originalImages: args.originalImages.map((image) => ({ name: image.name, dataUrlLength: image.dataUrl.length })),
    changedImages: args.changedImages.map((image) => ({ name: image.name, dataUrlLength: image.dataUrl.length })),
  });

  const anyScreenshots = args.originalImages.length > 0 || args.changedImages.length > 0;
  const defaultModel = process.env.OPENAI_VISION_MODEL ?? "gpt-4.1";
  if (!anyScreenshots) {
    console.log("[rp-parser] model called:", { called: false });
    return {
      screenshotParsingActive: false,
      uploadedEvidenceSummary: args.uploadedEvidenceSummary,
      missingFacts: [],
      rotations: [],
      parseConfidence: "low",
      missingParseItems: [],
      extractionNotes: [],
      rawExtractedText: [],
      rawVisionResponsePreview: [],
      rawTextPreview: [],
      structuredJsonParseError: undefined,
      visionModelCalled: false,
      modelSelected: defaultModel,
      fallbackRegexLegsParsed: 0,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      screenshotParsingActive: true,
      uploadedEvidenceSummary: args.uploadedEvidenceSummary,
      missingFacts: ["I received the screenshots, but screenshot parsing is unavailable because the OpenAI API key is missing."],
      rotations: [],
      parseConfidence: "low",
      missingParseItems: ["OPENAI_API_KEY missing"],
      extractionNotes: ["Vision parsing could not start."],
      rawExtractedText: [],
      rawVisionResponsePreview: [],
      rawTextPreview: [],
      structuredJsonParseError: undefined,
      visionModelCalled: false,
      modelSelected: defaultModel,
      fallbackRegexLegsParsed: 0,
    };
  }

  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4.1";
  try {
    const totalStartedAt = Date.now();
    const originalRaw = args.originalImages.length
      ? await callVisionForRawText(args.originalImages, "original", model, apiKey)
      : { rawVisibleText: "", rawVisionResponsePreview: "" };
    const changedRaw = args.changedImages.length
      ? await callVisionForRawText(args.changedImages, "rerouted", model, apiKey)
      : { rawVisibleText: "", rawVisionResponsePreview: "" };

    console.log("[rp-parser] raw text extracted", {
      originalChars: originalRaw.rawVisibleText.length,
      changedChars: changedRaw.rawVisibleText.length,
      originalPreview: clipPreview(originalRaw.rawVisibleText, 250),
      changedPreview: clipPreview(changedRaw.rawVisibleText, 250),
    });

    const originalStructured = args.originalImages.length
      ? await structureRawText("original-batch", "original", originalRaw.rawVisibleText, model, apiKey)
      : { rotations: [], extractionNotes: [], fallbackRegexLegsParsed: 0 };
    const changedStructured = args.changedImages.length
      ? await structureRawText("rerouted-batch", "rerouted", changedRaw.rawVisibleText, model, apiKey)
      : { rotations: [], extractionNotes: [], fallbackRegexLegsParsed: 0 };

    const rotations: ParsedScreenshotRotation[] = [];
    if (originalStructured.rotations.length > 0) {
      rotations.push(mergeRotations("original", originalStructured.rotations));
    }
    if (changedStructured.rotations.length > 0) {
      rotations.push(mergeRotations("rerouted", changedStructured.rotations));
    }

    const missingParseItems = Array.from(
      new Set([
        ...originalStructured.rotations.flatMap((rotation) => rotation.missingParseItems ?? []),
        ...changedStructured.rotations.flatMap((rotation) => rotation.missingParseItems ?? []),
      ]),
    );
    const rawRotationCount = rotations.length;
    const rawLegCount = rotations.reduce((sum, rotation) => sum + (rotation.legs?.length ?? 0), 0);
    const fallbackRegexLegsParsed =
      (originalStructured.fallbackRegexLegsParsed ?? 0) + (changedStructured.fallbackRegexLegsParsed ?? 0);

    console.log("[rp-parser] rotations parsed count:", rawRotationCount);
    console.log("[rp-parser] legs parsed count:", rawLegCount);
    console.log("[rp-parser] missing parse items:", missingParseItems);
    console.log("[rp-parser-time] total ms:", Date.now() - totalStartedAt);

    const rawTextPreview = [
      ...(originalRaw.rawVisibleText ? [buildRawTextPreview("original-batch", originalRaw.rawVisibleText)] : []),
      ...(changedRaw.rawVisibleText ? [buildRawTextPreview("rerouted-batch", changedRaw.rawVisibleText)] : []),
    ];
    const rawExtractedText = [
      ...(originalRaw.rawVisibleText ? [originalRaw.rawVisibleText] : []),
      ...(changedRaw.rawVisibleText ? [changedRaw.rawVisibleText] : []),
    ];
    const rawVisionResponsePreview = [
      ...(originalRaw.rawVisionResponsePreview ? [originalRaw.rawVisionResponsePreview] : []),
      ...(changedRaw.rawVisionResponsePreview ? [changedRaw.rawVisionResponsePreview] : []),
    ];

    const extractionNotes = [
      `Original screenshots read: ${args.originalImages.length}`,
      `Changed screenshots read: ${args.changedImages.length}`,
      `Fallback regex legs parsed: ${fallbackRegexLegsParsed}`,
      ...originalStructured.extractionNotes,
      ...changedStructured.extractionNotes,
      `Final legs detected: ${rawLegCount}`,
    ];

    const structuredJsonParseError = [
      originalStructured.structuredJsonParseError,
      changedStructured.structuredJsonParseError,
    ]
      .filter((item): item is string => Boolean(item))
      .join(" | ");

    return {
      screenshotParsingActive: true,
      uploadedEvidenceSummary: args.uploadedEvidenceSummary,
      rotations,
      parseConfidence: rawLegCount >= 4 ? "high" : rawLegCount >= 2 ? "medium" : "low",
      missingParseItems,
      extractionNotes,
      rawExtractedText,
      rawVisionResponsePreview,
      rawTextPreview,
      structuredJsonParseError: structuredJsonParseError || undefined,
      visionModelCalled: true,
      modelSelected: model,
      fallbackRegexLegsParsed,
      missingFacts:
        rawTextPreview.length === 0
          ? ["I received the screenshots and called the vision model, but no readable MiCrew text was extracted. Try full-size screenshots, not thumbnails, with the leg rows and Blk lines visible."]
          : rawLegCount === 0
            ? ["Screenshot text was extracted, but I could not convert it into leg/block rows yet."]
            : [],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown screenshot parsing error";
    console.log("[rp-parser] parse failed", { reason });
    return {
      screenshotParsingActive: true,
      uploadedEvidenceSummary: args.uploadedEvidenceSummary,
      rotations: [],
      parseConfidence: "low",
      missingParseItems: ["Screenshot extraction failed"],
      extractionNotes: [reason],
      rawExtractedText: [],
      rawVisionResponsePreview: [],
      rawTextPreview: [],
      structuredJsonParseError: reason,
      visionModelCalled: true,
      modelSelected: model,
      fallbackRegexLegsParsed: 0,
      missingFacts: ["I received the screenshots, but could not reliably extract MiCrew legs/block values."],
    };
  }
}
