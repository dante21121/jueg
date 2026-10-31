// --- SISTEMA CORE Y GRID ---
const WIDTH = 60, DEPTH = 60, CELL_SIZE = 14;
const TERRENO = { HUESO: 0, CARNE: 1, CAPARAZON: 2 };
const ESTRUCTURA = { NINGUNA: 0, PARED: 1, CAMA: 2 };
const BLUEPRINT = { NINGUNO: 0, MINAR: 1, CONSTRUIR_PARED: 2, CONSTRUIR_CAMA: 3 };

let grid = [];
let recursos = { biomasa: 50, comida: 20 };
let reloj = { dia: 1, hora: 6, minutos: 0 }; // Inicia 6:00 AM

// Herramientas: 0: Minar, 1: Pared (Costo 5), 2: Cama (Costo 15)
let modoHerramienta = 0; 
let tareasGlobales = []; // Job Queue

function generarTerreno() {
    for (let x = 0; x < WIDTH; x++) {
        grid[x] = [];
        for (let z = 0; z < DEPTH; z++) {
            let ruido = Math.sin(x * 0.1) + Math.cos(z * 0.1) + (Math.sin((x + z) * 0.05) * 2);
            grid[x][z] = {
                tipo: (ruido < 0) ? TERRENO.CARNE : TERRENO.CAPARAZON, // Carne da comida, Caparazón da biomasa
                estructura: ESTRUCTURA.NINGUNA,
                plano: BLUEPRINT.NINGUNO,
                caminable: true
            };
        }
    }
}

// --- PATHFINDING (Algoritmo BFS para esquivar paredes) ---
function encontrarRuta(startX, startZ, targetX, targetZ) {
    if (startX === targetX && startZ === targetZ) return [];
    
    let queue = [{x: startX, z: startZ, path: []}];
    let visited = new Set();
    visited.add(`${startX},${startZ}`);

    let direcciones = [{x:0,z:-1}, {x:0,z:1}, {x:-1,z:0}, {x:1,z:0}]; // Arriba, Abajo, Izq, Der

    while (queue.length > 0) {
        let current = queue.shift();

        for (let dir of direcciones) {
            let nx = current.x + dir.x;
            let nz = current.z + dir.z;

            if (nx === targetX && nz === targetZ) {
                return [...current.path, {x: nx, z: nz}];
            }

            if (nx >= 0 && nx < WIDTH && nz >= 0 && nz < DEPTH) {
                if (grid[nx][nz].caminable && !visited.has(`${nx},${nz}`)) {
                    visited.add(`${nx},${nz}`);
                    queue.push({x: nx, z: nz, path: [...current.path, {x: nx, z: nz}]});
                }
            }
        }
    }
    return null; // No hay ruta (atrapado)
}

// --- ENTIDADES (LOS COLONOS) ---
let colonos = [];
const NOMBRES = ["Val", "Kael", "Rye", "Jace", "Lyra"];

function inicializarColonos(cantidad) {
    for (let i = 0; i < cantidad; i++) {
        colonos.push({
            id: i, nombre: NOMBRES[i],
            x: 30 + i, z: 30, // Spawnean en el centro
            energia: 100, hambre: 100,
            estadoTxt: "Vagando",
            rutaActual: [], tareaActual: null,
            durmiendo: false
        });
    }
}

