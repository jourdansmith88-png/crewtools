export type PilotRole = "Captain" | "First Officer";

export type SeniorityRow = {
  base: string;
  equipment: string;
  role: PilotRole;
  seniorBucket: number;
  middleBucket: number;
  juniorBucket: number;
  monthlyPay: number;
  qualityOfLife: "High" | "Medium" | "Build";
};

export const seniorityData: SeniorityRow[] = [
  {
    base: "ATL",
    equipment: "A321neo",
    role: "Captain",
    seniorBucket: 140,
    middleBucket: 96,
    juniorBucket: 52,
    monthlyPay: 31450,
    qualityOfLife: "High",
  },
  {
    base: "ATL",
    equipment: "A220",
    role: "First Officer",
    seniorBucket: 88,
    middleBucket: 102,
    juniorBucket: 86,
    monthlyPay: 19480,
    qualityOfLife: "Build",
  },
  {
    base: "DTW",
    equipment: "A330",
    role: "Captain",
    seniorBucket: 104,
    middleBucket: 70,
    juniorBucket: 38,
    monthlyPay: 33890,
    qualityOfLife: "Medium",
  },
  {
    base: "LAX",
    equipment: "B767ER",
    role: "Captain",
    seniorBucket: 84,
    middleBucket: 62,
    juniorBucket: 34,
    monthlyPay: 35120,
    qualityOfLife: "High",
  },
  {
    base: "LAX",
    equipment: "A321neo",
    role: "First Officer",
    seniorBucket: 66,
    middleBucket: 74,
    juniorBucket: 58,
    monthlyPay: 20510,
    qualityOfLife: "Medium",
  },
  {
    base: "MSP",
    equipment: "A320",
    role: "Captain",
    seniorBucket: 98,
    middleBucket: 78,
    juniorBucket: 41,
    monthlyPay: 29820,
    qualityOfLife: "High",
  },
  {
    base: "MSP",
    equipment: "B737-900",
    role: "First Officer",
    seniorBucket: 70,
    middleBucket: 80,
    juniorBucket: 55,
    monthlyPay: 20140,
    qualityOfLife: "Build",
  },
  {
    base: "SEA",
    equipment: "A220",
    role: "Captain",
    seniorBucket: 60,
    middleBucket: 72,
    juniorBucket: 49,
    monthlyPay: 28760,
    qualityOfLife: "Medium",
  },
];
