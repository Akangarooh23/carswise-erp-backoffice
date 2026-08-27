/**
 * El explorador de datos no puede enseñar llaves.
 *
 * Es la pantalla que más superficie abre: cualquier tabla, cualquier columna,
 * exportable a CSV. Lo que la hace segura no es una comprobación al entrar,
 * sino dos listas —qué tablas no se enseñan y qué columnas no se devuelven
 * estén donde estén— y son dos listas que se tocan sin pensar.
 *
 * Estas pruebas fijan qué tiene que seguir oculto. La regla se comprobó además
 * contra las 801 columnas reales de la base: oculta las diez que son secreto y
 * no se le escapa ninguna.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { OCULTAS, COLUMNAS_OCULTAS } from './datos.js';

describe('tablas que no se enseñan', () => {
  const debenEstar = [
    'erp_staff_passwords',   // los hashes del personal
    'erp_refresh_tokens',    // sesiones vivas del ERP
    'erp_password_resets',   // códigos de recuperación en curso
    'moveadvisor_sessions',  // sesiones de clientes
  ];

  for (const t of debenEstar) {
    test(`${t} sigue oculta`, () => {
      assert.ok(OCULTAS.has(t), `${t} guarda credenciales: no puede aparecer en el explorador`);
    });
  }

  test('las tablas normales sí se enseñan', () => {
    // Si esta lista creciera sin querer, el explorador dejaría de servir.
    for (const t of ['moveadvisor_users', 'moveadvisor_marketplace_vo_offers', 'erp_staff', 'erp_audit_log']) {
      assert.ok(!OCULTAS.has(t), `${t} son datos de trabajo, tienen que verse`);
    }
  });
});

describe('columnas que no se devuelven nunca', () => {
  const secretos = [
    'password', 'password_hash', 'hashed_password', 'user_password',
    'token', 'refresh_token', 'access_token', 'token_seller', 'token_buyer',
    'reset_token', 'api_secret', 'secret', 'client_secret',
    'hash', 'pwd_hash',
  ];

  for (const c of secretos) {
    test(`${c} se oculta`, () => {
      assert.ok(COLUMNAS_OCULTAS.test(c), `${c} no puede salir en una consulta ni en un CSV`);
    });
  }

  test('da igual cómo esté escrito', () => {
    for (const c of ['PASSWORD', 'Token', 'Secret', 'Password_Hash']) {
      assert.ok(COLUMNAS_OCULTAS.test(c), c);
    }
  });
});

describe('lo que no es un secreto se ve', () => {
  // Estas cuatro llevan «key» o «session» en el nombre y no son credenciales:
  // son claves de búsqueda de marcas y modelos, y la referencia a una captura.
  // Están aquí para que endurecer la regla no las esconda sin querer, porque
  // ocultarlas dejaría el explorador sin poder cuadrar alias de modelos.
  const noSonSecreto = ['canonical_key', 'alias_key', 'brand_key', 'capture_session_id'];

  for (const c of noSonSecreto) {
    test(`${c} sigue visible`, () => {
      assert.ok(!COLUMNAS_OCULTAS.test(c), `${c} es un dato de trabajo, no una llave`);
    });
  }

  test('y los campos de siempre también', () => {
    for (const c of ['email', 'name', 'price', 'created_at', 'status', 'vehicle_id']) {
      assert.ok(!COLUMNAS_OCULTAS.test(c), c);
    }
  });
});
