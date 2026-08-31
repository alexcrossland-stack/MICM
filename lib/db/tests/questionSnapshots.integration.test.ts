import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

const url = process.env.MICM_QUESTION_TEST_DATABASE_URL;
const allowed = url ? new URL(url) : null;
if (
  allowed &&
  (!["localhost", "127.0.0.1", "[::1]"].includes(allowed.hostname) ||
    allowed.pathname !== "/micm_questions_test")
) {
  throw new Error(
    "Question integration tests require a disposable loopback database named micm_questions_test",
  );
}
const auth = vi.hoisted(() => ({ userId: "qa-question-super" }));
vi.mock("../../../artifacts/api-server/node_modules/@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: () => auth,
  createClerkClient: () => ({}),
}));

describe.skipIf(!url)(
  "question migration and transactions (disposable PostgreSQL)",
  () => {
    const pool = new pg.Pool({ connectionString: url });
    let app: Awaited<
      typeof import("../../../artifacts/api-server/src/app")
    >["default"];
    let appPool: pg.Pool;
    const migrations = new URL("../migrations/", import.meta.url);
    const files = readdirSync(migrations)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const sql = (name: string) =>
      readFileSync(new URL(name, migrations), "utf8");
    let oldScore: Record<string, unknown>;
    let oldNote: Record<string, unknown>;

    beforeAll(async () => {
      // Never use DATABASE_URL: only the explicitly named disposable test database.
      await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      for (const file of files.filter((f) => f < "0005"))
        await pool.query(sql(file));
      await pool.query(`
      INSERT INTO companies(id,name) VALUES (1,'QA TEST - Questions A'),(2,'QA TEST - Questions B');
      INSERT INTO users(id,clerk_user_id,email,role,company_id) VALUES
        (1,'qa-question-super','super@questions.test','super_admin',NULL),
        (2,'qa-question-user','user@questions.test','company_user',1);
      INSERT INTO domains(id,name) VALUES (1,'Strategy');
      INSERT INTO categories(id,domain_id,name) VALUES (1,1,'Planning');
      INSERT INTO criteria(id,category_id,name,description,baseline_description,excellence_description)
        VALUES (1,1,'Original question','Full description','Baseline','Excellence'),(2,1,'Second question',NULL,NULL,NULL);
      SELECT setval('criteria_id_seq',2);
      INSERT INTO assessment_cycles(id,company_id,name,status) VALUES (1,1,'QA TEST - Legacy','completed'),(2,2,'QA TEST - Draft','draft');
      SELECT setval('assessment_cycles_id_seq',2);
      INSERT INTO assessment_assignees(assessment_id,user_id,completed_at) VALUES (1,2,now());
      INSERT INTO scores(assessment_id,user_id,criterion_id,score,notes) VALUES (1,2,1,3,'Preserve answer');
      INSERT INTO criterion_notes(company_id,assessment_id,criterion_id,author_user_id,note) VALUES (1,1,1,2,'Preserve evidence');
    `);
      oldScore = (await pool.query("SELECT * FROM scores")).rows[0];
      oldNote = (await pool.query("SELECT * FROM criterion_notes")).rows[0];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const file of files.filter((f) => f >= "0005"))
          await client.query(sql(file));
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      vi.stubEnv("DATABASE_URL", url!);
      app = (await import("../../../artifacts/api-server/src/app")).default;
      appPool = (await import("../src/index")).pool;
    });
    afterAll(async () => {
      await appPool?.end();
      await pool.end();
      vi.unstubAllEnvs();
    });

    it("preserves legacy answers/evidence and backfills every assessment idempotently", async () => {
      expect(
        (await pool.query("SELECT count(*)::int n FROM assessment_questions"))
          .rows[0].n,
      ).toBe(4);
      expect((await pool.query("SELECT * FROM scores")).rows[0]).toMatchObject(
        oldScore,
      );
      expect(
        (await pool.query("SELECT * FROM criterion_notes")).rows[0],
      ).toMatchObject(oldNote);
      const before = (
        await pool.query("SELECT * FROM assessment_questions ORDER BY id")
      ).rows;
      await pool.query(
        `BEGIN; ${sql("0006_backfill_assessment_questions.sql")} COMMIT;`,
      );
      expect(
        (await pool.query("SELECT * FROM assessment_questions ORDER BY id"))
          .rows,
      ).toEqual(before);
      expect(
        (
          await pool.query(
            "SELECT questions_locked_at FROM assessment_cycles WHERE id=1",
          )
        ).rows[0].questions_locked_at,
      ).not.toBeNull();
    });

    it("enforces question/assessment references, uniqueness and 0-4 bounds in PostgreSQL", async () => {
      const q = (
        await pool.query(
          "SELECT id FROM assessment_questions WHERE assessment_id=2 LIMIT 1",
        )
      ).rows[0].id;
      await expect(
        pool.query(
          "INSERT INTO scores(assessment_id,user_id,assessment_question_id,score) VALUES (1,2,$1,2)",
          [q],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        pool.query(
          "INSERT INTO criterion_notes(company_id,assessment_id,author_user_id,assessment_question_id,note) VALUES (1,1,2,$1,'Bad link')",
          [q],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        pool.query(
          "INSERT INTO scores(assessment_id,user_id,assessment_question_id,score) VALUES (2,2,$1,5)",
          [q],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      const original = (
        await pool.query("SELECT assessment_question_id FROM scores LIMIT 1")
      ).rows[0].assessment_question_id;
      await expect(
        pool.query(
          "INSERT INTO scores(assessment_id,user_id,assessment_question_id,score) VALUES (1,2,$1,2)",
          [original],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    });

    const input = (q: Record<string, any>) => ({
      id: q.id,
      categoryId: q.categoryId,
      name: q.name,
      description: q.description,
      baselineDescription: q.baselineDescription,
      excellenceDescription: q.excellenceDescription,
      orderIndex: q.orderIndex,
      isIncluded: q.isIncluded,
    });

    it("defaults the standard catalogue to included and serializes whole-catalogue edits", async () => {
      expect((await pool.query("SELECT is_included FROM criteria")).rows.every(q => q.is_included)).toBe(true);
      const path = "/api/standard-assessment-questions";
      const before = (await request(app).get(path).expect(200)).body;
      const snapshots = (await pool.query("SELECT * FROM assessment_questions ORDER BY id")).rows;
      const body = { expectedVersion: before.version, questions: before.questions.map(input) };
      body.questions[0].name = "Standard changed once";
      const responses = await Promise.all([
        request(app).put(path).send(body),
        request(app).put(path).send(body),
      ]);
      expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
      const saved = (await request(app).get(path).expect(200)).body;
      expect(saved.version).not.toBe(before.version);
      expect((await pool.query("SELECT * FROM assessment_questions ORDER BY id")).rows).toEqual(snapshots);
      await pool.query(`CREATE FUNCTION qa_reject_catalogue_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA forced catalogue audit failure'; END $$;
        CREATE TRIGGER qa_reject_catalogue_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION qa_reject_catalogue_audit();`);
      try {
        await request(app).put(path).send({ expectedVersion: saved.version, questions: [...saved.questions.map((q: any) => ({ ...input(q), name: "Rollback catalogue edit", isIncluded: false })), { ...input(saved.questions[0]), id: undefined, name: "Rollback catalogue addition" }] }).expect(500);
        expect((await request(app).get(path).expect(200)).body).toEqual(saved);
      } finally {
        await pool.query("DROP TRIGGER qa_reject_catalogue_audit ON audit_logs; DROP FUNCTION qa_reject_catalogue_audit();");
      }
    });

    it("copies a consistent committed catalogue during concurrent save/create and never changes old answers", async () => {
      const path = "/api/standard-assessment-questions";
      const before = (await request(app).get(path).expect(200)).body;
      const historical = (await pool.query("SELECT * FROM assessment_questions ORDER BY id")).rows;
      const scores = (await pool.query("SELECT * FROM scores ORDER BY id")).rows;
      const notes = (await pool.query("SELECT * FROM criterion_notes ORDER BY id")).rows;
      const questions = before.questions.map(input);
      questions[0].name = "Next catalogue wording";
      questions[1].isIncluded = false;
      questions.push({ ...input(before.questions[0]), id: undefined, name: "Added standard question" });
      const [saved, created] = await Promise.all([
        request(app).put(path).send({ expectedVersion: before.version, questions }),
        request(app).post("/api/assessments").send({ companyId: 1, name: "QA TEST - Catalogue race" }),
      ]);
      expect(saved.status, saved.text).toBe(200);
      expect(created.status, created.text).toBe(201);
      const names = (set: any[]) => set.filter(q => q.isIncluded).map(q => q.name).sort();
      const createdSet = (await request(app).get(`/api/assessments/${created.body.id}/questions`).expect(200)).body;
      expect([names(before.questions), names(saved.body.questions)]).toContainEqual(names(createdSet.questions));
      const next = await request(app).post("/api/assessments").send({ companyId: 2, name: "QA TEST - Latest catalogue" }).expect(201);
      expect(names((await request(app).get(`/api/assessments/${next.body.id}/questions`).expect(200)).body.questions)).toEqual(names(saved.body.questions));
      expect((await pool.query("SELECT * FROM assessment_questions WHERE assessment_id IN (1,2) ORDER BY id")).rows).toEqual(historical);
      expect((await pool.query("SELECT * FROM scores ORDER BY id")).rows).toEqual(scores);
      expect((await pool.query("SELECT * FROM criterion_notes ORDER BY id")).rows).toEqual(notes);
      expect((await pool.query("SELECT count(*)::int n FROM criteria WHERE is_included=false")).rows[0].n).toBe(1);
      expect((await pool.query("SELECT company_id, metadata FROM audit_logs WHERE event_type='catalogue.questions_changed'")).rows.every(row => row.company_id === null && !JSON.stringify(row.metadata).includes("Next catalogue wording"))).toBe(true);
    });

    it("serializes concurrent editors and rolls back question saves when auditing fails", async () => {
      const set = await request(app).get("/api/assessments/2/questions");
      expect(set.status, set.text).toBe(200);
      const body = {
        expectedQuestionsVersion: 1,
        questions: set.body.questions.map(input),
      };
      body.questions[0].name = "Concurrent edit";
      const results = await Promise.all([
        request(app).put("/api/assessments/2/questions").send(body),
        request(app).put("/api/assessments/2/questions").send(body),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const saved = await request(app).get("/api/assessments/2/questions");
      expect(saved.body.version).toBe(2);
      await pool.query(`CREATE FUNCTION qa_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA forced audit failure'; END $$;
      CREATE TRIGGER qa_reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION qa_reject_audit();`);
      try {
        const fail = await request(app)
          .put("/api/assessments/2/questions")
          .send({
            expectedQuestionsVersion: 2,
            questions: saved.body.questions.map((q: any) => ({
              ...input(q),
              name: "Must roll back",
            })),
          });
        expect(fail.status).toBe(500);
        const unchanged = await request(app).get(
          "/api/assessments/2/questions",
        );
        expect(unchanged.body.signature).toBe(saved.body.signature);
        expect(unchanged.body.version).toBe(2);
      } finally {
        await pool.query(
          "DROP TRIGGER qa_reject_audit ON audit_logs; DROP FUNCTION qa_reject_audit();",
        );
      }
      await pool.query(
        `BEGIN; ${sql("0006_backfill_assessment_questions.sql")} COMMIT;`,
      );
      expect(
        (await request(app).get("/api/assessments/2/questions")).body.signature,
      ).toBe(saved.body.signature);
    });

    it("serializes score/evidence writes against unlocking and editing", async () => {
      const revision = await request(app).post("/api/assessments/1/revisions").send({ name: "QA TEST - Response race", expectedQuestionsVersion: 1 });
      expect(revision.status).toBe(201);
      const id = revision.body.id;
      let set = (await request(app).get(`/api/assessments/${id}/questions`)).body;
      const results = await Promise.all([
        request(app).post("/api/assessment-criterion-notes").send({ assessmentId: id, assessmentQuestionId: set.questions[0].id, questionsVersion: set.version, note: "Race evidence" }),
        request(app).put(`/api/assessments/${id}/questions`).send({ expectedQuestionsVersion: set.version, questions: set.questions.map((q: any) => ({ ...input(q), name: "Race wording" })) }),
      ]);
      expect(results.filter(r => r.status === 409)).toHaveLength(1);
      expect(results.filter(r => r.status === 200 || r.status === 201)).toHaveLength(1);
      const scoreRevision = await request(app).post("/api/assessments/1/revisions").send({ name: "QA TEST - Score race", expectedQuestionsVersion: 1 });
      const scoreId = scoreRevision.body.id;
      set = (await request(app).get(`/api/assessments/${scoreId}/questions`)).body;
      await request(app).patch(`/api/assessments/${scoreId}`).send({ status: "active", expectedQuestionsVersion: set.version }).expect(200);
      const race = await Promise.all([
        request(app).post("/api/scores").send({ assessmentId: scoreId, questionsVersion: set.version, scores: [{ assessmentQuestionId: set.questions[0].id, score: 3 }] }),
        request(app).patch(`/api/assessments/${scoreId}`).send({ status: "draft", expectedQuestionsVersion: set.version }),
      ]);
      expect(race.filter(r => r.status === 200)).toHaveLength(1);
      const after = (await request(app).get(`/api/assessments/${scoreId}/questions`)).body;
      const count = (await pool.query("SELECT count(*)::int n FROM scores WHERE assessment_id=$1", [scoreId])).rows[0].n;
      expect(after.canEdit ? count === 0 : count === 1).toBe(true);
    });

    it("serializes activation against edits and prevents changes after activation", async () => {
      const set = await request(app).get("/api/assessments/2/questions");
      const requests = await Promise.all([
        request(app)
          .patch("/api/assessments/2")
          .send({
            status: "active",
            expectedQuestionsVersion: set.body.version,
          }),
        request(app)
          .put("/api/assessments/2/questions")
          .send({
            expectedQuestionsVersion: set.body.version,
            questions: set.body.questions.map((q: any) => ({
              ...input(q),
              name: "Race edit",
            })),
          }),
      ]);
      expect(requests.map((r) => r.status).sort()).toEqual([200, 409]);
      const latest = await request(app).get("/api/assessments/2/questions");
      await request(app)
        .patch("/api/assessments/2")
        .send({
          status: "active",
          expectedQuestionsVersion: latest.body.version,
        })
        .expect(200);
      await request(app)
        .put("/api/assessments/2/questions")
        .send({
          expectedQuestionsVersion: latest.body.version,
          questions: latest.body.questions.map(input),
        })
        .expect(409);
    });
  },
);
