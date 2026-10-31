// --- SISTEMA BASE, FLUIDOS Y ZONIFICACIÓN ---
const WIDTH = 60, DEPTH = 60, CELL_SIZE = 12;
const TIPOS_TEJIDO = { HUESO: 0, CARNE: 1, CAPARAZON: 2 };
const TIPOS_FLUIDO = { NINGUNO: 0, LINFA: 1 };
const TIPOS_ZONA = { NINGUNA: 0, RESIDENCIAL: 1, INDUSTRIAL: 2 };

let voxelGrid = [];
let modoHerramienta = 0; 
let saludLeviatan = 100;
let climaHelado = false;
let estadoInmersion = false;

const uiToolMode = document.getElementById('tool-mode');
const uiSalud = document.getElementById('salud-bar');
const uiClima = document.getElementById('clima-estado');
const overlayOceano = document.getElementById('ocean-overlay');
const btnInmersion = document.getElementById('btn-inmersion');

function generarRuidoOrganico(x, z) {
    return Math.sin(x * 0.1) + Math.cos(z * 0.1) + (Math.sin((x + z) * 0.05) * 2);
}

function inicializarGrid() {
    for (let x = 0; x < WIDTH; x++) {
        voxelGrid[x] = [];
        for (let z = 0; z < DEPTH; z++) {
            let altitudBase = 10 + Math.floor(generarRuidoOrganico(x, z) * 3);
            voxelGrid[x][z] = {
                nivelAltitud: altitudBase,
                tipoTejido: (altitudBase < 8) ? TIPOS_TEJIDO.CARNE : TIPOS_TEJIDO.CAPARAZON,
                tipoFluido: TIPOS_FLUIDO.NINGUNO,
                cantidadFluido: 0,
                tipoZona: TIPOS_ZONA.NINGUNA 
            };
        }
    }
}

// --- FASE 2: FLUIDOS Y CLIMA ---
function simularFluidos() {
    if (climaHelado || estadoInmersion) return; // Se congela el fluido o se detiene en inmersión

    let proximoEstado = JSON.parse(JSON.stringify(voxelGrid));
    for (let x = 1; x < WIDTH - 1; x++) {
        for (let z = 1; z < DEPTH - 1; z++) {
            let celda = voxelGrid[x][z];
            if (celda.cantidadFluido > 0) {
                let alturaActual = celda.nivelAltitud + celda.cantidadFluido;
                let vecinos = [ {nx: x, nz: z-1}, {nx: x, nz: z+1}, {nx: x-1, nz: z}, {nx: x+1, nz: z} ];
                let vecinoMasBajo = null;
                let menorAltura = alturaActual;

                for (let v of vecinos) {
                    let hVecina = voxelGrid[v.nx][v.nz].nivelAltitud + voxelGrid[v.nx][v.nz].cantidadFluido;
                    if (hVecina < menorAltura) { menorAltura = hVecina; vecinoMasBajo = v; }
                }
                if (vecinoMasBajo) {
                    proximoEstado[x][z].cantidadFluido -= 1;
                    if (proximoEstado[x][z].cantidadFluido === 0) proximoEstado[x][z].tipoFluido = TIPOS_FLUIDO.NINGUNO;
                    proximoEstado[vecinoMasBajo.nx][vecinoMasBajo.nz].cantidadFluido += 1;
                    proximoEstado[vecinoMasBajo.nx][vecinoMasBajo.nz].tipoFluido = celda.tipoFluido;
                }
            }
        }
    }
    voxelGrid = proximoEstado;
}

// --- FASE 3 y 5: COLONOS Y ANTICUERPOS ---
let colonos = [];
let anticuerpos = [];
const ESTADO_COLONO = { IDLE: "Buscando", MOVIENDO: "Moviendo", TRABAJANDO: "Trabajando", HUYENDO: "Huyendo" };

function inicializarColonos(cantidad) {
    for (let i = 0; i < cantidad; i++) {
        colonos.push({ x: Math.floor(Math.random() * 40) + 10, z: Math.floor(Math.random() * 40) + 10, estado: ESTADO_COLONO.IDLE, objX: null, objZ: null });
    }
}

