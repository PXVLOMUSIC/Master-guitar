/* ============================================================
   Strumio — Ejercicios eficientes (práctica deliberada)
   ============================================================ */
import { t } from "./i18n.js";
import { icon } from "./icons.js";

const $ = (sel, root = document) => (root || document).querySelector(sel);
const $$ = (sel, root = document) => [...(root || document).querySelectorAll(sel)];
function clear(container) { if (container) container.innerHTML = ""; }

export const EXERCISE_CATEGORIES = [
  { id: "warmup", name: "Calentamiento", color: "#22c55e" },
  { id: "technique", name: "Técnica", color: "#ce82ff" },
  { id: "strumming", name: "Rasgueo", color: "#ff9600" },
  { id: "arpeggios", name: "Arpegios", color: "#1cb0f6" },
  { id: "barre", name: "Cejilla", color: "#ff6b9d" },
  { id: "independence", name: "Disociación", color: "#9b59b6" },
  { id: "singAndPlay", name: "Cantar y tocar", color: "#ff4b4b" },
  { id: "strength", name: "Fuerza y flexibilidad", color: "#ffc800" },
];

const catName = (id) => (EXERCISE_CATEGORIES.find((c) => c.id === id) || {}).name || id;
const catColor = (id) => (EXERCISE_CATEGORIES.find((c) => c.id === id) || {}).color || "#22c55e";

