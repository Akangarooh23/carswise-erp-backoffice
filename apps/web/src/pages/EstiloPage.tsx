import { useState } from 'react';
import Boton from '../components/ui/Boton.js';
import { Campo, Selector, Area } from '../components/ui/Campo.js';
import Icono, { type NombreIcono } from '../components/ui/Icono.js';

/**
 * La guia de estilo del ERP.
 *
 * Existe por dos razones. La primera, poder mirar las piezas juntas: es la
 * unica forma de ver si un boton secundario pesa demasiado al lado del
 * principal, o si dos grises se parecen tanto que no distinguen nada.
 *
 * La segunda, que quien construya la proxima pantalla no tenga que adivinar.
 * Aqui empezaron cinco estilos distintos de boton y catorce de cabecera de
 * tabla porque cada pantalla se dibujo a mano; esta pagina es la respuesta a
 * «¿como era el boton de guardar?».
 */

const ICONOS: NombreIcono[] = [
  'panel', 'usuarios', 'coche', 'calendario', 'llave-inglesa', 'ticket', 'llave',
  'megafono', 'documento', 'embudo', 'grafico', 'taller', 'tarjeta', 'edificio',
  'escudo', 'equipo', 'tabla', 'historial', 'servicio', 'ojo', 'informe',
  'estrella', 'diamante', 'reloj', 'aviso', 'comprobado', 'euro', 'bandeja',
  'salir', 'buscar', 'sobre', 'telefono', 'descargar', 'subir', 'refrescar',
  'imagen', 'carpeta', 'lapiz', 'rayo', 'bateria', 'surtidor', 'bidon',
];

const COLORES: { nombre: string; clase: string; hex: string; nota?: string }[] = [
  { nombre: 'Pop Black', clase: 'bg-brand-600', hex: '#111111', nota: 'Acciones y texto. Con blanco encima.' },
  { nombre: 'Pop Yellow', clase: 'bg-acento', hex: '#FFC400', nota: 'Solo relleno. Siempre con negro encima.' },
  { nombre: 'Amarillo oscuro', clase: 'bg-acento-oscuro', hex: '#E6B000', nota: 'El amarillo al pasar el raton.' },
  { nombre: 'Amarillo tenue', clase: 'bg-acento-tenue', hex: '#FFF6D9', nota: 'Fondos de aviso.' },
  { nombre: 'Gris 400', clase: 'bg-brand-400', hex: '#5E5E59', nota: 'Texto secundario.' },
  { nombre: 'Gris 200', clase: 'bg-brand-200', hex: '#C9C7C0', nota: 'Bordes.' },
  { nombre: 'Gris 50', clase: 'bg-brand-50', hex: '#F5F5F4', nota: 'Fondos de tabla.' },
];

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-brand-600 mb-1">{titulo}</h2>
      {nota && <p className="text-[13px] text-brand-300 mb-4 max-w-2xl">{nota}</p>}
      <div className="rounded-xl border border-brand-200 bg-white p-5">{children}</div>
    </section>
  );
}

export default function EstiloPage() {
  const [texto, setTexto] = useState('');

  return (
    <div className="p-6 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-brand-600">Guía de estilo</h1>
        <p className="text-[13px] text-brand-300 mt-1 max-w-2xl">
          Las piezas comunes del ERP. Antes de dibujar una pantalla nueva, mírala
          aquí: es lo que evita que acaben conviviendo cinco botones distintos.
        </p>
      </header>

      <Seccion titulo="Color" nota="Negro, amarillo y blanco. El amarillo es relleno o va sobre negro; nunca texto pequeño sobre blanco, porque no llega al contraste mínimo.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {COLORES.map((c) => (
            <div key={c.nombre}>
              <div className={`${c.clase} h-14 rounded-lg border border-brand-200`} />
              <p className="text-[13px] font-semibold text-brand-600 mt-2">{c.nombre}</p>
              <p className="text-[11px] text-brand-300 font-mono">{c.hex}</p>
              {c.nota && <p className="text-[11px] text-brand-300 mt-1 leading-snug">{c.nota}</p>}
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Botones" nota="La variante dice qué hace, no solo cómo se ve. Una acción de acento por pantalla: si hay dos, ninguna destaca.">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <Boton variante="acento" icono="comprobado">Guardar y notificar</Boton>
          <Boton variante="primario" icono="documento">Crear contrato</Boton>
          <Boton variante="secundario" icono="tabla">Exportar</Boton>
          <Boton variante="fantasma">Cancelar</Boton>
          <Boton variante="peligro" icono="aviso">Eliminar</Boton>
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <Boton variante="acento" tam="sm">Pequeño</Boton>
          <Boton variante="secundario" tam="sm" icono="buscar">Buscar</Boton>
          <Boton variante="primario" cargando>Guardando</Boton>
          <Boton variante="secundario" disabled>Sin permiso</Boton>
        </div>
        <p className="text-[12px] text-brand-300">
          Pulsa Tab para recorrerlos: el foco se ve. Sin eso no se puede usar el
          ERP con el teclado.
        </p>
      </Seccion>

      <Seccion titulo="Campos" nota="La etiqueta va unida al campo, así que pinchar en el nombre lleva al campo. Antes había 169 campos y 6 uniones.">
        <div className="grid md:grid-cols-2 gap-4">
          <Campo etiqueta="Matrícula" placeholder="0000 XXX" value={texto} onChange={(e) => setTexto(e.target.value)} requerido />
          <Campo etiqueta="Kilómetros" type="number" placeholder="92367" ayuda="Sin puntos ni separadores." />
          <Selector etiqueta="Combustible" vacio="Todos" opciones={[
            { valor: 'gasolina', texto: 'Gasolina' },
            { valor: 'diesel', texto: 'Diésel' },
            { valor: 'hibrido', texto: 'Híbrido' },
            { valor: 'electrico', texto: 'Eléctrico' },
          ]} />
          <Campo etiqueta="Precio" type="number" error="El precio no puede ser negativo." defaultValue={-1} />
          <Area etiqueta="Notas internas" ayuda="Privadas: no se envían al cliente." className="md:col-span-2" placeholder="Lo que el equipo debe saber…" />
        </div>
      </Seccion>

      <Seccion titulo="Iconos" nota="Dibujados aquí, no traídos de una librería. Heredan el color del texto, así que el mismo icono vale sobre fondo claro y sobre el lateral negro.">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-y-4 gap-x-3 mb-5">
          {ICONOS.map((n) => (
            <div key={n} className="flex items-center gap-2 text-brand-500">
              <Icono nombre={n} tam={18} />
              <span className="text-[12px] font-mono text-brand-300">{n}</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-sidebar p-4 flex flex-wrap gap-4">
          {ICONOS.slice(0, 10).map((n) => (
            <span key={n} className="text-acento"><Icono nombre={n} tam={20} /></span>
          ))}
        </div>
      </Seccion>
    </div>
  );
}
