const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'coalbed_methane.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS production_params (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drainage_rate REAL NOT NULL,
      permeability REAL NOT NULL,
      initial_pressure REAL NOT NULL,
      reservoir_thickness REAL NOT NULL,
      well_radius REAL NOT NULL,
      drainage_radius REAL NOT NULL,
      porosity REAL NOT NULL,
      water_saturation REAL NOT NULL,
      gas_content REAL NOT NULL,
      langmuir_pressure REAL NOT NULL,
      langmuir_volume REAL NOT NULL,
      matrix_shrinkage_coeff REAL NOT NULL,
      well_depth REAL DEFAULT 500.0,
      tubing_inner_diameter REAL DEFAULT 0.062,
      surface_pressure REAL DEFAULT 0.101325,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const paramColumnsToAdd = [
    ['well_depth', 'REAL DEFAULT 500.0'],
    ['tubing_inner_diameter', 'REAL DEFAULT 0.062'],
    ['surface_pressure', 'REAL DEFAULT 0.101325'],
    ['desorption_induced_perm_coeff', 'REAL DEFAULT 0.02'],
    ['fracture_closure_stress', 'REAL DEFAULT 15.0'],
    ['tubing_roughness', 'REAL DEFAULT 0.000045']
  ];

  paramColumnsToAdd.forEach(([col, def]) => {
    db.run(`ALTER TABLE production_params ADD COLUMN ${col} ${def}`, (err) => {
      if (err) {}
    });
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS production_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      params_id INTEGER NOT NULL,
      time REAL NOT NULL,
      bottomhole_pressure REAL NOT NULL,
      critical_desorption_pressure REAL NOT NULL,
      gas_production_rate REAL NOT NULL,
      water_production_rate REAL NOT NULL,
      gas_water_ratio REAL DEFAULT 0,
      cumulative_gas REAL DEFAULT 0,
      cumulative_water REAL DEFAULT 0,
      average_reservoir_pressure REAL NOT NULL,
      gas_saturation REAL NOT NULL,
      effective_permeability REAL DEFAULT 0,
      effective_permeability_gas REAL NOT NULL,
      effective_permeability_water REAL NOT NULL,
      matrix_shrinkage_multiplier REAL DEFAULT 1.0,
      wellbore_pressure_loss REAL DEFAULT 0,
      surface_flow_pressure REAL DEFAULT 0,
      pressure_profile TEXT NOT NULL,
      saturation_profile TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (params_id) REFERENCES production_params(id)
    )
  `);

  const snapshotColumnsToAdd = [
    ['gas_water_ratio', 'REAL DEFAULT 0'],
    ['cumulative_gas', 'REAL DEFAULT 0'],
    ['cumulative_water', 'REAL DEFAULT 0'],
    ['effective_permeability', 'REAL DEFAULT 0'],
    ['matrix_shrinkage_multiplier', 'REAL DEFAULT 1.0'],
    ['wellbore_pressure_loss', 'REAL DEFAULT 0'],
    ['surface_flow_pressure', 'REAL DEFAULT 0'],
    ['desorption_permeability_multiplier', 'REAL DEFAULT 1.0'],
    ['stress_permeability_multiplier', 'REAL DEFAULT 1.0'],
    ['desorbed_volume', 'REAL DEFAULT 0'],
    ['wellbore_flow_pattern', 'TEXT DEFAULT "bubble"'],
    ['wellbore_friction_factor', 'REAL DEFAULT 0.02'],
    ['wellbore_liquid_holdup', 'REAL DEFAULT 1.0'],
    ['wellbore_mixture_density', 'REAL DEFAULT 1000'],
    ['wellbore_friction_drop', 'REAL DEFAULT 0'],
    ['wellbore_gravity_drop', 'REAL DEFAULT 0']
  ];

  snapshotColumnsToAdd.forEach(([col, def]) => {
    db.run(`ALTER TABLE production_snapshots ADD COLUMN ${col} ${def}`, (err) => {
      if (err) {}
    });
  });

  const stmt = db.prepare('SELECT COUNT(*) as count FROM production_params');
  stmt.get((err, row) => {
    if (row.count === 0) {
      const insertStmt = db.prepare(`
        INSERT INTO production_params (
          drainage_rate, permeability, initial_pressure, reservoir_thickness,
          well_radius, drainage_radius, porosity, water_saturation,
          gas_content, langmuir_pressure, langmuir_volume, matrix_shrinkage_coeff,
          well_depth, tubing_inner_diameter, surface_pressure,
          desorption_induced_perm_coeff, fracture_closure_stress, tubing_roughness
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        5.0, 1.0, 10.0, 10.0, 0.1, 500.0, 0.05, 0.95,
        15.0, 3.0, 20.0, 0.01, 500.0, 0.062, 0.101325,
        0.02, 15.0, 0.000045
      );
      insertStmt.finalize();
    }
  });
});

module.exports = db;
