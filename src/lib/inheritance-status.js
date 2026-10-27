// Status of each inheritance rule set.
//
//   source_verified : every rule was checked against the official text of the law (see `url`).
//   reviewed        : checked and signed off by a lawyer or Islamic-law scholar (put the reviewer in `reviewedBy`).
//   pending_review  : works and is tested, but no lawyer or scholar has signed it off yet. Usable, and the screen says so.
//   unavailable     : no verified rule set exists. Nothing is calculated.
//
// Change a status here only after the check has really happened.

export const LIVE_STATUSES = ['source_verified', 'reviewed', 'pending_review'];

export const RULE_STATUS = {
  christian: {
    status: 'source_verified',
    law: 'The Succession Act, 1925 (Act No. XXXIX of 1925), Part V, Chapter II (ss.33-48)',
    url: 'https://bdlaws.minlaw.gov.bd/act-138.html',
    checkedOn: '2026-10-26',
    reviewedBy: null,
  },
  muslim: {
    status: 'pending_review',
    law: 'Sunni (Hanafi) law of inheritance as applied in Bangladesh; Muslim Family Laws Ordinance 1961, s.4',
    url: null,
    checkedOn: null,
    reviewedBy: null,
  },
  hindu: { status: 'unavailable', law: 'Dayabhaga school; Hindu Women\'s Right to Property Act 1937; Hindu Law of Inheritance (Amendment) Act 1929', url: null, checkedOn: null, reviewedBy: null },
  buddhist: { status: 'unavailable', law: null, url: null, checkedOn: null, reviewedBy: null },
};

export const RELIGIONS = ['christian', 'muslim', 'hindu', 'buddhist'];

export function isLive(religion, map = RULE_STATUS) {
  return LIVE_STATUSES.includes(map[religion]?.status);
}
