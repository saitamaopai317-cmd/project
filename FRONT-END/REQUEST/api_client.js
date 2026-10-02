let activeState = { heroes: {}, threat_level: 0 };
let liveSignals = []; 
let selectedHeroes = []; 
let selectedIncidentId = null;
let isAnimating = false; 
let gameLoop;
let heroChartInstance = null;

// --- MAP CAMERA STATE ---
let currentZoom = 1;
let panX = 0, panY = 0;
let isDragging = false;
let startX, startY, startPanX, startPanY;
let controlsInitialized = false;

// --- PROCEDURAL CITY ---
let staticCityHTML = '<div id="wireframe-layer" style="width:100%; height:100%; position:absolute; top:0; left:0; z-index:2; opacity:0; transition: opacity 0.1s linear;">';
for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
        if (Math.random() > 0.25) { 
            const w = 4 + Math.random() * 3; 
            const h = 4 + Math.random() * 3; 
            const x = col * 6.5 + (Math.random() * 2);
            const y = row * 6.5 + (Math.random() * 2);
            const isComplex = Math.random() > 0.85 ? 'wf-complex' : '';
            staticCityHTML += `<div class="wf-bldg ${isComplex}" style="left:${x}%; top:${y}%; width:${w}%; height:${h}%;"></div>`;
        }
    }
}
staticCityHTML += '</div>';

function initMapControls() {
    if(controlsInitialized) return;
    const viewport = document.querySelector('.map-viewport');
    if(!viewport) return;
    
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? -0.25 : 0.25;
        currentZoom = Math.max(1, Math.min(currentZoom + zoomDelta, 4));
        updateMapTransform();
    });

    viewport.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX; startY = e.clientY;
        startPanX = panX; startPanY = panY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = viewport.getBoundingClientRect();
        const dx = ((e.clientX - startX) / rect.width * 100) / currentZoom;
        const dy = ((e.clientY - startY) / rect.height * 100) / currentZoom;
        panX = startPanX + dx;
        panY = startPanY + dy;
        updateMapTransform();
    });

    window.addEventListener('mouseup', () => { isDragging = false; });
    controlsInitialized = true;
}

function updateMapTransform() {
    const mapGrid = document.getElementById('map-grid');
    if(mapGrid) {
        mapGrid.style.transform = `scale(${currentZoom}) translate(${panX}%, ${panY}%)`;
        mapGrid.style.transition = isDragging ? 'none' : 'transform 0.3s ease-out';
        const wfLayer = document.getElementById('wireframe-layer');
        if(wfLayer) wfLayer.style.opacity = Math.min(1, Math.max(0, (currentZoom - 1.5) / 1.5));
    }
}

// --- LIVE DATABASE RADAR ---
async function scanForSignals() {
    if (isAnimating) return; 
    try {
        const sigRes = await fetch('/BACKEND/CODE_PHP/get_signals.php');
        const sigData = await sigRes.json();
        
        const heroRes = await fetch('/BACKEND/CODE_PHP/get_heroes.php');
        const heroData = await heroRes.json();

        if (sigData.success && heroData.success) {
            liveSignals = sigData.data;
            activeState.threat_level = Math.min(liveSignals.length * 15, 100); 
            activeState.heroes = heroData.heroes; 
            
            if (selectedIncidentId && !liveSignals.find(s => String(s.id) === selectedIncidentId)) {
                zoomOut();
            } else {
                renderMap(); renderRoster(); validateAction();
            }
            checkGameOver();
            if (selectedHeroes.length > 0) updateHeroStatsUI();
        }
    } catch (err) {}
}

window.purgeSector = function() {
    fetch('/BACKEND/CODE_PHP/clear_signals.php', { headers: { 'X-SDN-Auth': 'SFXC-BlackOps-2026-Alpha' } })
    .then(res => res.json()).then(data => { if (data.success) { liveSignals = []; zoomOut(); renderMap(); } });
}

