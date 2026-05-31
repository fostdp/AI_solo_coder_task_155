const ReservoirCore = require('./reservoirCore');
const WellboreFlow = require('./wellboreFlow');

class ReservoirModel {
  constructor(params) {
    this.params = {
      drainage_rate: params.drainage_rate || 5.0,
      permeability: params.permeability || 1.0,
      initial_pressure: params.initial_pressure || 10.0,
      reservoir_thickness: params.reservoir_thickness || 10.0,
      well_radius: params.well_radius || 0.1,
      drainage_radius: params.drainage_radius || 500.0,
      porosity: params.porosity || 0.05,
      water_saturation: params.water_saturation || 0.95,
      gas_content: params.gas_content || 15.0,
      langmuir_pressure: params.langmuir_pressure || 3.0,
      langmuir_volume: params.langmuir_volume || 20.0,
      matrix_shrinkage_coeff: params.matrix_shrinkage_coeff || 0.01,
      desorption_induced_perm_coeff: params.desorption_induced_perm_coeff || 0.02,
      fracture_closure_stress: params.fracture_closure_stress || 15.0,
      well_depth: params.well_depth || 500.0,
      tubing_inner_diameter: params.tubing_inner_diameter || 0.062,
      tubing_roughness: params.tubing_roughness || 0.000045,
      surface_pressure: params.surface_pressure || 0.101325
    };

    this.reservoir = new ReservoirCore(this.params);
    this.wellbore = new WellboreFlow(this.params);

    this.time = 0;
    this.bottomholePressure = this.params.initial_pressure;
    this.gasProductionRate = 0;
    this.waterProductionRate = 0;
    this.cumulativeGasProduction = 0;
    this.cumulativeWaterProduction = 0;
    this.averageReservoirPressure = this.params.initial_pressure;
    this.gasSaturation = 1 - this.params.water_saturation;
    this.wellborePressureLoss = 0;
    this.surfaceFlowPressure = this.params.initial_pressure;
    
    this.pressureProfile = [];
    this.saturationProfile = [];

    this.couplingIterations = 3;
    this.couplingTolerance = 0.01;

    this.initializeProfiles();
  }

  initializeProfiles() {
    this.pressureProfile = [];
    this.saturationProfile = [];
    const numPoints = 100;
    for (let i = 0; i < numPoints; i++) {
      const r = this.params.well_radius + 
        (this.params.drainage_radius - this.params.well_radius) * (i / (numPoints - 1));
      this.pressureProfile.push({
        r: r,
        pressure: this.params.initial_pressure
      });
      this.saturationProfile.push({
        r: r,
        gas_saturation: this.gasSaturation,
        water_saturation: this.params.water_saturation
      });
    }
  }

  calculatePressureDistribution(time) {
    const rw = this.params.well_radius;
    const re = this.params.drainage_radius;
    const Pi = this.params.initial_pressure;
    const Q = this.params.drainage_rate;
    const h = this.params.reservoir_thickness;

    const permModel = this.reservoir.calculateDynamicPermeability(
      this.averageReservoirPressure, 
      this.gasSaturation
    );

    const k_eff = permModel.effective_water_permeability;
    const eta = this.reservoir.calculateHydraulicDiffusivity(k_eff);

    const numPoints = 100;
    const profile = [];

    const days = time / 86400;
    const P_cd = this.reservoir.calculateCriticalDesorptionPressure();

    const Q_ref = 5.0;
    const rateRatio = Math.min(Math.max(Q / Q_ref, 0.2), 5.0);
    const maxDailyDrawdown = 0.10 * Pi * rateRatio;
    const maxDrawdownCap = Math.min(Pi * 0.9, 0.6 * Pi * rateRatio + Pi * 0.2);
    let targetDrawdown = Math.min(days * maxDailyDrawdown, maxDrawdownCap);
    targetDrawdown = Math.max(0.01, targetDrawdown);

    for (let i = 0; i < numPoints; i++) {
      const r = rw + (re - rw) * (i / (numPoints - 1));
      let pressure;

      if (time <= 0) {
        pressure = Pi;
      } else {
        const transientP = this.reservoir.calculateTransientPressure(
          r, time, Pi, Q, h, this.reservoir.mu_w, this.reservoir.B_w, eta, rw, re, k_eff
        );

        const r_ratio = (r - rw) / (re - rw);
        const influenceRadius = Math.min(1, Math.sqrt(days / 5) * Math.sqrt(rateRatio));
        let drawdownFactor = Math.max(0, 1 - r_ratio / influenceRadius);
        drawdownFactor = drawdownFactor * drawdownFactor;

        const controlledDrawdown = targetDrawdown * drawdownFactor;
        const controlledP = Pi - controlledDrawdown;

        pressure = Math.min(transientP, controlledP);

        const minPressure = Math.min(P_cd - 1.0, Pi - targetDrawdown * 1.1);
        pressure = Math.max(minPressure, Math.min(Pi, pressure));
      }

      profile.push({
        r: r,
        pressure: Math.max(0.1, pressure)
      });
    }

    this.pressureProfile = profile;
    this.bottomholePressure = profile[0].pressure;
    this.averageReservoirPressure = this.calculateAveragePressure();

    return profile;
  }

