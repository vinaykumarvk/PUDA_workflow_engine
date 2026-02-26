import { describe, expect, it } from "vitest";
import { diffWorkflows, diffDocuments } from "./version-diff";

describe("diffWorkflows", () => {
  it("returns empty diffs for identical workflows", () => {
    const wf = {
      states: [
        { stateId: "DRAFT", label: "Draft", type: "initial" },
        { stateId: "REVIEW", label: "Review", type: "task" },
      ],
      transitions: [
        { transitionId: "t1", fromState: "DRAFT", toState: "REVIEW", action: "submit" },
      ],
    };
    const result = diffWorkflows(wf, wf);
    expect(result.states.added).toHaveLength(0);
    expect(result.states.removed).toHaveLength(0);
    expect(result.states.changed).toHaveLength(0);
    expect(result.transitions.added).toHaveLength(0);
    expect(result.transitions.removed).toHaveLength(0);
    expect(result.transitions.changed).toHaveLength(0);
  });

  it("detects added states", () => {
    const a = { states: [{ stateId: "DRAFT", label: "Draft" }], transitions: [] };
    const b = {
      states: [
        { stateId: "DRAFT", label: "Draft" },
        { stateId: "REVIEW", label: "Review" },
      ],
      transitions: [],
    };
    const result = diffWorkflows(a, b);
    expect(result.states.added).toHaveLength(1);
    expect(result.states.added[0].stateId).toBe("REVIEW");
    expect(result.states.removed).toHaveLength(0);
  });

  it("detects removed states", () => {
    const a = {
      states: [
        { stateId: "DRAFT", label: "Draft" },
        { stateId: "REVIEW", label: "Review" },
      ],
      transitions: [],
    };
    const b = { states: [{ stateId: "DRAFT", label: "Draft" }], transitions: [] };
    const result = diffWorkflows(a, b);
    expect(result.states.removed).toHaveLength(1);
    expect(result.states.removed[0].stateId).toBe("REVIEW");
    expect(result.states.added).toHaveLength(0);
  });

  it("detects changed states", () => {
    const a = { states: [{ stateId: "DRAFT", label: "Draft", slaDays: 3 }], transitions: [] };
    const b = { states: [{ stateId: "DRAFT", label: "Draft", slaDays: 5 }], transitions: [] };
    const result = diffWorkflows(a, b);
    expect(result.states.changed).toHaveLength(1);
    expect(result.states.changed[0].before.slaDays).toBe(3);
    expect(result.states.changed[0].after.slaDays).toBe(5);
  });

  it("detects added transitions", () => {
    const a = { states: [], transitions: [] };
    const b = {
      states: [],
      transitions: [{ transitionId: "t1", fromState: "A", toState: "B" }],
    };
    const result = diffWorkflows(a, b);
    expect(result.transitions.added).toHaveLength(1);
    expect(result.transitions.added[0].transitionId).toBe("t1");
  });

  it("handles undefined inputs gracefully", () => {
    const result = diffWorkflows(undefined, undefined);
    expect(result.states.added).toHaveLength(0);
    expect(result.transitions.added).toHaveLength(0);
  });

  it("treats undefined vs populated as all added", () => {
    const b = {
      states: [{ stateId: "DRAFT", label: "Draft" }],
      transitions: [{ transitionId: "t1", fromState: "DRAFT", toState: "END" }],
    };
    const result = diffWorkflows(undefined, b);
    expect(result.states.added).toHaveLength(1);
    expect(result.transitions.added).toHaveLength(1);
    expect(result.states.removed).toHaveLength(0);
    expect(result.transitions.removed).toHaveLength(0);
  });
});

describe("diffDocuments", () => {
  it("returns empty diffs for identical document lists", () => {
    const docs = {
      documentTypes: [
        { docTypeId: "ID_PROOF", label: "ID Proof", mandatory: true },
        { docTypeId: "ADDRESS_PROOF", label: "Address Proof", mandatory: false },
      ],
    };
    const result = diffDocuments(docs, docs);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  it("detects added document types", () => {
    const a = { documentTypes: [{ docTypeId: "ID_PROOF", label: "ID Proof" }] };
    const b = {
      documentTypes: [
        { docTypeId: "ID_PROOF", label: "ID Proof" },
        { docTypeId: "PHOTO", label: "Photo" },
      ],
    };
    const result = diffDocuments(a, b);
    expect(result.added).toHaveLength(1);
    expect(result.added[0].docTypeId).toBe("PHOTO");
  });

  it("detects removed document types", () => {
    const a = {
      documentTypes: [
        { docTypeId: "ID_PROOF", label: "ID Proof" },
        { docTypeId: "PHOTO", label: "Photo" },
      ],
    };
    const b = { documentTypes: [{ docTypeId: "ID_PROOF", label: "ID Proof" }] };
    const result = diffDocuments(a, b);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].docTypeId).toBe("PHOTO");
  });

  it("detects changed document types", () => {
    const a = { documentTypes: [{ docTypeId: "ID_PROOF", label: "ID Proof", mandatory: true }] };
    const b = { documentTypes: [{ docTypeId: "ID_PROOF", label: "ID Proof", mandatory: false }] };
    const result = diffDocuments(a, b);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].before.mandatory).toBe(true);
    expect(result.changed[0].after.mandatory).toBe(false);
  });

  it("handles undefined inputs", () => {
    const result = diffDocuments(undefined, undefined);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });
});
