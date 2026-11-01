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
    law: 'Sunni (Hanafi) law of inheritance as applied in Bangladesh (Quran 4:11-12), with the Muslim Family Laws Ordinance 1961, s.4 (orphaned grandchildren)',
    url: 'https://bdlaws.minlaw.gov.bd/act-print-305.html',
    checkedOn: '2026-11-01',
    reviewedBy: null,
    scope: 'spouse_parents_children',
    sources: [
      { id: 'mflo', label: 'The Muslim Family Laws Ordinance, 1961 (Ordinance VIII of 1961), section 4 (official text, bdlaws)', url: 'https://bdlaws.minlaw.gov.bd/act-print-305.html', kind: 'official' },
      { id: 'q', label: 'Quran 4:11 and 4:12 (Sahih International): children, parents, husband and wife shares', url: 'https://legacy.quran.com/4/11-23', kind: 'scripture' },
      { id: 'ar', label: 'Awl and Radd: Adjustments in Islamic Inheritance (Hanafi: spouses get no radd)', url: 'https://islam.wiki/articles/awl-and-radd-inheritance', kind: 'reference' },
      { id: 'um', label: 'The Umari issue of inheritance (spouse and both parents: mother takes a third of the remainder)', url: 'https://old.islamic-content.com/dictionary/word/12008/en', kind: 'reference' },
    ],
  },
  // Same religion card as `muslim`; shown when the person picks the Shia (Ithna 'Ashari / Imami) school.
  muslim_shia: {
    status: 'pending_review',
    law: "Shia (Ithna 'Ashari, Imami) law of inheritance (Qur'an 4:11-12), with the Muslim Family Laws Ordinance 1961, s.4 (orphaned grandchildren)",
    url: 'https://bdlaws.minlaw.gov.bd/act-print-305.html',
    checkedOn: '2026-11-01',
    reviewedBy: null,
    scope: 'spouse_parents_children',
    sources: [
      { id: 'mflo', label: 'The Muslim Family Laws Ordinance, 1961 (Ordinance VIII of 1961), section 4 (official text, bdlaws)', url: 'https://bdlaws.minlaw.gov.bd/act-print-305.html', kind: 'official' },
      { id: 'q', label: 'Quran 4:11 and 4:12 (Sahih International)', url: 'https://legacy.quran.com/4/11-23', kind: 'scripture' },
      { id: 'si', label: 'Ayatollah al-Sistani, Islamic Laws: inheritance of the first group, rulings 2748-2756 (parents, children, grandchildren)', url: 'https://sistani.org/english/book/48/8237', kind: 'scripture' },
      { id: 'mg1', label: 'M. J. Mughniyya, Inheritance according to the Five Schools: the mother takes one third of the whole estate, not of the remainder (al-islam.org)', url: 'https://al-islam.org/node/43458', kind: 'reference' },
      { id: 'mg2', label: 'M. J. Mughniyya, Inheritance according to the Five Schools: shares of the spouses and radd (al-islam.org)', url: 'https://al-islam.org/bn/node/43464', kind: 'reference' },
      { id: 'mg3', label: 'M. J. Mughniyya, Inheritance according to the Five Schools: illustrations, Imami vs Sunni (al-islam.org)', url: 'https://al-islam.org/node/43467', kind: 'reference' },
      { id: 'aw', label: "MAJALLA, Shia fiqh on 'awl: no 'awl, the shortfall falls on the daughters", url: 'https://majalla.org/ilm/shia-fiqh-on-awl/', kind: 'reference' },
    ],
  },
  hindu: {
    status: 'pending_review',
    law: 'The Hindu Women\'s Rights to Property Act, 1937 (Act No. XVIII of 1937), ss.2-3, with the Dayabhaga school of Hindu law (not codified)',
    url: 'https://bhumipedia.land.gov.bd/uploads/PDF/Act/The_Hindu_Womens_Rights_to_Property_Act_1937.pdf',
    checkedOn: '2026-11-01',
    reviewedBy: null,
    // Honest limits of the check, shown on screen.
    scope: 'son_line_only',
    sources: [
      { id: 'act', label: 'Hindu Women\'s Rights to Property Act 1937 (Ministry of Land copy)', url: 'https://bhumipedia.land.gov.bd/uploads/PDF/Act/The_Hindu_Womens_Rights_to_Property_Act_1937.pdf', kind: 'official' },
      { id: 'sc', label: 'Appellate Division, Shishubar Dhali v. Chitta Ranjan Mondol, Civil Appeal 55 of 2003, 11 Dec 2022 (Dayabhaga principles)', url: 'https://advocatetanmoy.com/dayabhaga-school-of-law-which-prevails-in-bangladesh-is-the-doctrine-of-religious-efficacy-scb-11-12-2022/', kind: 'reference' },
      { id: 'dt', label: 'Dhaka Tribune, 4 June 2024 (Hindu women and inheritance)', url: 'https://www.dhakatribune.com/opinion/op-ed/348363/empowering-inheritance-the-legal-of-hindu-women-s', kind: 'news' },
      { id: 'lh', label: 'Law Help BD, Hindu law of inheritance in Bangladesh (worked examples)', url: 'https://lawhelpbd.com/civil-law/personal-law/hindu-law/hindu-law-of-inheritance-in-bangladesh/', kind: 'reference' },
    ],
  },
  buddhist: {
    status: 'pending_review',
    law: 'Buddhists in Bangladesh are reported to follow Hindu law (Dayabhaga) for inheritance; no statute or judgment confirming this was found in the sources checked',
    url: 'https://www.dhakatribune.com/bangladesh/court/224033/govt-served-legal-notice-for-law-on-hindu-and',
    checkedOn: '2026-11-01',
    reviewedBy: null,
    scope: 'son_line_only',
    legalBasisUnconfirmed: true,
    sources: [
      { id: 'dt20', label: 'Dhaka Tribune, 22 Sep 2020: "The Buddhist community also follows the Hindu law for personal matters in Bangladesh"', url: 'https://www.dhakatribune.com/bangladesh/court/224033/govt-served-legal-notice-for-law-on-hindu-and', kind: 'news' },
      { id: 'pa20', label: 'Prothom Alo English, 22 Sep 2020 (legal notice on Hindu and Buddhist women\'s inheritance)', url: 'https://en.prothomalo.com/bangladesh/legal-notice-seeks-hindu-buddhist-womens-right-to-inherit-property', kind: 'news' },
    ],
  },
};

export const RELIGIONS = ['christian', 'muslim', 'hindu', 'buddhist'];

export function isLive(religion, map = RULE_STATUS) {
  return LIVE_STATUSES.includes(map[religion]?.status);
}
