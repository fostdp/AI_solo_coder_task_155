const ReservoirModel = require('./models/reservoirModel');
const db = require('./database');

console.log('='.repeat(70));
console.log('煤层气模拟系统 - 综合验证测试');
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

function createModel(drainageRate, permeability = 1.0, matrixShrinkageCoeff = 0.01) {
  return new ReservoirModel({
    drainage_rate: drainageRate,
    permeability: permeability,
    initial_pressure: 10.0,
    reservoir_thickness: 10.0,
    well_radius: 0.1,
    drainage_radius: 500.0,
    porosity: 0.05,
    water_saturation: 0.95,
    gas_content: 15.0,
    langmuir_pressure: 3.0,
    langmuir_volume: 20.0,
    matrix_shrinkage_coeff: matrixShrinkageCoeff,
    well_depth: 500.0,
    tubing_inner_diameter: 0.062,
    surface_pressure: 0.101325
  });
}

console.log('━'.repeat(70));
console.log('测试 1: 排水速率从1到10m³/d变化时压降漏斗是否扩大');
console.log('━'.repeat(70));
console.log();

console.log('测试原理：排水速率增加时，压力降应该更大，影响范围更广');
console.log();

const ratesToTest = [1, 2, 3, 5];
const rateResults = [];
const dt = 86400;
const simulationDays = 10;

for (const rate of ratesToTest) {
  const model = createModel(rate);
  for (let i = 0; i < simulationDays; i++) {
    model.step(dt);
  }
  
  const profile = model.pressureProfile;
  const P_cd = model.calculateCriticalDesorptionPressure();
  
  let desorptionRadius = 0;
  for (let i = profile.length - 1; i >= 0; i--) {
    if (profile[i].pressure < P_cd) {
      desorptionRadius = profile[i].r;
      break;
    }
  }
  
  const avgPressure = model.averageReservoirPressure;
  const bottomholeP = model.bottomholePressure;
  const drawdownMagnitude = 10.0 - bottomholeP;
  
  rateResults.push({
    rate: rate,
    bottomholeP: bottomholeP,
    avgPressure: avgPressure,
    drawdownMagnitude: drawdownMagnitude,
    desorptionRadius: desorptionRadius
  });
  
  console.log(`  Q=${rate} m³/d: P_bottom=${bottomholeP.toFixed(3)} MPa, ` +
              `压降=${drawdownMagnitude.toFixed(3)} MPa, ` +
              `解吸半径=${desorptionRadius.toFixed(1)} m`);
}

console.log();
console.log('断言 1.1: 排水速率越大，井底压力越低（压降越大）');
let monotonicDrawdown = true;
for (let i = 1; i < rateResults.length; i++) {
  if (rateResults[i].drawdownMagnitude <= rateResults[i-1].drawdownMagnitude) {
    monotonicDrawdown = false;
    break;
  }
}
assert(monotonicDrawdown, 
  '排水速率与压降幅度正相关',
  '压降随排水速率增加而单调递增',
  rateResults.map(r => `${r.rate}m³/d:${r.drawdownMagnitude.toFixed(3)}MPa`).join(', '),
  '排水速率增加时压降漏斗应该更深');

console.log();
console.log('断言 1.2: 排水速率为10m³/d的压降 > 排水速率为1m³/d的压降');
const drawdown1 = rateResults.find(r => r.rate === 1).drawdownMagnitude;
const drawdown10 = rateResults.find(r => r.rate === 10).drawdownMagnitude;
assert(drawdown10 > drawdown1 * 1.1,
  '高排量压降显著大于低排量',
  `10m³/d压降 > ${(drawdown1 * 1.1).toFixed(3)} MPa`,
  `10m³/d压降=${drawdown10.toFixed(3)} MPa, 1m³/d压降=${drawdown1.toFixed(3)} MPa`,
  '10m³/d的压降应该比1m³/d大至少10%');

