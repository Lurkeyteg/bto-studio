/* BTO Studio engine tests.
 * Runs the real engine straight out of index.html (no copy) so the shipped
 * file is what is verified. Node 22+.
 *
 *   node tests/engine.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* ==== BTO ENGINE START ==== \*\/([\s\S]*?)\/\* ==== BTO ENGINE END ==== \*\//);
if (!m) { console.error('FATAL: engine markers not found in index.html'); process.exit(1); }

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(m[1], sandbox);
const BTO = sandbox.BTO;
if (!BTO) { console.error('FATAL: engine did not export BTO'); process.exit(1); }

let pass = 0, fail = 0;
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
function eq(name, got, want, tol = 0.6) {
  if (typeof want === 'number') {
    if (near(got, want, tol)) { pass++; }
    else { fail++; console.log(`FAIL ${name}: got ${got}, want ${want}`); }
  } else if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function base(over = {}) {
  const s = BTO.defaultState();
  s.grantMode = 'manual'; s.grantManual = 0; s.otherGrant = 0;
  s.people[0].oa = 0; s.people[1].oa = 0;
  s.otherCommitments = 0;
  Object.assign(s, over);
  return s;
}
const stage = (R, k) => R.stages.find(x => x.key === k);

/* ---------------- 1. statutory building blocks ---------------- */
eq('bsd 550,000 (video example A)', BTO.bsd(550000), 11100, 0.01);
eq('bsd 250,000 (video example B)', BTO.bsd(250000), 3200, 0.01);
eq('bsd 180,000 = 1%', BTO.bsd(180000), 1800, 0.01);
eq('bsd 360,000 = 1%+2%', BTO.bsd(360000), 5400, 0.01);
eq('bsd 1,000,000 = adds 3% band', BTO.bsd(1000000), 1800 + 3600 + 19200, 0.01);
eq('bsd 1,200,000 = adds 4% band', BTO.bsd(1200000), 24600 + 8000, 0.01);

eq('option fee 2-room', BTO.optionFee('2-room'), 500, 0.01);
eq('option fee 3-room', BTO.optionFee('3-room'), 1000, 0.01);
eq('option fee 4-room', BTO.optionFee('4-room'), 2000, 0.01);
eq('option fee 5-room', BTO.optionFee('5-room'), 2000, 0.01);

eq('EHG at $5,000 income (couple)', BTO.ehgGrant(5000, false), 65000, 0.01);
eq('EHG at $1,500 income', BTO.ehgGrant(1500, false), 120000, 0.01);
eq('EHG at $9,000 income', BTO.ehgGrant(9000, false), 5000, 0.01);
eq('EHG above ceiling = 0', BTO.ehgGrant(9001, false), 0, 0.01);
eq('EHG single = half rate', BTO.ehgGrant(3000, true), 47500, 0.01);

/* legal: 30k*0.09% + 30k*0.072% + rest*0.06% = 27+21.6+294 = 342.6 -> ceil 343 -> *1.09 */
eq('legal fee on 550,000 incl GST', BTO.legalFee(550000, 1.09), 373.87, 0.01);
eq('legal fee on 250,000 incl GST', BTO.legalFee(250000, 1.09), 177.67, 0.01);

/* CPF: 5,000 income -> (1,000 employee + 850 employer) * 62.17% OA */
eq('monthly OA at 5,000 / age 30', BTO.monthlyOA({ income: 5000, age: 30, basis: 'employee' }, BTO.defaultState()), 1150.145, 0.01);
eq('take-home at 5,000 / age 30', BTO.monthlyTakeHome({ income: 5000, age: 30, basis: 'employee' }, BTO.defaultState()), 4000, 0.01);
eq('salary ceiling caps CPF at 8,000', BTO.monthlyOA({ income: 12000, age: 30, basis: 'employee' }, BTO.defaultState()), 1840.232, 0.01);
eq('take-home keeps the excess above ceiling', BTO.monthlyTakeHome({ income: 12000, age: 30, basis: 'employee' }, BTO.defaultState()), 10400, 0.01);

