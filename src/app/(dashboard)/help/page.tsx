"use client";

import { useState } from "react";
import {
  ChevronDown, ChevronUp, Upload, Wallet, Tags, ArrowUpDown,
  TrendingUp, Sparkles, Target, Receipt, Zap, BarChart3,
  ArrowLeftRight, Trash2, BookOpen, Tag, FileText, Ban,
  SplitSquareHorizontal, Link2, Settings, HelpCircle,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  summary: string;
  content: React.ReactNode;
}

function AccordionItem({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-indigo-500 shrink-0">{section.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{section.title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{section.summary}</p>
        </div>
        <span className="text-gray-400 dark:text-gray-500 shrink-0">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100 dark:border-gray-800 text-sm text-gray-700 dark:text-gray-300 space-y-3 leading-relaxed">
          {section.content}
        </div>
      )}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800/40 rounded-lg px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
      💡 {children}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center mt-0.5">{n}</span>
      <span>{children}</span>
    </div>
  );
}

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    icon: <BookOpen className="w-5 h-5" />,
    title: "Getting Started",
    summary: "Add accounts, upload your first statement, and get oriented",
    content: (
      <div className="space-y-3">
        <Step n={1}>Go to <Link href="/accounts" className="text-indigo-600 hover:underline font-medium">Accounts</Link> and add each bank/credit card account you want to track. Set the account type (Checking, Savings, Credit Card, etc.).</Step>
        <Step n={2}>Go to <Link href="/upload" className="text-indigo-600 hover:underline font-medium">Upload</Link> and drag in a PDF statement or CSV export from your bank. The parser runs automatically — supported banks include Chase, Bank of America, Wells Fargo, Citi, American Express, Discover, Apple Card, and more.</Step>
        <Step n={3}>Visit <Link href="/transactions" className="text-indigo-600 hover:underline font-medium">Transactions</Link> and start categorizing. Each time you assign a category, a rule is quietly learned so future uploads auto-categorize the same merchant.</Step>
        <Step n={4}>Once you have a few months of data, <Link href="/insights" className="text-indigo-600 hover:underline font-medium">Insights</Link> and the <Link href="/dashboard" className="text-indigo-600 hover:underline font-medium">Dashboard</Link> will show patterns, trends, and budget progress.</Step>
        <Tip>Upload 3+ months of statements to unlock subscription detection, anomaly alerts, year-over-year charts, and payday pattern analysis.</Tip>
      </div>
    ),
  },
  {
    id: "upload",
    icon: <Upload className="w-5 h-5" />,
    title: "Uploading Statements",
    summary: "PDF and CSV import, supported banks, duplicate handling",
    content: (
      <div className="space-y-3">
        <p>Drag a <strong>PDF statement</strong> or <strong>CSV export</strong> onto the upload area and select which account it belongs to. The parser extracts transactions, amounts, and dates automatically.</p>
        <p><strong>Supported banks (PDF):</strong> Chase (checking, savings, credit), Bank of America (checking, credit), Wells Fargo, Citi, American Express, Discover, Capital One, Apple Card, Ally Bank, and generic CSV from any institution.</p>
        <p><strong>Duplicates are safe:</strong> each transaction gets a hash based on date + amount + description. Uploading the same statement twice won't create double entries — duplicates are detected and skipped.</p>
        <p><strong>Pending transactions:</strong> if you take a screenshot of your pending charges, those are imported as "pending" and later matched to the posted statement automatically.</p>
        <Tip>If your bank isn't listed, try exporting a CSV from your bank's website. Most CSV formats are recognized automatically.</Tip>
      </div>
    ),
  },
  {
    id: "transactions",
    icon: <ArrowUpDown className="w-5 h-5" />,
    title: "Transactions",
    summary: "Categorize, search, filter, split, tag, exclude, and export",
    content: (
      <div className="space-y-3">
        <p><strong>Categorizing:</strong> click the category dropdown on any row, or open the drawer (click the row) for a full edit panel. The "Remember" checkbox controls whether a rule is created for that merchant.</p>
        <p><strong>Search operators:</strong> the search box supports smart filters:</p>
        <ul className="list-disc list-inside space-y-1 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 font-mono">
          <li>amount:&gt;100 — transactions over $100</li>
          <li>amount:50-150 — between $50 and $150</li>
          <li>category:dining — by category name (partial match)</li>
          <li>merchant:amazon — by merchant name</li>
          <li>from:2026-01-01 to:2026-03-31 — date range</li>
        </ul>
        <p><strong>Splitting:</strong> use the scissors icon to split one transaction into multiple categories (e.g. a $200 Target run that was 60% groceries, 40% household).</p>
        <p><strong>Transfer linking:</strong> if a transfer between your own accounts shows as two transactions, link them with the transfer icon so they cancel out in spending totals.</p>
        <p><strong>Tags:</strong> open the drawer and add free-form tags (e.g. "work reimbursable", "vacation", "gift"). Tags can be filtered in the transactions list.</p>
        <p><strong>Notes:</strong> add a free-text note to any transaction in the drawer — useful for "this was the vet bill for Mango" context.</p>
        <p><strong>Exclude from totals:</strong> toggle "Exclude from totals" in the drawer to hide a transaction from all budget and spending math without deleting it. Useful for business expenses you'll expense elsewhere.</p>
        <p><strong>Export CSV:</strong> the Export button downloads everything matching your current filters as a CSV.</p>
        <Tip>Use the bulk action bar (select multiple rows with the checkbox) to categorize many transactions at once.</Tip>
      </div>
    ),
  },
  {
    id: "categories",
    icon: <Tags className="w-5 h-5" />,
    title: "Categories & Budgets",
    summary: "Create categories, set monthly budgets, enable rollover",
    content: (
      <div className="space-y-3">
        <p>Categories are created in <Link href="/categories" className="text-indigo-600 hover:underline font-medium">Categories</Link>. Each can have a custom color and emoji icon.</p>
        <p><strong>Monthly budgets:</strong> set a cap per category. The dashboard shows a progress bar for each budgeted category and fires an alert when you hit 80%.</p>
        <p><strong>Rollover budgets:</strong> toggle "Rollover" on a category. If you spend less than your budget last month, the leftover rolls into this month's allowance. Great for irregular expenses like clothing or travel.</p>
        <p><strong>Total budget summary:</strong> the dashboard header shows your combined budget across all categories vs total spend this month.</p>
        <Tip>Default categories (Groceries, Dining, Transport, etc.) are seeded automatically on first login. You can rename, recolor, or delete any of them.</Tip>
      </div>
    ),
  },
  {
    id: "rules",
    icon: <Zap className="w-5 h-5" />,
    title: "Auto-Categorization Rules",
    summary: "Rules automatically assign categories on every import",
    content: (
      <div className="space-y-3">
        <p>Rules are managed in <Link href="/rules" className="text-indigo-600 hover:underline font-medium">Rules</Link>. Each rule has a <strong>pattern</strong> (merchant name contains…) and a <strong>target category</strong>.</p>
        <p><strong>Auto-learning:</strong> whenever you manually change a transaction's category in the drawer, a rule is quietly created for that merchant — so next time you upload a statement, that merchant is already categorized. You'll see the learned rule appear in the Rules page.</p>
        <p><strong>Manual rules:</strong> create rules with partial matches (e.g. "Whole Foods" → Groceries) or regex for advanced patterns. Set priority to control which rule wins when multiple match — higher number = higher priority.</p>
        <p><strong>One-off override:</strong> uncheck "Remember" in the transaction drawer to categorize without creating a rule for that specific transaction.</p>
        <Tip>The "Gifts", "Other", and "Transfers" categories are intentionally never learned — a one-off gift purchase shouldn't auto-categorize every future transaction from that merchant as a gift.</Tip>
      </div>
    ),
  },
  {
    id: "tags",
    icon: <Tag className="w-5 h-5" />,
    title: "Tags",
    summary: "Free-form labels that cross categories — filter and search by tag",
    content: (
      <div className="space-y-3">
        <p>Tags are free-form labels you can attach to any transaction in addition to its category. Unlike categories (one per transaction), you can add multiple tags.</p>
        <p><strong>Adding tags:</strong> open the transaction drawer → Tags section → type a name and press Enter, or click an existing tag chip to apply it.</p>
        <p><strong>Use cases:</strong> "work reimbursable" to track what your employer owes you, "vacation 2026" to group trip expenses across categories, "tax deductible" for year-end, "Hasan" or "partner" to split joint expenses.</p>
        <p><strong>Filtering by tag:</strong> use the tag filter dropdown in Transactions to see all transactions with a specific tag.</p>
      </div>
    ),
  },
  {
    id: "insights",
    icon: <TrendingUp className="w-5 h-5" />,
    title: "Insights",
    summary: "Charts, trends, anomalies, subscriptions, and behavioral patterns",
    content: (
      <div className="space-y-3">
        <p><Link href="/insights" className="text-indigo-600 hover:underline font-medium">Insights</Link> is the analytics hub. Use the range picker (3m / 6m / 12m / Custom) to control the time window, and the account filter to scope to a single account.</p>
        <p><strong>Spending by Category (stacked bars):</strong> shows how spending breaks down each month. Bars use your custom category colors. Categories beyond the top 8 roll up into "Other".</p>
        <p><strong>Income vs Spending:</strong> monthly income and spending as lines. A large gap = strong savings month.</p>
        <p><strong>Savings Rate:</strong> (income − spending) ÷ income as a percentage each month.</p>
        <p><strong>Anomaly detection:</strong> flags categories where this month's spending is 1.5× the historical average. Click any anomaly to jump to those transactions.</p>
        <p><strong>Subscriptions & Recurring:</strong> detected from consistent merchant + amount patterns. Shows cadence (monthly, annual, etc.), next expected charge date, and monthly-equivalent cost.</p>
        <p><strong>Surprise expenses:</strong> one-off charges over 2× your usual category average that aren't part of a recurring pattern — the budget killers.</p>
        <p><strong>Merchant loyalty:</strong> merchants you visit 3+ times, sorted by frequency, with a trend (↑ going more often, ↓ less often).</p>
        <p><strong>Payday pattern:</strong> detects likely pay dates from income credits, then shows spending by day-of-month so you can see if you splurge right after payday.</p>
        <p><strong>Year-over-year:</strong> compares same months across two years. Requires data spanning 2+ calendar years.</p>
        <p><strong>Categorization health:</strong> a score showing what % of your transactions (and spend amount) are categorized. Below 80 = time to catch up in Transactions.</p>
        <Tip>The "Bill timing risk" card flags subscriptions whose next charge date falls near month-end or month-start, when balances may be lower.</Tip>
      </div>
    ),
  },
  {
    id: "dashboard",
    icon: <BarChart3 className="w-5 h-5" />,
    title: "Dashboard",
    summary: "Monthly overview, budget progress, upcoming bills, and net worth",
    content: (
      <div className="space-y-3">
        <p>The <Link href="/dashboard" className="text-indigo-600 hover:underline font-medium">Dashboard</Link> is your month-at-a-glance. Use the month picker to browse any historical month.</p>
        <p><strong>Net balance:</strong> sum of all account balances (checking + savings − credit card debt). The sparkline shows your daily spending over the last 30 days.</p>
        <p><strong>Budget alerts:</strong> categories at 80%+ of budget show colored pills below the header. Red = over budget.</p>
        <p><strong>Cash flow forecast:</strong> projects end-of-month spending based on your pace so far this month plus upcoming subscription charges. Compares against last month.</p>
        <p><strong>Upcoming bills:</strong> subscriptions with next charge dates in the next 21 days.</p>
        <p><strong>Spending strip:</strong> the proportional colored bar shows this month's category breakdown visually.</p>
        <p><strong>Net worth over time:</strong> balance history chart for the last 6 months. Only shown when there's enough data.</p>
        <p><strong>View filter:</strong> on household accounts with a partner, filter the dashboard to Mine / Partner's / Joint / All.</p>
        <Tip>Click any bar in the Monthly Totals chart to jump directly to that month's transactions.</Tip>
      </div>
    ),
  },
  {
    id: "goals",
    icon: <Target className="w-5 h-5" />,
    title: "Goals",
    summary: "Track savings targets with optional live account balance sync",
    content: (
      <div className="space-y-3">
        <p>Create goals in <Link href="/goals" className="text-indigo-600 hover:underline font-medium">Goals</Link> — each has a name, target amount, optional target date, and color.</p>
        <p><strong>Linked account:</strong> link a goal to one of your accounts (e.g. a high-yield savings account) and the goal's current progress automatically reflects that account's live balance — no manual updates needed.</p>
        <p><strong>Manual progress:</strong> for goals not tied to an account, update the current amount manually whenever you make progress.</p>
      </div>
    ),
  },
  {
    id: "ask",
    icon: <Sparkles className="w-5 h-5" />,
    title: "Ask AI",
    summary: "Chat with an AI that knows your spending data",
    content: (
      <div className="space-y-3">
        <p><Link href="/ask" className="text-indigo-600 hover:underline font-medium">Ask</Link> is an AI assistant with full access to your transaction history and budget data. Ask it anything about your finances.</p>
        <p><strong>Example questions:</strong></p>
        <ul className="list-disc list-inside space-y-1 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
          <li>"How much did I spend on dining last month?"</li>
          <li>"Which month was my highest spending month this year?"</li>
          <li>"Am I on track to hit my savings goal?"</li>
          <li>"What are my top 5 merchants year to date?"</li>
          <li>"Compare my grocery spending to the month before"</li>
        </ul>
        <p>Responses stream in real time. Use the copy button on any response to grab the text.</p>
        <Tip>Ask has access to the same data as Insights — it can answer questions about anomalies, subscriptions, and category trends that aren't shown in a chart.</Tip>
      </div>
    ),
  },
  {
    id: "reimbursements",
    icon: <Receipt className="w-5 h-5" />,
    title: "Reimbursements",
    summary: "Track when someone pays you back for a shared expense",
    content: (
      <div className="space-y-3">
        <p>In <Link href="/reimbursements" className="text-indigo-600 hover:underline font-medium">Reimbursements</Link>, you can link an inbound credit (Venmo, Zelle, wire) to the original debit it reimburses.</p>
        <p><strong>How it works:</strong> the reimbursement amount is subtracted from the original debit in all spending totals. A fully-reimbursed expense drops out of budgets entirely.</p>
        <p><strong>Creating a link:</strong> go to Transactions, find the original debit, open the drawer → Reimbursements section → link it to the credit that came in.</p>
        <p><strong>Partial reimbursements:</strong> if only part of the expense was paid back, set the partial amount. The remainder still counts as your spending.</p>
      </div>
    ),
  },
  {
    id: "compare",
    icon: <ArrowLeftRight className="w-5 h-5" />,
    title: "Compare",
    summary: "Side-by-side comparison of any two months",
    content: (
      <div className="space-y-3">
        <p><Link href="/compare" className="text-indigo-600 hover:underline font-medium">Compare</Link> puts two months side by side across all spending categories, with percentage change indicators.</p>
        <p>Use it to quickly see whether a category spiked this month versus last, or to compare January to the same month last year.</p>
      </div>
    ),
  },
  {
    id: "trash",
    icon: <Trash2 className="w-5 h-5" />,
    title: "Trash",
    summary: "Recover accidentally deleted transactions",
    content: (
      <div className="space-y-3">
        <p>Deleted transactions go to <Link href="/trash" className="text-indigo-600 hover:underline font-medium">Trash</Link> rather than being permanently removed. You can restore any transaction from there.</p>
        <p>Transactions in Trash are excluded from all spending, budgets, and insights calculations.</p>
        <Tip>If you accidentally deleted a transaction during an upload, check Trash first before re-uploading.</Tip>
      </div>
    ),
  },
  {
    id: "household",
    icon: <Settings className="w-5 h-5" />,
    title: "Household & Partner",
    summary: "Share data with a partner, split joint account expenses",
    content: (
      <div className="space-y-3">
        <p>In <Link href="/settings" className="text-indigo-600 hover:underline font-medium">Settings</Link>, invite a partner to join your household. Once linked, you both see each other's accounts and transactions in the Dashboard.</p>
        <p><strong>Joint accounts:</strong> mark an account as joint to indicate it's shared. On joint account transactions you can set "Whose expense?" in the drawer — My expense, Partner's expense, or Shared (default).</p>
        <p><strong>Dashboard view filter:</strong> with a partner linked, the Dashboard gains a filter bar: All / Mine / Partner's / Joint to slice the numbers by owner.</p>
        <p><strong>Spending by member:</strong> the Dashboard shows a side-by-side spending breakdown when both partners have data for the month.</p>
      </div>
    ),
  },
];

