class WellboreFlow {
  constructor(params) {
    this.params = {
      well_depth: params.well_depth || 500.0,
      tubing_inner_diameter: params.tubing_inner_diameter || 0.062,
      tubing_roughness: params.tubing_roughness || 0.000045,
      surface_pressure: params.surface_pressure || 0.101325,
      surface_temperature: params.surface_temperature || 293.15,
      bottomhole_temperature: params.bottomhole_temperature || 313.15
    };

    this.g = 9.81;
    this.rho_w = 1000;
    this.mu_w = 0.001;
    this.mu_g = 0.000018;
    this.sigma = 0.072;
    this.R = 8.314;
    this.M_g = 0.016;
    this.Z = 0.9;

    this.flowPatterns = {
      BUBBLE: 'bubble',
      SLUG: 'slug',
      CHURN: 'churn',
      ANNULAR: 'annular',
      MIST: 'mist'
    };
  }

  calculateGasDensity(pressure, temperature) {
    const P_pa = pressure * 1e6;
    return (P_pa * this.M_g) / (this.Z * this.R * temperature);
  }

  calculateAverageTemperature(depthFraction) {
    return this.params.surface_temperature + 
      depthFraction * (this.params.bottomhole_temperature - this.params.surface_temperature);
  }

  calculateSuperficialVelocities(waterRate, gasRate, pressure, temperature) {
    const D = this.params.tubing_inner_diameter;
    const A = Math.PI * D * D / 4;
    
    const Q_w_si = waterRate / 86400;
    const Q_g_si = gasRate / 86400;
    
    const v_sl = Q_w_si / A;
    const v_sg = Q_g_si / A;
    
    return { v_sl, v_sg, A };
  }

  calculateFlowPattern(v_sl, v_sg, rho_g) {
    const v_m = v_sl + v_sg;
    
    const Fr = v_m * v_m / (this.g * this.params.tubing_inner_diameter);
    const We = (rho_g * v_m * v_m * this.params.tubing_inner_diameter) / this.sigma;
    
    if (v_sg < 0.1) {
      return this.flowPatterns.BUBBLE;
    } else if (v_sg < 5.0 && v_sl > 0.1) {
      return this.flowPatterns.SLUG;
    } else if (v_sg < 15.0) {
      return this.flowPatterns.CHURN;
    } else if (Fr > 10 && We > 100) {
      return this.flowPatterns.ANNULAR;
    } else {
      return this.flowPatterns.MIST;
    }
  }

  calculateBubbleFlowFriction(v_sl, v_sg, rho_l, rho_g, mu_l, mu_g) {
    const v_m = v_sl + v_sg;
    const alpha_g = v_sg / (v_m + 1e-10);
    
    const rho_mix = rho_l * (1 - alpha_g) + rho_g * alpha_g;
    const mu_mix = mu_l * (1 - alpha_g) + mu_g * alpha_g;
    
    const D = this.params.tubing_inner_diameter;
    const Re = (rho_mix * v_m * D) / mu_mix;
    
    return this.calculateFrictionFactor(Re);
  }

  calculateSlugFlowFriction(v_sl, v_sg, rho_l, rho_g, mu_l) {
    const v_m = v_sl + v_sg;
    const C0 = 1.2;
    const v_d = 0.35 * Math.sqrt(this.g * this.params.tubing_inner_diameter);
    
    let alpha_g = v_sg / (C0 * v_m + v_d);
    alpha_g = Math.max(0, Math.min(0.8, alpha_g));
    
    const rho_mix = rho_l * (1 - alpha_g) + rho_g * alpha_g;
    
    const D = this.params.tubing_inner_diameter;
    const Re = (rho_l * v_m * D) / mu_l;
    
    const baseFriction = this.calculateFrictionFactor(Re);
    const slugEnhancement = 1.0 + 0.5 * alpha_g;
    
    return baseFriction * slugEnhancement;
  }

