// --- CONFIGURACIÓN BASE Y GRID ---
const WIDTH = 65, DEPTH = 50, CELL_SIZE = 14;
const ESTRUCTURA = { NINGUNA: 0, PARED: 1, PUERTA: 2, CAMA: 3, MESA: 4, CULTIVO: 5 };
const BLUEPRINT = { NINGUNO: 0, MINAR: 1, CONSTRUIR_PARED: 2, CONSTRUIR_PUERTA: 3, CONSTRUIR_CAMA: 4, CONSTRUIR_MESA: 5, DESTRUIR: 6, CONSTRUIR_CULTIVO: 7, COSECHAR: 8 };

const COSTOS = { "CONSTRUIR_PARED": 5, "CONSTRUIR_PUERTA": 3, "CONSTRUIR_CAMA": 10, "CONSTRUIR_MESA": 15, "CONSTRUIR_CULTIVO": 1 };

let grid = [];
let recursos = { biomasa: 50, comida: 20 };
let reloj = { dia: 1, hora: 6, minutos: 0 };
let gameSpeed = 0.5;

// Horario Global: 0: Sueño, 1: Trabajo, 2: Ocio
let horarioGlobal = [0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2]; 

let modoHerramienta = 0; 
let tareasGlobales = []; 
let idCounter = 1;
let isDragging = false;
let dragStart = {x: -1, z: -1}, dragCurrent = {x: -1, z: -1};

// Generación de mapa verde estilizado con tonos y elementos decorativos
function generarTerreno() {
    for (let x = 0; x < WIDTH; x++) {
        grid[x] = [];
        for (let z = 0; z < DEPTH; z++) {
            let n1 = Math.sin(x * 0.12) + Math.cos(z * 0.12);
            let n2 = Math.sin(x * 0.05 + z * 0.05) * 1.5;
            let val = n1 + n2;
            
            // Variedad de tonos de verde y tierra
            let tonoVerde = 0; // 0: Pasto claro, 1: Pasto medio, 2: Pasto denso, 3: Tierra
            if (val > 1.2) tonoVerde = 2;
            else if (val > 0.2) tonoVerde = 1;
            else if (val < -1.0) tonoVerde = 3;

            let tieneArbol = (tonoVerde === 2 && Math.random() < 0.15) || (tonoVerde === 1 && Math.random() < 0.04);

            grid[x][z] = {
                tonoVerde: tonoVerde,
                tieneArbol: tieneArbol,
                estructura: ESTRUCTURA.NINGUNA, 
                plano: BLUEPRINT.NINGUNO, 
                caminable: true, 
                crecimientoCultivo: 0,
                regeneracionBiomasa: 100, 
                esZonaExtraccion: false,
                hasPiso: false,
                asignadoA: null // Para camas
            };
        }
    }
}

// --- ANIMALES ---
let animales = [];
function generarAnimales(cantidad) {
    for (let i = 0; i < cantidad; i++) {
        animales.push({
            id: "A" + idCounter++, 
            x: Math.floor(Math.random() * WIDTH), 
            z: Math.floor(Math.random() * DEPTH),
            estado: "salvaje", 
            hp: 100
        });
    }
}

// --- PATHFINDING & NAVEGACIÓN ---
function encontrarRuta(startX, startZ, targetX, targetZ, stopAdjacent = false) {
    if (startX === targetX && startZ === targetZ) return [];
    let queue = [{x: startX, z: startZ, path: []}];
    let visited = new Set(); visited.add(`${startX},${startZ}`);
    let direcciones = [{x:0,z:-1}, {x:0,z:1}, {x:-1,z:0}, {x:1,z:0}];

    while (queue.length > 0) {
        let current = queue.shift();
        
        if (stopAdjacent && Math.abs(current.x - targetX) + Math.abs(current.z - targetZ) === 1) {
            return current.path; 
        }

        for (let dir of direcciones) {
            let nx = current.x + dir.x, nz = current.z + dir.z;
            if (nx === targetX && nz === targetZ && !stopAdjacent) return [...current.path, {x: nx, z: nz}];
            if (nx >= 0 && nx < WIDTH && nz >= 0 && nz < DEPTH) {
                let esAccesible = grid[nx][nz].caminable || grid[nx][nz].estructura === ESTRUCTURA.PUERTA;
                if (esAccesible && !visited.has(`${nx},${nz}`)) {
                    visited.add(`${nx},${nz}`);
                    queue.push({x: nx, z: nz, path: [...current.path, {x: nx, z: nz}]});
                }
            }
        }
    }
    return null;
}

