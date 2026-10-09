let activeState = { heroes: {}, threat_level: 0 };
let liveSignals = []; 
let selectedHeroes = []; 
let selectedIncidentId = null;
let isAnimating = false; 
let gameLoop;
let heroChartInstance = null;
let activeChatHeroId = null;

// --- MAP CAMERA STATE ---
let currentZoom = 1;
let panX = 0, panY = 0;
let isDragging = false;
let startX, startY, startPanX, startPanY;
let controlsInitialized = false;

// --- PROCEDURAL CITY ---
let staticCityHTML = '<div id="wireframe-layer" style="width:100%; height:100%; position:absolute; top:0; left:0; z-index:2; opacity:0.85; transition: opacity 0.2s linear;">';
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

const availableStreetNames = [
    'Mission Street',
    'Harbor Avenue',
    'Beacon Boulevard',
    'Cedar Street',
    'Market Road',
    'Foundry Way',
    'Summit Avenue',
    'Riverfront Drive'
];
const streetNames = [];
while (streetNames.length < 2) {
    const randomIndex = Math.floor(Math.random() * availableStreetNames.length);
    streetNames.push(availableStreetNames.splice(randomIndex, 1)[0]);
}

function updateBuildingVisibility() {
    const wireframeLayer = document.getElementById('wireframe-layer');
    if (!wireframeLayer) return;
    const zoomProgress = (currentZoom - 1) / 3;
    wireframeLayer.style.opacity = String(0.12 + zoomProgress * 0.88);
}

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
        updateBuildingVisibility();
    }
}

// --- RADAR NETWORK BROADCAST & AUDIO ---
const radarNetworkChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('sdn_emergency_network') : null;

function playRadarSonarSound() {
    try {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioClass) return;
        const ctx = new AudioClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1100, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
    } catch (e) {}
}

if (radarNetworkChannel) {
    radarNetworkChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'NEW_SIGNAL' && event.data.signal) {
            const sig = event.data.signal;
            const existingIdx = liveSignals.findIndex(s => 
                String(s.id) === String(sig.id) || 
                (s.civilian_name && s.civilian_name === sig.civilian_name && s.signal_type === sig.signal_type)
            );
            if (existingIdx !== -1) {
                liveSignals[existingIdx] = sig;
            } else {
                liveSignals.unshift(sig);
                playRadarSonarSound();
            }
            activeState.threat_level = Math.min(liveSignals.length * 15, 100);
            renderMap();
        } else if (event.data && event.data.type === 'REMOVE_SIGNAL') {
            const targetId = event.data.id ? String(event.data.id) : null;
            const targetCiv = event.data.civilian_name;
            const targetType = event.data.signal_type;
            liveSignals = liveSignals.filter(s => {
                if (targetId && String(s.id) === targetId) return false;
                if (targetCiv && s.civilian_name === targetCiv && s.signal_type === targetType) return false;
                return true;
            });
            activeState.threat_level = Math.min(liveSignals.length * 15, 100);
            if (targetId && selectedIncidentId === targetId) {
                selectedIncidentId = null;
                zoomOut();
            } else {
                renderMap();
            }
        } else if (event.data && event.data.type === 'CLEAR_SIGNALS') {
            liveSignals = [];
            activeState.threat_level = 0;
            zoomOut();
            renderMap();
        }
    };
}

window.addEventListener('storage', (e) => {
    if (e.key === 'sdn_local_signals') {
        scanForSignals();
    }
});

function getCandidateEndpoints(file) {
    const list = [
        `../../BACKEND/CODE_PHP/${file}`,
        `../BACKEND/CODE_PHP/${file}`,
        `/BACKEND/CODE_PHP/${file}`
    ];
    const pathParts = window.location.pathname.split('/');
    const projIdx = pathParts.findIndex(p => p.toLowerCase().includes('project'));
    if (projIdx !== -1) {
        list.unshift(pathParts.slice(0, projIdx + 1).join('/') + `/BACKEND/CODE_PHP/${file}`);
    }
    return list;
}

