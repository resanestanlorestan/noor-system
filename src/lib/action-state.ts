// Shared server-action result shapes (imported by every actions module).

export type DuplicateHint = {
  caseId: string;
  name: string;
  location: string | null;
  status: string;
  reason: string;
};

export type ActionState = {
  error?: string;
  success?: string;
  warning?: boolean;
  duplicates?: DuplicateHint[];
  globalIdDuplicate?: boolean;
  existingCaseId?: string;
};

export const emptyState: ActionState = {};
