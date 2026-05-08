import { useUser, useAuth as useClerkAuth } from "@clerk/react";
import { useGetMyRole } from "@workspace/api-client-react";

export function useCurrentUser() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { getToken } = useClerkAuth();

  const { data: roleData, isLoading: roleLoading } = useGetMyRole({
    query: { enabled: !!isSignedIn } as any,
  });

  return {
    clerkUser: user,
    isLoaded: isLoaded && !roleLoading,
    isSignedIn,
    role: roleData?.role,
    companyId: roleData?.companyId,
    companyName: roleData?.companyName,
    userId: roleData?.userId,
    isSuperAdmin: roleData?.role === "super_admin",
    isCompanyAdmin: roleData?.role === "company_admin",
    isCompanyUser: roleData?.role === "company_user",
    getToken,
  };
}
