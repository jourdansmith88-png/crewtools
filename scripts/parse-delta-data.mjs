import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const projectRoot = "/Users/StarJ/Desktop/Senority+";
const deltaRoot = path.join(projectRoot, "Delta data");
const outputDir = path.join(deltaRoot, "parsed");
const pilotHistoryShardDir = path.join(outputDir, "pilot-history");
const carveoutBases = new Set(["NBC", "INS", "SUP"]);

mkdirSync(outputDir, { recursive: true });
mkdirSync(pilotHistoryShardDir, { recursive: true });

const categoryDir = path.join(deltaRoot, "Category Lists");
const seniorityDir = path.join(deltaRoot, "Seniority lists");
const aeDir = path.join(deltaRoot, "AE");

function listPdfFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .map((name) => path.join(dir, name))
    .sort();
}

function pdfToText(filePath) {
  return execFileSync("pdftotext", ["-layout", filePath, "-"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  });
}

function splitColumns(line) {
  return line
    .trim()
    .split(/\s{2,}/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseCategoryList(filePath) {
  const text = pdfToText(filePath);
  const rows = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\f/g, "").trimEnd();
    if (!/^\s*\d+\s+\d+\s+\d+/.test(line)) {
      continue;
    }

    const columns = splitColumns(line);
    if (columns.length < 7) {
      continue;
    }

    rows.push({
      seq: Number(columns[0]),
      seniorityNumber: Number(columns[1]),
      employeeNumber: columns[2],
      name: columns[3],
      base: columns[4],
      fleet: columns[5],
      positionCode: columns[6],
      instructor: columns[7] === "Y",
      sourceFile: path.basename(filePath),
    });
  }

  return rows;
}

function parseSeniorityList(filePath) {
  const text = pdfToText(filePath);
  const rows = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\f/g, "").trimEnd();
    if (!/^\s*\d+\s+\d+\s+/.test(line)) {
      continue;
    }

    const columns = splitColumns(line);
    if (columns.length < 6) {
      continue;
    }

    rows.push({
      seniorityNumber: Number(columns[0]),
      employeeNumber: columns[1],
      name: columns[2],
      categoryCode: columns[3],
      pilotHireDate: columns[4],
      scheduledRetireDate: columns[5],
      sourceFile: path.basename(filePath),
    });
  }

  return rows;
}

function parseAePosting(filePath) {
  const text = pdfToText(filePath);
  const rows = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\f/g, "").trimEnd();
    if (!/^\s*\d{2}[A-Z]{3}\d{2}\s+AE\s+/.test(line)) {
      continue;
    }

    const columns = splitColumns(line);
    if (columns.length < 8) {
      continue;
    }

    const [
      awardDate,
      awardType,
      awardCategory,
      employeeNumber,
      name,
      seniorityNumber,
      convOutOfSeq,
      previousCategory,
      bypassAward,
      projectedTrainingMonth,
      payProtectionDate,
      outsideHoursVerificationRequired,
    ] = columns;

    rows.push({
      awardDate,
      awardType,
      awardCategory,
      employeeNumber,
      name,
      seniorityNumber: Number(String(seniorityNumber).replace(/\.$/, "")),
      convOutOfSeq,
      previousCategory,
      bypassAward: bypassAward === "Y",
      ...parseAeTiming(projectedTrainingMonth, payProtectionDate),
      outsideHoursVerificationRequired: outsideHoursVerificationRequired === "Y",
      sourceFile: path.basename(filePath),
    });
  }

  return rows;
}

function writeJson(name, data) {
  writeFileSync(path.join(outputDir, name), JSON.stringify(data, null, 2) + "\n");
}