export const EXERCISES = [
  // ---------- Calentamiento ----------
  { id: "w1", category: "warmup", name: "Calentamiento de muñeca", description: "Relaja y prepara la muñeca antes de tocar.", duration: 2, difficulty: 1, steps: ["Saca los brazos y sacude las manos 20 segundos.", "Rota las muñecas lentamente en ambas direcciones.", "Estira los dedos abriendo y cerrando la mano 10 veces.", "Toca 4 compases de acordes abiertos muy suave."], tips: ["No fuerces el estiramiento.", "Mantén los hombros relajados.", "Respira de forma natural."] },
  { id: "w2", category: "warmup", name: "Cromático en 4 cuerdas", description: "Calentamiento clásico para dedos y sincronización.", duration: 3, difficulty: 1, steps: ["Toca 1-2-3-4 en cada cuerda desde la 6ª a la 1ª.", "Vuelve de la 1ª a la 6ª con 4-3-2-1.", "Mantén un tempo lento y constante.", "Repite subiendo un traste cada vuelta."], tips: ["Dedos cerca de las cuerdas.", "Punta de los dedos, no yema.", "Sin tensión en el brazo."] },
  { id: "w3", category: "warmup", name: "Acordes abiertos suaves", description: "Activa la memoria muscular de acordes básicos.", duration: 3, difficulty: 1, steps: ["Toca Am, C, G, Em en bucle.", "Un acorde por compás a 60 BPM.", "Cuida que todas las cuerdas suenen limpias.", "Repite 4 vueltas sin parar."], tips: ["Escucha cada cuerda.", "Corrige la digitación al instante.", "Mantén el ritmo estable."] },
  { id: "w4", category: "warmup", name: "Legato suave", description: "Despierta los dedos con hammer-ons y pull-offs.", duration: 4, difficulty: 2, steps: ["En una cuerda toca 5-7 con hammer-on.", "Baja 7-5 con pull-off.", "Repite en varias cuerdas.", "Aumenta el tempo poco a poco."], tips: ["El movimiento viene del dedo, no del brazo.", "Mantén la mano relajada.", "Evita golpear la cuerda."] },
  { id: "w5", category: "warmup", name: "Afinación + acorde", description: "Afina y valida con un acorde mayor.", duration: 2, difficulty: 1, steps: ["Afina las 6 cuerdas con el afinador.", "Toca un acorde de Mi mayor.", "Comprueba que no haya trasteos.", "Repite en La mayor."], tips: ["Afina siempre antes de practicar.", "Escucha batidos entre cuerdas.", "Ajusta fino."] },

  // ---------- Técnica ----------
  { id: "t1", category: "technique", name: "Spider clásico", description: "Independencia de dedos en patrón 1-2-3-4.", duration: 5, difficulty: 2, steps: ["Coloca los 4 dedos en trastes consecutivos.", "Toca 1-2-3-4 en cada cuerda.", "Baja 4-3-2-1.", "Repite subiendo un traste."], tips: ["Dedos siempre sobre la cuerda.", "No levantes de más.", "Tempo constante."] },
  { id: "t2", category: "technique", name: "Saltos de cuerda", description: "Coordina saltos entre cuerdas no adyacentes.", duration: 5, difficulty: 2, steps: ["Toca cuerda 6 luego cuerda 3.", "Repite el patrón 8 veces.", "Cambia a cuerdas 5 y 2.", "Añade 4 y 1 al final."], tips: ["Mira la cuerda destino.", "Movimiento mínimo de la mano.", "Usa metrónomo."] },
  { id: "t3", category: "technique", name: "Alternate picking", description: "Púa alternada precisa y uniforme.", duration: 5, difficulty: 2, steps: ["Toca la misma nota 8 veces alternando D/U.", "Cambia a dos notas por cuerda.", "Sube y baja el mástil.", "Aumenta 5 BPM cada minuto."], tips: ["La púa debe ser pequeña.", "Muñeca suelta.", "No aceleres antes de tiempo."] },
  { id: "t4", category: "technique", name: "Ligados (hammer/pull)", description: "Mejora la fluidez con hammer-ons y pull-offs.", duration: 4, difficulty: 2, steps: ["Toca 5h7 en una cuerda.", "Luego 7p5.", "Combina 5h7p5.", "Repite en 3 cuerdas distintas."], tips: ["El sonido debe ser igual de fuerte.", "No golpees la cuerda.", "Controla el tempo."] },
  { id: "t5", category: "technique", name: "Sweep picking básico", description: "Barrido de púa en acordes arpegiados.", duration: 6, difficulty: 3, steps: ["Arpegia un acorde mayor con una pulsación por cuerda.", "Baja con un barrido continuo.", "Sube con barrido inverso.", "Repite lentamente 8 veces."], tips: ["Una pulsación por cuerda.", "Sin pausas entre cuerdas.", "Empieza muy lento."] },

  // ---------- Rasgueo ----------
  { id: "s1", category: "strumming", name: "Patrón D D U U D U", description: "Patrón básico de pop/rock.", duration: 4, difficulty: 1, steps: ["Cuenta 1 2 3 4.", "Toca D en 1, D en 2, U en 2&, U en 3&, D en 4, U en 4&.", "Repite con un acorde mayor.", "Haz 8 compases seguidos."], tips: ["La mano nunca para de moverse.", "Acentúa el 1 y el 3.", "Mantén el brazo relajado."] },
  { id: "s2", category: "strumming", name: "Acentos en 4/4", description: "Control de dinámica con acentos.", duration: 4, difficulty: 2, steps: ["Toca rasgueos uniformes.", "Acentúa solo el tiempo 1.", "Luego acentúa 1 y 3.", "Finaliza acentuando 2 y 4."], tips: ["Acento = más fuerza, no más velocidad.", "Escucha el contraste.", "Graba y compara."] },
  { id: "s3", category: "strumming", name: "Rasgueo flamenco (abanico)", description: "Técnica de abanico con dedos.", duration: 5, difficulty: 3, steps: ["Abre los dedos y ciérralos sobre las cuerdas.", "Practica el movimiento sin sonar.", "Añade sonido con acento en el pulgar.", "Combina con pulso constante."], tips: ["Muñeca suelta.", "No tenses los dedos.", "Empieza sin guitarra si hace falta."] },
  { id: "s4", category: "strumming", name: "Síncopa y off-beat", description: "Rasgueos en tiempos débiles.", duration: 5, difficulty: 2, steps: ["Toca solo en los & (y) de cada tiempo.", "Añade un D en el 1 de vez en cuando.", "Mantén el pulso con el pie.", "Repite 8 compases."], tips: ["Cuenta en voz alta.", "No adelantes el rasgueo.", "Usa metrónomo."] },
  { id: "s5", category: "strumming", name: "Rasgueo con silencios", description: "Introduce pausas rítmicas.", duration: 4, difficulty: 2, steps: ["Patrón D - U - D U.", "El guion es silencio.", "Mantén la mano moviéndose.", "Repite cambiando el silencio de posición."], tips: ["El silencio es parte del ritmo.", "No detengas la mano.", "Escucha el hueco."] },

  // ---------- Arpegios ----------
  { id: "a1", category: "arpeggios", name: "Travis picking básico", description: "Bajo alternado con melodía en agudos.", duration: 5, difficulty: 2, steps: ["Toca bajo (pulgar) en cuerda 5 y 4 alternando.", "Añade índice en cuerda 3.", "Añade medio en cuerda 2.", "Combina en patrón continuo."], tips: ["Pulgar firme y constante.", "Dedos independientes.", "Empieza lento."] },
  { id: "a2", category: "arpeggios", name: "Arpegio de acorde mayor", description: "Arpegia un acorde mayor en orden.", duration: 4, difficulty: 1, steps: ["Toca las cuerdas del acorde de Do mayor una a una.", "Sube y luego baja.", "Mantén el ritmo del metrónomo.", "Repite con Sol mayor."], tips: ["Sonido claro en cada cuerda.", "No apagues las notas.", "Muñeca relajada."] },
  { id: "a3", category: "arpeggios", name: "Fingerstyle p-i-m-a", description: "Patrón clásico de dedos.", duration: 5, difficulty: 2, steps: ["Asigna p a cuerda 4, i a 3, m a 2, a a 1.", "Toca p-i-m-a en bucle.", "Cambia a p-m-i-a.", "Repite en 3 acordes distintos."], tips: ["Dedos curvados.", "Ataque suave.", "No cambies la mano de posición."] },
  { id: "a4", category: "arpeggios", name: "Arpegio descendente", description: "Control del orden descendente.", duration: 4, difficulty: 2, steps: ["Arpegia un acorde de arriba abajo.", "Luego de abajo arriba.", "Alterna subida/bajada cada compás.", "Aumenta el tempo gradualmente."], tips: ["Mantén el pulso.", "No saltes cuerdas.", "Escucha la melodía."] },
  { id: "a5", category: "arpeggios", name: "Arpegio con bajo alternado", description: "Bajo que se mueve mientras arpegias.", duration: 6, difficulty: 3, steps: ["Toca bajo en cuerda 5, luego arpegio en agudos.", "Cambia el bajo a cuerda 4.", "Repite con patrón de 4 tiempos.", "Combina dos acordes."], tips: ["Pulgar independiente.", "No pierdas el tempo.", "Practica por separado primero."] },

  // ---------- Cejilla ----------
  { id: "b1", category: "barre", name: "Cejilla en La (forma A)", description: "Cejilla con forma de La mayor.", duration: 4, difficulty: 2, steps: ["Coloca la cejilla en el traste 5.", "Toca la forma de La mayor.", "Comprueba que todas las cuerdas suenen.", "Baja la cejilla un traste y repite."], tips: ["Pulgar detrás del mástil.", "Presiona con el lateral del índice.", "No tenses el brazo."] },
  { id: "b2", category: "barre", name: "Cambios rápidos Em-C", description: "Velocidad en cambio cejilla-abierta.", duration: 4, difficulty: 2, steps: ["Toca Em 4 veces.", "Cambia a C con cejilla.", "Repite el ciclo 8 veces.", "Aumenta el tempo cada 2 ciclos."], tips: ["Prepara los dedos antes.", "Movimiento mínimo.", "Mantén el ritmo."] },
  { id: "b3", category: "barre", name: "Cejilla completa en F", description: "Domina el acorde de F con cejilla.", duration: 5, difficulty: 2, steps: ["Coloca índice en traste 1 (todas las cuerdas).", "Añade los demás dedos para F mayor.", "Toca el acorde y escucha cada cuerda.", "Repite 10 veces."], tips: ["Presión uniforme.", "Ajusta el ángulo del índice.", "Descansa si duele."] },
  { id: "b4", category: "barre", name: "Progresión con cejilla", description: "Encadena 4 acordes con cejilla.", duration: 5, difficulty: 3, steps: ["Toca F - Bb - C - F.", "Un acorde por compás.", "Repite la progresión 4 veces.", "Sube el tempo 5 BPM."], tips: ["Prepara el siguiente acorde.", "No mires la mano.", "Mantén el pulso."] },
  { id: "b5", category: "barre", name: "Limpieza de cuerdas mudas", description: "Evita trasteos y cuerdas apagadas.", duration: 4, difficulty: 1, steps: ["Toca un acorde con cejilla.", "Toca cuerda por cuerda.", "Corrige las que no suenan.", "Repite hasta que todas suenen limpias."], tips: ["Ajusta la presión.", "Revisa la posición del pulgar.", "Sé paciente."] },

  // ---------- Disociación ----------
  { id: "i1", category: "independence", name: "Mano izquierda/derecha desfasada", description: "Independencia rítmica entre ambas manos.", duration: 5, difficulty: 3, steps: ["Toca un patrón D U D U con la derecha.", "Con la izquierda cambia de acorde cada 2 tiempos.", "Mantén ambos sin detenerse.", "Repite 4 compases."], tips: ["Empieza muy lento.", "Cuenta en voz alta.", "No mires las manos."] },
  { id: "i2", category: "independence", name: "Ritmo en una mano, melodía en otra", description: "Acompañamiento + melodía simultáneos.", duration: 5, difficulty: 3, steps: ["Toca acordes con la derecha en negras.", "Toca una melodía simple con la izquierda.", "Combina lentamente.", "Repite la frase 4 veces."], tips: ["Practica cada mano por separado.", "Usa metrónomo.", "Sincroniza el compás."] },
  { id: "i3", category: "independence", name: "Bajo alternado + acorde", description: "Bajo constante mientras cambias acordes.", duration: 5, difficulty: 2, steps: ["Toca bajo en cuerda 5 y 4 alternando.", "Añade un acorde en el tiempo 1.", "Mantén el bajo sin parar.", "Cambia de acorde cada compás."], tips: ["Pulgar firme.", "No detengas el bajo.", "Empieza lento."] },
  { id: "i4", category: "independence", name: "Pulsación constante + acentos", description: "Mantén el pulso mientras acentúas.", duration: 4, difficulty: 2, steps: ["Toca negras constantes.", "Acentúa solo el tiempo 2.", "Cambia el acento al tiempo 4.", "Combina acentos en 2 y 4."], tips: ["La pulsación no cambia.", "Acento con fuerza, no velocidad.", "Escucha el groove."] },
  { id: "i5", category: "independence", name: "Coordinación ojo-mano", description: "Lee y toca sin mirar las manos.", duration: 4, difficulty: 2, steps: ["Coloca una partitura o tab frente a ti.", "Toca sin mirar las manos.", "Solo mira si te pierdes.", "Repite la frase 3 veces."], tips: ["Confía en la memoria muscular.", "Empieza con frases cortas.", "Mantén la postura."] },

  // ---------- Cantar y tocar ----------
  { id: "v1", category: "singAndPlay", name: "Cantar escala mientras tocas acorde", description: "Disociación vocal e instrumental básica.", duration: 4, difficulty: 2, steps: ["Toca un acorde mayor y sostenlo.", "Canta la escala mayor sobre el acorde.", "Repite en 3 tonalidades.", "Mantén el ritmo estable."], tips: ["No dejes de tocar el acorde.", "Respira entre frases.", "Empieza lento."] },
  { id: "v2", category: "singAndPlay", name: "Pulsación estable + letra", description: "Canta una letra simple sobre rasgueo.", duration: 5, difficulty: 2, steps: ["Elige un rasgueo simple.", "Canta una frase corta.", "Combina rasgueo + canto.", "Repite el estribillo."], tips: ["El ritmo manda.", "No pares el rasgueo al cantar.", "Graba y revisa."] },
  { id: "v3", category: "singAndPlay", name: "Disociación vocal/instrumental", description: "Tareas distintas en voz y guitarra.", duration: 5, difficulty: 3, steps: ["Toca un bajo constante con la guitarra.", "Canta una melodía diferente.", "Mantén ambos 4 compases.", "Cambia la melodía y repite."], tips: ["Practica por separado.", "Usa metrónomo.", "No aceleres."] },
  { id: "v4", category: "singAndPlay", name: "Cantar en tiempo (metrónomo)", description: "Sincroniza la voz con el pulso.", duration: 4, difficulty: 2, steps: ["Activa el metrónomo a 70 BPM.", "Canta una escala en negras.", "Añade guitarra en el tiempo 1.", "Repite 4 vueltas."], tips: ["Escucha el click.", "No te adelantes.", "Relaja la garganta."] },
  { id: "v5", category: "singAndPlay", name: "Acompañar canción simple", description: "Toca y canta una canción sencilla.", duration: 6, difficulty: 2, steps: ["Elige una canción de 3 acordes.", "Toca la progresión lentamente.", "Canta la melodía principal.", "Haz una vuelta completa sin parar."], tips: ["Elige una tonalidad cómoda.", "No busques perfección.", "Disfruta el proceso."] },

  // ---------- Fuerza y flexibilidad ----------
  { id: "f1", category: "strength", name: "Spider de fuerza", description: "Fuerza de dedos con spider.", duration: 4, difficulty: 2, steps: ["Coloca los 4 dedos en trastes consecutivos.", "Toca 1-3-2-4 en cada cuerda.", "Baja y sube el mástil.", "Repite 3 vueltas."], tips: ["Presión justa, no excesiva.", "Descansa entre vueltas.", "No fuerces."] },
  { id: "f2", category: "strength", name: "Estiramientos de dedos", description: "Flexibilidad y prevención de lesiones.", duration: 3, difficulty: 1, steps: ["Estira cada dedo hacia atrás suavemente.", "Mantén 10 segundos por dedo.", "Estira la muñeca en ambas direcciones.", "Repite 2 veces."], tips: ["Nunca fuerces hasta el dolor.", "Respira.", "Hazlo antes y después."] },
  { id: "f3", category: "strength", name: "Ceja y extensión", description: "Fuerza de cejilla y extensión.", duration: 4, difficulty: 2, steps: ["Coloca cejilla en traste 3.", "Estira el dedo meñique al traste 7.", "Toca la nota y sostén 5 segundos.", "Repite en 3 cuerdas."], tips: ["Controla la tensión.", "Descansa si hay dolor.", "Progresivo."] },
  { id: "f4", category: "strength", name: "Pulsos isométricos", description: "Fuerza estática de los dedos.", duration: 3, difficulty: 2, steps: ["Presiona una cuerda sin tocarla.", "Mantén 10 segundos.", "Cambia de dedo.", "Repite con los 4 dedos."], tips: ["No arquees la muñeca.", "Respira.", "Para si duele."] },
  { id: "f5", category: "strength", name: "Flexibilidad de muñeca", description: "Amplitud de movimiento de la muñeca.", duration: 3, difficulty: 1, steps: ["Rota la muñeca lentamente.", "Flexiona hacia arriba y abajo.", "Haz círculos pequeños.", "Repite 10 veces cada dirección."], tips: ["Movimiento suave.", "Sin dolor.", "Relaja el antebrazo."] },
];

