// --- SISTEMA CORE Y GRID ---
const WIDTH = 60, DEPTH = 60, CELL_SIZE = 14;
const TERRENO = { HUESO: 0, CARNE: 1, CAPARAZON: 2 };
const ESTRUCTURA = { NINGUNA: 0, PARED: 1, PUERTA: 2, CAMA: 3, MESA: 4 };
const BLUEPRINT = { NINGUNO: 0, MINAR: 1, CONSTRUIR_PARED: 2, CONSTRUIR_PUERTA: 3, CONSTRUIR_CAMA: 4, CONSTRUIR_MESA: 5 };

let grid = [];
let recursos = { biomasa: 50, comida: 20 };
let reloj = { dia: 1, hora: 6, minutos: 0 };
let gameSpeed = 1; // 0=Pausa, 1=Normal, 2=Rápido, 4=Ultra Rápido

let modoHerramienta = 0; 
let tareasGlobales = []; // Job Queue
let idCounter = 1;

function generarTerreno() {
    for (let x = 0; x < WIDTH; x++) {
        grid[x] = [];
        for (let z = 0; z < DEPTH; z++) {
            let ruido = Math.sin(x * 0.1) + Math.cos(z * 0.1) + (Math.sin((x + z) * 0.05) * 2);
            grid[x][z] = {
                tipo: (ruido < 0) ? TERRENO.CARNE : TERRENO.CAPARAZON,
                estructura: ESTRUCTURA.NINGUNA, plano: BLUEPRINT.NINGUNO, caminable: true
            };
        }
    }
}

// --- PATHFINDING ---
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
                // Las puertas son caminables
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

// FIX: Mueve al colono si construye algo sólido donde está parado
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

// --- ENTIDADES (COLONOS Y SOCIAL) ---
let colonos = [];
let colonoSeleccionado = null;
const NOMBRES = ["Val", "Kael", "Rye", "Jace", "Lyra", "Sion", "Tess", "Nova"];

function crearColono(x, z, edad) {
    let nuevo = {
        id: idCounter++, nombre: NOMBRES[Math.floor(Math.random() * NOMBRES.length)],
        x: x, z: z, edad: edad,
        energia: 100, hambre: 100,
        estadoTxt: "Vagando",
        rutaActual: [], tareaActual: null, durmiendo: false,
        trabajosPermitidos: { mineria: true, construccion: true },
        relaciones: {}, pareja: null 
    };
    colonos.push(nuevo);
    document.getElementById('ui-poblacion').innerText = colonos.length;
}

