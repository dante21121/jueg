// --- SISTEMA CORE Y GRID ---
const WIDTH = 60, DEPTH = 60, CELL_SIZE = 14;
const TERRENO = { HUESO: 0, CARNE: 1, CAPARAZON: 2 };
const ESTRUCTURA = { NINGUNA: 0, PARED: 1, PUERTA: 2, CAMA: 3, MESA: 4, CULTIVO: 5 };
const BLUEPRINT = { NINGUNO: 0, MINAR: 1, CONSTRUIR_PARED: 2, CONSTRUIR_PUERTA: 3, CONSTRUIR_CAMA: 4, CONSTRUIR_MESA: 5, DESTRUIR: 6, CONSTRUIR_CULTIVO: 7, COSECHAR: 8 };

const COSTOS = { "CONSTRUIR_PARED": 5, "CONSTRUIR_PUERTA": 3, "CONSTRUIR_CAMA": 10, "CONSTRUIR_MESA": 15, "CONSTRUIR_CULTIVO": 1 };

let grid = [];
let recursos = { biomasa: 50, comida: 20 };
let reloj = { dia: 1, hora: 6, minutos: 0 };
let gameSpeed = 0.5; // 0=Pausa, 0.5=1x(Lento), 1=2x(Normal), 3=4x(Rápido)

let modoHerramienta = 0; 
let tareasGlobales = []; // Cola de órdenes
let idCounter = 1;

// Variables para Selección por Arrastre (Drag & Build)
let isDragging = false;
let dragStart = {x: -1, z: -1}, dragCurrent = {x: -1, z: -1};

function generarTerreno() {
    for (let x = 0; x < WIDTH; x++) {
        grid[x] = [];
        for (let z = 0; z < DEPTH; z++) {
            let ruido = Math.sin(x * 0.1) + Math.cos(z * 0.1) + (Math.sin((x + z) * 0.05) * 2);
            grid[x][z] = {
                tipo: (ruido < 0) ? TERRENO.CARNE : TERRENO.CAPARAZON,
                estructura: ESTRUCTURA.NINGUNA, plano: BLUEPRINT.NINGUNO, 
                caminable: true, crecimientoCultivo: 0
            };
        }
    }
}