let filterCat = "all";
let selectedId = null;
let timerId = null;
let remaining = 0;
let running = false;

function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  running = false;
}

function formatTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + String(s).padStart(2, "0");
}

function updateTimerDisplay(container) {
  const el = container ? container.querySelector("#exTimer") : document.querySelector("#exTimer");
  if (el) el.textContent = formatTime(remaining);
}

export function renderExercises(container) {
  function getFiltered() {
    return filterCat === "all" ? EXERCISES : EXERCISES.filter((e) => e.category === filterCat);
  }
  function getSelected() {
    return EXERCISES.find((e) => e.id === selectedId) || null;
  }

  function draw() {
    stopTimer();
    // keep remaining reset when reselect? We'll reset below if selected changed handled before draw.
    clear(container);
    const filtered = getFiltered();
    const sel = getSelected();
    if (sel && remaining === 0) remaining = sel.duration * 60;

    container.innerHTML = `
      <div class="exercises">
        <div class="card">
          <h2>${t("exercises.title")}</h2>
          <p>${t("exercises.subtitle")}</p>
        </div>
        <div class="ex-catbar">
          <button class="ex-cat ${filterCat === "all" ? "is-active" : ""}" data-cat="all">${t("exercises.all")}</button>
          ${EXERCISE_CATEGORIES.map((c) => `<button class="ex-cat ${filterCat === c.id ? "is-active" : ""}" data-cat="${c.id}" style="--c:${c.color}">${c.name}</button>`).join("")}
        </div>
        <div class="ex-grid">
          ${filtered.map((e) => `
            <button class="ex-card ${selectedId === e.id ? "is-selected" : ""}" data-id="${e.id}" style="--c:${catColor(e.category)}">
              <div class="ex-card__top">
                <span class="ex-catbadge">${catName(e.category)}</span>
                <span class="ex-diff">${"★".repeat(e.difficulty)}${"☆".repeat(3 - e.difficulty)}</span>
              </div>
              <h3>${e.name}</h3>
              <p>${e.description}</p>
              <div class="ex-meta">${icon("clock", 14)} ${e.duration} min</div>
            </button>
          `).join("")}
        </div>
        ${sel ? `
          <div class="card ex-detail">
            <div class="ex-detail__head">
              <h2>${sel.name}</h2>
              <button class="icon-btn" data-close aria-label="${t("common.cancel")}">${icon("close", 18)}</button>
            </div>
            <p>${sel.description}</p>
            <div class="ex-meta">${catName(sel.category)} · ${sel.duration} min · ${t("exercises.difficulty")} ${sel.difficulty}/3</div>
            <h3>${t("exercises.steps")}</h3>
            <ol class="ex-steps">${sel.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
            <h3>${t("exercises.tips")}</h3>
            <ul class="ex-tips">${sel.tips.map((s) => `<li>${s}</li>`).join("")}</ul>
            <div class="ex-timer">
              <div class="ex-timer__val" id="exTimer">${formatTime(remaining)}</div>
              <button class="btn btn-primary" id="exStart">${running ? t("exercises.pause") : t("exercises.start")}</button>
              <button class="btn btn-secondary" id="exReset">${t("exercises.reset")}</button>
            </div>
          </div>
        ` : ""}
      </div>
    `;

    // category handlers
    $$("[data-cat]", container).forEach((b) => {
      b.onclick = () => {
        filterCat = b.dataset.cat;
        selectedId = null;
        remaining = 0;
        running = false;
        draw();
      };
    });
    // card handlers
    $$("[data-id]", container).forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.id;
        if (selectedId === id) { selectedId = null; remaining = 0; running = false; stopTimer(); draw(); return; }
        selectedId = id;
        const ex = getSelected();
        remaining = ex ? ex.duration * 60 : 0;
        running = false;
        stopTimer();
        draw();
      };
    });
    // close
    const closeBtn = container.querySelector("[data-close]");
    if (closeBtn) closeBtn.onclick = () => { selectedId = null; remaining = 0; running = false; stopTimer(); draw(); };
    // timer handlers
    const startBtn = container.querySelector("#exStart");
    if (startBtn) startBtn.onclick = () => {
      if (running) {
        stopTimer();
        startBtn.textContent = t("exercises.start");
      } else {
        if (remaining <= 0) { const ex = getSelected(); remaining = ex ? ex.duration * 60 : 0; }
        running = true;
        startBtn.textContent = t("exercises.pause");
        timerId = setInterval(() => {
          remaining = Math.max(0, remaining - 1);
          updateTimerDisplay(container);
          if (remaining <= 0) {
            stopTimer();
            const sb = container.querySelector("#exStart");
            if (sb) sb.textContent = t("exercises.start");
          }
        }, 1000);
      }
    };
    const resetBtn = container.querySelector("#exReset");
    if (resetBtn) resetBtn.onclick = () => {
      stopTimer();
      const ex = getSelected();
      remaining = ex ? ex.duration * 60 : 0;
      const sb = container.querySelector("#exStart");
      if (sb) sb.textContent = t("exercises.start");
      updateTimerDisplay(container);
    };
  }

  draw();
}
