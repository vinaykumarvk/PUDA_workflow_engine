import { query } from "./db";
import { executeTransition } from "./workflow";
import { getUserPostings } from "./auth";
import { logInfo, logWarn } from "./logger";

export interface Task {
  task_id: string;
  arn: string;
  state_id: string;
  system_role_id: string;
  assignee_user_id?: string;
  status: string;
  sla_due_at?: Date;
  created_at: Date;
  completed_at?: Date;
  decision?: string;
  remarks?: string;
}

export async function getInboxTasks(
  userId: string,
  authorityId?: string,
  status: string = "PENDING",
  limit: number = 100,
  offset: number = 0
): Promise<Task[]> {
  // Scope roles AND authorities to active postings.
  const postings = await getUserPostings(userId);
  const scopedPostings = postings.filter((posting) => !authorityId || posting.authority_id === authorityId);
  const authorityIds = Array.from(
    new Set(scopedPostings.map((posting) => posting.authority_id).filter(Boolean))
  );
  const systemRoles = Array.from(
    new Set(scopedPostings.flatMap((posting) => posting.system_role_ids).filter(Boolean))
  );
  
  if (systemRoles.length === 0 || authorityIds.length === 0) {
    return [];
  }
  
  const result = await query(
    `SELECT 
      t.task_id,
      t.arn,
      t.state_id,
      t.system_role_id,
      t.assignee_user_id,
      t.status,
      t.sla_due_at,
      t.created_at,
      t.completed_at,
      t.decision,
      t.remarks,
      a.service_key,
      a.authority_id,
      a.applicant_user_id,
      a.public_arn,
      a.data_jsonb->'applicant'->>'full_name' as applicant_name
    FROM task t
    JOIN application a ON t.arn = a.arn
    WHERE t.status = $1 
      AND t.system_role_id = ANY($2)
      AND (a.disposed_at IS NULL)
      AND a.authority_id = ANY($3)
    ORDER BY t.sla_due_at ASC NULLS LAST, t.created_at ASC
    LIMIT $4 OFFSET $5`,
    [status, systemRoles, authorityIds, limit, offset]
  );
  
  return result.rows.map(row => ({
    task_id: row.task_id,
    arn: row.public_arn || row.arn,
    state_id: row.state_id,
    system_role_id: row.system_role_id,
    assignee_user_id: row.assignee_user_id,
    status: row.status,
    sla_due_at: row.sla_due_at,
    created_at: row.created_at,
    completed_at: row.completed_at,
    decision: row.decision,
    remarks: row.remarks,
    // Enrichment fields for officer UI
    service_key: row.service_key,
    applicant_name: row.applicant_name,
    authority_id: row.authority_id,
  }));
}

/**
 * Validate that an officer has the correct role to act on a specific task.
 * Returns the system roles the officer has for the task's authority, or null if unauthorized.
 */
export async function validateOfficerCanActOnTask(
  userId: string,
  taskId: string
): Promise<{ authorized: boolean; systemRoles: string[]; authorityId?: string; error?: string }> {
  // 1. Load task + application
  const taskResult = await query(
    `SELECT t.task_id, t.arn, t.state_id, t.system_role_id, a.authority_id, a.service_key
     FROM task t
     JOIN application a ON t.arn = a.arn
     WHERE t.task_id = $1`,
    [taskId]
  );
  if (taskResult.rows.length === 0) {
    return { authorized: false, systemRoles: [], error: "TASK_NOT_FOUND" };
  }
  const task = taskResult.rows[0];

  // 2. Get officer's roles scoped to this application's authority
  const postings = await getUserPostings(userId);
  const authorityRoles = postings
    .filter(p => p.authority_id === task.authority_id)
    .flatMap(p => p.system_role_ids);

  if (authorityRoles.length === 0) {
    return {
      authorized: false,
      systemRoles: [],
      authorityId: task.authority_id,
      error: "NO_POSTING_FOR_AUTHORITY",
    };
  }

  // 3. Check if officer's roles include the role required for this task
  if (!authorityRoles.includes(task.system_role_id)) {
    return {
      authorized: false,
      systemRoles: authorityRoles,
      authorityId: task.authority_id,
      error: `ROLE_MISMATCH: task requires ${task.system_role_id}, officer has [${authorityRoles.join(",")}]`
    };
  }

  return { authorized: true, systemRoles: authorityRoles, authorityId: task.authority_id };
}

export async function assignTask(taskId: string, userId: string): Promise<void> {
  const result = await query(
    "UPDATE task SET assignee_user_id = $1, status = 'IN_PROGRESS', started_at = NOW() WHERE task_id = $2 AND status = 'PENDING'",
    [userId, taskId]
  );
  if (result.rowCount === 0) {
    throw new Error("TASK_NOT_FOUND_OR_ALREADY_ASSIGNED");
  }
}

