// Quest-form drafts: blank ones for the + button, filled ones for editing.
import { ASCEND, type ABoss, type AQuest } from './logic';
import type { QuestDraft, QuestKind } from './store';
export function newDraft(kind: QuestKind, days: number[] = [], statId: string | null = null): QuestDraft {
  return { mode: 'new', kind, title: '', statId, subId: null, xp: kind === 'boss' ? String(ASCEND.bossDefaultXp) : '', days, timed: false, due: '', target: '', milestonesText: '', avoidingSince: '', why: '' };
}
export function editDraft(q: AQuest): QuestDraft {
  return { mode: 'edit', id: q.id, kind: q.type, title: q.title, statId: q.statId, subId: q.subId, xp: String(q.xp), days: [...q.days], timed: q.timed, due: q.due ?? '', target: q.target ?? '', milestonesText: '', avoidingSince: '', why: '' };
}
export function bossDraft(b: ABoss): QuestDraft {
  return { mode: 'edit', id: b.id, kind: 'boss', title: b.title, statId: b.statId, subId: b.subId, xp: String(b.xp), days: [], timed: false, due: '', target: '', milestonesText: '', avoidingSince: b.avoidingSince ?? '', why: b.why };
}
