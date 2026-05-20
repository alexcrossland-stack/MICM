export const COMPANY_CHALLENGE_OPTIONS = [
  "Cash flow pressure",
  "Labour and skills shortages",
  "Recruitment and retention",
  "Rising material costs",
  "Supply chain disruption",
  "Production capacity constraints",
  "Quality issues or rework",
  "Delivery performance challenges",
  "Equipment reliability and downtime",
  "Lack of process standardisation",
  "Limited management information or data visibility",
  "Low digital maturity",
  "Energy costs and sustainability pressure",
  "Leadership bandwidth constraints",
  "Growth planning and market uncertainty",
  "Production under-utilisation",
  "Poor forecast accuracy",
  "Long lead times",
  "High work-in-progress levels",
  "Inefficient factory layout or material flow",
  "Low sales pipeline visibility",
  "Customer concentration risk",
  "Difficulty funding capital investment",
  "Weak supplier performance management",
  "Limited continuous improvement capability",
] as const;

const challengeSet = new Set<string>(COMPANY_CHALLENGE_OPTIONS);

export type CompanyChallenge = (typeof COMPANY_CHALLENGE_OPTIONS)[number];

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