function normalizeDigits(value) {
  return String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

function toTitleSeat(positionCode) {
  if (positionCode === "A") {
    return "Captain";
  }
  if (positionCode === "B") {
    return "First Officer";
  }
  return positionCode;
}

function parseCategoryCode(categoryCode) {
  const match = categoryCode.match(/^([A-Z]{3})([A-Z0-9]+?)(A|B)$/);
  if (!match) {
    return {
      base: categoryCode.slice(0, 3),
      fleet: categoryCode.slice(3, -1),
      positionCode: categoryCode.slice(-1),
      seat: toTitleSeat(categoryCode.slice(-1)),
    };
  }

  const [, base, fleet, positionCode] = match;
  return {
    base,
    fleet,
    positionCode,
    seat: toTitleSeat(positionCode),
  };
}

function parseAeCategory(categoryCode) {
  const parts = categoryCode.split("-");
  const [base = "", fleet = "", seatCode = ""] = parts;
  return {
    base,
    fleet,
    seatCode,
    seat: seatCode === "CA" ? "Captain" : seatCode === "FO" ? "First Officer" : seatCode,
  };
}

function parseAeTiming(projectedTrainingMonth, payProtectionDate) {
  const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/;
  const combined = [projectedTrainingMonth, payProtectionDate].filter(Boolean).join(" ").trim();
  const foundDate = combined.match(datePattern)?.[0] ?? null;
  const cleanTrainingMonth = combined.replace(datePattern, "").trim().replace(/\s{2,}/g, " ");

  return {
    projectedTrainingMonth: cleanTrainingMonth || null,
    payProtectionDate: foundDate,
  };
}

const monthMap = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

function extractDateFromFilename(filePath) {
  const name = path.basename(filePath).toUpperCase();

  let match = name.match(/(\d{2})([A-Z]{3})(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return new Date(Number(year), monthMap[month], Number(day)).getTime();
  }

  match = name.match(/([A-Z]{3})(\d{4})/);
  if (match) {
    const [, month, year] = match;
    return new Date(Number(year), monthMap[month], 1).getTime();
  }

  match = name.match(/([A-Z]+)\s+(\d{4})/);
  if (match) {
    const month = match[1].slice(0, 3);
    const year = match[2];
    if (month in monthMap) {
      return new Date(Number(year), monthMap[month], 1).getTime();
    }
  }

  return 0;
}

function latestFile(files) {
  return files
    .map((filePath) => ({
      filePath,
      extractedDate: extractDateFromFilename(filePath),
    }))
    .sort((a, b) => b.extractedDate - a.extractedDate)[0]?.filePath ?? null;
}

function sortFilesByDate(files) {
  return [...files].sort(
    (a, b) => extractDateFromFilename(a) - extractDateFromFilename(b)
  );
}

const categoryFiles = listPdfFiles(categoryDir);
const seniorityFiles = listPdfFiles(seniorityDir);
const aeFiles = listPdfFiles(aeDir);

const categoryRows = categoryFiles.flatMap(parseCategoryList);
const seniorityRows = seniorityFiles.flatMap(parseSeniorityList);
const aeRows = aeFiles.flatMap(parseAePosting);

const latestCategoryFile = latestFile(categoryFiles)?.split("/").pop() ?? null;
const latestSeniorityFile = latestFile(seniorityFiles)?.split("/").pop() ?? null;
const latestAeFile = latestFile(aeFiles)?.split("/").pop() ?? null;
const sortedCategoryFiles = sortFilesByDate(categoryFiles).map((filePath) =>
  path.basename(filePath)
);
const sortedSeniorityFiles = sortFilesByDate(seniorityFiles).map((filePath) =>
  path.basename(filePath)
);
const sortedAeFiles = sortFilesByDate(aeFiles).map((filePath) => path.basename(filePath));

const latestCategoryRows = categoryRows.filter((row) => row.sourceFile === latestCategoryFile);
const latestSeniorityRows = seniorityRows.filter((row) => row.sourceFile === latestSeniorityFile);
const latestAeRows = aeRows.filter((row) => row.sourceFile === latestAeFile);

const latestCategoryRankings = new Map(
  Object.entries(
    latestCategoryRows.reduce((acc, row) => {
      const key = `${row.base}-${row.fleet}-${row.positionCode}`;
      acc[key] ??= [];
      acc[key].push(row);
      return acc;
    }, {})
  ).map(([key, rows]) => [
    key,
    rows.sort((left, right) => left.seniorityNumber - right.seniorityNumber),
  ])
);

const latestCategoryAssignments = latestCategoryRows
  .map((row) => {
    const seniorityRecord = seniorityByEmployeeNumber.get(row.employeeNumber) ?? null;
    return {
      employeeNumber: row.employeeNumber,
      name: row.name,
      seniorityNumber: row.seniorityNumber,
      base: row.base,
      fleet: row.fleet,
      seat: toTitleSeat(row.positionCode),
      categoryKey: `${row.base}-${row.fleet}-${row.positionCode}`,
      awardCategory: `${row.base}-${row.fleet}-${row.positionCode === "A" ? "CA" : "FO"}`,
      scheduledRetireDate: seniorityRecord?.scheduledRetireDate ?? null,
    };
  })
  .sort((a, b) => a.seniorityNumber - b.seniorityNumber);

const seniorityByNumber = new Map(
  latestSeniorityRows.map((row) => [row.seniorityNumber, row])
);
const seniorityByEmployeeNumber = new Map(
  latestSeniorityRows.map((row) => [row.employeeNumber, row])
);

const categorySummary = Object.values(
  categoryRows.reduce((acc, row) => {
    const key = `${row.base}-${row.fleet}-${row.positionCode}`;
    acc[key] ??= {
      key,
      base: row.base,
      fleet: row.fleet,
      positionCode: row.positionCode,
      instructorCount: 0,
      pilotCount: 0,
    };
    acc[key].pilotCount += 1;
    if (row.instructor) {
      acc[key].instructorCount += 1;
    }
    return acc;
  }, {})
).sort((a, b) => a.base.localeCompare(b.base) || a.fleet.localeCompare(b.fleet));

const aeSummary = Object.values(
  aeRows.reduce((acc, row) => {
    acc[row.awardCategory] ??= {
      awardCategory: row.awardCategory,
      awards: 0,
      bypassAwards: 0,
      latestSourceFile: row.sourceFile,
    };
    acc[row.awardCategory].awards += 1;
    if (row.bypassAward) {
      acc[row.awardCategory].bypassAwards += 1;
    }
    return acc;
  }, {})
).sort((a, b) => b.awards - a.awards);

const outputs = {
  generatedAt: new Date().toISOString(),
  files: {
    categoryFiles: categoryFiles.map((filePath) => path.basename(filePath)),
    seniorityFiles: seniorityFiles.map((filePath) => path.basename(filePath)),
    aeFiles: aeFiles.map((filePath) => path.basename(filePath)),
  },
  counts: {
    categoryRows: categoryRows.length,
    seniorityRows: seniorityRows.length,
    aeRows: aeRows.length,
  },
  latestFiles: {
    category: latestCategoryFile,
    seniority: latestSeniorityFile,
    ae: latestAeFile,
  },
};

const categorySnapshot = Object.values(
  latestCategoryRows.reduce((acc, row) => {
    const key = `${row.base}-${row.fleet}-${row.positionCode}`;
    acc[key] ??= {
      key,
      base: row.base,
      fleet: row.fleet,
      positionCode: row.positionCode,
      seat: toTitleSeat(row.positionCode),
      pilotCount: 0,
      instructorCount: 0,
      mostSeniorNumber: row.seniorityNumber,
      mostJuniorNumber: row.seniorityNumber,
      seniorityNumbers: [],
    };
    acc[key].pilotCount += 1;
    if (row.instructor) {
      acc[key].instructorCount += 1;
    }
    acc[key].mostSeniorNumber = Math.min(acc[key].mostSeniorNumber, row.seniorityNumber);
    acc[key].mostJuniorNumber = Math.max(acc[key].mostJuniorNumber, row.seniorityNumber);
    acc[key].seniorityNumbers.push(row.seniorityNumber);
    return acc;
  }, {})
)
  .map((entry) => ({
    ...entry,
    middleSeniorityNumber:
      entry.seniorityNumbers[Math.floor(entry.seniorityNumbers.length / 2)] ?? null,
    ...entry,
    mostSeniorPilot: seniorityByNumber.get(entry.mostSeniorNumber)?.name ?? null,
    mostJuniorPilot: seniorityByNumber.get(entry.mostJuniorNumber)?.name ?? null,
    middlePilot:
      seniorityByNumber.get(
        entry.seniorityNumbers[Math.floor(entry.seniorityNumbers.length / 2)] ?? -1
      )?.name ?? null,
  }))
  .map(({ seniorityNumbers, ...entry }) => entry)
  .sort((a, b) => a.base.localeCompare(b.base) || a.fleet.localeCompare(b.fleet));

const baseSnapshot = Object.values(
  categorySnapshot.reduce((acc, row) => {
    acc[row.base] ??= {
      base: row.base,
      isCarveout: carveoutBases.has(row.base),
      categories: 0,
      pilots: 0,
      instructors: 0,
    };
    acc[row.base].categories += 1;
    acc[row.base].pilots += row.pilotCount;
    acc[row.base].instructors += row.instructorCount;
    return acc;
  }, {})
).sort((a, b) => b.pilots - a.pilots);

const operationalBases = baseSnapshot.filter((entry) => !entry.isCarveout);
const carveoutBaseSnapshot = baseSnapshot.filter((entry) => entry.isCarveout);

const aeSnapshot = Object.values(
  latestAeRows.reduce((acc, row) => {
    const parsed = parseAeCategory(row.awardCategory);
    acc[row.awardCategory] ??= {
      awardCategory: row.awardCategory,
      base: parsed.base,
      fleet: parsed.fleet,
      seat: parsed.seat,
      awards: 0,
      bypassAwards: 0,
      outOfSequenceAwards: 0,
      seniorityNumbers: [],
    };
    acc[row.awardCategory].awards += 1;
    if (row.bypassAward) {
      acc[row.awardCategory].bypassAwards += 1;
    }
    if (row.convOutOfSeq === "Y") {
      acc[row.awardCategory].outOfSequenceAwards += 1;
    }
    acc[row.awardCategory].seniorityNumbers.push(row.seniorityNumber);
    return acc;
  }, {})
)
  .map(({ seniorityNumbers, ...entry }) => {
    const sortedNumbers = seniorityNumbers.sort((left, right) => left - right);
    const mostSeniorAwardNumber = sortedNumbers[0] ?? null;
    const middleAwardNumber =
      sortedNumbers.length > 0 ? sortedNumbers[Math.floor((sortedNumbers.length - 1) / 2)] : null;
    const mostJuniorAwardNumber = sortedNumbers.at(-1) ?? null;

    return {
      ...entry,
      mostSeniorAwardNumber,
      middleAwardNumber,
      mostJuniorAwardNumber,
      juniorMostPilot:
        mostJuniorAwardNumber != null
          ? seniorityByNumber.get(mostJuniorAwardNumber)?.name ?? null
          : null,
    };
  })
  .sort((a, b) => b.awards - a.awards);

const latestAeAwards = latestAeRows
  .map((row) => {
    const parsed = parseAeCategory(row.awardCategory);
    return {
      awardCategory: row.awardCategory,
      base: parsed.base,
      fleet: parsed.fleet,
      seat: parsed.seat,
      employeeNumber: row.employeeNumber,
      name: row.name,
      seniorityNumber: row.seniorityNumber,
      previousCategory: row.previousCategory,
      bypassAward: row.bypassAward,
      outOfSequence: row.convOutOfSeq === "Y",
      projectedTrainingMonth: row.projectedTrainingMonth,
      payProtectionDate: row.payProtectionDate,
      scheduledRetireDate:
        seniorityByEmployeeNumber.get(row.employeeNumber)?.scheduledRetireDate ?? null,
      sourceFile: row.sourceFile,
    };
  })
  .sort((a, b) => a.seniorityNumber - b.seniorityNumber);

const categoryMonthlySnapshots = sortedCategoryFiles.map((sourceFile) => {
  const rows = categoryRows.filter((row) => row.sourceFile === sourceFile);
  const summary = Object.values(
    rows.reduce((acc, row) => {
      const key = `${row.base}-${row.fleet}-${row.positionCode}`;
      acc[key] ??= {
        key,
        base: row.base,
        fleet: row.fleet,
        positionCode: row.positionCode,
        seat: toTitleSeat(row.positionCode),
        pilotCount: 0,
        mostJuniorNumber: row.seniorityNumber,
      };
      acc[key].pilotCount += 1;
      acc[key].mostJuniorNumber = Math.max(
        acc[key].mostJuniorNumber,
        row.seniorityNumber
      );
      return acc;
    }, {})
  );

  return {
    sourceFile,
    monthKey: sourceFile.replace(".pdf", ""),
    categoryCount: summary.length,
    summaries: summary,
  };
});

const latestCategorySummaryMap = new Map(
  categorySnapshot.map((entry) => [entry.key, entry])
);
const previousCategorySummaryMap = new Map(
  (categoryMonthlySnapshots.at(-2)?.summaries ?? []).map((entry) => [entry.key, entry])
);

const categoryTrends = categorySnapshot
  .map((entry) => {
    const previous = previousCategorySummaryMap.get(entry.key);
    return {
      key: entry.key,
      base: entry.base,
      fleet: entry.fleet,
      seat: entry.seat,
      latestPilotCount: entry.pilotCount,
      previousPilotCount: previous?.pilotCount ?? null,
      pilotCountDelta:
        previous?.pilotCount != null ? entry.pilotCount - previous.pilotCount : null,
      latestJuniorNumber: entry.mostJuniorNumber,
      previousJuniorNumber: previous?.mostJuniorNumber ?? null,
      lineMovement:
        previous?.mostJuniorNumber != null
          ? entry.mostJuniorNumber - previous.mostJuniorNumber
          : null,
    };
  })
  .sort((a, b) => {
    const deltaA = Math.abs(a.lineMovement ?? 0);
    const deltaB = Math.abs(b.lineMovement ?? 0);
    return deltaB - deltaA;
  });

const aeMonthlySnapshots = sortedAeFiles.map((sourceFile) => {
  const rows = aeRows.filter((row) => row.sourceFile === sourceFile);
  const summary = Object.values(
    rows.reduce((acc, row) => {
      const parsed = parseAeCategory(row.awardCategory);
      acc[row.awardCategory] ??= {
        awardCategory: row.awardCategory,
        base: parsed.base,
        fleet: parsed.fleet,
        seat: parsed.seat,
        awards: 0,
        highestSeniorityNumber: row.seniorityNumber,
      };
      acc[row.awardCategory].awards += 1;
      acc[row.awardCategory].highestSeniorityNumber = Math.max(
        acc[row.awardCategory].highestSeniorityNumber,
        row.seniorityNumber
      );
      return acc;
    }, {})
  );

  return {
    sourceFile,
    monthKey: sourceFile.replace(".pdf", ""),
    opportunityCount: summary.length,
    summaries: summary,
  };
});

const previousAeSummaryMap = new Map(
  (aeMonthlySnapshots.at(-2)?.summaries ?? []).map((entry) => [entry.awardCategory, entry])
);

const aeTrends = aeSnapshot
  .map((entry) => {
    const previous = previousAeSummaryMap.get(entry.awardCategory);
    return {
      awardCategory: entry.awardCategory,
      base: entry.base,
      fleet: entry.fleet,
      seat: entry.seat,
      latestAwards: entry.awards,
      previousAwards: previous?.awards ?? null,
      awardsDelta:
        previous?.awards != null ? entry.awards - previous.awards : null,
      latestJuniorNumber: entry.highestSeniorityNumber,
      previousJuniorNumber: previous?.highestSeniorityNumber ?? null,
      lineMovement:
        previous?.highestSeniorityNumber != null &&
        entry.highestSeniorityNumber != null
          ? entry.highestSeniorityNumber - previous.highestSeniorityNumber
          : null,
    };
  })
  .sort((a, b) => {
    const deltaA = Math.abs(a.awardsDelta ?? 0);
    const deltaB = Math.abs(b.awardsDelta ?? 0);
    return deltaB - deltaA;
  });

const aeHistoryByCategory = Object.values(
  aeMonthlySnapshots.reduce((acc, snapshot) => {
    snapshot.summaries.forEach((entry) => {
      acc[entry.awardCategory] ??= {
        awardCategory: entry.awardCategory,
        base: entry.base,
        fleet: entry.fleet,
        seat: entry.seat,
        points: [],
      };
      acc[entry.awardCategory].points.push({
        sourceFile: snapshot.sourceFile,
        monthKey: snapshot.monthKey,
        awards: entry.awards,
        highestSeniorityNumber: entry.highestSeniorityNumber ?? null,
      });
    });
    return acc;
  }, {})
)
  .map((entry) => ({
    ...entry,
    points: entry.points.sort(
      (left, right) =>
        extractDateFromFilename(left.sourceFile) - extractDateFromFilename(right.sourceFile)
    ),
  }))
  .sort((a, b) => a.awardCategory.localeCompare(b.awardCategory));

const seniorityMonthlySnapshots = sortedSeniorityFiles.map((sourceFile) => {
  const rows = seniorityRows.filter((row) => row.sourceFile === sourceFile);
  return {
    sourceFile,
    monthKey: sourceFile.replace(".pdf", ""),
    pilotCount: rows.length,
  };
});

const monthlyOverview = {
  seniority: seniorityMonthlySnapshots,
  categories: categoryMonthlySnapshots.map((snapshot) => ({
    sourceFile: snapshot.sourceFile,
    monthKey: snapshot.monthKey,
    categoryCount: snapshot.categoryCount,
  })),
  ae: aeMonthlySnapshots.map((snapshot) => ({
    sourceFile: snapshot.sourceFile,
    monthKey: snapshot.monthKey,
    opportunityCount: snapshot.opportunityCount,
  })),
};

const pilotCountBySourceFile = new Map(
  seniorityMonthlySnapshots.map((snapshot) => [snapshot.sourceFile, snapshot.pilotCount])
);

const pilotHistoryByEmployee = Object.values(
  seniorityRows.reduce((acc, row) => {
    acc[row.employeeNumber] ??= {
      employeeNumber: row.employeeNumber,
      name: row.name,
      points: [],
    };
    const totalPilots = pilotCountBySourceFile.get(row.sourceFile) ?? 0;
    acc[row.employeeNumber].points.push({
      sourceFile: row.sourceFile,
      monthKey: row.sourceFile.replace(".pdf", ""),
      seniorityNumber: row.seniorityNumber,
      totalPilots,
      systemPercent: totalPilots
        ? Number(((row.seniorityNumber / totalPilots) * 100).toFixed(1))
        : null,
      categoryCode: row.categoryCode,
    });
    return acc;
  }, {})
)
  .map((entry) => ({
    ...entry,
    points: entry.points.sort(
      (left, right) =>
        extractDateFromFilename(left.sourceFile) - extractDateFromFilename(right.sourceFile)
    ),
  }))
  .sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber));

