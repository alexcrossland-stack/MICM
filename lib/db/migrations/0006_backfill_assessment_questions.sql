-- Run in a planned write-maintenance window. No catalogue reseeding or answer deletion.
LOCK TABLE assessment_cycles, assessment_assignees, criteria, categories, domains,
  scores, criterion_notes, assessment_questions IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE micm_question_backfill_ids ON COMMIT DROP AS
SELECT a.id FROM assessment_cycles a
WHERE NOT EXISTS (SELECT 1 FROM assessment_questions q WHERE q.assessment_id = a.id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM scores WHERE score < 0 OR score > 4) THEN
    RAISE EXCEPTION 'Question migration stopped: invalid legacy scores';
  END IF;
  IF EXISTS (SELECT 1 FROM scores WHERE criterion_id IS NOT NULL GROUP BY assessment_id, user_id, criterion_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Question migration stopped: duplicate legacy answers require operator review';
  END IF;
  IF EXISTS (SELECT 1 FROM assessment_cycles) AND NOT EXISTS (SELECT 1 FROM criteria) THEN
    RAISE EXCEPTION 'Question migration stopped: existing assessments have no catalogue';
  END IF;
END $$;

INSERT INTO assessment_questions (assessment_id, source_criterion_id, category_id,
  domain_id, domain_name, domain_description, domain_order, category_name, category_order,
  name, description, baseline_description, excellence_description, order_index)
SELECT a.id, q.id, c.id, d.id, d.name, d.description, d.order_index, c.name, c.order_index,
  q.name, q.description, q.baseline_description, q.excellence_description, q.order_index
FROM micm_question_backfill_ids a CROSS JOIN criteria q
JOIN categories c ON c.id = q.category_id JOIN domains d ON d.id = c.domain_id
ON CONFLICT (assessment_id, source_criterion_id) DO NOTHING;

UPDATE scores s SET assessment_question_id = q.id FROM assessment_questions q
WHERE s.assessment_id = q.assessment_id AND s.criterion_id = q.source_criterion_id
  AND s.assessment_question_id IS NULL;
UPDATE criterion_notes n SET assessment_question_id = q.id FROM assessment_questions q
WHERE n.assessment_id = q.assessment_id AND n.criterion_id = q.source_criterion_id
  AND n.assessment_question_id IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM scores WHERE assessment_question_id IS NULL)
    OR EXISTS (SELECT 1 FROM criterion_notes WHERE assessment_question_id IS NULL) THEN
    RAISE EXCEPTION 'Question migration stopped: unmapped legacy references';
  END IF;
END $$;

UPDATE assessment_cycles a SET questions_origin = 'legacy_backfill',
  questions_locked_at = CASE WHEN a.status <> 'draft'
    OR EXISTS (SELECT 1 FROM scores s WHERE s.assessment_id = a.id)
    OR EXISTS (SELECT 1 FROM criterion_notes n WHERE n.assessment_id = a.id)
    OR EXISTS (SELECT 1 FROM assessment_assignees p WHERE p.assessment_id = a.id AND p.completed_at IS NOT NULL)
  THEN COALESCE(a.questions_locked_at, now()) ELSE a.questions_locked_at END
WHERE a.id IN (SELECT id FROM micm_question_backfill_ids);
