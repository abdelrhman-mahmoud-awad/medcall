/**
 * seedScript.js  —  Creates a sample drug market research script
 *
 * Usage:  node src/scripts/seedScript.js
 * Run this once after setting up the backend to get a working test script.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Script   = require('../models/Script');
const Contact  = require('../models/Contact');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // ── Sample Script (Egyptian Arabic) ──────────────────────────────────────
  const existing = await Script.findOne({ drugName: 'Augmentin' });
  if (!existing) {
    await Script.create({
      name:       'أوجمنتين - دراسة سوق',
      drugName:   'Augmentin',
      targetType: 'both',
      language:   'ar-EG',

      greeting: `أهلاً، أنا سلمى من شركة MedCall للأبحاث الصيدلانية.
بتكلم مع ${'{name}'}؟
معاكيش دقيقتين بس لاستطلاع قصير عن أحد الأدوية؟ هيساعدنا نفهم السوق أحسن.`,

      closing: `جزاك الله خيراً على وقتك. إجاباتك هتساعدنا جداً في بحثنا.
لو محتاج أي معلومات أو عندك أي سؤال، ابعت لنا واتساب على الرقم ده. مع السلامة!`,

      unavailableMessage:
        `معلش إنك مشغول. هنكلمك في وقت تاني. مع السلامة!`,

      questions: [
        {
          key:           'awareness',
          text:          'بتعرف دواء أوجمنتين وبتتعامل معاه في شغلك؟',
          textEn:        'Are you familiar with Augmentin in your practice?',
          type:          'yesno',
          scoringWeight: 2,
        },
        {
          key:           'prescribing_frequency',
          text:          'بتصرف أو بتوصف أوجمنتين إيه قد؟ يعني تقريباً كام مرة في الأسبوع؟',
          textEn:        'How often do you prescribe/dispense Augmentin per week?',
          type:          'open',
          scoringWeight: 3,
        },
        {
          key:           'main_indication',
          text:          'بتستخدمه في أنهي حالات بالظبط؟ يعني إيه أكتر حاجة بتوصفه فيها؟',
          textEn:        'What are the main indications you use it for?',
          type:          'open',
          scoringWeight: 2,
        },
        {
          key:           'competitor_preference',
          text:          'في مضادات حيوية تانية بتفضلها أكتر أحياناً؟ وإيه السبب؟',
          textEn:        'Are there competing antibiotics you prefer at times, and why?',
          type:          'open',
          scoringWeight: 2,
        },
        {
          key:           'side_effects_concern',
          text:          'هل عندك مخاوف من الآثار الجانبية اللي بيبلغ عنها مرضاك؟',
          textEn:        'Do you have concerns about side effects reported by patients?',
          type:          'yesno',
          followUpIf:    'نعم',
          followUpKey:   'side_effects_detail',
          scoringWeight: 1,
        },
        {
          key:           'side_effects_detail',
          text:          'إيه أكتر الآثار الجانبية اللي بيشكو منها مرضاك؟',
          textEn:        'What are the most reported side effects?',
          type:          'open',
          scoringWeight: 1,
        },
        {
          key:           'additional_info_interest',
          text:          'لو وفرنا ليك معلومات تفصيلية أو بيانات سريرية جديدة، هتكون مهتم تطلع عليها؟',
          textEn:        'Would you be interested in new clinical data or detailed information?',
          type:          'yesno',
          scoringWeight: 3,
        },
      ],

      warmThreshold: 35,
      hotThreshold:  65,
    });
    console.log('✅ Sample script created: Augmentin market research');
  } else {
    console.log('ℹ️  Script already exists, skipping');
  }

  // ── Sample Contacts ───────────────────────────────────────────────────────
  const contacts = [
    {
      name: 'د. أحمد محمد سالم',
      type: 'physician',
      specialty: 'General Practice',
      phone: '+201001234567',
      clinic: 'عيادة النور',
      city: 'القاهرة',
    },
    {
      name: 'صيدلية الشفاء',
      type: 'pharmacist',
      phone: '+201112345678',
      clinic: 'صيدلية الشفاء',
      city: 'الإسكندرية',
    },
    {
      name: 'د. مريم إبراهيم',
      type: 'physician',
      specialty: 'Internal Medicine',
      phone: '+201223456789',
      clinic: 'مستشفى المعادي',
      city: 'القاهرة',
    },
  ];

  for (const c of contacts) {
    const exists = await Contact.findOne({ phone: c.phone });
    if (!exists) {
      await Contact.create(c);
      console.log(`✅ Contact created: ${c.name}`);
    }
  }

  await mongoose.disconnect();
  console.log('\n🎉 Seed complete. You can now test calls from the dashboard.');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