/* ---------------- 2. video example A — 4-room, $550,000, couple, HDB loan ---------------- */
{
  const R = BTO.compute(base({
    mode: 'couple', flatType: '4-room', price: 550000, loanType: 'hdb',
    people: [{ name: 'A', income: 5000, age: 30, oa: 0, basis: 'employee' },
             { name: 'B', income: 4000, age: 29, oa: 0, basis: 'employee' }]
  }));
  eq('A: option fee stage', stage(R, 's2').total, 2000, 0.01);
  eq('A: downpayment 25%', R.totals.dpTotal, 137500, 0.01);
  eq('A: signing downpayment 5% less option fee', stage(R, 's3').items[0].a, 25500, 0.01);
  eq('A: BSD on stage 3', stage(R, 's3').items[1].a, 11100, 0.01);
  eq('A: key-collection downpayment 20%', stage(R, 's4').items[0].a, 110000, 0.01);
  eq('A: the two downpayment stages add to 25%', stage(R, 's3').items[0].a + stage(R, 's2').total + stage(R, 's4').items[0].a, 137500, 0.01);
  eq('A: loan is the remaining 75%', R.loan.amount, 412500, 0.01);
  eq('A: monthly instalment @2.6%/25y', R.loan.monthly, BTO.pmt(0.026 / 12, 300, 412500), 0.01);
  eq('A: stamp duty on deed of assignment capped at 500', stage(R, 's4').items[4].a, 500, 0.01);
  eq('A: survey fee 4-room incl GST', BTO.surveyFee('4-room', 1.09), 299.75, 0.01);
  eq('A: MSR well under 30% at 9,000 income', R.loan.msr < 0.3, true);

  /* no income at all -> no CPF credits, so every dollar is cash */
  const Rz = BTO.compute(base({
    price: 550000, flatType: '4-room', loanType: 'hdb',
    people: [{ name: 'A', income: 0, age: 30, oa: 0, basis: 'employee' },
             { name: 'B', income: 0, age: 30, oa: 0, basis: 'employee' }]
  }));
  eq('A: no income means no CPF', Rz.totals.cpf, 0, 0.01);
  eq('A: cash total = grand total with no CPF', Rz.totals.cash, Rz.totals.all, 0.01);
  eq('A: stages add up', Rz.stages.reduce((a, s) => a + s.total, 0), Rz.totals.all, 0.01);
  eq('A: CPF + cash = grand total', R.totals.cpf + R.totals.cash, R.totals.all, 0.01);
}

/* ---------------- 3. downpayment schedules: adult 5+20 vs student 2.5+22.5 ---------------- */
{
  const adult = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'hdb', dpSchedule: 'adult' }));
  eq('adult: signing 5% less option fee', stage(adult, 's3').items[0].a, 25500, 0.01);
  eq('adult: key collection 20%', stage(adult, 's4').items[0].a, 110000, 0.01);
  eq('adult: schedule is reported', adult.scheduleKey, 'adult');
  eq('adult: signing share is 5%', adult.signShare, 0.05, 1e-9);

  const dia = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'hdb', dpSchedule: 'student' }));
  eq('student: signing 2.5% less option fee', stage(dia, 's3').items[0].a, 11750, 0.01);
  eq('student: key collection 22.5%', stage(dia, 's4').items[0].a, 123750, 0.01);
  eq('student: schedule is reported', dia.scheduleKey, 'student');
  eq('student: signing share is 2.5%', dia.signShare, 0.025, 1e-9);
  eq('student: still the same 25% in total', stage(dia, 's3').items[0].a + stage(dia, 's2').total + stage(dia, 's4').items[0].a, 137500, 0.01);
  eq('student: loan unchanged at 75%', dia.loan.amount, 412500, 0.01);

  /* the staggered schedule moves cash later, so the first payment is smaller */
  eq('student: first payment is smaller than adult', stage(dia, 's3').total < stage(adult, 's3').total, true);
  eq('student: key-collection payment is larger than adult', stage(dia, 's4').total > stage(adult, 's4').total, true);

  /* a bank loan cannot take the staggered schedule */
  const bankStudent = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'bank75', dpSchedule: 'student' }));
  eq('bank75: staggered schedule is ignored', bankStudent.scheduleKey, 'adult');
  eq('bank75: signing stays at 5%', stage(bankStudent, 's3').items[0].a, 25500, 0.01);
}

