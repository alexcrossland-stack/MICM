import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app";
import { sanitizeAuditMetadata } from "../lib/audit";
import { composeCompanyReport } from "../lib/reportComposition";

type Row = Record<string, any>;
type TableRef = { __name: string; [key: string]: any };
type ColumnRef = { table: string; name: string };
type Predicate =
  | { kind: "eq"; column: ColumnRef; value: any }
  | { kind: "and"; predicates: Predicate[] }
  | { kind: "inArray"; column: ColumnRef; values: any[] }
  | { kind: "notEq"; column: ColumnRef; value: any };

const mock = vi.hoisted(() => {
  type Rows = Record<string, Row[]>;

  const makeColumn = (tableName: string, name: string): ColumnRef => ({ table: tableName, name });
  const makeTable = (tableName: string, columns: string[]): TableRef => {
    const table: TableRef = { __name: tableName };
    for (const column of columns) table[column] = makeColumn(tableName, column);
    return table;
  };

  const tables = {
    companiesTable: makeTable("companies", [
      "id",
      "name",
      "sector",
      "size",
      "contactEmail",
      "currentStatusDescription",
      "currentChallenges",
      "isActive",
      "createdAt",
      "updatedAt",
    ]),
    usersTable: makeTable("users", [
      "id",
      "clerkUserId",
      "email",
      "firstName",
      "lastName",
      "role",
      "companyId",
      "isActive",
      "createdAt",
      "updatedAt",
    ]),
    invitationsTable: makeTable("invitations", ["id"]),
    domainsTable: makeTable("domains", ["id", "name", "description", "orderIndex"]),
    categoriesTable: makeTable("categories", ["id", "domainId", "name", "description", "orderIndex"]),
    criteriaTable: makeTable("criteria", [
      "id",
      "categoryId",
      "name",
      "description",
      "baselineDescription",
      "excellenceDescription",
      "orderIndex",
    ]),
    assessmentCyclesTable: makeTable("assessmentCycles", [
      "id",
      "companyId",
      "name",
      "description",
      "status",
      "startDate",
      "endDate",
      "createdAt",
      "updatedAt",
    ]),
    assessmentAssigneesTable: makeTable("assessmentAssignees", [
      "id",
      "assessmentId",
      "userId",
      "completedAt",
      "createdAt",
    ]),
    scoresTable: makeTable("scores", [
      "id",
      "assessmentId",
      "userId",
      "criterionId",
      "score",
      "notes",
      "createdAt",
      "updatedAt",
    ]),
    criterionNotesTable: makeTable("criterionNotes", [
      "id",
      "companyId",
      "assessmentId",
      "criterionId",
      "authorUserId",
      "note",
      "createdAt",
      "updatedAt",
    ]),
    actionsTable: makeTable("actions", [
      "id",
      "companyId",
      "assessmentId",
      "domainId",
      "title",
      "description",
      "status",
      "priority",
      "assignedUserId",
      "dueDate",
      "completedDate",
      "createdAt",
      "updatedAt",
    ]),
    maturityTargetsTable: makeTable("maturityTargets", [
      "id",
      "companyId",
      "domainId",
      "targetScore",
      "targetDate",
      "notes",
      "createdAt",
      "updatedAt",
    ]),
    auditLogsTable: makeTable("auditLogs", [
      "id",
      "actorUserId",
      "actorClerkUserId",
      "actorRole",
      "companyId",
      "eventType",
      "targetType",
      "targetId",
      "metadata",
      "createdAt",
    ]),
  };

  const now = new Date("2026-01-01T00:00:00.000Z");
  const state: { authUserId: string; rows: Rows; nextIds: Record<string, number>; dbHealthy: boolean } = {
    authUserId: "clerk-super",
    rows: {},
    nextIds: {},
    dbHealthy: true,
  };

  const cloneDate = (date: Date) => new Date(date.toISOString());
  const dated = (row: Row) => ({ createdAt: cloneDate(now), updatedAt: cloneDate(now), ...row });

  function seedRows(): Rows {
    return {
      companies: [
        dated({
          id: 1,
          name: "Acme Precision",
          sector: "Manufacturing",
          size: "51-200",
          contactEmail: "admin@acme.test",
          currentStatusDescription: "Scaling output with pressure on cash and delivery.",
          currentChallenges: ["Cash flow pressure", "Production under-utilisation"],
          isActive: true,
        }),
        dated({
          id: 2,
          name: "Beta Fabrication",
          sector: "Manufacturing",
          size: "11-50",
          contactEmail: "admin@beta.test",
          currentStatusDescription: "Stabilising workforce capacity and shop-floor flow.",
          currentChallenges: ["Labour and skills shortages", "Production under-utilisation"],
          isActive: true,
        }),
      ],
      users: [
        dated({ id: 1, clerkUserId: "clerk-super", email: "super@example.test", firstName: "Super", lastName: "Admin", role: "super_admin", companyId: null, isActive: true }),
        dated({ id: 2, clerkUserId: "clerk-admin-a", email: "admin-a@example.test", firstName: "Admin", lastName: "A", role: "company_admin", companyId: 1, isActive: true }),
        dated({ id: 3, clerkUserId: "clerk-user-a", email: "user-a@example.test", firstName: "User", lastName: "A", role: "company_user", companyId: 1, isActive: true }),
        dated({ id: 4, clerkUserId: "clerk-admin-b", email: "admin-b@example.test", firstName: "Admin", lastName: "B", role: "company_admin", companyId: 2, isActive: true }),
        dated({ id: 5, clerkUserId: "clerk-user-b", email: "user-b@example.test", firstName: "User", lastName: "B", role: "company_user", companyId: 2, isActive: true }),
      ],
      domains: [
        { id: 1, name: "Strategy", description: "Strategy domain", orderIndex: 1 },
        { id: 2, name: "Operations", description: "Operations domain", orderIndex: 2 },
      ],
      categories: [
        { id: 1, domainId: 1, name: "Planning", description: "Planning", orderIndex: 1 },
        { id: 2, domainId: 2, name: "Execution", description: "Execution", orderIndex: 2 },
      ],
      criteria: [
        { id: 1, categoryId: 1, name: "Strategy criterion 1", description: "Criterion", baselineDescription: "Baseline", excellenceDescription: "Excellence", orderIndex: 1 },
        { id: 2, categoryId: 1, name: "Strategy criterion 2", description: "Criterion", baselineDescription: "Baseline", excellenceDescription: "Excellence", orderIndex: 2 },
        { id: 3, categoryId: 2, name: "Operations criterion 1", description: "Criterion", baselineDescription: "Baseline", excellenceDescription: "Excellence", orderIndex: 3 },
      ],
      assessmentCycles: [
        dated({ id: 101, companyId: 1, name: "A Draft", description: "Draft cycle", status: "draft", startDate: null, endDate: null }),
        dated({ id: 102, companyId: 1, name: "A Active", description: "Active cycle", status: "active", startDate: null, endDate: null }),
        dated({ id: 103, companyId: 1, name: "A Complete", description: "Completed cycle", status: "completed", startDate: null, endDate: null }),
        dated({ id: 201, companyId: 2, name: "B Active", description: "Other tenant cycle", status: "active", startDate: null, endDate: null }),
        dated({ id: 202, companyId: 2, name: "B Complete", description: "Other tenant completed cycle", status: "completed", startDate: null, endDate: null }),
      ],
      assessmentAssignees: [
        { id: 1, assessmentId: 102, userId: 3, completedAt: null, createdAt: cloneDate(now) },
        { id: 2, assessmentId: 103, userId: 3, completedAt: cloneDate(now), createdAt: cloneDate(now) },
        { id: 3, assessmentId: 201, userId: 5, completedAt: null, createdAt: cloneDate(now) },
        { id: 4, assessmentId: 202, userId: 5, completedAt: cloneDate(now), createdAt: cloneDate(now) },
      ],
      scores: [
        dated({ id: 1, assessmentId: 103, userId: 3, criterionId: 1, score: 3, notes: "Done" }),
        dated({ id: 2, assessmentId: 103, userId: 3, criterionId: 2, score: 3, notes: "Done" }),
        dated({ id: 3, assessmentId: 103, userId: 3, criterionId: 3, score: 4, notes: "Done" }),
        dated({ id: 4, assessmentId: 202, userId: 5, criterionId: 1, score: 1, notes: "Other" }),
        dated({ id: 5, assessmentId: 202, userId: 5, criterionId: 2, score: 2, notes: "Other" }),
        dated({ id: 6, assessmentId: 202, userId: 5, criterionId: 3, score: 2, notes: "Other" }),
      ],
      criterionNotes: [
        dated({ id: 1, companyId: 1, assessmentId: 103, criterionId: 1, authorUserId: 2, note: "Customer evidence reviewed" }),
        dated({ id: 2, companyId: 2, assessmentId: 202, criterionId: 1, authorUserId: 4, note: "Beta evidence note" }),
      ],
      actions: [
        dated({ id: 1, companyId: 1, assessmentId: 103, domainId: 1, title: "A action", description: "Action", status: "not_started", priority: "medium", assignedUserId: 3, dueDate: null, completedDate: null }),
        dated({ id: 2, companyId: 2, assessmentId: 202, domainId: 2, title: "B action", description: "Action", status: "in_progress", priority: "high", assignedUserId: 5, dueDate: null, completedDate: null }),
      ],
      maturityTargets: [
        dated({ id: 1, companyId: 1, domainId: 1, targetScore: 3, targetDate: null, notes: "Target" }),
        dated({ id: 2, companyId: 2, domainId: 2, targetScore: 4, targetDate: null, notes: "Target" }),
      ],
      invitations: [],
      auditLogs: [],
    };
  }

  function reset() {
    state.authUserId = "clerk-super";
    state.dbHealthy = true;
    state.rows = seedRows();
    state.nextIds = Object.fromEntries(
      Object.entries(state.rows).map(([name, rows]) => [name, Math.max(0, ...rows.map((row) => row.id ?? 0)) + 1]),
    );
  }

  function compareValues(left: any, right: any) {
    if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
    if (left instanceof Date) return left.getTime() - new Date(right).getTime();
    if (right instanceof Date) return new Date(left).getTime() - right.getTime();
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function matches(row: Row, predicate?: Predicate): boolean {
    if (!predicate) return true;
    if (predicate.kind === "eq") return row[predicate.column.name] === predicate.value;
    if (predicate.kind === "and") return predicate.predicates.every((item) => matches(row, item));
    if (predicate.kind === "inArray") return predicate.values.includes(row[predicate.column.name]);
    if (predicate.kind === "notEq") return row[predicate.column.name] !== predicate.value;
    return true;
  }

  function projectRow(row: Row, selection: any): Row {
    if (!selection) return row;
    const projected: Row = {};
    for (const [key, value] of Object.entries(selection)) {
      const column = value as ColumnRef | { kind: string };
      if ("kind" in column && column.kind === "count") continue;
      projected[key] = row[(column as ColumnRef).name];
    }
    return projected;
  }

  class SelectBuilder {
    private tableName = "";
    private predicate: Predicate | undefined;
    private order: any;
    private limitCount: number | undefined;

    constructor(private selection?: any) {}

    from(table: TableRef) {
      this.tableName = table.__name;
      return this;
    }

    where(predicate: Predicate) {
      this.predicate = predicate;
      return this;
    }

    orderBy(order: any) {
      this.order = order;
      return this;
    }

    limit(count: number) {
      this.limitCount = count;
      return this;
    }

    execute() {
      let rows = [...(state.rows[this.tableName] ?? [])].filter((row) => matches(row, this.predicate));
      if (this.order) {
        const column = this.order.kind === "orderDesc" ? this.order.column : this.order;
        rows.sort((a, b) => compareValues(a[column.name], b[column.name]));
        if (this.order.kind === "orderDesc") rows.reverse();
      }
      if (this.limitCount != null) rows = rows.slice(0, this.limitCount);
      if (this.selection && Object.values(this.selection).some((value: any) => value.kind === "count")) {
        return [{ count: rows.length }];
      }
      return rows.map((row) => projectRow(row, this.selection));
    }

    then<TResult1 = Row[], TResult2 = never>(
      onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }
  }

  class InsertBuilder {
    private input: Row | Row[] = {};
    private insertedRows: Row[] | undefined;

    constructor(private table: TableRef) {}

    values(value: Row | Row[]) {
      this.input = value;
      return this;
    }

    private execute() {
      if (this.insertedRows) return this.insertedRows;
      const tableName = this.table.__name;
      const values = Array.isArray(this.input) ? this.input : [this.input];
      this.insertedRows = values.map((value) => {
        const row = {
          id: state.nextIds[tableName]++,
          createdAt: cloneDate(now),
          updatedAt: cloneDate(now),
          ...value,
        };
        if (tableName === "assessmentCycles" && row.status == null) row.status = "draft";
        if (tableName === "assessmentAssignees" && row.completedAt == null) row.completedAt = null;
        if (tableName === "actions") {
          if (row.status == null) row.status = "not_started";
          if (row.priority == null) row.priority = "medium";
          if (row.completedDate == null) row.completedDate = null;
        }
        state.rows[tableName].push(row);
        return row;
      });
      return this.insertedRows;
    }

    returning() {
      return Promise.resolve(this.execute());
    }

    then<TResult1 = Row[], TResult2 = never>(
      onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }
  }

  class UpdateBuilder {
    private updates: Row = {};
    private predicate: Predicate | undefined;
    private updatedRows: Row[] | undefined;

    constructor(private table: TableRef) {}

    set(updates: Row) {
      this.updates = updates;
      return this;
    }

    where(predicate: Predicate) {
      this.predicate = predicate;
      return this;
    }

    private execute() {
      if (this.updatedRows) return this.updatedRows;
      const rows = state.rows[this.table.__name] ?? [];
      this.updatedRows = rows
        .filter((row) => matches(row, this.predicate))
        .map((row) => {
          Object.assign(row, this.updates, { updatedAt: cloneDate(now) });
          return row;
        });
      return this.updatedRows;
    }

    returning() {
      return Promise.resolve(this.execute());
    }

    then<TResult1 = Row[], TResult2 = never>(
      onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }
  }

  class DeleteBuilder {
    constructor(private table: TableRef) {}

    where(predicate: Predicate) {
      const rows = state.rows[this.table.__name] ?? [];
      const remaining = rows.filter((row) => !matches(row, predicate));
      state.rows[this.table.__name] = remaining;
      return Promise.resolve([]);
    }
  }

  const db = {
    select: (selection?: any) => new SelectBuilder(selection),
    insert: (table: TableRef) => new InsertBuilder(table),
    update: (table: TableRef) => new UpdateBuilder(table),
    delete: (table: TableRef) => new DeleteBuilder(table),
  };
  const pool = {
    query: vi.fn(async () => {
      if (!state.dbHealthy) throw new Error("database unavailable");
      return { rows: [{ result: 1 }] };
    }),
  };

  const eq = (column: ColumnRef, value: any): Predicate => ({ kind: "eq", column, value });
  const and = (...predicates: Predicate[]): Predicate => ({ kind: "and", predicates });
  const inArray = (column: ColumnRef, values: any[]): Predicate => ({ kind: "inArray", column, values });
  const count = () => ({ kind: "count" });
  const sql = (strings: TemplateStringsArray, ...values: any[]) => {
    const text = String.raw({ raw: strings }, ...values.map((value) => value?.name ?? ""));
    if (text.includes("!=")) return { kind: "notEq", column: values[0], value: "completed" };
    if (text.includes("desc")) return { kind: "orderDesc", column: values[0] };
    return { kind: "raw", text };
  };

  reset();

  return { state, reset, tables, db, pool, eq, and, inArray, count, sql };
});

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: any, _res: any, next: () => void) => next(),
  getAuth: () => ({ userId: mock.state.authUserId }),
}));