// HABITACIONES (DETECCIÓN PISO DE MADERA)
function detectarHabitaciones(startX, startZ) {
    let queue = [{x: startX, z: startZ}];
    let visited = new Set(); visited.add(`${startX},${startZ}`);
    let roomCells = [];
    let isEnclosed = true;

    while (queue.length > 0) {
        let curr = queue.shift();
        roomCells.push(curr);
        if (roomCells.length > 250) { isEnclosed = false; break; }
        
        let dirs = [{x:0,z:1},{x:0,z:-1},{x:1,z:0},{x:-1,z:0}];
        for (let d of dirs) {
            let nx = curr.x + d.x, nz = curr.z + d.z;
            if (nx < 0 || nx >= WIDTH || nz < 0 || nz >= DEPTH) { isEnclosed = false; continue; }
            let celda = grid[nx][nz];
            if (celda.estructura !== ESTRUCTURA.PARED && celda.estructura !== ESTRUCTURA.PUERTA && !visited.has(`${nx},${nz}`)) {
                visited.add(`${nx},${nz}`);
                queue.push({x: nx, z: nz});
            }
        }
    }
    if (isEnclosed && roomCells.length > 0) {
        for (let rc of roomCells) grid[rc.x][rc.z].hasPiso = true;
    }
}

// --- COLONOS ---
let colonos = [];
let colonoSeleccionado = null;
const NOMBRES = ["Val", "Kael", "Rye", "Jace", "Lyra", "Sion", "Tess"];

function crearColono(x, z, edad) {
    colonos.push({
        id: idCounter++, 
        nombre: NOMBRES[Math.floor(Math.random() * NOMBRES.length)],
        x: x, z: z, edad: edad, 
        energia: 100, hambre: 100,
        estadoTxt: "Vagando", 
        rutaActual: [], 
        tareaActual: null, 
        durmiendo: false,
        ticksEnTarea: 0, // Anti-stuck counter
        camaAsignada: null, // {x, z}
        trabajosPermitidos: { mineria: true, caza: true, construccion: true, agricultura: true, domesticacion: true },
        relaciones: {}, pareja: null 
    });
    document.getElementById('ui-poblacion').innerText = colonos.length;
}

