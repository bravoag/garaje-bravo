// ui/mas.js — menú "Más": accesos a las subpantallas.
import { estadoSync } from '../sync.js';
import { textoEstado } from './ajustes.js';
import { esc } from '../util.js';
export function render(vista) {
  const [icono, texto, clase] = textoEstado(estadoSync());
  vista.innerHTML = `
    <header class="cabecera"><span class="etiqueta">Menú</span><h1>Más</h1></header>
    <a class="tarjeta estado-sync-mas" href="#/ajustes"><span class="estado ${clase}"><span aria-hidden="true">${icono}</span> ${esc(texto)}</span></a>
    <nav class="lista" aria-label="Más opciones">
      <a href="#/historico">Histórico</a>
      <a href="#/vehiculos">Vehículos</a>
      <a href="#/catalogo">Catálogo de ítems</a>
      <a href="#/ajustes">Ajustes y sincronización</a>
    </nav>
    <p class="solo-pc-aviso">Exportar Excel, hoja de vida y respaldo: disponible desde un ordenador.</p>`;
}
