/** Citizen-facing problem categories. The data pipeline (scripts/build_dataset.py) produces exactly these names. */
export interface Category { name: string; hint: string; reportable: boolean }

export const CATEGORIES: Category[] = [
  { name: "Potholes", hint: "Potholes or bad patches on the road", reportable: true },
  { name: "Roads & Footpaths", hint: "Broken footpath, speed breaker, signal or divider", reportable: true },
  { name: "Garbage & Cleanliness", hint: "Garbage not lifted, debris, unswept road", reportable: true },
  { name: "Drains & Sewage", hint: "Blocked drain, open or broken manhole, overflow", reportable: true },
  { name: "Water Supply", hint: "No water, low pressure, leak or dirty water", reportable: true },
  { name: "Street Lights", hint: "Street light not working or damaged", reportable: true },
  { name: "Encroachment & Hawkers", hint: "Footpath blocked by hawkers, stalls or banners", reportable: true },
  { name: "Illegal Construction", hint: "Unauthorised building, shed or alteration", reportable: true },
  { name: "Trees & Gardens", hint: "Fallen branch, tree trimming, garden upkeep", reportable: true },
  { name: "Mosquitoes, Pests & Animals", hint: "Mosquito breeding, rats, stray animals", reportable: true },
  { name: "Pollution & Noise", hint: "Smoke, dust, foul smell or noise", reportable: true },
  { name: "Public Buildings & Services", hint: "BMC school, hospital or building in poor repair", reportable: true },
  { name: "Licences, Tax & Billing", hint: "Shop licence, property tax or water bill", reportable: false },
  { name: "Other", hint: "Anything else", reportable: true },
];
export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

export const STATUSES = ["Open", "In Review", "In Progress", "Resolved", "Rejected", "Discarded"] as const;
export type Status = (typeof STATUSES)[number];
export const OPEN_STATUSES: ReadonlySet<string> = new Set(["Open", "In Review", "In Progress"]);

/** Greater Mumbai bounding box: lat min/max, lon min/max. */
export const MUMBAI_BBOX = { latMin: 18.85, latMax: 19.35, lonMin: 72.75, lonMax: 73.05 };
export const LIMITS = { description: 500, landmark: 120, reportsPerDay: 10 };