vi.mock("drizzle-orm", () => ({
  eq: mock.eq,
  and: mock.and,
  inArray: mock.inArray,
  count: mock.count,
  sql: mock.sql,
}));

vi.mock("@workspace/db", () => ({
  db: mock.db,
  pool: mock.pool,
  ...mock.tables,
}));

function signInAs(clerkUserId: string) {
  mock.state.authUserId = clerkUserId;
}

describe("health checks", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("reports healthy database connectivity without exposing sensitive configuration", async () => {
    mock.state.dbHealthy = true;
    process.env.GITHUB_SHA = "abcdef1234567890abcdef1234567890abcdef12";

    const response = await request(app).get("/api/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      commit: "abcdef123456",
      database: { status: "ok" },
    });
    expect(response.body.checkedAt).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(response.body)).not.toContain("postgres");

    delete process.env.GITHUB_SHA;
  });

  it("reports degraded status when the database ping fails", async () => {
    mock.state.dbHealthy = false;

    const response = await request(app).get("/api/healthz");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: "degraded",
      database: { status: "degraded" },
    });
  });
});

describe("tenant isolation and role permissions", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("allows only Super Admins to list all companies", async () => {
    signInAs("clerk-super");
    const superAdminResponse = await request(app).get("/api/companies");
    expect(superAdminResponse.status).toBe(200);
    expect(superAdminResponse.body.map((company: any) => company.id)).toEqual([1, 2]);

    signInAs("clerk-admin-a");
    expect((await request(app).get("/api/companies")).status).toBe(403);

    signInAs("clerk-user-a");
    expect((await request(app).get("/api/companies")).status).toBe(403);
  });

  it("filters assessment listings for Company Admins and Company Users to their own company", async () => {
    signInAs("clerk-admin-a");
    const adminResponse = await request(app).get("/api/assessments").query({ companyId: 2 });
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.map((assessment: any) => assessment.companyId)).toEqual([1, 1, 1]);

    signInAs("clerk-user-a");
    const userResponse = await request(app).get("/api/assessments").query({ companyId: 2 });
    expect(userResponse.status).toBe(200);
    expect(userResponse.body.map((assessment: any) => assessment.companyId)).toEqual([1, 1, 1]);
  });

  it("blocks cross-company reads and mutations for Company Admins and Company Users", async () => {
    signInAs("clerk-admin-a");
    expect((await request(app).get("/api/companies/2")).status).toBe(403);
    expect((await request(app).patch("/api/assessments/201").send({ status: "completed" })).status).toBe(403);
    expect((await request(app).post("/api/assessments").send({ companyId: 2, name: "Cross-company draft" })).status).toBe(403);
    expect((await request(app).post("/api/assessments/201/assign").send({ userIds: [3] })).status).toBe(403);
    expect((await request(app).get("/api/actions/2")).status).toBe(403);

    signInAs("clerk-user-a");
    expect((await request(app).get("/api/assessments/201")).status).toBe(403);
    expect((await request(app).post("/api/scores").send({ assessmentId: 201, scores: [{ criterionId: 1, score: 2 }] })).status).toBe(403);
  });

  it("prevents assigning users from another company to an assessment", async () => {
    signInAs("clerk-admin-a");
    const response = await request(app).post("/api/assessments/102/assign").send({ userIds: [5] });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("assessment company");
  });
});

