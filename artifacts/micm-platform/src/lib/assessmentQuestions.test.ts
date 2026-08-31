import { describe, expect, it } from "vitest";
import {
  assessmentQuestionDomains,
  assessmentProgressPoints,
  differentQuestionSets,
  editableQuestion,
  assessmentQuestionLabel,
} from "./assessmentQuestions";
import type { AssessmentQuestion } from "@workspace/api-client-react";

const question: AssessmentQuestion = {
  id: 31,
  assessmentId: 4,
  sourceCriterionId: null,
  categoryId: 2,
  domainId: 1,
  domainName: "Strategy",
  domainOrder: 0,
  categoryName: "Planning",
  categoryOrder: 0,
  name: "Same wording",
  orderIndex: 0,
  isIncluded: true,
};
describe("saved question presentation", () => {
  it("distinguishes duplicate wording in evidence selectors by stable question ID", () => {
    expect(assessmentQuestionLabel(question, [question])).toBe("Strategy / Planning / Same wording");
    expect(assessmentQuestionLabel(question, [question, { ...question, id: 32 }])).toBe("Strategy / Planning / Same wording (question 31)");
  });
  it("uses stable assessment question IDs and omits excluded questions and empty categories", () => {
    const tree = assessmentQuestionDomains([
      { ...question, id: 32, orderIndex: 2 },
      { ...question, id: 33, categoryId: 3, isIncluded: false },
      question,
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].categories).toHaveLength(1);
    expect(tree[0].categories[0].criteria.map((q) => q.id)).toEqual([31, 32]);
    expect(editableQuestion(question)).not.toHaveProperty("assessmentId");
  });
  it("breaks trend lines only when question content differs", () => {
    const cycles = ["same", "same", "different"].map((signature, index) => ({
      assessmentName: String(index),
      questionSetSignature: signature,
      overallScore: 2,
      domainScores: [],
    }));
    expect(differentQuestionSets(cycles)).toBe(true);
    expect(differentQuestionSets(cycles.slice(0, 2))).toBe(false);
    expect(assessmentProgressPoints(cycles).map((p) => p.name)).toEqual([
      "0",
      "1",
      "Question set changed",
      "2",
    ]);
  });
});