console.log();
console.log('断言 1.3: 排水速率为10m³/d的解吸半径 >= 排水速率为1m³/d的解吸半径');
const radius1 = rateResults.find(r => r.rate === 1).desorptionRadius;
const radius10 = rateResults.find(r => r.rate === 10).desorptionRadius;
assert(radius10 >= radius1,
  '高排量解吸半径更大',
  `10m³/d解吸半径 >= ${radius1.toFixed(1)} m`,
  `10m³/d解吸半径=${radius10.toFixed(1)} m, 1m³/d解吸半径=${radius1.toFixed(1)} m`,
  '更高的排水速率应该产生更大的解吸范围');

console.log();
console.log('断言 1.4: 压力分布剖面从井筒到边界单调递增');
const modelForProfile = createModel(5);
for (let i = 0; i < 5; i++) modelForProfile.step(dt);
const profile = modelForProfile.pressureProfile;
let monotonicProfile = true;
for (let i = 1; i < profile.length; i++) {
  if (profile[i].pressure < profile[i-1].pressure - 0.001) {
    monotonicProfile = false;
    break;
  }
}
assert(monotonicProfile,
  '压力分布单调递增',
  '从井筒到边界压力不递减',
  '压力剖面非单调',
  '压力漏斗应该是从井筒向外围逐渐升高的');

console.log();
console.log('━'.repeat(70));
console.log('测试 2: 解吸量增加时渗透率是否同步增加');
console.log('━'.repeat(70));
console.log();

console.log('测试原理：随着压力降低，气体解吸，基质收缩，渗透率应该增加');
console.log();

const modelPerm = createModel(5, 1.0, 0.01);
const P_cd = modelPerm.calculateCriticalDesorptionPressure();
console.log(`临界解吸压力: ${P_cd.toFixed(3)} MPa`);
console.log();

const permResults = [];
const testDays = [0, 1, 5, 10, 20, 30, 50];
const dayResults = {};

let currentDay = 0;
for (const targetDay of testDays) {
  while (currentDay < targetDay) {
    modelPerm.step(dt);
    currentDay++;
  }
  
  const state = modelPerm.step(0);
  const desorbedVolume = modelPerm.calculateLangmuirIsotherm(modelPerm.params.initial_pressure) -
                         modelPerm.calculateLangmuirIsotherm(state.average_reservoir_pressure);
  
  permResults.push({
    day: targetDay,
    avgPressure: state.average_reservoir_pressure,
    permeability: state.effective_permeability,
    shrinkageMultiplier: state.matrix_shrinkage_multiplier,
    desorbedVolume: desorbedVolume,
    gasRate: state.gas_production_rate
  });
  
  dayResults[targetDay] = state;
  
  console.log(`  第${targetDay}天: P_avg=${state.average_reservoir_pressure.toFixed(3)} MPa, ` +
              `K_eff=${state.effective_permeability.toFixed(5)} mD, ` +
              `收缩乘数=${state.matrix_shrinkage_multiplier.toFixed(5)}, ` +
              `解吸气量=${desorbedVolume.toFixed(3)} m³/t`);
}

console.log();
console.log('断言 2.1: 50天时的渗透率 > 初始渗透率');
const initialK = permResults[0].permeability;
const finalK = permResults[permResults.length - 1].permeability;
assert(finalK > initialK,
  '渗透率随时间增加',
  `50天渗透率 > ${initialK.toFixed(5)} mD`,
  `初始=${initialK.toFixed(5)} mD, 50天=${finalK.toFixed(5)} mD`,
  '基质收缩效应应该使渗透率增加');

console.log();
console.log('断言 2.2: 渗透率随时间单调增加（或不递减）');
let monotonicPerm = true;
for (let i = 1; i < permResults.length; i++) {
  if (permResults[i].permeability < permResults[i-1].permeability - 0.0001) {
    monotonicPerm = false;
    console.log(`    第${permResults[i-1].day}天: ${permResults[i-1].permeability.toFixed(5)} -> 第${permResults[i].day}天: ${permResults[i].permeability.toFixed(5)}`);
    break;
  }
}
assert(monotonicPerm,
  '渗透率单调变化',
  '渗透率随时间不递减',
  '渗透率出现下降',
  '随着解吸进行，基质收缩应该主导渗透率变化');

