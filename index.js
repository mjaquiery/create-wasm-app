import {memory} from "wasm-game-of-life/wasm_game_of_life_bg.wasm";
import {Universe} from "wasm-game-of-life";

const CELL_SIZE = 10;
const GRID_THICKNESS = 1;
const GRID_COLOR = "#CCCCCC";
const ALIVE_COLOR = "#000000";
const DEAD_COLOR = "#FFFFFF";
const HEATMAP_DELTA = 0.1;

const ORIENTATIONS = ["↘","↙","↖","↗"]

const generation = document.getElementById("generation");
const population = document.getElementById("population");
const hovered_cell = document.getElementById("hovered_cell");
const instructions = document.getElementById("instructions");
const orientation = document.getElementById("orientation");

const canvas = document.getElementById("game-of-life-canvas");

const playPauseButton = document.getElementById("play-pause");
const tickButton = document.getElementById("tick");
const framerateInput = document.getElementById("framerate");
const heatmapCheckbox = document.getElementById("heatmap");
const resetButton = document.getElementById("reset");
const clearButton = document.getElementById("clear");
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
    // if (!paused) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const row = Math.floor(y / (CELL_SIZE + GRID_THICKNESS));
    const col = Math.floor(x / (CELL_SIZE + GRID_THICKNESS));
    if (event.shiftKey) {
        universe.add_glider(row, col, ORIENTATIONS.indexOf(orientation.innerText));
    } else if (event.ctrlKey) {
        universe.add_pulsar(row, col);
    } else {
        universe.toggle_cell(row, col);
    }
    drawUniverse();
}

canvas.addEventListener("mousemove", hoverCell);
canvas.addEventListener("mouseleave", resetHoverText);
canvas.addEventListener("click", clickCell);
canvas.addEventListener("wheel", (e) => {
    if (e.deltaY < 0) {
        orientation.innerText = ORIENTATIONS[(ORIENTATIONS.indexOf(orientation.innerText) + 1) % ORIENTATIONS.length];
    } else {
        orientation.innerText = ORIENTATIONS[(ORIENTATIONS.indexOf(orientation.innerText) - 1 + ORIENTATIONS.length) % ORIENTATIONS.length];
    }
});

function spawnUniverse(life_probability) {
    const lifeProbability = life_probability ?? lifeProbabilityInput.value ?? 0.5;
    const gridSize = gridSizeInput.value ?? 64;
    universe = Universe.new(gridSize, gridSize, lifeProbability);
    // Set canvas size
    canvas.height = (CELL_SIZE + GRID_THICKNESS) * universe.height() + GRID_THICKNESS;
    canvas.width = (CELL_SIZE + GRID_THICKNESS) * universe.width() + GRID_THICKNESS;
    reset_heatmap = true;
    drawUniverse();
}

resetButton.addEventListener("click", spawnUniverse);
clearButton.addEventListener("click", () => spawnUniverse(0));

playPauseButton.addEventListener("click", () => {
    paused = !paused;
    if (paused) {
        playPauseButton.textContent = "Play";
        // instructions.innerHTML = `Click to toggle a cell. <kbd>Shift</kbd>-click to add a glider, <kbd>Ctrl</kbd>-click to add a pulsar.`;
        tickButton.disabled = "";
    } else {
        playPauseButton.textContent = "Pause";
        // instructions.innerHTML = `<em>Pause to edit the game board.</em>`;
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

const fps = new class {
  constructor() {
    this.fps = document.getElementById("fps");
    this.frames = [];
    this.lastFrameTimeStamp = performance.now();
  }

  render() {
    // Convert the delta time since the last frame render into a measure
    // of frames per second.
    const now = performance.now();
    const delta = now - this.lastFrameTimeStamp;
    this.lastFrameTimeStamp = now;
    const fps = 1 / delta * 1000;

    // Save only the latest 100 timings.
    this.frames.push(fps);
    if (this.frames.length > 100) {
      this.frames.shift();
    }

    // Find the max, min, and mean of our 100 latest timings.
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let i = 0; i < this.frames.length; i++) {
      sum += this.frames[i];
      min = Math.min(this.frames[i], min);
      max = Math.max(this.frames[i], max);
    }
    let mean = sum / this.frames.length;

    // Render the statistics.
    this.fps.textContent = `
Frames per Second:
         latest = ${Math.round(fps)}
avg of last 100 = ${Math.round(mean)}
min of last 100 = ${Math.round(min)}
max of last 100 = ${Math.round(max)}
`.trim();
  }
};

const renderLoop = () => {
    if (universe && !paused && performance.now() - lastFrameTime > 1000 / framerate) {
        doTick();
        fps.render();
    }
    requestAnimationFrame(renderLoop);
}

spawnUniverse();
requestAnimationFrame(renderLoop);