// --- SISTEMA DE TAREAS Y NECESIDADES (JOB SYSTEM) ---
function procesarColonos() {
    let uiHTML = "";

    for (let colono of colonos) {
        // 1. Decadencia de necesidades
        if (!colono.durmiendo) colono.energia -= 0.05;
        colono.hambre -= 0.08;

        if (colono.energia < 0) colono.energia = 0;
        if (colono.hambre < 0) colono.hambre = 0;

        // 2. Comportamiento impulsado por Necesidades Críticas (Overrides)
        if (colono.energia < 20 && !colono.tareaActual?.esCritica) {
            asignarTareaDormir(colono);
        } else if (colono.hambre < 25 && recursos.comida > 0 && !colono.tareaActual?.esCritica) {
            asignarTareaComer(colono);
        }

        // 3. Buscar trabajo si está libre
        if (!colono.tareaActual && tareasGlobales.length > 0 && !colono.durmiendo) {
            let tarea = tareasGlobales.shift(); // Toma el primer plano
            let ruta = encontrarRuta(colono.x, colono.z, tarea.x, tarea.z);
            if (ruta) {
                colono.tareaActual = tarea;
                colono.rutaActual = ruta;
                colono.estadoTxt = "Yendo a trabajar";
            } else {
                tareasGlobales.push(tarea); // No puede llegar, la devuelve a la cola
            }
        }

        // 4. Moverse y Ejecutar Tareas
        if (colono.rutaActual.length > 0) {
            let siguientePaso = colono.rutaActual[0];
            colono.x = siguientePaso.x;
            colono.z = siguientePaso.z;
            colono.rutaActual.shift();

            if (colono.rutaActual.length === 0) {
                // Llegó al destino
                ejecutarTarea(colono);
            }
        } else if (!colono.tareaActual && !colono.durmiendo) {
            // Comportamiento de "Vagar" (Idle)
            colono.estadoTxt = "Vagando";
            if (Math.random() < 0.1) {
                let rx = colono.x + (Math.floor(Math.random() * 3) - 1);
                let rz = colono.z + (Math.floor(Math.random() * 3) - 1);
                if (rx >= 0 && rx < WIDTH && rz >= 0 && rz < DEPTH && grid[rx][rz].caminable) {
                    colono.x = rx; colono.z = rz;
                }
            }
        }

        // Recuperar energía si duerme
        if (colono.durmiendo) {
            colono.energia += 0.5;
            colono.estadoTxt = "Durmiendo (Zzz)";
            if (colono.energia >= 100 || reloj.hora >= 6 && reloj.hora < 20) {
                colono.durmiendo = false;
                colono.tareaActual = null; // Despierta
            }
        }

        // Actualizar UI del Colono
        uiHTML += `
            <div class="colono-card">
                <strong>${colono.nombre}</strong> - <span>${colono.estadoTxt}</span>
                <div class="bar-bg"><div class="bar-fill-energia" style="width: ${colono.energia}%"></div></div>
                <div class="bar-bg"><div class="bar-fill-hambre" style="width: ${colono.hambre}%"></div></div>
            </div>`;
    }
    document.getElementById('colono-list').innerHTML = uiHTML;
}

function asignarTareaDormir(colono) {
    colono.tareaActual = { tipo: "DORMIR", esCritica: true, x: colono.x, z: colono.z }; // Duerme en el suelo si no hay cama
    // Buscar cama libre (Simplificado: busca cama más cercana)
    for (let x = 0; x < WIDTH; x++) {
        for (let z = 0; z < DEPTH; z++) {
            if (grid[x][z].estructura === ESTRUCTURA.CAMA) {
                let ruta = encontrarRuta(colono.x, colono.z, x, z);
                if (ruta) {
                    colono.tareaActual = { tipo: "DORMIR", esCritica: true, x: x, z: z };
                    colono.rutaActual = ruta;
                    colono.estadoTxt = "Buscando cama";
                    return;
                }
            }
        }
    }
    colono.durmiendo = true; // Cae desmayado donde está
}

function asignarTareaComer(colono) {
    colono.tareaActual = { tipo: "COMER", esCritica: true };
    colono.rutaActual = [];
    recursos.comida -= 1;
    colono.hambre = 100;
    colono.estadoTxt = "Comiendo";
    setTimeout(() => { colono.tareaActual = null; }, 1000); // Tarda un poco
}

function ejecutarTarea(colono) {
    let t = colono.tareaActual;
    let celda = grid[t.x][t.z];

    if (t.tipo === "MINAR") {
        colono.estadoTxt = "Minando";
        celda.plano = BLUEPRINT.NINGUNO;
        if (celda.tipo === TERRENO.CARNE) recursos.comida += 2;
        if (celda.tipo === TERRENO.CAPARAZON) recursos.biomasa += 3;
    } 
    else if (t.tipo === "CONSTRUIR_PARED" && recursos.biomasa >= 5) {
        colono.estadoTxt = "Construyendo";
        recursos.biomasa -= 5;
        celda.plano = BLUEPRINT.NINGUNO;
        celda.estructura = ESTRUCTURA.PARED;
        celda.caminable = false; // Bloquea pathfinding
    } 
    else if (t.tipo === "CONSTRUIR_CAMA" && recursos.biomasa >= 15) {
        colono.estadoTxt = "Construyendo";
        recursos.biomasa -= 15;
        celda.plano = BLUEPRINT.NINGUNO;
        celda.estructura = ESTRUCTURA.CAMA;
    }
    else if (t.tipo === "DORMIR") {
        colono.durmiendo = true;
    }
    
    if (t.tipo !== "DORMIR") colono.tareaActual = null; // Libera al colono
    actualizarUIRecursos();
}