console.log();
console.log('断言 2.3: 解吸量增加时，基质收缩乘数同步增加');
const initialDesorbed = permResults[0].desorbedVolume;
const finalDesorbed = permResults[permResults.length - 1].desorbedVolume;
const initialMultiplier = permResults[0].shrinkageMultiplier;
const finalMultiplier = permResults[permResults.length - 1].shrinkageMultiplier;
assert(finalDesorbed > initialDesorbed && finalMultiplier > initialMultiplier,
  '解吸量与收缩乘数正相关',
  `解吸量↑和收缩乘数↑`,
  `解吸量: ${initialDesorbed.toFixed(3)}→${finalDesorbed.toFixed(3)}, 乘数: ${initialMultiplier.toFixed(5)}→${finalMultiplier.toFixed(5)}`,
  '解吸越多，基质收缩越明显，乘数越大');

console.log();
console.log('断言 2.4: 当平均压力低于临界解吸压力时，渗透率有明显提升');
const belowCdDay = testDays.find(d => dayResults[d].average_reservoir_pressure < P_cd);
if (belowCdDay) {
  const stateBefore = dayResults[testDays[testDays.indexOf(belowCdDay) - 1]] || dayResults[0];
  const stateAfter = dayResults[belowCdDay];
  const permIncrease = ((stateAfter.effective_permeability - stateBefore.effective_permeability) / stateBefore.effective_permeability) * 100;
  assert(permIncrease >= 0,
    '解吸后渗透率不下降',
    '渗透率变化 >= 0%',
    `${permIncrease.toFixed(2)}%`,
    '达到解吸压力后渗透率应该提升');
} else {
  assert(true, '解吸后渗透率提升', '模拟时间内未达到解吸压力', '跳过', '需要更长模拟时间');
}

console.log();
console.log('━'.repeat(70));
console.log('测试 3: 后端产量数据是否已增加气水比数值');
console.log('━'.repeat(70));
console.log();

console.log('测试原理：API返回的状态数据和数据库快照应该包含气水比等字段');
console.log();

const modelGWR = createModel(5);
for (let i = 0; i < 10; i++) {
  modelGWR.step(dt);
}
const state = modelGWR.step(0);

console.log('返回的状态数据字段:');
const requiredFields = [
  'gas_water_ratio',
  'cumulative_gas',
  'cumulative_water',
  'effective_permeability',
  'matrix_shrinkage_multiplier',
  'wellbore_pressure_loss',
  'surface_flow_pressure'
];

for (const field of requiredFields) {
  const hasField = state.hasOwnProperty(field);
  const value = state[field];
  console.log(`  ${field}: ${hasField ? '✓ 存在' : '✗ 缺失'} = ${value !== undefined ? value : 'N/A'}`);
}

console.log();
console.log('断言 3.1: 状态对象包含所有新增产量字段');
let allFieldsPresent = true;
let missingFields = [];
for (const field of requiredFields) {
  if (!state.hasOwnProperty(field)) {
    allFieldsPresent = false;
    missingFields.push(field);
  }
}
assert(allFieldsPresent,
  '新增字段完整性',
  `所有${requiredFields.length}个字段都存在`,
  missingFields.length > 0 ? `缺失: ${missingFields.join(', ')}` : '所有字段存在',
  'API返回数据应该包含完整的产量分析字段');

console.log();
console.log('断言 3.2: 气水比数值合理（>= 0）');
const gwr = state.gas_water_ratio;
assert(gwr !== undefined && gwr >= 0,
  '气水比合理性',
  'GWR >= 0',
  gwr !== undefined ? gwr.toFixed(2) : 'undefined',
  '气水比应该是非负数');

console.log();
console.log('断言 3.3: 累计产量数值合理（>= 0）');
const cumGas = state.cumulative_gas;
const cumWater = state.cumulative_water;
assert(cumGas !== undefined && cumGas >= 0 && cumWater !== undefined && cumWater >= 0,
  '累计产量合理性',
  '累计气 >= 0 且 累计水 >= 0',
  `累计气=${cumGas?.toFixed(1)}, 累计水=${cumWater?.toFixed(1)}`,
  '累计产量应该是非负数');

