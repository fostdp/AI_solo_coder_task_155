const express = require('express');
const router = express.Router();
const db = require('../database');
const ReservoirModel = require('../models/reservoirModel');
const scheduler = require('../scheduler');

let activeSimulators = {};

router.get('/params', (req, res) => {
  db.all('SELECT * FROM production_params ORDER BY created_at DESC LIMIT 10', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

router.get('/params/latest', (req, res) => {
  db.get('SELECT * FROM production_params ORDER BY created_at DESC LIMIT 1', (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row);
  });
});

router.get('/params/:id', (req, res) => {
  db.get('SELECT * FROM production_params WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: '参数记录不存在' });
      return;
    }
    res.json(row);
  });
});

router.post('/params', (req, res) => {
  const {
    drainage_rate, permeability, initial_pressure, reservoir_thickness,
    well_radius, drainage_radius, porosity, water_saturation,
    gas_content, langmuir_pressure, langmuir_volume, matrix_shrinkage_coeff,
    well_depth, tubing_inner_diameter, surface_pressure,
    desorption_induced_perm_coeff, fracture_closure_stress, tubing_roughness
  } = req.body;

  const stmt = db.prepare(`
    INSERT INTO production_params (
      drainage_rate, permeability, initial_pressure, reservoir_thickness,
      well_radius, drainage_radius, porosity, water_saturation,
      gas_content, langmuir_pressure, langmuir_volume, matrix_shrinkage_coeff,
      well_depth, tubing_inner_diameter, surface_pressure,
      desorption_induced_perm_coeff, fracture_closure_stress, tubing_roughness
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    drainage_rate, permeability, initial_pressure, reservoir_thickness,
    well_radius, drainage_radius, porosity, water_saturation,
    gas_content, langmuir_pressure, langmuir_volume, matrix_shrinkage_coeff,
    well_depth || 500.0, tubing_inner_diameter || 0.062, surface_pressure || 0.101325,
    desorption_induced_perm_coeff || 0.02, fracture_closure_stress || 15.0, tubing_roughness || 0.000045,
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID });
    }
  );
  stmt.finalize();
});

router.put('/params/:id', (req, res) => {
  const {
    drainage_rate, permeability, initial_pressure, reservoir_thickness,
    well_radius, drainage_radius, porosity, water_saturation,
    gas_content, langmuir_pressure, langmuir_volume, matrix_shrinkage_coeff,
    well_depth, tubing_inner_diameter, surface_pressure,
    desorption_induced_perm_coeff, fracture_closure_stress, tubing_roughness
  } = req.body;

  const stmt = db.prepare(`
    UPDATE production_params SET
      drainage_rate = ?, permeability = ?, initial_pressure = ?, 
      reservoir_thickness = ?, well_radius = ?, drainage_radius = ?,
      porosity = ?, water_saturation = ?, gas_content = ?,
      langmuir_pressure = ?, langmuir_volume = ?, matrix_shrinkage_coeff = ?,
      well_depth = ?, tubing_inner_diameter = ?, surface_pressure = ?,
      desorption_induced_perm_coeff = ?, fracture_closure_stress = ?, tubing_roughness = ?
    WHERE id = ?
  `);

  stmt.run(
    drainage_rate, permeability, initial_pressure, reservoir_thickness,
    well_radius, drainage_radius, porosity, water_saturation,
    gas_content, langmuir_pressure, langmuir_volume, matrix_shrinkage_coeff,
    well_depth || 500.0, tubing_inner_diameter || 0.062, surface_pressure || 0.101325,
    desorption_induced_perm_coeff || 0.02, fracture_closure_stress || 15.0, tubing_roughness || 0.000045,
    req.params.id,
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: '参数记录不存在' });
        return;
      }
      res.json({ updated: this.changes });
    }
  );
  stmt.finalize();
});

router.delete('/params/:id', (req, res) => {
  db.run('DELETE FROM production_params WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: '参数记录不存在' });
      return;
    }
    res.json({ deleted: this.changes });
  });
});

router.get('/snapshots', (req, res) => {
  const paramsId = req.query.params_id;
  let query = 'SELECT * FROM production_snapshots';
  let params = [];
  
  if (paramsId) {
    query += ' WHERE params_id = ?';
    params.push(paramsId);
  }
  query += ' ORDER BY created_at DESC LIMIT 100';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.map(row => ({
      ...row,
      pressure_profile: JSON.parse(row.pressure_profile),
      saturation_profile: JSON.parse(row.saturation_profile)
    })));
  });
});

router.post('/snapshots', (req, res) => {
  const {
    params_id, time, bottomhole_pressure, critical_desorption_pressure,
    gas_production_rate, water_production_rate, gas_water_ratio,
    cumulative_gas, cumulative_water, average_reservoir_pressure,
    gas_saturation, effective_permeability, effective_permeability_gas, 
    effective_permeability_water, matrix_shrinkage_multiplier,
    desorption_permeability_multiplier, stress_permeability_multiplier,
    desorbed_volume, wellbore_pressure_loss, surface_flow_pressure,
    wellbore_flow_pattern, wellbore_friction_factor, wellbore_liquid_holdup,
    wellbore_mixture_density, wellbore_friction_drop, wellbore_gravity_drop,
    pressure_profile, saturation_profile
  } = req.body;

  const stmt = db.prepare(`
    INSERT INTO production_snapshots (
      params_id, time, bottomhole_pressure, critical_desorption_pressure,
      gas_production_rate, water_production_rate, gas_water_ratio,
      cumulative_gas, cumulative_water, average_reservoir_pressure,
      gas_saturation, effective_permeability, effective_permeability_gas, 
      effective_permeability_water, matrix_shrinkage_multiplier,
      desorption_permeability_multiplier, stress_permeability_multiplier,
      desorbed_volume, wellbore_pressure_loss, surface_flow_pressure,
      wellbore_flow_pattern, wellbore_friction_factor, wellbore_liquid_holdup,
      wellbore_mixture_density, wellbore_friction_drop, wellbore_gravity_drop,
      pressure_profile, saturation_profile
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    params_id, time, bottomhole_pressure, critical_desorption_pressure,
    gas_production_rate, water_production_rate, gas_water_ratio || 0,
    cumulative_gas || 0, cumulative_water || 0, average_reservoir_pressure,
    gas_saturation, effective_permeability || 0, effective_permeability_gas, 
    effective_permeability_water, matrix_shrinkage_multiplier || 1.0,
    desorption_permeability_multiplier || 1.0, stress_permeability_multiplier || 1.0,
    desorbed_volume || 0, wellbore_pressure_loss || 0, surface_flow_pressure || 0,
    wellbore_flow_pattern || 'bubble', wellbore_friction_factor || 0.02,
    wellbore_liquid_holdup || 1.0, wellbore_mixture_density || 1000,
    wellbore_friction_drop || 0, wellbore_gravity_drop || 0,
    JSON.stringify(pressure_profile), JSON.stringify(saturation_profile),
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID });
    }
  );
  stmt.finalize();
});

