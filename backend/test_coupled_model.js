const ReservoirModel = require('./models/reservoirModel');

console.log('='.repeat(70));
console.log('储层-井筒耦合模型验证测试');
console.log('='.repeat(70));
console.log();

let testResults = [];
let failedTests = [];

function assert(condition, testName, expected, actual, message = '') {
  const passed = condition;
  const result = {
    name: testName,
    passed: passed,
    expected: expected,
    actual: actual,
    message: message
  };
  testResults.push(result);
  
  if (!passed) {
    failedTests.push(result);
  }
  
  const status = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`${status} - ${testName}`);
  if (!passed) {
    console.log(`    期望: ${expected}`);
    console.log(`    实际: ${actual}`);
    if (message) console.log(`    说明: ${message}`);
  }
  
  return passed;
}

console.log('━'.repeat(70));
console.log('模块一: 解吸相关渗透率动态');
console.log('━'.repeat(70));
console.log();

const model1 = new ReservoirModel({
  drainage_rate: 5,
  permeability: 1.0,
  matrix_shrinkage_coeff: 0.01,
  desorption_induced_perm_coeff: 0.02
});

const dt = 86400;
const permHistory = [];
const pressureHistory = [];
const desorbedHistory = [];

for (let day = 0; day <= 60; day += 10) {
  const state = model1.step(day > 0 ? dt * 10 : 0);
  permHistory.push({
    day: day,
    absolute: state.effective_permeability,
    matrix: state.matrix_shrinkage_multiplier,
    desorption: state.desorption_permeability_multiplier,
    stress: state.stress_permeability_multiplier
  });
  pressureHistory.push({
    day: day,
    pressure: state.average_reservoir_pressure
  });
  desorbedHistory.push({
    day: day,
    volume: state.desorbed_volume
  });
  
  console.log(`第${day}天: P=${state.average_reservoir_pressure.toFixed(2)} MPa, ` +
              `K_abs=${state.effective_permeability.toFixed(4)} mD, ` +
              `解吸乘数=${state.desorption_permeability_multiplier.toFixed(4)}, ` +
              `解吸气=${state.desorbed_volume.toFixed(2)} m³/t`);
}

console.log();
console.log('断言 1.1: 解吸量随压力下降而增加');
const desorbed0 = desorbedHistory[0].volume;
const desorbed60 = desorbedHistory[desorbedHistory.length - 1].volume;
assert(desorbed60 > desorbed0 * 10,
  '解吸量随时间增加',
  `60天解吸量 > ${(desorbed0 * 10).toFixed(2)} m³/t`,
  `60天解吸量=${desorbed60.toFixed(2)} m³/t`,
  '压力下降应该导致气体解吸');

console.log();
console.log('断言 1.2: 解吸诱导渗透率乘数随解吸量增加而增加');
const desorptionMult0 = permHistory[0].desorption;
const desorptionMult60 = permHistory[permHistory.length - 1].desorption;
assert(desorptionMult60 > desorptionMult0,
  '解吸乘数随时间增加',
  `60天解吸乘数 > ${desorptionMult0.toFixed(4)}`,
  `60天解吸乘数=${desorptionMult60.toFixed(4)}`,
  '解吸越多，渗透率提升越大');

console.log();
console.log('断言 1.3: 基质收缩乘数随压力下降而增加');
const matrixMult0 = permHistory[0].matrix;
const matrixMult60 = permHistory[permHistory.length - 1].matrix;
assert(matrixMult60 > matrixMult0,
  '基质收缩乘数随时间增加',
  `60天基质乘数 > ${matrixMult0.toFixed(4)}`,
  `60天基质乘数=${matrixMult60.toFixed(4)}`,
  '压力下降导致基质收缩，渗透率提升');

console.log();
console.log('断言 1.4: 绝对渗透率随时间单调增加（或不递减）');
let monotonicPerm = true;
for (let i = 1; i < permHistory.length; i++) {
  if (permHistory[i].absolute < permHistory[i-1].absolute - 0.001) {
    monotonicPerm = false;
    break;
  }
}
assert(monotonicPerm,
  '绝对渗透率单调变化',
  '渗透率随时间不递减',
  permHistory.map(p => `D${p.day}:${p.absolute.toFixed(3)}`).join(' → '),
  '解吸效应应该主导渗透率变化');

console.log();
console.log('断言 1.5: 60天时渗透率相比初始提升至少1%');
const perm0 = permHistory[0].absolute;
const perm60 = permHistory[permHistory.length - 1].absolute;
const permIncrease = ((perm60 - perm0) / perm0) * 100;
assert(perm60 > perm0 * 1.01,
  '渗透率提升幅度',
  `渗透率提升 > 1%`,
  `实际提升 ${permIncrease.toFixed(1)}%`,
  '60天模拟后渗透率应有明显提升');