// --- LÓGICA DE SIMULACIÓN Y TAREAS ---
function procesarColonos() {
    // 1. Crecimiento de vegetación, cultivos y auto-extracción
    for (let x = 0; x < WIDTH; x++) {
        for (let z = 0; z < DEPTH; z++) {
            let celda = grid[x][z];
            if (celda.estructura === ESTRUCTURA.CULTIVO && celda.plano !== BLUEPRINT.COSECHAR && reloj.hora > 6 && reloj.hora < 19) {
                celda.crecimientoCultivo += 0.5; 
                if (celda.crecimientoCultivo >= 100) {
                    celda.crecimientoCultivo = 100; celda.plano = BLUEPRINT.COSECHAR;
                    tareasGlobales.push({ tipo: "COSECHAR", req: "agricultura", x: x, z: z });
                }
            }
            if (celda.regeneracionBiomasa < 100) {
                celda.regeneracionBiomasa += 0.1;
                if (celda.regeneracionBiomasa >= 100) {
                    celda.regeneracionBiomasa = 100;
                    if (celda.esZonaExtraccion && celda.plano === BLUEPRINT.NINGUNO && celda.estructura === ESTRUCTURA.NINGUNA) {
                        celda.plano = BLUEPRINT.MINAR;
                        tareasGlobales.push({ tipo: "MINAR", req: "mineria", x: x, z: z });
                    }
                }
            }
        }
    }

    // 2. Movimiento de animales
    for (let anim of animales) {
        if (Math.random() < 0.1) {
            let nx = anim.x + (Math.floor(Math.random() * 3) - 1);
            let nz = anim.z + (Math.floor(Math.random() * 3) - 1);
            if (nx >= 0 && nx < WIDTH && nz >= 0 && nz < DEPTH && grid[nx][nz].caminable) {
                anim.x = nx; anim.z = nz;
            }
        }
    }

    // 3. IA de Colonos
    let modoActual = horarioGlobal[reloj.hora]; 

    for (let colono of colonos) {
        if (!colono.durmiendo) colono.energia -= 0.05;
        colono.hambre -= 0.08;
        if (colono.energia < 0) colono.energia = 0;
        if (colono.hambre < 0) colono.hambre = 0;

        // --- SISTEMA ANTI-BLOQUEOS (TASK TIMEOUT) ---
        if (colono.tareaActual) {
            colono.ticksEnTarea++;
            if (colono.ticksEnTarea > 35) { // Si lleva más de ~5 segundos intentando sin lograrlo
                if (!colono.tareaActual.esCritica) tareasGlobales.push(colono.tareaActual); // Reinsertar en la cola
                colono.tareaActual = null;
                colono.rutaActual = [];
                colono.ticksEnTarea = 0;
                colono.estadoTxt = "Reevaluando";
                continue;
            }
        } else {
            colono.ticksEnTarea = 0;
        }

        // Horario y Necesidades
        let fuerzaDormir = (colono.energia < 20) || (modoActual === 0 && colono.energia < 95);
        if (fuerzaDormir && !colono.tareaActual?.esCritica && !colono.durmiendo) {
            buscarOCrearCamaPropia(colono);
        } else if (colono.hambre < 25 && recursos.comida > 0 && !colono.tareaActual?.esCritica) {
            asignarTareaComer(colono);
        }

        // Ocio
        if (modoActual === 2 && colono.tareaActual && !colono.tareaActual.esCritica) {
            if (colono.tareaActual.tipo !== "CAZAR" && colono.tareaActual.tipo !== "DOMESTICAR") {
                tareasGlobales.push(colono.tareaActual);
                colono.tareaActual = null;
                colono.rutaActual = [];
            }
        }

        // Buscar Trabajo (Sistemático y sin atorarse)
        if (!colono.tareaActual && tareasGlobales.length > 0 && !colono.durmiendo && modoActual === 1) {
            for (let i = 0; i < tareasGlobales.length; i++) {
                let tarea = tareasGlobales[i];
                if (colono.trabajosPermitidos[tarea.req]) {
                    let costoReq = COSTOS[tarea.tipo] || 0;
                    if (recursos.biomasa >= costoReq) {
                        let stopAdj = tarea.tipo.startsWith("CONSTRUIR") || tarea.tipo === "CAZAR" || tarea.tipo === "DOMESTICAR";
                        let ruta = encontrarRuta(colono.x, colono.z, tarea.x, tarea.z, stopAdj);
                        
                        if (ruta) {
                            colono.tareaActual = tarea; 
                            colono.rutaActual = ruta; 
                            colono.estadoTxt = "Yendo a trabajar";
                            colono.ticksEnTarea = 0;
                            tareasGlobales.splice(i, 1); 
                            break; 
                        }
                    }
                }
            }
        }

        // Movimiento
        if (colono.rutaActual.length > 0) {
            let sig = colono.rutaActual[0];
            colono.x = sig.x; colono.z = sig.z;
            colono.rutaActual.shift();
            
            if (colono.tareaActual && (colono.tareaActual.tipo === "CAZAR" || colono.tareaActual.tipo === "DOMESTICAR")) {
                let anim = animales.find(a => a.id === colono.tareaActual.animId);
                if (!anim || anim.hp <= 0) { colono.tareaActual = null; colono.rutaActual = []; continue; }
                if (Math.abs(colono.x - anim.x) + Math.abs(colono.z - anim.z) > 1) {
                    colono.tareaActual.x = anim.x; colono.tareaActual.z = anim.z;
                    colono.rutaActual = encontrarRuta(colono.x, colono.z, anim.x, anim.z, true) || [];
                }
            }
            if (colono.rutaActual.length === 0) ejecutarTarea(colono);
        } else if (!colono.tareaActual && !colono.durmiendo) {
            colono.estadoTxt = (modoActual === 2) ? "Recreación (Ocio)" : "Vagando";
            if (Math.random() < 0.35) { 
                let nx = colono.x + (Math.floor(Math.random() * 5) - 2); 
                let nz = colono.z + (Math.floor(Math.random() * 5) - 2);
                if (nx >= 0 && nx < WIDTH && nz >= 0 && nz < DEPTH && grid[nx][nz].caminable) { colono.x = nx; colono.z = nz; }
            }
        }

        if (colono.durmiendo) {
            colono.energia += 0.5; colono.estadoTxt = "Durmiendo (Zzz)";
            if (colono.energia >= 100 || (modoActual !== 0 && colono.energia > 50)) {
                colono.durmiendo = false; colono.tareaActual = null; 
            }
        }
    }
    actualizarInspectorUI();
}

