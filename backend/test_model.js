const ReservoirModel = require('./models/reservoirModel');

console.log('=== 煤层气数学模型测试 (修复版) ===\n');

const params = {
  drainage_rate: 5.0,
  permeability: 1.0,
  initial_pressure: 10.0,
  reservoir_thickness: 10.0,
  well_radius: 0.1,
  drainage_radius: 500.0,
  porosity: 0.05,
  water_saturation: 0.95,
  gas_content: 15.0,
  langmuir_pressure: 3.0,
  langmuir_volume: 20.0,
  matrix_shrinkage_coeff: 0.015,
  well_depth: 500.0,
  tubing_inner_diameter: 0.062,
  surface_pressure: 0.101325
};

const model = new ReservoirModel(params);

console.log('1. 临界解吸压力计算:');
const P_cd = model.calculateCriticalDesorptionPressure();
console.log(`   P_cd = ${P_cd.toFixed(4)} MPa`);
console.log(`   说明: 当井底压力低于此值时，煤层气开始解吸\n`);

console.log('2. Langmuir等温吸附测试:');
for (let p = 0; p <= 10; p += 2) {
  const V = model.calculateLangmuirIsotherm(p);
  console.log(`   P = ${p} MPa, 吸附量 = ${V.toFixed(4)} m³/t`);
}
console.log('');

console.log('3. 相对渗透率测试 (气相饱和度 0% - 100%):');
for (let s = 0; s <= 1; s += 0.2) {
  const k = model.calculateRelativePermeability(s);
  console.log(`   S_g = ${(s * 100).toFixed(0)}%, k_rg = ${k.k_rg.toFixed(6)}, k_rw = ${k.k_rw.toFixed(6)}`);
}
console.log('');

console.log('4. 基质收缩效应测试 (使用平均储层压力):');
for (let p = 10; p >= 0; p -= 2) {
  const effect = model.calculateMatrixShrinkageEffect(p);
  const k_mod = model.calculateEffectivePermeability(p);
  console.log(`   P_avg = ${p} MPa, 渗透率乘数 = ${effect.permeabilityMultiplier.toFixed(6)}, 修正渗透率 = ${k_mod.toFixed(6)} mD`);
}
console.log('');

console.log('5. 井筒压降测试 (不同排水速率):');
for (let q_w = 1; q_w <= 20; q_w += 3) {
  const drop = model.calculateWellborePressureDrop(q_w, 0, params.initial_pressure);
  console.log(`   Q_w = ${q_w.toFixed(1)} m³/d, 摩擦压降 = ${drop.friction_drop.toFixed(6)} MPa, ` +
              `重力压降 = ${drop.gravity_drop.toFixed(4)} MPa, 总压降 = ${drop.total_drop.toFixed(4)} MPa`);
}
console.log('');

console.log('6. 模拟时间步进测试 (共50天):');
const dt = 86400;
for (let day = 1; day <= 50; day++) {
  const result = model.step(dt);
  console.log(`   第 ${day} 天: P_bottom = ${result.bottomhole_pressure.toFixed(3)} MPa, ` +
              `P_avg = ${result.average_reservoir_pressure.toFixed(3)} MPa, ` +
              `Q_g = ${result.gas_production_rate.toFixed(1)} m³/d, ` +
              `Q_w = ${result.water_production_rate.toFixed(1)} m³/d, ` +
              `GWR = ${result.gas_water_ratio.toFixed(4)}, ` +
              `K_eff = ${result.effective_permeability.toFixed(4)} mD, ` +
              `Shrink = ${result.matrix_shrinkage_multiplier.toFixed(4)}, ` +
              `WellDrop = ${result.wellbore_pressure_loss.toFixed(4)} MPa`);
  
  if (result.bottomhole_pressure < result.critical_desorption_pressure) {
    console.log(`      >>> 已达到临界解吸压力，气体开始产出！`);
  }
}
console.log('');

console.log('7. 压力分布数据 (部分):');
const pressureProfile = model.pressureProfile;
for (let i = 0; i < pressureProfile.length; i += 10) {
  const point = pressureProfile[i];
  console.log(`   r = ${point.r.toFixed(1)} m, P = ${point.pressure.toFixed(4)} MPa`);
}
console.log('');

console.log('8. 饱和度分布数据 (部分):');
const saturationProfile = model.saturationProfile;
for (let i = 0; i < saturationProfile.length; i += 10) {
  const point = saturationProfile[i];
  console.log(`   r = ${point.r.toFixed(1)} m, S_g = ${(point.gas_saturation * 100).toFixed(2)}%, S_w = ${(point.water_saturation * 100).toFixed(2)}%`);
}
console.log('');

console.log('9. 累计产量数据:');
console.log(`   累计产气 = ${model.cumulativeGasProduction.toFixed(2)} m³`);
console.log(`   累计产水 = ${model.cumulativeWaterProduction.toFixed(2)} m³`);
console.log(`   气水比 = ${(model.cumulativeGasProduction / Math.max(1, model.cumulativeWaterProduction)).toFixed(4)}`);
console.log('');

console.log('=== 测试完成 ===');
console.log('\n修复内容总结:');
console.log('- Bug1: 使用平均储层压力计算基质收缩效应，渗透率随解吸动态增加');
console.log('- Bug2: 添加井筒流动模型，计算摩擦压降和重力压降');
console.log('- Bug3: 快照数据包含气水比、累计产量、有效渗透率等排采分析数据');
