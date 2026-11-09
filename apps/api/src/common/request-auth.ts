import type { AuthContext } from "@workmesh/core";
import type { ViewerScope } from "../modules/policy/authz.types";

export interface RequestAuth {
  userId: string;
  email: string;
  name: string;
  sessionId: string;
  csrfToken: string;
  /** Present when the session has an active organization with an ACTIVE membership. */
  orgId?: string;
  membershipId?: string;
  ctx?: AuthContext;
  scope?: ViewerScope;
}

export function requireOrg(auth: RequestAuth): Required<Pick<RequestAuth, "orgId" | "membershipId" | "ctx" | "scope">> &
  RequestAuth {
  if (!auth.orgId || !auth.membershipId || !auth.ctx || !auth.scope) {
    throw new Error("Organization context required");
  }
  return auth as Required<Pick<RequestAuth, "orgId" | "membershipId" | "ctx" | "scope">> & RequestAuth;
}