describe("company info", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("rejects unknown current challenge values", async () => {
    signInAs("clerk-admin-a");
    const response = await request(app)
      .patch("/api/companies/1")
      .send({ currentChallenges: ["Production under-utilisation", "Not a controlled challenge"] });

    expect(response.status).toBe(400);
  });

  it("allows Super Admins to view and update any company info", async () => {
    signInAs("clerk-super");

    const readResponse = await request(app).get("/api/companies/2");
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.currentChallenges).toContain("Production under-utilisation");

    const updateResponse = await request(app)
      .patch("/api/companies/2")
      .send({
        currentStatusDescription: "Super Admin updated current status.",
        currentChallenges: ["Long lead times", "Production under-utilisation"],
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.currentStatusDescription).toBe("Super Admin updated current status.");
    expect(updateResponse.body.currentChallenges).toEqual(["Long lead times", "Production under-utilisation"]);
  });

  it("allows Company Admins to update only their own company info and records audit events", async () => {
    signInAs("clerk-admin-a");

    const updateResponse = await request(app)
      .patch("/api/companies/1")
      .send({
        currentStatusDescription: "Company Admin updated current status.",
        currentChallenges: ["Cash flow pressure", "Long lead times"],
      });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.currentStatusDescription).toBe("Company Admin updated current status.");
    expect(updateResponse.body.currentChallenges).toEqual(["Cash flow pressure", "Long lead times"]);

    expect(
      (await request(app).patch("/api/companies/2").send({ currentChallenges: ["Long lead times"] })).status,
    ).toBe(403);

    signInAs("clerk-super");
    const auditResponse = await request(app).get("/api/audit-logs").query({ companyId: 1 });
    expect(auditResponse.status).toBe(200);
    expect(auditResponse.body.map((entry: any) => entry.eventType)).toEqual(
      expect.arrayContaining([
        "company.updated",
        "company_info.status_description_updated",
        "company_info.challenges_updated",
      ]),
    );
    expect(JSON.stringify(auditResponse.body)).not.toContain("Company Admin updated current status.");
  });

  it("allows Company Users to view their own company info but not update it", async () => {
    signInAs("clerk-user-a");

    const readResponse = await request(app).get("/api/companies/1");
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.currentStatusDescription).toContain("Scaling output");
    expect(readResponse.body.currentChallenges).toContain("Cash flow pressure");

    const updateResponse = await request(app)
      .patch("/api/companies/1")
      .send({ currentStatusDescription: "Company User should not be able to write" });
    expect(updateResponse.status).toBe(403);
  });
});