export async function takeActionOnTask(
  taskId: string,
  action: "FORWARD" | "QUERY" | "APPROVE" | "REJECT",
  userId: string,
  systemRoles: string[],
  remarks?: string,
  queryMessage?: string,
  unlockedFields?: string[],
  unlockedDocuments?: string[],
  verificationData?: Record<string, any>
): Promise<{ success: boolean; newStateId?: string; arn?: string; error?: string }> {
  // Get task
  const taskResult = await query(
    "SELECT t.arn, t.state_id, t.assignee_user_id, t.status, a.service_key FROM task t JOIN application a ON t.arn = a.arn WHERE t.task_id = $1",
    [taskId]
  );
  
  if (taskResult.rows.length === 0) {
    return { success: false, error: "TASK_NOT_FOUND" };
  }
  
  const task = taskResult.rows[0];
  const arn = task.arn;

  // B1: Verification checklist gate — enforce before APPROVE on water/sewerage services
  const CHECKLIST_REQUIRED_SERVICES = ["sanction_of_water_supply", "sanction_of_sewerage_connection"];
  if (action === "APPROVE" && CHECKLIST_REQUIRED_SERVICES.includes(task.service_key)) {
    // Load workflow config to find required checklist items
    const cfgResult = await query(
      "SELECT config_jsonb FROM service_version sv JOIN application a ON a.service_key = sv.service_key AND a.service_version = sv.version WHERE a.arn = $1",
      [arn]
    );
    if (cfgResult.rows.length > 0) {
      const workflow = cfgResult.rows[0].config_jsonb?.workflow;
      const currentState = workflow?.states?.find((s: any) => s.stateId === task.state_id);
      const requiredItems = (currentState?.taskUi?.checklist || []).filter((c: any) => c.required);
      if (requiredItems.length > 0) {
        if (!verificationData || !verificationData.checklist) {
          return { success: false, error: "VERIFICATION_CHECKLIST_REQUIRED" };
        }
        const incomplete = requiredItems.filter((item: any) => !verificationData.checklist[item.key]);
        if (incomplete.length > 0) {
          return {
            success: false,
            error: `INCOMPLETE_CHECKLIST: ${incomplete.map((i: any) => i.label).join(", ")}`
          };
        }
      }
    }
    // Store verification data on the task for audit
    if (verificationData) {
      await query(
        "UPDATE task SET verification_data = $1 WHERE task_id = $2",
        [JSON.stringify(verificationData), taskId]
      );

      // Also complete the linked inspection (if one exists)
      try {
        const { getInspectionForTask, completeInspection } = await import("./inspections");
        const inspection = await getInspectionForTask(taskId);
        if (inspection && inspection.status !== "COMPLETED") {
          const outcome = action === "APPROVE" ? "PASS" as const
            : action === "REJECT" ? "FAIL" as const
            : "PASS" as const;
          await completeInspection(inspection.inspection_id, {
            checklistData: verificationData.checklist || {},
            observations: verificationData.observations || {},
            outcome,
            outcomeRemarks: verificationData.remarks || remarks,
          });
          logInfo("Inspection auto-completed after officer action", {
            taskId,
            inspectionId: inspection.inspection_id,
            outcome,
          });
        }
      } catch (inspErr: any) {
        logWarn("Failed to auto-complete inspection after officer action", {
          taskId,
          error: inspErr?.message || "unknown_error",
        });
      }
    }
  }

  if (task.assignee_user_id && task.assignee_user_id !== userId) {
    return { success: false, error: "TASK_NOT_ASSIGNED_TO_USER" };
  }

  if (!task.assignee_user_id) {
    const assignResult = await query(
      "UPDATE task SET assignee_user_id = $1, status = 'IN_PROGRESS', started_at = NOW() WHERE task_id = $2 AND assignee_user_id IS NULL",
      [userId, taskId]
    );
    if (assignResult.rowCount === 0) {
      return { success: false, error: "TASK_NOT_ASSIGNED_TO_USER" };
    }
  } else if (task.assignee_user_id === userId && task.status === "PENDING") {
    await query(
      "UPDATE task SET status = 'IN_PROGRESS', started_at = NOW() WHERE task_id = $1",
      [taskId]
    );
  }
  
  // Load workflow config to resolve transition ID by (fromStateId, action)
  const configResult = await query(
    "SELECT config_jsonb FROM service_version sv JOIN application a ON a.service_key = sv.service_key AND a.service_version = sv.version WHERE a.arn = $1",
    [task.arn]
  );
  if (configResult.rows.length === 0) {
    return { success: false, error: "CONFIG_NOT_FOUND" };
  }
  const workflow = configResult.rows[0].config_jsonb?.workflow;
  if (!workflow?.transitions) {
    return { success: false, error: "WORKFLOW_NOT_FOUND" };
  }
  // M1: Use explicit action-type matching via transition metadata or suffix map
  // Prefer transitions that declare an "action" field; fall back to suffix matching as last resort
  const transition = workflow.transitions.find(
    (t: { fromStateId: string; transitionId: string; action?: string }) => {
      if (t.fromStateId !== task.state_id) return false;
      // Best: workflow declares action on the transition
      if (t.action) return t.action === action;
      // Fallback: suffix matching (case-insensitive, underscore-prefixed)
      const id = t.transitionId.toUpperCase();
      return id.endsWith(`_${action}`) || id === action;
    }
  );
  if (!transition) {
    return { success: false, error: "TRANSITION_NOT_FOUND" };
  }
  const transitionId = transition.transitionId;
  
  const result = await executeTransition(
    task.arn,
    transitionId,
    userId,
    "OFFICER",
    systemRoles,
    remarks,
    {
      decision: action,
      queryMessage,
      unlockedFields,
      unlockedDocuments
    }
  );
  
  if (result.success) {
    return { success: true, newStateId: result.newStateId, arn };
  }
  return result;
}
