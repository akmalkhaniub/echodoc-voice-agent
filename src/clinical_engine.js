/**
 * Clinical Engine for EchoDoc
 * Handles:
 * 1. Incremental extraction of SOAP note elements (Subjective, Objective, Assessment, Plan)
 * 2. Real-time Drug-Drug Interaction (DDI) contraindication sentinel
 * 3. Conversational clinical queries and verbal assistance
 */

// Critical contraindication database for real-time safety warnings
const CONTRAINDICATION_RULES = [
  {
    drugA: 'warfarin',
    drugB: ['aspirin', 'ibuprofen', 'naproxen', 'nsaid', 'meloxicam'],
    severity: 'CRITICAL',
    warning: 'Severe hemorrhage / GI bleeding risk: Concomitant use of Warfarin with NSAIDs impairs platelet aggregation and damages gastric mucosa.'
  },
  {
    drugA: 'sildenafil',
    drugB: ['nitroglycerin', 'isosorbide', 'nitrate'],
    severity: 'CRITICAL',
    warning: 'Severe refractory hypotension / cardiovascular collapse: PDE5 inhibitors potentiate hypotensive effects of organic nitrates.'
  },
  {
    drugA: 'lisinopril',
    drugB: ['spironolactone', 'eplerenone', 'potassium'],
    severity: 'HIGH',
    warning: 'Severe hyperkalemia risk: Dual renin-angiotensin-aldosterone blockade with potassium-sparing agents.'
  },
  {
    drugA: 'fluoxetine',
    drugB: ['phenelzine', 'tranylcypromine', 'selegiline', 'maoi'],
    severity: 'CRITICAL',
    warning: 'Serotonin syndrome risk: Concomitant SSRI and MAO inhibitor causes fatal hyperthermia, tremor, and autonomic instability.'
  },
  {
    drugA: 'ciprofloxacin',
    drugB: ['theophylline', 'amiodarone'],
    severity: 'HIGH',
    warning: 'QT prolongation and severe arrhythmia risk: CYP1A2 inhibition and cardiac repolarization delay.'
  },
  {
    drugA: 'metformin',
    drugB: ['contrast', 'iodinated contrast'],
    severity: 'HIGH',
    warning: 'Lactic acidosis risk: Iodinated radiocontrast can precipitate acute renal failure and metformin accumulation.'
  }
];

export class ClinicalEngine {
  constructor() {
    this.soapNotes = {
      subjective: [],
      objective: [],
      assessment: [],
      plan: []
    };
    this.detectedDrugs = new Set();
    this.activeSafetyAlerts = [];
    this.transcriptHistory = [];
  }

  /**
   * Reset session state for a fresh consultation
   */
  reset() {
    this.soapNotes = {
      subjective: [],
      objective: [],
      assessment: [],
      plan: []
    };
    this.detectedDrugs.clear();
    this.activeSafetyAlerts = [];
    this.transcriptHistory = [];
  }

  /**
   * Check a list of drugs against contraindication rules
   * @param {string[]} drugList 
   * @returns {Array} List of matched safety alerts
   */
  checkDrugs(drugList = []) {
    const list = drugList.map(d => d.toLowerCase().trim());
    const alerts = [];
    for (const rule of CONTRAINDICATION_RULES) {
      if (list.includes(rule.drugA)) {
        for (const drugB of rule.drugB) {
          if (list.includes(drugB)) {
            alerts.push({
              severity: rule.severity,
              title: `Contraindicated Pair: ${rule.drugA.toUpperCase()} + ${drugB.toUpperCase()}`,
              description: rule.warning
            });
          }
        }
      }
    }
    return alerts;
  }