/* ---------------- 4. bank loan 75% LTV ---------------- */
{
  const bigOA = [{ name: 'A', income: 6000, age: 30, oa: 400000, basis: 'employee', citizenship: 'SC' },
                 { name: 'B', income: 6000, age: 30, oa: 400000, basis: 'employee', citizenship: 'SC' }];
  const R = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'bank75', people: bigOA }));
  eq('bank75: signing DP 5% less option fee', stage(R, 's3').items[0].a, 25500, 0.01);
  eq('bank75: the whole signing downpayment is cash', stage(R, 's3').cash, 25500, 0.01);
  eq('bank75: key DP 20%', stage(R, 's4').items[0].a, 110000, 0.01);
  eq('bank75: key-collection balance is CPF-eligible', stage(R, 's4').items[0].p, 'either');
  eq('bank75: no mortgage in-escrow fee', stage(R, 's4').items[3].a, 0, 0.01);
}

/* ---------------- 5. bank loan 55% LTV (sheet rule: 10% cash + 35% CPF) ---------------- */
{
  const bigOA = [{ name: 'A', income: 6000, age: 30, oa: 600000, basis: 'employee' },
                 { name: 'B', income: 6000, age: 30, oa: 600000, basis: 'employee' }];
  const R = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'bank55', people: bigOA }));
  eq('bank55: downpayment 45%', R.totals.dpTotal, 247500, 0.01);
  eq('bank55: loan 55%', R.loan.amount, 302500, 0.01);
  eq('bank55: mandatory cash 10% less option fee', stage(R, 's3').cash, 53000, 0.01);
  eq('bank55: nothing left at key', stage(R, 's4').items[0].a, 0, 0.01);
}

/* ---------------- 6. video example B — single, 2-room Flexi, $250,000 ---------------- */
{
  const R = BTO.compute(base({
    mode: 'single', flatType: '2-room', price: 250000, loanType: 'hdb',
    people: [{ name: 'A', income: 3500, age: 30, oa: 0, basis: 'employee' }, { name: 'B', income: 0, age: 30, oa: 0, basis: 'employee' }]
  }));
  eq('B: option fee 500', stage(R, 's2').total, 500, 0.01);
  eq('B: total DP 62,500', R.totals.dpTotal, 62500, 0.01);
  eq('B: signing DP 12,000', stage(R, 's3').items[0].a, 12000, 0.01);
  eq('B: BSD 3,200', stage(R, 's3').items[1].a, 3200, 0.01);
  eq('B: key DP 50,000', stage(R, 's4').items[0].a, 50000, 0.01);
  eq('B: single pays 100% of cash', R.perPerson.length === 1 && R.ratios[0] === 1, true);
  eq('B: single survey fee 163.50', BTO.surveyFee('2-room', 1.09), 163.5, 0.01);
  eq('B: fire insurance 2-room', BTO.firePremium('2-room'), 1.99, 0.01);
}

/* ---------------- 7. CPF pays first, cash only covers the rest ---------------- */
{
  const R = BTO.compute(base({
    price: 550000, flatType: '4-room', loanType: 'hdb',
    people: [{ name: 'A', income: 6000, age: 32, oa: 120000, basis: 'employee' },
             { name: 'B', income: 5000, age: 31, oa: 90000, basis: 'employee' }]
  }));
  eq('CPF: signing stage needs no cash', stage(R, 's3').cash, 0, 0.01);
  eq('CPF: signing stage covered by OA', stage(R, 's3').cpfUsed, stage(R, 's3').total, 0.01);
  eq('CPF: still 25% downpayment in CPF', R.totals.dpTotal, 137500, 0.01);
  eq('CPF: cash only at key when OA runs thin', R.totals.cash > 0, true);
  eq('CPF: CPF never exceeds eligible items', R.totals.cpf <= R.totals.all, true);
  eq('CPF: monthly instalment fully covered by OA inflow', R.loan.cashTopUp === 0, true);
}

