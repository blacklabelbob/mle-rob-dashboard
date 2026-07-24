"use client";

import { contribution, money } from "@/lib/stats";
import { splitNotes } from "@/lib/notes";
import type { Person, Vertical } from "@/lib/types";
import { TYPE_LABELS } from "@/lib/labels";
import {
  InlineDateChip,
  InlineSelect,
  InlineText,
  InlineTextarea,
  InlineToggle,
} from "@/components/inline/fields";

// Person record — fully inline. Click any value, edit it in place, it saves
// itself (amber pulse = saved). No edit mode, no Save button. Attio standard.

const DATE_FIELDS: [string, string][] = [
  ["met", "Met"],
  ["quoted", "Quoted"],
  ["signed", "Signed"],
  ["invoiced", "Invoiced"],
  ["paid", "Paid"],
  ["phaseOneComplete", "Phase One complete"],
];

const label = "text-xs text-slate-500";

export default function PersonEditor({
  person,
  verticals,
  peopleOptions,
}: {
  person: Person;
  verticals: Vertical[];
  peopleOptions: { id: string; name: string }[];
}) {
  // Q43 discipline: the Notes box shows + edits ONLY Rob's own words; the
  // machine-appended enrichment blocks render collapsed at the bottom of the
  // record page. The save sends just this human draft (`notesHuman`) and the
  // API route recomposes the enrichment from the stored row — recomposing here
  // would use render-time state and drop anything appended since (punch #3).
  const { human: humanNotes } = splitNotes(person.notes);

  const typeOptions = Object.entries(TYPE_LABELS).map(([value, l]) => ({ value, label: l }));
  const verticalOptions = verticals.map((v) => ({ value: v.id, label: v.name }));
  const referrerOptions = peopleOptions
    .filter((p) => p.id !== person.id)
    .map((p) => ({ value: p.id, label: p.name }));

  return (
    <>
      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">The record</h2>
          <span className="text-[11px] text-slate-600">click any value to edit</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <div>
            <dt className={label}>Quoted</dt>
            <dd className="tabular text-slate-200">
              <InlineText
                personId={person.id}
                field="quotedAmount"
                value={person.quotedAmount != null && person.quotedAmount > 0 ? person.quotedAmount : null}
                numeric
                format={(v) => money(Number(v))}
                placeholder="+ add quote"
              />
            </dd>
          </div>
          <div>
            <dt className={label}>Signed</dt>
            <dd>
              <InlineToggle
                personId={person.id}
                field="signed"
                value={person.signed}
                onLabel={
                  person.keyDates.signed ? (
                    <span className="text-emerald-400">yes</span>
                  ) : (
                    <span className="text-amber-400" title="signed flag set but no signed date — resolve or set the date">⚠ disputed</span>
                  )
                }
                offLabel={<span className="text-slate-400">not yet</span>}
              />
            </dd>
          </div>
          <div>
            <dt className={label}>Est. contribution</dt>
            <dd className="tabular font-medium text-sky-300">{money(contribution(person))}</dd>
          </div>
          <div>
            <dt className={label}>Phase One</dt>
            <dd className="text-slate-200">
              <InlineSelect
                personId={person.id}
                field="phaseOne"
                value={person.phaseOne}
                options={[
                  { value: "not-started", label: "not started" },
                  { value: "in-progress", label: "in progress" },
                  { value: "complete", label: "complete" },
                ]}
              />
            </dd>
          </div>
          <div>
            <dt className={label}>Status</dt>
            <dd className="text-slate-200">
              <InlineSelect
                personId={person.id}
                field="status"
                value={person.status}
                options={[
                  { value: "lit", label: "lit" },
                  { value: "warm", label: "warm" },
                  { value: "unlit", label: "unlit" },
                ]}
              />
            </dd>
          </div>
          <div>
            <dt className={label}>Relationship (to MLE)</dt>
            <dd className="text-slate-200">
              <InlineSelect
                personId={person.id}
                field="nodeType"
                value={person.nodeType}
                options={typeOptions}
                allowEmpty
                parse={(v) => v || null}
              />
            </dd>
          </div>
          <div>
            <dt className={label}>Vertical</dt>
            <dd className="text-slate-200">
              <InlineSelect
                personId={person.id}
                field="verticalId"
                value={person.verticalId}
                options={verticalOptions}
              />
            </dd>
          </div>
          <div>
            <dt className={label}>Referred by</dt>
            <dd className="text-slate-200">
              <InlineSelect
                personId={person.id}
                field="referredById"
                value={person.referredById}
                options={referrerOptions}
                allowEmpty
                emptyLabel="— direct —"
                parse={(v) => v || null}
              />
            </dd>
          </div>
          <div>
            <dt className={label}>Business</dt>
            <dd className="text-slate-200">
              <InlineText personId={person.id} field="business" value={person.business} placeholder="+ business" />
            </dd>
          </div>
          <div>
            <dt className={label}>Role / title</dt>
            <dd className="text-slate-200">
              <InlineText personId={person.id} field="role" value={person.role} placeholder="+ role" />
            </dd>
          </div>
          <div>
            <dt className={label}>Referral note</dt>
            <dd className="text-slate-200">
              <InlineText personId={person.id} field="relationship" value={person.relationship} placeholder="+ who/how" />
            </dd>
          </div>
          <div>
            <dt className={label}>Phone</dt>
            <dd className="text-slate-200">
              <InlineText personId={person.id} field="phone" value={person.phone} placeholder="+ phone" />
            </dd>
          </div>
          <div>
            <dt className={label}>Email</dt>
            <dd className="text-slate-200">
              <InlineText personId={person.id} field="email" value={person.email} placeholder="+ email" />
            </dd>
          </div>
          <div>
            <dt className={label}>Website</dt>
            <dd className="text-slate-200">
              <InlineText personId={person.id} field="website" value={person.website} placeholder="+ url" />
            </dd>
          </div>
          <div>
            <dt className={label}>Meeting video</dt>
            <dd className="text-slate-200">
              <InlineText personId={person.id} field="meetingVideoUrl" value={person.meetingVideoUrl} placeholder="+ url" />
            </dd>
          </div>
          <div>
            <dt className={label}>Transcript</dt>
            <dd className="text-slate-200">
              <InlineText personId={person.id} field="transcriptUrl" value={person.transcriptUrl} placeholder="+ url" />
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <div className={label}>Notes</div>
          <div className="mt-1 text-sm text-slate-300">
            <InlineTextarea
              personId={person.id}
              field="notesHuman"
              value={humanNotes}
              placeholder="+ add notes"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Key dates</h2>
          <span className="text-[11px] text-slate-600">click a chip to set</span>
        </div>
        <ol className="mt-3 flex flex-wrap gap-2">
          {DATE_FIELDS.map(([key, l]) => (
            <li key={key}>
              <InlineDateChip
                personId={person.id}
                label={l}
                dateKey={key}
                keyDates={person.keyDates as Record<string, string | undefined>}
              />
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
