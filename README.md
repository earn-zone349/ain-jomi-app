# আইন জমি (Ain Jomi) — Phase 0 Foundation

বাংলাদেশের আইন ও জমি-সংক্রান্ত সুপার অ্যাপের ভিত্তি। এই ফোল্ডারে আছে: Android অ্যাপ (Capacitor), Supabase ডাটাবেস স্কিমা, অ্যাডমিন প্যানেল, পাবলিক Privacy/Terms পেজ, এবং GitHub-এ APK বানানোর অটোমেশন।

> সব সেটআপ ফোন থেকেই করা যায়। কম্পিউটার লাগবে না।

---

## ১. এখন কী কী কাজ করছে (Phase 0)

| ক্ষেত্র | কী আছে |
|---|---|
| ভাষা | বাংলা + English, যেকোনো সময় বদলানো যায়। বাংলা না থাকলে English দেখায় (উল্টোটাও) |
| শুরুর স্ক্রিন | ভাষা বাছাই, তারপর "গুরুত্বপূর্ণ বিজ্ঞপ্তি" (আইনি পরামর্শ নয়) মেনে নেওয়া |
| আইন লাইব্রেরি | বিভাগ, আইন, ধারা, সহজ ব্যাখ্যা, শাস্তি, সরকারি উৎস লিংক, শেষ যাচাইয়ের তারিখ |
| সার্চ | অফলাইনে চলে। বাংলা/ইংরেজি সংখ্যা দুভাবেই মেলে (যেমন "৩৭৮" লিখলে ধারা 378 পাওয়া যায়) |
| অফলাইন | একবার নামালে ইন্টারনেট ছাড়াই চলে। শুধু নতুন বা বদলানো অংশ নামে |
| হালনাগাদ | আইন বদলালে অ্যাডমিন নোটিশ দিলে অ্যাপের হোমে দেখায় |
| লগইন | ইমেইল + পাসওয়ার্ড, পাসওয়ার্ড রিসেট, অ্যাকাউন্ট মোছা (Google Play-র শর্ত)। লগইন ছাড়াও (guest) পড়া যায় |
| সংরক্ষণ ও সম্প্রতি দেখা | আইন সংরক্ষণ (বুকমার্ক), সংরক্ষিত তালিকা, হোমে সম্প্রতি দেখা আইন (শুধু ফোনে থাকে) |
| ধারায় ঝাঁপ ও কপি | বড় আইনে ধারা নম্বর লিখে সরাসরি যাওয়া, সার্চে ধারা নম্বরসহ ফল, ধারা কপি |
| জমির ক্যালকুলেটর | Tools ট্যাবে চালু: একক রূপান্তর (শতক, কাঠা, বিঘা, একর...), প্লটের মাপ (আয়তক্ষেত্র, ত্রিভুজ, ট্রাপিজিয়াম, একাধিক অংশ যোগ), ভগ্নাংশ/সমান ভাগ, দাম হিসাব, জমির পরিভাষা। অফলাইনে চলে। খরচের হিসাব সরকারি হার যোগ না হওয়া পর্যন্ত বন্ধ |
| প্রশ্নোত্তর | অ্যাডমিন থেকে FAQ দিলে হোমে "সাধারণ প্রশ্নোত্তর" দেখায় |
| ভুল জানানো | লগইন করা ব্যবহারকারী যেকোনো আইন/ধারার ভুল রিপোর্ট করতে পারেন |
| থিম | সিস্টেম / দিন / রাত, লেখার আকার ছোট-মাঝারি-বড় |
| অ্যাডমিন প্যানেল | FAQ, নোটিশ, Terms/Privacy সম্পাদনা; রিপোর্ট দেখা; ব্যবহারকারীর role; সেটিংস; ইতিহাস ও আগের সংস্করণ ফেরানো; অ্যাপের error দেখা |
| নিরাপত্তা | প্রতিটি টেবিলে Row Level Security, role (user/editor/admin), সব পরিবর্তনের audit log, ড্রাফট থেকে প্রকাশিত হলে আর ড্রাফটে ফেরানো যায় না |
| মেইনটেন্যান্স | অ্যাডমিন থেকে অ্যাপ বন্ধ রাখা বা পুরোনো সংস্করণে আপডেট বাধ্যতামূলক করা যায় |
| পরের ধাপের জন্য | জমির ক্যালকুলেটর, উত্তরাধিকার, ভূমি সেবা, AI, আইনজীবী — "Tools" ট্যাবে "শিগগির" হিসেবে আছে; server-এর feature switch দিয়ে চালু হবে |

