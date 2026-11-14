export type DuplicateHint = { caseId: string; name: string; location: string | null; status: string; reason: string };
export type ActionState = { error?: string; success?: string; existingCaseId?: string; qrDataUrl?: string; secret?: string; recoveryCodes?: string[]; mfaToken?: string; token?: string; devLink?: string; warning?: boolean; duplicates?: DuplicateHint[]; globalIdDuplicate?: boolean; devCode?: string; mobile?: string };
export const initialActionState: ActionState = {};