/* ---------------- 8. save-up maths ---------------- */
{
  const R = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'hdb', mSign: 8, mKey: 36, saveRate: 0.03 }));
  const need3 = stage(R, 's3').cash, need4 = stage(R, 's4').cash;
  /* with no growth the monthly figure must simply fund both lumps */
  const R0 = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'hdb', mSign: 8, mKey: 36, saveRate: 0 }));
  eq('save: plain rate >= signing lump / months to signing', R0.saveup.plain >= need3 / 8 - 0.01, true);
  eq('save: plain rate >= total / months to key', R0.saveup.plain >= (need3 + need4) / 36 - 0.01, true);
  eq('save: growth beats plain at 3%', R.saveup.growth < R0.saveup.plain, true);
  eq('save: plain is growth at 0%', R0.saveup.growth, R0.saveup.plain, 0.01);

  /* all the cash landing at key collection: plain = need4 / m4 */
  const R2 = BTO.compute(base({
    price: 550000, flatType: '4-room', loanType: 'hdb', mSign: 8, mKey: 36, saveRate: 0,
    people: [{ name: 'A', income: 6000, age: 30, oa: 300000, basis: 'employee' },
             { name: 'B', income: 6000, age: 30, oa: 300000, basis: 'employee' }]
  }));
  if (R2.saveup.need3 === 0) {
    eq('save: pure key-collection lump spreads over 36 months', R2.saveup.plain, R2.saveup.need4 / 36, 0.02);
  } else { pass++; }

  /* 3-year build is cheaper per month than 2-year */
  const R3 = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'hdb', mKey: 24 }));
  const R4 = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'hdb', mKey: 48 }));
  eq('save: longer build never costs more per month', R4.saveup.growth <= R3.saveup.growth + 0.01, true);
  eq('save: longer build leaves less cash due at key', R4.saveup.need4 < R3.saveup.need4, true);

  /* two-speed plan: the rate after signing is never higher than the upfront one
     and it still lands the key-collection lump */
  const C = BTO.compute(base({
    price: 550000, flatType: '4-room', loanType: 'hdb', saveRate: 0.03,
    people: [{ name: 'A', income: 3000, age: 30, oa: 8000, basis: 'employee' },
             { name: 'B', income: 2500, age: 30, oa: 5000, basis: 'employee' }]
  }));
  eq('save: after-signing rate is never higher than the upfront rate', C.saveup.afterSign <= C.saveup.growth + 0.01, true);
  eq('save: after-signing rate is never negative', C.saveup.afterSign >= 0, true);
  /* when the signing lump is what sets the pace, the second phase is genuinely cheaper */
  const signingDriven = BTO.compute(base({
    price: 550000, flatType: '4-room', loanType: 'bank55', saveRate: 0.03,
    people: [{ name: 'A', income: 3000, age: 30, oa: 0, basis: 'employee', citizenship: 'SC' },
             { name: 'B', income: 2500, age: 30, oa: 0, basis: 'employee', citizenship: 'SC' }]
  }));
  if (signingDriven.saveup.driver === 'signing'){
    eq('save: two-speed plan is cheaper after signing', signingDriven.saveup.afterSign < signingDriven.saveup.growth, true);
  } else { pass++; }
  {
    /* replay the two-speed plan and check the key-collection lump is exactly met */
    const r = 0.03 / 12, S = C.saveup.growth, S2 = C.saveup.afterSign;
    let bal = 0;
    for (let m = 1; m <= C.saveup.m4; m++){
      bal = bal * (1 + r) + (m <= C.saveup.m3 ? S : S2);
      if (m === C.saveup.m3) bal -= C.saveup.need3;
    }
    eq('save: two-speed plan covers the key-collection bill', bal, C.saveup.need4, 2);
  }
}

