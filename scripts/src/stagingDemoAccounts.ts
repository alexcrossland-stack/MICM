export const STAGING_DEMO_PRIMARY_COMPANY_KEY = "northstar";

export const STAGING_DEMO_SUPER_ADMIN = {
  clerkUserId: "micm-staging-demo-super-admin",
  email: "superadmin.demo@micm.local",
  firstName: "Demo",
  lastName: "Super Admin",
  role: "super_admin",
} as const;

const DEFAULT_COMPANY_DEMO_USERS = {
  admin: {
    firstName: "Demo",
    lastName: "Company Admin",
    role: "company_admin",
  },
  userA: {
    firstName: "Demo",
    lastName: "Company User",
    role: "company_user",
  },
  userB: {
    firstName: "Demo",
    lastName: "Company Reviewer",
    role: "company_user",
  },
} as const;

export function stagingDemoUsersForCompany(companyKey: string) {
  const generated = {
    admin: {
      clerkUserId: `micm-staging-demo-${companyKey}-admin`,
      email: `${companyKey}.admin@example.test`,
      ...DEFAULT_COMPANY_DEMO_USERS.admin,
    },
    userA: {
      clerkUserId: `micm-staging-demo-${companyKey}-user-a`,
      email: `${companyKey}.operator@example.test`,
      ...DEFAULT_COMPANY_DEMO_USERS.userA,
    },
    userB: {
      clerkUserId: `micm-staging-demo-${companyKey}-user-b`,
      email: `${companyKey}.lead@example.test`,
      ...DEFAULT_COMPANY_DEMO_USERS.userB,
    },
  } as const;

  if (companyKey !== STAGING_DEMO_PRIMARY_COMPANY_KEY) {
    return generated;
  }

  return {
    ...generated,
    admin: {
      ...generated.admin,
      email: "companyadmin.demo@micm.local",
    },
    userA: {
      ...generated.userA,
      email: "companyuser.demo@micm.local",
    },
  } as const;
}

export function stagingDemoClerkUserIds(companyKeys: readonly string[]) {
  return [
    STAGING_DEMO_SUPER_ADMIN.clerkUserId,
    ...companyKeys.flatMap((companyKey) => {
      const users = stagingDemoUsersForCompany(companyKey);
      return [
        users.admin.clerkUserId,
        users.userA.clerkUserId,
        users.userB.clerkUserId,
      ];
    }),
  ];
}