// ASIGNACIÓN EXCLUSIVA DE CAMAS
function buscarOCrearCamaPropia(c) {
    // 1. Si ya tiene cama asignada y aún existe
    if (c.camaAsignada) {
        let bedCelda = grid[c.camaAsignada.x]?.[c.camaAsignada.z];
        if (bedCelda && bedCelda.estructura === ESTRUCTURA.CAMA && bedCelda.asignadoA === c.id) {
            let r = encontrarRuta(c.x, c.z, c.camaAsignada.x, c.camaAsignada.z);
            if (r) { c.tareaActual = { tipo: "DORMIR", esCritica: true, x: c.camaAsignada.x, z: c.camaAsignada.z }; c.rutaActual = r; c.estadoTxt = "Ir a su cama"; return; }
        } else {
            c.camaAsignada = null; // Cama destruida
        }
    }

    // 2. Buscar cama desocupada y no asignada
    for (let x = 0; x < WIDTH; x++) {
        for (let z = 0; z < DEPTH; z++) {
            let celda = grid[x][z];
            if (celda.estructura === ESTRUCTURA.CAMA && (celda.asignadoA === null || celda.asignadoA === c.id)) {
                let r = encontrarRuta(c.x, c.z, x, z);
                if (r) {
                    celda.asignadoA = c.id;
                    c.camaAsignada = {x, z};
                    c.tareaActual = { tipo: "DORMIR", esCritica: true, x: x, z: z }; 
                    c.rutaActual = r; 
                    c.estadoTxt = "Asignando cama"; 
                    return; 
                }
            }
        }
    }

    // 3. Si no hay camas disponibles, duerme en el suelo
    c.tareaActual = { tipo: "DORMIR", esCritica: true, x: c.x, z: c.z }; 
    c.durmiendo = true;
}

function asignarTareaComer(c) {
    c.tareaActual = { tipo: "COMER", esCritica: true }; c.rutaActual = [];
    recursos.comida -= 1; c.hambre = 100; c.estadoTxt = "Comiendo";
    setTimeout(() => { c.tareaActual = null; }, 1000 / (gameSpeed === 0 ? 1 : gameSpeed));
}

function ejecutarTarea(c) {
    let t = c.tareaActual;
    let costo = COSTOS[t.tipo] || 0;
    if (costo > 0 && recursos.biomasa < costo) { tareasGlobales.push(t); c.tareaActual = null; return; }

    if (t.tipo === "CAZAR") {
        let anim = animales.find(a => a.id === t.animId);
        if (anim) {
            anim.hp -= 50; c.estadoTxt = "Cazando";
            if (anim.hp <= 0) { recursos.comida += 15; animales = animales.filter(a => a.id !== t.animId); c.tareaActual = null; }
            else { c.rutaActual = encontrarRuta(c.x, c.z, anim.x, anim.z, true) || []; return; }
        }
    } else if (t.tipo === "DOMESTICAR") {
        let anim = animales.find(a => a.id === t.animId);
        if (anim && recursos.comida >= 2) {
            recursos.comida -= 2; c.estadoTxt = "Domesticando";
            if (Math.random() < 0.35) { anim.estado = "domesticado"; }
            else { anim.estado = "salvaje"; }
        }
    } else {
        let celda = grid[t.x][t.z];
        if (t.tipo === "MINAR") {
            celda.plano = BLUEPRINT.NINGUNO;
            celda.regeneracionBiomasa = 0; 
            celda.tieneArbol = false;
            recursos.biomasa += 4;
        } 
        else if (t.tipo === "DESTRUIR") {
            celda.plano = BLUEPRINT.NINGUNO; 
            if (celda.estructura === ESTRUCTURA.CAMA && celda.asignadoA) {
                let colOwner = colonos.find(co => co.id === celda.asignadoA);
                if (colOwner) colOwner.camaAsignada = null;
            }
            celda.estructura = ESTRUCTURA.NINGUNA; 
            celda.caminable = true; 
            celda.hasPiso = false;
            celda.asignadoA = null;
            recursos.biomasa += 2; 
        }
        else if (t.tipo === "COSECHAR") {
            celda.plano = BLUEPRINT.NINGUNO; celda.crecimientoCultivo = 0; recursos.comida += 4;
        }
        else if (t.tipo.startsWith("CONSTRUIR")) {
            recursos.biomasa -= costo; celda.plano = BLUEPRINT.NINGUNO;
            if (t.tipo === "CONSTRUIR_PARED") { celda.estructura = ESTRUCTURA.PARED; celda.caminable = false; celda.tieneArbol = false; }
            if (t.tipo === "CONSTRUIR_PUERTA") { celda.estructura = ESTRUCTURA.PUERTA; celda.tieneArbol = false; }
            if (t.tipo === "CONSTRUIR_CAMA") { celda.estructura = ESTRUCTURA.CAMA; celda.tieneArbol = false; }
            if (t.tipo === "CONSTRUIR_MESA") { celda.estructura = ESTRUCTURA.MESA; celda.caminable = false; celda.tieneArbol = false; }
            if (t.tipo === "CONSTRUIR_CULTIVO") { celda.estructura = ESTRUCTURA.CULTIVO; celda.crecimientoCultivo = 0; celda.tieneArbol = false; }
            
            if (t.tipo === "CONSTRUIR_PARED" || t.tipo === "CONSTRUIR_PUERTA") {
                let adjFree = [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}].find(d => grid[t.x+d.x]?.[t.z+d.z]?.caminable);
                if (adjFree) detectarHabitaciones(t.x+adjFree.x, t.z+adjFree.z);
            }
        }
    }
    if (t.tipo !== "DORMIR") c.tareaActual = null;
    document.getElementById('ui-biomasa').innerText = Math.floor(recursos.biomasa);
    document.getElementById('ui-comida').innerText = recursos.comida;
}

