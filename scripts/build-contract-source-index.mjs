import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const projectRoot = "/Users/StarJ/Desktop/Senority+";
const pwaPdfPath = path.join(projectRoot, "Delta data", "PWA", "Pilot Working Agreement.pdf");
const outputDir = path.join(projectRoot, "Delta data", "parsed", "contracts");
const outputPath = path.join(outputDir, "pwaDocumentIndex.json");

function pdfToText(filePath) {
  return execFileSync("pdftotext", ["-layout", filePath, "-"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 100,
  });
}

function normalizeWhitespace(value) {
  return value
    .replace(/\f/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\d{1,2}\s{2,}/, "").trimEnd())
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSection(pageText, fallbackSection) {
  const headerMatch = pageText.match(/Section\s+(\d{1,2})\s*[–-]\s*([^\n]+)/i);
  if (headerMatch) {
    return `${headerMatch[1]}. ${headerMatch[2].trim()}`;
  }
  const sectionMatch = pageText.match(/\bSECTION\s+(\d{1,2})\b/i);
  if (!sectionMatch) {
    return fallbackSection;
  }
  const sectionNumber = sectionMatch[1];
  const lines = pageText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const sectionLineIndex = lines.findIndex((line) => new RegExp(`^SECTION\\s+${sectionNumber}$`, "i").test(line));
  const titleLine = sectionLineIndex >= 0 ? lines[sectionLineIndex + 1] : undefined;
  const normalizedTitle = titleLine && titleLine.toUpperCase() === titleLine ? titleLine : fallbackSection.split(". ").slice(1).join(". ");
  return `${sectionNumber}. ${normalizedTitle || fallbackSection}`;
}

function extractCrossRefs(text) {
  return Array.from(new Set((text.match(/Section\s+\d{1,2}(?:\s+[A-Z](?:\.\d+)?)?/g) ?? []).map((item) => item.trim())));
}

function addSectionAnchorVariants(anchors, sectionNumber, subsectionLetter, subsectionNumber) {
  if (!sectionNumber) {
    return;
  }

  const trimmedSection = String(sectionNumber).trim();
  const trimmedLetter = subsectionLetter ? String(subsectionLetter).trim().toUpperCase() : "";
  const trimmedSubsectionNumber = subsectionNumber ? String(subsectionNumber).trim() : "";

  if (!trimmedLetter) {
    anchors.add(`Section ${trimmedSection}`);
    anchors.add(trimmedSection);
    return;
  }

  if (trimmedSubsectionNumber) {
    anchors.add(`Section ${trimmedSection} ${trimmedLetter}.${trimmedSubsectionNumber}`);
    anchors.add(`${trimmedSection} ${trimmedLetter}.${trimmedSubsectionNumber}`);
  }

  anchors.add(`Section ${trimmedSection} ${trimmedLetter}`);
  anchors.add(`${trimmedSection} ${trimmedLetter}`);
}

function extractSectionAnchors(text, sectionTitle) {
  const anchors = new Set();
  const topLevelMatch = sectionTitle.match(/^(\d{1,2})\./);
  if (topLevelMatch) {
    addSectionAnchorVariants(anchors, topLevelMatch[1]);
  }

  const directMatches = Array.from(
    text.matchAll(/Section\s+(\d{1,2})(?:\s*\(([A-Z])\)|\s+([A-Z]))?(?:\s*\.\s*(\d+))?/gi)
  );
  for (const match of directMatches) {
    addSectionAnchorVariants(anchors, match[1], match[2] ?? match[3], match[4]);
  }

  if (topLevelMatch) {
    const topLevelSection = topLevelMatch[1];
    const lines = text.split("\n");
    let currentLetter = "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const glossaryMatch = line.match(/^(\d{1,3})\.\s+"[^"]+"/);
      if (glossaryMatch && topLevelSection === "2") {
        addSectionAnchorVariants(anchors, topLevelSection, "A", glossaryMatch[1]);
      }

      const letterHeadingMatch = line.match(/^([A-Z])\.\s+/);
      if (letterHeadingMatch) {
        currentLetter = letterHeadingMatch[1].toUpperCase();
        addSectionAnchorVariants(anchors, topLevelSection, currentLetter);
      }

      const numberedSubsectionMatch = line.match(/^(\d{1,3})\.\s+/);
      if (numberedSubsectionMatch && currentLetter) {
        addSectionAnchorVariants(anchors, topLevelSection, currentLetter, numberedSubsectionMatch[1]);
      }
    }
  }

  return Array.from(anchors);
}