---

## ২. একবারের সেটআপ (ধাপে ধাপে)

### ধাপ ১: Supabase প্রজেক্ট

1. supabase.com-এ প্রজেক্ট খুলুন (আগে থাকলে সেটাই চলবে, কিন্তু আলাদা প্রজেক্ট রাখাই ভালো)।
2. **SQL Editor → New query** খুলে `supabase/schema.sql`-এর পুরো লেখা পেস্ট করে **Run** দিন।
3. আবার নতুন query: `supabase/seed_legal.sql` পেস্ট করে **Run** দিন (Terms/Privacy/Disclaimer ঢুকবে)।
4. দুটো ফাইলই বারবার চালালেও কিছু নষ্ট হয় না।
5. **Project Settings → API** থেকে দুটো জিনিস কপি করুন: **Project URL** এবং **anon public key**।
   - ⚠️ **service_role key** কোথাও দেবেন না। এটা অ্যাপে বা GitHub variable-এ যাবে না।

### ধাপ ২: Auth সেটিংস (Supabase → Authentication)

1. **URL Configuration → Site URL**: আপনার GitHub Pages ঠিকানা (যেমন `https://ইউজারনেম.github.io/রিপোনাম`)।
2. **Redirect URLs**-এ যোগ করুন: `https://ইউজারনেম.github.io/রিপোনাম/reset-password/`
3. **Providers → Email**: চালু রাখুন। "Confirm email" চালু রাখলে নতুন ব্যবহারকারীকে ইমেইলের লিংকে ক্লিক করতে হবে (অ্যাপ এটা বুঝে বার্তা দেখায়)।
4. Supabase-এর ডিফল্ট ইমেইল প্রতি ঘণ্টায় অল্প সংখ্যক পাঠায়। ব্যবহারকারী বাড়লে নিজের SMTP (Authentication → SMTP Settings) যোগ করুন।

### ধাপ ৩: GitHub রিপোজিটরি

1. নতুন repo খুলুন (Private রাখাই ভালো) এবং এই ফোল্ডারের সব ফাইল আপলোড করুন (`.github` ফোল্ডারসহ, সেটা লুকানো ফোল্ডার)।
2. **Settings → Secrets and variables → Actions → Variables** ট্যাবে চারটা variable বানান:

| নাম | মান |
|---|---|
| `VITE_SUPABASE_URL` | ধাপ ১-এর Project URL |
| `VITE_SUPABASE_ANON_KEY` | ধাপ ১-এর anon public key |
| `VITE_WEB_BASE_URL` | `https://ইউজারনেম.github.io/রিপোনাম` (শেষে `/` নেই) |
| `VITE_SUPPORT_EMAIL` | আপনার সাপোর্ট ইমেইল (Privacy Policy-তে ছাপা হবে, Play Store-এ লাগবে) |

3. **Settings → Pages → Source = GitHub Actions** করুন।

### ধাপ ৪: ওয়েবসাইট (অ্যাডমিন + Privacy + Terms) চালু

1. **Actions → "Deploy website" → Run workflow**।
2. শেষ হলে এই ঠিকানাগুলো কাজ করবে:
   - অ্যাডমিন: `…/admin/`
   - Privacy Policy: `…/privacy/` (Play Console-এ এই লিংক দিন)
   - Terms: `…/terms/`

### ধাপ ৫: নিজেকে প্রথম অ্যাডমিন বানান