const fallbackDefaultHeroes = {
    '1': { id: 1, name: 'FLAMBAE', skill: 'elemental', element: 'fire', status: 'RESTING', stat_combat: 85, stat_defense: 50, stat_agility: 75, stat_comms: 60, stat_intel: 65, deeds_logged: 0, x: 50, y: 80 },
    '2': { id: 2, name: 'AEGIS', skill: 'brawler', status: 'RESTING', stat_combat: 70, stat_defense: 90, stat_agility: 55, stat_comms: 50, stat_intel: 60, deeds_logged: 0, x: 30, y: 75 },
    '3': { id: 3, name: 'ATLAS', skill: 'brawler', status: 'RESTING', stat_combat: 80, stat_defense: 85, stat_agility: 60, stat_comms: 45, stat_intel: 55, deeds_logged: 0, x: 80, y: 80 },
    '4': { id: 4, name: 'ROS AN', skill: 'tech', status: 'RESTING', stat_combat: 50, stat_defense: 60, stat_agility: 70, stat_comms: 90, stat_intel: 95, deeds_logged: 0, x: 20, y: 65 },
    '5': { id: 5, name: 'SONAR', skill: 'tech', status: 'RESTING', stat_combat: 60, stat_defense: 65, stat_agility: 80, stat_comms: 85, stat_intel: 85, deeds_logged: 0, x: 65, y: 70 }
};

// --- LIVE DATABASE RADAR ---
async function scanForSignals() {
    if (isAnimating) return; 
    let sigData = null;
    let heroData = null;

    // 1. Fetch live signals across candidate endpoints
    for (const url of getCandidateEndpoints('get_signals.php')) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1800);
            const res = await fetch(url + '?t=' + Date.now(), { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                if (data && data.success) {
                    sigData = data;
                    break;
                }
            }
        } catch (e) {}
    }

    // 2. Fetch hero roster across candidate endpoints
    for (const url of getCandidateEndpoints('get_heroes.php')) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1800);
            const res = await fetch(url + '?t=' + Date.now(), { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                if (data && data.success) {
                    heroData = data;
                    break;
                }
            }
        } catch (e) {}
    }

    // Combine database signals with local storage signals (for offline or instantaneous cross-tab pings)
    let combinedSignals = (sigData && sigData.data) ? [...sigData.data] : [];
    try {
        const localSigs = JSON.parse(localStorage.getItem('sdn_local_signals') || '[]');
        localSigs.forEach(localSig => {
            const alreadyExists = combinedSignals.some(s => 
                String(s.id) === String(localSig.id) || 
                (s.civilian_name && s.civilian_name === localSig.civilian_name && s.signal_type === localSig.signal_type)
            );
            if (!alreadyExists) {
                combinedSignals.unshift(localSig);
            }
        });
    } catch(e) {}

    // Strict deduplication pass: eliminate any duplicate IDs or duplicate beacons
    const uniqueSignals = [];
    const seenIds = new Set();
    const seenEntities = new Set();
    for (const s of combinedSignals) {
        const idKey = String(s.id);
        const entityKey = `${s.civilian_name || ''}__${s.signal_type || ''}`;
        if (!seenIds.has(idKey) && !seenEntities.has(entityKey)) {
            seenIds.add(idKey);
            seenEntities.add(entityKey);
            uniqueSignals.push(s);
        }
    }

    liveSignals = uniqueSignals;
    activeState.threat_level = Math.min(liveSignals.length * 15, 100);

    if (heroData && heroData.heroes && Object.keys(heroData.heroes).length > 0) {
        activeState.heroes = heroData.heroes;
    } else if (!activeState.heroes || Object.keys(activeState.heroes).length === 0) {
        activeState.heroes = fallbackDefaultHeroes;
    }

    if (selectedIncidentId && !liveSignals.find(s => String(s.id) === selectedIncidentId)) {
        zoomOut();
    } else {
        renderMap(); renderRoster(); validateAction();
    }
    checkGameOver();
    if (selectedHeroes.length > 0) updateHeroStatsUI();
}

