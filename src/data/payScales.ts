export const definedContributionRate = 0.17;
export const profitSharingRate = 0.151;
export const annualTakeHomeRate = 0.65;
export const profitSharingTakeHomeRate = 0.6;

export const payScales = {
  Captain: {
    "B-777": [443.85, 447.45, 451.12, 454.76, 458.4, 462.0, 465.64, 469.22, 472.87, 476.47, 480.09, 483.74],
    "A-350": [443.85, 447.45, 451.12, 454.76, 458.4, 462.0, 465.64, 469.22, 472.87, 476.47, 480.09, 483.74],
    "B-787": [443.85, 447.45, 451.12, 454.76, 458.4, 462.0, 465.64, 469.22, 472.87, 476.47, 480.09, 483.74],
    "A-330": [443.85, 447.45, 451.12, 454.76, 458.4, 462.0, 465.64, 469.22, 472.87, 476.47, 480.09, 483.74],
    "B-767-400ER": [443.85, 447.45, 451.12, 454.76, 458.4, 462.0, 465.64, 469.22, 472.87, 476.47, 480.09, 483.74],
    "B-767-300ER": [368.14, 371.26, 374.27, 377.31, 380.51, 383.48, 386.33, 389.52, 392.29, 396.5, 400.77, 404.92],
    "B-767-300/200": [368.14, 371.26, 374.27, 377.31, 380.51, 383.48, 386.33, 389.52, 392.29, 396.5, 400.77, 404.92],
    "B-757": [368.14, 371.26, 374.27, 377.31, 380.51, 383.48, 386.33, 389.52, 392.29, 396.5, 400.77, 404.92],
    "A-321N": [368.14, 371.26, 374.27, 377.31, 380.51, 383.48, 386.33, 389.52, 392.29, 396.5, 400.77, 404.92],
    "B-737-900": [358.02, 360.83, 363.66, 366.61, 369.59, 372.56, 375.48, 378.42, 381.43, 384.27, 387.28, 390.3],
    "A-321": [358.02, 360.83, 363.66, 366.61, 369.59, 372.56, 375.48, 378.42, 381.43, 384.27, 387.28, 390.3],
    "B-737-800/700": [356.46, 359.23, 362.07, 365.0, 367.95, 370.84, 373.73, 376.65, 379.59, 382.47, 385.4, 388.27],
    "A-320/319": [356.46, 359.23, 362.07, 365.0, 367.95, 370.84, 373.73, 376.65, 379.59, 382.47, 385.4, 388.27],
    "A-220-300": [343.51, 346.36, 349.15, 351.97, 354.82, 357.69, 360.5, 363.31, 366.11, 368.96, 371.82, 374.66],
    "A-220-100": [329.45, 332.18, 334.84, 337.58, 340.3, 343.05, 345.72, 348.44, 351.12, 353.85, 356.59, 359.33],
    "B-717": [320.81, 323.16, 325.81, 328.46, 330.98, 333.71, 336.25, 338.89, 341.52, 344.18, 346.86, 349.38],
    "EMB-195": [269.29, 271.3, 273.51, 275.79, 277.88, 280.14, 282.28, 284.5, 286.7, 288.92, 291.19, 293.32],
    "EMB-190/CRJ-900": [229.12, 230.81, 232.76, 234.63, 236.39, 238.29, 240.18, 242.06, 243.92, 245.83, 247.72, 249.56],
  },
  "First Officer": {
    "B-777": [125.52, 239.41, 280.15, 286.94, 293.79, 301.24, 309.61, 316.72, 320.17, 324.52, 327.42, 330.44],
    "A-350": [125.52, 239.41, 280.15, 286.94, 293.79, 301.24, 309.61, 316.72, 320.17, 324.52, 327.42, 330.44],
    "B-787": [125.52, 239.41, 280.15, 286.94, 293.79, 301.24, 309.61, 316.72, 320.17, 324.52, 327.42, 330.44],
    "A-330": [125.52, 239.41, 280.15, 286.94, 293.79, 301.24, 309.61, 316.72, 320.17, 324.52, 327.42, 330.44],
    "B-767-400ER": [125.52, 239.41, 280.15, 286.94, 293.79, 301.24, 309.61, 316.72, 320.17, 324.52, 327.42, 330.44],
    "B-767-300ER": [125.52, 198.62, 232.42, 238.1, 243.92, 250.02, 256.92, 262.94, 265.6, 270.01, 273.34, 276.56],
    "B-767-300/200": [125.52, 198.62, 232.42, 238.1, 243.92, 250.02, 256.92, 262.94, 265.6, 270.01, 273.34, 276.56],
    "B-757": [125.52, 198.62, 232.42, 238.1, 243.92, 250.02, 256.92, 262.94, 265.6, 270.01, 273.34, 276.56],
    "A-321N": [125.52, 198.62, 232.42, 238.1, 243.92, 250.02, 256.92, 262.94, 265.6, 270.01, 273.34, 276.56],
    "B-737-900": [125.52, 193.02, 225.86, 231.32, 236.88, 242.91, 249.7, 255.47, 258.21, 261.73, 264.13, 266.58],
    "A-321": [125.52, 193.02, 225.86, 231.32, 236.88, 242.91, 249.7, 255.47, 258.21, 261.73, 264.13, 266.58],
    "B-737-800/700": [125.52, 192.22, 224.85, 230.32, 235.86, 241.75, 248.51, 254.25, 256.97, 260.44, 262.83, 265.19],
    "A-320/319": [125.52, 192.22, 224.85, 230.32, 235.86, 241.75, 248.51, 254.25, 256.97, 260.44, 262.83, 265.19],
    "A-220-300": [125.52, 185.31, 216.85, 222.09, 227.46, 233.18, 239.72, 245.24, 247.9, 251.29, 253.58, 255.9],
    "A-220-100": [125.52, 177.71, 207.96, 212.98, 218.11, 223.64, 229.89, 235.2, 237.73, 240.99, 243.21, 245.41],
    "B-717": [125.52, 172.87, 202.31, 207.24, 212.14, 217.57, 223.6, 228.77, 231.2, 234.38, 236.61, 238.62],
    "EMB-195": [125.52, 145.14, 169.86, 174.0, 178.15, 182.65, 187.72, 192.05, 194.12, 196.76, 198.6, 200.36],
    "EMB-190/CRJ-900": [125.52, 125.52, 144.51, 148.02, 151.53, 155.37, 159.7, 163.38, 165.14, 167.38, 168.96, 170.43],
  },
} as const;

