class CBM_Simulator {
    constructor() {
        this.apiBase = 'http://localhost:8080/api';
        this.simulatorId = null;
        this.paramsId = null;
        this.isRunning = false;
        this.isPaused = false;
        this.animationId = null;
        this.lastStepTime = 0;
        
        this.currentState = null;
        this.productionHistory = [];
        
        this.canvas = document.getElementById('simulationCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.pressureCanvas = document.getElementById('pressureChart');
        this.pressureCtx = this.pressureCanvas.getContext('2d');
        
        this.saturationCanvas = document.getElementById('saturationChart');
        this.saturationCtx = this.saturationCanvas.getContext('2d');
        
        this.productionCanvas = document.getElementById('productionChart');
        this.productionCtx = this.productionCanvas.getContext('2d');
        
        this.gasParticles = [];
        this.waterParticles = [];
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.loadLatestParams();
        this.updateStatus('ready', '待启动');
        this.drawInitialScene();
    }
    
    setupEventListeners() {
        document.getElementById('drainageRate').addEventListener('input', (e) => {
            document.getElementById('drainageRateValue').textContent = parseFloat(e.target.value).toFixed(1);
        });
        
        document.getElementById('permeability').addEventListener('input', (e) => {
            document.getElementById('permeabilityValue').textContent = parseFloat(e.target.value).toFixed(2);
        });
        
        document.getElementById('timeStep').addEventListener('input', (e) => {
            document.getElementById('timeStepValue').textContent = e.target.value;
        });
        
        document.getElementById('speed').addEventListener('input', (e) => {
            document.getElementById('speedValue').textContent = e.target.value;
        });
        
        document.getElementById('startBtn').addEventListener('click', () => this.startSimulation());
        document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetSimulation());
        document.getElementById('saveBtn').addEventListener('click', () => this.saveSnapshot());
        document.getElementById('applyParamsBtn').addEventListener('click', () => this.applyAdvancedParams());
        document.getElementById('loadSnapshotsBtn').addEventListener('click', () => this.loadSnapshots());
    }
    
    async loadLatestParams() {
        try {
            const response = await fetch(`${this.apiBase}/params/latest`);
            const data = await response.json();
            if (data) {
                this.paramsId = data.id;
                document.getElementById('initialPressure').value = data.initial_pressure;
                document.getElementById('reservoirThickness').value = data.reservoir_thickness;
                document.getElementById('wellRadius').value = data.well_radius;
                document.getElementById('drainageRadius').value = data.drainage_radius;
                document.getElementById('porosity').value = data.porosity;
                document.getElementById('gasContent').value = data.gas_content;
                document.getElementById('langmuirPressure').value = data.langmuir_pressure;
                document.getElementById('langmuirVolume').value = data.langmuir_volume;
                document.getElementById('matrixShrinkage').value = data.matrix_shrinkage_coeff;
                document.getElementById('drainageRate').value = data.drainage_rate;
                document.getElementById('drainageRateValue').textContent = data.drainage_rate.toFixed(1);
                document.getElementById('permeability').value = data.permeability;
                document.getElementById('permeabilityValue').textContent = data.permeability.toFixed(2);
            }
        } catch (error) {
            console.error('加载参数失败:', error);
        }
    }
    
    getParamsFromUI() {
        return {
            drainage_rate: parseFloat(document.getElementById('drainageRate').value),
            permeability: parseFloat(document.getElementById('permeability').value),
            initial_pressure: parseFloat(document.getElementById('initialPressure').value),
            reservoir_thickness: parseFloat(document.getElementById('reservoirThickness').value),
            well_radius: parseFloat(document.getElementById('wellRadius').value),
            drainage_radius: parseFloat(document.getElementById('drainageRadius').value),
            porosity: parseFloat(document.getElementById('porosity').value),
            water_saturation: 0.95,
            gas_content: parseFloat(document.getElementById('gasContent').value),
            langmuir_pressure: parseFloat(document.getElementById('langmuirPressure').value),
            langmuir_volume: parseFloat(document.getElementById('langmuirVolume').value),
            matrix_shrinkage_coeff: parseFloat(document.getElementById('matrixShrinkage').value)
        };
    }
    