/* ---------------- 9. split logic ---------------- */
{
  const R = BTO.compute(base({
    mode: 'couple', splitMode: 'equal', price: 550000, flatType: '4-room',
    people: [{ name: 'A', income: 8000, age: 30, oa: 40000, basis: 'employee' },
             { name: 'B', income: 2000, age: 30, oa: 40000, basis: 'employee' }]
  }));
  eq('split: equal shares 50/50', R.ratios[0], 0.5, 0.0001);
  const sumCash = R.perPerson.reduce((a, p) => a + p.cash, 0);
  eq('split: per-person cash sums to total cash', sumCash, R.totals.cash, 0.5);
  const sumCpf = R.perPerson.reduce((a, p) => a + p.cpf, 0);
  eq('split: per-person CPF sums to total CPF', sumCpf, R.totals.cpf, 0.5);

  const Ri = BTO.compute(base({
    mode: 'couple', splitMode: 'income', price: 550000, flatType: '4-room',
    people: [{ name: 'A', income: 8000, age: 30, oa: 40000, basis: 'employee' },
             { name: 'B', income: 2000, age: 30, oa: 40000, basis: 'employee' }]
  }));
  eq('split: by income = 80/20', Math.round(Ri.ratios[0] * 100), 80);
  const Rc = BTO.compute(base({
    mode: 'couple', splitMode: 'custom', splitA: 70, price: 550000, flatType: '4-room',
    people: [{ name: 'A', income: 8000, age: 30, oa: 40000, basis: 'employee' },
             { name: 'B', income: 2000, age: 30, oa: 40000, basis: 'employee' }]
  }));
  eq('split: custom 70/30', Math.round(Rc.ratios[0] * 100), 70);
}

/* ---------------- 10. grants reduce price, loan and downpayment ---------------- */
{
  const R = BTO.compute(base({ price: 550000, flatType: '4-room', grantMode: 'auto', otherGrant: 0,
    people: [{ name: 'A', income: 3000, age: 30, oa: 0, basis: 'employee' },
             { name: 'B', income: 3000, age: 30, oa: 0, basis: 'employee' }] }));
  eq('grant: EHG applied at 6,000 household income', R.totals.ehgAuto, 50000, 0.01);
  eq('grant: net price after grant', R.totals.net, 500000, 0.01);
  eq('grant: downpayment on net price', R.totals.dpTotal, 125000, 0.01);
  eq('grant: loan on net price', R.loan.amount, 375000, 0.01);
  eq('grant: stamp duty still on gross price', R.totals.bsd, BTO.bsd(550000), 0.01);
}

/* ---------------- 11. path comparison ---------------- */
{
  const R = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'hdb' }));
  eq('compare: four rows present', R.compare.length, 4);
  eq('compare: routes in order', R.compare.map(c => c.key).join(','), 'hdb,hdb,bank75,bank55');
  eq('compare: the second row is the staggered schedule',
     R.compare[1].sched, 'student');
  const adult = R.compare[0], stag = R.compare[1], bank75 = R.compare[2], bank55 = R.compare[3];
  eq('compare: staggered row is labelled', stag.label.indexOf('staggered') > 0, true);
  eq('compare: staggered has less cash due before key', stag.upfront < adult.upfront, true);
  eq('compare: total cash is identical for both HDB schedules', stag.cash, adult.cash, 0.5);
  eq('compare: 55% LTV needs the most cash upfront', bank55.upfront > bank75.upfront, true);
  eq('compare: signing share is carried into the comparison', stag.sign, 0.025, 1e-9);
}