window.purgeSector = function() {
    localStorage.removeItem('sdn_local_signals');
    if (radarNetworkChannel) {
        try { radarNetworkChannel.postMessage({ type: 'CLEAR_SIGNALS' }); } catch(e) {}
    }

    for (const url of getCandidateEndpoints('clear_signals.php')) {
        fetch(url, { headers: { 'X-SDN-Auth': 'SFXC-BlackOps-2026-Alpha' } })
            .catch(() => {});
    }

    liveSignals = [];
    activeState.threat_level = 0;
    zoomOut();
    renderMap();
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
        const reqList = sig.requested_heroes.split(',')
            .map(s => s.trim())
            .filter(id => activeState.heroes && (activeState.heroes[id] || activeState.heroes[String(id)]));
        if (reqList.length > 0) {
            selectedHeroes = reqList.map(String);
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

window.launchApp = function() {
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app-screen');
    if (loginScreen) loginScreen.style.display = 'none';
    if (appScreen) {
        appScreen.style.display = 'flex';
        appScreen.style.flexDirection = 'column';
    }
    generateNewMap();
};

document.addEventListener('DOMContentLoaded', () => {
    // Restore the app only for a session that was authenticated successfully.
    if (sessionStorage.getItem('sdn_token')) {
        window.launchApp();
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            submitLogin();
        });
    }

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
    const workerIdInput = document.getElementById('worker-id');
    const errorDisplay = document.getElementById('login-error');
    const pass = passwordInput ? passwordInput.value.trim() : '';
    const workerId = workerIdInput ? workerIdInput.value.trim() : '';
    if (!pass) {
        if (errorDisplay) {
            errorDisplay.style.color = "var(--pin-danger)";
            errorDisplay.innerText = "ENTER SECURITY KEY";
        }
        return;
    }
    if (workerIdInput && !workerId) {
        if (errorDisplay) {
            errorDisplay.style.color = "var(--pin-danger)";
            errorDisplay.innerText = "ENTER WORKER ID";
        }
        return;
    }

    if (errorDisplay) {
        errorDisplay.style.color = "var(--teal)";
        errorDisplay.innerText = "AUTHENTICATING...";
    }

    try {
        const res = await fetch('/BACKEND/CODE_PHP/auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass, worker_id: workerId })
        });
        const data = await res.json();

        if (data.success) {
            sessionStorage.setItem('sdn_token', data.token);
            sessionStorage.setItem('sdn_role', data.role);
            if (errorDisplay) {
                errorDisplay.style.color = "var(--teal)"; 
                errorDisplay.innerText = data.message;
            }
            if (data.role === 'admin') {
                window.alert('Welcome Dispatcher');
            }
            setTimeout(() => {
                window.launchApp();
            }, 300);
        } else {
            if (errorDisplay) {
                errorDisplay.style.color = "var(--pin-danger)"; 
                errorDisplay.innerText = data.message || "ACCESS DENIED";
            }
        }
    } catch (err) {
        console.error("Authentication request failed:", err);
        if (errorDisplay) {
            errorDisplay.style.color = "var(--pin-danger)";
            errorDisplay.innerText = "AUTHENTICATION SERVICE UNAVAILABLE";
        }
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-container').forEach(view => view.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(`view-${tabId}`).classList.add('active');
    updateHeroStatsUI();
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

    const sig = liveSignals.find(s => String(s.id) === selectedIncidentId);
    if (!sig || isRainBlockedSquad()) {
        validateAction();
        return;
    }

    isAnimating = true;
    document.getElementById('action-bar').style.display = 'none';
    
    const isVillain = sig.signal_type === 'villain';
    const targetX = (sig.id * 27) % 80 + 10;
    const targetY = (sig.id * 19) % 80 + 10;
    const dispatchedHeroIds = selectedHeroes.map(String);
    const dispatchLocation = sig.location || sig.civilian_name || `Incident ${sig.id}`;

    dispatchedHeroIds.forEach(heroId => {
        const hero = activeState.heroes?.[heroId];
        if (!hero) return;
        const acknowledgement = `Copy, Dispatch. I’m responding to ${dispatchLocation}. Standing by for updates.`;
        const history = loadHeroConversation(heroId);
        const entry = { role: 'assistant', content: acknowledgement };
        history.push(entry);
        saveHeroConversation(heroId, history);
        if (heroId === activeChatHeroId) {
            renderHeroChatEntry(document.getElementById('chat-window'), entry, hero.name);
        }
    });

    dispatchedHeroIds.forEach((id, index) => {
        const heroWrapper = document.getElementById(`hero-pin-${id}`);
        if(heroWrapper) {
            heroWrapper.style.transition = 'left 3.5s ease-in-out, top 3.5s ease-in-out';
            heroWrapper.classList.add('responding');
            heroWrapper.style.left = `calc(${targetX}% + ${index === 1 ? 2 : 0}%)`;
            heroWrapper.style.top = `calc(${targetY}% + ${index === 1 ? -2 : 0}%)`;
        }
    });

    if (!isVillain && radarNetworkChannel) {
        try {
            const heroes = dispatchedHeroIds
                .map(heroId => activeState.heroes?.[heroId]?.name)
                .filter(Boolean);
            radarNetworkChannel.postMessage({
                type: 'RESCUE_DISPATCHED',
                civilian_name: sig.civilian_name,
                signal_type: sig.signal_type,
                location: dispatchLocation,
                heroes
            });
        } catch (err) {
            console.error('Could not notify the civilian app about the rescue dispatch:', err);
        }
    }

    setTimeout(async () => {
        dispatchedHeroIds.forEach(id => {
            const heroWrapper = document.getElementById(`hero-pin-${id}`);
            if (heroWrapper) {
                heroWrapper.classList.remove('responding');
                heroWrapper.style.transition = 'left 0.8s ease, top 0.8s ease';
            }
        });
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
            const targetIncidentId = String(selectedIncidentId);
            try {
                // 1. Immediately remove beacon from liveSignals in-memory
                liveSignals = liveSignals.filter(s => 
                    String(s.id) !== targetIncidentId && 
                    !(sig && s.civilian_name === sig.civilian_name && s.signal_type === sig.signal_type)
                );
                activeState.threat_level = Math.min(liveSignals.length * 15, 100);

                // 2. Remove beacon from LocalStorage so background sync does not resurrect it
                try {
                    let localSigs = JSON.parse(localStorage.getItem('sdn_local_signals') || '[]');
                    localSigs = localSigs.filter(s => 
                        String(s.id) !== targetIncidentId && 
                        !(sig && s.civilian_name === sig.civilian_name && s.signal_type === sig.signal_type)
                    );
                    localStorage.setItem('sdn_local_signals', JSON.stringify(localSigs));
                } catch(e) {}

                // 3. Broadcast removal across open tabs via BroadcastChannel
                if (radarNetworkChannel) {
                    try {
                        radarNetworkChannel.postMessage({ 
                            type: 'REMOVE_SIGNAL', 
                            id: targetIncidentId,
                            civilian_name: sig ? sig.civilian_name : null,
                            signal_type: sig ? sig.signal_type : null
                        });
                    } catch(e) {}
                }

                // 4. Clear signal record in backend database across candidate endpoints
                for (const url of getCandidateEndpoints('clear_signals.php')) {
                    try {
                        await fetch(url + '?id=' + encodeURIComponent(targetIncidentId), {
                            headers: { 'X-SDN-Auth': 'SFXC-BlackOps-2026-Alpha' }
                        });
                    } catch(e) {}
                }
                
                selectedHeroes.forEach(id => {
                    const el = document.getElementById(`hero-pin-${id}`);
                    if(el) el.style.transform = el.style.transform.replace(' rotate(15deg)', '');
                });

                // Update heroes stats & status
                selectedHeroes.forEach(heroId => {
                    if (activeState.heroes && activeState.heroes[heroId]) {
                        activeState.heroes[heroId].status = 'RESTING';
                        activeState.heroes[heroId].deeds_logged = (activeState.heroes[heroId].deeds_logged || 0) + 1;
                        if (isVillain) {
                            activeState.heroes[heroId].stat_combat = (activeState.heroes[heroId].stat_combat || 65) + 3;
                        } else {
                            activeState.heroes[heroId].stat_defense = (activeState.heroes[heroId].stat_defense || 50) + 2;
                            activeState.heroes[heroId].stat_agility = (activeState.heroes[heroId].stat_agility || 70) + 2;
                        }
                    }
                });

                const bubble = document.createElement('div');
                bubble.className = `speech-bubble`;
                bubble.innerText = isVillain ? "Villain neutralized! Threat beacon deactivated." : "Civilians secured! SOS beacon cleared.";
                bubble.style.left = `${targetX}%`; bubble.style.top = `${targetY - 6}%`; 
                if(currentZoom > 1.5) bubble.style.transform = 'translate(-50%, -100%) scale(0.33)';
                document.getElementById('map-grid').appendChild(bubble); 

                const actionType = isVillain ? 'threat_neutralized' : 'civilian_saved';
                const logMessage = isVillain ? 'Neutralized hostile target in sector.' : 'Medical aid rendered; civilian secured.';
                
                await Promise.all(selectedHeroes.map(async heroId => {
                    const h = activeState.heroes[heroId];
                    if (h) await logHeroAction(heroId, h.name, actionType, logMessage);
                }));

                // Immediately update map to reflect removed beacon
                renderMap();
                renderRoster();
                updateHeroStatsUI();
                
                setTimeout(() => {
                    bubble.remove();
                    isAnimating = false;
                    zoomOut();
                    scanForSignals();
                }, 2200);
            } catch (err) {
                isAnimating = false;
            }
        }, 1500);
    }, 3500);
}