  /**
   * Process a finalized transcript segment from AssemblyAI
   * @param {string} text 
   * @param {string} speaker 
   * @returns {Object} updates to SOAP notes and safety alerts
   */
  processUtterance(text, speaker = 'Doctor') {
    if (!text || typeof text !== 'string') return null;
    const cleanText = text.trim();
    if (!cleanText) return null;

    this.transcriptHistory.push({ speaker, text: cleanText, timestamp: new Date().toISOString() });

    const lower = cleanText.toLowerCase();
    const updates = {
      newSoapItems: [],
      newAlerts: []
    };

    // 1. Extract Subjective cues (symptoms, complaints, duration, history)
    const subjectivePatterns = [
      /(?:patient (?:complains of|reports|experiences|describes)|states that|feeling|felt|pain in|severe headache|chest pain|cough|fever|nausea|shortness of breath|dizziness|fatigue|symptoms started|for the past \w+)/i
    ];
    if (subjectivePatterns.some(p => p.test(cleanText))) {
      const entry = `• ${cleanText.replace(/^(patient|he|she)\s+/i, '')}`;
      if (!this.soapNotes.subjective.includes(entry)) {
        this.soapNotes.subjective.push(entry);
        updates.newSoapItems.push({ section: 'subjective', text: entry });
      }
    }

    // 2. Extract Objective cues (vitals, measurements, physical exam, labs)
    const objectivePatterns = [
      /(?:blood pressure|bp is|heart rate|bpm|temperature|pulse is|oxygen saturation|spo2|physical exam|lungs are|auscultation|clear to auscultation|abdomen is|edema|weight is|scale reads|reflexes|eeg|ekg|mri|ct scan)/i,
      /\b\d{2,3}\/\d{2,3}\b/, // e.g. 120/80
      /\b\d{2,3}\s*(?:bpm|mmhg|kg|lbs|%)\b/i
    ];
    if (objectivePatterns.some(p => p.test(cleanText))) {
      const entry = `• ${cleanText}`;
      if (!this.soapNotes.objective.includes(entry)) {
        this.soapNotes.objective.push(entry);
        updates.newSoapItems.push({ section: 'objective', text: entry });
      }
    }

    // 3. Extract Assessment cues (diagnoses, differential findings)
    const assessmentPatterns = [
      /(?:assessment is|diagnosed with|differential diagnosis|impression is|suspect|likely suffering from|consistent with|hypertension|type 2 diabetes|pneumonia|bronchitis|angina|migraine|atrial fibrillation|hyperlipidemia|tendonitis)/i
    ];
    if (assessmentPatterns.some(p => p.test(cleanText))) {
      const entry = `• ${cleanText.replace(/^(my assessment is|impression is)\s*/i, '')}`;
      if (!this.soapNotes.assessment.includes(entry)) {
        this.soapNotes.assessment.push(entry);
        updates.newSoapItems.push({ section: 'assessment', text: entry });
      }
    }

    // 4. Extract Plan cues (medications, dosing, referrals, follow-up)
    const planPatterns = [
      /(?:prescribe|start on|order|recommend|take|mg daily|bid|tid|follow up in|schedule an?|refer to|lifestyle modifications|counsel on)/i
    ];
    if (planPatterns.some(p => p.test(cleanText))) {
      const entry = `• ${cleanText.replace(/^(let's|i will|we will)\s*/i, '')}`;
      if (!this.soapNotes.plan.includes(entry)) {
        this.soapNotes.plan.push(entry);
        updates.newSoapItems.push({ section: 'plan', text: entry });
      }
    }

    // 5. Drug Detection & Contraindication Sentinel
    const commonDrugs = [
      'warfarin', 'aspirin', 'ibuprofen', 'naproxen', 'sildenafil',
      'nitroglycerin', 'lisinopril', 'spironolactone', 'fluoxetine',
      'metformin', 'ciprofloxacin', 'amiodarone', 'atorvastatin',
      'amoxicillin', 'azithromycin', 'omeprazole'
    ];

    for (const drug of commonDrugs) {
      if (lower.includes(drug)) {
        this.detectedDrugs.add(drug);
      }
    }

    // Evaluate active drug contraindications
    for (const rule of CONTRAINDICATION_RULES) {
      if (this.detectedDrugs.has(rule.drugA)) {
        for (const drugB of rule.drugB) {
          if (this.detectedDrugs.has(drugB)) {
            const alertKey = `${rule.drugA}_${drugB}`;
            const exists = this.activeSafetyAlerts.some(a => a.key === alertKey);
            if (!exists) {
              const alert = {
                key: alertKey,
                severity: rule.severity,
                title: `Contraindicated Pair: ${rule.drugA.toUpperCase()} + ${drugB.toUpperCase()}`,
                description: rule.warning,
                detectedAt: new Date().toISOString()
              };
              this.activeSafetyAlerts.push(alert);
              updates.newAlerts.push(alert);
            }
          }
        }
      }
    }

    return updates;
  }

