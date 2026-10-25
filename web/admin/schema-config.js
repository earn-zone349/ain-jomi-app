// Declarative description of every table the admin panel edits. Laws and categories are NOT here: they are
// JSON files in content/ (see content/README.md).
// Declarative description of every editable table. The admin UI renders lists and forms from this,
// so adding a field is a one-line change here (plus the column in schema.sql).

const STATUS = [
  { value: 'draft', label: 'Draft / খসড়া' },
  { value: 'published', label: 'Published / প্রকাশিত' },
  { value: 'archived', label: 'Archived / সংরক্ষিত (লুকানো)' },
];

const statusField = { key: 'status', label: 'Status', kind: 'select', options: STATUS, default: 'draft', full: false };

export const TABLES = {
  faqs: {
    title: 'FAQs · প্রশ্নোত্তর',
    orderBy: 'sort_order',
    columns: [
      { key: 'question_en', label: 'Question' },
      { key: 'sort_order', label: 'Order' },
      { key: 'status', label: 'Status' },
    ],
    fields: [
      { key: 'question_bn', label: 'Question (বাংলা)', kind: 'text', required: true, max: 500 },
      { key: 'question_en', label: 'Question (English)', kind: 'text', required: true, max: 500 },
      { key: 'answer_bn', label: 'Answer (বাংলা)', kind: 'textarea', required: true, max: 8000, full: true },
      { key: 'answer_en', label: 'Answer (English)', kind: 'textarea', required: true, max: 8000, full: true },
      { key: 'sort_order', label: 'Order', kind: 'number', default: 100, min: 0, max: 100000 },
      statusField,
    ],
  },
  notices: {
    title: 'Notices · নোটিশ',
    orderBy: 'updated_at',
    columns: [
      { key: 'title_en', label: 'Title' },
      { key: 'kind', label: 'Type' },
      { key: 'status', label: 'Status' },
    ],
    fields: [
      {
        key: 'kind',
        label: 'Type',
        kind: 'select',
        default: 'info',
        options: [
          { value: 'info', label: 'Info' },
          { value: 'update', label: 'Law update / আইন হালনাগাদ' },
          { value: 'warning', label: 'Warning' },
        ],
      },
      { key: 'title_bn', label: 'Title (বাংলা)', kind: 'text', required: true, max: 200 },
      { key: 'title_en', label: 'Title (English)', kind: 'text', required: true, max: 200 },
      { key: 'body_bn', label: 'Message (বাংলা)', kind: 'textarea', max: 2000, full: true },
      { key: 'body_en', label: 'Message (English)', kind: 'textarea', max: 2000, full: true },
      statusField,
    ],
  },
  legal_pages: {
    title: 'Terms / Privacy · শর্তাবলি',
    orderBy: 'slug',
    noCreate: true,
    noDelete: true,
    columns: [
      { key: 'slug', label: 'Page' },
      { key: 'version', label: 'Version' },
      { key: 'status', label: 'Status' },
    ],
    fields: [
      { key: 'title_bn', label: 'Title (বাংলা)', kind: 'text', required: true, max: 200 },
      { key: 'title_en', label: 'Title (English)', kind: 'text', required: true, max: 200 },
      { key: 'body_bn', label: 'Text (বাংলা)', kind: 'textarea', required: true, max: 60000, full: true, rows: 14 },
      { key: 'body_en', label: 'Text (English)', kind: 'textarea', required: true, max: 60000, full: true, rows: 14 },
      { key: 'version', label: 'Version (increase when meaning changes)', kind: 'number', default: 1, min: 1, max: 1000 },
      { ...statusField, default: 'published' },
    ],
  },
};
