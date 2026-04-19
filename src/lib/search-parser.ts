// Parse a search string into plain text + structured filters. Supports
// operators: amount:>100, amount:<50, amount:100-200, amount:100
//            category:dining, merchant:amazon, account:chase
//            from:2026-01-01, to:2026-03-31
// Anything that doesn't match an operator falls back to plain text.
//
// Case-insensitive operator names. Values may be quoted with double quotes
// to include spaces: category:"food & drink".

export interface ParsedSearch {
  text: string;
  amount?: number;
  amountMin?: number;
  amountMax?: number;
  categoryLike?: string;
  merchantLike?: string;
  accountLike?: string;
  from?: Date;
  to?: Date;
}

const OP_RE = /^(amount|category|merchant|account|from|to):(.+)$/i;

export function parseSearch(q: string): ParsedSearch {
  if (!q) return { text: "" };
  const tokens = tokenize(q);
  const out: ParsedSearch = { text: "" };
  const textParts: string[] = [];
  for (const tok of tokens) {
    const m = tok.match(OP_RE);
    if (!m) {
      textParts.push(tok);
      continue;
    }
    const key = m[1].toLowerCase();
    const value = stripQuotes(m[2]);
    switch (key) {
      case "amount": {
        const range = value.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
        const op = value.match(/^([<>]=?|=)(\d+(?:\.\d+)?)$/);
        if (range) {
          out.amountMin = parseFloat(range[1]);
          out.amountMax = parseFloat(range[2]);
        } else if (op) {
          const n = parseFloat(op[2]);
          if (op[1] === ">") out.amountMin = n + 0.0001;
          else if (op[1] === ">=") out.amountMin = n;
          else if (op[1] === "<") out.amountMax = n - 0.0001;
          else if (op[1] === "<=") out.amountMax = n;
          else out.amount = n;
        } else {
          const n = parseFloat(value);
          if (isFinite(n)) out.amount = n;
        }
        break;
      }
      case "category":
        out.categoryLike = value;
        break;
      case "merchant":
        out.merchantLike = value;
        break;
      case "account":
        out.accountLike = value;
        break;
      case "from": {
        const d = new Date(value);
        if (!isNaN(d.getTime())) out.from = d;
        break;
      }
      case "to": {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          out.to = d;
        }
        break;
      }
    }
  }
  out.text = textParts.join(" ").trim();
  return out;
}

// Splits on whitespace but preserves key:"quoted value" as one token.
function tokenize(q: string): string[] {
  const tokens: string[] = [];
  const re = /(\w+:"[^"]*"|\w+:\S+|"[^"]*"|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q)) !== null) {
    tokens.push(m[1]);
  }
  return tokens;
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}
