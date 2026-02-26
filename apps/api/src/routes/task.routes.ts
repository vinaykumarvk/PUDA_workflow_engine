import { FastifyInstance } from "fastify";
import * as tasks from "../tasks";
import * as applications from "../applications";
import * as outputs from "../outputs";
import * as documents from "../documents";
import { executeTransition } from "../workflow";
import { getAuthUserId, send400, send403 } from "../errors";
import { requireAuthorityStaffAccess } from "../route-access";
import { isFeatureEnabled } from "../feature-flags";
import { MFA_PURPOSE_TASK_DECISION, verifyMfaChallenge } from "../mfa-stepup";

async function isOfficerDecisionMfaRequired(
  userId: string,
  authorityId?: string,
  systemRoles?: string[]
): Promise<boolean> {
  if (process.env.OFFICER_MFA_REQUIRED_ON_DECISION === "true") {
    return true;
  }
  return isFeatureEnabled({
    flagKey: "officer_mfa_decision_stepup",
    userId,
    authorityId: authorityId || null,
    userType: "OFFICER",
    systemRoles: systemRoles || [],
  });
}

function isDecisionAction(action: "FORWARD" | "QUERY" | "APPROVE" | "REJECT"): boolean {
  return action === "APPROVE" || action === "REJECT";
}

const taskActionSchema = {
  params: {
    type: "object",
    required: ["taskId"],
    additionalProperties: false,
    properties: {
      taskId: { type: "string", minLength: 1 },
    },
  },
  body: {
    type: "object",
    required: ["action"],
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: ["FORWARD", "QUERY", "APPROVE", "REJECT"] },
      userId: { type: "string" },  // kept for backward compat but overridden by JWT
      remarks: { type: "string" },
      queryMessage: { type: "string" },
      unlockedFields: { type: "array", items: { type: "string" } },
      unlockedDocuments: { type: "array", items: { type: "string" } },
      verificationData: { type: "object" },
      mfaChallengeId: { type: "string", minLength: 1 },
      mfaCode: { type: "string", pattern: "^\\d{6}$" },
    },
  },
};

const taskAssignSchema = {
  params: {
    type: "object",
    required: ["taskId"],
    additionalProperties: false,
    properties: {
      taskId: { type: "string", minLength: 1 },
    },
  },
  body: {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          userId: { type: "string", minLength: 1 }, // test-mode fallback only
        },
      },
      { type: "null" },
    ],
  },
};

const taskInboxSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      status: { type: "string", minLength: 1 },
      limit: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      offset: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      userId: { type: "string", minLength: 1 }, // test-mode fallback only
    },
  },
};

