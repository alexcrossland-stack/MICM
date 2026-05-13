export function formatCriterionNote(note: any, author?: any) {
  return {
    id: note.id,
    companyId: note.companyId,
    assessmentId: note.assessmentId,
    criterionId: note.criterionId,
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