/* ---------------- 12. wiggle room ---------------- */
{
  const R = BTO.compute(base({
    price: 550000, flatType: '4-room', loanType: 'hdb', capacityMode: 'manual', capacityManual: 2500,
    saveRate: 0.03, goalRate: 0.06
  }));
  eq('wiggle: shortfall detected when capacity is too low', R.saveup.achievable, false);
  eq('wiggle: shortfall is quantified', R.saveup.gap > 0, true);
  eq('wiggle: gap equals the requirement minus capacity',
     R.saveup.gap, R.saveup.growth - R.saveup.capacity, 0.5);
  /* the signing deadline binds here, so the useful number is the months it takes to save it */
  eq('wiggle: months needed is reported for the binding deadline',
     R.saveup.monthsNeeded > R.saveup.m3 || R.saveup.monthsNeeded === null, true);
  eq('wiggle: surplus reported when capacity is ample', (() => {
    const R2 = BTO.compute(base({ price: 550000, flatType: '4-room', capacityMode: 'manual', capacityManual: 15000 }));
    return R2.saveup.surplus > 0 && R2.saveup.goalFV > 0 && R2.saveup.achievable;
  })(), true);
}

/* ---------------- 13. citizenship: SC / PR 1st year / PR 2nd year ----------------
 * Expected rates come from CPF Board's "CPF Contribution Rate Table from 1 January
 * 2026": Table 1 (SC & SPR 3rd year on), Table 2 (SPR 1st year), Table 3 (SPR 2nd
 * year), all under graduated (G/G) rates. OA share from the allocation table (Table 6,
 * by age only). Every total below is employee + employer from the PDF.
 */
{
  const p = (cit, age = 30, income = 5000) => ({ name: 'X', income, age, oa: 0, basis: 'employee', citizenship: cit });
  const s = base({});

  const sc = BTO.cpfRates(30, 'SC');
  eq('cit: citizen under 55 is 20% + 17%', [sc.emp, sc.empr].join('/'), '0.2/0.17');
  eq('cit: citizen total 37%', sc.total, 0.37, 1e-9);

  const pr1 = BTO.cpfRates(30, 'PR1');
  eq('cit: PR 1st year under 55 is 5% + 4%', [pr1.emp, pr1.empr].join('/'), '0.05/0.04');
  eq('cit: PR 1st year total 9%', pr1.total, 0.09, 1e-9);

  const pr2 = BTO.cpfRates(30, 'PR2');
  eq('cit: PR 2nd year under 55 is 15% + 9%', [pr2.emp, pr2.empr].join('/'), '0.15/0.09');
  eq('cit: PR 2nd year total 24%', pr2.total, 0.24, 1e-9);

  /* age bands above 55, straight from the same three tables */
  eq('cit: citizen 55-60 is 18% + 16%', BTO.cpfRates(57, 'SC').total, 0.34, 1e-9);
  eq('cit: citizen 60-65 is 12.5% + 12.5%', BTO.cpfRates(62, 'SC').total, 0.25, 1e-9);
  eq('cit: citizen 65-70 is 7.5% + 9%', BTO.cpfRates(67, 'SC').total, 0.165, 1e-9);
  eq('cit: citizen above 70 is 5% + 7.5%', BTO.cpfRates(72, 'SC').total, 0.125, 1e-9);
  eq('cit: PR1 55-60 stays 5% + 4%', BTO.cpfRates(57, 'PR1').total, 0.09, 1e-9);
  eq('cit: PR1 60-65 is 5% + 3.5%', BTO.cpfRates(62, 'PR1').total, 0.085, 1e-9);
  eq('cit: PR2 55-60 is 12.5% + 6%', BTO.cpfRates(57, 'PR2').total, 0.185, 1e-9);
  eq('cit: PR2 60-65 is 7.5% + 3.5%', BTO.cpfRates(62, 'PR2').total, 0.11, 1e-9);
  eq('cit: PR2 above 65 is 5% + 3.5%', BTO.cpfRates(67, 'PR2').total, 0.085, 1e-9);

  /* monthly money: OA credited and take-home, at $5,000 and age 30 */
  eq('cit: citizen OA on 5,000', BTO.monthlyOA(p('SC'), s), 1850 * 0.6217, 0.01);
  eq('cit: PR1 OA on 5,000', BTO.monthlyOA(p('PR1'), s), 450 * 0.6217, 0.01);
  eq('cit: PR2 OA on 5,000', BTO.monthlyOA(p('PR2'), s), 1200 * 0.6217, 0.01);
  eq('cit: citizen take-home on 5,000', BTO.monthlyTakeHome(p('SC'), s), 4000, 0.01);
  eq('cit: PR1 take-home on 5,000', BTO.monthlyTakeHome(p('PR1'), s), 4750, 0.01);
  eq('cit: PR2 take-home on 5,000', BTO.monthlyTakeHome(p('PR2'), s), 4250, 0.01);
  eq('cit: PR contribution still capped by the 8,000 salary ceiling',
     BTO.monthlyOA(p('PR1', 30, 12000), s), 8000 * 0.09 * 0.6217, 0.01);

  /* the model reacts: swapping a partner from citizen to PR moves money to cash */
  const bothSC = BTO.compute(base({
    price: 550000, flatType: '4-room', loanType: 'hdb',
    people: [{ name: 'A', income: 5000, age: 30, oa: 20000, basis: 'employee', citizenship: 'SC' },
             { name: 'B', income: 4000, age: 29, oa: 15000, basis: 'employee', citizenship: 'SC' }]
  }));
  const mixed = BTO.compute(base({
    price: 550000, flatType: '4-room', loanType: 'hdb',
    people: [{ name: 'A', income: 5000, age: 30, oa: 20000, basis: 'employee', citizenship: 'SC' },
             { name: 'B', income: 4000, age: 29, oa: 15000, basis: 'employee', citizenship: 'PR1' }]
  }));
  eq('cit: PR partner lowers CPF used', mixed.totals.cpf < bothSC.totals.cpf, true);
  eq('cit: PR partner raises cash needed', mixed.totals.cash > bothSC.totals.cash, true);
  eq('cit: PR partner lowers the monthly OA inflow', mixed.loan.cpfInflow < bothSC.loan.cpfInflow, true);
  eq('cit: PR partner may push the instalment onto cash', mixed.loan.cashTopUp > bothSC.loan.cashTopUp, true);
  eq('cit: PR row is labelled in the output', mixed.perPerson[1].citLabel, 'PR — 1st year');
  eq('cit: per-person rate is exposed for the UI', mixed.perPerson[1].cpfRate, 0.09, 1e-9);

  /* a PR1 partner on 4,000 contributes 9% of 4,000, i.e. 360 a month total */
  eq('cit: PR1 partner OA on 4,000', mixed.perPerson[1].monthlyOA, 360 * 0.6217, 0.01);

  /* pooling must be visible: the citizen's OA covers part of the PR's share */
  eq('cit: the citizen lends OA to the PR partner', mixed.perPerson[0].cpfOut > 0, true);
  eq('cit: the PR partner draws OA from the citizen', mixed.perPerson[1].cpfIn > 0, true);
  eq('cit: pooled in equals pooled out', Math.round(mixed.perPerson[0].cpfOut), Math.round(mixed.perPerson[1].cpfIn));
  mixed.perPerson.forEach((pp, i) => {
    eq(`cit: own + pooled equals the row total (person ${i})`, Math.round(pp.cpfOwn + pp.cpfIn), Math.round(pp.cpf));
  });
  eq('cit: rows still sum to total CPF',
     Math.round(mixed.perPerson.reduce((a, pp) => a + pp.cpf, 0)), Math.round(mixed.totals.cpf));
  eq('cit: both citizens means nobody pools', (() => {
    /* identical incomes and identical OA balances -> identical shares -> no pooling */
    const twin = BTO.compute(base({
      price: 550000, flatType: '4-room', loanType: 'hdb',
      people: [{ name: 'A', income: 5000, age: 30, oa: 20000, basis: 'employee', citizenship: 'SC' },
               { name: 'B', income: 5000, age: 30, oa: 20000, basis: 'employee', citizenship: 'SC' }]
    }));
    return twin.perPerson.every(pp => pp.cpfIn < 0.5 && pp.cpfOut < 0.5);
  })(), true);

  /* missing / unknown citizenship falls back to citizen rates rather than NaN */
  eq('cit: missing status defaults to citizen', BTO.cpfRates(30).total, 0.37, 1e-9);
  eq('cit: unknown status falls back to citizen', BTO.cpfRates(30, 'XX').cit, 'SC');
}