router.post('/simulation/start', (req, res) => {
  const { params_id, params } = req.body;
  
  let simulatorParams;
  
  if (params) {
    simulatorParams = params;
  } else if (params_id) {
    db.get('SELECT * FROM production_params WHERE id = ?', [params_id], (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (!row) {
        res.status(404).json({ error: '参数记录不存在' });
        return;
      }
      
      const simulator = new ReservoirModel(row);
      const simulatorId = Date.now().toString();
      activeSimulators[simulatorId] = {
        simulator: simulator,
        paramsId: row.id
      };
      
      res.json({
        simulator_id: simulatorId,
        params_id: row.id,
        initial_state: simulator.step(0)
      });
    });
    return;
  } else {
    db.get('SELECT * FROM production_params ORDER BY created_at DESC LIMIT 1', (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (!row) {
        res.status(404).json({ error: '没有可用的参数记录' });
        return;
      }
      
      const simulator = new ReservoirModel(row);
      const simulatorId = Date.now().toString();
      activeSimulators[simulatorId] = {
        simulator: simulator,
        paramsId: row.id
      };
      
      res.json({
        simulator_id: simulatorId,
        params_id: row.id,
        initial_state: simulator.step(0)
      });
    });
    return;
  }
  
  const simulator = new ReservoirModel(simulatorParams);
  const simulatorId = Date.now().toString();
  activeSimulators[simulatorId] = {
    simulator: simulator,
    paramsId: null
  };
  
  res.json({
    simulator_id: simulatorId,
    params_id: null,
    initial_state: simulator.step(0)
  });
});