  calculateChurnFlowFriction(v_sl, v_sg, rho_l, rho_g, mu_l) {
    const v_m = v_sl + v_sg;
    let alpha_g = v_sg / (v_m + 1e-10);
    alpha_g = Math.max(0, Math.min(0.9, alpha_g));
    
    const rho_mix = rho_l * (1 - alpha_g) + rho_g * alpha_g;
    
    const D = this.params.tubing_inner_diameter;
    const Re = (rho_mix * v_m * D) / this.mu_w;
    
    const baseFriction = this.calculateFrictionFactor(Re);
    const churnEnhancement = 1.0 + 0.3 * Math.sin(alpha_g * Math.PI);
    
    return baseFriction * churnEnhancement;
  }

  calculateAnnularFlowFriction(v_sl, v_sg, rho_l, rho_g, mu_l, mu_g) {
    const v_m = v_sl + v_sg;
    let alpha_g = v_sg / (v_m + 1e-10);
    alpha_g = Math.max(0.5, Math.min(0.99, alpha_g));
    
    const D = this.params.tubing_inner_diameter;
    
    const Re_g = (rho_g * v_sg * D) / mu_g;
    
    const epsilon = this.params.tubing_roughness;
    const f_g = this.calculateFrictionFactor(Re_g, epsilon / D);
    
    const liquidFilmFactor = v_sl > 0 ? (1 + 0.1 * Math.sqrt(v_sl / v_sg)) : 1.0;
    
    return f_g * liquidFilmFactor;
  }

  calculateMistFlowFriction(v_sg, rho_g, mu_g) {
    const D = this.params.tubing_inner_diameter;
    const Re_g = (rho_g * v_sg * D) / mu_g;
    
    const epsilon = this.params.tubing_roughness;
    return this.calculateFrictionFactor(Re_g, epsilon / D);
  }

  calculateFrictionFactor(Re, roughnessRatio = 0) {
    if (Re <= 0) return 0.02;
    
    if (Re < 2300) {
      return 64 / Math.max(Re, 1);
    }
    
    if (roughnessRatio <= 0) {
      return 0.3164 / Math.pow(Math.max(Re, 1), 0.25);
    }
    
    let f = 0.02;
    for (let i = 0; i < 10; i++) {
      const lhs = 1 / Math.sqrt(Math.max(f, 1e-10));
      const rhs = -2 * Math.log10(roughnessRatio / 3.7 + 2.51 / (Re * Math.sqrt(Math.max(f, 1e-10))));
      const error = lhs - rhs;
      if (Math.abs(error) < 1e-6) break;
      f = f * (1 - 0.1 * error);
      f = Math.max(0.005, Math.min(0.1, f));
    }
    return f;
  }

  calculateLiquidHoldup(flowPattern, v_sl, v_sg, rho_l, rho_g, P) {
    const v_m = v_sl + v_sg;
    
    switch (flowPattern) {
      case this.flowPatterns.BUBBLE:
        return Math.max(0.5, 1 - v_sg / (v_m * 1.2 + 0.35));
      
      case this.flowPatterns.SLUG:
        const C0 = 1.2;
        const v_d = 0.35 * Math.sqrt(this.g * this.params.tubing_inner_diameter);
        const alpha_slug = v_sg / (C0 * v_m + v_d);
        return 1 - Math.max(0, Math.min(0.8, alpha_slug));
      
      case this.flowPatterns.CHURN:
        const alpha_churn = Math.min(0.8, v_sg / (v_m + 1e-10));
        return 1 - alpha_churn * 0.9;
      
      case this.flowPatterns.ANNULAR:
        return Math.max(0.02, 0.2 * Math.pow(v_sl / Math.max(v_sg, 1e-6), 0.5));
      
      case this.flowPatterns.MIST:
        return Math.max(0.001, 0.05 * Math.pow(v_sl / Math.max(v_sg, 1e-6), 0.33));
      
      default:
        return 0.5;
    }
  }

