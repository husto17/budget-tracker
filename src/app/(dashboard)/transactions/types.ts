export interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  isJoint?: boolean;
}

export interface TransactionSplit {
  id: string;
  amount: number;
  note: string | null;
  categoryId: string | null;
  category: Category | null;
}

export interface ReimbursementLink {
  id: string;
  amount: number;
  note: string | null;
  settled: boolean;
  reimbursementTx?: {
    id: string;
    date: string | Date;
    merchant: string | null;
    description: string;
    amount: number;
  };
  originalTx?: {
    id: string;
    date: string | Date;
    merchant: string | null;
    description: string;
    amount: number;
  };
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  isCredit: boolean;
  isPending: boolean;
  isReconciled: boolean;
  isExcluded: boolean;
  source: string;
  category: Category | null;
  account: Account;
  notes: string | null;
  transferPairId: string | null;
  transferPair: { account: { id: string; name: string } } | null;
  splits: TransactionSplit[];
  reimbursementsReceived?: ReimbursementLink[];
  reimbursementsApplied?: ReimbursementLink[];
  payerUserId?: string | null;
  tags?: Array<{ tag: Tag }>;
}

// Net amount after subtracting linked reimbursements (for debits) or applied
// offsets (for credits). The `offset` is the amount that's been reimbursed.
export function netOfReimbursements(tx: Transaction): { net: number; offset: number } {
  const offset = tx.isCredit
    ? (tx.reimbursementsApplied ?? []).reduce((s, r) => s + r.amount, 0)
    : (tx.reimbursementsReceived ?? []).reduce((s, r) => s + r.amount, 0);
  return { net: Math.max(tx.amount - offset, 0), offset };
}
