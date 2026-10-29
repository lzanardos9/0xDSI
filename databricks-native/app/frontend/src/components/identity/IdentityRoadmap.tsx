import { FlaskConical, Wrench, Globe2, MessageSquareText, Construction } from 'lucide-react';
import { Card, PageHeader, Tag } from './identityUi';

export const ROADMAP_PAGES = {
  id_whatif: {
    title: 'What-If Simulator', icon: FlaskConical, phase: 'Phase 3',
    what: 'Preview the effect of removing a group, disabling an account or revoking a role before anyone touches production.',
    needs: ['Access graph (Phase 2)', 'Read-only simulation against a snapshot of the graph'],
  },
  id_remediation: {
    title: 'Identity Remediation', icon: Wrench, phase: 'Phase 4',
    what: 'Approved, reversible fixes (disable, remove from group, rotate credential) with two-person approval and full audit.',
    needs: ['Per-user sign-in for actions instead of the shared app identity', 'Approval workflow with leases and an outbox', 'Write access agreements per provider'],
  },
  id_federation: {
    title: 'Federation Posture', icon: Globe2, phase: 'Phase 3',
    what: 'Trust relationships between tenants and identity providers, guest access, and configuration drift against the agreed baseline.',
    needs: ['Federation and cross-tenant settings exports', 'Baseline policy from the identity team'],
  },
  id_answers: {
    title: 'Identity Answers', icon: MessageSquareText, phase: 'Phase 5',
    what: 'Ask questions in plain language, such as "who can approve payments and also create vendors?", answered only from governed identity data with sources cited.',
    needs: ['Phases 1 to 3 data in place', 'Per-user permissions so answers respect what the asker may see', 'Question and answer evaluation set'],
  },
} as const;

export type RoadmapPageId = keyof typeof ROADMAP_PAGES;

export default function IdentityRoadmap({ page }: { page: RoadmapPageId }) {
  const p = ROADMAP_PAGES[page];
  return (
    <div className="min-h-screen bg-[#0A1628] text-slate-200 p-6">
      <div className="max-w-4xl mx-auto">
        <PageHeader icon={p.icon} title={p.title} subtitle={p.what} actions={<Tag tone="amber">{p.phase}</Tag>} />
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <Construction size={16} className="text-amber-300" />
            </div>
            <div>
              <div className="text-slate-100 font-medium">Not connected yet</div>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                This page is part of the identity plan but has no data behind it yet, so it shows nothing rather than sample numbers.
                It becomes live once the items below are delivered.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">Needed before this page goes live</div>
            <ul className="space-y-2">
              {p.needs.map((n) => (
                <li key={n} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-2 flex-shrink-0" /> {n}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