// --- INTERACCIÓN DEL JUGADOR (MACRO-ORDENES) ---
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        modoHerramienta = (modoHerramienta + 1) % 3;
        let uim = document.getElementById('tool-mode');
        if (modoHerramienta === 0) uim.innerText = "1. Orden: Minar Tejido";
        if (modoHerramienta === 1) uim.innerText = "2. Plano: Pared (5 Biom)";
        if (modoHerramienta === 2) uim.innerText = "3. Plano: Cama (15 Biom)";
    }
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = WIDTH * CELL_SIZE; canvas.height = DEPTH * CELL_SIZE;

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const mz = Math.floor((e.clientY - rect.top) / CELL_SIZE);

    if (mx >= 0 && mx < WIDTH && mz >= 0 && mz < DEPTH) {
        let celda = grid[mx][mz];
        // Evitar duplicar tareas en la misma celda
        if (celda.plano === BLUEPRINT.NINGUNO && celda.estructura === ESTRUCTURA.NINGUNA) {
            if (modoHerramienta === 0) {
                celda.plano = BLUEPRINT.MINAR;
                tareasGlobales.push({ tipo: "MINAR", x: mx, z: mz });
            } else if (modoHerramienta === 1) {
                celda.plano = BLUEPRINT.CONSTRUIR_PARED;
                tareasGlobales.push({ tipo: "CONSTRUIR_PARED", x: mx, z: mz });
            } else if (modoHerramienta === 2) {
                celda.plano = BLUEPRINT.CONSTRUIR_CAMA;
                tareasGlobales.push({ tipo: "CONSTRUIR_CAMA", x: mx, z: mz });
            }
        }
    }
});

// --- TIEMPO Y RENDERIZADO ---
let lastTime = 0, tickLogica = 0;
const uiDia = document.getElementById('ui-dia');
const uiHora = document.getElementById('ui-hora');
const overlayNoche = document.getElementById('night-overlay');

function actualizarUIRecursos() {
    document.getElementById('ui-biomasa').innerText = `${recursos.biomasa} Biomasa`;
    document.getElementById('ui-comida').innerText = `${recursos.comida} Comida`;
}

function actualizarReloj() {
    reloj.minutos += 10;
    if (reloj.minutos >= 60) { reloj.minutos = 0; reloj.hora += 1; }
    if (reloj.hora >= 24) { reloj.hora = 0; reloj.dia += 1; uiDia.innerText = reloj.dia; }
    
    let hrFormato = reloj.hora < 10 ? "0" + reloj.hora : reloj.hora;
    let minFormato = reloj.minutos < 10 ? "0" + reloj.minutos : reloj.minutos;
    uiHora.innerText = `${hrFormato}:${minFormato}`;

    // Noche de 20:00 a 05:00
    if (reloj.hora >= 20 || reloj.hora < 5) overlayNoche.classList.add("es-noche");
    else overlayNoche.classList.remove("es-noche");
}

function gameLoop(currentTime) {
    if (lastTime === 0) lastTime = currentTime;
    let deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    tickLogica += deltaTime;

    // Procesamiento a 150ms (movimiento y acciones rápidas)
    if (tickLogica >= 150) {
        tickLogica -= 150;
        actualizarReloj();
        procesarColonos();
    }

    renderizarMundo();
    requestAnimationFrame(gameLoop);
}

function renderizarMundo() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let x = 0; x < WIDTH; x++) {
        for (let z = 0; z < DEPTH; z++) {
            let celda = grid[x][z];
            
            // 1. Suelo
            ctx.fillStyle = (celda.tipo === TERRENO.CARNE) ? "#6e202f" : "#2c3e4a";
            ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);

            // 2. Estructuras Terminadas
            if (celda.estructura === ESTRUCTURA.PARED) {
                ctx.fillStyle = "#8a96a3"; // Pared metálica
                ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                // Borde 3D falso
                ctx.strokeStyle = "#1a252c"; ctx.strokeRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            } else if (celda.estructura === ESTRUCTURA.CAMA) {
                ctx.fillStyle = "#3f51b5"; // Cama azul
                ctx.fillRect(x * CELL_SIZE + 2, z * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
            }

            // 3. Planos (Blueprints transparentes)
            if (celda.plano !== BLUEPRINT.NINGUNO) {
                ctx.strokeStyle = (celda.plano === BLUEPRINT.MINAR) ? "#ffaa00" : "#66fcf1";
                ctx.setLineDash([2, 2]);
                ctx.strokeRect(x * CELL_SIZE + 1, z * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
                ctx.setLineDash([]);
            }
        }
    }

    // 4. Colonos
    for (let colono of colonos) {
        ctx.fillStyle = colono.durmiendo ? "#555" : "#ffffff";
        ctx.beginPath();
        ctx.arc((colono.x * CELL_SIZE) + (CELL_SIZE/2), (colono.z * CELL_SIZE) + (CELL_SIZE/2), CELL_SIZE/2.5, 0, Math.PI * 2);
        ctx.fill();

        // Nombre flotante
        ctx.fillStyle = "#66fcf1";
        ctx.font = "9px Arial";
        ctx.fillText(colono.nombre, (colono.x * CELL_SIZE) - 4, (colono.z * CELL_SIZE) - 2);
    }
}

generarTerreno();
inicializarColonos(3); // Iniciamos con 3 sobrevivientes
actualizarUIRecursos();
requestAnimationFrame(gameLoop);
