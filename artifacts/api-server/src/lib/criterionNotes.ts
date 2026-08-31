export function formatCriterionNote(note: any, author?: any, question?: { name: string; domainName: string; categoryName: string }) {
  return {
    id: note.id,
    companyId: note.companyId,
    assessmentId: note.assessmentId,
    criterionId: note.criterionId,
    assessmentQuestionId: note.assessmentQuestionId,
    questionName: question?.name,
    domainName: question?.domainName,
    categoryName: question?.categoryName,
    authorUserId: note.authorUserId,
    authorName: author ? formatAuthorName(author) : "Unknown user",
    note: note.note,
    createdAt: note.createdAt instanceof Date ? note.createdAt : new Date(note.createdAt),
    updatedAt: note.updatedAt instanceof Date ? note.updatedAt : new Date(note.updatedAt),
  };
}

export function formatAuthorName(author: any) {
  return [author.firstName, author.lastName].filter(Boolean).join(" ") || author.email;
}
