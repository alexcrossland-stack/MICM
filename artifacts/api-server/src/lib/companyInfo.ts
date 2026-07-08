export const COMPANY_CHALLENGE_GROUPS = [
  {
    group: "People",
    challenges: [
      "Labour and skills shortages",
      "High employee turnover",
      "High absenteeism",
    ],
  },
  {
    group: "Quality",
    challenges: [
      "Quality issues or rework",
    ],
  },
  {
    group: "Delivery",
    challenges: [
      "Supply chain disruption",
      "Production capacity constraints",
      "Delivery performance challenges",
      "Long lead times",
      "Production under-utilisation",
    ],
  },
  {
    group: "Cost",
    challenges: [
      "Cash flow pressure",
      "Low Profitability",
    ],
  },
  {
    group: "Asset",
    challenges: [
      "Equipment reliability and downtime",
      "No capital to invest",
    ],
  },
  {
    group: "Product",
    challenges: [
      "Rising material costs",
      "Ageing Product Range",
    ],
  },
  {
    group: "Other",
    challenges: [
      "Lack of process standardisation",
      "Limited management information or data visibility",
      "Low digital maturity",
      "Energy costs and sustainability pressure",
      "Leadership bandwidth constraints",
      "Growth planning and market uncertainty",
      "Poor forecast accuracy",
      "Inefficient factory layout or material flow",
      "Low sales pipeline visibility",
      "Customer concentration risk",
      "Difficulty funding capital investment",
      "Weak supplier performance management",
      "Limited continuous improvement capability",
      "High work-in-progress levels",
    ],
  },
] as const;

export const ACTIVE_COMPANY_CHALLENGE_OPTIONS = COMPANY_CHALLENGE_GROUPS.flatMap((group) => group.challenges);

const LEGACY_COMPANY_CHALLENGE_OPTIONS = [
  "Labour and skills shortages",
  "Recruitment and retention",
] as const;

export const COMPANY_CHALLENGE_OPTIONS = Array.from(new Set([
  ...ACTIVE_COMPANY_CHALLENGE_OPTIONS,
  ...LEGACY_COMPANY_CHALLENGE_OPTIONS,
])) as readonly string[];

const challengeSet = new Set<string>(COMPANY_CHALLENGE_OPTIONS);

export type CompanyChallenge = (typeof COMPANY_CHALLENGE_OPTIONS)[number];

export type StakeholderEngagementRow = {
  stakeholder: string;
  engagementTopic: string;
  contact: string;
  dateOfContact: string;
};

export const STAKEHOLDER_ENGAGEMENT_ROW_COUNT = 5;

const EMPTY_STAKEHOLDER_ENGAGEMENT_ROW: StakeholderEngagementRow = {
  stakeholder: "",
  engagementTopic: "",
  contact: "",
  dateOfContact: "",
};

export function normalizeCompanyChallenges(value: readonly string[] | null | undefined): CompanyChallenge[] {
  if (!value) return [];
  const unique = Array.from(new Set(value));
  return unique.filter((challenge): challenge is CompanyChallenge => challengeSet.has(challenge));
}

export function companyChallengeDiff(before: readonly string[], after: readonly string[]) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    addedChallenges: after.filter((challenge) => !beforeSet.has(challenge)),
    removedChallenges: before.filter((challenge) => !afterSet.has(challenge)),
  };
}

export function sameCompanyChallenges(before: readonly string[], after: readonly string[]) {
  if (before.length !== after.length) return false;
  const afterSet = new Set(after);
  return before.every((challenge) => afterSet.has(challenge));
}

export function normalizeStakeholderEngagement(value: unknown): StakeholderEngagementRow[] {
  const input = Array.isArray(value) ? value : [];
  const normalized = input.slice(0, STAKEHOLDER_ENGAGEMENT_ROW_COUNT).map((row) => {
    const record = row && typeof row === "object" ? row as Record<string, unknown> : {};
    return {
      stakeholder: normalizeTextCell(record.stakeholder),
      engagementTopic: normalizeTextCell(record.engagementTopic),
      contact: normalizeTextCell(record.contact),
      dateOfContact: normalizeTextCell(record.dateOfContact),
    };
  });
  while (normalized.length < STAKEHOLDER_ENGAGEMENT_ROW_COUNT) {
    normalized.push({ ...EMPTY_STAKEHOLDER_ENGAGEMENT_ROW });
  }
  return normalized;
}

export function sameStakeholderEngagement(before: readonly StakeholderEngagementRow[], after: readonly StakeholderEngagementRow[]) {
  const normalizedBefore = normalizeStakeholderEngagement(before);
  const normalizedAfter = normalizeStakeholderEngagement(after);
  return normalizedBefore.every((row, index) => {
    const other = normalizedAfter[index];
    return row.stakeholder === other.stakeholder
      && row.engagementTopic === other.engagementTopic
      && row.contact === other.contact
      && row.dateOfContact === other.dateOfContact;
  });
}

function normalizeTextCell(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
