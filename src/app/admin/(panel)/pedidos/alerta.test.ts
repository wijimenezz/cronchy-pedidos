import { describe, expect, it } from "vitest";
import { idsNuevos } from "./alerta";

describe("idsNuevos", () => {
  // EL CASO QUE IMPORTA. Al abrir el panel, la lista de vistos se siembra con los pedidos que
  // llegan del servidor. Si no se sembrara, cada recarga sonaría como si todo fuera nuevo y
  // el aviso dejaría de significar "entró un pedido".
  it("al abrir con la lista sembrada no hay ninguno nuevo", () => {
    const iniciales = ["a", "b", "c"];
    expect(idsNuevos(iniciales, iniciales)).toEqual([]);
  });

  it("detecta el que no estaba", () => {
    expect(idsNuevos(["a", "b"], ["a", "b", "c"])).toEqual(["c"]);
  });

  it("detecta varios de una vez", () => {
    expect(idsNuevos(["a"], ["a", "b", "c"])).toEqual(["b", "c"]);
  });

  // Aceptar un pedido lo saca de "Sin aceptar". Eso no es una novedad: es lo contrario.
  it("un pedido que desaparece no cuenta como nuevo", () => {
    expect(idsNuevos(["a", "b"], ["a"])).toEqual([]);
  });

  // Que se acepte uno y entre otro en la misma vuelta del polling tiene que avisar del que
  // entró, no callarse porque el total no cambió.
  it("distingue el que entra del que sale aunque el total no cambie", () => {
    expect(idsNuevos(["a", "b"], ["b", "c"])).toEqual(["c"]);
  });

  it("el primer arranque sin nada previo avisa de todo", () => {
    expect(idsNuevos([], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("una lista vacía no avisa de nada", () => {
    expect(idsNuevos(["a"], [])).toEqual([]);
  });

  // El orden en que llegan de la consulta no debería cambiar la respuesta: lo que importa es
  // el conjunto, no la posición.
  it("no depende del orden", () => {
    expect(idsNuevos(["b", "a"], ["a", "b"])).toEqual([]);
  });
});