describe("assessment lifecycle", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("covers draft creation, activation, scoring, completion tracking, and final completion", async () => {
    signInAs("clerk-admin-a");
    const createResponse = await request(app)
      .post("/api/assessments")
      .send({ companyId: 1, name: "Lifecycle Assessment", description: "Safety test" });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.status).toBe("draft");
    const assessmentId = createResponse.body.id;

    await request(app).post(`/api/assessments/${assessmentId}/assign`).send({ userIds: [3] }).expect(200);

    signInAs("clerk-user-a");
    const draftScoreResponse = await request(app)
      .post("/api/scores")
      .send({ assessmentId, scores: [{ criterionId: 1, score: 2 }] });
    expect(draftScoreResponse.status).toBe(400);
    expect(draftScoreResponse.body.error).toContain("not active");

    signInAs("clerk-admin-a");
    const activateResponse = await request(app).patch(`/api/assessments/${assessmentId}`).send({ status: "active" });
    expect(activateResponse.status).toBe(200);
    expect(activateResponse.body.status).toBe("active");

    signInAs("clerk-user-a");
    const invalidScoreResponse = await request(app)
      .post("/api/scores")
      .send({ assessmentId, scores: [{ criterionId: 1, score: 5, notes: "Invalid" }] });
    expect(invalidScoreResponse.status).toBe(400);

    const partialScoreResponse = await request(app)
      .post("/api/scores")
      .send({ assessmentId, scores: [{ criterionId: 1, score: 2, notes: "Partial" }] });
    expect(partialScoreResponse.status).toBe(200);

    const afterPartial = await request(app).get(`/api/assessments/${assessmentId}`);
    expect(afterPartial.body.completedUserIds).toEqual([]);

    signInAs("clerk-admin-a");
    const incompleteCompleteResponse = await request(app).patch(`/api/assessments/${assessmentId}`).send({ status: "completed" });
    expect(incompleteCompleteResponse.status).toBe(400);
    expect(incompleteCompleteResponse.body.error).toContain("required scores");
    expect(incompleteCompleteResponse.body.missingSections.map((section: any) => `${section.domainName}/${section.categoryName}`)).toEqual([
      "Strategy/Planning",
      "Operations/Execution",
    ]);

    signInAs("clerk-user-a");
    const fullScoreResponse = await request(app).post("/api/scores").send({
      assessmentId,
      scores: [
        { criterionId: 1, score: 3, notes: "Updated" },
        { criterionId: 2, score: 3, notes: "Complete" },
        { criterionId: 3, score: 4, notes: "Complete" },
      ],
    });
    expect(fullScoreResponse.status).toBe(200);
    expect(fullScoreResponse.body).toHaveLength(3);

    const afterCompleteScores = await request(app).get(`/api/assessments/${assessmentId}`);
    expect(afterCompleteScores.body.completedUserIds).toEqual([3]);

    signInAs("clerk-admin-a");
    const completeResponse = await request(app).patch(`/api/assessments/${assessmentId}`).send({ status: "completed" });
    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.status).toBe("completed");

    signInAs("clerk-user-a");
    expect(
      (await request(app).post("/api/scores").send({ assessmentId, scores: [{ criterionId: 1, score: 4 }] })).status,
    ).toBe(400);
  });
});

