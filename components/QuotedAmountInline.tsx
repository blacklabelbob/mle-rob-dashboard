"use client";

import { InlineText } from "@/components/inline/fields";
import { repMoney } from "@/lib/repSource";

// Thin client wrapper around InlineText's numeric+format mode. Needed because
// the account workspace page is a Server Component: a `format` callback isn't
// serializable across the server→client boundary, so the arrow function has
// to live inside a client component rather than being passed in as a prop
// (this is exactly how PersonEditor/PeopleTable get away with the same
// pattern — they're "use client" themselves). Uses repMoney (exact, not
// money()'s k-rounding) — this is a rep surface (Critic Rob punch #1).
export default function QuotedAmountInline({
  personId,
  value,
}: {
  personId: string;
  value?: number;
}) {
  return (
    <InlineText
      personId={personId}
      field="quotedAmount"
      value={value != null && value > 0 ? value : null}
      numeric
      format={(v) => repMoney(Number(v))}
      placeholder="+ add quote"
    />
  );
}
