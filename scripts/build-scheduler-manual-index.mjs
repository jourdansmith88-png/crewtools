import path from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createWorker } from "tesseract.js";

const projectRoot = "/Users/StarJ/Desktop/Senority+";
const manualDir = path.join(projectRoot, "Delta data", "Scheduler Reference Handbook");
const outputDir = path.join(projectRoot, "Delta data", "parsed", "contracts");
const outputPath = path.join(outputDir, "schedulerManualIndex.json");
const langPath = path.join(projectRoot, "node_modules", "@tesseract.js-data", "eng", "4.0.0");
const cachePath = path.join(projectRoot, "Delta data", "parsed", "contracts", ".tesseract-cache");
const pdftotextPath = "/usr/local/bin/pdftotext";

// Scheduler Manual indexing is PDF-first.
// The legacy PNG page set remains only as a per-page OCR fallback for weak or image-only PDF pages.
// The downstream chunk/index shape stays identical so retrieval does not need a redesign.

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

  if (/^\d{1,2}:\d{2}\s*(AM|PM)\b/i.test(trimmed)) return true;
  if (/^Page\s+\d+/i.test(trimmed)) return true;
  if (/scheduling reference/i.test(trimmed)) return true;
  if (/source:\s*a220 fleet team/i.test(trimmed)) return true;
  if (/a220 fb/i.test(trimmed)) return true;
  if (/handbook/i.test(trimmed) && /manual/i.test(trimmed)) return true;
  if (/^(x|o|q|v|w|@|=|>|<|%|~|\[|\]|\(|\)|\||\.|\-|\+|\d|\s)+$/i.test(trimmed)) return true;

  const alphaChars = (trimmed.match(/[a-z]/gi) ?? []).length;
  const symbolChars = (trimmed.match(/[^a-z0-9\s]/gi) ?? []).length;
  if (alphaChars <= 3 && symbolChars >= 2) return true;

  return false;
}

function isPdfPrimaryCandidate(filename) {
  return /\.pdf$/i.test(filename);
}

