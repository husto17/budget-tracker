import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdAccountIds } from "@/lib/household";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const accountId = formData.get("accountId") as string | null;

  if (!file || !accountId) {
    return NextResponse.json({ error: "file and accountId are required" }, { status: 400 });
  }

  // Verify account belongs to household
  const householdAccountIds = await getHouseholdAccountIds(session.user.id);
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || !householdAccountIds.includes(account.id)) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Convert image to base64
  const bytes = await file.arrayBuffer();
  const base64Image = Buffer.from(bytes).toString("base64");

  // Determine media type
  const mimeType = file.type || "image/jpeg";
  const validMediaTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const mediaType = validMediaTypes.includes(mimeType)
    ? (mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
    : "image/jpeg";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Image },
          },
          {
            type: "text",
            text: `Extract all transactions from this bank app screenshot. Return ONLY a JSON array with no markdown, no explanation. Each item: { "date": "YYYY-MM-DD or null if pending", "description": "merchant name as shown", "amount": number (positive always), "isCredit": boolean (true only for deposits/payments received), "isPending": boolean }. For pending transactions with no date, use today's date. The running balance numbers are NOT transactions — ignore them.`,
          },
        ],
      },
    ],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "";

  let transactions: Array<{
    date: string;
    description: string;
    amount: number;
    isCredit: boolean;
    isPending: boolean;
  }>;

  try {
    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/```[a-z]*\n?/gi, "").trim();
    transactions = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse AI response", raw: rawText },
      { status: 422 }
    );
  }

  return NextResponse.json({ transactions });
}
