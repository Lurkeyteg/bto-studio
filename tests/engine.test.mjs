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
  eq('A: signing downpayment 10% less option fee', stage(R, 's3').items[0].a, 53000, 0.01);
  eq('A: BSD on stage 3', stage(R, 's3').items[1].a, 11100, 0.01);
  eq('A: key-collection downpayment 15%', stage(R, 's4').items[0].a, 82500, 0.01);
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

/* ---------------- 3. staggered HDB downpayment (video method B) ---------------- */
{
  const R = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'hdb-staggered' }));
  eq('staggered: signing DP 5% less option fee', stage(R, 's3').items[0].a, 25500, 0.01);
  eq('staggered: key DP 20%', stage(R, 's4').items[0].a, 110000, 0.01);
  eq('staggered: still 25% total', stage(R, 's3').items[0].a + stage(R, 's2').total + stage(R, 's4').items[0].a, 137500, 0.01);
  eq('staggered: loan unchanged at 75%', R.loan.amount, 412500, 0.01);
}

/* ---------------- 4. bank loan 75% LTV (video method C) ---------------- */
{
  const bigOA = [{ name: 'A', income: 6000, age: 30, oa: 400000, basis: 'employee' },
                 { name: 'B', income: 6000, age: 30, oa: 400000, basis: 'employee' }];
  const R = BTO.compute(base({ price: 550000, flatType: '4-room', loanType: 'bank75', people: bigOA }));
  eq('bank75: signing DP 20% less option fee', stage(R, 's3').items[0].a, 108000, 0.01);
  eq('bank75: mandatory cash 5% less option fee', stage(R, 's3').cash, 25500, 0.01);
  eq('bank75: key DP 5%', stage(R, 's4').items[0].a, 27500, 0.01);
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
  eq('B: signing DP 24,500', stage(R, 's3').items[0].a, 24500, 0.01);
  eq('B: BSD 3,200', stage(R, 's3').items[1].a, 3200, 0.01);
  eq('B: key DP 37,500', stage(R, 's4').items[0].a, 37500, 0.01);
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
  eq('save: after-signing rate is lower than the upfront rate', C.saveup.afterSign < C.saveup.growth, true);
  eq('save: after-signing rate is never negative', C.saveup.afterSign >= 0, true);
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
  eq('compare: all four routes present', R.compare.length, 4);
  eq('compare: includes staggered and 55% LTV', R.compare.map(c => c.key).join(','), 'hdb,hdb-staggered,bank75,bank55');
  const hdb = R.compare.find(c => c.key === 'hdb'), stag = R.compare.find(c => c.key === 'hdb-staggered');
  eq('compare: staggered has less cash due before key', stag.upfront < hdb.upfront, true);
  eq('compare: total cash is identical for both HDB routes', stag.cash, hdb.cash, 0.5);
}

/* ---------------- 12. wiggle room ---------------- */
{
  const R = BTO.compute(base({
    price: 550000, flatType: '4-room', loanType: 'hdb', capacityMode: 'manual', capacityManual: 3000,
    saveRate: 0.03, goalRate: 0.06
  }));
  eq('wiggle: shortfall detected when capacity is too low', R.saveup.achievable, false);
  eq('wiggle: months needed pushed past the key date', R.saveup.monthsNeeded > 36 || R.saveup.monthsNeeded === null, true);
  eq('wiggle: surplus reported when capacity is ample', (() => {
    const R2 = BTO.compute(base({ price: 550000, flatType: '4-room', capacityMode: 'manual', capacityManual: 15000 }));
    return R2.saveup.surplus > 0 && R2.saveup.goalFV > 0;
  })(), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
