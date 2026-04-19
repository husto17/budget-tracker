import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds, getHouseholdId } from "@/lib/household";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic();

function buildSystemPrompt(): string {
  return `You are a personal finance assistant embedded in a budget-tracker app.

You can answer questions about the user's spending by calling the provided tools. Always use tools to fetch real data — never guess amounts, category names, or merchant names. If the user asks about a specific category, look it up first with list_categories to resolve the id.

Style:
- Concise, direct, no hedging. 1-3 sentences unless the question asks for detail.
- Format money as US dollars ($1,234.56).
- When you return a list of transactions or categories, use markdown bullets or a short table.
- The current date is ${new Date().toISOString().slice(0, 10)}.
- The user's primary currency is USD.

If a question can't be answered from the available tools (e.g. "should I invest in X?"), say so briefly and suggest what you CAN help with.`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_categories",
    description:
      "List all of the user's categories with id, name, color, and transaction count. Use this first when the user asks about a category by name so you can resolve it to an id.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "query_transactions",
    description:
      "Fetch transactions matching optional filters. Returns up to `limit` rows (max 50) ordered by date descending.",
    input_schema: {
      type: "object",
      properties: {
        categoryId: { type: "string" },
        merchantSearch: { type: "string" },
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
        isCredit: { type: "boolean" },
        limit: { type: "integer" },
      },
      required: [],
    },
  },
  {
    name: "get_category_totals",
    description: "Sum spending grouped by category across a date range. Excludes transfers.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "get_monthly_totals",
    description: "Total spending and income per month for the last N months (default 6, max 24).",
    input_schema: {
      type: "object",
      properties: { months: { type: "integer" } },
      required: [],
    },
  },
  {
    name: "get_subscriptions",
    description: "List detected recurring subscriptions (merchants billed monthly at similar amounts).",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_top_merchants",
    description: "Top merchants by spending for a date range.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        limit: { type: "integer" },
      },
      required: [],
    },
  },
];