router.post('/simulation/step', (req, res) => {
  const { simulator_id, time_step } = req.body;
  
  if (!activeSimulators[simulator_id]) {
    res.status(404).json({ error: '模拟器不存在，请先启动模拟' });
    return;
  }
  
  const simulator = activeSimulators[simulator_id].simulator;
  const dt = time_step || 3600;
  const result = simulator.step(dt);
  
  res.json(result);
});

router.post('/simulation/reset', (req, res) => {
  const { simulator_id } = req.body;
  
  if (!activeSimulators[simulator_id]) {
    res.status(404).json({ error: '模拟器不存在，请先启动模拟' });
    return;
  }
  
  activeSimulators[simulator_id].simulator.reset();
  res.json({ message: '模拟器已重置' });
});

router.post('/simulation/save', (req, res) => {
  const { simulator_id } = req.body;
  
  if (!activeSimulators[simulator_id]) {
    res.status(404).json({ error: '模拟器不存在，请先启动模拟' });
    return;
  }
  
  const simData = activeSimulators[simulator_id];
  const simulator = simData.simulator;
  
  const currentState = simulator.step(0);
  
  const stmt = db.prepare(`
    INSERT INTO production_snapshots (
      params_id, time, bottomhole_pressure, critical_desorption_pressure,
      gas_production_rate, water_production_rate, gas_water_ratio,
      cumulative_gas, cumulative_water, average_reservoir_pressure,
      gas_saturation, effective_permeability, effective_permeability_gas, 
      effective_permeability_water, matrix_shrinkage_multiplier,
      desorption_permeability_multiplier, stress_permeability_multiplier,
      desorbed_volume, wellbore_pressure_loss, surface_flow_pressure,
      wellbore_flow_pattern, wellbore_friction_factor, wellbore_liquid_holdup,
      wellbore_mixture_density, wellbore_friction_drop, wellbore_gravity_drop,
      pressure_profile, saturation_profile
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    simData.paramsId, currentState.time, currentState.bottomhole_pressure,
    currentState.critical_desorption_pressure, currentState.gas_production_rate,
    currentState.water_production_rate, currentState.gas_water_ratio || 0,
    currentState.cumulative_gas || 0, currentState.cumulative_water || 0,
    currentState.average_reservoir_pressure,
    currentState.gas_saturation, currentState.effective_permeability || 0, 
    currentState.effective_permeability_gas,
    currentState.effective_permeability_water, 
    currentState.matrix_shrinkage_multiplier || 1.0,
    currentState.desorption_permeability_multiplier || 1.0,
    currentState.stress_permeability_multiplier || 1.0,
    currentState.desorbed_volume || 0,
    currentState.wellbore_pressure_loss || 0,
    currentState.surface_flow_pressure || 0,
    currentState.wellbore_flow_pattern || 'bubble',
    currentState.wellbore_friction_factor || 0.02,
    currentState.wellbore_liquid_holdup || 1.0,
    currentState.wellbore_mixture_density || 1000,
    currentState.wellbore_friction_drop || 0,
    currentState.wellbore_gravity_drop || 0,
    JSON.stringify(currentState.pressure_profile),
    JSON.stringify(currentState.saturation_profile),
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, state: currentState });
    }
  );
  stmt.finalize();
});

router.post('/simulation/calculate', (req, res) => {
  const { params, time, time_step } = req.body;
  
  const simulator = new ReservoirModel(params);
  const totalTime = time || 86400;
  const dt = time_step || 3600;
  
  let currentState = null;
  for (let t = 0; t < totalTime; t += dt) {
    currentState = simulator.step(dt);
  }
  
  res.json(currentState);
});

router.get('/production/analysis/:params_id', (req, res) => {
  const paramsId = req.params.params_id;
  db.all(`
    SELECT 
      id, time, gas_production_rate, water_production_rate,
      gas_water_ratio, cumulative_gas, cumulative_water,
      bottomhole_pressure, average_reservoir_pressure,
      critical_desorption_pressure, gas_saturation,
      effective_permeability, matrix_shrinkage_multiplier,
      desorption_permeability_multiplier, desorbed_volume,
      wellbore_flow_pattern, wellbore_friction_factor,
      wellbore_liquid_holdup, wellbore_pressure_loss,
      wellbore_friction_drop, wellbore_gravity_drop,
      created_at
    FROM production_snapshots 
    WHERE params_id = ?
    ORDER BY time ASC
  `, [paramsId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const analysis = {
      snapshots: rows,
      summary: null
    };
    
    if (rows.length > 0) {
      const first = rows[0];
      const last = rows[rows.length - 1];
      const gasRates = rows.map(r => r.gas_production_rate);
      const waterRates = rows.map(r => r.water_production_rate);
      const ratios = rows.map(r => r.gas_water_ratio).filter(r => r > 0);
      const patterns = [...new Set(rows.map(r => r.wellbore_flow_pattern))];
      
      analysis.summary = {
        total_snapshots: rows.length,
        simulation_duration: last.time - first.time,
        peak_gas_rate: Math.max(...gasRates),
        peak_water_rate: Math.max(...waterRates),
        avg_gas_water_ratio: ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0,
        total_cumulative_gas: last.cumulative_gas,
        total_cumulative_water: last.cumulative_water,
        final_pressure: last.bottomhole_pressure,
        final_permeability: last.effective_permeability,
        max_shrinkage_multiplier: Math.max(...rows.map(r => r.matrix_shrinkage_multiplier)),
        max_desorption_multiplier: Math.max(...rows.map(r => r.desorption_permeability_multiplier)),
        flow_patterns_observed: patterns,
        max_wellbore_loss: Math.max(...rows.map(r => r.wellbore_pressure_loss)),
        friction_gravity_ratio: last.wellbore_gravity_drop > 0 ? 
          last.wellbore_friction_drop / last.wellbore_gravity_drop : 0
      };
    }
    
    res.json(analysis);
  });
});

router.get('/admin/storage-stats', async (req, res) => {
  try {
    const stats = await scheduler.getStorageStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/backup', (req, res) => {
  const backupFile = scheduler.createBackup();
  if (backupFile) {
    res.json({ 
      success: true, 
      backup_file: backupFile,
      message: '备份创建成功'
    });
  } else {
    res.status(500).json({ error: '备份创建失败' });
  }
});

router.get('/admin/backups', (req, res) => {
  const backups = scheduler.listBackups();
  res.json(backups);
});

router.post('/admin/restore', (req, res) => {
  const { backup_name } = req.body;
  
  if (!backup_name) {
    res.status(400).json({ error: '缺少 backup_name 参数' });
    return;
  }
  
  try {
    scheduler.restoreBackup(backup_name);
    res.json({ success: true, message: '数据库已恢复' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/cleanup', (req, res) => {
  scheduler.runFullCleanup();
  res.json({ success: true, message: '清理任务已触发' });
});

module.exports = router;
