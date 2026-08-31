import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { domainsTable, categoriesTable, criteriaTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListDomainsResponse } from "@workspace/api-zod";
import { requireAuth } from "./auth";

const router: IRouter = Router();

// GET /domains
router.get("/domains", requireAuth, async (_req: any, res): Promise<void> => {
  const domains = await db.select().from(domainsTable).orderBy(domainsTable.orderIndex);
  const categories = await db.select().from(categoriesTable).orderBy(categoriesTable.orderIndex);
  const criteria = await db.select().from(criteriaTable).where(eq(criteriaTable.isIncluded, true)).orderBy(criteriaTable.orderIndex);

  const result = domains.map(domain => ({
    id: domain.id,
    name: domain.name,
    description: domain.description,
    orderIndex: domain.orderIndex,
    categories: categories
      .filter(cat => cat.domainId === domain.id)
      .map(cat => ({
        id: cat.id,
        domainId: cat.domainId,
        name: cat.name,
        description: cat.description,
        orderIndex: cat.orderIndex,
        criteria: criteria
          .filter(crit => crit.categoryId === cat.id)
          .map(crit => ({
            id: crit.id,
            categoryId: crit.categoryId,
            name: crit.name,
            description: crit.description,
            baselineDescription: crit.baselineDescription,
            excellenceDescription: crit.excellenceDescription,
            orderIndex: crit.orderIndex,
          })),
      })),
  }));

  res.json(ListDomainsResponse.parse(result));
});

export default router;