async function runTool(
  name: string,
  input: Record<string, unknown>,
  userId: string,
  accountIds: string[],
  categoryOwnerWhere: { householdId: string } | { userId: string },
): Promise<unknown> {
  const toDate = (s: unknown) => (typeof s === "string" ? new Date(s) : undefined);

  switch (name) {
    case "list_categories": {
      const cats = await prisma.category.findMany({
        where: categoryOwnerWhere,
        orderBy: { name: "asc" },
        include: { _count: { select: { transactions: true } } },
      });
      return cats.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        monthlyBudget: c.monthlyBudget,
        transactionCount: c._count.transactions,
      }));
    }

    case "query_transactions": {
      const limit = Math.min(Math.max((input.limit as number) || 20, 1), 50);
      const merchantSearch = input.merchantSearch as string | undefined;
      const where: Record<string, unknown> = {
        accountId: { in: accountIds },
        deletedAt: null,
        ...(input.categoryId ? { categoryId: input.categoryId as string } : {}),
        ...(typeof input.isCredit === "boolean" ? { isCredit: input.isCredit } : {}),
      };
      const from = toDate(input.from);
      const to = toDate(input.to);
      if (from || to) {
        where.date = {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        };
      }
      if (merchantSearch) {
        where.OR = [
          { merchant: { contains: merchantSearch, mode: "insensitive" } },
          { description: { contains: merchantSearch, mode: "insensitive" } },
        ];
      }
      const txs = await prisma.transaction.findMany({
        where,
        include: {
          category: { select: { name: true } },
          account: { select: { name: true } },
        },
        orderBy: { date: "desc" },
        take: limit,
      });
      return txs.map((t) => ({
        id: t.id,
        date: t.date.toISOString().slice(0, 10),
        merchant: t.merchant ?? t.description,
        amount: t.amount,
        isCredit: t.isCredit,
        category: t.category?.name ?? null,
        account: t.account.name,
      }));
    }

    case "get_category_totals": {
      const from = toDate(input.from);
      const to = toDate(input.to);
      const txs = await prisma.transaction.findMany({
        where: {
          accountId: { in: accountIds },
          isCredit: false,
          transferPairId: null,
          deletedAt: null,
          ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        },
        select: { amount: true, category: { select: { name: true, color: true } } },
      });
      const groups = new Map<string, { total: number; count: number; color: string }>();
      for (const t of txs) {
        const catName = t.category?.name ?? "Uncategorized";
        const color = t.category?.color ?? "#9CA3AF";
        const cur = groups.get(catName) ?? { total: 0, count: 0, color };
        cur.total += t.amount;
        cur.count += 1;
        groups.set(catName, cur);
      }
      return Array.from(groups.entries())
        .map(([category, d]) => ({ category, ...d }))
        .sort((a, b) => b.total - a.total);
    }

    case "get_monthly_totals": {
      const months = Math.min(Math.max((input.months as number) || 6, 1), 24);
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
      const txs = await prisma.transaction.findMany({
        where: {
          accountId: { in: accountIds },
          transferPairId: null,
          deletedAt: null,
          date: { gte: start },
        },
        select: { amount: true, isCredit: true, date: true },
      });
      const byMonth: Record<string, { spending: number; income: number }> = {};
      for (const t of txs) {
        const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
        if (!byMonth[key]) byMonth[key] = { spending: 0, income: 0 };
        if (t.isCredit) byMonth[key].income += t.amount;
        else byMonth[key].spending += t.amount;
      }
      return Object.entries(byMonth)
        .map(([month, d]) => ({ month, ...d, net: d.income - d.spending }))
        .sort((a, b) => a.month.localeCompare(b.month));
    }

    case "get_subscriptions": {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);
      const txs = await prisma.transaction.findMany({
        where: {
          accountId: { in: accountIds },
          isCredit: false,
          transferPairId: null,
          deletedAt: null,
          date: { gte: startDate },
        },
        include: { category: { select: { name: true } } },
      });
      interface Entry { amounts: number[]; months: Set<string>; lastDate: Date; categoryName: string | null; }
      const data: Record<string, Entry> = {};
      for (const t of txs) {
        const name = t.merchant ?? t.description;
        const monthKey = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
        if (!data[name]) data[name] = { amounts: [], months: new Set(), lastDate: t.date, categoryName: t.category?.name ?? null };
        data[name].amounts.push(t.amount);
        data[name].months.add(monthKey);
        if (t.date > data[name].lastDate) data[name].lastDate = t.date;
      }
      return Object.entries(data)
        .filter(([, d]) => {
          if (d.months.size < 2) return false;
          const avg = d.amounts.reduce((a, b) => a + b, 0) / d.amounts.length;
          return d.amounts.every((a) => Math.abs(a - avg) / avg <= 0.1);
        })
        .map(([merchant, d]) => ({
          merchant,
          monthlyAmount: Math.round((d.amounts.reduce((a, b) => a + b, 0) / d.amounts.length) * 100) / 100,
          monthsSeen: d.months.size,
          category: d.categoryName,
          lastChargedOn: d.lastDate.toISOString().slice(0, 10),
        }))
        .sort((a, b) => b.monthlyAmount - a.monthlyAmount);
    }

    case "get_top_merchants": {
      const limit = Math.min(Math.max((input.limit as number) || 10, 1), 20);
      const from = toDate(input.from);
      const to = toDate(input.to);
      const txs = await prisma.transaction.findMany({
        where: {
          accountId: { in: accountIds },
          isCredit: false,
          transferPairId: null,
          deletedAt: null,
          ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        },
        select: { amount: true, merchant: true, description: true, category: { select: { name: true } } },
      });
      const groups = new Map<string, { total: number; count: number; category: string | null }>();
      for (const t of txs) {
        const name = t.merchant ?? t.description;
        const cur = groups.get(name) ?? { total: 0, count: 0, category: t.category?.name ?? null };
        cur.total += t.amount;
        cur.count += 1;
        groups.set(name, cur);
      }
      return Array.from(groups.entries())
        .map(([merchant, d]) => ({ merchant, ...d }))
        .sort((a, b) => b.total - a.total)
        .slice(0, limit);
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

type ChatMessage = { role: "user" | "assistant"; content: string };

function enc(s: string) {
  return `data: ${JSON.stringify(s)}\n\n`;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json()) as { messages?: ChatMessage[] };
  const history = body.messages ?? [];
  if (history.length === 0) return new Response("No messages", { status: 400 });

  const userId = session.user.id;
  const [accountIds, householdId] = await Promise.all([
    getHouseholdAccountIds(userId),
    getHouseholdId(userId),
  ]);
  const categoryOwnerWhere = householdId ? { householdId } : { userId };

  const apiMessages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(new TextEncoder().encode(enc(s)));

      const MAX_ITERATIONS = 8;
      let iterations = 0;

      try {
        while (iterations < MAX_ITERATIONS) {
          iterations++;

          const response = await client.messages.create({
            model: "claude-opus-4-7",
            max_tokens: 4000,
            thinking: { type: "adaptive" },
            system: buildSystemPrompt(),
            tools: TOOLS,
            messages: apiMessages,
          });

          apiMessages.push({ role: "assistant", content: response.content });

          if (response.stop_reason === "end_turn") {
            for (const block of response.content) {
              if (block.type === "text") enqueue(block.text);
            }
            break;
          }

          if (response.stop_reason === "tool_use") {
            const toolUses = response.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
            );
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const tu of toolUses) {
              try {
                const result = await runTool(tu.name, tu.input as Record<string, unknown>, userId, accountIds, categoryOwnerWhere);
                toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
              } catch (err) {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
                  is_error: true,
                });
              }
            }
            apiMessages.push({ role: "user", content: toolResults });
            continue;
          }

          // Other stop reasons
          for (const block of response.content) {
            if (block.type === "text") enqueue(block.text);
          }
          break;
        }
      } catch (err) {
        enqueue(`\n\n*(Error: ${err instanceof Error ? err.message : "Unknown error"})*`);
      } finally {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