export async function registerTaskRoutes(app: FastifyInstance) {
  app.get("/api/v1/tasks/inbox", { schema: taskInboxSchema }, async (request, reply) => {
    // H1: Derive userId from JWT token
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    const q = request.query as { authorityId?: string; status?: string; limit?: string; offset?: string };
    if (request.authUser?.userType === "OFFICER") {
      const officerAuthorities = Array.from(
        new Set(
          (request.authUser.postings || [])
            .map((posting) => posting.authority_id)
            .filter((authorityId): authorityId is string => Boolean(authorityId))
        )
      );
      if (!q.authorityId && officerAuthorities.length > 1) {
        return send400(
          reply,
          "AUTHORITY_ID_REQUIRED",
          "authorityId query parameter is required when officer has access to multiple authorities"
        );
      }
      if (q.authorityId) {
        const allowed = requireAuthorityStaffAccess(
          request,
          reply,
          q.authorityId,
          "You are not allowed to access inbox tasks in this authority"
        );
        if (!allowed) return;
      }
    }
    const limit = Math.min(parseInt(q.limit || "100", 10), 200);
    const offset = parseInt(q.offset || "0", 10);
    const inboxTasks = await tasks.getInboxTasks(userId, q.authorityId, q.status || "PENDING", limit, offset);
    return { tasks: inboxTasks, total: inboxTasks.length };
  });

  app.post("/api/v1/tasks/:taskId/assign", { schema: taskAssignSchema }, async (request, reply) => {
    const params = request.params as { taskId: string };
    // H1: Use JWT userId, not body
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    const rbacCheck = await tasks.validateOfficerCanActOnTask(userId, params.taskId);
    if (!rbacCheck.authorized) {
      return send403(reply, "FORBIDDEN", rbacCheck.error);
    }
    try {
      await tasks.assignTask(params.taskId, userId);
      return { success: true };
    } catch (error: any) {
      return send400(reply, error.message);
    }
  });

  app.post("/api/v1/tasks/:taskId/actions", { schema: taskActionSchema }, async (request, reply) => {
    const params = request.params as { taskId: string };
    const body = request.body as {
      action: "FORWARD" | "QUERY" | "APPROVE" | "REJECT";
      remarks?: string; queryMessage?: string;
      unlockedFields?: string[]; unlockedDocuments?: string[];
      verificationData?: Record<string, any>;
      mfaChallengeId?: string;
      mfaCode?: string;
    };
    // H1: Use JWT userId
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    const rbacCheck = await tasks.validateOfficerCanActOnTask(userId, params.taskId);
    if (!rbacCheck.authorized) {
      return send403(reply, "FORBIDDEN", rbacCheck.error);
    }
    const mfaRequired =
      request.authUser?.userType === "OFFICER" &&
      isDecisionAction(body.action) &&
      (await isOfficerDecisionMfaRequired(userId, rbacCheck.authorityId, rbacCheck.systemRoles));

    if (mfaRequired) {
      if (!body.mfaChallengeId || !body.mfaCode) {
        return send403(
          reply,
          "MFA_REQUIRED",
          "MFA verification is required for approval and rejection actions"
        );
      }
      const mfaResult = await verifyMfaChallenge({
        challengeId: body.mfaChallengeId,
        userId,
        purpose: MFA_PURPOSE_TASK_DECISION,
        code: body.mfaCode,
        taskId: params.taskId,
      });
      if (!mfaResult.ok) {
        const code = mfaResult.error || "INVALID_CODE";
        const errorMap: Record<string, string> = {
          CHALLENGE_NOT_FOUND: "MFA_CHALLENGE_INVALID",
          CHALLENGE_EXPIRED: "MFA_CHALLENGE_EXPIRED",
          CHALLENGE_ALREADY_USED: "MFA_CHALLENGE_ALREADY_USED",
          CHALLENGE_LOCKED: "MFA_CHALLENGE_LOCKED",
          TASK_MISMATCH: "MFA_CHALLENGE_INVALID",
          INVALID_CODE: "MFA_CODE_INVALID",
        };
        return send403(reply, errorMap[code] || "MFA_VERIFICATION_FAILED");
      }
    }
    try {
      const result = await tasks.takeActionOnTask(
        params.taskId, body.action, userId, rbacCheck.systemRoles,
        body.remarks, body.queryMessage, body.unlockedFields, body.unlockedDocuments,
        body.verificationData
      );
      if (!result.success) {
        return send400(reply, result.error || "ACTION_FAILED");
      }
      if (result.arn && (result.newStateId === "APPROVED" || result.newStateId === "REJECTED")) {
        const appRecord = await applications.getApplication(result.arn);
        if (appRecord) {
          const decision = result.newStateId === "APPROVED" ? "APPROVED" : "REJECTED";
          let resolvedOutputAction: string | null = result.outputAction || null;
          let templateId = outputs.templateIdFromOutputAction(resolvedOutputAction);
          if (!templateId) {
            const resolved = await outputs.resolveTemplateIdForDecisionState(
              appRecord.service_key,
              appRecord.service_version,
              decision
            );
            templateId = resolved.templateId;
            resolvedOutputAction = resolved.outputAction;
          }
          try {
            if (templateId) {
              const outputRecord = await outputs.generateOutput(appRecord.arn, templateId, appRecord.service_key);
              // Issue document to citizen's locker
              try {
                if (appRecord.applicant_user_id && outputRecord.storage_key) {
                  const basename = outputRecord.storage_key.split("/").pop() || "certificate.pdf";
                  await documents.issueCitizenDocument(
                    appRecord.applicant_user_id,
                    `output_${appRecord.service_key}`,
                    outputRecord.storage_key,
                    basename,
                    "application/pdf",
                    0,
                    appRecord.public_arn || appRecord.arn,
                    outputRecord.valid_from ? outputRecord.valid_from.toISOString().split("T")[0] : null,
                    outputRecord.valid_to ? outputRecord.valid_to.toISOString().split("T")[0] : null
                  );
                }
              } catch (e) { request.log.warn(e, "Issuing document to locker failed"); }
            } else {
              request.log.warn(
                {
                  arn: appRecord.arn,
                  serviceKey: appRecord.service_key,
                  decision,
                  outputAction: resolvedOutputAction,
                },
                "Skipping output generation: no workflow output action resolved"
              );
            }
          } catch (e) { request.log.warn(e, "Output generation failed"); }
          const closeTx = result.newStateId === "APPROVED" ? "CLOSE_APPROVED" : "CLOSE_REJECTED";
          try {
            const closeResult = await executeTransition(appRecord.arn, closeTx, "system", "SYSTEM", []);
            if (!closeResult.success && closeResult.error !== "TRANSITION_NOT_FOUND") {
              request.log.warn({ error: closeResult.error }, "Close transition failed");
            }
          } catch (e) { request.log.warn(e, "Close transition failed"); }
        }
      }
      return { success: true, newStateId: result.newStateId, arn: result.arn };
    } catch (error: any) {
      return send400(reply, error.message);
    }
  });
}
