// Field list used only by tests to exercise coerceRow() (the admin no longer edits laws; they are JSON files).
const STATUS = [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }];
const statusField = { key: 'status', label: 'Status', kind: 'select', options: STATUS, default: 'draft', full: false };
const TABLES = {
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
};
export const LAW_FIELDS = TABLES.laws.fields;