// --- INTERFAZ & SELECCIÓN ---
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') setSpeed(gameSpeed === 0 ? 1 : 0);
    if (e.code === 'Digit1') setSpeed(1); 
    if (e.code === 'Digit2') setSpeed(2); 
    if (e.code === 'Digit3') setSpeed(4); 
});

function setSpeed(s) {
    if(s === 1) gameSpeed = 0.5; else if(s === 2) gameSpeed = 1; else if(s === 4) gameSpeed = 3; else gameSpeed = 0;
    document.querySelectorAll('.time-controls button').forEach(b => b.classList.remove('active'));
    if(s===0) document.getElementById('btn-pause').classList.add('active');
    if(s===1) document.getElementById('btn-1x').classList.add('active');
    if(s===2) document.getElementById('btn-2x').classList.add('active');
    if(s===4) document.getElementById('btn-4x').classList.add('active');
}

function setTool(t) {
    modoHerramienta = t; colonoSeleccionado = null;
    document.getElementById('inspector-layer').style.display = 'none';
    document.querySelectorAll('.tool-list button').forEach(b => b.classList.remove('active'));
    document.getElementById('tool-' + t).classList.add('active');
}

function toggleJob(job) { if (colonoSeleccionado) colonoSeleccionado.trabajosPermitidos[job] = document.getElementById('chk-' + job).checked; }

function inicializarHorarioUI() {
    let html = "";
    for (let i=0; i<24; i++) {
        let cls = horarioGlobal[i] === 0 ? "sch-sueno" : (horarioGlobal[i] === 1 ? "sch-trabajo" : "sch-ocio");
        html += `<div class="hour-block ${cls}" onclick="cambiarHorario(${i}, this)">${i}</div>`;
    }
    document.getElementById('schedule-bar').innerHTML = html;
}

function cambiarHorario(hora, element) {
    horarioGlobal[hora] = (horarioGlobal[hora] + 1) % 3;
    element.className = "hour-block " + (horarioGlobal[hora] === 0 ? "sch-sueno" : (horarioGlobal[hora] === 1 ? "sch-trabajo" : "sch-ocio"));
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = WIDTH * CELL_SIZE; canvas.height = DEPTH * CELL_SIZE;

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = Math.floor((e.clientX - rect.left) / CELL_SIZE), mz = Math.floor((e.clientY - rect.top) / CELL_SIZE);
    if (mx >= 0 && mx < WIDTH && mz >= 0 && mz < DEPTH) {
        isDragging = true; dragStart = {x: mx, z: mz}; dragCurrent = {x: mx, z: mz};
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = canvas.getBoundingClientRect();
    dragCurrent.x = Math.max(0, Math.min(WIDTH-1, Math.floor((e.clientX - rect.left) / CELL_SIZE)));
    dragCurrent.z = Math.max(0, Math.min(DEPTH-1, Math.floor((e.clientY - rect.top) / CELL_SIZE)));
});

canvas.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    let startX = Math.min(dragStart.x, dragCurrent.x), endX = Math.max(dragStart.x, dragCurrent.x);
    let startZ = Math.min(dragStart.z, dragCurrent.z), endZ = Math.max(dragStart.z, dragCurrent.z);

    if (modoHerramienta === 0) { // DRAG SELECT COLONIST
        let colsInBox = colonos.filter(c => c.x >= startX && c.x <= endX && c.z >= startZ && c.z <= endZ);
        if (colsInBox.length === 1) {
            colonoSeleccionado = colsInBox[0]; document.getElementById('inspector-layer').style.display = 'block'; actualizarInspectorUI();
        } else {
            colonoSeleccionado = null; document.getElementById('inspector-layer').style.display = 'none';
        }
    } else {
        for (let x = startX; x <= endX; x++) {
            for (let z = startZ; z <= endZ; z++) { aplicarHerramientaCelda(x, z); }
        }
    }
});

