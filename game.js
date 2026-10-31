// --- 1. SISTEMA DE CUADRÍCULA (GRID SYSTEM) ---
// Dimensiones de la matriz volumétrica
const WIDTH = 60;
const HEIGHT = 15; // Representa la profundidad/altitud en 3D
const DEPTH = 60;
const CELL_SIZE = 12; // Tamaño de renderizado en píxeles (Vista Top-Down 2D)

// Diccionario de tipos de tejido orgánico
const TIPOS_TEJIDO = {
    HUESO: 0,
    CARNE: 1,
    CAPARAZON: 2
};

// Matriz 3D que almacena el volumen del Leviatán
let voxelGrid = [];

function inicializarGrid() {
    for (let x = 0; x < WIDTH; x++) {
        voxelGrid[x] = [];
        for (let y = 0; y < HEIGHT; y++) {
            voxelGrid[x][y] = [];
            for (let z = 0; z < DEPTH; z++) {
                
                // Generación de topografía en capas
                let tejidoActual = TIPOS_TEJIDO.HUESO;
                if (y >= HEIGHT * 0.3) tejidoActual = TIPOS_TEJIDO.CARNE;
                if (y >= HEIGHT * 0.8) tejidoActual = TIPOS_TEJIDO.CAPARAZON;

                // Cada Voxel almacena sus datos volumétricos
                voxelGrid[x][y][z] = {
                    nivelAltitud: y,
                    tipoTejido: tejidoActual,
                    nivelFluidoActual: 0,
                    nivelToxicidad: 0
                };
            }
        }
    }
    console.log("Matriz volumétrica inicializada. Tamaño:", WIDTH * HEIGHT * DEPTH, "voxels.");
}

// --- 2. CICLO DE TIEMPO (TICK RATE) ---
let lastTime = performance.now();
let acumuladorFluidos = 0;
let acumuladorColonos = 0;

let contadorTicksFluidos = 0;
let contadorTicksColonos = 0;

const uiTickFluidos = document.getElementById('fluid-tick-count');
const uiTickColonos = document.getElementById('colonist-tick-count');

function actualizarTicks(deltaTime) {
    acumuladorFluidos += deltaTime;
    acumuladorColonos += deltaTime;

    // Separación de la simulación: Fluidos cada 100ms
    if (acumuladorFluidos >= 100) {
        acumuladorFluidos -= 100;
        contadorTicksFluidos++;
        uiTickFluidos.innerText = contadorTicksFluidos;
        // Preparado para la propagación de fluidos (Fase 2)
    }

    // Separación de la simulación: Colonos cada 500ms
    if (acumuladorColonos >= 500) {
        acumuladorColonos -= 500;
        contadorTicksColonos++;
        uiTickColonos.innerText = contadorTicksColonos;
        // Preparado para la evaluación de árboles de comportamiento (Fase 3)
    }
}

// --- 3. RENDERIZADO VISUAL ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = WIDTH * CELL_SIZE;
canvas.height = DEPTH * CELL_SIZE;

function renderizarMapaVisual() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Para simplificar la visualización 3D en un Canvas 2D, renderizamos un "corte transversal" 
    // enfocado en la capa superior donde ocurre la vida de la colonia.
    const capaVisibleY = Math.floor(HEIGHT * 0.85); 

    for (let x = 0; x < WIDTH; x++) {
        for (let z = 0; z < DEPTH; z++) {
            const voxel = voxelGrid[x][capaVisibleY][z];
            
            // Paleta de colores orgánicos para los tejidos
            switch(voxel.tipoTejido) {
                case TIPOS_TEJIDO.HUESO:
                    ctx.fillStyle = "#d8d3c5"; // Calcio/Blanco pálido
                    break;
                case TIPOS_TEJIDO.CARNE:
                    ctx.fillStyle = "#8a2b3b"; // Rojo oscuro/Músculo
                    break;
                case TIPOS_TEJIDO.CAPARAZON:
                    ctx.fillStyle = "#2c3e4a"; // Azul grisáceo oscuro/Quitina
                    break;
            }

            // Dibuja el Voxel
            ctx.fillRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            
            // Dibuja la cuadrícula sutil para estructurar la visual
            ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
            ctx.strokeRect(x * CELL_SIZE, z * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
    }
}

// --- 4. BUCLE PRINCIPAL (GAME LOOP) ---
function gameLoop(currentTime) {
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    // Ejecuta la lógica de simulación
    actualizarTicks(deltaTime);
    
    // Ejecuta el renderizado a la máxima tasa de refresco del monitor
    renderizarMapaVisual();

    requestAnimationFrame(gameLoop);
}

// Inicialización
inicializarGrid();
requestAnimationFrame(gameLoop);
