import type {
  AssessmentQuestion,
  AssessmentQuestionInput,
  Domain,
} from "@workspace/api-client-react";

type QuestionLabel = { id: number; name: string; domainName: string; categoryName: string };
export function assessmentQuestionLabel(question: QuestionLabel, questions: QuestionLabel[]) {
  const label = `${question.domainName} / ${question.categoryName} / ${question.name}`;
  const duplicate = questions.some(q => q.id !== question.id && q.name === question.name && q.domainName === question.domainName && q.categoryName === question.categoryName);
  return duplicate ? `${label} (question ${question.id})` : label;
}

export function assessmentQuestionDomains(
  questions: AssessmentQuestion[] = [],
): Domain[] {
  const domains: Domain[] = [];
  for (const q of questions.filter((q) => q.isIncluded)) {
    let domain = domains.find((d) => d.id === q.domainId);
    if (!domain) {
      domain = {
        id: q.domainId,
        name: q.domainName,
        description: q.domainDescription,
        orderIndex: q.domainOrder,
        categories: [],
      };
      domains.push(domain);
    }
    let category = domain.categories.find((c) => c.id === q.categoryId);
    if (!category) {
      category = {
        id: q.categoryId,
        domainId: q.domainId,
        name: q.categoryName,
        orderIndex: q.categoryOrder,
        criteria: [],
      };
      domain.categories.push(category);
    }
    category.criteria.push(q);
  }
  return domains
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((d) => ({
      ...d,
      categories: d.categories
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((c) => ({
          ...c,
          criteria: c.criteria.sort(
            (a, b) => a.orderIndex - b.orderIndex || a.id - b.id,
          ),
        })),
    }));
}

export function editableQuestion(
  q: AssessmentQuestionInput,
): AssessmentQuestionInput {
  return {
    ...(q.id == null ? {} : { id: q.id }),
    categoryId: q.categoryId,
    name: q.name,
    description: q.description ?? null,
    baselineDescription: q.baselineDescription ?? null,
    excellenceDescription: q.excellenceDescription ?? null,
    orderIndex: q.orderIndex,
    isIncluded: q.isIncluded,
  };
}

export function differentQuestionSets(
  items: { questionSetSignature?: string }[] = [],
) {
  return (
    new Set(items.map((item) => item.questionSetSignature).filter(Boolean))
      .size > 1
  );
}

export function assessmentProgressPoints(
  cycles: {
    assessmentName: string;
    questionSetSignature?: string;
    overallScore?: number | null;
    domainScores: { domainName: string; score?: number | null }[];
  }[] = [],
) {
  return cycles.flatMap((c, index) => {
    const point = {
      name: c.assessmentName,
      Overall: c.overallScore,
      ...Object.fromEntries(c.domainScores.map((d) => [d.domainName, d.score])),
    };
    return index &&
      c.questionSetSignature &&
      cycles[index - 1].questionSetSignature !== c.questionSetSignature
      ? [{ name: "Question set changed" }, point]
      : [point];
  });
}