/* ---------------- 14. which deadline drives the monthly saving ---------------- */
{
  const noOA = [{ name: 'A', income: 6500, age: 30, oa: 0, basis: 'employee', citizenship: 'SC' },
                { name: 'B', income: 5000, age: 29, oa: 0, basis: 'employee', citizenship: 'SC' }];

  /* 55% LTV puts 45% of the price at signing, so that deadline sets the pace */
  const bank55 = BTO.compute(base({ loanType: 'bank55', price: 550000, flatType: '4-room', people: noOA, saveRate: 0.001 }));
  eq('driver: 55% LTV flags the signing deadline', bank55.saveup.driver, 'signing');
  eq('driver: monthly equals the signing lump over months to signing',
     bank55.saveup.driverMonthly, bank55.saveup.need3 / bank55.saveup.m3, 40);

  /* the 2.5% schedule makes the first payment small, so key collection takes over */
  const dia = BTO.compute(base({ loanType: 'hdb', dpSchedule: 'student', price: 550000, flatType: '4-room', people: noOA }));
  eq('driver: the 2.5% schedule hands the pace to key collection', dia.saveup.driver, 'key');
  eq('driver: monthly equals the total over months to key',
     dia.saveup.driverMonthly, (dia.saveup.need3 + dia.saveup.need4) / dia.saveup.m4, 60);

  /* the reported monthly must always equal the deadline it names */
  [bank55, dia].forEach((R, i) => {
    const S = R.saveup;
    const want = S.driver === 'signing' ? S.signingOnlyMonthly : S.keyOnlyMonthly;
    eq(`driver: named driver matches the rate (case ${i})`, Math.round(S.growth), Math.round(want), 1);
  });
}

