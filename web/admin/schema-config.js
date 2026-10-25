// Declarative description of every editable table. The admin UI renders lists and forms from this,
// so adding a field is a one-line change here (plus the column in schema.sql).

const STATUS = [
  { value: 'draft', label: 'Draft / খসড়া' },
  { value: 'published', label: 'Published / প্রকাশিত' },
  { value: 'archived', label: 'Archived / সংরক্ষিত (লুকানো)' },
];

const statusField = { key: 'status', label: 'Status', kind: 'select', options: STATUS, default: 'draft', full: false };

export const TABLES = {
  laws: {
    title: 'Laws · আইন',
    orderBy: 'updated_at',
    columns: [
      { key: 'title_en', label: 'Title' },
      { key: 'act_number', label: 'Act' },
      { key: 'year', label: 'Year' },
      { key: 'law_status', label: 'Law status' },
      { key: 'status', label: 'Status' },
    ],
    fields: [
      { key: 'category_id', label: 'Category', kind: 'ref', ref: 'categories', refLabel: 'name_en' },
      { key: 'title_bn', label: 'Title (বাংলা)', kind: 'text', required: true, max: 300 },
      { key: 'title_en', label: 'Title (English)', kind: 'text', required: true, max: 300 },
      { key: 'slug', label: 'Slug (URL name, auto from English title)', kind: 'slug', required: true, slugFrom: 'title_en' },
      { key: 'act_number', label: 'Act number (e.g. XLV)', kind: 'text', max: 60 },
      { key: 'year', label: 'Year', kind: 'number', min: 1700, max: 2200 },
      { key: 'summary_bn', label: 'Summary (বাংলা)', kind: 'textarea', max: 4000, full: true },
      { key: 'summary_en', label: 'Summary (English)', kind: 'textarea', max: 4000, full: true },
      { key: 'source_name', label: 'Source name (e.g. bdlaws.minlaw.gov.bd)', kind: 'text', max: 200 },
      { key: 'source_url', label: 'Source URL (official link)', kind: 'url' },
      {
        key: 'law_status',
        label: 'Law status',
        kind: 'select',
        default: 'in_force',
        options: [
          { value: 'in_force', label: 'In force / কার্যকর' },
          { value: 'amended', label: 'Amended / সংশোধিত' },
          { value: 'repealed', label: 'Repealed / রহিত' },
        ],
      },
      { key: 'last_verified_at', label: 'Last checked against official source', kind: 'date' },
      statusField,
    ],
    children: 'law_sections',
  },
  law_sections: {
    title: 'Sections · ধারা',
    parentKey: 'law_id',
    orderBy: 'sort_order',
    columns: [
      { key: 'section_no', label: 'No.' },
      { key: 'heading_en', label: 'Heading' },
      { key: 'status', label: 'Status' },
    ],
    fields: [
      { key: 'section_no', label: 'Section number', kind: 'text', required: true, max: 30 },
      { key: 'sort_order', label: 'Order (small number first)', kind: 'number', default: 100, min: 0, max: 100000 },
      { key: 'heading_bn', label: 'Heading (বাংলা)', kind: 'text', max: 300 },
      { key: 'heading_en', label: 'Heading (English)', kind: 'text', max: 300 },
      { key: 'text_bn', label: 'Law text (বাংলা)', kind: 'textarea', max: 20000, full: true },
      { key: 'text_en', label: 'Law text (English)', kind: 'textarea', max: 20000, full: true },
      { key: 'explain_bn', label: 'Simple explanation (বাংলা)', kind: 'textarea', max: 8000, full: true },
      { key: 'explain_en', label: 'Simple explanation (English)', kind: 'textarea', max: 8000, full: true },
      { key: 'punishment_bn', label: 'Punishment (বাংলা)', kind: 'textarea', max: 2000, full: true },
      { key: 'punishment_en', label: 'Punishment (English)', kind: 'textarea', max: 2000, full: true },
      statusField,
    ],
  },
  categories: {
    title: 'Categories · বিভাগ',
    orderBy: 'sort_order',
    columns: [
      { key: 'name_en', label: 'Name' },
      { key: 'slug', label: 'Slug' },
      { key: 'sort_order', label: 'Order' },
      { key: 'status', label: 'Status' },
    ],
    fields: [
      { key: 'name_bn', label: 'Name (বাংলা)', kind: 'text', required: true, max: 120 },
      { key: 'name_en', label: 'Name (English)', kind: 'text', required: true, max: 120 },
      { key: 'slug', label: 'Slug', kind: 'slug', required: true, slugFrom: 'name_en' },
      {
        key: 'icon',
        label: 'Icon',
        kind: 'select',
        default: 'book',
        options: ['book', 'scale', 'land', 'family', 'shield', 'briefcase', 'lock', 'calc', 'file'].map((v) => ({ value: v, label: v })),
      },
      { key: 'sort_order', label: 'Order', kind: 'number', default: 100, min: 0, max: 100000 },
      { ...statusField, default: 'published' },
    ],
  },
  faqs: {
    title: 'FAQs · প্রশ্নোত্তর',
    orderBy: 'sort_order',
    columns: [
      { key: 'question_en', label: 'Question' },
      { key: 'sort_order', label: 'Order' },
      { key: 'status', label: 'Status' },
    ],
    fields: [
      { key: 'category_id', label: 'Category', kind: 'ref', ref: 'categories', refLabel: 'name_en' },
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
      { key: 'law_id', label: 'Related law (optional)', kind: 'ref', ref: 'laws', refLabel: 'title_en' },
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
