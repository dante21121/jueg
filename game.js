// --- 1. SISTEMA DE CUADRÍCULA Y TOPOGRAFÍA ORGÁNICA ---
const WIDTH = 60;
const DEPTH = 60;
const CELL_SIZE = 12;

const TIPOS_TEJIDO = { HUESO: 0, CARNE: 1, CAPARAZON: 2 };
const TIPOS_FLUIDO = { NINGUNO: 0, AGUA: 1, LINFA: 2, SANGRE_TOXICA: 3 };

// Para optimizar el cálculo de fluidos (Cellular Automata), usamos un mapa de alturas (Heightmap 2.5D)
let voxelGrid = [];

// Función de ruido simple para simular Perlin Noise y crear "pliegues y venas"
function generarRuidoOrganico(x, z) {
    let escala1 = Math.sin(x * 0.1) + Math.cos(z * 0.1);
    let escala2 = Math.sin((x + z) * 0.05) * 2;
    return (escala1 + escala2); // Retorna ondas suaves
}

function inicializarGrid() {
    for (let x = 0; x < WIDTH; x++) {
        voxelGrid[x] = [];
        for (let z = 0; z < DEPTH; z++) {
            
            // Generación procedural de topografía orgánica
            let ruido = generarRuidoOrganico(x, z);
            let altitudBase = 10 + Math.floor(ruido * 3); // Alturas entre 4 y 16 aprox.
            
            let tejidoActual = TIPOS_TEJIDO.CAPARAZON;
            if (altitudBase < 8) tejidoActual = TIPOS_TEJIDO.CARNE;

            voxelGrid[x][z] = {
                nivelAltitud: altitudBase,
                tipoTejido: tejidoActual,
                tipoFluido: TIPOS_FLUIDO.NINGUNO,
                cantidadFluido: 0, // Volumen de líquido
                nivelToxicidad: 0
            };
        }
    }
}

// --- 2. SIMULADOR HIDRÁULICO (CELLULAR AUTOMATA) ---
function simularFluidos() {
    // Creamos una copia del estado actual para no calcular en cascada en el mismo tick
    let proximoEstado = JSON.parse(JSON.stringify(voxelGrid));

    for (let x = 1; x < WIDTH - 1; x++) {
        for (let z = 1; z < DEPTH - 1; z++) {
            let celdaActual = voxelGrid[x][z];
            
            if (celdaActual.cantidadFluido > 0) {
                // Buscar celdas vecinas con menor altitud + nivel de fluido
                let alturaActualTotal = celdaActual.nivelAltitud + celdaActual.cantidadFluido;
                
                let vecinos = [
                    { nx: x, nz: z - 1 }, // Arriba
                    { nx: x, nz: z + 1 }, // Abajo
                    { nx: x - 1, nz: z }, // Izquierda
                    { nx: x + 1, nz: z }  // Derecha
                ];

                let vecinoMasBajo = null;
                let menorAlturaEncontrada = alturaActualTotal;

                for (let v of vecinos) {
                    let celdaVecina = voxelGrid[v.nx][v.nz];
                    let alturaVecinaTotal = celdaVecina.nivelAltitud + celdaVecina.cantidadFluido;
                    
                    // Si el vecino es más bajo, el fluido fluye hacia allá
                    if (alturaVecinaTotal < menorAlturaEncontrada) {
                        menorAlturaEncontrada = alturaVecinaTotal;
                        vecinoMasBajo = v;
                    }
                }

                // Propagación del fluido
                if (vecinoMasBajo != null) {
                    // Movemos una unidad de fluido al vecino
                    proximoEstado[x][z].cantidadFluido -= 1;
                    if (proximoEstado[x][z].cantidadFluido === 0) {
                        proximoEstado[x][z].tipoFluido = TIPOS_FLUIDO.NINGUNO;
                    }

                    proximoEstado[vecinoMasBajo.nx][vecinoMasBajo.nz].cantidadFluido += 1;
                    proximoEstado[vecinoMasBajo.nx][vecinoMasBajo.nz].tipoFluido = celdaActual.tipoFluido;
                }
            }
        }
    }
    // Actualizamos el mundo
    voxelGrid = proximoEstado;
}

// --- 3. CICLO DE TIEMPO (TICK RATE) ---
let lastTime = performance.now();
let acumuladorFluidos = 0;
let acumuladorColonos = 0;
let contadorTicksFluidos = 0;

const uiTickFluidos = document.getElementById('fluid-tick-count');

function actualizarTicks(deltaTime) {
    acumuladorFluidos += deltaTime;
    acumuladorColonos += deltaTime;

    // El fluido se actualiza cada 100ms
    if (acumuladorFluidos >= 100) {
        acumuladorFluidos -= 100;
        contadorTicksFluidos++;
        uiTickFluidos.innerText = contadorTicksFluidos;
        
        // Ejecutamos la lógica del autómata celular
        simularFluidos();
    }

    if (acumuladorColonos >= 500) {
        acumuladorColonos -= 500;
        // Fase 3 (Agentes) irá aquí
    }
}

// --- 4. HERRAMIENTAS DE TERRAFORMACIÓN (INTERACCIÓN) ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = WIDTH * CELL_SIZE;
canvas.height = DEPTH * CELL_SIZE;

// Al hacer clic, generamos "Linfa del Leviatán"
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const mouseZ = Math.floor((e.clientY - rect.top) / CELL_SIZE);

    if (mouseX >= 0 && mouseX < WIDTH && mouseZ >= 0 && mouseZ < DEPTH) {
        // Derrame masivo para ver fluir el líquido
        voxelGrid[mouseX][mouseZ].tipoFluido = TIPOS_FLUIDO.LINFA;
        voxelGrid[mouseX][mouseZ].cantidadFluido += 10; 
    }
});

// --- 5. RENDERIZADO VISUAL CON RELIEVE ---
function renderizarMapaVisual() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let x = 0; x < WIDTH; x++) {
        for (let z = 0; z < DEPTH; z++) {
            const voxel = voxelGrid[x][z];
            
            // 1. Dibujar el tejido base con sombreado de relieve (altitud)
            let intensidadLuz = 10 + (voxel.nivelAltitud * 8); // A más altura, más brillo
            
            if (voxel.tipoTejido === TIPOS_TEJIDO.CAPARAZON) {
                ctx.fillStyle = `rgb(${intensidadLuz}, ${intensidadLuz + 20}, ${intensidadLuz + 30})`;
            } else if (voxel.tipoTejido === TIPOS_TEJIDO.CARNE) {
                ctx.fillStyle = `rgb(${intensidadLuz + 60}, ${intensidadLuz}, ${intensidadLuz + 10})`;
            }
            
            ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);

            // 2. Dibujar los fluidos encima si existen
            if (voxel.cantidadFluido > 0) {
                if (voxel.tipoFluido === TIPOS_FLUIDO.LINFA) {
                    ctx.fillStyle = `rgba(200, 180, 50, 0.8)`; // Linfa amarillenta/viscosa
                } else if (voxel.tipoFluido === TIPOS_FLUIDO.AGUA) {
                    ctx.fillStyle = `rgba(50, 150, 255, 0.8)`; // Agua limpia
                }
                ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }
    }
}

// --- 6. GAME LOOP ---
function gameLoop(currentTime) {
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    actualizarTicks(deltaTime);
    renderizarMapaVisual();

    requestAnimationFrame(gameLoop);
}

inicializarGrid();
requestAnimationFrame(gameLoop);
