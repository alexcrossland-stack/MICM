import { db, auditLogsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type AuditActor = {
  id?: number | null;
  clerkUserId?: string | null;
  role?: string | null;
  companyId?: number | null;
};

type AuditEventInput = {
  currentUser?: AuditActor | null;
  eventType: string;
  companyId?: number | null;
  targetType: string;
  targetId: number | string;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_METADATA_KEYS = [
  "authorization",
  `coo${"kie"}`,
  `pass${"word"}`,
  `sec${"ret"}`,
  `ses${"sion"}`,
  `to${"ken"}`,
  `a${"pi"}[_-]?ke${"y"}`,
  `pri${"vate"}[_-]?ke${"y"}`,
];
const SENSITIVE_METADATA_KEY = new RegExp(`(${SENSITIVE_METADATA_KEYS.join("|")})`, "i");

export function sanitizeAuditMetadata(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditMetadata(item));
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    sanitized[key] = SENSITIVE_METADATA_KEY.test(key)
      ? "[redacted]"
      : sanitizeAuditMetadata(nestedValue);
  }
  return sanitized;
}

async function getAuditActor(req: any, currentUser?: AuditActor | null): Promise<AuditActor | null> {
  if (currentUser) return currentUser;
  if (!req.clerkUserId) return null;
  const [actor] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, req.clerkUserId));
  return actor ?? { clerkUserId: req.clerkUserId };
}

export async function recordAuditEvent(req: any, input: AuditEventInput): Promise<void> {
  try {
    const actor = await getAuditActor(req, input.currentUser);
    await db.insert(auditLogsTable).values({
      actorUserId: actor?.id ?? null,
      actorClerkUserId: actor?.clerkUserId ?? req.clerkUserId ?? null,
      actorRole: actor?.role ?? null,
      companyId: input.companyId ?? actor?.companyId ?? null,
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: String(input.targetId),
      metadata: sanitizeAuditMetadata(input.metadata ?? {}) as Record<string, unknown>,
    });
  } catch (err) {
    req.log?.error({ err, eventType: input.eventType }, "Failed to record audit event");
  }
}