function normalizeOcrText(value) {
  return normalizeWhitespace(
    value
      .split("\n")
      .map((line) =>
        line
          .replace(/[|]/g, "I")
          .replace(/[©®™]/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim()
      )
      .filter((line) => !isBoilerplateLine(line))
      .join("\n")
  );
}

function normalizePdfText(value) {
  return normalizeWhitespace(
    value
      .replace(/\u000c/g, "")
      .split("\n")
      .map((line) => line.replace(/\s{2,}/g, " ").trim())
      .filter((line) => !isBoilerplateLine(line))
      .join("\n")
  );
}

function extractCrossRefs(text) {
  return Array.from(new Set((text.match(/Section\s+\d{1,2}(?:\s+[A-Z](?:\.\d+)?)?/g) ?? []).map((item) => item.trim())));
}

function inferTags(section, title, text) {
  const searchable = `${section} ${title ?? ""} ${text}`.toLowerCase();
  const tags = new Set();

  if (searchable.includes("definition")) tags.add("definition");
  if (searchable.includes("greenslip") || searchable.includes("green slip") || /\bgs\b/.test(searchable)) tags.add("greenslip");
  if (searchable.includes("silver slip") || /\bss\b/.test(searchable)) tags.add("silver-slip");
  if (searchable.includes("premium") && searchable.includes("silver slip")) tags.add("silver-slip-premium");
  if (searchable.includes("quick slip") || /\bqs\b/.test(searchable)) tags.add("quick-slip");
  if (searchable.includes("reserve")) tags.add("reserve");
  if (searchable.includes("lineholder")) tags.add("lineholder");
  if (searchable.includes("x-day")) tags.add("x-day");
  if (searchable.includes("reroute")) tags.add("reroute");
  if (searchable.includes("reassign")) tags.add("reassignment");
  if (searchable.includes("sick")) tags.add("sick");
  if (searchable.includes("leave")) tags.add("leave");
  if (searchable.includes("vacation")) tags.add("vacation");
  if (searchable.includes("premium")) tags.add("premium");
  if (searchable.includes("pay")) tags.add("pay");
  if (searchable.includes("days off")) tags.add("days-off");
  if (searchable.includes("far")) tags.add("far");
  if (searchable.includes("pbs")) tags.add("pbs");
  if (searchable.includes("conflict") || searchable.includes("except") || searchable.includes("unless")) tags.add("exception");
  if (searchable.includes("implementation") || searchable.includes("process") || searchable.includes("how to")) tags.add("implementation");
  if (searchable.includes("contact")) tags.add("contact");

  return Array.from(tags);
}

function inferSectionAndTitle(text, previousSection) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const nonHeaderLines = lines.filter(
    (line) =>
      !isBoilerplateLine(line)
  );

  const joined = nonHeaderLines.join("\n");
  const sectionRef = joined.match(/\bSection\s+(\d{1,2}(?:\.[A-Z0-9]+)*)\b/i);
  const sectionNumber = sectionRef?.[1];

  const headingCandidates = nonHeaderLines
    .filter((line) => line.length >= 4 && line.length <= 120)
    .filter((line) => !/^Page \d+/i.test(line))
    .filter((line) => !/^[•�o]+\s*/.test(line))
    .filter((line) => line.split(/\s+/).length <= 12)
    .slice(0, 12);

  const explicitTitle =
    headingCandidates.find(
      (line) =>
        /\?$/.test(line) &&
        /^[A-Z][A-Za-z0-9/&()'?, -]{3,}$/.test(line) &&
        !/section \d+/i.test(line)
    ) ??
    headingCandidates.find(
      (line) =>
        /^[A-Z][A-Za-z0-9/&()' -]{3,}$/.test(line) &&
        line === line.toUpperCase() &&
        !/section \d+/i.test(line)
    ) ??
    headingCandidates.find(
      (line) =>
        /^[A-Z][A-Za-z0-9/&()'?, -]{3,}$/.test(line) &&
        !/section \d+/i.test(line)
    ) ??
    nonHeaderLines[0] ??
    previousSection;

  const cleanedTitle =
    explicitTitle &&
    !isBoilerplateLine(explicitTitle) &&
    explicitTitle.split(/\s+/).length <= 12 &&
    !/^Section\s+\d+/i.test(explicitTitle)
      ? explicitTitle
      : previousSection || "Scheduler Manual";

  if (sectionNumber) {
    return {
      section: `Section ${sectionNumber}`,
      title: cleanedTitle,
    };
  }

  if (/introduction/i.test(joined)) {
    return {
      section: "Introduction",
      title: "Introduction",
    };
  }

  if (/table of contents/i.test(joined)) {
    return {
      section: "Table of Contents",
      title: "Table of Contents",
    };
  }

  return {
    section: previousSection || cleanedTitle || "Scheduler Manual",
    title: cleanedTitle || previousSection || "Scheduler Manual",
  };
}

function scoreExtractedText(text) {
  const trimmed = text.trim();
  const lines = trimmed.split("\n").filter(Boolean);
  const alphaChars = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const weirdReplacementChars = (trimmed.match(/[�]/g) ?? []).length;
  const enoughText = trimmed.length >= 500;
  const alphaDense = alphaChars >= 250;
  const enoughWords = words >= 100;
  const noisePenalty = weirdReplacementChars > 15 ? 1 : 0;
  const score = (enoughText ? 1 : 0) + (alphaDense ? 1 : 0) + (enoughWords ? 1 : 0) - noisePenalty;

  return {
    score,
    looksUsable: score >= 2 && lines.length >= 8,
  };
}

function chunkPageText(section, title, page, text) {
  const paragraphs = normalizeOcrText(text)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 60);

  const chunks = [];
  let current = "";
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length > 1100 && current.length > 0) {
      chunks.push({
        id: `scheduler:${page}:${chunkIndex}`,
        source: "scheduler_manual",
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

  if (current.trim().length > 0) {
    chunks.push({
      id: `scheduler:${page}:${chunkIndex}`,
      source: "scheduler_manual",
      page,
      section,
      title,
      text: current.trim(),
    });
  }

  return chunks;
}

async function ocrImage(worker, imagePath) {
  const {
    data: { text },
  } = await worker.recognize(imagePath);
  return normalizeOcrText(text);
}

function findSchedulerPdfPath() {
  const pdfs = readdirSync(manualDir)
    .filter(isPdfPrimaryCandidate)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  return pdfs.length > 0 ? path.join(manualDir, pdfs[0]) : null;
}

function extractPdfPageCount(pdfPath) {
  const fullText = execFileSync(pdftotextPath, [pdfPath, "-"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const pageCount = fullText.split("\f").length;
  return pageCount > 0 ? pageCount : 0;
}

function extractPdfTextForPage(pdfPath, pageNumber) {
  const raw = execFileSync(
    pdftotextPath,
    ["-layout", "-f", String(pageNumber), "-l", String(pageNumber), pdfPath, "-"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }
  );

  return normalizePdfText(raw);
}

function buildPngPageMap() {
  const pngs = readdirSync(manualDir)
    .filter((file) => /\.png$/i.test(file))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  // Keep PNG assets as fallback-only while PDF extraction is primary.
  return new Map(
    pngs.map((filename, index) => [index + 1, path.join(manualDir, filename)])
  );
}

async function createOcrWorker() {
  const worker = await createWorker("eng", 1, {
    langPath,
    cachePath,
    gzip: true,
  });

  await worker.setParameters({
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });

  return worker;
}

async function buildSchedulerChunks() {
  const pdfPath = findSchedulerPdfPath();
  const pngPageMap = buildPngPageMap();
  const usedPdf = Boolean(pdfPath && existsSync(pdftotextPath));
  const ocrFallbackPages = [];
  const extractionModeByPage = new Map();
  const chunks = [];
  let currentSection = "Scheduler Manual";
  let worker = null;

  if (!pdfPath || !existsSync(pdftotextPath)) {
    throw new Error("Scheduler manual PDF not found or pdftotext is unavailable.");
  }

  const pageCount = extractPdfPageCount(pdfPath);

  try {
    for (let page = 1; page <= pageCount; page += 1) {
      let text = extractPdfTextForPage(pdfPath, page);
      let extractionMode = "pdf_text";

      if (!scoreExtractedText(text).looksUsable) {
        const imagePath = pngPageMap.get(page);
        if (imagePath) {
          if (!worker) {
            worker = await createOcrWorker();
          }
          text = await ocrImage(worker, imagePath);
          extractionMode = "ocr_fallback";
          ocrFallbackPages.push(page);
        }
      }

      extractionModeByPage.set(page, extractionMode);

      if (!text || text.length < 40) {
        continue;
      }

      const { section, title } = inferSectionAndTitle(text, currentSection);
      currentSection = section;
      const pageChunks = chunkPageText(section, title, page, text).map((chunk) => ({
        ...chunk,
        extractionMode,
      }));
      chunks.push(...pageChunks);

      if (page % 25 === 0 || page === pageCount) {
        console.log(`Indexed ${page}/${pageCount} scheduler manual PDF pages`);
      }
    }
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }

  return {
    chunks: chunks.map((chunk, index, allChunks) => ({
    ...chunk,
    crossRefs: extractCrossRefs(chunk.text),
    tags: inferTags(chunk.section, chunk.title, chunk.text),
    nearbyIds: allChunks
      .filter((candidate) => Math.abs(candidate.page - chunk.page) <= 1 && candidate.source === "scheduler_manual")
      .map((candidate) => candidate.id)
      .filter((id) => id !== chunk.id)
      .slice(0, 6),
    isDefinition:
      /definition/i.test(chunk.section) ||
      /definition/i.test(chunk.title ?? "") ||
      /\bmeans\b/i.test(chunk.text),
    isException: /\bexcept\b|\bunless\b|\bconflict\b/i.test(chunk.text),
  })),
    meta: {
      usedPdf,
      pdfPath,
      pageCount,
      ocrFallbackPages,
      extractionModeByPage: Object.fromEntries(extractionModeByPage),
    },
  };
}

mkdirSync(outputDir, { recursive: true });
const result = await buildSchedulerChunks();

writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAtIso: new Date().toISOString(),
      source: {
        type: "pdf_primary_with_ocr_fallback",
        pdfPath: result.meta.pdfPath,
        pageCount: result.meta.pageCount,
        ocrFallbackPages: result.meta.ocrFallbackPages,
      },
      chunks: result.chunks,
    },
    null,
    2
  ) + "\n"
);

console.log(`Built Scheduler Manual contract index with ${result.chunks.length} chunks -> ${outputPath}`);
console.log(`Scheduler Manual source: PDF primary (${result.meta.pdfPath})`);
if (result.meta.ocrFallbackPages.length > 0) {
  console.log(`PNG OCR fallback used on pages: ${result.meta.ocrFallbackPages.join(", ")}`);
} else {
  console.log("PNG OCR fallback used on pages: none");
}