// --- RENDER MAP & UI WITH AI ADVISORY ---
function renderMap() {
    const mapGrid = document.getElementById('map-grid');
    if (!mapGrid) return;
    
    const threatLevel = activeState.threat_level || 0;
    const threatColor = threatLevel > 70 ? 'red' : 'var(--pin-danger)';
    
    let mapHTML = `<div class="highway-main"><span class="street-name">${streetNames[0]}</span></div><div class="highway-cross"><span class="street-name">${streetNames[1]}</span></div><div class="rotonda"></div>${staticCityHTML}`;

    liveSignals.forEach(sig => {
        const incidentId = String(sig.id ?? '');
        if (!/^\d+$/.test(incidentId)) return;
        const xPos = (sig.id * 27) % 80 + 10;
        const yPos = (sig.id * 19) % 80 + 10;
        const isSelected = selectedIncidentId === incidentId;
        const isVillain = sig.signal_type === 'villain';
        const pinColor = isVillain ? '#fbc02d' : 'var(--pin-danger)';
        const pulseEffect = isSelected ? `box-shadow: 0 0 20px white, 0 0 40px white;` : `box-shadow: 0 0 15px ${pinColor};`;
        const icon = isVillain ? '[THR]' : '[SOS]';
        const typeLabel = isVillain ? 'VILLAIN THREAT' : 'MEDICAL SOS';
        const safeName = escapeHtml(sig.civilian_name || 'Unknown caller');
        const safeLocation = escapeHtml(sig.location || 'Location not provided');
        const safeReceivedAt = escapeHtml(sig.created_at || 'Time unavailable');

        mapHTML += `<div class="emergency-ping live-db-ping" style="left: ${xPos}%; top: ${yPos}%; background: ${pinColor}; ${pulseEffect}" onclick="selectPing('${incidentId}', event)" title="[${typeLabel}] ${safeName}"></div>`;

        if (isSelected) {
            let aiAdvisoryHTML = '';
            if (sig.requested_heroes) {
                const reqNames = escapeHtml(sig.requested_heroes.split(',').map(id => activeState.heroes[id] ? activeState.heroes[id].name : id).join(' & '));
                aiAdvisoryHTML = `
                    <div style="background: rgba(30,185,166,0.15); border: 1px dashed var(--teal); padding: 8px; margin-top: 12px; font-size: 10px; color: var(--teal); text-align: left; border-radius: 4px;">
                        <strong style="color:#fff;">🤖 CIVILIAN AI ADVISORY:</strong><br><span style="color:#d0ebe5;">Recommended Response:</span><br><span style="color:#ffeb3b; font-weight:bold; font-size: 12px;">[ ${reqNames} ]</span>
                    </div>`;
            }

            mapHTML += `
                <div class="target-block" style="left: ${xPos}%; top: ${yPos}%; width: 60px; height: 60px;">
                    <div class="incident-details" style="min-width: 220px;">
                        <div style="font-size: 2.5rem; margin-bottom:-5px;">${icon}</div>
                        <div style="color:white; font-size:12px; font-weight:bold; margin-top:10px; border-bottom:1px solid #e29e3e; padding-bottom:5px;">${safeName.toUpperCase()}</div>
                        <div class="req-skill-text" style="margin-top:8px; font-size:10px;">${typeLabel}</div>
                        <div style="margin-top:8px; font-size:10px; color:#ddd;">LOCATION: ${safeLocation}</div>
                        <div style="margin-top:5px; font-size:9px; color:#aaa;">RECEIVED: ${safeReceivedAt} // REF: ${incidentId}</div>
                        ${aiAdvisoryHTML}
                    </div>
                </div>`;
        }
    });

    if (activeState.heroes) {
        Object.values(activeState.heroes).forEach(hero => {
            const heroTransform = (currentZoom > 1.5) ? 'translate(-50%,-50%) scale(0.33)' : 'translate(-50%,-50%) scale(1)';
            const isHeroSelected = selectedHeroes.some(id => String(id) === String(hero.id));
            const glowStyle = isHeroSelected ? 'box-shadow: 0 0 16px #ffeb3b, 0 0 28px #ffeb3b; border-color: #ffeb3b;' : '';
            mapHTML += `<div id="hero-pin-${hero.id}" class="hero-pin ${hero.status}" style="position:absolute; left: ${hero.x}%; top: ${hero.y}%; transform:${heroTransform}; transition: 0.8s; cursor: pointer; ${glowStyle}" onclick="selectHeroPin('${hero.id}', event)" title="[${(hero.skill || 'TECH').toUpperCase()}] ${hero.name}">${hero.name.charAt(0)}</div>`;
        });
    }

    mapGrid.innerHTML = mapHTML;
    updateBuildingVisibility();
    const threatBarFill = document.getElementById('threat-bar-fill');
    const threatTitleText = document.getElementById('threat-title-text');
    if (threatBarFill) { threatBarFill.style.width = `${threatLevel}%`; threatBarFill.style.background = threatColor; }
    if (threatTitleText) { threatTitleText.innerText = `CITY THREAT LEVEL: ${threatLevel}%`; }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

window.selectHeroPin = function(heroId, e) {
    if (isAnimating) return;
    if (e) e.stopPropagation();
    const strId = String(heroId);
    const index = selectedHeroes.findIndex(id => String(id) === strId);
    if (index > -1) {
        selectedHeroes.splice(index, 1);
    } else {
        if (selectedHeroes.length < 2) selectedHeroes.push(strId);
        else { selectedHeroes.shift(); selectedHeroes.push(strId); }
    }
    renderRoster();
    renderMap();
    validateAction();
    updateCommsUI();
    updateHeroStatsUI();
};

function renderRoster() {
    const roster = document.getElementById('roster');
    if (!roster) return;
    roster.innerHTML = '';
    if (!activeState.heroes) return;

    Object.values(activeState.heroes).forEach(hero => {
        const card = document.createElement('div');
        const strId = String(hero.id);
        const isSelected = selectedHeroes.some(id => String(id) === strId);
        card.className = `roster-card ${isSelected ? 'selected' : ''}`;
        card.setAttribute('data-hero-id', strId);
        const heroClass = String(hero.skill || 'tech').toUpperCase();
        const heroElement = getHeroElement(hero);
        const specialty = heroElement ? `${heroClass} / ${heroElement.toUpperCase()}` : heroClass;
        card.innerHTML = `<div class="status-bar status-${hero.status}">${hero.status}</div><div class="portrait">👤 <div class="skill-tag">${specialty}</div></div><div class="name-plate">${hero.name}</div>`;
        card.onclick = () => { 
            if (isAnimating) return;
            const index = selectedHeroes.findIndex(id => String(id) === strId);
            if (index > -1) selectedHeroes.splice(index, 1);
            else {
                if (selectedHeroes.length < 2) selectedHeroes.push(strId); 
                else { selectedHeroes.shift(); selectedHeroes.push(strId); }
            }
            renderRoster();
            renderMap();
            validateAction();
            updateCommsUI();
            updateHeroStatsUI();
        };
        roster.appendChild(card);
    });
}

function validateAction() {
    const bar = document.getElementById('action-bar');
    const textNode = document.getElementById('action-text');
    const btn = document.getElementById('deploy-btn');
    if (!bar || !textNode) return;

    const getHero = (id) => activeState.heroes ? (activeState.heroes[id] || activeState.heroes[String(id)] || null) : null;

    // Prune any selected hero IDs that no longer exist in state
    selectedHeroes = selectedHeroes.filter(id => !!getHero(id));
    
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
        const squadNames = selectedHeroes.map(id => getHero(id)?.name || `AGENT-${id}`).join(" & ");
        textNode.innerHTML = `<span style="color:#aaa;">SELECTED: [${squadNames}] - AWAITING ORDERS</span>`;
        if (btn) btn.style.display = 'none';
        decomBtn.style.display = 'block';
        return;
    }

    // Standard Dispatch Logic (If a hero AND a ping are selected)
    if (selectedHeroes.length > 0 && selectedIncidentId) {
        const sig = liveSignals.find(s => String(s.id) === selectedIncidentId);
        const allAvailable = selectedHeroes.every(id => {
            const h = getHero(id);
            return h && h.status === "RESTING";
        });
        
        if (allAvailable && sig) {
            bar.style.display = 'flex';
            const squadNames = selectedHeroes.map(id => getHero(id)?.name || `AGENT-${id}`).join(" & ");
            if (isRainBlockedSquad()) {
                textNode.innerText = `RAIN LOCKOUT: ${squadNames} cannot deploy while rain or storms are active.`;
                textNode.style.color = "#9ecbff";
                if (btn) {
                    btn.style.display = 'block';
                    btn.disabled = true;
                    btn.style.opacity = "0.5";
                    btn.style.cursor = "not-allowed";
                }
                decomBtn.style.display = 'block';
                return;
            }

            const typeLabel = sig.signal_type === 'villain' ? 'NEUTRALIZE' : 'SECURE';
            const reqArray = (sig.requested_heroes || '').split(',').map(s => s.trim()).filter(Boolean).sort();
            const curArray = selectedHeroes.slice().map(String).sort();
            const isAiMatch = reqArray.length > 0 && (curArray.join(',') === reqArray.join(','));
            
            if (isAiMatch) { textNode.innerHTML = `<span style="color:#ffeb3b;">[AI ADVISORY MATCH]</span> DEPLOY [${squadNames}] TO ${typeLabel}: ${sig.civilian_name.toUpperCase()}`; } 
            else { textNode.innerText = `DEPLOY [${squadNames}] TO ${typeLabel}: ${sig.civilian_name.toUpperCase()}`; }
            
            textNode.style.color = "white";
            if (btn) { 
                btn.style.display = 'block'; 
                btn.disabled = false; btn.style.opacity = "1"; btn.style.cursor = "pointer"; 
            }
            decomBtn.style.display = 'block'; 
        } else { bar.style.display = 'none'; }
    } else { 
        bar.style.display = 'none'; 
    }
}