function simularEntidades() {
    if (estadoInmersion) return; // En inmersión todos se refugian

    // Comportamiento de Colonos
    for (let colono of colonos) {
        if (colono.estado === ESTADO_COLONO.IDLE) {
            let zonas = [];
            for (let x = 0; x < WIDTH; x++) {
                for (let z = 0; z < DEPTH; z++) {
                    if (voxelGrid[x][z].tipoZona !== TIPOS_ZONA.NINGUNA) zonas.push({x, z});
                }
            }
            if (zonas.length > 0) {
                let zonaDestino = zonas[Math.floor(Math.random() * zonas.length)];
                colono.objX = zonaDestino.x; colono.objZ = zonaDestino.z;
                colono.estado = ESTADO_COLONO.MOVIENDO;
            }
        } else if (colono.estado === ESTADO_COLONO.MOVIENDO) {
            if (colono.x < colono.objX) colono.x++; else if (colono.x > colono.objX) colono.x--;
            if (colono.z < colono.objZ) colono.z++; else if (colono.z > colono.objZ) colono.z--;
            if (colono.x === colono.objX && colono.z === colono.objZ) colono.estado = ESTADO_COLONO.TRABAJANDO; 
        } else if (colono.estado === ESTADO_COLONO.TRABAJANDO) {
            let celdaActual = voxelGrid[colono.x][colono.z];
            
            // Lógica de Trabajo y Reacción del Leviatán
            if (celdaActual.tipoZona === TIPOS_ZONA.INDUSTRIAL) {
                // La industria extrae Linfa pero lastima al Leviatán
                if (Math.random() < 0.3) {
                    celdaActual.tipoFluido = TIPOS_FLUIDO.LINFA;
                    celdaActual.cantidadFluido += 2;
                    saludLeviatan = Math.max(0, saludLeviatan - 1);
                }
            } else if (celdaActual.tipoZona === TIPOS_ZONA.RESIDENCIAL) {
                // Zonas residenciales simbióticas curan al Leviatán
                if (Math.random() < 0.2) saludLeviatan = Math.min(100, saludLeviatan + 0.5);
            }
            
            // Vuelve a buscar trabajo después de un rato
            if (Math.random() < 0.1) colono.estado = ESTADO_COLONO.IDLE;
        }
    }

    // Comportamiento del Sistema Inmunológico (Anticuerpos)
    if (saludLeviatan < 50 && anticuerpos.length < 3 && Math.random() < 0.05) {
        // Spawnear Anticuerpo
        anticuerpos.push({ x: Math.floor(Math.random() * WIDTH), z: Math.floor(Math.random() * DEPTH) });
    }
    
    for (let anti of anticuerpos) {
        // Se mueven caóticamente buscando destruir colonos
        anti.x += Math.floor(Math.random() * 3) - 1;
        anti.z += Math.floor(Math.random() * 3) - 1;
        anti.x = Math.max(0, Math.min(WIDTH - 1, anti.x));
        anti.z = Math.max(0, Math.min(DEPTH - 1, anti.z));
    }
    
    // Si el Leviatán sana, los anticuerpos mueren
    if (saludLeviatan > 70) anticuerpos.pop(); 
    
    uiSalud.value = saludLeviatan;
    document.getElementById('anticuerpos-count').innerText = anticuerpos.length;
}

// --- MACRO EVENTOS GLOBALES ---
function evaluarClima() {
    if (Math.random() < 0.02) {
        climaHelado = !climaHelado;
        uiClima.innerText = climaHelado ? "Tempestad Helada" : "Templado";
        uiClima.style.color = climaHelado ? "#a0e6ff" : "#66fcf1";
    }
}

btnInmersion.addEventListener('click', () => {
    estadoInmersion = !estadoInmersion;
    if (estadoInmersion) {
        overlayOceano.classList.add("inmerso");
        btnInmersion.innerText = "Emerger a la Superficie";
        btnInmersion.style.backgroundColor = "#2c3e4a";
    } else {
        overlayOceano.classList.remove("inmerso");
        btnInmersion.innerText = "Activar Inmersión";
        btnInmersion.style.backgroundColor = "#8a2b3b";
    }
});

