import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

/**
 * Elegir con quién se trabaja, en vez de escribirlo.
 *
 * El transportista de un tramo, la gestoría de un trámite y el taller de un
 * gasto se tecleaban uno por uno. Escrito a mano, «Transportes Gómez» y
 * «transportes gomez» son dos, y entonces no hay forma de contestar cuánto
 * llevamos gastado con ninguno.
 *
 * **Lo que se guarda sigue siendo el nombre**, no un identificador. Así lo
 * escrito hasta ahora sigue valiendo tal cual y nada de lo viejo se rompe: lo
 * único que cambia es que ahora se elige.
 *
 * Y se puede añadir uno nuevo sin salir de aquí. Obligar a ir a otra pantalla
 * para dar de alta un transportista, con el coche ya en la puerta, es la mejor
 * manera de que alguien escriba cualquier cosa.
 */

interface Proveedor {
  id: string;
  nombre: string;
  tipos: string[];
}

export default function ElegirProveedor({ tipo, valor, onCambio, placeholder }: {
  tipo: 'transportista' | 'gestoria' | 'taller' | 'perito' | 'vendedor' | 'otro';
  valor: string;
  onCambio: (nombre: string) => void;
  placeholder?: string;
}) {
  const [lista, setLista] = useState<Proveedor[]>([]);
  const [anadiendo, setAnadiendo] = useState(false);
  const [nuevo, setNuevo] = useState('');
  const [fallo, setFallo] = useState('');

  const carga = useCallback(async () => {
    const r = await api.get<Proveedor[]>(`/proveedores?tipo=${tipo}`);
    setLista(r.ok && Array.isArray(r.data) ? r.data : []);
  }, [tipo]);

  useEffect(() => { void carga(); }, [carga]);

  async function crea() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    setFallo('');
    const r = await api.post<Proveedor>('/proveedores', { nombre, tipos: [tipo] });
    if (!r.ok) { setFallo('No se ha podido añadir.'); return; }
    await carga();
    onCambio(nombre);
    setNuevo('');
    setAnadiendo(false);
  }

  // Lo que ya estuviera escrito y no esté en la lista sigue viéndose: un tramo
  // de hace meses no puede quedarse en blanco porque su transportista se diera
  // de baja.
  const fueraDeLista = valor && !lista.some((p) => p.nombre === valor);

  if (anadiendo) {
    return (
      <div className="flex gap-1">
        <input
          value={nuevo}
          autoFocus
          placeholder={placeholder ?? 'Nombre'}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void crea(); }}
          className="flex-1 px-3 py-2 text-sm border border-brand-200 rounded-lg"
        />
        <button onClick={() => void crea()} disabled={!nuevo.trim()}
                className="px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40">
          Añadir
        </button>
        <button onClick={() => { setAnadiendo(false); setNuevo(''); }}
                className="px-2 py-2 text-xs text-brand-400">×</button>
        {fallo && <p className="text-[11px] text-red-600">{fallo}</p>}
      </div>
    );
  }

  return (
    <select
      value={valor}
      onChange={(e) => {
        if (e.target.value === '__nuevo__') { setAnadiendo(true); return; }
        onCambio(e.target.value);
      }}
      className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white"
    >
      <option value="">{placeholder ?? 'Elegir…'}</option>
      {fueraDeLista && <option value={valor}>{valor}</option>}
      {lista.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
      <option value="__nuevo__">+ Añadir uno nuevo</option>
    </select>
  );
}