function aplicarHerramientaCelda(mx, mz) {
    let celda = grid[mx][mz];
    
    if (modoHerramienta === 10) { // CANCELAR / DEMOLER
        celda.esZonaExtraccion = false;
        if (celda.plano !== BLUEPRINT.NINGUNO) { celda.plano = BLUEPRINT.NINGUNO; tareasGlobales = tareasGlobales.filter(t => t.x !== mx || t.z !== mz); }
        else if (celda.estructura !== ESTRUCTURA.NINGUNA) { celda.plano = BLUEPRINT.DESTRUIR; tareasGlobales.push({ tipo: "DESTRUIR", req: "construccion", x: mx, z: mz }); }
        return;
    }
    if (modoHerramienta === 7) { // ZONA DE EXTRACCIÓN AUTO
        celda.esZonaExtraccion = true;
        if (celda.regeneracionBiomasa === 100 && celda.estructura === ESTRUCTURA.NINGUNA) { celda.plano = BLUEPRINT.MINAR; tareasGlobales.push({ tipo: "MINAR", req: "mineria", x: mx, z: mz }); }
        return;
    }
    if (modoHerramienta === 8 || modoHerramienta === 9) { // CAZA O DOMESTICACIÓN
        let anim = animales.find(a => a.x === mx && a.z === mz);
        if (anim && anim.estado === "salvaje") {
            anim.estado = modoHerramienta === 8 ? "cazado" : "domesticando";
            tareasGlobales.push({ tipo: modoHerramienta === 8 ? "CAZAR" : "DOMESTICAR", req: modoHerramienta === 8 ? "caza" : "domesticacion", animId: anim.id, x: mx, z: mz });
        }
        return;
    }

    if (celda.plano === BLUEPRINT.NINGUNO && celda.estructura === ESTRUCTURA.NINGUNA) {
        if (modoHerramienta === 1 && celda.regeneracionBiomasa === 100) { celda.plano = BLUEPRINT.MINAR; tareasGlobales.push({ tipo: "MINAR", req: "mineria", x: mx, z: mz }); }
        if (modoHerramienta === 2) { celda.plano = BLUEPRINT.CONSTRUIR_PARED; tareasGlobales.push({ tipo: "CONSTRUIR_PARED", req: "construccion", x: mx, z: mz }); }
        if (modoHerramienta === 3) { celda.plano = BLUEPRINT.CONSTRUIR_PUERTA; tareasGlobales.push({ tipo: "CONSTRUIR_PUERTA", req: "construccion", x: mx, z: mz }); }
        if (modoHerramienta === 4) { celda.plano = BLUEPRINT.CONSTRUIR_CAMA; tareasGlobales.push({ tipo: "CONSTRUIR_CAMA", req: "construccion", x: mx, z: mz }); }
        if (modoHerramienta === 5) { celda.plano = BLUEPRINT.CONSTRUIR_MESA; tareasGlobales.push({ tipo: "CONSTRUIR_MESA", req: "construccion", x: mx, z: mz }); }
        if (modoHerramienta === 6) { celda.plano = BLUEPRINT.CONSTRUIR_CULTIVO; tareasGlobales.push({ tipo: "CONSTRUIR_CULTIVO", req: "agricultura", x: mx, z: mz }); }
    }
}

function actualizarInspectorUI() {
    if (!colonoSeleccionado) return;
    document.getElementById('insp-nombre').innerText = colonoSeleccionado.nombre;
    document.getElementById('insp-edad').innerText = Math.floor(colonoSeleccionado.edad);
    let pObj = colonoSeleccionado.pareja ? colonos.find(c => c.id === colonoSeleccionado.pareja) : null;
    document.getElementById('insp-pareja').innerText = pObj ? pObj.nombre : "Ninguna";
    
    let txtCama = "Sin Cama";
    if (colonoSeleccionado.camaAsignada) txtCama = `Cama en (${colonoSeleccionado.camaAsignada.x}, ${colonoSeleccionado.camaAsignada.z})`;
    document.getElementById('insp-cama').innerText = txtCama;
    
    document.getElementById('insp-estado').innerText = colonoSeleccionado.estadoTxt;
    document.getElementById('insp-energia').style.width = colonoSeleccionado.energia + "%";
    document.getElementById('insp-hambre').style.width = colonoSeleccionado.hambre + "%";
    
    document.getElementById('chk-mineria').checked = colonoSeleccionado.trabajosPermitidos.mineria;
    document.getElementById('chk-caza').checked = colonoSeleccionado.trabajosPermitidos.caza;
    document.getElementById('chk-construccion').checked = colonoSeleccionado.trabajosPermitidos.construccion;
    document.getElementById('chk-agricultura').checked = colonoSeleccionado.trabajosPermitidos.agricultura;
    document.getElementById('chk-domesticacion').checked = colonoSeleccionado.trabajosPermitidos.domesticacion;
}

