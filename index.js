import {memory} from "wasm-game-of-life/wasm_game_of_life_bg.wasm";
import {Universe} from "wasm-game-of-life";

const CELL_SIZE = 10;
const GRID_THICKNESS = 1;
const GRID_COLOR = "#CCCCCC";
const DEAD_COLOR = "#FFFFFF";
const ALIVE_COLOR = "#000000";
const HEATMAP_DELTA = 0.1;

const generation = document.getElementById("generation");
const population = document.getElementById("population");
const hovered_cell = document.getElementById("hovered_cell");

const canvas = document.getElementById("game-of-life-canvas");

const playPauseButton = document.getElementById("play-pause");
const tickButton = document.getElementById("tick");
const framerateInput = document.getElementById("framerate");
const heatmapCheckbox = document.getElementById("heatmap");
const resetButton = document.getElementById("reset");
const lifeProbabilityInput = document.getElementById("life-probability");
const gridSizeInput = document.getElementById("grid-size");

let universe = null;

function resetHoverText() {
    hovered_cell.innerHTML = `<em>Hover a cell to see its status</em>`;
}

function hoverCell(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const row = Math.floor(y / (CELL_SIZE + GRID_THICKNESS));
    const col = Math.floor(x / (CELL_SIZE + GRID_THICKNESS));
    const cell_status = universe.get_cells()[universe.get_index(row, col)];
    hovered_cell.innerText = `Cell ${row}, ${col} is ${cell_status ? "alive" : "dead"}. Click to ${cell_status ? "kill" : "revive"}.`;
}

function clickCell(event) {
    if (!paused) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const row = Math.floor(y / (CELL_SIZE + GRID_THICKNESS));
    const col = Math.floor(x / (CELL_SIZE + GRID_THICKNESS));
    universe.toggle_cell(row, col);
    drawUniverse();
}

canvas.addEventListener("mousemove", hoverCell);
canvas.addEventListener("mouseleave", resetHoverText);
canvas.addEventListener("click", clickCell);

function spawnUniverse() {
    const lifeProbability = lifeProbabilityInput.value ?? 0.5;
    const gridSize = gridSizeInput.value ?? 64;
    universe = Universe.new(gridSize, gridSize, lifeProbability);
    // Set canvas size
    canvas.height = (CELL_SIZE + GRID_THICKNESS) * universe.height() + GRID_THICKNESS;
    canvas.width = (CELL_SIZE + GRID_THICKNESS) * universe.width() + GRID_THICKNESS;
    reset_heatmap = true;
    drawUniverse();
}

resetButton.addEventListener("click", spawnUniverse);

playPauseButton.addEventListener("click", () => {
    paused = !paused;
    if (paused) {
        playPauseButton.textContent = "Play";
        tickButton.disabled = "";
    } else {
        playPauseButton.textContent = "Pause";
        tickButton.disabled = "disabled";
    }
});

tickButton.addEventListener("click", doTick);

framerateInput.addEventListener("change", () => {
    framerate = framerateInput.value;
});

heatmapCheckbox.addEventListener("change", () => {
    heatmap = heatmapCheckbox.checked;
    if (heatmap) {
        reset_heatmap = true;
    }
})

let heatmap = false;
let reset_heatmap = false;
let paused = true;
let framerate = framerateInput.value;
let lastFrameTime = 0;

function drawGrid(ctx) {
    // Draw grid
    ctx.beginPath();
    ctx.strokeStyle = GRID_COLOR;

    // Vertical lines
    for (let i = 0; i <= universe.width(); i++) {
        ctx.moveTo(i * (CELL_SIZE + GRID_THICKNESS) + GRID_THICKNESS, 0);
        ctx.lineTo(i * (CELL_SIZE + GRID_THICKNESS) + GRID_THICKNESS, (CELL_SIZE + GRID_THICKNESS) * universe.height() + GRID_THICKNESS);
    }

    // Horizontal lines
    for (let j = 0; j <= universe.height(); j++) {
        ctx.moveTo(0, j * (CELL_SIZE + GRID_THICKNESS) + GRID_THICKNESS);
        ctx.lineTo((CELL_SIZE + GRID_THICKNESS) * universe.width() + GRID_THICKNESS, j * (CELL_SIZE + GRID_THICKNESS) + GRID_THICKNESS);
    }

    ctx.stroke();
}

const update_color_value = (current_value, darken = false) => Math.max(
    0,
    Math.min(
        255,
        current_value + (darken ? -1 : 1) * 255 * HEATMAP_DELTA
    )
);

function getCellColour(current_color, new_state) {
    if (!heatmap) {
        return new_state ? ALIVE_COLOR : DEAD_COLOR;
    }
    const [r, g, b, a] = reset_heatmap?
        [Math.floor(255 / 2), Math.floor(255 / 2), Math.floor(255 / 2), 1] :
        current_color.match(/\d+/g).map(Number);
    return `rgba(${update_color_value(r, new_state)}, ${update_color_value(g, new_state)}, ${update_color_value(b, new_state)}, ${a})`;
}

function bitIsSet(idx, arr) {
    const byte = Math.floor(idx / 8);
    const mask = 1 << (idx % 8);
    return (arr[byte] & mask) === mask;
}

function drawCells(ctx) {
    // Draw cells
    const cellsPtr = universe.get_cells_as_ptr();
    const cells = new Uint8Array(
        memory.buffer,
        cellsPtr,
        universe.width() * universe.height() / 8 // 8 cells per byte
    );

    ctx.beginPath();
    for (let row = 0; row < universe.height(); row++) {
        for (let col = 0; col < universe.width(); col++) {
            const idx = universe.get_index(row, col);
            // Get old color from centre of cell in old image data
            const data = ctx.getImageData(
                col * (CELL_SIZE + GRID_THICKNESS) + GRID_THICKNESS + CELL_SIZE / 2,
                row * (CELL_SIZE + GRID_THICKNESS) + GRID_THICKNESS + CELL_SIZE / 2,
                1,
                1
            ).data;
            const old_color = `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${data[3] / 255})`;
            ctx.fillStyle = getCellColour(old_color, bitIsSet(idx, cells));
            ctx.fillRect(
                col * (CELL_SIZE + GRID_THICKNESS) + GRID_THICKNESS,
                row * (CELL_SIZE + GRID_THICKNESS) + GRID_THICKNESS,
                CELL_SIZE,
                CELL_SIZE
            );
        }
    }

    ctx.stroke();
}

function drawUniverse() {
    const ctx = canvas.getContext("2d");
    ctx.willReadFrequently = true;
    drawGrid(ctx);
    drawCells(ctx);
    generation.innerText = universe.generation();
    population.innerText = universe.population();
}

function doTick() {
    lastFrameTime = performance.now();
    universe.tick();
    drawUniverse();

    if (reset_heatmap)
        reset_heatmap = false;
}

const renderLoop = () => {
    if (universe && !paused && performance.now() - lastFrameTime > 1000 / framerate)
        doTick();
    requestAnimationFrame(renderLoop);
}

spawnUniverse();
requestAnimationFrame(renderLoop);