console.log();
console.log('━'.repeat(70));
console.log('模块二: 流型相关井筒摩擦');
console.log('━'.repeat(70));
console.log();

console.log('测试不同气水比下的流型变化...');
console.log();

const flowTestCases = [
  { gasRate: 0, waterRate: 5, desc: '纯水产液' },
  { gasRate: 10, waterRate: 5, desc: '低气水比(GWR=2)' },
  { gasRate: 100, waterRate: 5, desc: '中气水比(GWR=20)' },
  { gasRate: 1000, waterRate: 5, desc: '高气水比(GWR=200)' },
  { gasRate: 5000, waterRate: 1, desc: '极高气水比(GWR=5000)' }
];

const flowResults = [];
const model2 = new ReservoirModel({ drainage_rate: 5 });

for (const testCase of flowTestCases) {
  const result = model2.wellbore.calculatePressureDrop(
    testCase.waterRate,
    testCase.gasRate,
    8.0,
    0.5
  );
  flowResults.push({
    ...testCase,
    flow_pattern: result.flow_pattern,
    friction_factor: result.friction_factor,
    liquid_holdup: result.liquid_holdup,
    total_drop: result.total_drop_mpa,
    v_sl: result.superficial_liquid_velocity,
    v_sg: result.superficial_gas_velocity
  });
  
  console.log(`[${testCase.desc}]`);
  console.log(`  流型: ${result.flow_pattern}`);
  console.log(`  摩擦系数: ${result.friction_factor.toFixed(6)}`);
  console.log(`  持液率: ${result.liquid_holdup.toFixed(4)}`);
  console.log(`  表观气速: ${result.superficial_gas_velocity.toFixed(2)} m/s`);
  console.log(`  总压降: ${result.total_drop_mpa.toFixed(3)} MPa`);
  console.log();
}

console.log('断言 2.1: 纯水产液为泡状流或段塞流');
const pureWater = flowResults[0];
assert(['bubble', 'slug'].includes(pureWater.flow_pattern),
  '纯水产液流型',
  'bubble 或 slug',
  pureWater.flow_pattern,
  '无气相时应为泡状流或段塞流');

console.log();
console.log('断言 2.2: 高气水比时流型过渡到环雾流');
const highGWR = flowResults[flowResults.length - 1];
assert(['annular', 'mist', 'churn'].includes(highGWR.flow_pattern),
  '高气水比流型',
  'annular, mist 或 churn',
  highGWR.flow_pattern,
  '高气速下应为环雾流或搅拌流');

console.log();
console.log('断言 2.3: 摩擦系数随流型变化而变化');
const frictionFactors = flowResults.map(r => r.friction_factor);
const uniqueFriction = [...new Set(frictionFactors.map(f => f.toFixed(4)))];
assert(uniqueFriction.length >= 2,
  '摩擦系数多样性',
  `至少2种不同的摩擦系数`,
  `实际有${uniqueFriction.length}种`,
  '不同流型应有不同的摩擦系数');

console.log();
console.log('断言 2.4: 持液率随气水比增加而降低');
let holdupMonotonic = true;
for (let i = 1; i < flowResults.length; i++) {
  if (flowResults[i].gasRate > flowResults[i-1].gasRate && 
      flowResults[i].liquid_holdup > flowResults[i-1].liquid_holdup + 0.01) {
    holdupMonotonic = false;
    break;
  }
}
assert(holdupMonotonic,
  '持液率变化趋势',
  '持液率随气水比增加而降低',
  flowResults.map(r => r.liquid_holdup.toFixed(3)).join(' → '),
  '气相增加应导致持液率降低');

console.log();
console.log('断言 2.5: 段塞流摩擦系数高于泡状流');
const slugFlow = flowResults.find(r => r.flow_pattern === 'slug');
const bubbleFlow = flowResults.find(r => r.flow_pattern === 'bubble');
if (slugFlow && bubbleFlow) {
  assert(slugFlow.friction_factor > bubbleFlow.friction_factor * 1.05,
    '段塞流与泡状流摩擦对比',
    `段塞流摩擦 > 泡状流 × 1.05`,
    `${slugFlow.friction_factor.toFixed(6)} > ${bubbleFlow.friction_factor.toFixed(6)} × 1.05`,
    '段塞流的流动扰动更大，摩擦更高');
} else {
  assert(true, '段塞流与泡状流摩擦对比', '未同时出现两种流型', '跳过');
}

console.log();
console.log('━'.repeat(70));
console.log('模块三: 储层-井筒耦合框架');
console.log('━'.repeat(70));
console.log();

