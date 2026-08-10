import { describe, expect, it } from "vitest";
import { leerEventoEvolution, resumenDeMensaje } from "./evolution";

function evento(parcial: {
  event?: string;
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
  pushName?: string | null;
  message?: Record<string, unknown> | null;
} = {}) {
  return {
    event: parcial.event ?? "messages.upsert",
    instance: "cronchy",
    data: {
      key: {
        remoteJid: parcial.remoteJid ?? "573001234567@s.whatsapp.net",
        fromMe: parcial.fromMe ?? false,
        id: parcial.id ?? "3EB0C767D26B8A3F1B2C",
      },
      pushName: parcial.pushName === undefined ? "Wilson" : parcial.pushName,
      message: parcial.message === undefined ? { conversation: "Hola" } : parcial.message,
      messageTimestamp: 1786700000,
    },
  };
}

describe("leerEventoEvolution", () => {
  it("lee un mensaje de texto", () => {
    expect(leerEventoEvolution(evento())).toEqual({
      telefono: "573001234567",
      waMessageId: "3EB0C767D26B8A3F1B2C",
      tipo: "texto",
      texto: "Hola",
      nombreWa: "Wilson",
    });
  });

  // El texto viaja en tres sitios distintos según cómo se escribió, y para quien atiende los tres
  // son lo mismo.
  it("encuentra el texto donde sea que venga", () => {
    const citado = leerEventoEvolution(
      evento({ message: { extendedTextMessage: { text: "  ¿Y la salsa?  " } } }),
    );
    expect(citado?.texto).toBe("¿Y la salsa?");
    expect(citado?.tipo).toBe("texto");

    const conPie = leerEventoEvolution(
      evento({ message: { imageMessage: { caption: "Ahí está el pago" } } }),
    );
    expect(conPie?.texto).toBe("Ahí está el pago");
    expect(conPie?.tipo).toBe("imagen");
  });

  it("clasifica lo que no es texto y lo deja sin texto", () => {
    const foto = leerEventoEvolution(evento({ message: { imageMessage: { mimetype: "image/jpeg" } } }));
    expect(foto).toMatchObject({ tipo: "imagen", texto: null });

    const nota = leerEventoEvolution(evento({ message: { audioMessage: { seconds: 4 } } }));
    expect(nota).toMatchObject({ tipo: "audio", texto: null });

    const sticker = leerEventoEvolution(evento({ message: { stickerMessage: {} } }));
    expect(sticker).toMatchObject({ tipo: "otro", texto: null });
  });

  // Lo saliente ya se guardó al enviarlo; volver a escribirlo aquí lo duplicaría con otro id.
  it("descarta lo que sale de nosotros", () => {
    expect(leerEventoEvolution(evento({ fromMe: true }))).toBeNull();
  });

  it("descarta grupos y estados", () => {
    expect(leerEventoEvolution(evento({ remoteJid: "120363000000000000@g.us" }))).toBeNull();
    expect(leerEventoEvolution(evento({ remoteJid: "status@broadcast" }))).toBeNull();
  });

  it("descarta los eventos que no son mensajes nuevos", () => {
    expect(leerEventoEvolution(evento({ event: "messages.update" }))).toBeNull();
    expect(leerEventoEvolution(evento({ event: "connection.update" }))).toBeNull();
  });

  it("descarta un teléfono que no es un celular colombiano", () => {
    expect(leerEventoEvolution(evento({ remoteJid: "12025550123@s.whatsapp.net" }))).toBeNull();
    expect(leerEventoEvolution(evento({ remoteJid: "571234567@s.whatsapp.net" }))).toBeNull();
  });

  // Un 400 ante basura haría que Evolution reintente para siempre: se descarta y se responde 200.
  it("descarta lo que no tiene la forma esperada", () => {
    expect(leerEventoEvolution(null)).toBeNull();
    expect(leerEventoEvolution({})).toBeNull();
    expect(leerEventoEvolution({ event: "messages.upsert", data: {} })).toBeNull();
    expect(leerEventoEvolution(evento({ id: "" }))).toBeNull();
  });

  it("un mensaje sin pushName no inventa nombre", () => {
    expect(leerEventoEvolution(evento({ pushName: null }))?.nombreWa).toBeNull();
    expect(leerEventoEvolution(evento({ pushName: "   " }))?.nombreWa).toBeNull();
  });
});

describe("resumenDeMensaje", () => {
  it("el texto manda cuando lo hay", () => {
    expect(resumenDeMensaje("imagen", "Ahí está el pago")).toBe("Ahí está el pago");
  });

  // Sin esto una foto dejaría la fila de la bandeja en blanco y parecería que no pasó nada.
  it("sin texto dice qué llegó", () => {
    expect(resumenDeMensaje("imagen", null)).toBe("📎 Envió una imagen");
    expect(resumenDeMensaje("audio", null)).toBe("🎤 Envió una nota de voz");
    expect(resumenDeMensaje("otro", null)).toBe("📎 Envió un archivo");
  });
});
