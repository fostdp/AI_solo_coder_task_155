const fs = require('fs');
const path = require('path');
const db = require('./database');

const BACKUP_DIR = path.join(__dirname, 'backups');
const SNAPSHOT_RETENTION_DAYS = 90;
const PARAMS_RETENTION_DAYS = 180;
const BACKUP_INTERVAL_HOURS = 24;
const CLEANUP_INTERVAL_HOURS = 12;

let backupTimer = null;
let cleanupTimer = null;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log('[SCHEDULER] 备份目录已创建');
  }
}

function createBackup() {
  ensureBackupDir();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `coalbed_methane_${timestamp}.db`);
  const sourceFile = path.join(__dirname, 'coalbed_methane.db');
  
  try {
    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, backupFile);
      
      const stats = fs.statSync(backupFile);
      console.log(`[SCHEDULER] ✓ 数据库备份完成: ${path.basename(backupFile)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      
      cleanupOldBackups();
      
      return backupFile;
    } else {
      console.log('[SCHEDULER] ✗ 源数据库文件不存在');
      return null;
    }
  } catch (error) {
    console.error('[SCHEDULER] ✗ 备份失败:', error.message);
    return null;
  }
}

function cleanupOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('coalbed_methane_') && f.endsWith('.db'))
      .map(f => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    const MAX_BACKUPS = 30;
    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      toDelete.forEach(f => {
        fs.unlinkSync(f.path);
        console.log(`[SCHEDULER] 清理旧备份: ${f.name}`);
      });
    }
  } catch (error) {
    console.error('[SCHEDULER] 清理旧备份失败:', error.message);
  }
}

function cleanupExpiredSnapshots() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - SNAPSHOT_RETENTION_DAYS);
  const cutoffStr = cutoffDate.toISOString();
  
  db.all(`
    SELECT COUNT(*) as count FROM production_snapshots
    WHERE created_at < ?
  `, [cutoffStr], (err, row) => {
    if (err) {
      console.error('[SCHEDULER] 查询过期快照失败:', err.message);
      return;
    }
    
    const count = row[0]?.count || 0;
    if (count > 0) {
      db.run(`
        DELETE FROM production_snapshots
        WHERE created_at < ?
      `, [cutoffStr], (err) => {
        if (err) {
          console.error('[SCHEDULER] 删除过期快照失败:', err.message);
        } else {
          console.log(`[SCHEDULER] ✓ 清理过期快照: ${count} 条 (保留${SNAPSHOT_RETENTION_DAYS}天)`);
        }
      });
    }
  });
}

function cleanupExpiredParams() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PARAMS_RETENTION_DAYS);
  const cutoffStr = cutoffDate.toISOString();
  
  db.all(`
    SELECT COUNT(*) as count FROM production_params
    WHERE created_at < ?
    AND id NOT IN (SELECT DISTINCT params_id FROM production_snapshots)
  `, [cutoffStr], (err, row) => {
    if (err) {
      console.error('[SCHEDULER] 查询过期参数失败:', err.message);
      return;
    }
    
    const count = row[0]?.count || 0;
    if (count > 0) {
      db.run(`
        DELETE FROM production_params
        WHERE created_at < ?
        AND id NOT IN (SELECT DISTINCT params_id FROM production_snapshots)
      `, [cutoffStr], (err) => {
        if (err) {
          console.error('[SCHEDULER] 删除过期参数失败:', err.message);
        } else {
          console.log(`[SCHEDULER] ✓ 清理过期参数: ${count} 条 (保留${PARAMS_RETENTION_DAYS}天)`);
        }
      });
    }
  });
}

function runFullCleanup() {
  console.log('[SCHEDULER] 开始数据清理任务...');
  cleanupExpiredSnapshots();
  cleanupExpiredParams();
}

function listBackups() {
  ensureBackupDir();
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('coalbed_methane_') && f.endsWith('.db'))
      .map(f => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          name: f,
          size: stats.size,
          created: stats.mtime
        };
      })
      .sort((a, b) => b.created - a.created);
    
    return files;
  } catch (error) {
    console.error('[SCHEDULER] 列出备份失败:', error.message);
    return [];
  }
}

function restoreBackup(backupName) {
  const backupPath = path.join(BACKUP_DIR, backupName);
  const targetPath = path.join(__dirname, 'coalbed_methane.db');
  
  if (!fs.existsSync(backupPath)) {
    throw new Error('备份文件不存在');
  }
  
  try {
    fs.copyFileSync(backupPath, targetPath);
    console.log(`[SCHEDULER] ✓ 数据库已从 ${backupName} 恢复`);
    return true;
  } catch (error) {
    console.error('[SCHEDULER] ✗ 恢复备份失败:', error.message);
    throw error;
  }
}

function getStorageStats() {
  return new Promise((resolve) => {
    db.get('SELECT COUNT(*) as snapshot_count FROM production_snapshots', (err1, row1) => {
      db.get('SELECT COUNT(*) as params_count FROM production_params', (err2, row2) => {
        const sourceFile = path.join(__dirname, 'coalbed_methane.db');
        let dbSize = 0;
        if (fs.existsSync(sourceFile)) {
          dbSize = fs.statSync(sourceFile).size;
        }
        
        const backups = listBackups();
        const totalBackupSize = backups.reduce((sum, b) => sum + b.size, 0);
        
        resolve({
          snapshots: row1?.snapshot_count || 0,
          params: row2?.params_count || 0,
          database_size: dbSize,
          backup_count: backups.length,
          total_backup_size: totalBackupSize,
          retention: {
            snapshots_days: SNAPSHOT_RETENTION_DAYS,
            params_days: PARAMS_RETENTION_DAYS
          }
        });
      });
    });
  });
}

function startScheduledTasks() {
  console.log('[SCHEDULER] 定时任务已启动');
  
  setTimeout(() => {
    createBackup();
  }, 5000);
  
  backupTimer = setInterval(() => {
    createBackup();
  }, BACKUP_INTERVAL_HOURS * 60 * 60 * 1000);
  
  setTimeout(() => {
    runFullCleanup();
  }, 10000);
  
  cleanupTimer = setInterval(() => {
    runFullCleanup();
  }, CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000);
  
  console.log(`[SCHEDULER] - 备份频率: 每${BACKUP_INTERVAL_HOURS}小时`);
  console.log(`[SCHEDULER] - 清理频率: 每${CLEANUP_INTERVAL_HOURS}小时`);
  console.log(`[SCHEDULER] - 快照保留: ${SNAPSHOT_RETENTION_DAYS}天`);
  console.log(`[SCHEDULER] - 参数保留: ${PARAMS_RETENTION_DAYS}天`);
}

function stopScheduledTasks() {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  console.log('[SCHEDULER] 定时任务已停止');
}

module.exports = {
  startScheduledTasks,
  stopScheduledTasks,
  createBackup,
  listBackups,
  restoreBackup,
  runFullCleanup,
  getStorageStats,
  BACKUP_DIR
};