  /**
   * Handle an interactive verbal query from the doctor
   * (e.g. "What was the blood pressure reading?" or "Any contraindications?")
   * @param {string} query 
   * @returns {string} concise clinical verbal response
   */
  answerClinicalQuery(query) {
    const q = query.toLowerCase();

    if (q.includes('blood pressure') || q.includes('bp') || q.includes('vitals')) {
      const objItems = this.soapNotes.objective;
      const bp = objItems.find(item => item.toLowerCase().includes('pressure') || item.includes('/'));
      if (bp) {
        return `The recorded blood pressure is ${bp.replace('•', '').trim()}.`;
      }
      return "No blood pressure reading has been dictated in the objective notes yet.";
    }

    if (q.includes('contraindication') || q.includes('interaction') || q.includes('safety') || q.includes('alert')) {
      if (this.activeSafetyAlerts.length === 0) {
        return "No adverse drug interactions or contraindications have been detected so far.";
      }
      const first = this.activeSafetyAlerts[0];
      return `Warning: ${first.title}. ${first.description}`;
    }

    if (q.includes('medication') || q.includes('drug') || q.includes('prescribe')) {
      if (this.detectedDrugs.size === 0) {
        return "No medications have been registered in this encounter yet.";
      }
      const drugs = Array.from(this.detectedDrugs).join(', ');
      return `Current medications identified in this session: ${drugs}.`;
    }

    if (q.includes('plan') || q.includes('next step')) {
      if (this.soapNotes.plan.length === 0) {
        return "The treatment plan has not been finalized yet.";
      }
      return `Treatment plan summary: ${this.soapNotes.plan.join('; ').replace(/•/g, '')}`;
    }

    return "Clinical copilot active. Listening to consultation and updating SOAP note in real-time.";
  }

  /**
   * Export the completed clinical consultation as formatted Markdown
   * @param {Object} metadata 
   * @returns {string} Formatted clinical Markdown note
   */
  exportMarkdown(metadata = {}) {
    const date = metadata.date || new Date().toLocaleString();
    const patientName = metadata.patientName || 'Anonymous Patient';
    const physicianName = metadata.physicianName || 'Attending Physician';

    let md = `# Clinical Consultation SOAP Note\n`;
    md += `**Date/Time:** ${date}  \n`;
    md += `**Patient:** ${patientName}  \n`;
    md += `**Provider:** ${physicianName}  \n`;
    md += `**Scribe Engine:** EchoDoc (AssemblyAI Streaming STT)\n\n`;

    if (this.activeSafetyAlerts.length > 0) {
      md += `> [!CAUTION]\n`;
      for (const alert of this.activeSafetyAlerts) {
        md += `> **${alert.title}**: ${alert.description}\n`;
      }
      md += `\n---\n\n`;
    }

    md += `### S — Subjective\n`;
    md += this.soapNotes.subjective.length > 0 
      ? this.soapNotes.subjective.join('\n') + '\n\n'
      : '_No subjective complaints documented._\n\n';

    md += `### O — Objective\n`;
    md += this.soapNotes.objective.length > 0 
      ? this.soapNotes.objective.join('\n') + '\n\n'
      : '_No objective examination findings documented._\n\n';

    md += `### A — Assessment\n`;
    md += this.soapNotes.assessment.length > 0 
      ? this.soapNotes.assessment.join('\n') + '\n\n'
      : '_No formal diagnostic impression recorded._\n\n';

    md += `### P — Plan\n`;
    md += this.soapNotes.plan.length > 0 
      ? this.soapNotes.plan.join('\n') + '\n\n'
      : '_No treatment plan recorded._\n\n';

    md += `### Verified Active Medications\n`;
    if (this.detectedDrugs.size > 0) {
      md += Array.from(this.detectedDrugs).map(d => `- ${d.toUpperCase()}`).join('\n') + '\n\n';
    } else {
      md += `_None noted._\n\n`;
    }

    md += `---\n*Generated by EchoDoc Voice Copilot — Powered by AssemblyAI*`;
    return md;
  }
}