// --- CLICK HANDLERS (WITH CIVILIAN AUTO-SELECT) ---
window.selectPing = function(incidentId, e) {
    if (isAnimating) return;
    if (e) e.stopPropagation();
    
    selectedIncidentId = String(incidentId);
    const sig = liveSignals.find(s => String(s.id) === selectedIncidentId);
    if (!sig) return;
    
    const xPos = (sig.id * 27) % 80 + 10;
    const yPos = (sig.id * 19) % 80 + 10;
    currentZoom = 3;
    panX = 50 - xPos; panY = 50 - yPos;
    
    const unzoomBtn = document.getElementById('btn-unzoom');
    if (unzoomBtn) unzoomBtn.style.display = 'block';

    if (sig.requested_heroes) {
        const reqList = sig.requested_heroes.split(',').filter(id => activeState.heroes[id]);
        if (reqList.length > 0) {
            selectedHeroes = reqList;
            renderRoster(); 
        }
    }
    
    renderMap(); validateAction(); updateMapTransform();
}

window.zoomOut = function() {
    if (isAnimating) return;
    selectedIncidentId = null;
    currentZoom = 1; panX = 0; panY = 0;
    
    const unzoomBtn = document.getElementById('btn-unzoom');
    if (unzoomBtn) unzoomBtn.style.display = 'none';
    
    const actionBar = document.getElementById('action-bar');
    if (actionBar) actionBar.style.display = 'none';
    
    renderMap(); updateMapTransform();
}

document.addEventListener('DOMContentLoaded', () => {
    const viewport = document.querySelector('.map-viewport');
    if (viewport) {
        viewport.addEventListener('click', (e) => {
            if (e.target.classList.contains('emergency-ping')) return;
            if (!isDragging && currentZoom > 1) zoomOut();
        });
    }
    // Bind Enter key for Dispatch Chat
    const dispatchInput = document.getElementById('dispatch-chat-input');
    if(dispatchInput) {
        dispatchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendDispatchChat();
        });
    }
});

// --- AUTH & SETUP ---
async function submitLogin() {
    const passwordInput = document.getElementById('terminal-pass');
    const errorDisplay = document.getElementById('login-error');
    if (!passwordInput.value) return;
    errorDisplay.innerText = "AUTHENTICATING...";

    try {
        const res = await fetch('/BACKEND/CODE_PHP/auth.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: passwordInput.value })
        });
        const data = await res.json();

        if (data.success) {
            sessionStorage.setItem('sdn_token', data.token);
            sessionStorage.setItem('sdn_role', data.role);
            errorDisplay.style.color = "var(--teal)"; 
            errorDisplay.innerText = data.message;
            
            setTimeout(() => {
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('app-screen').style.display = 'flex';
                generateNewMap();
            }, 600);
        } else {
            errorDisplay.style.color = "var(--pin-danger)"; errorDisplay.innerText = data.message;
        }
    } catch (err) {}
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-container').forEach(view => view.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(`view-${tabId}`).classList.add('active');
}

function startGameLoop() {
    if (gameLoop) clearInterval(gameLoop);
    gameLoop = setInterval(() => {
        scanForSignals();
        fetchDispatchChat(); // Poll the admin channel!
    }, 3000);
    scanForSignals();
    fetchDispatchChat();
    initMapControls();
}

async function generateNewMap() {
    if (isAnimating) return;
    try {
        selectedHeroes = []; zoomOut();
        document.getElementById('game-over').style.display = 'none';
        startGameLoop();  
    } catch (err) {}
}

function checkGameOver() {
    if (activeState.threat_level >= 100) {
        document.getElementById('game-over').style.display = 'block';
        if (currentZoom === 1) zoomOut(); 
    }
}

