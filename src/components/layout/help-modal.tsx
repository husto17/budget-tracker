"use client";

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

interface Section {
  title: string;
  items: Array<{ keys?: string; label: string; desc?: string }>;
}

const SECTIONS: Section[] = [
  {
    title: "Navigation",
    items: [
      { keys: "⌘ K", label: "Command palette — search, jump, filter" },
      { keys: "g d", label: "Go to Dashboard" },
      { keys: "g t", label: "Go to Transactions" },
      { keys: "g a", label: "Go to Accounts" },
      { keys: "g c", label: "Go to Categories" },
      { keys: "g g", label: "Go to Goals" },
      { keys: "g i", label: "Go to Insights" },
      { keys: "g u", label: "Go to Upload Statement" },
      { keys: "g q", label: "Go to Snap (photo capture)" },
      { keys: "g s", label: "Go to Settings" },
      { keys: "g ?", label: "Go to Ask (AI)" },
      { keys: "/", label: "Focus the search input (when on a page with one)" },
      { keys: "?", label: "Open this help" },
    ],
  },
  {
    title: "Auto-categorisation & learning",
    items: [
      {
        label: "Categorising learns by default",
        desc: "Pick a category for a transaction and the app saves a rule keyed by merchant name — future uploads of that merchant land in the same category.",
      },
      {
        label: "Gifts / Other / Transfers never learn",
        desc: "The server auto-skips rule creation for these three — they're contextual, not merchant-patterns.",
      },
      {
        label: "Undo a learned rule",
        desc: "After categorising, the success toast has a Don't remember action. One click deletes the rule (the category stays).",
      },
      {
        label: "Pause learning for a batch",
        desc: "On Transactions, the banner at top toggles learning off for all edits until you turn it back on. Survives page navigation.",
      },
      {
        label: "Per-transaction remember toggle",
        desc: "In the transaction drawer, the Remember [merchant] → [category] checkbox applies to just that one edit.",
      },
      {
        label: "Clean up + categorize button",
        desc: "Top of Transactions. Manually re-runs merchant normalisation + auto-rules against every transaction.",
      },
      {
        label: "Silent reprocess on first visit",
        desc: "Transactions auto-runs the clean-up once per browser session when you load it, so new rules take effect without you clicking.",
      },
    ],
  },
  {
    title: "Search operators",
    items: [
      { label: "amount:>100", desc: "Greater than $100. Also works with < or ranges (amount:50-200)." },
      { label: "category:dining", desc: "Match a category by partial name." },
      { label: "merchant:amazon", desc: "Merchant-only match (skips description body)." },
      { label: "account:chase", desc: "Filter to accounts whose name contains 'chase'." },
      { label: "from:2026-01-01 to:2026-03-31", desc: "Restrict by date range. Works with only one side too." },
      { label: "Combine freely", desc: "e.g. \"amazon amount:>50 category:shopping\" — plain text still matches description/merchant." },
    ],
  },
  {
    title: "Transactions page",
    items: [
      {
        label: "Click a merchant name",
        desc: "Opens the transaction drawer on the right with all fields editable plus split / transfer / delete actions.",
      },
      {
        label: "Bulk select",
        desc: "Tick row checkboxes. A black toolbar slides up with Categorize X / Link as transfer actions, plus one-click Undo on the success toast.",
      },
      {
        label: "Transfer pairs collapse",
        desc: "When two transactions match as a transfer, they render as one combined row with an expand chevron. Delete one side and the other unlinks automatically.",
      },
      {
        label: "Merchant rename also learns",
        desc: "Rename a merchant in the drawer (e.g. AMAZON RETA* B504 → Amazon Marketplace) and the MerchantAlias saves it. Future uploads auto-rename.",
      },
      {
        label: "Split-the-bill reimbursements",
        desc: "Paid $200 for dinner and friends Venmo'd you back $160? Open the $200 tx → Link a reimbursement → pick the Venmo credits → your net cost shows as $40 everywhere. Works many-to-one (multiple friends → one dinner) and one-to-many (one lump-sum Venmo → multiple charges).",
      },
    ],
  },
  {
    title: "Elsewhere",
    items: [
      {
        label: "Click any category chip, pie slice, or strip segment",
        desc: "Deep-links to Transactions pre-filtered by that category. Works on dashboard, insights, and the category list.",
      },
      {
        label: "Ask (AI)",
        desc: "Natural-language Q&A over your data. Tries tools against your live DB — works for questions like 'how much on dining in April?' or 'what subscriptions could I cut?'",
      },
      {
        label: "Goals",
        desc: "Savings targets with progress rings. Target amount + optional deadline → app shows % complete, $ remaining, and days until target.",
      },
      {
        label: "Dark mode",
        desc: "Sun/Moon button in the sidebar footer, next to Sign out. Follows system by default.",
      },
      {
        label: "Install on mobile",
        desc: "iOS Safari / Android Chrome → Share → Add to Home Screen. Opens standalone like a native app.",
      },
    ],
  },
];

function KbdKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center text-[10px] font-semibold min-w-[1.25rem] h-5 px-1.5 rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono">
      {children}
    </kbd>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpModal({ open, onOpenChange }: Props) {
  // Allow any caller to open via a custom event — useful from links or
  // command palette items without passing a setter through the tree.
  useEffect(() => {
    function onOpen() {
      onOpenChange(true);
    }
    window.addEventListener("help:open", onOpen as EventListener);
    return () => window.removeEventListener("help:open", onOpen as EventListener);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-indigo-500" />
            Shortcuts &amp; tips
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-2">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.items.map((item, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    {item.keys ? (
                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        {item.keys.split(" ").map((k, j) => (
                          <KbdKey key={j}>{k}</KbdKey>
                        ))}
                      </div>
                    ) : (
                      <div className="w-14 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{item.label}</p>
                      {item.desc && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                          {item.desc}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 pt-3 border-t border-gray-100 dark:border-gray-800">
          Press <KbdKey>?</KbdKey> any time to reopen this.
        </p>
      </DialogContent>
    </Dialog>
  );
}
