import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const projectRoot = "/Users/StarJ/Desktop/Senority+";
const compensationPdfPath = path.join(
  projectRoot,
  "Delta data",
  "Compensation reference manual",
  "Compensation Reference Handbook Jan 2026.pdf"
);
const payScalesPath = path.join(projectRoot, "src", "data", "payScales.ts");
const outputDir = path.join(projectRoot, "Delta data", "parsed", "contracts");
const outputPath = path.join(outputDir, "compensationManualIndex.json");

function pdfToText(filePath) {
  return execFileSync("pdftotext", ["-layout", filePath, "-"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 100,
  });
}

function normalizeWhitespace(value) {
  return value
    .replace(/\f/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isBoilerplateLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }
  if (/^Version\s+\d+/i.test(trimmed)) return true;
  if (/^Delta Pilots' Compensation Reference Handbook/i.test(trimmed)) return true;
  if (/^TABLE OF CONTENTS$/i.test(trimmed)) return false;
  if (/^delta$/i.test(trimmed)) return true;
  if (/^compensation\s+reference\s+handbook$/i.test(trimmed)) return true;
  if (/^\d+\s*$/.test(trimmed)) return true;
  return false;
}

function normalizePageText(value) {
  return normalizeWhitespace(
    value
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => !isBoilerplateLine(line))
      .join("\n")
  );
}

function extractCrossRefs(text) {
  return Array.from(
    new Set((text.match(/Section\s+\d{1,2}(?:\s+[A-Z](?:\.\d+)?)?/g) ?? []).map((item) => item.trim()))
  );
}

function inferTags(section, title, text) {
  const searchable = `${section} ${title ?? ""} ${text}`.toLowerCase();
  const tags = new Set(["compensation"]);

  if (searchable.includes("pay")) tags.add("pay");
  if (searchable.includes("credit")) tags.add("credit");
  if (searchable.includes("guarantee")) tags.add("guarantee");
  if (searchable.includes("reserve")) tags.add("reserve");
  if (searchable.includes("line")) tags.add("lineholder");
  if (searchable.includes("alv")) tags.add("alv");
  if (searchable.includes("adg")) tags.add("adg");
  if (searchable.includes("example")) tags.add("example");
  if (searchable.includes("reroute")) tags.add("reroute");
  if (searchable.includes("deadhead")) tags.add("deadhead");
  if (searchable.includes("sick")) tags.add("sick");
  if (searchable.includes("vacation")) tags.add("vacation");
  if (searchable.includes("bank")) tags.add("bank");
  if (searchable.includes("replenish")) tags.add("replenishment");
  if (searchable.includes("hourly")) tags.add("hourly_rate");
  if (searchable.includes("captain")) tags.add("captain");
  if (searchable.includes("first officer")) tags.add("first_officer");
  if (searchable.includes("pay table")) tags.add("pay_table");

  return Array.from(tags);
}

function inferSectionAndTitle(pageText, previousSection, previousTitle) {
  const lines = pageText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const headingWithSection = lines.find((line) =>
    /\((\d{1,2}\s+[A-Z](?:\.\s*\d+)?\.?)\)$/.test(line)
  );
  if (headingWithSection) {
    const title = headingWithSection.replace(/\s*\([^)]+\)\s*$/, "").trim();
    const refMatch = headingWithSection.match(/\((\d{1,2}\s+[A-Z](?:\.\s*\d+)?\.?)\)$/);
    const normalizedRef = refMatch ? refMatch[1].replace(/\s*\.\s*/g, ".").replace(/\.$/, "") : null;
    return {
      section: normalizedRef ? `Section ${normalizedRef}` : previousSection,
      title,
    };
  }

  const uppercaseHeading = lines.find(
    (line) =>
      line.length >= 4 &&
      line.length <= 80 &&
      line === line.toUpperCase() &&
      /[A-Z]/.test(line) &&
      !/^TABLE OF CONTENTS$/i.test(line)
  );

  if (uppercaseHeading) {
    return {
      section: uppercaseHeading,
      title: uppercaseHeading,
    };
  }

  return {
    section: previousSection || "Compensation Manual",
    title: previousTitle || previousSection || "Compensation Manual",
  };
}

function chunkPageText(section, title, page, text) {
  const paragraphs = normalizePageText(text)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 80)
    .filter((paragraph) => !/^table of contents$/i.test(paragraph));

  const chunks = [];
  let current = "";
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length > 1200 && current.length > 0) {
      chunks.push({
        id: `compensation:${page}:${chunkIndex}`,
        source: "compensation_manual",
        page,
        section,
        title,
        text: current.trim(),
      });
      current = paragraph;
      chunkIndex += 1;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current.trim()) {
    chunks.push({
      id: `compensation:${page}:${chunkIndex}`,
      source: "compensation_manual",
      page,
      section,
      title,
      text: current.trim(),
    });
  }

  return chunks;
}