describe("criterion evidence notes", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("allows same-company admins and assigned users to create and list criterion notes", async () => {
    signInAs("clerk-admin-a");
    const adminCreateResponse = await request(app)
      .post("/api/assessment-criterion-notes")
      .send({ assessmentId: 103, criterionId: 1, note: "  Board pack evidence attached offline  " });
    expect(adminCreateResponse.status).toBe(201);
    expect(adminCreateResponse.body).toMatchObject({
      companyId: 1,
      assessmentId: 103,
      criterionId: 1,
      authorUserId: 2,
      authorName: "Admin A",
      note: "Board pack evidence attached offline",
    });

    const adminListResponse = await request(app)
      .get("/api/assessment-criterion-notes")
      .query({ assessmentId: 103, criterionId: 1 });
    expect(adminListResponse.status).toBe(200);
    expect(adminListResponse.body.map((note: any) => note.note)).toEqual([
      "Customer evidence reviewed",
      "Board pack evidence attached offline",
    ]);

    signInAs("clerk-user-a");
    const userCreateResponse = await request(app)
      .post("/api/assessment-criterion-notes")
      .send({ assessmentId: 102, criterionId: 2, note: "Operator interview evidence" });
    expect(userCreateResponse.status).toBe(201);
    expect(userCreateResponse.body).toMatchObject({
      companyId: 1,
      assessmentId: 102,
      criterionId: 2,
      authorUserId: 3,
      authorName: "User A",
    });

    const userListResponse = await request(app)
      .get("/api/assessment-criterion-notes")
      .query({ assessmentId: 102 });
    expect(userListResponse.status).toBe(200);
    expect(userListResponse.body.map((note: any) => note.note)).toEqual(["Operator interview evidence"]);
  });

  it("blocks cross-company and unassigned criterion note access", async () => {
    signInAs("clerk-admin-a");
    expect((await request(app).get("/api/assessment-criterion-notes").query({ assessmentId: 202 })).status).toBe(403);
    expect(
      (await request(app)
        .post("/api/assessment-criterion-notes")
        .send({ assessmentId: 202, criterionId: 1, note: "Cross-company note" })).status,
    ).toBe(403);

    signInAs("clerk-user-a");
    expect(
      (await request(app)
        .post("/api/assessment-criterion-notes")
        .send({ assessmentId: 101, criterionId: 1, note: "Unassigned note" })).status,
    ).toBe(403);

    signInAs("clerk-user-b");
    expect((await request(app).get("/api/assessment-criterion-notes").query({ assessmentId: 103 })).status).toBe(403);

    signInAs("clerk-super");
    const superAdminResponse = await request(app).get("/api/assessment-criterion-notes").query({ assessmentId: 202 });
    expect(superAdminResponse.status).toBe(200);
    expect(superAdminResponse.body.map((note: any) => note.companyId)).toEqual([2]);
  });

  it("surfaces criterion notes in assessment results and report composition", async () => {
    signInAs("clerk-admin-a");

    const resultsResponse = await request(app).get("/api/assessments/103/results");
    expect(resultsResponse.status).toBe(200);
    expect(resultsResponse.body.criterionNotes).toHaveLength(1);
    expect(resultsResponse.body.criterionNotes[0]).toMatchObject({
      companyId: 1,
      assessmentId: 103,
      criterionId: 1,
      authorName: "Admin A",
      note: "Customer evidence reviewed",
    });

    const reportResponse = await request(app).get("/api/reports/company/1");
    expect(reportResponse.status).toBe(200);
    expect(reportResponse.body.criterionNotes).toHaveLength(1);

    const composition = composeCompanyReport(reportResponse.body, "operational_detail", "company_admin");
    expect(composition.coverSummary.evidenceNotes).toBe(1);
    expect(composition.executiveSummary.bullets).toContain("1 criterion evidence note is available for review context.");
  });
});