    async applyAdvancedParams() {
        try {
            const params = this.getParamsFromUI();
            const response = await fetch(`${this.apiBase}/params`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            const data = await response.json();
            this.paramsId = data.id;
            this.showNotification('参数已保存', 'success');
            
            if (this.isRunning) {
                await this.restartSimulation();
            }
        } catch (error) {
            console.error('应用参数失败:', error);
            this.showNotification('参数保存失败', 'error');
        }
    }
    
    async startSimulation() {
        try {
            const params = this.getParamsFromUI();
            const response = await fetch(`${this.apiBase}/simulation/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    params_id: this.paramsId,
                    params: params
                })
            });
            const data = await response.json();
            
            this.simulatorId = data.simulator_id;
            this.paramsId = data.params_id;
            this.currentState = data.initial_state;
            this.productionHistory = [{
                time: 0,
                gas_rate: data.initial_state.gas_production_rate,
                water_rate: data.initial_state.water_production_rate
            }];
            
            this.isRunning = true;
            this.isPaused = false;
            
            document.getElementById('startBtn').disabled = true;
            document.getElementById('pauseBtn').disabled = false;
            document.getElementById('pauseBtn').textContent = '暂停';
            
            this.updateStatus('running', '运行中');
            this.lastStepTime = Date.now();
            this.animate();
            
            this.showNotification('模拟已启动', 'success');
        } catch (error) {
            console.error('启动模拟失败:', error);
            this.updateStatus('error', '启动失败');
            this.showNotification('启动模拟失败', 'error');
        }
    }
    
    async restartSimulation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        await this.startSimulation();
    }
    
    async togglePause() {
        if (!this.isRunning) return;
        
        this.isPaused = !this.isPaused;
        
        if (this.isPaused) {
            document.getElementById('pauseBtn').textContent = '继续';
            this.updateStatus('paused', '已暂停');
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
        } else {
            document.getElementById('pauseBtn').textContent = '暂停';
            this.updateStatus('running', '运行中');
            this.lastStepTime = Date.now();
            this.animate();
        }
    }
    
    async resetSimulation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.simulatorId) {
            try {
                await fetch(`${this.apiBase}/simulation/reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ simulator_id: this.simulatorId })
                });
            } catch (error) {
                console.error('重置模拟失败:', error);
            }
        }
        
        this.isRunning = false;
        this.isPaused = false;
        this.simulatorId = null;
        this.currentState = null;
        this.productionHistory = [];
        this.gasParticles = [];
        this.waterParticles = [];
        
        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('pauseBtn').textContent = '暂停';
        
        this.updateStatus('ready', '待启动');
        this.updateDataDisplay(null);
        this.drawInitialScene();
        
        this.showNotification('模拟已重置', 'info');
    }
    
    async saveSnapshot() {
        if (!this.simulatorId) {
            this.showNotification('请先启动模拟', 'warning');
            return;
        }
        
        try {
            const response = await fetch(`${this.apiBase}/simulation/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ simulator_id: this.simulatorId })
            });
            const data = await response.json();
            this.showNotification(`快照已保存 #${data.id}`, 'success');
            this.loadSnapshots();
        } catch (error) {
            console.error('保存快照失败:', error);
            this.showNotification('保存快照失败', 'error');
        }
    }
    
    async loadSnapshots() {
        try {
            const response = await fetch(`${this.apiBase}/snapshots`);
            const data = await response.json();
            
            const listContainer = document.getElementById('snapshotList');
            
            if (data.length === 0) {
                listContainer.innerHTML = '<p class="no-data">暂无保存的快照</p>';
                return;
            }
            
            listContainer.innerHTML = data.map(snap => `
                <div class="snapshot-item" data-id="${snap.id}">
                    <div class="time">${(snap.time / 86400).toFixed(2)} 天</div>
                    <div class="info">
                        产气: ${snap.gas_production_rate.toFixed(1)} m³/d | 
                        压力: ${snap.average_reservoir_pressure.toFixed(2)} MPa
                        ${snap.gas_water_ratio ? ' | GWR: ' + snap.gas_water_ratio.toFixed(1) : ''}
                        ${snap.cumulative_gas ? ' | 累计气: ' + snap.cumulative_gas.toFixed(0) : ''}
                    </div>
                </div>
            `).join('');
            
            listContainer.querySelectorAll('.snapshot-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = parseInt(item.dataset.id);
                    const snap = data.find(d => d.id === id);
                    if (snap) {
                        this.loadSnapshot(snap);
                    }
                });
            });
        } catch (error) {
            console.error('加载快照失败:', error);
        }
    }
    
    loadSnapshot(snapshot) {
        this.currentState = snapshot;
        this.updateDataDisplay(snapshot);
        this.draw();
        this.drawPressureChart(snapshot.pressure_profile);
        this.drawSaturationChart(snapshot.saturation_profile);
        this.showNotification(`已加载快照 #${snapshot.id}`, 'info');
    }
    
    async stepSimulation() {
        if (!this.simulatorId || this.isPaused) return;
        
        const timeStep = parseFloat(document.getElementById('timeStep').value) * 3600;
        
        try {
            const response = await fetch(`${this.apiBase}/simulation/step`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    simulator_id: this.simulatorId,
                    time_step: timeStep
                })
            });
            this.currentState = await response.json();
            
            this.productionHistory.push({
                time: this.currentState.time,
                gas_rate: this.currentState.gas_production_rate,
                water_rate: this.currentState.water_production_rate
            });
            
            if (this.productionHistory.length > 100) {
                this.productionHistory.shift();
            }
            
            this.updateDataDisplay(this.currentState);
            
        } catch (error) {
            console.error('模拟步进失败:', error);
        }
    }
    
    updateDataDisplay(state) {
        if (!state) {
            document.getElementById('simTime').textContent = '0 天';
            document.getElementById('bottomholePressure').textContent = '- MPa';
            document.getElementById('criticalPressure').textContent = '- MPa';
            document.getElementById('avgPressure').textContent = '- MPa';
            document.getElementById('gasRate').textContent = '- m³/day';
            document.getElementById('waterRate').textContent = '- m³/day';
            document.getElementById('gasSaturation').textContent = '- %';
            document.getElementById('kGas').textContent = '- mD';
            document.getElementById('kWater').textContent = '- mD';
            document.getElementById('gasWaterRatio').textContent = '- m³/m³';
            document.getElementById('cumulativeGas').textContent = '- m³';
            document.getElementById('cumulativeWater').textContent = '- m³';
            document.getElementById('shrinkageMultiplier').textContent = '-';
            document.getElementById('wellboreDrop').textContent = '- MPa';
            document.getElementById('surfacePressure').textContent = '- MPa';
            return;
        }
        
        document.getElementById('simTime').textContent = `${(state.time / 86400).toFixed(2)} 天`;
        document.getElementById('bottomholePressure').textContent = `${state.bottomhole_pressure.toFixed(2)} MPa`;
        document.getElementById('criticalPressure').textContent = `${state.critical_desorption_pressure.toFixed(2)} MPa`;
        document.getElementById('avgPressure').textContent = `${state.average_reservoir_pressure.toFixed(2)} MPa`;
        document.getElementById('gasRate').textContent = `${state.gas_production_rate.toFixed(1)} m³/day`;
        document.getElementById('waterRate').textContent = `${state.water_production_rate.toFixed(1)} m³/day`;
        document.getElementById('gasSaturation').textContent = `${(state.gas_saturation * 100).toFixed(1)} %`;
        document.getElementById('kGas').textContent = `${state.effective_permeability_gas.toFixed(4)} mD`;
        document.getElementById('kWater').textContent = `${state.effective_permeability_water.toFixed(4)} mD`;
        document.getElementById('gasWaterRatio').textContent = state.gas_water_ratio ? 
            `${state.gas_water_ratio.toFixed(2)} m³/m³` : '- m³/m³';
        document.getElementById('cumulativeGas').textContent = state.cumulative_gas !== undefined ? 
            `${state.cumulative_gas.toFixed(1)} m³` : '- m³';
        document.getElementById('cumulativeWater').textContent = state.cumulative_water !== undefined ? 
            `${state.cumulative_water.toFixed(1)} m³` : '- m³';
        document.getElementById('shrinkageMultiplier').textContent = state.matrix_shrinkage_multiplier ? 
            state.matrix_shrinkage_multiplier.toFixed(4) : '-';
        document.getElementById('wellboreDrop').textContent = state.wellbore_pressure_loss !== undefined ? 
            `${state.wellbore_pressure_loss.toFixed(4)} MPa` : '- MPa';
        document.getElementById('surfacePressure').textContent = state.surface_flow_pressure !== undefined ? 
            `${state.surface_flow_pressure.toFixed(2)} MPa` : '- MPa';
    }
    
    updateStatus(className, text) {
        const badge = document.getElementById('statusBadge');
        badge.className = 'status-badge ' + className;
        badge.textContent = text;
    }
    
    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        
        const colors = {
            success: 'linear-gradient(135deg, #68d391 0%, #48bb78 100%)',
            error: 'linear-gradient(135deg, #fc8181 0%, #f56565 100%)',
            warning: 'linear-gradient(135deg, #f6ad55 0%, #ed8936 100%)',
            info: 'linear-gradient(135deg, #63b3ed 0%, #4299e1 100%)'
        };
        
        notification.style.background = colors[type] || colors.info;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    animate() {
        if (!this.isRunning || this.isPaused) return;
        
        const now = Date.now();
        const speed = parseFloat(document.getElementById('speed').value);
        const stepInterval = 1000 / speed;
        
        if (now - this.lastStepTime >= stepInterval) {
            this.stepSimulation();
            this.lastStepTime = now;
        }
        
        this.updateParticles();
        this.draw();
        this.drawCharts();
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    updateParticles() {
        if (!this.currentState) return;
        
        const wellX = this.canvas.width / 2;
        const coalTop = 150;
        const coalBottom = 350;
        
        while (this.gasParticles.length < 50) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 50 + Math.random() * 350;
            this.gasParticles.push({
                x: wellX + Math.cos(angle) * dist,
                y: coalTop + Math.random() * (coalBottom - coalTop),
                vx: 0,
                vy: 0,
                size: 3 + Math.random() * 4,
                opacity: 0.6 + Math.random() * 0.4
            });
        }
        
        while (this.waterParticles.length < 80) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 50 + Math.random() * 350;
            this.waterParticles.push({
                x: wellX + Math.cos(angle) * dist,
                y: coalTop + Math.random() * (coalBottom - coalTop),
                vx: 0,
                vy: 0,
                size: 4 + Math.random() * 5,
                opacity: 0.5 + Math.random() * 0.3
            });
        }
        
        const drainageRate = parseFloat(document.getElementById('drainageRate').value);
        const suctionStrength = 0.5 + drainageRate * 0.1;
        
        [...this.gasParticles, ...this.waterParticles].forEach(particle => {
            const dx = wellX - particle.x;
            const dy = (coalTop + coalBottom) / 2 - particle.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 30) {
                particle.vx += (dx / dist) * suctionStrength * 0.05;
                particle.vy += (dy / dist) * suctionStrength * 0.03;
            }
            
            particle.vx += (Math.random() - 0.5) * 0.1;
            particle.vy += (Math.random() - 0.5) * 0.1;
            
            particle.vx *= 0.98;
            particle.vy *= 0.98;
            
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            if (dist < 25) {
                const angle = Math.random() * Math.PI * 2;
                const newDist = 300 + Math.random() * 100;
                particle.x = wellX + Math.cos(angle) * newDist;
                particle.y = coalTop + Math.random() * (coalBottom - coalTop);
                particle.vx = 0;
                particle.vy = 0;
            }
            
            particle.y = Math.max(coalTop + 10, Math.min(coalBottom - 10, particle.y));
        });
    }
    
    draw() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        this.drawBackground(ctx, width, height);
        this.drawGeology(ctx, width, height);
        
        if (this.currentState && this.currentState.pressure_profile) {
            this.drawPressureFunnel(ctx, width, height);
            this.drawSaturationZone(ctx, width, height);
        }
        
        this.drawWellbore(ctx, width, height);
        this.drawParticles(ctx);
        
        if (this.currentState) {
            this.drawPressureContours(ctx, width, height);
        }
    }
    
    drawBackground(ctx, width, height) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#1a202c');
        gradient.addColorStop(0.3, '#2d3748');
        gradient.addColorStop(0.7, '#2d3748');
        gradient.addColorStop(1, '#1a202c');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < width; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
        }
        for (let i = 0; i < height; i += 50) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
            ctx.stroke();
        }
    }
    
    drawGeology(ctx, width, height) {
        const centerX = width / 2;
        
        const overburdenGradient = ctx.createLinearGradient(0, 0, 0, 150);
        overburdenGradient.addColorStop(0, '#4a5568');
        overburdenGradient.addColorStop(0.5, '#2d3748');
        overburdenGradient.addColorStop(1, '#1a202c');
        ctx.fillStyle = overburdenGradient;
        ctx.fillRect(0, 0, width, 150);
        
        this.drawRockTexture(ctx, 0, 0, width, 150, '#718096', 0.1);
        
        const coalTop = 150;
        const coalBottom = 350;
        const coalGradient = ctx.createLinearGradient(0, coalTop, 0, coalBottom);
        coalGradient.addColorStop(0, '#2d2d2d');
        coalGradient.addColorStop(0.3, '#1a1a1a');
        coalGradient.addColorStop(0.7, '#1a1a1a');
        coalGradient.addColorStop(1, '#2d2d2d');
        ctx.fillStyle = coalGradient;
        ctx.fillRect(0, coalTop, width, coalBottom - coalTop);
        
        this.drawCoalCleats(ctx, 0, coalTop, width, coalBottom - coalTop);
        
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, coalTop);
        ctx.lineTo(width, coalTop);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, coalBottom);
        ctx.lineTo(width, coalBottom);
        ctx.stroke();
        
        ctx.fillStyle = '#8b7355';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('上覆岩层', 20, 30);
        ctx.fillText('煤层', 20, coalTop + 25);
        ctx.fillText('下伏岩层', 20, coalBottom + 25);
        
        const underburdenGradient = ctx.createLinearGradient(0, coalBottom, 0, height);
        underburdenGradient.addColorStop(0, '#1a202c');
        underburdenGradient.addColorStop(0.5, '#2d3748');
        underburdenGradient.addColorStop(1, '#4a5568');
        ctx.fillStyle = underburdenGradient;
        ctx.fillRect(0, coalBottom, width, height - coalBottom);
        
        this.drawRockTexture(ctx, 0, coalBottom, width, height - coalBottom, '#718096', 0.1);
        
        const reservoirThickness = parseFloat(document.getElementById('reservoirThickness').value);
        const scaleBarLength = 100;
        const scaleBarMeters = 100;
        
        ctx.fillStyle = '#fff';
        ctx.fillRect(width - 150, height - 50, scaleBarLength, 3);
        ctx.font = '12px Arial';
        ctx.fillText(`${scaleBarMeters} m`, width - 150, height - 55);
        ctx.fillText(`煤层厚度: ${reservoirThickness} m`, width - 150, height - 30);
    }
    
    drawRockTexture(ctx, x, y, width, height, color, opacity) {
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        for (let i = 0; i < 50; i++) {
            const px = x + Math.random() * width;
            const py = y + Math.random() * height;
            const size = 2 + Math.random() * 4;
            ctx.fillRect(px, py, size, size);
        }
        ctx.globalAlpha = 1;
    }
    
    drawCoalCleats(ctx, x, y, width, height) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        
        for (let i = 0; i < 20; i++) {
            const cx = x + Math.random() * width;
            const cy = y + Math.random() * height;
            const len = 20 + Math.random() * 50;
            const angle = Math.random() * Math.PI * 2;
            
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
            ctx.stroke();
        }
    }
    
    drawPressureFunnel(ctx, width, height) {
        if (!this.currentState || !this.currentState.pressure_profile) return;
        
        const centerX = width / 2;
        const coalTop = 150;
        const coalBottom = 350;
        const coalCenterY = (coalTop + coalBottom) / 2;
        const maxRadius = 400;
        
        const profile = this.currentState.pressure_profile;
        const initialPressure = parseFloat(document.getElementById('initialPressure').value);
        const criticalPressure = this.currentState.critical_desorption_pressure;
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, coalTop, width, coalBottom - coalTop);
        ctx.clip();
        
        for (let i = profile.length - 1; i >= 0; i--) {
            const point = profile[i];
            const pressureRatio = point.pressure / initialPressure;
            const radius = (point.r / point.r) * maxRadius * (i / profile.length);
            
            const hue = 200 + pressureRatio * 60;
            const saturation = 70;
            const lightness = 30 + pressureRatio * 20;
            
            ctx.beginPath();
            ctx.ellipse(centerX, coalCenterY, radius + 5, (coalBottom - coalTop) / 2, 0, 0, Math.PI * 2);
            
            const gradient = ctx.createRadialGradient(
                centerX, coalCenterY, 0,
                centerX, coalCenterY, radius
            );
            
            if (point.pressure < criticalPressure) {
                gradient.addColorStop(0, `hsla(${hue - 60}, ${saturation}%, ${lightness + 10}%, 0.6)`);
                gradient.addColorStop(0.7, `hsla(${hue - 30}, ${saturation}%, ${lightness}%, 0.4)`);
                gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.2)`);
            } else {
                gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.5)`);
                gradient.addColorStop(0.7, `hsla(${hue + 20}, ${saturation - 10}%, ${lightness + 5}%, 0.3)`);
                gradient.addColorStop(1, `hsla(${hue + 40}, ${saturation - 20}%, ${lightness + 10}%, 0.1)`);
            }
            
            ctx.fillStyle = gradient;
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    drawSaturationZone(ctx, width, height) {
        if (!this.currentState || !this.currentState.saturation_profile) return;
        
        const centerX = width / 2;
        const coalTop = 150;
        const coalBottom = 350;
        const coalCenterY = (coalTop + coalBottom) / 2;
        const maxRadius = 400;
        
        const profile = this.currentState.saturation_profile;
        const criticalPressure = this.currentState.critical_desorption_pressure;
        const bottomholePressure = this.currentState.bottomhole_pressure;
        
        if (bottomholePressure < criticalPressure) {
            const desorptionRadiusRatio = Math.min(1, (criticalPressure - bottomholePressure) / criticalPressure);
            const desorptionRadius = maxRadius * desorptionRadiusRatio * 0.8;
            
            const gasGradient = ctx.createRadialGradient(
                centerX, coalCenterY, 0,
                centerX, coalCenterY, desorptionRadius
            );
            
            gasGradient.addColorStop(0, 'rgba(240, 147, 251, 0.3)');
            gasGradient.addColorStop(0.5, 'rgba(245, 87, 108, 0.2)');
            gasGradient.addColorStop(1, 'rgba(245, 87, 108, 0)');
            
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, coalTop, width, coalBottom - coalTop);
            ctx.clip();
            
            ctx.fillStyle = gasGradient;
            ctx.beginPath();
            ctx.ellipse(centerX, coalCenterY, desorptionRadius, (coalBottom - coalTop) / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(240, 147, 251, 0.6)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.ellipse(centerX, coalCenterY, desorptionRadius, (coalBottom - coalTop) / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.fillStyle = 'rgba(240, 147, 251, 0.8)';
            ctx.font = '12px Arial';
            ctx.fillText('解吸区', centerX + desorptionRadius - 50, coalCenterY - (coalBottom - coalTop) / 2 + 20);
            
            ctx.restore();
        }
    }
    
    drawPressureContours(ctx, width, height) {
        if (!this.currentState || !this.currentState.pressure_profile) return;
        
        const centerX = width / 2;
        const coalTop = 150;
        const coalBottom = 350;
        const coalCenterY = (coalTop + coalBottom) / 2;
        const maxRadius = 400;
        
        const profile = this.currentState.pressure_profile;
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, coalTop, width, coalBottom - coalTop);
        ctx.clip();
        
        const contourLevels = [0.9, 0.7, 0.5, 0.3, 0.1];
        const initialPressure = parseFloat(document.getElementById('initialPressure').value);
        
        contourLevels.forEach((level, idx) => {
            const targetPressure = initialPressure * level;
            let contourRadius = 0;
            
            for (let i = 0; i < profile.length - 1; i++) {
                if ((profile[i].pressure - targetPressure) * (profile[i + 1].pressure - targetPressure) <= 0) {
                    const ratio = (targetPressure - profile[i].pressure) / (profile[i + 1].pressure - profile[i].pressure);
                    contourRadius = (i + ratio) / (profile.length - 1) * maxRadius;
                    break;
                }
            }
            
            if (contourRadius > 0) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + idx * 0.1})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.ellipse(centerX, coalCenterY, contourRadius, (coalBottom - coalTop) / 2, 0, 0, Math.PI * 2);
                ctx.stroke();
                
                ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + idx * 0.1})`;
                ctx.font = '10px Arial';
                ctx.fillText(`${targetPressure.toFixed(1)} MPa`, centerX + contourRadius, coalCenterY - 5);
            }
        });
        
        ctx.restore();
    }
    
    drawWellbore(ctx, width, height) {
        const centerX = width / 2;
        const wellTop = 50;
        const wellBottom = 380;
        const wellWidth = 30;
        
        const casingGradient = ctx.createLinearGradient(centerX - wellWidth / 2, 0, centerX + wellWidth / 2, 0);
        casingGradient.addColorStop(0, '#4a5568');
        casingGradient.addColorStop(0.3, '#718096');
        casingGradient.addColorStop(0.7, '#718096');
        casingGradient.addColorStop(1, '#4a5568');
        
        ctx.fillStyle = casingGradient;
        ctx.fillRect(centerX - wellWidth / 2, wellTop, wellWidth, wellBottom - wellTop);
        
        ctx.fillStyle = '#1a202c';
        ctx.fillRect(centerX - wellWidth / 2 + 5, wellTop, wellWidth - 10, wellBottom - wellTop);
        
        const coalTop = 150;
        const coalBottom = 350;
        
        ctx.fillStyle = '#00d9ff';
        ctx.fillRect(centerX - wellWidth / 2 + 8, coalTop + 10, wellWidth - 16, coalBottom - coalTop - 20);
        
        ctx.fillStyle = '#ed8936';
        ctx.font = 'bold 11px Arial';
        ctx.fillText('套管', centerX + wellWidth / 2 + 5, wellTop + 20);
        ctx.fillText('油管', centerX + wellWidth / 2 + 5, coalTop + 30);
        
        ctx.fillStyle = '#4a5568';
        ctx.fillRect(centerX - wellWidth / 2 - 10, wellTop - 15, wellWidth + 20, 15);
        ctx.fillStyle = '#2d3748';
        ctx.fillRect(centerX - wellWidth / 2 - 5, wellTop - 10, wellWidth + 10, 5);
        
        if (this.isRunning && !this.isPaused) {
            const time = Date.now() / 1000;
            const flowY = wellBottom - 20 - ((time * 50) % (wellBottom - coalTop));
            
            ctx.fillStyle = 'rgba(79, 172, 254, 0.6)';
            for (let i = 0; i < 5; i++) {
                const bubbleY = flowY - i * 30;
                if (bubbleY > coalTop + 20) {
                    ctx.beginPath();
                    ctx.arc(centerX, bubbleY, 3 + Math.random() * 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            
            if (this.currentState && this.currentState.bottomhole_pressure < this.currentState.critical_desorption_pressure) {
                const gasFlowY = wellBottom - 20 - ((time * 80) % (wellBottom - coalTop));
                ctx.fillStyle = 'rgba(240, 147, 251, 0.8)';
                for (let i = 0; i < 8; i++) {
                    const bubbleY = gasFlowY - i * 25;
                    if (bubbleY > coalTop + 20) {
                        ctx.beginPath();
                        ctx.arc(centerX + (Math.random() - 0.5) * 10, bubbleY, 2 + Math.random() * 3, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }
        
        const flowArrowY = coalTop + (coalBottom - coalTop) / 2;
        ctx.fillStyle = '#00d9ff';
        ctx.beginPath();
        ctx.moveTo(centerX - 15, flowArrowY - 10);
        ctx.lineTo(centerX, flowArrowY - 20);
        ctx.lineTo(centerX + 15, flowArrowY - 10);
        ctx.lineTo(centerX + 8, flowArrowY - 10);
        ctx.lineTo(centerX + 8, flowArrowY + 10);
        ctx.lineTo(centerX - 8, flowArrowY + 10);
        ctx.lineTo(centerX - 8, flowArrowY - 10);
        ctx.closePath();
        ctx.fill();
    }
    
    drawParticles(ctx) {
        this.waterParticles.forEach(particle => {
            const gradient = ctx.createRadialGradient(
                particle.x, particle.y, 0,
                particle.x, particle.y, particle.size
            );
            gradient.addColorStop(0, `rgba(79, 172, 254, ${particle.opacity})`);
            gradient.addColorStop(1, `rgba(0, 242, 254, 0)`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        });
        
        this.gasParticles.forEach(particle => {
            const gradient = ctx.createRadialGradient(
                particle.x, particle.y, 0,
                particle.x, particle.y, particle.size
            );
            gradient.addColorStop(0, `rgba(240, 147, 251, ${particle.opacity})`);
            gradient.addColorStop(1, `rgba(245, 87, 108, 0)`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    drawInitialScene() {
        this.draw();
        this.drawPressureChart(null);
        this.drawSaturationChart(null);
        this.drawProductionChart();
    }
    
    drawCharts() {
        if (this.currentState) {
            this.drawPressureChart(this.currentState.pressure_profile);
            this.drawSaturationChart(this.currentState.saturation_profile);
            this.drawProductionChart();
        }
    }
    
    drawPressureChart(profile) {
        const ctx = this.pressureCtx;
        const width = this.pressureCanvas.width;
        const height = this.pressureCanvas.height;
        const padding = { top: 20, right: 20, bottom: 30, left: 50 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        ctx.clearRect(0, 0, width, height);
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
        }
        
        for (let i = 0; i <= 5; i++) {
            const x = padding.left + (chartWidth / 5) * i;
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, height - padding.bottom);
            ctx.stroke();
        }
        
        ctx.fillStyle = '#a0aec0';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        for (let i = 0; i <= 5; i++) {
            const x = padding.left + (chartWidth / 5) * i;
            const distance = (i / 5 * 500).toFixed(0);
            ctx.fillText(`${distance}m`, x, height - padding.bottom + 15);
        }
        
        ctx.textAlign = 'right';
        const initialPressure = parseFloat(document.getElementById('initialPressure').value);
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            const pressure = (initialPressure - (i / 5) * initialPressure).toFixed(1);
            ctx.fillText(`${pressure}`, padding.left - 5, y + 4);
        }
        
        ctx.fillStyle = '#a0aec0';
        ctx.font = '10px Arial';
        ctx.save();
        ctx.translate(12, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('压力 (MPa)', 0, 0);
        ctx.restore();
        
        if (!profile || profile.length === 0) return;
        
        const maxR = profile[profile.length - 1].r;
        const maxP = initialPressure;
        const minP = 0;
        
        ctx.beginPath();
        ctx.strokeStyle = '#00d9ff';
        ctx.lineWidth = 2;
        
        profile.forEach((point, i) => {
            const x = padding.left + (point.r / maxR) * chartWidth;
            const y = padding.top + ((maxP - point.pressure) / (maxP - minP)) * chartHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
        gradient.addColorStop(0, 'rgba(0, 217, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 217, 255, 0)');
        
        ctx.lineTo(padding.left + chartWidth, height - padding.bottom);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
        
        if (this.currentState) {
            const criticalP = this.currentState.critical_desorption_pressure;
            const criticalY = padding.top + ((maxP - criticalP) / (maxP - minP)) * chartHeight;
            
            ctx.strokeStyle = 'rgba(240, 147, 251, 0.8)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.moveTo(padding.left, criticalY);
            ctx.lineTo(width - padding.right, criticalY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.fillStyle = 'rgba(240, 147, 251, 0.8)';
            ctx.font = '10px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`P_cd: ${criticalP.toFixed(2)} MPa`, padding.left + 5, criticalY - 5);
        }
    }
    
    drawSaturationChart(profile) {
        const ctx = this.saturationCtx;
        const width = this.saturationCanvas.width;
        const height = this.saturationCanvas.height;
        const padding = { top: 20, right: 20, bottom: 30, left: 50 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        ctx.clearRect(0, 0, width, height);
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
        }
        
        for (let i = 0; i <= 5; i++) {
            const x = padding.left + (chartWidth / 5) * i;
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, height - padding.bottom);
            ctx.stroke();
        }
        
        ctx.fillStyle = '#a0aec0';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        for (let i = 0; i <= 5; i++) {
            const x = padding.left + (chartWidth / 5) * i;
            const distance = (i / 5 * 500).toFixed(0);
            ctx.fillText(`${distance}m`, x, height - padding.bottom + 15);
        }
        
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            const saturation = (100 - i * 20).toFixed(0);
            ctx.fillText(`${saturation}%`, padding.left - 5, y + 4);
        }
        
        ctx.fillStyle = '#a0aec0';
        ctx.font = '10px Arial';
        ctx.save();
        ctx.translate(12, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('饱和度 (%)', 0, 0);
        ctx.restore();
        
        if (!profile || profile.length === 0) return;
        
        const maxR = profile[profile.length - 1].r;
        
        ctx.beginPath();
        ctx.strokeStyle = '#f093fb';
        ctx.lineWidth = 2;
        
        profile.forEach((point, i) => {
            const x = padding.left + (point.r / maxR) * chartWidth;
            const y = padding.top + (1 - point.gas_saturation) * chartHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        let prevX = 0, prevY = 0;
        profile.forEach((point, i) => {
            const x = padding.left + (point.r / maxR) * chartWidth;
            const y = padding.top + (1 - point.gas_saturation) * chartHeight;
            if (i > 0) {
                ctx.fillStyle = `rgba(240, 147, 251, ${0.3 - 0.3 * point.gas_saturation})`;
                ctx.beginPath();
                ctx.moveTo(prevX, prevY);
                ctx.lineTo(x, y);
                ctx.lineTo(x, height - padding.bottom);
                ctx.lineTo(prevX, height - padding.bottom);
                ctx.closePath();
                ctx.fill();
            }
            prevX = x;
            prevY = y;
        });
        
        ctx.beginPath();
        ctx.strokeStyle = '#4facfe';
        ctx.lineWidth = 2;
        
        profile.forEach((point, i) => {
            const x = padding.left + (point.r / maxR) * chartWidth;
            const y = padding.top + (1 - point.water_saturation) * chartHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        ctx.fillStyle = '#f093fb';
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('● 气相', padding.left + 10, padding.top + 15);
        ctx.fillStyle = '#4facfe';
        ctx.fillText('● 水相', padding.left + 80, padding.top + 15);
    }
    
    drawProductionChart() {
        const ctx = this.productionCtx;
        const width = this.productionCanvas.width;
        const height = this.productionCanvas.height;
        const padding = { top: 20, right: 20, bottom: 30, left: 60 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        ctx.clearRect(0, 0, width, height);
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
        }
        
        for (let i = 0; i <= 5; i++) {
            const x = padding.left + (chartWidth / 5) * i;
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, height - padding.bottom);
            ctx.stroke();
        }
        
        ctx.fillStyle = '#a0aec0';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        for (let i = 0; i <= 5; i++) {
            const x = padding.left + (chartWidth / 5) * i;
            const days = this.productionHistory.length > 0 
                ? ((i / 5) * this.productionHistory[this.productionHistory.length - 1].time / 86400).toFixed(1)
                : (i * 2).toFixed(0);
            ctx.fillText(`${days}d`, x, height - padding.bottom + 15);
        }
        
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            const value = ((5 - i) * 20).toFixed(0);
            ctx.fillText(`${value}`, padding.left - 5, y + 4);
        }
        
        ctx.fillStyle = '#a0aec0';
        ctx.font = '10px Arial';
        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('产量 (m³/d)', 0, 0);
        ctx.restore();
        
        if (this.productionHistory.length < 2) return;
        
        const maxTime = this.productionHistory[this.productionHistory.length - 1].time;
        const maxRate = Math.max(
            ...this.productionHistory.map(h => h.gas_rate),
            ...this.productionHistory.map(h => h.water_rate),
            1
        );
        
        ctx.beginPath();
        ctx.strokeStyle = '#f093fb';
        ctx.lineWidth = 2;
        
        this.productionHistory.forEach((point, i) => {
            const x = padding.left + (point.time / maxTime) * chartWidth;
            const y = padding.top + (1 - point.gas_rate / maxRate) * chartHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        ctx.beginPath();
        ctx.strokeStyle = '#4facfe';
        ctx.lineWidth = 2;
        
        this.productionHistory.forEach((point, i) => {
            const x = padding.left + (point.time / maxTime) * chartWidth;
            const y = padding.top + (1 - point.water_rate / maxRate) * chartHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        ctx.fillStyle = '#f093fb';
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('● 产气', padding.left + 10, padding.top + 15);
        ctx.fillStyle = '#4facfe';
        ctx.fillText('● 产水', padding.left + 80, padding.top + 15);
    }
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => {
    window.simulator = new CBM_Simulator();
    initPWA();
});

let deferredPrompt = null;
let isPWAInstalled = false;

function initPWA() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', async () => {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js', {
                    scope: '/'
                });
                console.log('[PWA] ServiceWorker 注册成功:', registration.scope);
                
                registration.addEventListener('updatefound', () => {
                    console.log('[PWA] 发现新版本，正在更新...');
                    const newWorker = registration.installing;
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed') {
                            if (navigator.serviceWorker.controller) {
                                console.log('[PWA] 新版本已就绪，请刷新页面');
                                showUpdateNotification();
                            }
                        }
                    });
                });
                
                setInterval(() => {
                    registration.update();
                }, 3600000);
                
            } catch (error) {
                console.log('[PWA] ServiceWorker 注册失败:', error);
            }
        });
    }
    
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        console.log('[PWA] 可以安装应用');
        showInstallPromotion();
    });
    
    window.addEventListener('appinstalled', (e) => {
        e.preventDefault();
        isPWAInstalled = true;
        deferredPrompt = null;
        console.log('[PWA] 应用已安装');
        hideInstallPromotion();
        showInstallSuccess();
    });
    
    if (window.matchMedia('(display-mode: standalone)').matches) {
        console.log('[PWA] 以独立模式运行');
        isPWAInstalled = true;
    }
    
    window.addEventListener('online', () => {
        console.log('[PWA] 网络已连接');
        updateOnlineStatus(true);
    });
    
    window.addEventListener('offline', () => {
        console.log('[PWA] 网络已断开');
        updateOnlineStatus(false);
    });
}

function showInstallPromotion() {
    let installBtn = document.getElementById('pwaInstallBtn');
    if (!installBtn) {
        installBtn = document.createElement('button');
        installBtn.id = 'pwaInstallBtn';
        installBtn.innerHTML = '📱 安装应用';
        installBtn.className = 'pwa-install-btn';
        installBtn.onclick = installPWA;
        installBtn.title = '安装到桌面，离线使用';
        
        const header = document.querySelector('header h1');
        if (header && header.parentNode) {
            const container = document.createElement('div');
            container.style.cssText = 'display: flex; align-items: center; gap: 15px;';
            header.parentNode.insertBefore(container, header);
            container.appendChild(header);
            container.appendChild(installBtn);
        }
    }
    installBtn.style.display = 'inline-flex';
}

function hideInstallPromotion() {
    const installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) {
        installBtn.style.display = 'none';
    }
}

async function installPWA() {
    if (!deferredPrompt) {
        return;
    }
    
    try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            console.log('[PWA] 用户接受安装');
        } else {
            console.log('[PWA] 用户拒绝安装');
        }
    } catch (error) {
        console.log('[PWA] 安装失败:', error);
    }
}

function showInstallSuccess() {
    const toast = document.createElement('div');
    toast.className = 'pwa-toast success';
    toast.innerHTML = '✓ 应用已安装到桌面！';
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showUpdateNotification() {
    const toast = document.createElement('div');
    toast.className = 'pwa-toast update';
    toast.innerHTML = '🔄 有新版本可用 <button onclick="location.reload()">刷新</button>';
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
}

function updateOnlineStatus(isOnline) {
    const indicator = document.getElementById('onlineStatus') || createOnlineIndicator();
    
    if (isOnline) {
        indicator.className = 'online-indicator online';
        indicator.title = '在线';
    } else {
        indicator.className = 'online-indicator offline';
        indicator.title = '离线';
    }
}

function createOnlineIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'onlineStatus';
    indicator.className = 'online-indicator online';
    indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        z-index: 9999;
        transition: all 0.3s;
    `;
    document.body.appendChild(indicator);
    return indicator;
}