1. অ্যাপে (বা এখনো না হলে Supabase → Authentication → Users → Add user) আপনার ইমেইল দিয়ে অ্যাকাউন্ট খুলুন।
2. Supabase **SQL Editor**-এ চালান (ইমেইল বদলে নিন):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'আপনার-ইমেইল@example.com');
```

3. এরপর অ্যাডমিন প্যানেল থেকেই বাকিদের `editor` বা `admin` বানাতে পারবেন।
   - **editor**: আইন/ধারা/FAQ/নোটিশ যোগ ও সম্পাদনা, রিপোর্ট দেখা।
   - **admin**: সবকিছু, মোছা, role বদলানো, সেটিংস, ইতিহাস।

### ধাপ ৬: APK বানানো

1. **Actions → "Build Android APK" → Run workflow**।
2. শেষ হলে run-এর পাতার নিচে **Artifacts → ain-jomi-android** নামিয়ে নিন, ভেতরে APK।
3. সাইনিং key না দিলে **debug APK** হয় (ফোনে ইনস্টল করে পরীক্ষা করা যায়, Play Store-এ হয় না)।

### ধাপ ৭ (Play Store-এর আগে): রিলিজ সাইনিং key

1. **Actions → "Create signing key (run once)" → Run workflow**।
2. শেষ হলে Artifact **keystore-secrets** নামিয়ে ফাইলটি খুলুন। ভেতরে চারটা মান আছে।
3. **Settings → Secrets and variables → Actions → Secrets**-এ এই চারটা secret বানান: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`।
4. Artifact মুছে ফেলুন। ফাইলের একটা **নিরাপদ কপি আলাদা জায়গায় রাখুন**: হারালে Play Store-এ আর আপডেট দেওয়া যাবে না।
5. এরপর থেকে "Build Android APK" নিজে থেকেই সাইন করা **APK + AAB** বানাবে (Play Store-এ AAB যায়)।

---

## ৩. রোজকার কাজ

**আইন ও বিভাগ:** ডাটাবেসে নয়, `content/` ফোল্ডারের JSON ফাইলে। পুরো নিয়ম `content/README.md`-তে। সংক্ষেপে: `content/laws`-এ ফাইল যোগ → Commit → **Build Android APK** চালান → নতুন APK install।

**FAQ, নোটিশ, Terms/Privacy:** অ্যাডমিন প্যানেলে (`…/admin/`)।
1. লগইন করে **FAQs / Notices** থেকে **+ New**। Status **Draft** রাখুন, দেখে নিয়ে **Published** করুন। এর পর ফোনে পরের sync-এ দেখাবে।
2. কিছু লুকাতে হলে **Archived** করুন (মুছবেন না)।
3. ভুল করে বদলালে **History** থেকে আগের লেখা ফেরানো যায়।

> **নিয়ম:** Published হয়ে গেলে আর Draft করা যায় না।

**ব্যবহারকারীর রিপোর্ট:** অ্যাডমিন প্যানেলের **Reports**-এ দেখা যায়। বার্তার শুরুতে `[আইনের-slug]` থাকে, তাই কোন আইনের ভুল তা বোঝা যায়।

---

## ৪. ভেতরের গঠন (সংক্ষেপে)

```
src/core/       অফলাইন কনটেন্ট sync, auth, theme, storage, error report
src/lib/        সব "খাঁটি" লজিক (টেস্ট করা): text, i18n, sync নিয়ম
src/pages/      স্ক্রিন: home, laws, law, settings, tools, login, register, legal ...
src/ui/         ছোট UI অংশ: button, dialog, toast, shell
src/i18n/       bn.js, en.js (দুটো ফাইলের key মিলতে হবে: npm run check দেখে নেয়)
web/            অ্যাডমিন প্যানেল, reset-password, privacy, terms (APK-তে ঢোকে না)
supabase/       schema.sql, seed_legal.sql (generated)
content/legal/  Terms/Privacy/Disclaimer-এর মূল লেখা (বাংলা + English)
android-res/    লঞ্চার আইকন (CI Android প্রজেক্টে কপি করে)
scripts/        build-legal, check-source, android-patch, gen-icons
tests/          unit test, browser test (e2e), ডাটাবেস test (db)
```

**অফলাইন sync কীভাবে কাজ করে:** অ্যাপ প্রথমে একটা ছোট `content_meta` সারি দেখে (version + epoch)। বদলায়নি হলে ওখানেই শেষ। বদলালে শুধু `updated_at` বাড়া সারিগুলো নামে। Archived সারি = "মুছে ফেলো" সংকেত। অ্যাডমিন সত্যিকারের delete করলে epoch বাড়ে, সব ফোন নিজের কপি মুছে নতুন করে নামায়।