// --- DYNAMIC DISPATCH LOGIC ---
async function executeDispatch() {
    if (selectedHeroes.length === 0 || !selectedIncidentId || isAnimating) return;
    
    isAnimating = true; 
    document.getElementById('action-bar').style.display = 'none';
    
    const sig = liveSignals.find(s => String(s.id) === selectedIncidentId);
    if (!sig) { isAnimating = false; return; }
    
    const isVillain = sig.signal_type === 'villain';
    const targetX = (sig.id * 27) % 80 + 10;
    const targetY = (sig.id * 19) % 80 + 10;

    selectedHeroes.forEach((id, index) => {
        const heroWrapper = document.getElementById(`hero-pin-${id}`);
        if(heroWrapper) {
            heroWrapper.style.left = `calc(${targetX}% + ${index === 1 ? 2 : 0}%)`;
            heroWrapper.style.top = `calc(${targetY}% + ${index === 1 ? -2 : 0}%)`;
        }
    });

    setTimeout(async () => {
        const fxDiv = document.createElement('div');
        fxDiv.style.position = "absolute";
        fxDiv.style.left = `${targetX}%`; fxDiv.style.top = `${targetY}%`;
        
        if (isVillain) {
            fxDiv.innerText = '💥'; fxDiv.style.fontSize = '30px'; 
            selectedHeroes.forEach(id => {
                const el = document.getElementById(`hero-pin-${id}`);
                if(el) el.style.transform += ' rotate(15deg)'; 
            });
        } else {
            fxDiv.innerText = '➕'; fxDiv.style.color = "#4caf50"; fxDiv.style.fontSize = '24px';
        }

        if(currentZoom > 1.5) fxDiv.style.transform = 'translate(-50%, -50%) scale(0.33)';
        document.getElementById('map-grid').appendChild(fxDiv);
        
        setTimeout(() => fxDiv.remove(), 1200); 

        setTimeout(async () => {
            try {
                await fetch('/BACKEND/CODE_PHP/clear_signals.php?id=' + selectedIncidentId, { headers: { 'X-SDN-Auth': 'SFXC-BlackOps-2026-Alpha' } }); 
                
                selectedHeroes.forEach(id => {
                    const el = document.getElementById(`hero-pin-${id}`);
                    if(el) el.style.transform = el.style.transform.replace(' rotate(15deg)', '');
                });

                const bubble = document.createElement('div');
                bubble.className = `speech-bubble`;
                bubble.innerText = isVillain ? "Villain neutralized! Area secure." : "Civilians safe! Medical rendered.";
                bubble.style.left = `${targetX}%`; bubble.style.top = `${targetY - 6}%`; 
                if(currentZoom > 1.5) bubble.style.transform = 'translate(-50%, -100%) scale(0.33)';
                document.getElementById('map-grid').appendChild(bubble); 

                const actionType = isVillain ? 'threat_neutralized' : 'civilian_saved';
                const logMessage = isVillain ? 'Neutralized hostile target in sector.' : 'Medical aid rendered; civilian secured.';
                
                await Promise.all(selectedHeroes.map(async heroId => {
                    const h = activeState.heroes[heroId];
                    if (h) await logHeroAction(heroId, h.name, actionType, logMessage);
                }));
                
                isAnimating = false; 
                await scanForSignals(); 
                updateHeroStatsUI();

                setTimeout(() => { bubble.remove(); zoomOut(); }, 3000); 
            } catch (err) { isAnimating = false; }
        }, 1500);
    }, 600); 
}

// --- RENDER MAP & UI WITH AI ADVISORY ---
function renderMap() {
    const mapGrid = document.getElementById('map-grid');
    if (!mapGrid) return;
    
    const threatLevel = activeState.threat_level || 0;
    const threatColor = threatLevel > 70 ? 'red' : 'var(--pin-danger)';
    
    let mapHTML = `<div class="highway-main"></div><div class="highway-cross"></div><div class="rotonda"></div>${staticCityHTML}`;

    liveSignals.forEach(sig => {
        const xPos = (sig.id * 27) % 80 + 10;
        const yPos = (sig.id * 19) % 80 + 10;
        const isSelected = selectedIncidentId === String(sig.id);
        const isVillain = sig.signal_type === 'villain';
        const pinColor = isVillain ? '#fbc02d' : 'var(--pin-danger)';
        const pulseEffect = isSelected ? `box-shadow: 0 0 20px white, 0 0 40px white;` : `box-shadow: 0 0 15px ${pinColor};`;
        const icon = isVillain ? '⚠️' : '🆘';
        const typeLabel = isVillain ? 'VILLAIN THREAT' : 'MEDICAL SOS';

        mapHTML += `<div class="emergency-ping live-db-ping" style="left: ${xPos}%; top: ${yPos}%; background: ${pinColor}; ${pulseEffect}" onclick="selectPing('${sig.id}', event)" title="[${typeLabel}] ${sig.civilian_name}"></div>`;

        if (isSelected) {
            let aiAdvisoryHTML = '';
            if (sig.requested_heroes) {
                const reqNames = sig.requested_heroes.split(',').map(id => activeState.heroes[id] ? activeState.heroes[id].name : id).join(' & ');
                aiAdvisoryHTML = `
                    <div style="background: rgba(30,185,166,0.15); border: 1px dashed var(--teal); padding: 8px; margin-top: 12px; font-size: 10px; color: var(--teal); text-align: left; border-radius: 4px;">
                        <strong style="color:#fff;">🤖 CIVILIAN AI ADVISORY:</strong><br><span style="color:#d0ebe5;">Recommended Response:</span><br><span style="color:#ffeb3b; font-weight:bold; font-size: 12px;">[ ${reqNames} ]</span>
                    </div>`;
            }

            mapHTML += `
                <div class="target-block" style="left: ${xPos}%; top: ${yPos}%; width: 60px; height: 60px;">
                    <div class="incident-details" style="min-width: 220px;">
                        <div style="font-size: 2.5rem; margin-bottom:-5px;">${icon}</div>
                        <div style="color:white; font-size:12px; font-weight:bold; margin-top:10px; border-bottom:1px solid #e29e3e; padding-bottom:5px;">${sig.civilian_name.toUpperCase()}</div>
                        <div class="req-skill-text" style="margin-top:8px; font-size:10px;">${typeLabel}</div>
                        ${aiAdvisoryHTML}
                    </div>
                </div>`;
        }
    });

    if (activeState.heroes) {
        Object.values(activeState.heroes).forEach(hero => {
            const heroTransform = (currentZoom > 1.5) ? 'translate(-50%,-50%) scale(0.33)' : 'translate(-50%,-50%) scale(1)';
            mapHTML += `<div id="hero-pin-${hero.id}" class="hero-pin ${hero.status}" style="position:absolute; left: ${hero.x}%; top: ${hero.y}%; transform:${heroTransform}; transition: 0.8s;">${hero.name.charAt(0)}</div>`;
        });
    }

    mapGrid.innerHTML = mapHTML;
    const threatBarFill = document.getElementById('threat-bar-fill');
    const threatTitleText = document.getElementById('threat-title-text');
    if (threatBarFill) { threatBarFill.style.width = `${threatLevel}%`; threatBarFill.style.background = threatColor; }
    if (threatTitleText) { threatTitleText.innerText = `CITY THREAT LEVEL: ${threatLevel}%`; }
}

