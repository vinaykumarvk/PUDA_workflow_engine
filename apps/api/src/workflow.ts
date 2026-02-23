import { query, getClient } from "./db";
import { v4 as uuidv4 } from "uuid";
import pg from "pg";
import { logError, logInfo, logWarn } from "./logger";

export interface WorkflowState {
  stateId: string;
  type: string;
  taskRequired: boolean;
  systemRoleId?: string;
  slaDays?: number;
}

export interface WorkflowTransition {
  transitionId: string;
  fromStateId: string;
  toStateId: string;
  trigger: "manual" | "system";
  allowedActorTypes?: string[];
  allowedSystemRoleIds?: string[];
  actions?: string[];
}

export interface WorkflowConfig {
  workflowId: string;
  version: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

export async function executeTransition(
  arn: string,
  transitionId: string,
  actorUserId: string,
  actorType: "CITIZEN" | "OFFICER" | "SYSTEM",
  actorSystemRoles: string[],
  remarks?: string,
  actionPayload?: any,
  existingClient?: pg.PoolClient
): Promise<{ success: boolean; newStateId?: string; error?: string }> {
  const owned = !existingClient;
  const client = existingClient ?? await getClient();
  
  try {
    if (owned) await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    
    // Load application with lock
    const appResult = await client.query(
      "SELECT arn, state_id, service_key, service_version, row_version FROM application WHERE arn = $1 FOR UPDATE",
      [arn]
    );
    
    if (appResult.rows.length === 0) {
      if (owned) await client.query("ROLLBACK");
      return { success: false, error: "APPLICATION_NOT_FOUND" };
    }
    
    const app = appResult.rows[0];
    
    // Load workflow config
    const configResult = await client.query(
      "SELECT config_jsonb FROM service_version WHERE service_key = $1 AND version = $2",
      [app.service_key, app.service_version]
    );
    
    if (configResult.rows.length === 0) {
      if (owned) await client.query("ROLLBACK");
      return { success: false, error: "CONFIG_NOT_FOUND" };
    }
    
    const serviceConfig = configResult.rows[0].config_jsonb;
    const workflow: WorkflowConfig = serviceConfig.workflow;
    
    // Find transition
    const transition = workflow.transitions.find(t => t.transitionId === transitionId);
    if (!transition) {
      if (owned) await client.query("ROLLBACK");
      return { success: false, error: "TRANSITION_NOT_FOUND" };
    }
    
    if (transition.fromStateId !== app.state_id) {
      if (owned) await client.query("ROLLBACK");
      return { success: false, error: "INVALID_STATE" };
    }
    
    if (transition.trigger === "manual" && actorType === "SYSTEM") {
      if (owned) await client.query("ROLLBACK");
      return { success: false, error: "INVALID_TRIGGER" };
    }
    
    if (transition.allowedActorTypes && !transition.allowedActorTypes.includes(actorType)) {
      if (owned) await client.query("ROLLBACK");
      return { success: false, error: "UNAUTHORIZED_ACTOR_TYPE" };
    }
    
    if (transition.allowedSystemRoleIds && actorType === "OFFICER") {
      const hasRole = transition.allowedSystemRoleIds.some(role => actorSystemRoles.includes(role));
      if (!hasRole) {
        if (owned) await client.query("ROLLBACK");
        return { success: false, error: "UNAUTHORIZED_ROLE" };
      }
    }
    
    // Execute transition
    const newStateId = transition.toStateId;
    const newRowVersion = app.row_version + 1;
    
    // Update application state
    await client.query(
      "UPDATE application SET state_id = $1, row_version = $2, updated_at = NOW() WHERE arn = $3",
      [newStateId, newRowVersion, arn]
    );

    // Append status change to data_jsonb.application.statusHistory (canonical audit trail)
    const statusChange = {
      from: app.state_id,
      to: newStateId,
      changedAt: new Date().toISOString(),
      changedBy: actorUserId,
      changedByRole: actorType === "OFFICER" ? actorSystemRoles[0] : actorType,
      remarks: remarks || undefined,
    };
    await client.query(
      `UPDATE application
         SET data_jsonb = jsonb_set(
           jsonb_set(
             jsonb_set(
               COALESCE(data_jsonb, '{}'::jsonb),
               '{application}',
               COALESCE(data_jsonb->'application', '{}'::jsonb),
               true
             ),
             '{application,status}',
             to_jsonb($1::text),
             true
           ),
           '{application,statusHistory}',
           COALESCE(
             CASE
               WHEN jsonb_typeof(data_jsonb->'application'->'statusHistory') = 'array'
                 THEN data_jsonb->'application'->'statusHistory'
               ELSE '[]'::jsonb
             END,
             '[]'::jsonb
           ) || jsonb_build_array($2::jsonb),
           true
         )
       WHERE arn = $3`,
      [newStateId, JSON.stringify(statusChange), arn]
    );
    
    // Handle transition actions
    const transitionActions = transition.actions || [];
    for (const action of transitionActions) {
      await executeAction(client, action, arn, newStateId, workflow, actionPayload, actorUserId, actorSystemRoles, remarks);
    }

    // Safety net: if config forgets ASSIGN_NEXT_TASK but target state is task-required,
    // auto-create the pending task once to avoid workflow dead-ends.
    const targetState = workflow.states.find((state) => state.stateId === newStateId);
    const hasAssignNextTaskAction = transitionActions.includes("ASSIGN_NEXT_TASK");
    if (
      targetState?.taskRequired &&
      targetState.systemRoleId &&
      !hasAssignNextTaskAction
    ) {
      const openTaskResult = await client.query(
        "SELECT 1 FROM task WHERE arn = $1 AND state_id = $2 AND status IN ('PENDING', 'IN_PROGRESS') LIMIT 1",
        [arn, newStateId]
      );
      if (openTaskResult.rows.length === 0) {
        await executeAction(
          client,
          "ASSIGN_NEXT_TASK",
          arn,
          newStateId,
          workflow,
          actionPayload,
          actorUserId,
          actorSystemRoles,
          remarks
        );
      }
    }
    
    // Complete current task if exists
    if (actorType === "OFFICER") {
      await client.query(
        "UPDATE task SET status = 'COMPLETED', completed_at = NOW(), decision = $1, remarks = $2 WHERE arn = $3 AND status IN ('PENDING', 'IN_PROGRESS') AND assignee_user_id = $4",
        [actionPayload?.decision || "FORWARD", remarks || null, arn, actorUserId]
      );
    }
    
    // Create audit event
    await client.query(
      "INSERT INTO audit_event (event_id, arn, event_type, actor_type, actor_id, payload_jsonb) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        uuidv4(),
        arn,
        "STATE_CHANGED",
        actorType,
        actorUserId,
        JSON.stringify({
          fromState: app.state_id,
          toState: newStateId,
          transitionId,
          remarks
        })
      ]
    );
    
    // Capture notification info BEFORE commit (while we still have the client)
    let pendingNotification: { applicantUserId: string; displayArn: string } | null = null;
    if (owned) {
      const applicantResult = await client.query("SELECT applicant_user_id, public_arn FROM application WHERE arn = $1", [arn]);
      const applicantUserId = applicantResult.rows[0]?.applicant_user_id;
      const displayArn = applicantResult.rows[0]?.public_arn || arn;
      if (applicantUserId) {
        pendingNotification = { applicantUserId, displayArn };
      }
    }
    
    if (owned) await client.query("COMMIT");
    
    // Send notifications AFTER commit to avoid deadlock
    // (notify uses a separate pool connection that would block on the locked row)
    if (owned && pendingNotification) {
      const { notify } = await import("./notifications");
      const eventMap: Record<string, string> = {
        SUBMIT: "APPLICATION_SUBMITTED",
        APPROVE: "APPLICATION_APPROVED",
        REJECT: "APPLICATION_REJECTED",
      };
      const eventType = eventMap[transitionId];
      if (eventType) {
        await notify(eventType, pendingNotification.displayArn, pendingNotification.applicantUserId);
      } else if (newStateId === "QUERY_PENDING") {
        await notify("QUERY_RAISED", pendingNotification.displayArn, pendingNotification.applicantUserId);
      } else if (newStateId === "IN_PROGRESS") {
        await notify("TASK_ASSIGNED", pendingNotification.displayArn, pendingNotification.applicantUserId);
      }
    }
    
    return { success: true, newStateId };
  } catch (error: any) {
    if (owned) await client.query("ROLLBACK");
    logError("Workflow transition failed", {
      arn,
      transitionId,
      actorType,
      error: error?.message || "unknown_error",
    });
    return { success: false, error: error.message };
  } finally {
    if (owned) client.release();
  }
}