  calculateAveragePressure() {
    if (this.pressureProfile.length < 2) return this.params.initial_pressure;

    let integral = 0;
    for (let i = 1; i < this.pressureProfile.length; i++) {
      const p1 = this.pressureProfile[i - 1];
      const p2 = this.pressureProfile[i];
      const dr = p2.r - p1.r;
      const avgP = (p1.pressure + p2.pressure) / 2;
      integral += avgP * (p1.r + p2.r) * dr;
    }

    const re = this.params.drainage_radius;
    const rw = this.params.well_radius;
    const area = Math.PI * (re * re - rw * rw);

    return (Math.PI * integral) / area;
  }

  calculateSaturationDistribution() {
    const P_cd = this.reservoir.calculateCriticalDesorptionPressure();
    const numPoints = this.pressureProfile.length;
    const profile = [];

    for (let i = 0; i < numPoints; i++) {
      const point = this.pressureProfile[i];
      let gasSaturation;
      let waterSaturation;

      if (point.pressure > P_cd) {
        gasSaturation = 0.05;
        waterSaturation = 0.95;
      } else {
        const desorbedGas = this.reservoir.calculateDesorbedVolume(point.pressure);
        const V_max = this.reservoir.calculateLangmuirIsotherm(this.params.initial_pressure);
        
        const pressureFactor = Math.max(0, (P_cd - point.pressure) / P_cd);
        const normalizedDesorption = V_max > 0 ? desorbedGas / V_max : 0;
        
        gasSaturation = 0.05 + 0.6 * pressureFactor * 
          (1 - Math.exp(-normalizedDesorption * 5));
        gasSaturation = Math.min(0.65, gasSaturation);
        waterSaturation = 1 - gasSaturation;
      }

      profile.push({
        r: point.r,
        gas_saturation: gasSaturation,
        water_saturation: waterSaturation
      });
    }

    this.saturationProfile = profile;
    this.gasSaturation = profile[0].gas_saturation;

    return profile;
  }

  calculateProductionRates(timeStep) {
    const rw = this.params.well_radius;
    const h = this.params.reservoir_thickness;
    const P_cd = this.reservoir.calculateCriticalDesorptionPressure();

    const permModel = this.reservoir.calculateDynamicPermeability(
      this.averageReservoirPressure,
      this.gasSaturation
    );

    let dp_dr = 0;
    if (this.pressureProfile.length >= 2) {
      const p0 = this.pressureProfile[0];
      const p1 = this.pressureProfile[1];
      dp_dr = (p1.pressure - p0.pressure) / (p1.r - p0.r);
    }

    this.waterProductionRate = this.params.drainage_rate;

    let gasRate = 0;
    if (this.bottomholePressure < P_cd) {
      const V_desorbed = this.reservoir.calculateDesorbedVolume(this.bottomholePressure);
      
      const k_g_si = permModel.effective_gas_permeability * 9.869233e-16;
      const mobilityGas = k_g_si / this.reservoir.mu_g;
      const pressureGradient = Math.abs(dp_dr) * 1e6;
      
      const darcyRate = mobilityGas * 2 * Math.PI * rw * h * pressureGradient;
      
      const P = (this.bottomholePressure + 0.101325) * 1e6;
      const T = 293.15;
      const gasDensity = (P * this.reservoir.M_g) / (this.reservoir.Z * this.reservoir.R * T);
      const volumetricRate = darcyRate / gasDensity;
      
      const drainageArea = Math.PI * (this.params.drainage_radius * this.params.drainage_radius - rw * rw);
      const reservoirVolume = drainageArea * h * this.params.porosity;
      const desorptionContribution = V_desorbed * reservoirVolume * (1 - Math.exp(-timeStep / 864000));
      
      gasRate = Math.max(0, volumetricRate * 86400 * 0.1 + desorptionContribution * 0.001);
      gasRate = Math.min(50000, gasRate);
    }

    this.gasProductionRate = gasRate;

    this.cumulativeGasProduction += gasRate * (timeStep / 86400);
    this.cumulativeWaterProduction += this.waterProductionRate * (timeStep / 86400);

    return {
      gas_rate: this.gasProductionRate,
      water_rate: this.waterProductionRate,
      gas_water_ratio: this.waterProductionRate > 0 ? gasRate / this.waterProductionRate : 0,
      permeability_model: permModel
    };
  }

