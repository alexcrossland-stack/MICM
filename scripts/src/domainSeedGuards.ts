export function assertEmptyDomainCatalogue(counts: number[]) {
  if (counts.some((count) => count > 0))
    throw new Error(
      "Domain seed refused: the catalogue already contains data. This command is for first-time bootstrap only and never overwrites questions.",
    );
}
