/**
 * NURSE RUSH - SBAR question bank
 * ------------------------------------------------------------------
 * Imported verbatim from: SBAR_20_MCQ_Question_Bank.docx
 * (KING SALMAN MEDICAL CITY - NURSING PRACTICE IMPROVEMENT)
 *
 * All 20 questions are present (Q01-Q20). Question text, answer
 * options, correct answers and explanations are unchanged from the
 * source document. `correct` is the index into the ORIGINAL option
 * order; option order is shuffled at display time and the mapping is
 * carried along with each option object, so the correct answer is
 * always preserved.
 *
 * Source review notes carried over from the document:
 *  - Q04: original file states "Patient four names and Medical Record
 *    Number"; the document interprets this as "patient's full name and
 *    Medical Record Number (MRN)".
 *  - Q19: answer retained from the original file.
 */

export const QUESTIONS = [
  {
    id: 'Q01',
    type: 'mcq',
    text: 'Which standardized communication tool must be used to improve patient safety during handover?',
    options: ['SOAP', 'SBAR', 'Kardex', 'ISBAR only for emergencies'],
    correct: 1,
    explanation:
      'The source identifies SBAR as the standardized communication tool used to improve patient safety during handover.',
  },
  {
    id: 'Q02',
    type: 'tf',
    text: 'It is acceptable to interrupt the handover to answer non-urgent phone calls.',
    options: ['True', 'False'],
    correct: 1,
    explanation:
      'Non-urgent calls should not interrupt handover; interruptions can lead to missed or misunderstood information.',
  },
  {
    id: 'Q03',
    type: 'mcq',
    text: 'What does the letter “S” stand for in SBAR?',
    options: ['Safety', 'Situation', 'Summary', 'Status'],
    correct: 1,
    explanation:
      'S stands for Situation: the immediate reason for the communication or handover.',
  },
  {
    id: 'Q04',
    type: 'mcq',
    text: 'According to the question bank, which two patient identifiers should be used?',
    options: [
      'Room number and bed number',
      'Patient’s full name and Medical Record Number (MRN)',
      'Diagnosis and date of admission',
      'Age and room number',
    ],
    correct: 1,
    explanation:
      'The source specifies the patient’s name and Medical Record Number (MRN). Confirm the exact wording against the facility’s approved patient-identification policy.',
  },
  {
    id: 'Q05',
    type: 'mcq',
    text: 'Which information should always be verified before starting handover?',
    options: [
      'Room number only',
      'Patient’s favorite food',
      'Two patient identifiers',
      'Family contact number',
    ],
    correct: 2,
    explanation:
      'Two patient identifiers must be verified to ensure the handover relates to the correct patient.',
  },
  {
    id: 'Q06',
    type: 'mcq',
    text: 'Which component of SBAR includes the patient’s vital signs and clinical findings?',
    options: ['Situation', 'Background', 'Assessment', 'Recommendation'],
    correct: 2,
    explanation:
      'Assessment includes the nurse’s clinical assessment, including vital signs and relevant findings.',
  },
  {
    id: 'Q07',
    type: 'mcq',
    text: 'What is the primary purpose of using SBAR during patient handover?',
    options: [
      'To shorten the handover regardless of content',
      'To standardize communication and reduce errors',
      'To replace clinical documentation',
      'To increase paperwork',
    ],
    correct: 1,
    explanation:
      'SBAR provides a consistent structure for communication and helps reduce omissions and communication-related errors.',
  },
  {
    id: 'Q08',
    type: 'mcq',
    text: 'Which of the following is NOT a good handover practice?',
    options: [
      'Confirm the patient’s identity using two identifiers',
      'Ask questions to clarify unclear information',
      'Conduct handover in a noisy area with frequent interruptions',
      'Use the SBAR format consistently',
    ],
    correct: 2,
    explanation:
      'A noisy environment with frequent interruptions increases the risk of missed or misunderstood information.',
  },
  {
    id: 'Q09',
    type: 'mcq',
    text: 'A nurse is handing over a patient with worsening shortness of breath. Which information belongs in the “Assessment” section of SBAR?',
    options: [
      'The patient was admitted yesterday with pneumonia.',
      'The patient’s oxygen saturation has dropped to 88% despite oxygen therapy.',
      'Please review the patient immediately.',
      'This is Mr. Ahmed in Room 210.',
    ],
    correct: 1,
    explanation:
      'The oxygen saturation and the patient’s current clinical condition are assessment findings.',
  },
  {
    id: 'Q10',
    type: 'mcq',
    text: 'Spot the error: Which statement is NOT appropriate during handover?',
    options: [
      'Verify the patient’s identity.',
      'Discuss allergies.',
      'Include pending investigations.',
      'Omit abnormal laboratory results because they are documented.',
    ],
    correct: 3,
    explanation:
      'Relevant abnormal laboratory results must be communicated during handover; documentation alone does not replace verbal communication of important findings.',
  },
  {
    id: 'Q11',
    type: 'tf',
    text: 'Reading directly from memory is better than using a standardized tool.',
    options: ['True', 'False'],
    correct: 1,
    explanation:
      'A standardized tool such as SBAR supports structured communication and reduces reliance on memory.',
  },
  {
    id: 'Q12',
    type: 'tf',
    text: 'Handover should occur in an environment with minimal interruptions.',
    options: ['True', 'False'],
    correct: 0,
    explanation:
      'A suitable environment with minimal interruptions supports clear and complete information exchange.',
  },
  {
    id: 'Q13',
    type: 'mcq',
    text: 'What does SBAR stand for?',
    options: [
      'Situation, Background, Assessment, Recommendation',
      'Safety, Background, Action, Response',
      'Situation, Bedside, Action, Review',
      'Summary, Background, Assessment, Report',
    ],
    correct: 0,
    explanation:
      'SBAR stands for Situation, Background, Assessment, and Recommendation.',
  },
  {
    id: 'Q14',
    type: 'mcq',
    text: 'Which recommendation is most appropriate during handover?',
    options: [
      'The patient looks okay.',
      'Please review the patient within 15 minutes due to increasing respiratory distress.',
      'Continue monitoring.',
      'I’m not sure what to do.',
    ],
    correct: 1,
    explanation:
      'A useful recommendation is specific, actionable, and includes an appropriate timeframe and clinical reason.',
  },
  {
    id: 'Q15',
    type: 'mcq',
    text: 'A patient’s blood pressure suddenly drops from 120/80 to 80/50 mmHg. In which SBAR section would this information belong?',
    options: ['Situation', 'Background', 'Assessment', 'Recommendation'],
    correct: 2,
    explanation:
      'The sudden blood pressure change is a current clinical finding and belongs in Assessment.',
  },
  {
    id: 'Q16',
    type: 'mcq',
    text: 'During handover, the receiving nurse does not understand part of the information. What is the safest action?',
    options: [
      'Wait until later',
      'Guess the meaning',
      'Ask for clarification immediately',
      'Ignore it',
    ],
    correct: 2,
    explanation:
      'Clarifying unclear information immediately helps prevent misunderstandings and supports patient safety.',
  },
  {
    id: 'Q17',
    type: 'mcq',
    text: 'What is the final step after giving a handover?',
    options: [
      'Leave immediately',
      'Confirm understanding and allow questions',
      'Write another report',
      'Call the physician',
    ],
    correct: 1,
    explanation:
      'Confirming understanding and allowing questions helps ensure that the receiving nurse has received the necessary information.',
  },
  {
    id: 'Q18',
    type: 'tf',
    text: 'Information about patient care and progress is exchanged during change-of-shift reporting (handover), between shifts, and during transfers and referrals between healthcare providers.',
    options: ['True', 'False'],
    correct: 0,
    explanation:
      'Handover is used to exchange relevant information during shift changes, transfers, and referrals.',
  },
  {
    id: 'Q19',
    type: 'mcq',
    text: 'After the handover between staff, the SBAR tool is not signed by the receiving nurse. What is the appropriate action?',
    options: [
      'Leave the form unsigned',
      'Sign on behalf of the receiving nurse',
      'Ask the receiving nurse to sign the SBAR tool',
      'Discard the SBAR tool',
    ],
    correct: 2,
    explanation:
      'The source answer is to ask the receiving nurse to sign the SBAR tool. Follow the facility’s approved documentation and signature procedure.',
  },
  {
    id: 'Q20',
    type: 'tf',
    text: 'There is no need to document the handover between the intensive care nurse and the unit/ward nurse at the time of transfer to a lower acuity of care.',
    options: ['True', 'False'],
    correct: 1,
    explanation:
      'The source marks this statement as false: the handover at transfer to a lower acuity of care should be documented.',
  },
];