// --- RENDERIZADO VISUAL CON VERDES Y DETALLES ---
let lastTime = 0, tickLogica = 0;
const overlayNoche = document.getElementById('night-overlay');

function gameLoop(currentTime) {
    if (lastTime === 0) lastTime = currentTime;
    let deltaTime = currentTime - lastTime; lastTime = currentTime;

    if (gameSpeed > 0) {
        tickLogica += (deltaTime * gameSpeed);
        if (tickLogica >= 150) { 
            tickLogica -= 150;
            reloj.minutos += 10;
            if (reloj.minutos >= 60) {
                reloj.minutos = 0; reloj.hora += 1;
                colonos.forEach(c => c.edad += 0.01); 
            }
            if (reloj.hora >= 24) { reloj.hora = 0; reloj.dia += 1; document.getElementById('ui-dia').innerText = reloj.dia; }
            document.getElementById('ui-hora').innerText = `${reloj.hora < 10 ? "0"+reloj.hora : reloj.hora}:${reloj.minutos < 10 ? "0"+reloj.minutos : reloj.minutos}`;
            if (reloj.hora >= 20 || reloj.hora < 5) overlayNoche.classList.add("es-noche"); else overlayNoche.classList.remove("es-noche");
            
            procesarColonos();
        }
    }
    renderizarMundo(); requestAnimationFrame(gameLoop);
}

