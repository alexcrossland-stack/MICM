-- READ ONLY. Run before question-snapshot migrations; outputs counts, never text.
BEGIN TRANSACTION READ ONLY;
SELECT status, count(*) AS assessments FROM assessment_cycles GROUP BY status ORDER BY status;
SELECT 'companies' AS table_name, count(*) FROM companies
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'domains', count(*) FROM domains
UNION ALL SELECT 'categories', count(*) FROM categories
UNION ALL SELECT 'criteria', count(*) FROM criteria
UNION ALL SELECT 'assignments', count(*) FROM assessment_assignees
UNION ALL SELECT 'scores', count(*) FROM scores
UNION ALL SELECT 'criterion_notes', count(*) FROM criterion_notes;
SELECT assessment_id, count(*) AS scores FROM scores GROUP BY assessment_id ORDER BY assessment_id;
SELECT assessment_id, count(*) AS evidence_notes FROM criterion_notes GROUP BY assessment_id ORDER BY assessment_id;
SELECT count(*) AS duplicate_answer_groups FROM (
  SELECT assessment_id,user_id,criterion_id FROM scores
  WHERE criterion_id IS NOT NULL GROUP BY assessment_id,user_id,criterion_id HAVING count(*) > 1
) duplicates;
SELECT count(*) AS invalid_scores FROM scores WHERE score NOT BETWEEN 0 AND 4;
SELECT count(*) AS dangling_scores FROM scores s
LEFT JOIN assessment_cycles a ON a.id=s.assessment_id LEFT JOIN criteria c ON c.id=s.criterion_id
LEFT JOIN users u ON u.id=s.user_id WHERE a.id IS NULL OR c.id IS NULL OR u.id IS NULL;
SELECT count(*) AS invalid_note_links FROM criterion_notes n
LEFT JOIN assessment_cycles a ON a.id=n.assessment_id LEFT JOIN criteria c ON c.id=n.criterion_id
LEFT JOIN users u ON u.id=n.author_user_id
WHERE a.id IS NULL OR c.id IS NULL OR u.id IS NULL OR n.company_id<>a.company_id;
SELECT max(length(name)) AS longest_question, max(length(description)) AS longest_description,
  max(length(baseline_description)) AS longest_baseline,
  max(length(excellence_description)) AS longest_excellence,
  count(*) FILTER (WHERE length(name)>500 OR length(description)>5000 OR
    length(baseline_description)>5000 OR length(excellence_description)>5000) AS oversized_criteria
FROM criteria;
COMMIT;