function isRainBlockedSquad() {
    if (!window.isRaining) return false;
    return selectedHeroes.some(id => {
        const hero = activeState.heroes ? (activeState.heroes[id] || activeState.heroes[String(id)]) : null;
        return getHeroElement(hero) === 'fire';
    });
}

function getHeroElement(hero) {
    if (String(hero?.skill || '').toLowerCase() !== 'elemental') return '';
    const element = String(hero?.element || '').toLowerCase();
    if (['fire', 'ice', 'water', 'energy'].includes(element)) return element;
    return String(hero?.name || '').toUpperCase() === 'FLAMBAE' ? 'fire' : 'energy';
}

// --- HERO STATS RADAR & LOGS ---
function updateHeroStatsUI() {
    const panel = document.getElementById('hero-stats-panel');
    if (!panel) return;

    const mapView = document.getElementById('view-map');
    if (!mapView || !mapView.classList.contains('active')) {
        panel.style.display = 'none';
        return;
    }

    if (selectedHeroes.length > 0) {
        const heroId = selectedHeroes[0];
        const hero = activeState.heroes ? (activeState.heroes[heroId] || activeState.heroes[String(heroId)]) : null;
        if (hero) {
            panel.style.display = 'flex';
            const title = document.getElementById('hero-stats-title');
            if (title) title.innerText = `[ TACTICAL DOSSIER // ${hero.name} ]`;
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

    const element = getHeroElement(hero);
    const rainActive = Boolean(window.isRaining);
    const baseCombat = hero.stat_combat !== undefined ? parseInt(hero.stat_combat) : 65;
    const rainBoost = rainActive && (element === 'ice' || element === 'water')
        ? Math.min(20, Math.max(0, 100 - baseCombat))
        : 0;
    const weatherEffect = document.getElementById('hero-weather-effect');
    if (weatherEffect) {
        if (element && rainActive && element === 'fire') {
            weatherEffect.innerText = `ELEMENT: FIRE // RAIN LOCKOUT`;
            weatherEffect.style.color = '#9ecbff';
        } else if (element && rainBoost) {
            weatherEffect.innerText = `ELEMENT: ${element.toUpperCase()} // RAIN BOOST: +${rainBoost} COMBAT`;
            weatherEffect.style.color = '#71e4d2';
        } else if (element) {
            weatherEffect.innerText = `ELEMENT: ${element.toUpperCase()} // NO WEATHER MODIFIER`;
            weatherEffect.style.color = '#ddd';
        } else {
            weatherEffect.innerText = `CLASS: ${String(hero.skill || 'tech').toUpperCase()}`;
            weatherEffect.style.color = '#ddd';
        }
    }
    const combat = Math.min(100, baseCombat + rainBoost);
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
    const win = document.getElementById('chat-window');
    const getHero = (id) => activeState.heroes ? (activeState.heroes[id] || activeState.heroes[String(id)] || null) : null;
    
    if (selectedHeroes.length > 0 && win) {
        const heroId = String(selectedHeroes[0]);
        const hero = getHero(heroId);
        const squadNames = selectedHeroes.map(id => getHero(id)?.name || `AGENT-${id}`).join(" & ");
        if (inputBox) { inputBox.disabled = false; inputBox.placeholder = "Type tactical command here..."; }
        if (sendBtn) sendBtn.disabled = false;
        if (activeChatHeroId !== heroId) {
            activeChatHeroId = heroId;
            const history = loadHeroConversation(heroId);
            win.replaceChildren();
            if (history.length === 0) {
                const opening = document.createElement('div');
                opening.className = 'msg sys';
                opening.textContent = `SECURE TEAM CHANNEL OPEN: ${squadNames}`;
                win.appendChild(opening);
            } else {
                history.forEach(entry => renderHeroChatEntry(win, entry, hero?.name || 'HERO'));
            }
        }
        win.scrollTop = win.scrollHeight;
    } else {
        activeChatHeroId = null;
        if (win) {
            win.replaceChildren();
            const prompt = document.createElement('div');
            prompt.className = 'msg sys';
            prompt.textContent = 'SELECT AGENTS TO ESTABLISH LINK';
            win.appendChild(prompt);
        }
        if (inputBox) { inputBox.disabled = true; inputBox.placeholder = "Select a hero on the roster first..."; }
        if (sendBtn) sendBtn.disabled = true;
    }
}

function loadHeroConversation(heroId) {
    try {
        const stored = JSON.parse(sessionStorage.getItem(`sdn_hero_chat_${heroId}`) || '[]');
        if (!Array.isArray(stored)) return [];
        return stored.filter(entry =>
            entry && ['user', 'assistant'].includes(entry.role) &&
            typeof entry.content === 'string' && entry.content.length <= 2000
        ).slice(-10);
    } catch (error) {
        console.warn('Could not load this hero conversation from session storage.', error);
        return [];
    }
}

function saveHeroConversation(heroId, history) {
    try {
        sessionStorage.setItem(`sdn_hero_chat_${heroId}`, JSON.stringify(history.slice(-10)));
    } catch (error) {
        console.warn('Could not save this hero conversation to session storage.', error);
    }
}

function renderHeroChatEntry(container, entry, heroName) {
    const message = document.createElement('div');
    message.className = entry.role === 'user' ? 'msg tx' : 'msg rx';
    if (entry.role === 'assistant') {
        const label = document.createElement('strong');
        label.textContent = `[${heroName}]: `;
        message.appendChild(label);
    }
    message.appendChild(document.createTextNode(entry.content));
    container.appendChild(message);
}

async function sendChat() {
    const input = document.getElementById('chat-input');
    const win = document.getElementById('chat-window');
    const message = input.value.trim();
    if (!message || selectedHeroes.length === 0) return; 

    const heroId = String(selectedHeroes[0]);
    const hero = activeState.heroes ? (activeState.heroes[heroId] || activeState.heroes[String(heroId)]) : null;
    if (!hero) return;

    const history = loadHeroConversation(heroId);
    const priorHistory = history.slice(-10);
    history.push({ role: 'user', content: message });
    saveHeroConversation(heroId, history);
    renderHeroChatEntry(win, { role: 'user', content: message }, hero.name);
    input.value = ''; win.scrollTop = win.scrollHeight;

    const typingMessage = document.createElement('div');
    typingMessage.className = 'msg rx';
    typingMessage.style.opacity = '0.5';
    typingMessage.textContent = `${hero.name} is transmitting...`;
    win.appendChild(typingMessage);
    win.scrollTop = win.scrollHeight;

    try {
        const res = await fetch('/BACKEND/CODE_PHP/hero_channel.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                history: priorHistory,
                hero_name: hero.name,
                hero_skill: hero.skill,
                active_threats: liveSignals.length
            })
        });
        const responseText = await res.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            console.error('Hero Channel returned a non-JSON response.', {
                status: res.status,
                contentType: res.headers.get('content-type')
            });
            throw new Error(`Hero Channel endpoint returned a non-JSON response (HTTP ${res.status}). Check that hero_channel.php is uploaded to BACKEND/CODE_PHP and PHP is enabled.`);
        }
        typingMessage.remove();
        if (!res.ok || !data || typeof data.reply !== 'string' || !data.reply.trim()) {
            throw new Error(data?.error || 'No AI reply was received.');
        }
        const assistantEntry = { role: 'assistant', content: data.reply };
        history.push(assistantEntry);
        saveHeroConversation(heroId, history);
        renderHeroChatEntry(win, assistantEntry, hero.name);
        win.scrollTop = win.scrollHeight;
    } catch (err) {
        typingMessage.remove();
        const errorMessage = document.createElement('div');
        errorMessage.className = 'msg sys';
        errorMessage.textContent = err.message || 'Hero Channel connection failed. Please try again.';
        win.appendChild(errorMessage);
        win.scrollTop = win.scrollHeight;
    }
}

