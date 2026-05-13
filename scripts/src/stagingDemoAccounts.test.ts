import { describe, expect, it } from "vitest";
import {
  STAGING_DEMO_PRIMARY_COMPANY_KEY,
  STAGING_DEMO_SUPER_ADMIN,
  stagingDemoClerkUserIds,
  stagingDemoUsersForCompany,
} from "./stagingDemoAccounts";

describe("staging demo accounts", () => {
  it("defines the three canonical fake staging demo identities", () => {
    const primaryUsers = stagingDemoUsersForCompany(
      STAGING_DEMO_PRIMARY_COMPANY_KEY,
    );

    expect(STAGING_DEMO_SUPER_ADMIN).toMatchObject({
      email: "superadmin.demo@micm.local",
      role: "super_admin",
    });
    expect(primaryUsers.admin).toMatchObject({
      email: "companyadmin.demo@micm.local",
      role: "company_admin",
    });
    expect(primaryUsers.userA).toMatchObject({
      email: "companyuser.demo@micm.local",
      role: "company_user",
    });
  });

  it("keeps company demo accounts scoped to the primary seeded company", () => {
    const primaryUsers = stagingDemoUsersForCompany("northstar");
    const secondaryUsers = stagingDemoUsersForCompany("westbridge");

    expect(primaryUsers.admin.email).toBe("companyadmin.demo@micm.local");
    expect(primaryUsers.userA.email).toBe("companyuser.demo@micm.local");
    expect(secondaryUsers.admin.email).toBe("westbridge.admin@example.test");
    expect(secondaryUsers.userA.email).toBe("westbridge.operator@example.test");
  });

  it("returns the seeded Clerk IDs without credentials or secret material", () => {
    expect(stagingDemoClerkUserIds(["northstar"])).toEqual([
      "micm-staging-demo-super-admin",
      "micm-staging-demo-northstar-admin",
      "micm-staging-demo-northstar-user-a",
      "micm-staging-demo-northstar-user-b",
    ]);
  });
});