  calculatePressureDrop(waterRate, gasRate, averagePressure, depthFraction = 0.5) {
    const D = this.params.tubing_inner_diameter;
    const L = this.params.well_depth;
    const T = this.calculateAverageTemperature(depthFraction);
    
    const rho_g = this.calculateGasDensity(averagePressure, T);
    const rho_l = this.rho_w;
    
    const { v_sl, v_sg } = this.calculateSuperficialVelocities(waterRate, gasRate, averagePressure, T);
    
    const flowPattern = this.calculateFlowPattern(v_sl, v_sg, rho_g);
    
    let frictionFactor;
    switch (flowPattern) {
      case this.flowPatterns.BUBBLE:
        frictionFactor = this.calculateBubbleFlowFriction(v_sl, v_sg, rho_l, rho_g, this.mu_w, this.mu_g);
        break;
      case this.flowPatterns.SLUG:
        frictionFactor = this.calculateSlugFlowFriction(v_sl, v_sg, rho_l, rho_g, this.mu_w);
        break;
      case this.flowPatterns.CHURN:
        frictionFactor = this.calculateChurnFlowFriction(v_sl, v_sg, rho_l, rho_g, this.mu_w);
        break;
      case this.flowPatterns.ANNULAR:
        frictionFactor = this.calculateAnnularFlowFriction(v_sl, v_sg, rho_l, rho_g, this.mu_w, this.mu_g);
        break;
      case this.flowPatterns.MIST:
        frictionFactor = this.calculateMistFlowFriction(v_sg, rho_g, this.mu_g);
        break;
      default:
        frictionFactor = 0.02;
    }
    
    const liquidHoldup = this.calculateLiquidHoldup(flowPattern, v_sl, v_sg, rho_l, rho_g, averagePressure);
    const rho_mix = rho_l * liquidHoldup + rho_g * (1 - liquidHoldup);
    
    const v_m = v_sl + v_sg;
    const v_effective = v_sl / Math.max(liquidHoldup, 0.01);
    
    const frictionDrop = frictionFactor * (L / D) * (rho_mix * v_effective * v_effective) / 2;
    const gravityDrop = rho_mix * this.g * L;
    const accelerationDrop = 0;
    
    const totalDropPa = frictionDrop + gravityDrop + accelerationDrop;
    const totalDropMPa = totalDropPa / 1e6;
    
    const Re_l = (rho_l * v_m * D) / this.mu_w;
    const Re_g = (rho_g * v_sg * D) / this.mu_g;
    
    return {
      flow_pattern: flowPattern,
      friction_factor: frictionFactor,
      liquid_holdup: liquidHoldup,
      mixture_density: rho_mix,
      superficial_liquid_velocity: v_sl,
      superficial_gas_velocity: v_sg,
      reynolds_liquid: Re_l,
      reynolds_gas: Re_g,
      friction_drop_mpa: frictionDrop / 1e6,
      gravity_drop_mpa: gravityDrop / 1e6,
      acceleration_drop_mpa: accelerationDrop / 1e6,
      total_drop_mpa: Math.max(0, totalDropMPa)
    };
  }

  calculateIntegratedPressureDrop(waterRate, gasRate, bottomholePressure) {
    const numSegments = 5;
    let currentP = bottomholePressure;
    let totalDrop = 0;
    
    let result;
    
    for (let i = 0; i < numSegments; i++) {
      const depthFraction = (numSegments - i - 0.5) / numSegments;
      const segP = currentP - totalDrop / 2;
      
      result = this.calculatePressureDrop(waterRate, gasRate, segP, depthFraction);
      const segDrop = result.total_drop_mpa / numSegments;
      
      totalDrop += segDrop;
      currentP -= segDrop;
    }
    
    return result || this.calculatePressureDrop(waterRate, gasRate, bottomholePressure, 0.5);
  }
}

module.exports = WellboreFlow;