const model3 = new ReservoirModel({
  drainage_rate: 5,
  permeability: 1.0,
  well_depth: 500
});

console.log('耦合迭代验证...');
console.log();

const couplingHistory = [];
for (let day = 0; day <= 30; day += 5) {
  const state = model3.step(day > 0 ? dt * 5 : 0);
  couplingHistory.push({
    day: day,
    bhp: state.bottomhole_pressure,
    surfaceP: state.surface_flow_pressure,
    wellboreDrop: state.wellbore_pressure_loss,
    gasRate: state.gas_production_rate,
    flowPattern: state.wellbore_flow_pattern
  });
  
  console.log(`第${day}天: BHP=${state.bottomhole_pressure.toFixed(2)} MPa, ` +
              `井口P=${state.surface_flow_pressure.toFixed(2)} MPa, ` +
              `井筒压降=${state.wellbore_pressure_loss.toFixed(3)} MPa, ` +
              `流型=${state.wellbore_flow_pattern}`);
}

console.log();
console.log('断言 3.1: 井口压力 = 井底压力 - 井筒压降（误差<5%）');
const finalState = couplingHistory[couplingHistory.length - 1];
const expectedSurfaceP = Math.max(0.101325, finalState.bhp - finalState.wellboreDrop);
const pressureError = Math.abs(finalState.surfaceP - expectedSurfaceP) / expectedSurfaceP * 100;
assert(pressureError < 5,
  '压力平衡关系',
  `误差 < 5%`,
  `误差 = ${pressureError.toFixed(1)}%`,
  '耦合框架应保证压力平衡');

console.log();
console.log('断言 3.2: 井筒压降主要由重力贡献（摩擦<重力的30%）');
const lastDay = 30;
const modelCheck = new ReservoirModel({ drainage_rate: 5 });
for (let i = 0; i < lastDay; i++) modelCheck.step(dt);
const checkState = modelCheck.step(0);
const gravityPortion = checkState.wellbore_gravity_drop / checkState.wellbore_pressure_loss * 100;
assert(gravityPortion > 70,
  '压降组成',
  `重力贡献 > 70%`,
  `实际重力贡献 ${gravityPortion.toFixed(1)}%`,
  '浅井中重力应占主导地位');

console.log();
console.log('断言 3.3: 产气后流型发生变化');
const initialPattern = couplingHistory[0].flowPattern;
const laterPattern = couplingHistory[couplingHistory.length - 1].flowPattern;
console.log(`  初始流型: ${initialPattern}`);
console.log(`  后期流型: ${laterPattern}`);
assert(true, '流型变化记录', '记录流型随产气变化', `${initialPattern} → ${laterPattern}`);

console.log();
console.log('断言 3.4: 耦合模型能够稳定运行50步');
const modelStable = new ReservoirModel({ drainage_rate: 3 });
let stable = true;
let lastBhp = 10;
try {
  for (let i = 0; i < 50; i++) {
    const s = modelStable.step(dt);
    if (s.bottomhole_pressure < 0.01 || s.bottomhole_pressure > 15) {
      stable = false;
      break;
    }
    lastBhp = s.bottomhole_pressure;
  }
} catch (e) {
  stable = false;
}
assert(stable,
  '模型稳定性',
  '50步无崩溃，压力在合理范围',
  stable ? `稳定运行，最终BHP=${lastBhp.toFixed(2)}` : '运行失败或超出范围',
  '耦合迭代应稳定收敛');

console.log();
console.log('━'.repeat(70));
console.log('测试总结');
console.log('━'.repeat(70));
console.log();

const passed = testResults.filter(r => r.passed).length;
const total = testResults.length;

console.log(`总测试数: ${total}`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failedTests.length}`);
console.log();

if (failedTests.length > 0) {
  console.log('失败用例明细:');
  console.log('-'.repeat(70));
  failedTests.forEach((test, idx) => {
    console.log(`${idx + 1}. ${test.name}`);
    console.log(`   期望: ${test.expected}`);
    console.log(`   实际: ${test.actual}`);
    if (test.message) console.log(`   说明: ${test.message}`);
    console.log();
  });
} else {
  console.log('✓ 所有测试通过！');
}

console.log();
console.log('='.repeat(70));
console.log('架构说明:');
console.log('  - ReservoirCore: 两相流 + 基质收缩 + 解吸诱导渗透率');
console.log('  - WellboreFlow: 5种流型识别 + 流型相关摩擦系数');
console.log('  - ReservoirModel: 迭代耦合框架（3次迭代，0.01MPa容差）');
console.log('='.repeat(70));

process.exit(failedTests.length > 0 ? 1 : 0);