// --- PATHFINDING Y MOVIMIENTO ---
function encontrarRuta(startX, startZ, targetX, targetZ) {
    if (startX === targetX && startZ === targetZ) return [];
    let queue = [{x: startX, z: startZ, path: []}];
    let visited = new Set(); visited.add(`${startX},${startZ}`);
    let direcciones = [{x:0,z:-1}, {x:0,z:1}, {x:-1,z:0}, {x:1,z:0}];

    while (queue.length > 0) {
        let current = queue.shift();
        for (let dir of direcciones) {
            let nx = current.x + dir.x, nz = current.z + dir.z;
            if (nx === targetX && nz === targetZ) return [...current.path, {x: nx, z: nz}];
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

function asegurarCasillaLibre(colono) {
    if (!grid[colono.x][colono.z].caminable && grid[colono.x][colono.z].estructura !== ESTRUCTURA.PUERTA) {
        let vecinos = [{x:0,z:1}, {x:0,z:-1}, {x:1,z:0}, {x:-1,z:0}, {x:1,z:1}, {x:-1,z:-1}];
        for (let v of vecinos) {
            let nx = colono.x + v.x, nz = colono.z + v.z;
            if (nx >= 0 && nx < WIDTH && nz >= 0 && nz < DEPTH && grid[nx][nz].caminable) {
                colono.x = nx; colono.z = nz; return;
            }
        }
    }
}

// --- COLONOS ---
let colonos = [];
let colonoSeleccionado = null;
const NOMBRES = ["Val", "Kael", "Rye", "Jace", "Lyra", "Sion", "Tess", "Nova"];

function crearColono(x, z, edad) {
    colonos.push({
        id: idCounter++, nombre: NOMBRES[Math.floor(Math.random() * NOMBRES.length)],
        x: x, z: z, edad: edad, energia: 100, hambre: 100,
        estadoTxt: "Vagando", rutaActual: [], tareaActual: null, durmiendo: false,
        trabajosPermitidos: { mineria: true, construccion: true, agricultura: true },
        relaciones: {}, pareja: null 
    });
    document.getElementById('ui-poblacion').innerText = colonos.length;
}

// --- MOTOR DE TAREAS Y AGRICULTURA ---
function procesarColonos() {
    // Procesar crecimiento de cultivos de la base entera
    for (let x = 0; x < WIDTH; x++) {
        for (let z = 0; z < DEPTH; z++) {
            let celda = grid[x][z];
            if (celda.estructura === ESTRUCTURA.CULTIVO && celda.plano !== BLUEPRINT.COSECHAR) {
                if (reloj.hora > 6 && reloj.hora < 19) { // Solo crecen de día
                    celda.crecimientoCultivo += 0.5; 
                    if (celda.crecimientoCultivo >= 100) {
                        celda.crecimientoCultivo = 100;
                        celda.plano = BLUEPRINT.COSECHAR;
                        tareasGlobales.push({ tipo: "COSECHAR", req: "agricultura", x: x, z: z });
                    }
                }
            }
        }
    }

    // Inteligencia Artificial de los Colonos
    for (let colono of colonos) {
        if (!colono.durmiendo) colono.energia -= 0.05;
        colono.hambre -= 0.08;
        if (colono.energia < 0) colono.energia = 0;
        if (colono.hambre < 0) colono.hambre = 0;

        // Necesidades Críticas
        if (colono.energia < 20 && !colono.tareaActual?.esCritica) asignarTareaDormir(colono);
        else if (colono.hambre < 25 && recursos.comida > 0 && !colono.tareaActual?.esCritica) asignarTareaComer(colono);

        // BUSCAR TRABAJO CON CHEQUEO CONSTANTE DE RECURSOS
        if (!colono.tareaActual && tareasGlobales.length > 0 && !colono.durmiendo && colono.edad >= 10) {
            for (let i = 0; i < tareasGlobales.length; i++) {
                let tarea = tareasGlobales[i];
                let puedeHacerlo = colono.trabajosPermitidos[tarea.req];
                
                // Si la tarea requiere biomasa, comprueba que haya en almacén
                let costoReq = COSTOS[tarea.tipo] || 0;
                let hayRecursos = recursos.biomasa >= costoReq;

                if (puedeHacerlo && hayRecursos) {
                    let ruta = encontrarRuta(colono.x, colono.z, tarea.x, tarea.z);
                    if (ruta) {
                        colono.tareaActual = tarea; colono.rutaActual = ruta; colono.estadoTxt = "Trabajando";
                        tareasGlobales.splice(i, 1); 
                        break; 
                    }
                }
            }
        }

        // MOVERSE A LA TAREA O EJECUTAR
        if (colono.rutaActual.length > 0) {
            let sig = colono.rutaActual[0];
            colono.x = sig.x; colono.z = sig.z;
            colono.rutaActual.shift();
            if (colono.rutaActual.length === 0) ejecutarTarea(colono);
        } else if (!colono.tareaActual && !colono.durmiendo) {
            
            // VAGABUNDEO ACTIVO (Movimiento continuo más rápido y amplio)
            colono.estadoTxt = "Vagando";
            if (Math.random() < 0.4) { // Alta probabilidad de moverse
                let nx = colono.x + (Math.floor(Math.random() * 5) - 2); // Radio de 2 bloques
                let nz = colono.z + (Math.floor(Math.random() * 5) - 2);
                if (nx >= 0 && nx < WIDTH && nz >= 0 && nz < DEPTH && grid[nx][nz].caminable) { 
                    colono.x = nx; colono.z = nz; 
                }
            }
            
            // Relaciones Sociales
            if (colono.edad >= 18) {
                let cercanos = colonos.filter(o => o.id !== colono.id && o.edad >= 18 && Math.abs(o.x - colono.x) <= 3 && Math.abs(o.z - colono.z) <= 3);
                if (cercanos.length > 0) {
                    let otro = cercanos[0];
                    colono.relaciones[otro.id] = (colono.relaciones[otro.id] || 0) + 1; 
                    if (colono.relaciones[otro.id] > 200 && !colono.pareja && !otro.pareja) {
                        colono.pareja = otro.id; otro.pareja = colono.id;
                    }
                }
            }
        }

        // DORMIR Y REPRODUCCIÓN
        if (colono.durmiendo) {
            colono.energia += 0.5; colono.estadoTxt = "Durmiendo (Zzz)";
            if (colono.pareja && Math.random() < 0.005) {
                let pObj = colonos.find(c => c.id === colono.pareja);
                if (pObj && pObj.durmiendo && Math.abs(pObj.x - colono.x) <= 2) {
                    crearColono(colono.x, colono.z, 0); 
                }
            }
            if (colono.energia >= 100 || (reloj.hora >= 6 && reloj.hora < 20)) {
                colono.durmiendo = false; colono.tareaActual = null; 
            }
        }
    }
    actualizarInspectorUI();
}

function asignarTareaDormir(c) {
    c.tareaActual = { tipo: "DORMIR", esCritica: true, x: c.x, z: c.z };
    for (let x = 0; x < WIDTH; x++) {
        for (let z = 0; z < DEPTH; z++) {
            if (grid[x][z].estructura === ESTRUCTURA.CAMA) {
                let r = encontrarRuta(c.x, c.z, x, z);
                if (r) { c.tareaActual = { tipo: "DORMIR", esCritica: true, x: x, z: z }; c.rutaActual = r; c.estadoTxt = "Buscando cama"; return; }
            }
        }
    }
    c.durmiendo = true;
}

function asignarTareaComer(c) {
    c.tareaActual = { tipo: "COMER", esCritica: true }; c.rutaActual = [];
    recursos.comida -= 1; c.hambre = 100; c.estadoTxt = "Comiendo";
    setTimeout(() => { c.tareaActual = null; }, 1000 / (gameSpeed === 0 ? 1 : gameSpeed));
}

function ejecutarTarea(c) {
    let t = c.tareaActual, celda = grid[t.x][t.z];
    let costo = COSTOS[t.tipo] || 0;

    // Doble comprobación: ¿Alguien más gastó los recursos mientras yo caminaba hacia aquí?
    if (costo > 0 && recursos.biomasa < costo) {
        tareasGlobales.push(t); // Devuelve la tarea a la cola
        c.tareaActual = null; c.estadoTxt = "Sin recursos";
        return; 
    }

    if (t.tipo === "MINAR") {
        celda.plano = BLUEPRINT.NINGUNO;
        if (celda.tipo === TERRENO.CARNE) recursos.comida += 2;
        if (celda.tipo === TERRENO.CAPARAZON) recursos.biomasa += 3;
    } 
    else if (t.tipo === "DESTRUIR") {
        celda.plano = BLUEPRINT.NINGUNO;
        celda.estructura = ESTRUCTURA.NINGUNA;
        celda.caminable = true;
        recursos.biomasa += 2; // Recuperas algo al demoler
    }
    else if (t.tipo === "COSECHAR") {
        celda.plano = BLUEPRINT.NINGUNO;
        celda.crecimientoCultivo = 0; // Se reinicia el cultivo
        recursos.comida += 4;
    }
    else if (t.tipo.startsWith("CONSTRUIR")) {
        recursos.biomasa -= costo; 
        celda.plano = BLUEPRINT.NINGUNO;
        
        if (t.tipo === "CONSTRUIR_PARED") { celda.estructura = ESTRUCTURA.PARED; celda.caminable = false; asegurarCasillaLibre(c); }
        if (t.tipo === "CONSTRUIR_PUERTA") celda.estructura = ESTRUCTURA.PUERTA;
        if (t.tipo === "CONSTRUIR_CAMA") celda.estructura = ESTRUCTURA.CAMA;
        if (t.tipo === "CONSTRUIR_MESA") { celda.estructura = ESTRUCTURA.MESA; celda.caminable = false; asegurarCasillaLibre(c); }
        if (t.tipo === "CONSTRUIR_CULTIVO") { celda.estructura = ESTRUCTURA.CULTIVO; celda.crecimientoCultivo = 0; }
    }
    
    if (t.tipo !== "DORMIR") c.tareaActual = null;
    document.getElementById('ui-biomasa').innerText = recursos.biomasa;
    document.getElementById('ui-comida').innerText = recursos.comida;
}

// --- INTERFAZ, HERRAMIENTAS Y SELECCIÓN MÚLTIPLE (DRAG) ---
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') setSpeed(gameSpeed === 0 ? 1 : 0);
    if (e.code === 'Digit1') setSpeed(1); // 1x = 0.5 vel
    if (e.code === 'Digit2') setSpeed(2); // 2x = 1 vel
    if (e.code === 'Digit3') setSpeed(4); // 4x = 3 vel
});

function setSpeed(s) {
    if(s === 1) gameSpeed = 0.5; // Doble de lento
    else if(s === 2) gameSpeed = 1;
    else if(s === 4) gameSpeed = 3;
    else gameSpeed = 0;

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

function toggleJob(job) {
    if (colonoSeleccionado) colonoSeleccionado.trabajosPermitidos[job] = document.getElementById('chk-' + job).checked;
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = WIDTH * CELL_SIZE; canvas.height = DEPTH * CELL_SIZE;

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = Math.floor((e.clientX - rect.left) / CELL_SIZE), mz = Math.floor((e.clientY - rect.top) / CELL_SIZE);
    
    if (mx >= 0 && mx < WIDTH && mz >= 0 && mz < DEPTH) {
        if (modoHerramienta === 0) {
            let colClick = colonos.find(c => c.x === mx && c.z === mz);
            if (colClick) {
                colonoSeleccionado = colClick;
                document.getElementById('inspector-layer').style.display = 'block';
                actualizarInspectorUI();
            } else { colonoSeleccionado = null; document.getElementById('inspector-layer').style.display = 'none'; }
        } else {
            isDragging = true;
            dragStart = {x: mx, z: mz}; dragCurrent = {x: mx, z: mz};
        }
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
    
    // Calcular bounding box para pintar varios bloques
    let startX = Math.min(dragStart.x, dragCurrent.x), endX = Math.max(dragStart.x, dragCurrent.x);
    let startZ = Math.min(dragStart.z, dragCurrent.z), endZ = Math.max(dragStart.z, dragCurrent.z);

    for (let x = startX; x <= endX; x++) {
        for (let z = startZ; z <= endZ; z++) {
            aplicarHerramientaCelda(x, z);
        }
    }
});

function aplicarHerramientaCelda(mx, mz) {
    let celda = grid[mx][mz];
    
    // Herramienta 6: CANCELAR o DESTRUIR
    if (modoHerramienta === 6) {
        if (celda.plano !== BLUEPRINT.NINGUNO) {
            celda.plano = BLUEPRINT.NINGUNO; // Cancela plano
            tareasGlobales = tareasGlobales.filter(t => t.x !== mx || t.z !== mz); // Elimina de la cola
        } else if (celda.estructura !== ESTRUCTURA.NINGUNA) {
            celda.plano = BLUEPRINT.DESTRUIR;
            tareasGlobales.push({ tipo: "DESTRUIR", req: "construccion", x: mx, z: mz });
        }
        return;
    }

    // Otras herramientas solo si está libre
    if (celda.plano === BLUEPRINT.NINGUNO && celda.estructura === ESTRUCTURA.NINGUNA) {
        if (modoHerramienta === 1) { celda.plano = BLUEPRINT.MINAR; tareasGlobales.push({ tipo: "MINAR", req: "mineria", x: mx, z: mz }); }
        if (modoHerramienta === 2) { celda.plano = BLUEPRINT.CONSTRUIR_PARED; tareasGlobales.push({ tipo: "CONSTRUIR_PARED", req: "construccion", x: mx, z: mz }); }
        if (modoHerramienta === 3) { celda.plano = BLUEPRINT.CONSTRUIR_PUERTA; tareasGlobales.push({ tipo: "CONSTRUIR_PUERTA", req: "construccion", x: mx, z: mz }); }
        if (modoHerramienta === 4) { celda.plano = BLUEPRINT.CONSTRUIR_CAMA; tareasGlobales.push({ tipo: "CONSTRUIR_CAMA", req: "construccion", x: mx, z: mz }); }
        if (modoHerramienta === 5) { celda.plano = BLUEPRINT.CONSTRUIR_MESA; tareasGlobales.push({ tipo: "CONSTRUIR_MESA", req: "construccion", x: mx, z: mz }); }
        if (modoHerramienta === 7) { celda.plano = BLUEPRINT.CONSTRUIR_CULTIVO; tareasGlobales.push({ tipo: "CONSTRUIR_CULTIVO", req: "agricultura", x: mx, z: mz }); }
    }
}

function actualizarInspectorUI() {
    if (!colonoSeleccionado) return;
    document.getElementById('insp-nombre').innerText = colonoSeleccionado.nombre;
    document.getElementById('insp-edad').innerText = Math.floor(colonoSeleccionado.edad);
    let pObj = colonoSeleccionado.pareja ? colonos.find(c => c.id === colonoSeleccionado.pareja) : null;
    document.getElementById('insp-pareja').innerText = pObj ? pObj.nombre : "Ninguna";
    document.getElementById('insp-estado').innerText = colonoSeleccionado.estadoTxt;
    document.getElementById('insp-energia').style.width = colonoSeleccionado.energia + "%";
    document.getElementById('insp-hambre').style.width = colonoSeleccionado.hambre + "%";
    document.getElementById('chk-mineria').checked = colonoSeleccionado.trabajosPermitidos.mineria;
    document.getElementById('chk-construccion').checked = colonoSeleccionado.trabajosPermitidos.construccion;
    document.getElementById('chk-agricultura').checked = colonoSeleccionado.trabajosPermitidos.agricultura;
}

// --- BUCLE Y RENDERIZADO ---
let lastTime = 0, tickLogica = 0;
const overlayNoche = document.getElementById('night-overlay');

function gameLoop(currentTime) {
    if (lastTime === 0) lastTime = currentTime;
    let deltaTime = currentTime - lastTime; lastTime = currentTime;

    if (gameSpeed > 0) {
        tickLogica += (deltaTime * gameSpeed);
        if (tickLogica >= 150) { // A velocidad 1x (0.5), esto ocurre menos frecuente, ralentizando la IA visiblemente
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
    for (let x = 0; x < WIDTH; x++) {
        for (let z = 0; z < DEPTH; z++) {
            let celda = grid[x][z];
            
            // Suelo base
            ctx.fillStyle = (celda.tipo === TERRENO.CARNE) ? "#6e202f" : "#2c3e4a";
            ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);

            // Estructuras
            if (celda.estructura === ESTRUCTURA.PARED) {
                ctx.fillStyle = "#8a96a3"; ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                ctx.strokeStyle = "#1a252c"; ctx.strokeRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            } else if (celda.estructura === ESTRUCTURA.PUERTA) {
                ctx.fillStyle = "#8b5a2b"; ctx.fillRect(x * CELL_SIZE + 3, z * CELL_SIZE + 3, CELL_SIZE - 6, CELL_SIZE - 6);
            } else if (celda.estructura === ESTRUCTURA.CAMA) {
                ctx.fillStyle = "#3f51b5"; ctx.fillRect(x * CELL_SIZE + 2, z * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
            } else if (celda.estructura === ESTRUCTURA.MESA) {
                ctx.fillStyle = "#cd853f"; ctx.fillRect(x * CELL_SIZE + 1, z * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            } else if (celda.estructura === ESTRUCTURA.CULTIVO) {
                // El cultivo cambia de color a verde brillante según su crecimiento
                let verdor = Math.floor(50 + (celda.crecimientoCultivo * 2));
                ctx.fillStyle = `rgb(20, ${verdor}, 20)`; 
                ctx.fillRect(x * CELL_SIZE + 1, z * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
                if (celda.crecimientoCultivo >= 100) {
                    // Cultivo Listo (Fruta)
                    ctx.fillStyle = "#ffaa00"; ctx.beginPath(); ctx.arc((x*CELL_SIZE)+(CELL_SIZE/2), (z*CELL_SIZE)+(CELL_SIZE/2), 3, 0, Math.PI*2); ctx.fill();
                }
            }

            // Planos (Blueprints transparentes) y marcas de Destrucción
            if (celda.plano !== BLUEPRINT.NINGUNO) {
                if (celda.plano === BLUEPRINT.DESTRUIR) ctx.strokeStyle = "#ff4c4c"; // Rojo para demolición
                else if (celda.plano === BLUEPRINT.MINAR || celda.plano === BLUEPRINT.COSECHAR) ctx.strokeStyle = "#ffaa00";
                else if (celda.plano === BLUEPRINT.CONSTRUIR_CULTIVO) ctx.strokeStyle = "#4caf50";
                else ctx.strokeStyle = "#66fcf1";
                
                ctx.setLineDash([2, 2]); ctx.strokeRect(x * CELL_SIZE + 1, z * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2); ctx.setLineDash([]);
            }
        }
    }

    // Dibujar Box de Selección (Drag)
    if (isDragging) {
        let sx = Math.min(dragStart.x, dragCurrent.x) * CELL_SIZE;
        let sz = Math.min(dragStart.z, dragCurrent.z) * CELL_SIZE;
        let sw = (Math.abs(dragStart.x - dragCurrent.x) + 1) * CELL_SIZE;
        let sh = (Math.abs(dragStart.z - dragCurrent.z) + 1) * CELL_SIZE;
        
        ctx.fillStyle = "rgba(102, 252, 241, 0.2)"; ctx.fillRect(sx, sz, sw, sh);
        ctx.strokeStyle = "#66fcf1"; ctx.setLineDash([4, 2]); ctx.strokeRect(sx, sz, sw, sh); ctx.setLineDash([]);
    }

    // Colonos
    for (let c of colonos) {
        ctx.fillStyle = c.durmiendo ? "#555" : (c === colonoSeleccionado ? "#66fcf1" : "#ffffff");
        ctx.beginPath(); ctx.arc((c.x * CELL_SIZE) + (CELL_SIZE/2), (c.z * CELL_SIZE) + (CELL_SIZE/2), CELL_SIZE/2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c === colonoSeleccionado ? "#ffffff" : "#66fcf1"; ctx.font = "9px Arial";
        ctx.fillText(c.nombre, (c.x * CELL_SIZE) - 4, (c.z * CELL_SIZE) - 2);
    }
}

generarTerreno();
crearColono(30, 30, 22); crearColono(31, 30, 25); crearColono(32, 30, 19); 
setSpeed(2); // Inicia en modo 2x (que ahora es el ritmo normal original)
requestAnimationFrame(gameLoop);
