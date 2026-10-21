// ui/ajustes.js — repo de datos, token (solo en este dispositivo), estado de sync y umbrales.
import { datos, guardarConfig } from '../estado.js';
import { esc } from '../util.js';
import { leerConfig, guardarConfigSync, quitarToken, sincronizar, estadoSync, alEstado, REPO_DEFECTO } from '../sync.js';
import { toast } from './componentes.js';
import { exportarExcel, exportarJSON, leerRespaldo, aplicarRespaldo } from '../exportar.js';

// Se registra una sola vez; cada render reemplaza `repintarEstado`.
let repintarEstado = null;
alEstado(s => repintarEstado?.(s));

export function textoEstado(s) {
  if (!s.configurado) return ['●', 'Modo local: los datos solo están en este dispositivo.', 'estado-proximo'];
  if (s.sincronizando) return ['…', 'Sincronizando…', 'estado-sin-registro'];
  if (s.error) return ['▲', s.error.mensaje, 'estado-vencido'];
  if (s.pendiente) return ['●', 'Hay cambios pendientes de subir.', 'estado-proximo'];
  return ['✓', 'Sincronizado', 'estado-ok'];
}

export function render(vista) {
  const cfg = leerConfig();
  vista.innerHTML = `<div id="ajustes">
    <header class="cabecera"><span class="etiqueta">Sincronización</span><h1>Ajustes</h1></header>

    <section class="formulario">
      <h2>Datos en GitHub</h2>
      <div class="tarjeta" id="estado-sync" aria-live="polite"></div>
      <form class="formulario" id="form-sync" novalidate autocomplete="off">
        <label class="campo">Repositorio de datos (propietario/repo)
          <input class="entrada" name="repo" value="${esc(cfg.repo || REPO_DEFECTO)}" autocapitalize="off" spellcheck="false">
        </label>
        <label class="campo">Token de GitHub
          <input class="entrada" type="password" name="token" placeholder="${cfg.token ? 'Guardado en este dispositivo — deja vacío para conservarlo' : 'github_pat_…'}" autocomplete="off" spellcheck="false">
        </label>
        <p class="ayuda">El token vive solo en este dispositivo. Se pega una vez en cada celular o PC.</p>
        <p class="error" role="alert" hidden></p>
        <button class="btn btn-primario ancho" type="submit">Guardar y sincronizar</button>
        <button class="btn ancho" type="button" id="sync-ahora">Sincronizar ahora</button>
        ${cfg.token ? '<button class="btn ancho peligro" type="button" id="quitar-token">Quitar el token de este dispositivo</button>' : ''}
      </form>
    </section>

    <section class="formulario programados">
      <h2>Alertas</h2>
      <form class="formulario" id="form-umbrales" novalidate>
        <div class="fila">
          <label class="campo">Aviso de precio (%)<input class="entrada" type="number" inputmode="numeric" min="1" step="1" name="umbralPrecioPct" value="${esc(datos.config.umbralPrecioPct)}"></label>
          <label class="campo">Días sin actualizar km<input class="entrada" type="number" inputmode="numeric" min="1" step="1" name="diasSinKm" value="${esc(datos.config.diasSinKm)}"></label>
        </div>
        <p class="ayuda">Avisa si un precio se aleja más de ese % del último pagado, y si pasan esos días sin registrar km.</p>
        <button class="btn ancho" type="submit">Guardar alertas</button>
      </form>
    </section>

    <section class="formulario programados">
      <h2>Exportar y respaldo</h2>
      <div class="formulario solo-pc">
        <button class="btn ancho" type="button" id="exp-excel">Exportar Excel (.xlsx)</button>
        <button class="btn ancho" type="button" id="exp-json">Exportar respaldo JSON</button>
        <button class="btn ancho" type="button" id="imp-json">Importar respaldo JSON</button>
        <input type="file" id="archivo-json" accept="application/json,.json" hidden>
        <p class="ayuda">El respaldo JSON incluye todos los datos (no las fotos, que viven en el repositorio). Al importar se fusiona por id: nunca se borra nada de lo que ya tienes.</p>
      </div>
      <p class="solo-pc-aviso">Exportar y respaldos: disponible desde un ordenador.</p>
    </section>
  </div>`;

  const raiz = vista.querySelector('#ajustes');
  const caja = raiz.querySelector('#estado-sync');
  const pintar = s => {
    const [icono, texto, clase] = textoEstado(s);
    const ultimo = s.ultimoSync ? `<p class="ayuda">Último sync: ${esc(new Date(s.ultimoSync).toLocaleString('es'))}</p>` : '';
    caja.innerHTML = `<span class="estado ${clase}"><span aria-hidden="true">${icono}</span> ${esc(texto)}</span>${s.aviso ? `<p class="ayuda">${esc(s.aviso)}</p>` : ''}${ultimo}`;
  };
  repintarEstado = pintar;
  pintar(estadoSync());

  const errorEl = raiz.querySelector('#form-sync .error');
  raiz.querySelector('#form-sync').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const repo = String(f.get('repo')).trim();
    const token = String(f.get('token')).trim();
    errorEl.hidden = true;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { errorEl.textContent = 'El repositorio debe tener el formato propietario/repo.'; errorEl.hidden = false; return; }
    if (!token && !leerConfig().token) { errorEl.textContent = 'Pega el token de GitHub.'; errorEl.hidden = false; return; }
    guardarConfigSync({ repo, ...(token ? { token } : {}) });
    e.target.token.value = '';
    const r = await sincronizar();
    toast(r.ok ? 'Sincronizado' : (estadoSync().error?.mensaje ?? 'No se pudo sincronizar'));
    if (!leerConfig().token) return;
    render(vista);   // refleja que el token quedó guardado
  });

  raiz.querySelector('#sync-ahora').addEventListener('click', async () => {
    if (!estadoSync().configurado) return toast('Primero guarda el repositorio y el token.');
    const r = await sincronizar();
    toast(r.ok ? 'Sincronizado' : (estadoSync().error?.mensaje ?? 'No se pudo sincronizar'));
  });

  raiz.querySelector('#quitar-token')?.addEventListener('click', () => {
    if (!confirm('¿Quitar el token de este dispositivo? Los datos locales se conservan; dejará de sincronizar.')) return;
    quitarToken();
    toast('Token quitado');
    render(vista);
  });

  raiz.querySelector('#form-umbrales').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const umbral = Number(f.get('umbralPrecioPct')), dias = Number(f.get('diasSinKm'));
    if (!(umbral > 0) || !(dias > 0)) return toast('Los valores deben ser mayores que 0.');
    guardarConfig({ umbralPrecioPct: umbral, diasSinKm: dias });
    toast('Alertas guardadas');
  });

  raiz.querySelector('#exp-excel')?.addEventListener('click', async () => {
    const formato = await exportarExcel();
    toast(formato === 'xlsx' ? 'Excel descargado' : 'No pude cargar SheetJS: descargué CSV de respaldo');
  });
  raiz.querySelector('#exp-json')?.addEventListener('click', () => { exportarJSON(); toast('Respaldo descargado'); });
  const archivo = raiz.querySelector('#archivo-json');
  raiz.querySelector('#imp-json')?.addEventListener('click', () => archivo.click());
  archivo?.addEventListener('change', async () => {
    const f = archivo.files[0];
    archivo.value = '';
    if (!f) return;
    const r = await leerRespaldo(f);
    if (!r.ok) return toast(r.error);
    const c = r.conteos;
    if (!confirm(`Importar respaldo: ${c.vehiculos} vehículos, ${c.trabajos} trabajos, ${c.combustible} llenados, ${c.seguros} seguros y ${c.items} ítems.

Se fusiona con tus datos actuales (gana el registro más reciente); no se borra nada. ¿Continuar?`)) return;
    aplicarRespaldo(r.datos);
    toast('Respaldo importado');
  });
}