/** Sanity guard so a bad edit fails loudly instead of silently. */
export function validateBank() {
  const issues = [];
  if (QUESTIONS.length !== 20) issues.push(`expected 20 questions, found ${QUESTIONS.length}`);
  const seen = new Set();
  for (const q of QUESTIONS) {
    if (seen.has(q.id)) issues.push(`duplicate id ${q.id}`);
    seen.add(q.id);
    const n = q.type === 'tf' ? 2 : 4;
    if (q.options.length !== n) issues.push(`${q.id}: expected ${n} options, found ${q.options.length}`);
    if (q.correct < 0 || q.correct >= q.options.length) issues.push(`${q.id}: correct index out of range`);
    if (!q.explanation) issues.push(`${q.id}: missing explanation`);
  }
  return issues;
}

/**
 * Pick exactly two DIFFERENT questions for a round, and shuffle each
 * question's options while keeping the correct answer mapped.
 * Recently used questions are avoided so consecutive rounds differ.
 */
const recent = [];

export function pickRoundQuestions() {
  const pool = QUESTIONS.filter((q) => !recent.includes(q.id));
  const source = pool.length >= 2 ? pool : QUESTIONS.slice();

  const a = source[Math.floor(Math.random() * source.length)];
  let b = a;
  let guard = 0;
  while (b.id === a.id && guard++ < 200) {
    const alt = source.length > 1 ? source : QUESTIONS;
    b = alt[Math.floor(Math.random() * alt.length)];
  }
  if (b.id === a.id) {
    b = QUESTIONS.find((q) => q.id !== a.id);
  }

  recent.push(a.id, b.id);
  while (recent.length > 8) recent.shift();

  return [prepare(a), prepare(b)];
}

/** Shuffle options, preserving which one is correct. */
export function prepare(q) {
  const items = q.options.map((text, i) => ({ text, isCorrect: i === q.correct }));

  // Shuffled every appearance (multiple choice and True/False alike) so
  // position can never be memorised. The isCorrect flag travels with the
  // option text, so the mapping survives the shuffle.
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return {
    id: q.id,
    type: q.type,
    text: q.text,
    explanation: q.explanation,
    options: items,
    correctText: q.options[q.correct],
  };
}