function renderRoster() {
    const roster = document.getElementById('roster');
    if (!roster) return;
    roster.innerHTML = '';
    if(!activeState.heroes) return;

    Object.values(activeState.heroes).forEach(hero => {
        const card = document.createElement('div');
        const isSelected = selectedHeroes.includes(hero.id);
        card.className = `roster-card ${isSelected ? 'selected' : ''}`;
        card.innerHTML = `<div class="status-bar status-${hero.status}">${hero.status}</div><div class="portrait">👤 <div class="skill-tag">${hero.skill}</div></div><div class="name-plate">${hero.name}</div>`;
        card.onclick = () => { 
            if (isAnimating) return;
            const index = selectedHeroes.indexOf(hero.id);
            if (index > -1) selectedHeroes.splice(index, 1);
            else {
                if (selectedHeroes.length < 2) selectedHeroes.push(hero.id); 
                else { selectedHeroes.shift(); selectedHeroes.push(hero.id); }
            }
            renderRoster(); validateAction(); updateCommsUI(); updateHeroStatsUI();
        };
        roster.appendChild(card);
    });
}

function validateAction() {
    const bar = document.getElementById('action-bar');
    const textNode = document.getElementById('action-text');
    const btn = document.getElementById('deploy-btn');
    
    // Look for or create the Decommission Button
    let decomBtn = document.getElementById('decom-btn');
    if (!decomBtn) {
        decomBtn = document.createElement('button');
        decomBtn.id = 'decom-btn';
        decomBtn.innerText = '[ DECOMMISSION ]';
        decomBtn.style.cssText = 'background: #000; color: var(--danger); border: 1px dashed var(--danger); padding: 8px 15px; font-family: inherit; font-weight: bold; cursor: pointer; transition: 0.2s; margin-left: 15px;';
        decomBtn.onclick = decommissionHero;
        bar.appendChild(decomBtn);
    }
    
    // If a hero is selected (but NO ping is clicked), show the Action Bar just for Decommissioning
    if (selectedHeroes.length > 0 && !selectedIncidentId) {
        bar.style.display = 'flex';
        const squadNames = selectedHeroes.map(id => activeState.heroes[id].name).join(" & ");
        textNode.innerHTML = `<span style="color:#aaa;">SELECTED: [${squadNames}] - AWAITING ORDERS</span>`;
        if(btn) btn.style.display = 'none'; // Hide Deploy button
        decomBtn.style.display = 'block'; // Show Decommission button
        return;
    }

    // Standard Dispatch Logic (If a hero AND a ping are selected)
    if (selectedHeroes.length > 0 && selectedIncidentId) {
        const sig = liveSignals.find(s => String(s.id) === selectedIncidentId);
        const allAvailable = selectedHeroes.every(id => activeState.heroes[id].status === "RESTING");
        
        if (allAvailable && sig) {
            bar.style.display = 'flex';
            const squadNames = selectedHeroes.map(id => activeState.heroes[id].name).join(" & ");
            const typeLabel = sig.signal_type === 'villain' ? 'NEUTRALIZE' : 'SECURE';
            const isAiMatch = sig.requested_heroes && (selectedHeroes.slice().sort().join(',') === sig.requested_heroes.split(',').sort().join(','));
            
            if (isAiMatch) { textNode.innerHTML = `<span style="color:#ffeb3b;">[AI ADVISORY MATCH]</span> DEPLOY [${squadNames}] TO ${typeLabel}: ${sig.civilian_name.toUpperCase()}`; } 
            else { textNode.innerText = `DEPLOY [${squadNames}] TO ${typeLabel}: ${sig.civilian_name.toUpperCase()}`; }
            
            textNode.style.color = "white";
            if(btn) { 
                btn.style.display = 'block'; 
                btn.disabled = false; btn.style.opacity = "1"; btn.style.cursor = "pointer"; 
            }
            decomBtn.style.display = 'block'; 
        } else { bar.style.display = 'none'; }
    } else { 
        bar.style.display = 'none'; 
    }
}