// --- INTERACCIÓN Y CONTROLES ---
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        modoHerramienta = (modoHerramienta + 1) % 3;
        if (modoHerramienta === 0) uiToolMode.innerText = "Derramar Linfa (Fluido)";
        if (modoHerramienta === 1) uiToolMode.innerText = "Pintar Zona Residencial";
        if (modoHerramienta === 2) uiToolMode.innerText = "Pintar Zona Industrial";
    }
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = WIDTH * CELL_SIZE; canvas.height = DEPTH * CELL_SIZE;

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const mouseZ = Math.floor((e.clientY - rect.top) / CELL_SIZE);

    if (mouseX >= 0 && mouseX < WIDTH && mouseZ >= 0 && mouseZ < DEPTH) {
        if (modoHerramienta === 0) {
            voxelGrid[mouseX][mouseZ].tipoFluido = TIPOS_FLUIDO.LINFA;
            voxelGrid[mouseX][mouseZ].cantidadFluido += 10; 
        } else if (modoHerramienta === 1) {
            voxelGrid[mouseX][mouseZ].tipoZona = TIPOS_ZONA.RESIDENCIAL; 
        } else if (modoHerramienta === 2) {
            voxelGrid[mouseX][mouseZ].tipoZona = TIPOS_ZONA.INDUSTRIAL; 
        }
    }
});

// --- RENDERIZADO Y LOOP ---
let lastTime = 0, acuFluidos = 0, acuColonos = 0;
let cntFluidos = 0, cntColonos = 0;

function gameLoop(currentTime) {
    if (lastTime === 0) lastTime = currentTime;
    let deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    acuFluidos += deltaTime; acuColonos += deltaTime;

    if (acuFluidos >= 100) {
        acuFluidos -= 100;
        document.getElementById('fluid-tick-count').innerText = ++cntFluidos;
        simularFluidos();
    }

    if (acuColonos >= 500) {
        acuColonos -= 500;
        document.getElementById('colonist-tick-count').innerText = ++cntColonos;
        simularEntidades();
        evaluarClima();
    }

    renderizarMundo(currentTime);
    requestAnimationFrame(gameLoop);
}

function renderizarMundo(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // FASE 6: Shaders y Latido Orgánico (Pulse Effect)
    let pulsoOrganico = Math.sin(time * 0.003) * 15; 

    for (let x = 0; x < WIDTH; x++) {
        for (let z = 0; z < DEPTH; z++) {
            const voxel = voxelGrid[x][z];
            
            // 1. Terreno Vivo
            let lum = 10 + (voxel.nivelAltitud * 8) + (voxel.tipoTejido === TIPOS_TEJIDO.CARNE ? pulsoOrganico : 0);
            ctx.fillStyle = (voxel.tipoTejido === TIPOS_TEJIDO.CARNE) ? `rgb(${lum + 60}, ${lum * 0.5}, ${lum * 0.5})` : `rgb(${lum}, ${lum + 20}, ${lum + 30})`;
            ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);

            // 2. Zonas
            if (voxel.tipoZona === TIPOS_ZONA.RESIDENCIAL) {
                ctx.fillStyle = "rgba(100, 255, 100, 0.4)"; 
                ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            } else if (voxel.tipoZona === TIPOS_ZONA.INDUSTRIAL) {
                ctx.fillStyle = "rgba(255, 150, 50, 0.4)"; 
                ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }

            // 3. Fluidos (Se oscurecen si se congelan)
            if (voxel.cantidadFluido > 0) {
                ctx.fillStyle = climaHelado ? "rgba(150, 150, 50, 0.9)" : "rgba(255, 215, 0, 0.8)"; 
                ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }
    }

    // 4. Entidades
    for (let colono of colonos) {
        ctx.fillStyle = "#ffffff"; 
        ctx.beginPath();
        ctx.arc((colono.x * CELL_SIZE) + (CELL_SIZE/2), (colono.z * CELL_SIZE) + (CELL_SIZE/2), CELL_SIZE/2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 5. Anticuerpos (Enemigos)
    for (let anti of anticuerpos) {
        ctx.fillStyle = "#ff4c4c"; 
        ctx.beginPath();
        ctx.arc((anti.x * CELL_SIZE) + (CELL_SIZE/2), (anti.z * CELL_SIZE) + (CELL_SIZE/2), CELL_SIZE/2, 0, Math.PI * 2);
        ctx.fill();
    }
}

inicializarGrid();
inicializarColonos(5); 
requestAnimationFrame(gameLoop);