const pilotHistoryShards = pilotHistoryByEmployee.reduce((acc, entry) => {
  const normalizedEmployeeNumber = normalizeDigits(entry.employeeNumber);
  const shardKey = (normalizedEmployeeNumber.slice(0, 2) || "00").padEnd(2, "0");
  acc[shardKey] ??= {};
  acc[shardKey][normalizedEmployeeNumber] = entry;
  return acc;
}, {});

const carveoutCategories = categorySnapshot.filter((entry) =>
  carveoutBases.has(entry.base)
);
const operationalCategories = categorySnapshot.filter(
  (entry) => !carveoutBases.has(entry.base)
);

const carveoutAeOpportunities = aeSnapshot.filter((entry) =>
  carveoutBases.has(entry.base)
);
const operationalAeOpportunities = aeSnapshot.filter(
  (entry) => !carveoutBases.has(entry.base)
);

const pilotDirectory = latestSeniorityRows
  .map((row) => {
    const parsedCategory = parseCategoryCode(row.categoryCode);
    const currentCategoryKey = `${parsedCategory.base}-${parsedCategory.fleet}-${parsedCategory.positionCode}`;
    const matchingCategory = latestCategorySummaryMap.get(currentCategoryKey) ?? null;
    const categoryRanking = latestCategoryRankings.get(currentCategoryKey) ?? [];
    const currentCategoryRank =
      categoryRanking.findIndex((entry) => entry.employeeNumber === row.employeeNumber) + 1;
    return {
      employeeNumber: row.employeeNumber,
      name: row.name,
      seniorityNumber: row.seniorityNumber,
      currentCategoryCode: row.categoryCode,
      currentBase: parsedCategory.base,
      currentFleet: parsedCategory.fleet,
      currentSeat: parsedCategory.seat,
      pilotHireDate: row.pilotHireDate,
      scheduledRetireDate: row.scheduledRetireDate,
      currentCategoryKey,
      currentCategoryJuniorNumber: matchingCategory?.mostJuniorNumber ?? null,
      currentCategoryMiddleNumber: matchingCategory?.middleSeniorityNumber ?? null,
      currentCategorySeniorNumber: matchingCategory?.mostSeniorNumber ?? null,
      currentCategoryRank: currentCategoryRank > 0 ? currentCategoryRank : null,
      currentCategoryTotal: categoryRanking.length || null,
    };
  })
  .sort((a, b) => a.seniorityNumber - b.seniorityNumber);

