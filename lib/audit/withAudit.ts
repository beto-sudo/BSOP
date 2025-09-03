import { supabaseAdmin } from "../db";

type Meta = Record<string, any>;

export async function withAudit<T>(
  companyId: string | null,
  actorUserId: string | null,
  entityType: string,
  entityId: string,
  action: string,
  metadata: Meta,
  fn: () => Promise<T>
): Promise<T> {
  const result = await fn();
  await supabaseAdmin.from("audit_log").insert({
    company_id: companyId,
    actor_user_id: actorUserId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    metadata,
  });
  return result;
}
