import { Alert, Button, Card } from "@puda/shared";
import { Task } from "./types";

interface InboxProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  feedback?: { variant: "info" | "success" | "warning" | "error"; text: string } | null;
  onTaskClick: (task: Task) => void;
}

export default function Inbox({ tasks, loading, error, feedback, onTaskClick }: InboxProps) {
  const skeletonItems = [0, 1, 2, 3];

  return (
    <section className="panel">
      {feedback ? <Alert variant={feedback.variant}>{feedback.text}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {!loading && !error && tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <h3>No pending tasks</h3>
          <p>Your inbox is empty. Tasks will appear here when applications need your review.</p>
        </div>
      ) : null}

      {loading ? (
        <ul className="task-list officer-skeleton-list" aria-label="Loading tasks">
          {skeletonItems.map((idx) => (
            <li key={idx}>
              <Card className="task-card-wrap task-card-skeleton" aria-hidden="true">
                <div className="skeleton skeleton-task-title" />
                <div className="skeleton skeleton-task-line" />
                <div className="skeleton skeleton-task-line short" />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <li key={task.task_id}>
              <Card className="task-card-wrap">
                <Button type="button" variant="ghost" className="task-card" onClick={() => onTaskClick(task)}>
                  <div>
                    <h2>ARN: {task.arn}</h2>
                    <p>
                      Service:{" "}
                      {task.service_key
                        ?.replace(/_/g, " ")
                        .replace(/\b\w/g, (l: string) => l.toUpperCase()) || "—"}
                    </p>
                    {task.applicant_name && <p>Applicant: {task.applicant_name}</p>}
                    <p>
                      Stage: {task.state_id} | Required Role: {task.system_role_id}
                    </p>
                    {task.sla_due_at && (
                      <p className={new Date(task.sla_due_at) < new Date() ? "sla-overdue" : ""}>
                        SLA Due: {new Date(task.sla_due_at).toLocaleString()}
                        {new Date(task.sla_due_at) < new Date() && " (Overdue)"}
                      </p>
                    )}
                  </div>
                  <span className="badge">{task.status}</span>
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