export default function HelpPage() {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? SECTIONS.filter(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.summary.toLowerCase().includes(search.toLowerCase())
      )
    : SECTIONS;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-indigo-500" />
          Help & Feature Guide
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Everything the app does, explained. Click any section to expand it.
        </p>
      </div>

      {/* Quick-start card */}
      <Card className="border-indigo-200 dark:border-indigo-800/60 bg-indigo-50 dark:bg-indigo-950/20">
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-300 mb-2">Quick start</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { href: "/accounts", label: "1. Add account", icon: <Wallet className="w-4 h-4" /> },
              { href: "/upload", label: "2. Upload statement", icon: <Upload className="w-4 h-4" /> },
              { href: "/transactions", label: "3. Categorize", icon: <Tags className="w-4 h-4" /> },
              { href: "/insights", label: "4. View insights", icon: <TrendingUp className="w-4 h-4" /> },
            ].map((step) => (
              <Link
                key={step.href}
                href={step.href}
                className="flex items-center gap-1.5 px-2.5 py-2 bg-white dark:bg-gray-900 rounded-lg text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-100 dark:border-indigo-800/40 transition-colors"
              >
                {step.icon}
                {step.label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search help topics…"
        className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {/* Accordion */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No sections match &ldquo;{search}&rdquo;</p>
        ) : (
          filtered.map((section) => (
            <AccordionItem key={section.id} section={section} />
          ))
        )}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center pb-4">
        Something missing or broken? The app is actively developed — features update frequently.
      </p>
    </div>
  );
}