function renderizarMundo() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. DIBUJAR TERRENO VERDE
    for (let x = 0; x < WIDTH; x++) {
        for (let z = 0; z < DEPTH; z++) {
            let celda = grid[x][z];
            
            // Paleta de tonos verdes
            if (celda.tonoVerde === 0) ctx.fillStyle = "#4a7c59"; // Pasto medio
            else if (celda.tonoVerde === 1) ctx.fillStyle = "#3b6645"; // Pasto oscuro
            else if (celda.tonoVerde === 2) ctx.fillStyle = "#5c946e"; // Pasto claro/frondoso
            else ctx.fillStyle = "#7f5539"; // Parche de tierra

            // Si está recién extraído/talado, se oscurece
            if (celda.regeneracionBiomasa < 100) {
                let osc = Math.floor(celda.regeneracionBiomasa * 0.5);
                ctx.fillStyle = `rgb(${25 + osc}, ${45 + osc}, ${25 + osc})`;
            }

            ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);

            // Pisos de Madera (Habitaciones)
            if (celda.hasPiso && celda.estructura === ESTRUCTURA.NINGUNA) {
                ctx.fillStyle = "#b07d4f"; ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                ctx.strokeStyle = "#8d5b30"; ctx.strokeRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }

            // Árboles Decorativos
            if (celda.tieneArbol && celda.estructura === ESTRUCTURA.NINGUNA && celda.regeneracionBiomasa === 100) {
                ctx.fillStyle = "#2d4a22"; ctx.beginPath(); 
                ctx.arc((x*CELL_SIZE)+(CELL_SIZE/2), (z*CELL_SIZE)+(CELL_SIZE/2), 4, 0, Math.PI*2); ctx.fill();
            }

            // Estructuras
            if (celda.estructura === ESTRUCTURA.PARED) {
                ctx.fillStyle = "#5a6577"; ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                ctx.strokeStyle = "#2b323d"; ctx.strokeRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            } else if (celda.estructura === ESTRUCTURA.PUERTA) {
                ctx.fillStyle = "#b07d4f"; ctx.fillRect(x * CELL_SIZE + 3, z * CELL_SIZE + 3, CELL_SIZE - 6, CELL_SIZE - 6);
            } else if (celda.estructura === ESTRUCTURA.CAMA) {
                // Renderizado de Cama (Sábana Azul + Almohada Blanca)
                ctx.fillStyle = (celda.asignadoA !== null) ? "#3f51b5" : "#7986cb"; // Azul más brillante si está asignada
                ctx.fillRect(x * CELL_SIZE + 2, z * CELL_SIZE + 5, CELL_SIZE - 4, CELL_SIZE - 7); 
                ctx.fillStyle = "#ffffff"; ctx.fillRect(x * CELL_SIZE + 3, z * CELL_SIZE + 2, CELL_SIZE - 6, 3);
            } else if (celda.estructura === ESTRUCTURA.MESA) {
                ctx.fillStyle = "#cd853f"; ctx.fillRect(x * CELL_SIZE + 1, z * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            } else if (celda.estructura === ESTRUCTURA.CULTIVO) {
                let verdor = Math.floor(60 + (celda.crecimientoCultivo * 1.8));
                ctx.fillStyle = `rgb(20, ${verdor}, 20)`; ctx.fillRect(x * CELL_SIZE + 1, z * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
                if (celda.crecimientoCultivo >= 100) { ctx.fillStyle = "#ffaa00"; ctx.beginPath(); ctx.arc((x*CELL_SIZE)+(CELL_SIZE/2), (z*CELL_SIZE)+(CELL_SIZE/2), 3, 0, Math.PI*2); ctx.fill(); }
            }

            // Zonas y Planos
            if (celda.esZonaExtraccion && celda.estructura === ESTRUCTURA.NINGUNA) {
                ctx.fillStyle = "rgba(112, 224, 0, 0.15)"; ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
            if (celda.plano !== BLUEPRINT.NINGUNO) {
                if (celda.plano === BLUEPRINT.DESTRUIR) ctx.strokeStyle = "#ff4c4c"; 
                else if (celda.plano === BLUEPRINT.MINAR || celda.plano === BLUEPRINT.COSECHAR) ctx.strokeStyle = "#ffaa00";
                else if (celda.plano === BLUEPRINT.CONSTRUIR_CULTIVO) ctx.strokeStyle = "#70e000";
                else ctx.strokeStyle = "#66fcf1";
                ctx.setLineDash([2, 2]); ctx.strokeRect(x * CELL_SIZE + 1, z * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2); ctx.setLineDash([]);
            }
        }
    }

    // 2. DIBUJAR ANIMALES
    for (let a of animales) {
        ctx.fillStyle = a.estado === "domesticado" ? "#70e000" : "#d4a373"; 
        ctx.fillRect((a.x * CELL_SIZE) + 2, (a.z * CELL_SIZE) + 4, CELL_SIZE - 4, CELL_SIZE - 6);
        if (a.estado === "cazado") { ctx.strokeStyle = "#ff4c4c"; ctx.strokeRect((a.x * CELL_SIZE), (a.z * CELL_SIZE), CELL_SIZE, CELL_SIZE); }
        if (a.estado === "domesticando") { ctx.strokeStyle = "#66fcf1"; ctx.strokeRect((a.x * CELL_SIZE), (a.z * CELL_SIZE), CELL_SIZE, CELL_SIZE); }
    }

    // 3. CAJA DE SELECCIÓN (DRAG)
    if (isDragging) {
        let sx = Math.min(dragStart.x, dragCurrent.x) * CELL_SIZE; let sz = Math.min(dragStart.z, dragCurrent.z) * CELL_SIZE;
        let sw = (Math.abs(dragStart.x - dragCurrent.x) + 1) * CELL_SIZE; let sh = (Math.abs(dragStart.z - dragCurrent.z) + 1) * CELL_SIZE;
        ctx.fillStyle = "rgba(112, 224, 0, 0.2)"; ctx.fillRect(sx, sz, sw, sh);
        ctx.strokeStyle = "#70e000"; ctx.setLineDash([4, 2]); ctx.strokeRect(sx, sz, sw, sh); ctx.setLineDash([]);
    }

    // 4. DIBUJAR COLONOS
    for (let c of colonos) {
        ctx.fillStyle = c.durmiendo ? "#555" : (c === colonoSeleccionado ? "#70e000" : "#ffffff");
        ctx.beginPath(); ctx.arc((c.x * CELL_SIZE) + (CELL_SIZE/2), (c.z * CELL_SIZE) + (CELL_SIZE/2), CELL_SIZE/2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c === colonoSeleccionado ? "#ffffff" : "#70e000"; ctx.font = "9px Arial";
        ctx.fillText(c.nombre, (c.x * CELL_SIZE) - 4, (c.z * CELL_SIZE) - 2);
    }
}

generarTerreno();
crearColono(30, 25, 22); crearColono(31, 25, 25); crearColono(32, 25, 19); 
generarAnimales(6); 
inicializarHorarioUI();
setSpeed(2); 
requestAnimationFrame(gameLoop);