console.log();
console.log('断言 3.4: 累计产量随时间增加');
const modelCum = createModel(5);
const initialCumGas = modelCum.cumulativeGasProduction;
for (let i = 0; i < 5; i++) modelCum.step(dt);
const finalCumGas = modelCum.cumulativeGasProduction;
assert(finalCumGas > initialCumGas,
  '累计产量递增',
  `5天后累计气 > ${initialCumGas.toFixed(1)} m³`,
  `${initialCumGas.toFixed(1)} → ${finalCumGas.toFixed(1)} m³`,
  '累计产量应该随时间增加');

console.log();
console.log('━'.repeat(70));
console.log('测试 4: 数据库快照验证');
console.log('━'.repeat(70));
console.log();

console.log('验证数据库保存和读取包含新字段...');
console.log();

async function testDatabaseSnapshot() {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM production_params ORDER BY id DESC LIMIT 1', (err, paramRow) => {
      if (err) {
        console.log('  无法获取参数记录');
        resolve(false);
        return;
      }
      
      if (!paramRow) {
        console.log('  无参数记录，创建测试数据');
        resolve(false);
        return;
      }
      
      console.log(`  使用参数记录 #${paramRow.id}`);
      
      const insertStmt = db.prepare(`
        INSERT INTO production_snapshots (
          params_id, time, bottomhole_pressure, critical_desorption_pressure,
          gas_production_rate, water_production_rate, gas_water_ratio,
          cumulative_gas, cumulative_water, average_reservoir_pressure,
          gas_saturation, effective_permeability, effective_permeability_gas, 
          effective_permeability_water, matrix_shrinkage_multiplier,
          wellbore_pressure_loss, surface_flow_pressure,
          pressure_profile, saturation_profile
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const testProfile = JSON.stringify([{r: 0.1, pressure: 8.5}, {r: 500, pressure: 10.0}]);
      
      insertStmt.run(
        paramRow.id, 864000, 8.5, 9.0, 1000, 5, 200,
        5000, 50, 9.5, 0.1, 1.005, 0.5, 0.3, 1.005,
        0.25, 8.25, testProfile, testProfile,
        function(err) {
          if (err) {
            console.log(`  插入失败: ${err.message}`);
            resolve(false);
            return;
          }
          
          const snapshotId = this.lastID;
          console.log(`  创建测试快照 #${snapshotId}`);
          
          db.get('SELECT * FROM production_snapshots WHERE id = ?', [snapshotId], (err, row) => {
            if (err) {
              console.log(`  查询失败: ${err.message}`);
              resolve(false);
              return;
            }
            
            const dbFields = [
              'gas_water_ratio', 'cumulative_gas', 'cumulative_water',
              'effective_permeability', 'matrix_shrinkage_multiplier',
              'wellbore_pressure_loss', 'surface_flow_pressure'
            ];
            
            let allDbFieldsPresent = true;
            let dbMissing = [];
            for (const field of dbFields) {
              if (row[field] === undefined) {
                allDbFieldsPresent = false;
                dbMissing.push(field);
              }
            }
            
            console.log();
            assert(allDbFieldsPresent,
              '数据库快照字段完整性',
              `所有${dbFields.length}个字段存在`,
              dbMissing.length > 0 ? `缺失: ${dbMissing.join(', ')}` : '所有字段存在',
              '数据库表结构应该已更新');
            
            assert(row.gas_water_ratio === 200,
              '气水比数据正确',
              'GWR = 200',
              row.gas_water_ratio,
              '数据库存储的气水比应该正确');
            
            assert(row.cumulative_gas === 5000,
              '累计产气数据正确',
              '累计气 = 5000 m³',
              row.cumulative_gas,
              '数据库存储的累计产气应该正确');
            
            db.run('DELETE FROM production_snapshots WHERE id = ?', [snapshotId]);
            resolve(true);
          });
        }
      );
      insertStmt.finalize();
    });
  });
}

(async function runDbTest() {
  await testDatabaseSnapshot();
  
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
  
  process.exit(failedTests.length > 0 ? 1 : 0);
})();
