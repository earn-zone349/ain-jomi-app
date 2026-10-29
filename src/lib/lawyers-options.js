// Fixed lists for the lawyer directory. The slugs are stored in the database (see supabase/phase5_lawyers.sql),
// so never rename one: add a new entry instead.

/** Bangladesh's 64 districts, grouped by division. */
export const DIVISIONS = [
  { id: 'barishal', bn: 'বরিশাল', en: 'Barishal', districts: [['barguna', 'বরগুনা', 'Barguna'], ['barishal', 'বরিশাল', 'Barishal'], ['bhola', 'ভোলা', 'Bhola'], ['jhalokathi', 'ঝালকাঠি', 'Jhalokathi'], ['patuakhali', 'পটুয়াখালী', 'Patuakhali'], ['pirojpur', 'পিরোজপুর', 'Pirojpur']] },
  { id: 'chattogram', bn: 'চট্টগ্রাম', en: 'Chattogram', districts: [['bandarban', 'বান্দরবান', 'Bandarban'], ['brahmanbaria', 'ব্রাহ্মণবাড়িয়া', 'Brahmanbaria'], ['chandpur', 'চাঁদপুর', 'Chandpur'], ['chattogram', 'চট্টগ্রাম', 'Chattogram'], ['cumilla', 'কুমিল্লা', 'Cumilla'], ['coxs_bazar', 'কক্সবাজার', "Cox's Bazar"], ['feni', 'ফেনী', 'Feni'], ['khagrachhari', 'খাগড়াছড়ি', 'Khagrachhari'], ['lakshmipur', 'লক্ষ্মীপুর', 'Lakshmipur'], ['noakhali', 'নোয়াখালী', 'Noakhali'], ['rangamati', 'রাঙ্গামাটি', 'Rangamati']] },
  { id: 'dhaka', bn: 'ঢাকা', en: 'Dhaka', districts: [['dhaka', 'ঢাকা', 'Dhaka'], ['faridpur', 'ফরিদপুর', 'Faridpur'], ['gazipur', 'গাজীপুর', 'Gazipur'], ['gopalganj', 'গোপালগঞ্জ', 'Gopalganj'], ['kishoreganj', 'কিশোরগঞ্জ', 'Kishoreganj'], ['madaripur', 'মাদারীপুর', 'Madaripur'], ['manikganj', 'মানিকগঞ্জ', 'Manikganj'], ['munshiganj', 'মুন্সিগঞ্জ', 'Munshiganj'], ['narayanganj', 'নারায়ণগঞ্জ', 'Narayanganj'], ['narsingdi', 'নরসিংদী', 'Narsingdi'], ['rajbari', 'রাজবাড়ী', 'Rajbari'], ['shariatpur', 'শরীয়তপুর', 'Shariatpur'], ['tangail', 'টাঙ্গাইল', 'Tangail']] },
  { id: 'khulna', bn: 'খুলনা', en: 'Khulna', districts: [['bagerhat', 'বাগেরহাট', 'Bagerhat'], ['chuadanga', 'চুয়াডাঙ্গা', 'Chuadanga'], ['jashore', 'যশোর', 'Jashore'], ['jhenaidah', 'ঝিনাইদহ', 'Jhenaidah'], ['khulna', 'খুলনা', 'Khulna'], ['kushtia', 'কুষ্টিয়া', 'Kushtia'], ['magura', 'মাগুরা', 'Magura'], ['meherpur', 'মেহেরপুর', 'Meherpur'], ['narail', 'নড়াইল', 'Narail'], ['satkhira', 'সাতক্ষীরা', 'Satkhira']] },
  { id: 'mymensingh', bn: 'ময়মনসিংহ', en: 'Mymensingh', districts: [['jamalpur', 'জামালপুর', 'Jamalpur'], ['mymensingh', 'ময়মনসিংহ', 'Mymensingh'], ['netrokona', 'নেত্রকোণা', 'Netrokona'], ['sherpur', 'শেরপুর', 'Sherpur']] },
  { id: 'rajshahi', bn: 'রাজশাহী', en: 'Rajshahi', districts: [['bogura', 'বগুড়া', 'Bogura'], ['joypurhat', 'জয়পুরহাট', 'Joypurhat'], ['naogaon', 'নওগাঁ', 'Naogaon'], ['natore', 'নাটোর', 'Natore'], ['chapainawabganj', 'চাঁপাইনবাবগঞ্জ', 'Chapainawabganj'], ['pabna', 'পাবনা', 'Pabna'], ['rajshahi', 'রাজশাহী', 'Rajshahi'], ['sirajganj', 'সিরাজগঞ্জ', 'Sirajganj']] },
  { id: 'rangpur', bn: 'রংপুর', en: 'Rangpur', districts: [['dinajpur', 'দিনাজপুর', 'Dinajpur'], ['gaibandha', 'গাইবান্ধা', 'Gaibandha'], ['kurigram', 'কুড়িগ্রাম', 'Kurigram'], ['lalmonirhat', 'লালমনিরহাট', 'Lalmonirhat'], ['nilphamari', 'নীলফামারী', 'Nilphamari'], ['panchagarh', 'পঞ্চগড়', 'Panchagarh'], ['rangpur', 'রংপুর', 'Rangpur'], ['thakurgaon', 'ঠাকুরগাঁও', 'Thakurgaon']] },
  { id: 'sylhet', bn: 'সিলেট', en: 'Sylhet', districts: [['habiganj', 'হবিগঞ্জ', 'Habiganj'], ['moulvibazar', 'মৌলভীবাজার', 'Moulvibazar'], ['sunamganj', 'সুনামগঞ্জ', 'Sunamganj'], ['sylhet', 'সিলেট', 'Sylhet']] },
];

export const DISTRICTS = DIVISIONS.flatMap((d) => d.districts.map(([id, bn, en]) => ({ id, bn, en, division: d.id })));
export const DISTRICT_IDS = new Set(DISTRICTS.map((d) => d.id));

/** Courts an advocate may practise in. Values match the database check constraint. */
export const COURTS = [
  { id: 'lower_courts', bn: 'অধস্তন আদালত (জেলা ও দায়রা জজ আদালত ইত্যাদি)', en: 'Lower courts (District and Sessions Judge courts, etc.)' },
  { id: 'high_court_division', bn: 'হাইকোর্ট বিভাগ', en: 'High Court Division' },
  { id: 'appellate_division', bn: 'আপিল বিভাগ', en: 'Appellate Division' },
  { id: 'tribunals', bn: 'ট্রাইব্যুনাল', en: 'Tribunals' },
];
export const COURT_IDS = new Set(COURTS.map((c) => c.id));

export const LIMITS = { name: [3, 100], enrollmentNo: [2, 40], bar: [2, 100], address: [5, 300], qualifications: 200, email: 120, areas: 6 };
