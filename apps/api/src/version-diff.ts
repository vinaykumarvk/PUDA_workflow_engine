/**
 * Structural diff helpers for comparing two service-version configs.
 */

export interface DiffResult<T> {
  added: T[];
  removed: T[];
  changed: { before: T; after: T }[];
}

// ---- Workflow diff ----

interface WorkflowState {
  stateId: string;
  [key: string]: unknown;
}

interface WorkflowTransition {
  transitionId: string;
  [key: string]: unknown;
}

interface WorkflowConfig {
  states?: WorkflowState[];
  transitions?: WorkflowTransition[];
}

function diffByKey<T extends Record<string, unknown>>(
  keyField: string,
  listA: T[],
  listB: T[]
): DiffResult<T> {
  const mapA = new Map(listA.map((item) => [item[keyField] as string, item]));
  const mapB = new Map(listB.map((item) => [item[keyField] as string, item]));

  const added: T[] = [];
  const removed: T[] = [];
  const changed: { before: T; after: T }[] = [];

  for (const [key, itemA] of mapA) {
    const itemB = mapB.get(key);
    if (!itemB) {
      removed.push(itemA);
    } else if (JSON.stringify(itemA) !== JSON.stringify(itemB)) {
      changed.push({ before: itemA, after: itemB });
    }
  }
  for (const [key, itemB] of mapB) {
    if (!mapA.has(key)) {
      added.push(itemB);
    }
  }

  return { added, removed, changed };
}

export function diffWorkflows(
  a: WorkflowConfig | undefined,
  b: WorkflowConfig | undefined
): { states: DiffResult<WorkflowState>; transitions: DiffResult<WorkflowTransition> } {
  const statesA = a?.states ?? [];
  const statesB = b?.states ?? [];
  const transitionsA = a?.transitions ?? [];
  const transitionsB = b?.transitions ?? [];

  return {
    states: diffByKey<WorkflowState>("stateId", statesA, statesB),
    transitions: diffByKey<WorkflowTransition>("transitionId", transitionsA, transitionsB),
  };
}

// ---- Documents diff ----

interface DocumentType {
  docTypeId: string;
  [key: string]: unknown;
}

interface DocumentsConfig {
  documentTypes?: DocumentType[];
}

export function diffDocuments(
  a: DocumentsConfig | undefined,
  b: DocumentsConfig | undefined
): DiffResult<DocumentType> {
  const docsA = a?.documentTypes ?? [];
  const docsB = b?.documentTypes ?? [];
  return diffByKey<DocumentType>("docTypeId", docsA, docsB);
}
