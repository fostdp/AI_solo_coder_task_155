const cluster = require('cluster');
const os = require('os');
const process = require('process');

const numCPUs = os.cpus().length;
const WORKER_COUNT = Math.min(numCPUs, 4);

if (cluster.isPrimary) {
  console.log('='.repeat(70));
  console.log('煤层气排水降压模拟 - 集群模式');
  console.log('='.repeat(70));
  console.log(`主进程 PID: ${process.pid}`);
  console.log(`CPU 核心数: ${numCPUs}`);
  console.log(`工作进程数: ${WORKER_COUNT}`);
  console.log('-'.repeat(70));

  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork();
  }

  cluster.on('fork', (worker) => {
    console.log(`[CLUSTER] 工作进程 ${worker.process.pid} 启动中...`);
  });

  cluster.on('online', (worker) => {
    console.log(`[CLUSTER] ✓ 工作进程 ${worker.process.pid} 已就绪`);
  });

  cluster.on('exit', (worker, code, signal) => {
    console.log(`[CLUSTER] ✗ 工作进程 ${worker.process.pid} 退出 (code: ${code}, signal: ${signal})`);
    console.log(`[CLUSTER] 正在重启工作进程...`);
    const newWorker = cluster.fork();
    console.log(`[CLUSTER] 新工作进程 ${newWorker.process.pid} 已启动`);
  });

  cluster.on('listening', (worker, address) => {
    console.log(`[CLUSTER] 工作进程 ${worker.process.pid} 监听 ${address.address}:${address.port}`);
  });

  process.on('SIGINT', () => {
    console.log('\n[CLUSTER] 收到关闭信号，正在关闭所有工作进程...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }
    console.log('[CLUSTER] 所有工作进程已关闭');
    process.exit(0);
  });

} else {
  const express = require('express');
  const cors = require('cors');
  const bodyParser = require('body-parser');
  const path = require('path');
  const apiRoutes = require('./routes/api');
  const { startScheduledTasks } = require('./scheduler');

  const app = express();
  const PORT = process.env.PORT || 8080;

  app.use(cors());
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Worker-Id', cluster.worker.id);
    res.setHeader('X-Worker-Pid', process.pid);
    next();
  });

  app.use(express.static(path.join(__dirname, '../frontend'), {
    maxAge: '1d',
    etag: true,
    lastModified: true
  }));

  app.use('/api', apiRoutes);

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      worker_id: cluster.worker.id,
      pid: process.pid,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  if (cluster.worker.id === 1) {
    startScheduledTasks();
  }

  const server = app.listen(PORT, () => {
    console.log(`[WORKER-${cluster.worker.id}] 服务器运行在 http://localhost:${PORT}`);
  });

  process.on('SIGTERM', () => {
    console.log(`[WORKER-${cluster.worker.id}] 收到关闭信号，正在关闭...`);
    server.close(() => {
      console.log(`[WORKER-${cluster.worker.id}] 已关闭`);
      process.exit(0);
    });
  });

  module.exports = app;
}