function parseStructuredPayTables() {
  const sourceText = readFileSync(payScalesPath, "utf8");
  const rows = [];
  let currentSeat = null;

  for (const rawLine of sourceText.split("\n")) {
    const line = rawLine.trim();
    if (line === "Captain: {") {
      currentSeat = "Captain";
      continue;
    }
    if (line === '"First Officer": {') {
      currentSeat = "First Officer";
      continue;
    }
    if (line === "}," || line === "}" || line === "},") {
      continue;
    }
    if (!currentSeat) {
      continue;
    }

    const match = line.match(/^"([^"]+)": \[([^\]]+)\],?$/);
    if (!match) {
      continue;
    }

    const equipmentLabel = match[1];
    const values = match[2]
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((value) => Number.isFinite(value));

    values.forEach((hourlyRate, index) => {
      rows.push({
        equipmentLabel,
        seat: currentSeat,
        longevityYear: index + 1,
        hourlyRate,
      });
    });
  }

  return rows;
}

function buildStructuredPayTableChunks(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.equipmentLabel}::${row.seat}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  }

  return Array.from(grouped.entries()).map(([key, groupedRows], index) => {
    const [equipmentLabel, seat] = key.split("::");
    const sortedRows = groupedRows.sort((left, right) => left.longevityYear - right.longevityYear);
    const text = sortedRows
      .map((row) => `Year ${row.longevityYear}: $${row.hourlyRate.toFixed(2)}/hour`)
      .join("\n");

    return {
      id: `compensation-paytable:${index}`,
      source: "compensation_manual",
      page: 0,
      section: "Section 3 B Pay Tables",
      title: `${equipmentLabel} ${seat} hourly pay table`,
      text,
      crossRefs: ["Section 3 B"],
      tags: ["compensation", "pay", "pay_table", "hourly_rate", seat === "Captain" ? "captain" : "first_officer"],
      nearbyIds: [],
      isDefinition: false,
      isException: false,
      metadata: {
        structuredPayTable: true,
        structuredPayTableSource: "src/data/payScales.ts",
      },
    };
  });
}

function buildCompensationChunks() {
  const rawText = pdfToText(compensationPdfPath);
  const pages = rawText.split("\f");
  const chunks = [];
  let currentSection = "Compensation Manual";
  let currentTitle = "Compensation Manual";

  for (const [index, page] of pages.entries()) {
    const pageNumber = index + 1;
    const pageText = normalizePageText(page);
    if (!pageText) {
      continue;
    }

    const inferred = inferSectionAndTitle(pageText, currentSection, currentTitle);
    currentSection = inferred.section;
    currentTitle = inferred.title;

    const pageChunks = chunkPageText(currentSection, currentTitle, pageNumber, pageText);
    chunks.push(...pageChunks);
  }

  const normalizedChunks = chunks.map((chunk, index, allChunks) => ({
    ...chunk,
    crossRefs: extractCrossRefs(chunk.text),
    tags: inferTags(chunk.section, chunk.title, chunk.text),
    nearbyIds: allChunks
      .filter((candidate) => candidate.section === chunk.section && Math.abs(candidate.page - chunk.page) <= 1)
      .map((candidate) => candidate.id)
      .filter((id) => id !== chunk.id)
      .slice(0, 4),
    isDefinition:
      /definition|terms|concepts/i.test(chunk.title ?? "") || /\bmeans\b/i.test(chunk.text),
    isException:
      /\bexcept\b|\bunless\b|\bconflict\b|\bcarveout\b|\bnote\b/i.test(chunk.text),
  }));

  const structuredPayTableRows = parseStructuredPayTables();
  const structuredPayTableChunks = buildStructuredPayTableChunks(structuredPayTableRows);

  return {
    chunks: [...normalizedChunks, ...structuredPayTableChunks],
    structuredPayTableRows,
    pageCount: pages.length,
  };
}

mkdirSync(outputDir, { recursive: true });
const built = buildCompensationChunks();

writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAtIso: new Date().toISOString(),
      source: {
        type: "pdf_with_structured_pay_tables",
        pdfPath: compensationPdfPath,
        pageCount: built.pageCount,
        structuredPayTableSource: payScalesPath,
        structuredPayTableRowCount: built.structuredPayTableRows.length,
      },
      chunks: built.chunks,
      structuredPayTables: {
        source: payScalesPath,
        rows: built.structuredPayTableRows,
      },
    },
    null,
    2
  ) + "\n"
);

console.log(
  `Built compensation manual index with ${built.chunks.length} chunks and ${built.structuredPayTableRows.length} structured pay rows -> ${outputPath}`
);