export type PaySeat = keyof typeof payScales;

export type PayScenarioOption = {
  code: string;
  label: string;
  shortLabel: string;
  equipmentLabel: keyof (typeof payScales)["Captain"];
  seat: PaySeat;
};

const payScenarioBlueprints: readonly {
  code: string;
  equipmentLabel: keyof (typeof payScales)["Captain"];
  seat: PaySeat;
}[] = [
  { code: "777A", equipmentLabel: "B-777", seat: "Captain" },
  { code: "777B", equipmentLabel: "B-777", seat: "First Officer" },
  { code: "350A", equipmentLabel: "A-350", seat: "Captain" },
  { code: "350B", equipmentLabel: "A-350", seat: "First Officer" },
  { code: "787A", equipmentLabel: "B-787", seat: "Captain" },
  { code: "787B", equipmentLabel: "B-787", seat: "First Officer" },
  { code: "330A", equipmentLabel: "A-330", seat: "Captain" },
  { code: "330B", equipmentLabel: "A-330", seat: "First Officer" },
  { code: "7ERA", equipmentLabel: "B-767-400ER", seat: "Captain" },
  { code: "7ERB", equipmentLabel: "B-767-400ER", seat: "First Officer" },
  { code: "765A", equipmentLabel: "B-767-300ER", seat: "Captain" },
  { code: "765B", equipmentLabel: "B-767-300ER", seat: "First Officer" },
  { code: "757A", equipmentLabel: "B-757", seat: "Captain" },
  { code: "757B", equipmentLabel: "B-757", seat: "First Officer" },
  { code: "321NA", equipmentLabel: "A-321N", seat: "Captain" },
  { code: "321NB", equipmentLabel: "A-321N", seat: "First Officer" },
  { code: "73NA", equipmentLabel: "B-737-900", seat: "Captain" },
  { code: "73NB", equipmentLabel: "B-737-900", seat: "First Officer" },
  { code: "321A", equipmentLabel: "A-321", seat: "Captain" },
  { code: "321B", equipmentLabel: "A-321", seat: "First Officer" },
  { code: "320A", equipmentLabel: "A-320/319", seat: "Captain" },
  { code: "320B", equipmentLabel: "A-320/319", seat: "First Officer" },
  { code: "220-3A", equipmentLabel: "A-220-300", seat: "Captain" },
  { code: "220-3B", equipmentLabel: "A-220-300", seat: "First Officer" },
  { code: "220A", equipmentLabel: "A-220-100", seat: "Captain" },
  { code: "220B", equipmentLabel: "A-220-100", seat: "First Officer" },
  { code: "717A", equipmentLabel: "B-717", seat: "Captain" },
  { code: "717B", equipmentLabel: "B-717", seat: "First Officer" },
  { code: "195A", equipmentLabel: "EMB-195", seat: "Captain" },
  { code: "195B", equipmentLabel: "EMB-195", seat: "First Officer" },
  { code: "190A", equipmentLabel: "EMB-190/CRJ-900", seat: "Captain" },
  { code: "190B", equipmentLabel: "EMB-190/CRJ-900", seat: "First Officer" },
];

export const payScenarioOptions: readonly PayScenarioOption[] = payScenarioBlueprints.map(
  (option) => ({
    ...option,
    shortLabel: option.code,
    label: `${option.code} • ${option.equipmentLabel} ${option.seat === "Captain" ? "Captain" : "FO"}`,
  })
);

export function normalizePayEquipment(fleet: string, seat: "Captain" | "First Officer") {
  const key = fleet.toUpperCase();

  if (key === "350") return "A-350";
  if (key === "330") return "A-330";
  if (key === "320") return "A-320/319";
  if (key === "321") return "A-321";
  if (key === "321N") return "A-321N";
  if (key === "220") return seat === "Captain" ? "A-220-100" : "A-220-100";
  if (key === "717") return "B-717";
  if (key === "73N") return "B-737-900";
  if (key === "765") return "B-767-300ER";
  if (key === "7ER") return "B-767-400ER";

  return null;
}

export function resolvePayScenario(code: string) {
  const normalizedCode = code.toUpperCase();
  return payScenarioOptions.find((option) => option.code === normalizedCode) ?? null;
}