const deltaSnapshotModule = `export const deltaSnapshot = ${JSON.stringify(
  {
    generatedAt: outputs.generatedAt,
    latestFiles: outputs.latestFiles,
    counts: outputs.counts,
    bases: baseSnapshot,
    operationalBases,
    carveoutBases: carveoutBaseSnapshot,
    categories: operationalCategories,
    carveoutCategories,
    aeOpportunities: operationalAeOpportunities,
    carveoutAeOpportunities,
    categoryTrends,
    aeTrends,
    aeHistoryByCategory,
    latestAeAwards,
    latestCategoryAssignments,
    monthlyOverview,
    pilotDirectory,
  },
  null,
  2
)} as const;\n`;

const deltaChartsModule = `export const deltaCharts = ${JSON.stringify(
  {
    generatedAt: outputs.generatedAt,
    monthlyPilotCounts: seniorityMonthlySnapshots,
    pilotHistoryByEmployee: [],
    pilotHistoryShardBaseUrl: "/data/pilot-history",
  },
  null,
  2
)} as const;\n`;

writeJson("category-lists.json", categoryRows);
writeJson("seniority-lists.json", seniorityRows);
writeJson("ae-awards.json", aeRows);
writeJson("category-summary.json", categorySummary);
writeJson("ae-summary.json", aeSummary);
writeJson("import-manifest.json", outputs);
writeJson("app-snapshot.json", {
  generatedAt: outputs.generatedAt,
  latestFiles: outputs.latestFiles,
  counts: outputs.counts,
  bases: baseSnapshot,
  operationalBases,
  carveoutBases: carveoutBaseSnapshot,
  categories: operationalCategories,
  carveoutCategories,
    aeOpportunities: operationalAeOpportunities,
    carveoutAeOpportunities,
    categoryTrends,
    aeTrends,
    aeHistoryByCategory,
    latestAeAwards,
    latestCategoryAssignments,
    monthlyOverview,
    pilotDirectory,
});
writeFileSync(
  path.join(projectRoot, "src", "data", "deltaSnapshot.ts"),
  deltaSnapshotModule
);
writeFileSync(
  path.join(projectRoot, "src", "data", "deltaCharts.ts"),
  deltaChartsModule
);

for (const [shardKey, shardEntries] of Object.entries(pilotHistoryShards)) {
  writeFileSync(
    path.join(pilotHistoryShardDir, `${shardKey}.json`),
    JSON.stringify(shardEntries, null, 2) + "\n"
  );
}

console.log(
  JSON.stringify(
    {
      outputDir,
      ...outputs,
    },
    null,
    2
  )
);