// --- HERO STATS RADAR & LOGS ---
function updateHeroStatsUI() {
    const panel = document.getElementById('hero-stats-panel');
    if (!panel) return;

    if (selectedHeroes.length > 0) {
        const heroId = selectedHeroes[0];
        const hero = activeState.heroes[heroId];
        if (hero) {
            panel.style.display = 'flex';
            renderHeroStats(hero);
            return;
        }
    }
    panel.style.display = 'none';
}

function renderHeroStats(hero) {
    const canvas = document.getElementById('heroStatRadar');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (heroChartInstance) heroChartInstance.destroy();

    const combat = hero.stat_combat !== undefined ? parseInt(hero.stat_combat) : 65;
    const defense = hero.stat_defense !== undefined ? parseInt(hero.stat_defense) : 50;
    const agility = hero.stat_agility !== undefined ? parseInt(hero.stat_agility) : 70;
    const comms = hero.stat_comms !== undefined ? parseInt(hero.stat_comms) : 45;
    const intel = hero.stat_intel !== undefined ? parseInt(hero.stat_intel) : 60;

    heroChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Combat', 'Defense', 'Agility', 'Comms', 'Intel'],
            datasets: [{
                label: hero.name, data: [combat, defense, agility, comms, intel],
                backgroundColor: 'rgba(218, 165, 32, 0.45)', borderColor: '#daa520',
                pointBackgroundColor: '#ffcc00', pointBorderColor: '#ffffff', borderWidth: 2, pointRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { r: { min: 0, max: 100, angleLines: { color: 'rgba(255, 255, 255, 0.15)' }, grid: { color: 'rgba(255, 255, 255, 0.12)', circular: false }, pointLabels: { color: '#e6dfd1', font: { family: "'SysFont', monospace", size: 10, weight: 'bold' } }, ticks: { display: false, stepSize: 20 } } },
            plugins: { legend: { display: false } }
        }
    });
}

async function logHeroAction(heroId, heroName, actionType, logMessage) {}

// --- COMMS & AI CHATBOT LOGIC ---
function updateCommsUI() {
    const inputBox = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-btn');
    if (selectedHeroes.length > 0) {
        const win = document.getElementById('chat-window');
        const squadNames = selectedHeroes.map(id => activeState.heroes[id].name).join(" & ");
        if (inputBox) { inputBox.disabled = false; inputBox.placeholder = "Type tactical command here..."; }
        if (sendBtn) sendBtn.disabled = false;
        if (win.innerHTML === '') { win.innerHTML = `<div class="msg sys">SECURE TEAM CHANNEL OPEN: ${squadNames}</div>`; } 
        else { win.innerHTML += `<div class="msg sys">CHANNEL SWITCHED: ${squadNames}</div>`; }
        win.scrollTop = win.scrollHeight;
    } else {
        document.getElementById('chat-window').innerHTML = `<div class="msg sys">SELECT AGENTS TO ESTABLISH LINK</div>`;
        if (inputBox) { inputBox.disabled = true; inputBox.placeholder = "Select a hero on the roster first..."; }
        if (sendBtn) sendBtn.disabled = true;
    }
}

