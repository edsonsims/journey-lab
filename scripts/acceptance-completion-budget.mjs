// Explicit alternative validation configuration; importing this module does not execute it.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {acceptanceBudgetFix} from './acceptance-budget-fix.mjs';

export const acceptanceCompletionBudget = options => acceptanceBudgetFix({...options,configuration:'completion-budget'});

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  if(!process.argv.includes('--execute'))console.log('Prepared only. Explicit completion-budget validation (250000 tokens, 12 actions, 300 seconds, at most 6 sessions): node scripts/acceptance-completion-budget.mjs --execute');
  else {const result=await acceptanceCompletionBudget();console.log(JSON.stringify(result));if(result.status!=='recorded_acceptance_passed')process.exitCode=1;}
}
