// --- SISTEMA BASE, FLUIDOS Y ZONIFICACIÓN (FASE 1, 2 y 4) ---
const WIDTH = 60;
const DEPTH = 60;
const CELL_SIZE = 12;

const TIPOS_TEJIDO = { HUESO: 0, CARNE: 1, CAPARAZON: 2 };
const TIPOS_FLUIDO = { NINGUNO: 0, LINFA: 1 };
const TIPOS_ZONA = { NINGUNA: 0, RESIDENCIAL: 1, INDUSTRIAL: 2 }; // Herramientas de zonificación (Fase 4)

let voxelGrid = [];
let modoHerramienta = 0; // 0: Linfa, 1: Zona Residencial, 2: Zona Industrial
const uiToolMode = document.getElementById('tool-mode');

function generarRuidoOrganico(x, z) {
    let escala1 = Math.sin(x * 0.1) + Math.cos(z * 0.1);
    let escala2 = Math.sin((x + z) * 0.05) * 2;
    return (escala1 + escala2);
}

function inicializarGrid() {
    for (let x = 0; x < WIDTH; x++) {
        voxelGrid[x] = [];
        for (let z = 0; z < DEPTH; z++) {
            let ruido = generarRuidoOrganico(x, z);
            let altitudBase = 10 + Math.floor(ruido * 3);
            
            let tejidoActual = (altitudBase < 8) ? TIPOS_TEJIDO.CARNE : TIPOS_TEJIDO.CAPARAZON;

            voxelGrid[x][z] = {
                nivelAltitud: altitudBase,
                tipoTejido: tejidoActual,
                tipoFluido: TIPOS_FLUIDO.NINGUNO,
                cantidadFluido: 0,
                tipoZona: TIPOS_ZONA.NINGUNA // Pinceles para pintar zonas (Fase 4)
            };
        }
    }
}

function simularFluidos() {
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
                    if (hVecina < menorAltura) {
                        menorAltura = hVecina;
                        vecinoMasBajo = v;
                    }
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

// --- FASE 3: SIMULACIÓN DE ENTIDADES (COLONOS Y BEHAVIOR TREES) ---
let colonos = [];
const ESTADO_COLONO = { IDLE: "Buscando Tarea", MOVIENDO: "En Tránsito", TRABAJANDO: "Trabajando" };

function inicializarColonos(cantidad) {
    for (let i = 0; i < cantidad; i++) {
        colonos.push({
            x: Math.floor(Math.random() * (WIDTH - 10)) + 5,
            z: Math.floor(Math.random() * (DEPTH - 10)) + 5,
            estado: ESTADO_COLONO.IDLE,
            objetivoX: null,
            objetivoZ: null
        });
    }
}

function simularColonos() {
    // Máquina de estados y Pathfinding dinámico básico (Fase 3)
    for (let colono of colonos) {
        if (colono.estado === ESTADO_COLONO.IDLE) {
            // Cola de tareas global: Buscar una Zona Industrial o Residencial para ir a construir/trabajar
            let zonaEncontrada = false;
            for (let x = 0; x < WIDTH; x++) {
                for (let z = 0; z < DEPTH; z++) {
                    if (voxelGrid[x][z].tipoZona !== TIPOS_ZONA.NINGUNA) {
                        colono.objetivoX = x;
                        colono.objetivoZ = z;
                        colono.estado = ESTADO_COLONO.MOVIENDO;
                        zonaEncontrada = true;
                        break;
                    }
                }
                if (zonaEncontrada) break;
            }
        } else if (colono.estado === ESTADO_COLONO.MOVIENDO) {
            // Pathfinding: Moverse un paso hacia el objetivo
            if (colono.x < colono.objetivoX) colono.x++;
            else if (colono.x > colono.objetivoX) colono.x--;
            
            if (colono.z < colono.objetivoZ) colono.z++;
            else if (colono.z > colono.objetivoZ) colono.z--;

            if (colono.x === colono.objetivoX && colono.z === colono.objetivoZ) {
                colono.estado = ESTADO_COLONO.TRABAJANDO; // Llega y empieza a trabajar
            }
        }
    }
}

// --- INTERACCIÓN Y CONTROLES (MACRO-GESTIÓN) ---
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
canvas.width = WIDTH * CELL_SIZE;
canvas.height = DEPTH * CELL_SIZE;

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const mouseZ = Math.floor((e.clientY - rect.top) / CELL_SIZE);

    if (mouseX >= 0 && mouseX < WIDTH && mouseZ >= 0 && mouseZ < DEPTH) {
        if (modoHerramienta === 0) {
            voxelGrid[mouseX][mouseZ].tipoFluido = TIPOS_FLUIDO.LINFA;
            voxelGrid[mouseX][mouseZ].cantidadFluido += 10; 
        } else if (modoHerramienta === 1) {
            voxelGrid[mouseX][mouseZ].tipoZona = TIPOS_ZONA.RESIDENCIAL; // Pincel Residencial
        } else if (modoHerramienta === 2) {
            voxelGrid[mouseX][mouseZ].tipoZona = TIPOS_ZONA.INDUSTRIAL; // Pincel Industrial
        }
    }
});