// --- ADMIN ↔ DISPATCHER LIVE CHAT LOGIC ---
async function fetchDispatchChat() {
    try {
        const res = await fetch('/BACKEND/CODE_PHP/secure_line.php');
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
    const button = document.getElementById('dispatch-chat-send');
    const status = document.getElementById('dispatch-chat-status');
    button.disabled = true;
    status.innerText = 'TRANSMITTING...';
    status.style.color = 'var(--teal)';
    try {
        const res = await fetch('/BACKEND/CODE_PHP/secure_line.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: 'DISPATCHER', message: message })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Server returned HTTP ${res.status}`);
        }
        input.value = '';
        status.innerText = 'MESSAGE SENT.';
        fetchDispatchChat();
    } catch(e) {
        console.error('Dispatcher message could not be sent:', e);
        status.innerText = 'MESSAGE NOT SENT. CHECK THE CONNECTION AND TRY AGAIN.';
        status.style.color = 'var(--pin-danger)';
    } finally {
        button.disabled = false;
    }
}

// --- HERO DECOMMISSION (DELETE) LOGIC ---
async function decommissionHero() {
    if (selectedHeroes.length === 0) return;
    
    const heroId = selectedHeroes[0];
    const hero = activeState.heroes ? (activeState.heroes[heroId] || activeState.heroes[String(heroId)]) : null;
    const heroName = hero ? hero.name : `AGENT-${heroId}`;

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
        alert("TRANSMISSION ERROR: Could not reach database file.");
    }
}