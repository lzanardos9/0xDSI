// Checks that the browser copy of the Identity Answers parser agrees with the Python original on sample questions.
// Usage: node --experimental-strip-types tools/identity_preview/check_answer_parity.mts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from '../../src/lib/identityAnswerParser.ts';

const preview = JSON.parse(readFileSync('public/identity-preview.json', 'utf8'));
const catalog = preview.answerCatalog;
const questions: string[] = [
  ...catalog.intents.flatMap((i: { examples: string[] }) => i.examples),
  'Why is Morgan risky?', 'NOC-OnCall', 'Disable Brian McDonald', 'What is the password of kmurry', 'weather?',
  'Who can reach it?', 'tell me about bmcdonald', 'Who owns Ramp Control Console', 'What can abhijit reach?',
  'Is Deloitte safe', 'taylor', 'Why is Casey Morgan risky?', 'who is in noc-oncall', 'SAP Finance',
];

const py = JSON.parse(execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'databricks-native/app')
from backend.identity_answer_parser import parse
lex = json.load(open('public/identity-preview.json'))['answerCatalog']['lexicon']
print(json.dumps([parse(q, lex) for q in json.loads(sys.argv[1])]))
`, JSON.stringify(questions)]).toString());

const norm = (o: object) => JSON.stringify(Object.entries(o).filter(([, v]) => v !== undefined && v !== null).sort());
let bad = 0;
questions.forEach((q, i) => {
  const ts = parse(q, catalog);
  if (norm(ts) !== norm(py[i])) {
    bad += 1;
    console.log(`DIFF ${q}\n  ts ${norm(ts)}\n  py ${norm(py[i])}`);
  }
});
console.log(`${questions.length - bad}/${questions.length} questions parse the same`);
process.exit(bad ? 1 : 0);