async function executeAction(
  client: pg.PoolClient,
  action: string,
  arn: string,
  stateId: string,
  workflow: WorkflowConfig,
  payload?: any,
  actorUserId?: string,
  actorSystemRoles?: string[],
  remarks?: string
): Promise<void> {
  switch (action) {
    case "ASSIGN_NEXT_TASK":
      const state = workflow.states.find(s => s.stateId === stateId);
      if (state && state.taskRequired && state.systemRoleId) {
        const taskId = uuidv4();
        let slaDueAt: Date | null = null;
        if (state.slaDays) {
          // B6: Calculate SLA using working days (exclude weekends + authority holidays)
          try {
            const appRow = await client.query("SELECT authority_id FROM application WHERE arn = $1", [arn]);
            const authorityId = appRow.rows[0]?.authority_id;
            if (authorityId) {
              const { calculateSLADueDate } = await import("./sla");
              slaDueAt = await calculateSLADueDate(new Date(), state.slaDays, authorityId);
            } else {
              slaDueAt = new Date(Date.now() + state.slaDays * 24 * 60 * 60 * 1000);
            }
          } catch {
            // Fallback to calendar days if SLA calculation fails
            slaDueAt = new Date(Date.now() + state.slaDays * 24 * 60 * 60 * 1000);
          }
        }
        
        await client.query(
          "INSERT INTO task (task_id, arn, state_id, system_role_id, status, sla_due_at) VALUES ($1, $2, $3, $4, 'PENDING', $5)",
          [taskId, arn, stateId, state.systemRoleId, slaDueAt]
        );

        // Auto-create inspection record if the state requires site verification
        try {
          const { maybeCreateInspectionForTask } = await import("./inspections");
          const inspection = await maybeCreateInspectionForTask(
            arn, taskId, stateId, state.systemRoleId, state, client
          );
          if (inspection) {
            logInfo("Auto-created inspection for workflow task", {
              arn,
              taskId,
              stateId,
              inspectionId: inspection.inspection_id,
            });
          }
        } catch (inspErr: any) {
          logWarn("Failed to auto-create inspection for workflow task", {
            arn,
            taskId,
            stateId,
            error: inspErr?.message || "unknown_error",
          });
        }
      }
      break;
      
    case "RAISE_QUERY":
      if (payload?.queryMessage) {
        const appResult = await client.query("SELECT query_count, service_key FROM application WHERE arn = $1", [arn]);
        const queryNumber = (appResult.rows[0]?.query_count || 0) + 1;
        const queryId = uuidv4();
        // L5: Query response deadline is configurable per service (default 15 days)
        const QUERY_RESPONSE_DAYS: Record<string, number> = {
          no_due_certificate: 10,
          registration_of_architect: 15,
          sanction_of_water_supply: 15,
          sanction_of_sewerage_connection: 15,
        };
        const deadlineDays = QUERY_RESPONSE_DAYS[appResult.rows[0]?.service_key] ?? 15;
        const responseDueAt = new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000);
        
        await client.query(
          `INSERT INTO query (query_id, arn, query_number, message, status,
             unlocked_field_keys, unlocked_doc_type_ids, response_due_at,
             raised_by_user_id, raised_by_role)
           VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8, $9)`,
          [
            queryId,
            arn,
            queryNumber,
            payload.queryMessage,
            payload.unlockedFields || [],
            payload.unlockedDocuments || [],
            responseDueAt,
            actorUserId || null,
            actorSystemRoles?.[0] || null,
          ]
        );
        
        // Update application query count and pause SLA
        await client.query(
          "UPDATE application SET query_count = query_count + 1, sla_paused_at = NOW() WHERE arn = $1",
          [arn]
        );

        // Auto-create a QUERY notice letter
        try {
          const { createNoticeLetter } = await import("./notices");
          const notice = await createNoticeLetter({
            arn,
            noticeType: "QUERY",
            templateCode: "QUERY_NOTICE",
            subject: `Query on Application ${arn} (Query #${queryNumber})`,
            bodyText: payload.queryMessage,
            dispatchMode: "ELECTRONIC",
            queryId,
            issuedByUserId: actorUserId,
            issuedByRole: actorSystemRoles?.[0],
            metadata: {
              queryNumber,
              responseDueAt: responseDueAt.toISOString(),
              unlockedFields: payload.unlockedFields || [],
              unlockedDocuments: payload.unlockedDocuments || [],
            },
          }, client);
          logInfo("Created query notice", {
            arn,
            queryId,
            noticeId: notice.notice_id,
          });
        } catch (noticeErr: any) {
          logWarn("Failed to create query notice", {
            arn,
            queryId,
            error: noticeErr?.message || "unknown_error",
          });
        }
        
        // NOTE: Notification for QUERY_RAISED is deferred to after commit
        // to avoid deadlock (notify uses a separate pool connection but the
        // application row is locked FOR UPDATE in this transaction).
        // The notification is sent by the "owned" block below.
      }
      break;
      
    case "RECORD_DECISION":
      const disposalType = payload?.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      await client.query(
        "UPDATE application SET disposed_at = NOW(), disposal_type = $1 WHERE arn = $2",
        [disposalType, arn]
      );

      // Create a formal decision record
      try {
        const { createDecision } = await import("./decisions");
        // Find the active task for this ARN to link the decision
        const activeTask = await client.query(
          "SELECT task_id, system_role_id FROM task WHERE arn = $1 AND status IN ('PENDING', 'IN_PROGRESS') ORDER BY created_at DESC LIMIT 1",
          [arn]
        );
        const decisionType = payload?.decision === "APPROVE" ? "APPROVE" as const : "REJECT" as const;
        const decision = await createDecision({
          arn,
          decisionType,
          decidedByUserId: actorUserId,
          decidedByRole: actorSystemRoles?.[0],
          reasonCodes: payload?.reasonCodes || [],
          remarks: remarks || payload?.remarks,
          conditions: payload?.conditions || [],
          taskId: activeTask.rows[0]?.task_id,
          metadata: payload?.metadata,
        }, client);
        logInfo("Created decision record", {
          arn,
          decisionId: decision.decision_id,
          decisionType,
        });

        // Auto-create an APPROVAL or REJECTION notice letter
        try {
          const { createNoticeLetter } = await import("./notices");
          const noticeType = decisionType === "APPROVE" ? "APPROVAL" as const : "REJECTION" as const;
          const notice = await createNoticeLetter({
            arn,
            noticeType,
            templateCode: `${noticeType}_NOTICE`,
            subject: `Application ${arn} — ${noticeType}`,
            bodyText: decisionType === "APPROVE"
              ? `Your application ${arn} has been approved.${decision.conditions.length > 0 ? ` Conditions: ${decision.conditions.join("; ")}` : ""}`
              : `Your application ${arn} has been rejected.${decision.remarks ? ` Reason: ${decision.remarks}` : ""}`,
            dispatchMode: "ELECTRONIC",
            decisionId: decision.decision_id,
            issuedByUserId: actorUserId,
            issuedByRole: actorSystemRoles?.[0],
            metadata: {
              reasonCodes: decision.reason_codes,
              conditions: decision.conditions,
            },
          }, client);
          logInfo("Created decision notice", {
            arn,
            noticeId: notice.notice_id,
            noticeType,
          });
        } catch (noticeErr: any) {
          logWarn("Failed to create decision notice", {
            arn,
            decisionId: decision.decision_id,
            error: noticeErr?.message || "unknown_error",
          });
        }
      } catch (decErr: any) {
        logWarn("Failed to create decision record", {
          arn,
          error: decErr?.message || "unknown_error",
        });
      }
      break;
      
    case "GENERATE_OUTPUT_NDC_APPROVAL":
    case "GENERATE_OUTPUT_NDC_REJECTION":
      // Output generation will be handled separately
      break;
  }
}