function inferTags(section, text) {
  const searchable = `${section} ${text}`.toLowerCase();
  const tags = new Set();

  if (searchable.includes("definition")) tags.add("definition");
  if (searchable.includes("green slip") || searchable.includes("greenslip")) tags.add("greenslip");
  if (searchable.includes("silver slip") || /\bss\b/.test(searchable)) tags.add("silver-slip");
  if (searchable.includes("premium") && searchable.includes("silver slip")) tags.add("silver-slip-premium");
  if (searchable.includes("reserve")) tags.add("reserve");
  if (searchable.includes("lineholder")) tags.add("lineholder");
  if (searchable.includes("x-day")) tags.add("x-day");
  if (searchable.includes("reroute")) tags.add("reroute");
  if (searchable.includes("reassignment")) tags.add("reassignment");
  if (searchable.includes("sick")) tags.add("sick");
  if (searchable.includes("leave")) tags.add("leave");
  if (searchable.includes("vacation")) tags.add("vacation");
  if (searchable.includes("conflict") || searchable.includes("exception")) tags.add("exception");
  if (searchable.includes("section 23")) tags.add("section 23");

  return Array.from(tags);
}

function chunkParagraphs(section, pageNumber, pageText) {
  const paragraphs = normalizeWhitespace(pageText)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 80)
    .filter((paragraph) => !/^Table of Contents$/i.test(paragraph));

  const chunks = [];
  let current = "";
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length > 1200 && current.length > 0) {
      chunks.push({
        id: `pwa:${pageNumber}:${chunkIndex}`,
        source: "pwa",
        page: pageNumber,
        section,
        title: section,
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
      id: `pwa:${pageNumber}:${chunkIndex}`,
      source: "pwa",
      page: pageNumber,
      section,
      title: section,
      text: current.trim(),
    });
  }

  return chunks;
}

function buildPwaChunks() {
  const rawText = pdfToText(pwaPdfPath);
  const pages = rawText.split("\f");
  const chunks = [];
  let currentSection = "Front matter";

  for (const [index, page] of pages.entries()) {
    const pageNumber = index + 1;
    const pageText = normalizeWhitespace(page);
    if (!pageText) {
      continue;
    }
    if (/^Table of Contents$/im.test(pageText) || pageText.includes("Date of Signing:")) {
      continue;
    }
    currentSection = extractSection(pageText, currentSection);
    const pageChunks = chunkParagraphs(currentSection, pageNumber, pageText);
    chunks.push(...pageChunks);
  }

  return chunks.map((chunk, index, allChunks) => ({
    ...chunk,
    crossRefs: extractCrossRefs(chunk.text),
    sectionAnchors: extractSectionAnchors(chunk.text, chunk.section),
    tags: inferTags(chunk.section, chunk.text),
    nearbyIds: allChunks
      .filter((candidate) => candidate.section === chunk.section && Math.abs(candidate.page - chunk.page) <= 1)
      .map((candidate) => candidate.id)
      .filter((id) => id !== chunk.id)
      .slice(0, 4),
    isDefinition: /^2\./.test(chunk.section) || chunk.text.toLowerCase().includes(" means "),
    isException:
      chunk.text.toLowerCase().includes("except") ||
      chunk.text.toLowerCase().includes("conflict") ||
      chunk.text.toLowerCase().includes("unless"),
  }));
}

mkdirSync(outputDir, { recursive: true });
const chunks = buildPwaChunks();

writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAtIso: new Date().toISOString(),
      chunks,
    },
    null,
    2
  ) + "\n"
);

console.log(`Built PWA contract index with ${chunks.length} chunks -> ${outputPath}`);