**Terms/Privacy বদলাতে:** `content/legal/*.txt` সম্পাদনা করে `npm run legal` (build-এ নিজেই চলে)। চালু অ্যাপে বদলাতে চাইলে অ্যাডমিন প্যানেল → Terms/Privacy। জরুরি বদল হলে `src/config.js`-এ `disclaimerVersion` বাড়ালে সবাইকে আবার মেনে নিতে বলা হবে।

**নতুন মডিউল (Phase 1+) যোগ:** `src/config.js`-এর `modules`-এ `route` দিন, `src/router.js`-এ পেজ যোগ করুন, তারপর অ্যাডমিন → Settings-এ সেই feature switch চালু করুন।

---

## ৫. টেস্ট ও যাচাই

```bash
npm install
npm run check   # import ও অনুবাদ key মিলছে কি না
npm test        # 37 টা unit test
```

এই sandbox-এ যা **সত্যিই চালিয়ে দেখা হয়েছে**:

- `supabase/schema.sql` PostgreSQL 16-এ দুবার চালানো (idempotent) এবং `tests/db/` দিয়ে RLS, role গার্ড, tombstone, version/epoch, report, error log, অ্যাকাউন্ট মোছা।
- পুরো অ্যাপ Chromium-এ (ফোনের আকারে) চালিয়ে 75টা ধাপ: onboarding, সার্চ, বাংলা-সংখ্যা সার্চ, ধারা, ভাষা/থিম বদল, লগইন ভুল/ঠিক, রিপোর্ট, sync, archive, hard-delete, **অফলাইনে restart**, maintenance mode, 404। (`node tests/e2e/smoke.mjs`; একটা নকল Supabase ব্যবহার করে, `tests/harness/`)

যা এখানে **চালানো যায়নি** (network বন্ধ ছিল), তাই প্রথম GitHub run-এ দেখে নিতে হবে:

- `npm install` / `vite build` (CI চালাবে)
- আসল Android build ও ফোনে ইনস্টল (Actions চালাবে)
- আসল Supabase সার্ভারের সাথে (নকল দিয়ে ও SQL আলাদাভাবে টেস্ট হয়েছে)
- অ্যাডমিন প্যানেল ব্রাউজারে চালিয়ে দেখা হয়নি (লজিক ও ফর্ম-ভ্যালিডেশন টেস্ট করা, UI নয়)

প্রথম run-এ কিছু ভাঙলে Actions-এর লগ আমাকে পাঠান, ঠিক করে দেব।

---

## ৬. সমস্যা হলে

| সমস্যা | কারণ ও সমাধান |
|---|---|
| অ্যাপে "সার্ভারের সঙ্গে যুক্ত নয়" | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` variable নেই, বা বানানোর পর APK আবার বানাননি |
| আইন তালিকায় আসছে না | JSON ফাইলে `"status": "published"` নেই, বা APK নতুন করে বানানো হয়নি, বা Actions-এ ফাইলের ভুল আছে (log দেখুন) |
| রিসেট ইমেইলের লিংক "invalid" | ধাপ ২-এর Redirect URL যোগ করা হয়নি, অথবা লিংকের মেয়াদ শেষ |
| অ্যাডমিনে লগইনের পর "no access" | আপনার role `editor`/`admin` নয় (ধাপ ৫) |
| Pages ডিপ্লয় ফেল | Settings → Pages → Source = GitHub Actions করা হয়নি |
| APK বানাতে `versionCode not found` | Capacitor-এর টেমপ্লেট বদলেছে: লগ পাঠান |

---

## ৭. Play Store-এর আগে মিলিয়ে নিন

- [ ] Privacy Policy লিংক (`…/privacy/`) Play Console-এ দেওয়া
- [ ] `VITE_SUPPORT_EMAIL` সেট করা (না থাকলে Privacy Policy-তে ইমেইলের জায়গায় সাধারণ বাক্য ছাপা হয়)
- [ ] Data safety ফর্ম: ইমেইল, নাম (ঐচ্ছিক), error log সংগ্রহ হয়; অ্যাকাউন্ট মোছার সুবিধা অ্যাপের ভেতরেই আছে (Settings → অ্যাকাউন্ট মুছুন)
- [ ] সাইনিং key সুরক্ষিত কপি আছে
- [ ] অন্তত একজন আইনজীবী দিয়ে Terms/Privacy ও প্রথম ব্যাচের আইনের ব্যাখ্যা দেখিয়ে নেওয়া