describe("dashboard, report, and analytics smoke coverage", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("smoke-tests company-scoped dashboard and report endpoints", async () => {
    signInAs("clerk-admin-a");

    const dashboardResponse = await request(app).get("/api/companies/1/dashboard");
    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.body.companyId).toBe(1);
    expect(dashboardResponse.body.totalAssessments).toBe(3);

    expect((await request(app).get("/api/companies/2/dashboard")).status).toBe(403);

    const companyReportResponse = await request(app).get("/api/reports/company/1");
    expect(companyReportResponse.status).toBe(200);
    expect(companyReportResponse.body.company.id).toBe(1);

    const exportResponse = await request(app).get("/api/reports/company/1/export").query({ format: "csv" });
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    expect(exportResponse.headers["content-disposition"]).toContain("acme-precision-board-ready-report.csv");
    expect(exportResponse.text).toContain("template,section,company_id,company_name,item_id,item_name,item_date");
    expect(exportResponse.text).toContain("board_ready,company_info,1,Acme Precision,,Current Status Description");
    expect(exportResponse.text).toContain("Production under-utilisation");
    expect(exportResponse.text).toContain("board_ready,domain_findings,1,Acme Precision");
    expect(exportResponse.text).toContain("1,Strategy,3,Developing,3.5");

    const workbookResponse = await request(app)
      .get("/api/reports/company/1/export")
      .query({ format: "xlsx", template: "operational_detail" })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(workbookResponse.status).toBe(200);
    expect(workbookResponse.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(workbookResponse.headers["content-disposition"]).toContain("acme-precision-operational-detail-report.xlsx");
    expect(workbookResponse.body.subarray(0, 2).toString("utf8")).toBe("PK");
    const workbookText = workbookResponse.body.toString("utf8");
    expect(workbookText).toContain("Summary");
    expect(workbookText).toContain("Company Info");
    expect(workbookText).toContain("Production under-utilisation");
    expect(workbookText).toContain("Domain Scores");
    expect(workbookText).toContain("Actions");
    expect(workbookText).toContain("Strategy");
    expect(workbookText).toContain("A action");

    expect((await request(app).get("/api/reports/company/2")).status).toBe(403);
    expect((await request(app).get("/api/reports/company/2/export").query({ format: "csv" })).status).toBe(403);

    signInAs("clerk-user-a");
    expect((await request(app).get("/api/reports/company/1/export").query({ format: "csv" })).status).toBe(403);
  });

  it("supports report template selection and rejects unsupported export options", async () => {
    signInAs("clerk-admin-a");

    const operationalResponse = await request(app)
      .get("/api/reports/company/1/export")
      .query({ format: "csv", template: "operational_detail" });
    expect(operationalResponse.status).toBe(200);
    expect(operationalResponse.headers["content-disposition"]).toContain("operational-detail-report.csv");
    expect(operationalResponse.text).toContain("operational_detail,action_roadmap");

    const executiveResponse = await request(app)
      .get("/api/reports/company/1/export")
      .query({ format: "csv", template: "executive_summary" });
    expect(executiveResponse.status).toBe(200);
    expect(executiveResponse.headers["content-disposition"]).toContain("executive-summary-only.csv");
    expect(executiveResponse.text).not.toContain("action_roadmap");

    expect((await request(app).get("/api/reports/company/1/export").query({ format: "xls" })).status).toBe(400);
    expect((await request(app).get("/api/reports/company/1/export").query({ template: "weekly" })).status).toBe(400);
  });

  it("smoke-tests Super Admin reporting and cross-company radar endpoints", async () => {
    signInAs("clerk-super");

    const superReportResponse = await request(app).get("/api/reports/superadmin");
    expect(superReportResponse.status).toBe(200);
    expect(superReportResponse.body.totalCompanies).toBe(2);
    expect(superReportResponse.body.companyInfo).toEqual([
      expect.objectContaining({
        companyId: 1,
        companyName: "Acme Precision",
        currentStatusDescription: "Scaling output with pressure on cash and delivery.",
        currentChallenges: ["Cash flow pressure", "Production under-utilisation"],
        challengeCount: 2,
      }),
      expect.objectContaining({
        companyId: 2,
        companyName: "Beta Fabrication",
        currentChallenges: ["Labour and skills shortages", "Production under-utilisation"],
        challengeCount: 2,
      }),
    ]);
    expect(superReportResponse.body.mostCommonChallenges[0]).toEqual({
      challenge: "Production under-utilisation",
      companyCount: 2,
    });
    expect(
      superReportResponse.body.companiesByChallenge.find((group: any) => group.challenge === "Production under-utilisation").companies,
    ).toHaveLength(2);

    const radarResponse = await request(app).get("/api/reports/cross-company-radar").query({ companyIds: "1,2" });
    expect(radarResponse.status).toBe(200);
    expect(radarResponse.body.series.map((series: any) => series.label)).toEqual(["Acme Precision", "Beta Fabrication"]);

    const pdfExportResponse = await request(app)
      .get("/api/reports/company/2/export")
      .query({ format: "pdf", template: "board_ready" })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(pdfExportResponse.status).toBe(200);
    expect(pdfExportResponse.headers["content-type"]).toContain("application/pdf");
    expect(pdfExportResponse.headers["content-disposition"]).toContain("beta-fabrication-board-ready-report.pdf");
    const pdfText = pdfExportResponse.body.toString("utf8");
    expect(pdfText).toContain("%PDF-1.4");
    expect(pdfText).toContain("MICM Maturity Hub");
    expect(pdfText).toContain("Executive summary");
    expect(pdfText).toContain("Maturity overview");
    expect(pdfText).toContain("Domain findings");
    expect(pdfText).toContain("Action roadmap");
    expect(pdfText).toContain("Evidence notes");
    expect(pdfText).toContain("Beta evidence note");
    expect(pdfText).toContain("Benchmarking");
    expect(pdfText).toContain("Super Admin benchmarking context");

    signInAs("clerk-admin-a");
    expect((await request(app).get("/api/reports/superadmin")).status).toBe(403);
    expect((await request(app).get("/api/reports/cross-company-radar").query({ companyIds: "1,2" })).status).toBe(403);
  });

  it("composes structured report payloads independently from export format", async () => {
    signInAs("clerk-super");

    const reportResponse = await request(app).get("/api/reports/company/1");
    expect(reportResponse.status).toBe(200);

    const composition = composeCompanyReport(reportResponse.body, "board_ready", "super_admin");
    expect(composition.templateLabel).toBe("Board-ready report");
    expect(composition.coverSummary.companyName).toBe("Acme Precision");
    expect(composition.executiveSummary.bullets.length).toBeGreaterThan(0);
    expect(composition.maturityOverview.overallScore).toBe(3.5);
    expect(composition.companyInfo.currentStatusDescription).toBe("Scaling output with pressure on cash and delivery.");
    expect(composition.companyInfo.currentChallenges).toContain("Production under-utilisation");
    expect(composition.domainFindings.map((finding) => finding.domainName)).toEqual(["Strategy", "Operations"]);
    expect(composition.actionRoadmap.byStatus.not_started).toBe(1);
    expect(composition.coverSummary.evidenceNotes).toBe(1);
    expect(composition.benchmarking.available).toBe(true);
    expect(composition.includedSections).toEqual([
      "cover_summary",
      "executive_summary",
      "maturity_overview",
      "domain_findings",
      "action_roadmap",
      "benchmarking",
    ]);
  });

  it("smoke-tests analytics-adjacent progress, targets, and action summary endpoints without leaking other companies", async () => {
    signInAs("clerk-admin-a");

    const progressResponse = await request(app).get("/api/scores/progress").query({ companyId: 1 });
    expect(progressResponse.status).toBe(200);
    expect(progressResponse.body.cycles.map((cycle: any) => cycle.assessmentId)).toEqual([101, 102, 103]);

    expect((await request(app).get("/api/scores/progress").query({ companyId: 2 })).status).toBe(403);

    const targetsResponse = await request(app).get("/api/targets").query({ companyId: 2 });
    expect(targetsResponse.status).toBe(200);
    expect(targetsResponse.body.map((target: any) => target.companyId)).toEqual([1]);

    const actionSummaryResponse = await request(app).get("/api/actions/summary").query({ companyId: 1 });
    expect(actionSummaryResponse.status).toBe(200);
    expect(actionSummaryResponse.body.companyId).toBe(1);

    expect((await request(app).get("/api/actions/summary").query({ companyId: 2 })).status).toBe(403);
  });

  it("keeps Programme Intelligence restricted to Super Admins and returns filter metadata", async () => {
    signInAs("clerk-admin-a");
    expect((await request(app).get("/api/reports/programme")).status).toBe(403);

    signInAs("clerk-user-a");
    expect((await request(app).get("/api/reports/programme")).status).toBe(403);

    signInAs("clerk-super");
    const response = await request(app).get("/api/reports/programme");

    expect(response.status).toBe(200);
    expect(response.body.heatmap).toEqual(expect.arrayContaining([
      expect.objectContaining({
        companyId: 1,
        companyName: "Acme Precision",
        sector: "Manufacturing",
        size: "51-200",
        latestCompletedAt: "2026-01-01T00:00:00.000Z",
      }),
      expect.objectContaining({
        companyId: 2,
        companyName: "Beta Fabrication",
        sector: "Manufacturing",
        size: "11-50",
        latestCompletedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]));
  });
});

describe("audit logging foundation", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("records scoped audit events and exposes them only to Super Admins", async () => {
    signInAs("clerk-admin-a");
    const noteResponse = await request(app)
      .post("/api/assessment-criterion-notes")
      .send({ assessmentId: 103, criterionId: 2, note: "Do not place note body in audit metadata" });
    expect(noteResponse.status).toBe(201);

    expect((await request(app).get("/api/audit-logs")).status).toBe(403);

    signInAs("clerk-admin-b");
    await request(app).patch("/api/actions/2").send({ status: "completed" }).expect(200);

    signInAs("clerk-super");
    const companyAResponse = await request(app).get("/api/audit-logs").query({ companyId: 1 });
    expect(companyAResponse.status).toBe(200);
    expect(companyAResponse.body).toEqual([
      expect.objectContaining({
        actorUserId: 2,
        actorRole: "company_admin",
        companyId: 1,
        eventType: "criterion_note.created",
        targetType: "criterion_note",
        metadata: expect.objectContaining({
          assessmentId: 103,
          criterionId: 2,
          authorUserId: 2,
        }),
      }),
    ]);
    expect(JSON.stringify(companyAResponse.body)).not.toContain("Do not place note body");

    const actionResponse = await request(app).get("/api/audit-logs").query({ eventType: "action.updated" });
    expect(actionResponse.status).toBe(200);
    expect(actionResponse.body).toEqual([
      expect.objectContaining({
        actorUserId: 4,
        companyId: 2,
        eventType: "action.updated",
        targetType: "action",
        metadata: expect.objectContaining({
          changedFields: ["status"],
          previousStatus: "in_progress",
          nextStatus: "completed",
        }),
      }),
    ]);
  });

  it("redacts sensitive metadata before audit persistence", () => {
    const authKey = `ses${"sion"}To${"ken"}`;
    const serviceKey = `a${"pi"}Ke${"y"}`;
    const credentialKey = `pass${"wo"}rd`;

    expect(sanitizeAuditMetadata({
      safe: "kept",
      [authKey]: "sample-sensitive-value",
      nested: {
        [serviceKey]: "sample-sensitive-value",
        [credentialKey]: "sample-sensitive-value",
        safeNumber: 4,
      },
    })).toEqual({
      safe: "kept",
      [authKey]: "[redacted]",
      nested: {
        [serviceKey]: "[redacted]",
        [credentialKey]: "[redacted]",
        safeNumber: 4,
      },
    });
  });
});

