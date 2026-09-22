/**
 * El número de negocio de una cosa: CLI-0007, IDC-0003, ENC-2026-0001.
 *
 * Un cliente en la base es `074a51b3-c8d8-470a-ac11-333ed2439784` y un IDCar
 * `idcar-1790076532522-w3hajh`. Eso vale para la máquina; por teléfono y en un
 * contrato hace falta algo que se pueda decir en voz alta. Lo pone la base al
 * dar de alta —un disparador contra un contador— y se enseña igual en todas las
 * pantallas para que sea reconocible: en monoespaciada, pequeño y en gris, que
 * es una etiqueta, no un titular.
 *
 * Se pinta `–` cuando no hay: una fila que venga de antes de que existiera la
 * numeración no debe dejar un hueco raro en la tabla.
 */
export function Numero({ valor, className = '' }: { valor?: string | null; className?: string }) {
  const n = String(valor ?? '').trim();
  return (
    <span className={`font-mono text-[11px] tracking-tight text-brand-300 ${className}`}>
      {n || '–'}
    </span>
  );
}