// --- SISTEMA DE TAREAS ---
function procesarColonos() {
    for (let colono of colonos) {
        // 1. Necesidades
        if (!colono.durmiendo) colono.energia -= 0.05;
        colono.hambre -= 0.08;
        if (colono.energia < 0) colono.energia = 0;
        if (colono.hambre < 0) colono.hambre = 0;

        // 2. Tareas Críticas (Sobrescriben el resto)
        if (colono.energia < 20 && !colono.tareaActual?.esCritica) asignarTareaDormir(colono);
        else if (colono.hambre < 25 && recursos.comida > 0 && !colono.tareaActual?.esCritica) asignarTareaComer(colono);

        // 3. Buscar Trabajo (Basado en qué tiene permitido hacer)
        if (!colono.tareaActual && tareasGlobales.length > 0 && !colono.durmiendo && colono.edad >= 10) {
            for (let i = 0; i < tareasGlobales.length; i++) {
                let tarea = tareasGlobales[i];
                let puedeHacerlo = (tarea.req === "mineria" && colono.trabajosPermitidos.mineria) || 
                                   (tarea.req === "construccion" && colono.trabajosPermitidos.construccion);
                
                if (puedeHacerlo) {
                    let ruta = encontrarRuta(colono.x, colono.z, tarea.x, tarea.z);
                    if (ruta) {
                        colono.tareaActual = tarea; colono.rutaActual = ruta; colono.estadoTxt = "Yendo a trabajar";
                        tareasGlobales.splice(i, 1); // Lo saca de la cola global
                        break; // Ya tiene trabajo, deja de buscar
                    }
                }
            }
        }

        // 4. Movimiento y Ejecución
        if (colono.rutaActual.length > 0) {
            let sig = colono.rutaActual[0];
            colono.x = sig.x; colono.z = sig.z;
            colono.rutaActual.shift();
            if (colono.rutaActual.length === 0) ejecutarTarea(colono);
        } else if (!colono.tareaActual && !colono.durmiendo) {
            // Vagabundeo e Interacción Social
            colono.estadoTxt = "Vagando";
            if (Math.random() < 0.1) {
                let rx = colono.x + (Math.floor(Math.random() * 3) - 1);
                let rz = colono.z + (Math.floor(Math.random() * 3) - 1);
                if (rx >= 0 && rx < WIDTH && rz >= 0 && rz < DEPTH && grid[rx][rz].caminable) { colono.x = rx; colono.z = rz; }
            }
            
            // Sistema Social (Relaciones)
            if (colono.edad >= 18) {
                let cercanos = colonos.filter(o => o.id !== colono.id && o.edad >= 18 && Math.abs(o.x - colono.x) <= 2 && Math.abs(o.z - colono.z) <= 2);
                if (cercanos.length > 0) {
                    let otro = cercanos[0];
                    colono.relaciones[otro.id] = (colono.relaciones[otro.id] || 0) + 1; // Aumenta afecto
                    
                    // Si hay amor, se vuelven pareja
                    if (colono.relaciones[otro.id] > 200 && !colono.pareja && !otro.pareja) {
                        colono.pareja = otro.id; otro.pareja = colono.id;
                        console.log(`¡${colono.nombre} y ${otro.nombre} se enamoraron!`);
                    }
                }
            }
        }

        // 5. Dormir y Reproducción
        if (colono.durmiendo) {
            colono.energia += 0.5; colono.estadoTxt = "Durmiendo (Zzz)";
            
            // Posibilidad de tener un hijo si la pareja duerme cerca
            if (colono.pareja && Math.random() < 0.005) {
                let parejaObj = colonos.find(c => c.id === colono.pareja);
                if (parejaObj && parejaObj.durmiendo && Math.abs(parejaObj.x - colono.x) <= 2) {
                    console.log(`¡Un bebé ha nacido en la colonia!`);
                    crearColono(colono.x, colono.z, 0); // Nace con 0 años
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
    setTimeout(() => { c.tareaActual = null; }, 1000 / gameSpeed);
}

function ejecutarTarea(c) {
    let t = c.tareaActual, celda = grid[t.x][t.z];
    if (t.tipo === "MINAR") {
        c.estadoTxt = "Minando"; celda.plano = BLUEPRINT.NINGUNO;
        if (celda.tipo === TERRENO.CARNE) recursos.comida += 2;
        if (celda.tipo === TERRENO.CAPARAZON) recursos.biomasa += 3;
    } else if (t.tipo === "CONSTRUIR_PARED" && recursos.biomasa >= 5) {
        c.estadoTxt = "Construyendo"; recursos.biomasa -= 5; celda.plano = BLUEPRINT.NINGUNO;
        celda.estructura = ESTRUCTURA.PARED; celda.caminable = false;
        asegurarCasillaLibre(c); // FIX DEL BUG
    } else if (t.tipo === "CONSTRUIR_PUERTA" && recursos.biomasa >= 3) {
        c.estadoTxt = "Construyendo"; recursos.biomasa -= 3; celda.plano = BLUEPRINT.NINGUNO;
        celda.estructura = ESTRUCTURA.PUERTA;
    } else if (t.tipo === "CONSTRUIR_CAMA" && recursos.biomasa >= 10) {
        c.estadoTxt = "Construyendo"; recursos.biomasa -= 10; celda.plano = BLUEPRINT.NINGUNO;
        celda.estructura = ESTRUCTURA.CAMA;
    } else if (t.tipo === "CONSTRUIR_MESA" && recursos.biomasa >= 15) {
        c.estadoTxt = "Construyendo"; recursos.biomasa -= 15; celda.plano = BLUEPRINT.NINGUNO;
        celda.estructura = ESTRUCTURA.MESA; celda.caminable = false;
        asegurarCasillaLibre(c); // FIX DEL BUG
    } else if (t.tipo === "DORMIR") { c.durmiendo = true; }
    
    if (t.tipo !== "DORMIR") c.tareaActual = null;
    document.getElementById('ui-biomasa').innerText = recursos.biomasa;
    document.getElementById('ui-comida').innerText = recursos.comida;
}

// --- INTERFAZ, TECLAS Y CLICK ---
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') setSpeed(gameSpeed === 0 ? 1 : 0);
    if (e.code === 'Digit1') setSpeed(1);
    if (e.code === 'Digit2') setSpeed(2);
    if (e.code === 'Digit3') setSpeed(4);
});

function setSpeed(s) {
    gameSpeed = s;
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
    if (colonoSeleccionado) { colonoSeleccionado.trabajosPermitidos[job] = document.getElementById('chk-' + job).checked; }
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = WIDTH * CELL_SIZE; canvas.height = DEPTH * CELL_SIZE;

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = Math.floor((e.clientX - rect.left) / CELL_SIZE), mz = Math.floor((e.clientY - rect.top) / CELL_SIZE);

    if (mx >= 0 && mx < WIDTH && mz >= 0 && mz < DEPTH) {
        if (modoHerramienta === 0) { // Seleccionar Colono
            let colClick = colonos.find(c => c.x === mx && c.z === mz);
            if (colClick) {
                colonoSeleccionado = colClick;
                document.getElementById('inspector-layer').style.display = 'block';
                actualizarInspectorUI();
            } else { colonoSeleccionado = null; document.getElementById('inspector-layer').style.display = 'none'; }
        } else {
            let celda = grid[mx][mz];
            if (celda.plano === BLUEPRINT.NINGUNO && celda.estructura === ESTRUCTURA.NINGUNA) {
                if (modoHerramienta === 1) { celda.plano = BLUEPRINT.MINAR; tareasGlobales.push({ tipo: "MINAR", req: "mineria", x: mx, z: mz }); }
                if (modoHerramienta === 2) { celda.plano = BLUEPRINT.CONSTRUIR_PARED; tareasGlobales.push({ tipo: "CONSTRUIR_PARED", req: "construccion", x: mx, z: mz }); }
                if (modoHerramienta === 3) { celda.plano = BLUEPRINT.CONSTRUIR_PUERTA; tareasGlobales.push({ tipo: "CONSTRUIR_PUERTA", req: "construccion", x: mx, z: mz }); }
                if (modoHerramienta === 4) { celda.plano = BLUEPRINT.CONSTRUIR_CAMA; tareasGlobales.push({ tipo: "CONSTRUIR_CAMA", req: "construccion", x: mx, z: mz }); }
                if (modoHerramienta === 5) { celda.plano = BLUEPRINT.CONSTRUIR_MESA; tareasGlobales.push({ tipo: "CONSTRUIR_MESA", req: "construccion", x: mx, z: mz }); }
            }
        }
    }
});

function actualizarInspectorUI() {
    if (!colonoSeleccionado) return;
    document.getElementById('insp-nombre').innerText = colonoSeleccionado.nombre;
    document.getElementById('insp-edad').innerText = colonoSeleccionado.edad;
    
    let parejaNom = "Ninguna";
    if (colonoSeleccionado.pareja) {
        let pObj = colonos.find(c => c.id === colonoSeleccionado.pareja);
        if (pObj) parejaNom = pObj.nombre;
    }
    document.getElementById('insp-pareja').innerText = parejaNom;
    document.getElementById('insp-estado').innerText = colonoSeleccionado.estadoTxt;
    document.getElementById('insp-energia').style.width = colonoSeleccionado.energia + "%";
    document.getElementById('insp-hambre').style.width = colonoSeleccionado.hambre + "%";
    document.getElementById('chk-mineria').checked = colonoSeleccionado.trabajosPermitidos.mineria;
    document.getElementById('chk-construccion').checked = colonoSeleccionado.trabajosPermitidos.construccion;
}

// --- BUCLE Y RENDERIZADO ---
let lastTime = 0, tickLogica = 0;
const overlayNoche = document.getElementById('night-overlay');

function gameLoop(currentTime) {
    if (lastTime === 0) lastTime = currentTime;
    let deltaTime = currentTime - lastTime; lastTime = currentTime;

    // Control de Velocidad (Time Control)
    if (gameSpeed > 0) {
        tickLogica += (deltaTime * gameSpeed);
        if (tickLogica >= 150) {
            tickLogica -= 150;
            // Reloj
            reloj.minutos += 10;
            if (reloj.minutos >= 60) {
                reloj.minutos = 0; reloj.hora += 1;
                colonos.forEach(c => c.edad += 0.01); // Envejecen lentamente
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
            
            ctx.fillStyle = (celda.tipo === TERRENO.CARNE) ? "#6e202f" : "#2c3e4a";
            ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);

            if (celda.estructura === ESTRUCTURA.PARED) {
                ctx.fillStyle = "#8a96a3"; ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                ctx.strokeStyle = "#1a252c"; ctx.strokeRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            } else if (celda.estructura === ESTRUCTURA.PUERTA) {
                ctx.fillStyle = "#8b5a2b"; // Madera
                ctx.fillRect(x * CELL_SIZE + 3, z * CELL_SIZE + 3, CELL_SIZE - 6, CELL_SIZE - 6);
            } else if (celda.estructura === ESTRUCTURA.CAMA) {
                ctx.fillStyle = "#3f51b5"; ctx.fillRect(x * CELL_SIZE + 2, z * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
            } else if (celda.estructura === ESTRUCTURA.MESA) {
                ctx.fillStyle = "#cd853f"; ctx.fillRect(x * CELL_SIZE + 1, z * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            }

            if (celda.plano !== BLUEPRINT.NINGUNO) {
                ctx.strokeStyle = (celda.plano === BLUEPRINT.MINAR) ? "#ffaa00" : "#66fcf1";
                ctx.setLineDash([2, 2]); ctx.strokeRect(x * CELL_SIZE + 1, z * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2); ctx.setLineDash([]);
            }
        }
    }

    for (let c of colonos) {
        ctx.fillStyle = c.durmiendo ? "#555" : (c === colonoSeleccionado ? "#66fcf1" : "#ffffff");
        ctx.beginPath(); ctx.arc((c.x * CELL_SIZE) + (CELL_SIZE/2), (c.z * CELL_SIZE) + (CELL_SIZE/2), CELL_SIZE/2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c === colonoSeleccionado ? "#ffffff" : "#66fcf1"; ctx.font = "9px Arial";
        ctx.fillText(c.nombre, (c.x * CELL_SIZE) - 4, (c.z * CELL_SIZE) - 2);
    }
}

generarTerreno();
crearColono(30, 30, 22); crearColono(31, 30, 25); crearColono(32, 30, 19); 
setSpeed(1); requestAnimationFrame(gameLoop);