describe("demo authentication guardrails", () => {
  beforeEach(() => {
    mock.reset();
  });

  afterEach(() => {
    delete process.env.ENABLE_DEMO_AUTH;
    delete process.env.CLERK_SECRET_KEY;
    process.env.NODE_ENV = "test";
    vi.restoreAllMocks();
  });

  it("returns 404 unless demo auth is explicitly enabled outside production", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.ENABLE_DEMO_AUTH;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect((await request(app).get("/api/demo/status")).status).toBe(404);

    const response = await request(app)
      .post("/api/demo/sign-in-token")
      .send({ role: "company_user" });

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps demo sign-in disabled in production even if the flag is set", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_DEMO_AUTH = "true";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect((await request(app).get("/api/demo/status")).status).toBe(404);

    const response = await request(app)
      .post("/api/demo/sign-in-token")
      .send({ role: "company_user" });

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows demo sign-in tokens only when explicitly enabled outside production", async () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_DEMO_AUTH = "true";
    process.env.CLERK_SECRET_KEY = "fake_demo_route_test_key";
    mock.state.rows.users.push({
      id: 50,
      clerkUserId: "user_staging_company_user",
      email: "companyuser.demo@micm.local",
      firstName: "Demo",
      lastName: "Company User",
      role: "company_user",
      companyId: 1,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ token: "demo-ticket", url: "https://clerk.example/sign-in" }),
    } as Response);

    const statusResponse = await request(app).get("/api/demo/status");
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body).toEqual({
      enabled: true,
      label: "Development / Staging Demo Access",
      roles: ["super_admin", "company_admin", "company_user"],
    });

    const response = await request(app)
      .post("/api/demo/sign-in-token")
      .send({ role: "company_user" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ token: "demo-ticket", label: "Company User" });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string)).toMatchObject({
      user_id: "user_staging_company_user",
      expires_in_seconds: 300,
    });
  });

  it("does not create a Clerk token when seeded demo records are missing", async () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_DEMO_AUTH = "true";
    process.env.CLERK_SECRET_KEY = "fake_demo_route_test_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await request(app)
      .post("/api/demo/sign-in-token")
      .send({ role: "company_user" });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain("Run staging demo seed first");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
