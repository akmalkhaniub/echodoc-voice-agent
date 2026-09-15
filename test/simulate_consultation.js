import assert from 'assert';
import { ClinicalEngine } from '../src/clinical_engine.js';

console.log('🧪 Starting EchoDoc Automated Verification Test Suite...\n');

const engine = new ClinicalEngine();

// Test 1: Subjective Cue Extraction
console.log('1️⃣ Testing Subjective symptom extraction...');
const update1 = engine.processUtterance('Patient reports severe headache and dizziness for the past 4 days.', 'Patient');
assert(engine.soapNotes.subjective.length === 1, 'Should extract 1 subjective item');
assert(engine.soapNotes.subjective[0].includes('severe headache'), 'Should contain chief complaint');
console.log('   ✅ Subjective extraction passed:', engine.soapNotes.subjective[0]);

// Test 2: Objective Vitals & Examination Extraction
console.log('2️⃣ Testing Objective vitals extraction...');
const update2 = engine.processUtterance('Physical exam: blood pressure is 158/96 mmHg, pulse is 88 bpm.', 'Doctor');
assert(engine.soapNotes.objective.length === 1, 'Should extract 1 objective item');
assert(engine.soapNotes.objective[0].includes('158/96'), 'Should capture BP reading');
console.log('   ✅ Objective extraction passed:', engine.soapNotes.objective[0]);

// Test 3: Assessment Diagnostic Extraction
console.log('3️⃣ Testing Assessment diagnostic extraction...');
const update3 = engine.processUtterance('My assessment is essential hypertension stage two.', 'Doctor');
assert(engine.soapNotes.assessment.length === 1, 'Should extract 1 assessment item');
assert(engine.soapNotes.assessment[0].includes('hypertension'), 'Should capture diagnosis');
console.log('   ✅ Assessment extraction passed:', engine.soapNotes.assessment[0]);

// Test 4: Plan & Prescription Extraction
console.log('4️⃣ Testing Plan & Rx extraction...');
const update4 = engine.processUtterance('Let us prescribe Lisinopril 10mg daily and schedule follow-up in 2 weeks.', 'Doctor');
assert(engine.soapNotes.plan.length === 1, 'Should extract 1 plan item');
assert(engine.soapNotes.plan[0].includes('Lisinopril'), 'Should capture prescription');
console.log('   ✅ Plan extraction passed:', engine.soapNotes.plan[0]);

// Test 5: Real-Time Contraindication Sentinel
console.log('5️⃣ Testing Real-Time Contraindication Sentinel...');
engine.processUtterance('Patient is currently taking Warfarin 5mg daily.', 'Doctor');
assert(engine.detectedDrugs.has('warfarin'), 'Warfarin should be registered');
assert(engine.activeSafetyAlerts.length === 0, 'No alert should exist with single drug');

// Now introduce contraindicated NSAID (Ibuprofen)
const updateHazard = engine.processUtterance('Patient took Ibuprofen 800mg yesterday for knee pain.', 'Patient');
assert(engine.detectedDrugs.has('ibuprofen'), 'Ibuprofen should be registered');
assert(engine.activeSafetyAlerts.length >= 1, 'Contraindication alert MUST be triggered');
console.log('   ⚠️ Safety Hazard Detected:', engine.activeSafetyAlerts[0].title);
console.log('   📝 Hazard Details:', engine.activeSafetyAlerts[0].description);
console.log('   ✅ Contraindication Sentinel verified successfully!');

// Test 6: Conversational Copilot Q&A
console.log('6️⃣ Testing Conversational Copilot Q&A...');
const bpAnswer = engine.answerClinicalQuery('What was the blood pressure reading?');
assert(bpAnswer.includes('158/96'), 'Copilot should answer with recorded BP');
console.log('   💬 Q: "What was the blood pressure reading?"');
console.log('   🤖 A:', bpAnswer);

const alertAnswer = engine.answerClinicalQuery('Are there any drug interactions?');
assert(alertAnswer.includes('WARFARIN') && alertAnswer.includes('IBUPROFEN'), 'Copilot should highlight active contraindication');
console.log('   💬 Q: "Are there any drug interactions?"');
console.log('   🤖 A:', alertAnswer);

// Test 7: Export Markdown Generation
console.log('7️⃣ Testing Clinical Note Export...');
const markdownReport = engine.exportMarkdown({
  patientName: 'Jane Doe',
  physicianName: 'Dr. Sarah Jenkins'
});
assert(markdownReport.includes('S — Subjective'), 'Report must contain Subjective header');
assert(markdownReport.includes('O — Objective'), 'Report must contain Objective header');
assert(markdownReport.includes('A — Assessment'), 'Report must contain Assessment header');
assert(markdownReport.includes('P — Plan'), 'Report must contain Plan header');
assert(markdownReport.includes('Contraindicated Pair'), 'Report must contain safety alert banner');
console.log('   ✅ Export format verified successfully!');

console.log('\n🎉 ALL 7 ECHODOC TESTS PASSED WITH 100% SUCCESS!\n');