async function sendChat() {
    const input = document.getElementById('chat-input');
    const win = document.getElementById('chat-window');
    const message = input.value.trim();
    if (!message || selectedHeroes.length === 0) return; 

    const heroId = selectedHeroes[0];
    const hero = activeState.heroes[heroId];

    win.innerHTML += `<div class="msg tx">${message}</div>`;
    input.value = ''; win.scrollTop = win.scrollHeight;

    const typingId = 'typing-' + Date.now();
    win.innerHTML += `<div id="${typingId}" class="msg rx" style="opacity:0.5;">${hero.name} is transmitting...</div>`;
    win.scrollTop = win.scrollHeight;

    try {
        const res = await fetch('/BACKEND/CODE_PHP/chat.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message, hero_name: hero.name, hero_skill: hero.skill, active_threats: liveSignals.length }) });
        const data = await res.json();
        document.getElementById(typingId)?.remove();
        if (data.reply) { win.innerHTML += `<div class="msg rx" style="border-left: 3px solid #1eb9a6;"><strong>[${hero.name}]</strong>: ${data.reply}</div>`; } 
        else { throw new Error("No AI reply"); }
        win.scrollTop = win.scrollHeight;
    } catch (err) {
        document.getElementById(typingId)?.remove();
        win.innerHTML += `<div class="msg rx" style="border-left: 3px solid #1eb9a6;"><strong>[${hero.name}]</strong>: Message received, Dispatch. Holding position.</div>`;
        win.scrollTop = win.scrollHeight;
    }
}

// --- ADMIN ↔ DISPATCHER LIVE CHAT LOGIC ---
async function fetchDispatchChat() {
    try {
        const res = await fetch('/BACKEND/CODE_PHP/chat_admin.php');
        const data = await res.json();
        if (data.success) {
            const win = document.getElementById('dispatch-chat-window');
            if (!win) return;
            let html = '';
            data.messages.forEach(msg => {
                const isMe = msg.sender === 'DISPATCHER';
                const css = isMe ? 'tx' : 'rx';
                const border = isMe ? 'border-right: 3px solid #ffeb3b;' : 'border-left: 3px solid var(--pin-danger);';
                const bg = isMe ? '#333311' : '#3a1f1f';
                html += `<div class="msg ${css}" style="${border} background: ${bg};"><strong>[${msg.sender}]</strong>: ${msg.message}</div>`;
            });
            if (win.innerHTML !== html) {
                win.innerHTML = html;
                win.scrollTop = win.scrollHeight;
            }
        }
    } catch(e){}
}

async function sendDispatchChat() {
    const input = document.getElementById('dispatch-chat-input');
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    
    try {
        await fetch('/BACKEND/CODE_PHP/chat_admin.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: 'DISPATCHER', message: message })
        });
        fetchDispatchChat();
    } catch(e){}
}

// --- HERO DECOMMISSION (DELETE) LOGIC ---
async function decommissionHero() {
    if (selectedHeroes.length === 0) return;
    
    // Grab the first selected hero
    const heroId = selectedHeroes[0];
    const heroName = activeState.heroes[heroId].name;

    // Double-check before deleting to prevent accidents!
    if (!confirm(`WARNING: Are you sure you want to permanently decommission ${heroName} and remove them from the database?`)) {
        return;
    }

    try {
        const res = await fetch('/BACKEND/CODE_PHP/delete_hero.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-SDN-Auth': 'SFXC-BlackOps-2026-Alpha' },
            body: JSON.stringify({ hero_id: heroId })
        });
        
        const data = await res.json();
        
        if (data.success) {
            // Remove them from the selected array so the UI resets
            selectedHeroes = [];
            // Immediately scan the database to update the map and roster
            scanForSignals();
            updateHeroStatsUI();
            updateCommsUI();
            
            // Hide the decommission button and action bar
            const decomBtn = document.getElementById('decom-btn');
            if (decomBtn) decomBtn.style.display = 'none';
            const bar = document.getElementById('action-bar');
            if (bar) bar.style.display = 'none';
        } else {
            alert("DECOMMISSION FAILED: " + data.error);
        }
    } catch (e) {
        alert("TRANSMISSION ERROR: Could not reach MariaDB.");
    }
}