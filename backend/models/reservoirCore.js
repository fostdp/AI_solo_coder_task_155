class ReservoirCore {
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
      fracture_closure_stress: params.fracture_closure_stress || 15.0
    };

    this.mu_w = 0.001;
    this.mu_g = 0.000018;
    this.B_w = 1.0;
    this.rho_w = 1000;
    this.rho_g_sc = 0.717;
    this.Z = 0.9;
    this.R = 8.314;
    this.T = 293.15;
    this.M_g = 0.016;
    this.g = 9.81;
  }

  calculateCriticalDesorptionPressure() {
    const V = this.params.gas_content;
    const V_L = this.params.langmuir_volume;
    const P_L = this.params.langmuir_pressure;
    const P_cd = (V * P_L) / (V_L - V);
    return Math.max(0.1, P_cd);
  }

  calculateLangmuirIsotherm(pressure) {
    const V_L = this.params.langmuir_volume;
    const P_L = this.params.langmuir_pressure;
    return (V_L * pressure) / (P_L + pressure);
  }

  calculateDesorbedVolume(pressure) {
    const V_initial = this.calculateLangmuirIsotherm(this.params.initial_pressure);
    const V_current = this.calculateLangmuirIsotherm(pressure);
    return Math.max(0, V_initial - V_current);
  }

  calculateRelativePermeability(gasSaturation) {
    const S_g = Math.max(0, Math.min(1, gasSaturation));
    const S_gc = 0.05;
    const S_wc = 0.2;
    const S_w = 1 - S_g;
    
    let k_rg = 0;
    let k_rw = 0;
    
    if (S_g > S_gc) {
      const S_g_star = (S_g - S_gc) / (1 - S_gc - S_wc);
      k_rg = Math.pow(S_g_star, 3);
    }
    
    if (S_w > S_wc) {
      const S_w_star = (S_w - S_wc) / (1 - S_gc - S_wc);
      k_rw = Math.pow(S_w_star, 3);
    }
    
    return { k_rg, k_rw, S_gc, S_wc };
  }

  calculateMatrixShrinkageMultiplier(averagePressure) {
    const deltaP = this.params.initial_pressure - averagePressure;
    return 1 + this.params.matrix_shrinkage_coeff * deltaP;
  }

  calculateDesorptionInducedPermMultiplier(averagePressure) {
    const desorbedVolume = this.calculateDesorbedVolume(averagePressure);
    const V_max = this.calculateDesorbedVolume(0.1);
    const normalizedDesorption = V_max > 0 ? desorbedVolume / V_max : 0;
    
    return 1 + this.params.desorption_induced_perm_coeff * normalizedDesorption * 10;
  }

  calculateStressSensitivityMultiplier(averagePressure) {
    const effectiveStress = this.params.initial_pressure - averagePressure;
    const closureStress = this.params.fracture_closure_stress;
    const stressRatio = Math.min(1, effectiveStress / closureStress);
    return Math.exp(-0.003 * effectiveStress * (1 - stressRatio * 0.5));
  }

  calculateDynamicPermeability(averagePressure, gasSaturation) {
    const matrixMultiplier = this.calculateMatrixShrinkageMultiplier(averagePressure);
    const desorptionMultiplier = this.calculateDesorptionInducedPermMultiplier(averagePressure);
    const stressMultiplier = this.calculateStressSensitivityMultiplier(averagePressure);
    
    const relPerm = this.calculateRelativePermeability(gasSaturation);
    
    const absolutePerm = this.params.permeability * matrixMultiplier * desorptionMultiplier * stressMultiplier;
    
    return {
      absolute_permeability: absolutePerm,
      effective_gas_permeability: absolutePerm * relPerm.k_rg,
      effective_water_permeability: absolutePerm * relPerm.k_rw,
      matrix_multiplier: matrixMultiplier,
      desorption_multiplier: desorptionMultiplier,
      stress_multiplier: stressMultiplier,
      relative_permeability: relPerm
    };
  }

  calculateHydraulicDiffusivity(k) {
    const k_si = k * 9.869233e-16;
    const phi = this.params.porosity;
    const c_t = 1e-8;
    const mu = this.mu_w;
    return k_si / (phi * c_t * mu);
  }

  exponentialIntegral(x) {
    if (x >= 0) return Infinity;
    if (x < -10) return Math.log(Math.abs(x)) + 0.57721566;
    
    const EPS = 1e-10;
    const EULER = 0.5772156649015328;
    let sum = EULER + Math.log(-x);
    let term = 1;
    let n = 1;
    
    while (Math.abs(term) > EPS && n < 100) {
      term *= x / n;
      if (n > 1) sum += term / n;
      n++;
    }
    
    return sum;
  }

  calculateTransientPressure(r, t, Pi, Q, h, mu, B, eta, rw, re, k_eff) {
    if (t <= 0) return Pi;
    
    const k_si = k_eff * 9.869233e-16;
    const Q_si = Q / 86400;
    
    const dimensionlessTime = (eta * t) / (rw * rw);
    
    let pressureDrawdown;
    
    if (dimensionlessTime < 0.01) {
      return Pi;
    }
    
    if (dimensionlessTime < 100) {
      const u = (r * r) / (4 * eta * t);
      const Ei = this.exponentialIntegral(-u);
      pressureDrawdown = (Q_si * mu * B) / (4 * Math.PI * k_si * h) * (-Ei);
    } else {
      pressureDrawdown = (Q_si * mu * B) / (2 * Math.PI * k_si * h) * 
        (Math.log(eta * t / (rw * rw)) + 0.80907 - 0.5 * (r * r) / (eta * t));
    }
    
    if (r > rw) {
      const boundaryFactor = Math.max(0, 1 - (r / re) * (r / re));
      pressureDrawdown *= boundaryFactor;
    }
    
    const maxDrawdown = Pi * 0.95;
    pressureDrawdown = Math.min(pressureDrawdown, maxDrawdown);
    
    const minPressure = 0.1;
    let pressure = Pi - pressureDrawdown;
    pressure = Math.max(minPressure, Math.min(Pi, pressure));
    
    return pressure;
  }
}

module.exports = ReservoirCore;