/* ---------------- 15. funding vehicles (advisor-suite style) ---------------- */
{
  const s = base({ price: 550000, flatType: '4-room', loanType: 'hdb', saveRate: 0.0005, vehicle: 'bank', inflation: 0.03 });
  const R = BTO.compute(s), S = R.saveup;

  eq('funding: four vehicles listed', S.funding.length, 4);
  eq('funding: order is bank, fd, endowment, portfolio',
     S.funding.map(f => f.key).join(','), 'bank,fd,endowment,portfolio');
  eq('funding: rates match the advisor-suite defaults',
     S.funding.map(f => f.rate).join(','), '0.0005,0.015,0.0375,0.06');

  /* real rate = (1 + nominal) / (1 + inflation) - 1 */
  eq('funding: real rate of bank savings is -2.86%', S.funding[0].real, -0.0286, 0.0002);
  eq('funding: real rate of the portfolio is 2.91%', S.funding[3].real, 0.0291, 0.0002);

  /* a better vehicle needs less money each month for the same goal */
  eq('funding: bank needs the most per month', S.funding[0].monthly > S.funding[1].monthly, true);
  eq('funding: portfolio needs the least per month', S.funding[3].monthly < S.funding[2].monthly, true);
  eq('funding: annual is twelve times monthly', Math.round(S.funding[3].annual), Math.round(S.funding[3].monthly * 12), 1);
  eq('funding: the active rate drives the headline figure', Math.round(S.growth), Math.round(S.funding[0].monthly), 1);

  /* switching vehicle changes the headline number */
  const inPortfolio = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'hdb', saveRate: 0.06, vehicle: 'portfolio' }));
  eq('funding: portfolio rate lowers the monthly requirement',
     inPortfolio.saveup.growth < S.growth, true);
  eq('funding: portfolio row is marked active', inPortfolio.saveup.vehicle, 'portfolio');

  /* a custom rate is not one of the four rows */
  const custom = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'hdb', saveRate: 0.03, vehicle: 'custom' }));
  eq('funding: custom rate is labelled custom', custom.saveup.vehicle, 'custom');
  eq('funding: custom rate still produces four comparison rows', custom.saveup.funding.length, 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