// --- RENDERIZADO Y TICK RATE ---
let lastTime = performance.now();
let acumuladorFluidos = 0, acumuladorColonos = 0;
let contadorTicksFluidos = 0, contadorTicksColonos = 0;

function gameLoop(currentTime) {
    let deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    acumuladorFluidos += deltaTime;
    acumuladorColonos += deltaTime;

    if (acumuladorFluidos >= 100) {
        acumuladorFluidos -= 100;
        document.getElementById('fluid-tick-count').innerText = ++contadorTicksFluidos;
        simularFluidos();
    }

    // Tick de colonos configurado a 500ms
    if (acumuladorColonos >= 500) {
        acumuladorColonos -= 500;
        document.getElementById('colonist-tick-count').innerText = ++contadorTicksColonos;
        simularColonos();
    }

    renderizarMundo();
    requestAnimationFrame(gameLoop);
}

function renderizarMundo() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let x = 0; x < WIDTH; x++) {
        for (let z = 0; z < DEPTH; z++) {
            const voxel = voxelGrid[x][z];
            
            // 1. Terreno
            let lum = 10 + (voxel.nivelAltitud * 8);
            ctx.fillStyle = (voxel.tipoTejido === TIPOS_TEJIDO.CARNE) ? `rgb(${lum + 60}, ${lum}, ${lum + 10})` : `rgb(${lum}, ${lum + 20}, ${lum + 30})`;
            ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);

            // 2. Zonas Pintadas (Fase 4)
            if (voxel.tipoZona === TIPOS_ZONA.RESIDENCIAL) {
                ctx.fillStyle = "rgba(100, 255, 100, 0.4)"; // Verde claro
                ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            } else if (voxel.tipoZona === TIPOS_ZONA.INDUSTRIAL) {
                ctx.fillStyle = "rgba(255, 150, 50, 0.4)"; // Naranja industrial
                ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }

            // 3. Fluidos
            if (voxel.cantidadFluido > 0) {
                ctx.fillStyle = "rgba(200, 180, 50, 0.8)"; 
                ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }
    }

    // 4. Renderizar Colonos (Fase 3)
    for (let colono of colonos) {
        ctx.fillStyle = "#ffffff"; // Colonos representados como puntos blancos
        ctx.beginPath();
        ctx.arc((colono.x * CELL_SIZE) + (CELL_SIZE/2), (colono.z * CELL_SIZE) + (CELL_SIZE/2), CELL_SIZE/2.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

inicializarGrid();
inicializarColonos(5); // Instanciamos 5 agentes al iniciar
requestAnimationFrame(gameLoop);