  coupleReservoirWellbore(timeStep) {
    let bhpGuess = this.bottomholePressure;
    let surfacePGuess = this.surfaceFlowPressure;
    
    for (let iter = 0; iter < this.couplingIterations; iter++) {
      this.calculatePressureDistribution(this.time);
      this.calculateSaturationDistribution();
      
      const rates = this.calculateProductionRates(timeStep);
      
      const wellboreResult = this.wellbore.calculateIntegratedPressureDrop(
        this.waterProductionRate,
        this.gasProductionRate,
        this.bottomholePressure
      );
      
      this.wellborePressureLoss = wellboreResult.total_drop_mpa;
      this.surfaceFlowPressure = Math.max(
        this.params.surface_pressure,
        this.bottomholePressure - wellboreResult.total_drop_mpa
      );
      
      const newBhp = this.pressureProfile[0].pressure;
      const diff = Math.abs(newBhp - bhpGuess);
      
      bhpGuess = bhpGuess * 0.5 + newBhp * 0.5;
      this.bottomholePressure = bhpGuess;
      
      if (diff < this.couplingTolerance) {
        break;
      }
    }
    
    const finalWellboreResult = this.wellbore.calculateIntegratedPressureDrop(
      this.waterProductionRate,
      this.gasProductionRate,
      this.bottomholePressure
    );
    
    return finalWellboreResult;
  }

  step(timeStep) {
    this.time += timeStep;

    const wellboreResult = this.coupleReservoirWellbore(timeStep);
    
    const P_cd = this.reservoir.calculateCriticalDesorptionPressure();
    const permModel = this.reservoir.calculateDynamicPermeability(
      this.averageReservoirPressure,
      this.gasSaturation
    );
    
    const desorbedVolume = this.reservoir.calculateDesorbedVolume(this.averageReservoirPressure);

    return {
      time: this.time,
      bottomhole_pressure: this.bottomholePressure,
      critical_desorption_pressure: P_cd,
      gas_production_rate: this.gasProductionRate,
      water_production_rate: this.waterProductionRate,
      gas_water_ratio: this.waterProductionRate > 0 ? this.gasProductionRate / this.waterProductionRate : 0,
      cumulative_gas: this.cumulativeGasProduction,
      cumulative_water: this.cumulativeWaterProduction,
      average_reservoir_pressure: this.averageReservoirPressure,
      gas_saturation: this.gasSaturation,
      effective_permeability: permModel.absolute_permeability,
      effective_permeability_gas: permModel.effective_gas_permeability,
      effective_permeability_water: permModel.effective_water_permeability,
      matrix_shrinkage_multiplier: permModel.matrix_multiplier,
      desorption_permeability_multiplier: permModel.desorption_multiplier,
      stress_permeability_multiplier: permModel.stress_multiplier,
      desorbed_volume: desorbedVolume,
      wellbore_pressure_loss: this.wellborePressureLoss,
      surface_flow_pressure: this.surfaceFlowPressure,
      wellbore_flow_pattern: wellboreResult.flow_pattern,
      wellbore_friction_factor: wellboreResult.friction_factor,
      wellbore_liquid_holdup: wellboreResult.liquid_holdup,
      wellbore_mixture_density: wellboreResult.mixture_density,
      wellbore_friction_drop: wellboreResult.friction_drop_mpa,
      wellbore_gravity_drop: wellboreResult.gravity_drop_mpa,
      pressure_profile: this.pressureProfile,
      saturation_profile: this.saturationProfile
    };
  }

  reset() {
    this.time = 0;
    this.bottomholePressure = this.params.initial_pressure;
    this.gasProductionRate = 0;
    this.waterProductionRate = 0;
    this.cumulativeGasProduction = 0;
    this.cumulativeWaterProduction = 0;
    this.averageReservoirPressure = this.params.initial_pressure;
    this.gasSaturation = 1 - this.params.water_saturation;
    this.wellborePressureLoss = 0;
    this.surfaceFlowPressure = this.params.initial_pressure;
    this.initializeProfiles();
  }

  calculateCriticalDesorptionPressure() {
    return this.reservoir.calculateCriticalDesorptionPressure();
  }

  calculateLangmuirIsotherm(pressure) {
    return this.reservoir.calculateLangmuirIsotherm(pressure);
  }
}

module.exports = ReservoirModel;
