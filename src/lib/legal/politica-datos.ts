/**
 * La Política de Tratamiento de Datos Personales, como DATOS y no como JSX.
 *
 * Misma doctrina que `notificaciones/plantillas.ts`: el texto vive en un módulo puro y quien lo
 * pinta decide cómo. Así el mismo documento sirve para el modal del checkout y para cualquier
 * pantalla futura sin copiarlo, y un cambio de redacción no obliga a tocar un componente.
 *
 * **`VERSION_POLITICA` se guarda en cada pedido** (`order.politica_version`). Si se edita el texto
 * de forma que cambien las finalidades o el responsable, hay que subir la versión: la política
 * exige poder acreditar qué documento aceptó cada cliente, y dos textos distintos con la misma
 * versión hacen que ese registro deje de significar algo.
 */

/**
 * La versión que se registra al aceptar. Es la fecha de vigencia del documento, no la de hoy:
 * dos clientes que aceptan el mismo texto en meses distintos aceptaron lo mismo.
 */
export const VERSION_POLITICA = "2026-09-01";

/**
 * La URL pública de la plataforma. Va vacía a propósito hasta que haya dominio definitivo, y el
 * párrafo del responsable la omite mientras lo esté — un documento legal que dice
 * "Página Web:" seguido de nada se lee como un borrador sin terminar.
 *
 * Al llenarla, subir también `VERSION_POLITICA`.
 */
const PAGINA_WEB = "";

export type SeccionPolitica = {
  titulo: string;
  parrafos: string[];
};

const datosDelResponsable = [
  "Responsable del Tratamiento: Cronchy Churros y Helados.",
  "Persona a cargo de la Recolección de Datos: Wilson Ricardo Jiménez, C.C. No. 1069734263 de Fusagasugá.",
  "Domicilio: Calle 17 #7-44, Fusagasugá, Cundinamarca.",
  "Email: wijimenezz@gmail.com",
  "Tel. Cel.: 3116435036",
  ...(PAGINA_WEB ? [`Página Web: ${PAGINA_WEB}`] : []),
].join(" ");

export const TITULO_POLITICA =
  "Política de tratamiento de datos personales";

export const SECCIONES_POLITICA: SeccionPolitica[] = [
  {
    titulo: "Objeto",
    parrafos: [
      'El objeto del presente documento es dar a conocer a nuestros clientes y a los usuarios de nuestra plataforma de pedidos las Políticas de Tratamiento de la Información y los procedimientos del Sistema de Protección de Datos Personales implementados por CRONCHY CHURROS Y HELADOS (en adelante "Cronchy"), con el fin de garantizar el adecuado cumplimiento de la Ley 1.581 de 2.012 y los Decretos 1.377 de 2.013 y Decreto único 1074 de 2015, los cuales tienen por objeto desarrollar el derecho constitucional que tienen todas las personas a conocer, actualizar y rectificar las informaciones que se hayan recogido sobre ellas en bases de datos o archivos, y los demás derechos, libertades y garantías constitucionales a que se refiere el artículo 15 de la Constitución Política; así como el derecho a la información consagrado en el artículo 20 de la misma.',
      "Cronchy Churros y Helados recopila, a través de su plataforma de pedidos en línea y de los canales de atención asociados a la gestión de esos pedidos, únicamente los datos personales que resultan necesarios para recibir, preparar, cobrar y entregar los pedidos que sus clientes realizan, y utiliza cookies estrictamente necesarias para el funcionamiento de dicha plataforma, teniendo en cuenta el carácter facultativo de las respuestas a las preguntas que le sean hechas cuando estas versen sobre datos sensibles o sobre los datos de las niñas, niños y adolescentes. A continuación, le brindamos información sobre los datos que tratamos, las finalidades para las cuales los usamos, los terceros que intervienen en su tratamiento, las cookies que empleamos y la forma como el titular puede ejercer sus derechos y autogestionar dichas cookies.",
    ],
  },
  {
    titulo: "Antecedentes legales",
    parrafos: [
      'Artículo 15. "Todas las personas tienen derecho a su intimidad personal y familiar y a su buen nombre, y el Estado debe respetarlos y hacerlos respetar. De igual modo, tienen derecho a conocer, actualizar y rectificar las informaciones que se hayan recogido sobre ellas en los bancos de datos y en archivos de entidades públicas y privadas. En la recolección, tratamiento y circulación de datos se respetarán la libertad y demás garantías consagradas en la Constitución. La correspondencia y demás formas de comunicación privada son inviolables. Sólo pueden ser interceptados o registrados mediante orden judicial, en los casos y con las formalidades que establezca la ley".',
      "Además de la norma constitucional citada, el tratamiento de datos personales que realiza Cronchy Churros y Helados se rige por la Ley Estatutaria 1.581 de 2.012, el Decreto 1.377 de 2.013, el Decreto Único Reglamentario 1074 de 2015, la Ley 2.300 de 2.023 en materia de comunicaciones comerciales, y las circulares, conceptos e instrucciones que imparta la Superintendencia de Industria y Comercio.",
    ],
  },
  {
    titulo: "Definiciones aplicables a este documento",
    parrafos: [
      'Definición Cookies: "Cookie" es un fichero que se descarga en el dispositivo del usuario al acceder a determinadas páginas web, el cual recolecta información de la experiencia de navegación del usuario, lo cual permite conocer dichas experiencias y así establecer las mejoras necesarias para ofrecer un servicio más eficiente y seguro. Las cookies no son un spam, ni un gusano informático, ni ningún virus que pueda dañar los navegadores o dispositivos del usuario. Al empezar la navegación en la plataforma de pedidos de Cronchy se pedirá la autorización correspondiente al usuario para que esta utilice las cookies conforme a la presente política y hasta que se cumpla con la finalidad aquí señalada. Cronchy podrá modificar estas políticas cuando lo considere necesario y en su momento se pedirá nuevamente la autorización correspondiente para utilizarlas conforme a la nueva política.',
      "Cronchy utiliza tres tipos de cookies, todas ellas estrictamente necesarias para el funcionamiento de la plataforma: 1. Cookies de sesión y carrito de compras, que mantienen los productos seleccionados por el cliente mientras arma su pedido. 2. Cookies de datos de entrega, que recuerdan la información que el cliente ya ingresó para agilizar sus pedidos posteriores. 3. Cookies para la confirmación de la Política de Tratamiento de Datos, que identifican si el usuario aceptó, o no, nuestra política de tratamiento de datos.",
      "Cronchy no utiliza cookies de analítica, publicidad ni seguimiento de terceros: no emplea Google Analytics, píxeles de redes sociales ni tecnologías de perfilamiento publicitario, y no comparte información de navegación con plataformas de publicidad. El usuario puede autogestionar estas cookies desde la configuración de su navegador, bloqueándolas o eliminándolas en cualquier momento, teniendo en cuenta que su desactivación puede impedir el correcto funcionamiento de la plataforma de pedidos.",
      "Autorización: Consentimiento previo, expreso e informado del Titular para llevar a cabo el tratamiento de datos personales. Bases de Datos: Conjunto organizado de información y datos personales que son objeto de tratamiento. Responsable del tratamiento: Persona natural o jurídica, pública o privada, que por sí misma o en asocio con otros, decida sobre la base de datos y su tratamiento. Encargado del tratamiento: Persona natural o jurídica, pública o privada, que por sí misma o en asocio con otros, realice el tratamiento de datos personales por cuenta del responsable del tratamiento, tales como los proveedores tecnológicos y los domiciliarios de Cronchy. Titular: Persona natural cuyos datos sean objeto de tratamiento. Tratamiento: Cualquier operación o conjunto de operaciones sobre datos personales, tales como la recolección, almacenamiento, uso, circulación o supresión.",
      "Consultas: Solicitudes de la información personal del titular que repose en cualquier base de datos usada por Cronchy, sobre la cual Cronchy tiene la obligación de suministrar al titular o sus causahabientes. Reclamos: Solicitudes del Titular o sus causahabientes sobre la corrección, actualización o supresión de la información contenida en una base de datos usada por Cronchy, por presunto incumplimiento de cualquiera de los deberes contenidos en la Ley 1.581 de 2.012.",
      "Dato público: Es el dato que no sea semiprivado, privado o sensible. Son considerados datos públicos, entre otros, los datos relativos al estado civil de las personas, a su profesión u oficio y a su calidad de comerciante o de servidor público. Por su naturaleza, los datos públicos pueden estar contenidos, entre otros, en registros públicos, documentos públicos, gacetas y boletines oficiales y sentencias judiciales debidamente ejecutoriadas que no estén sometidas a reserva. Dato semiprivado: Es semiprivado el dato que no tiene naturaleza íntima, reservada, ni pública y cuyo conocimiento o divulgación puede interesar no sólo a su titular sino a cierto sector o grupo de personas o a la sociedad en general. Dato privado: Es el dato que por su naturaleza íntima o reservada sólo es relevante para el titular.",
      "Dato Sensible: Son los datos que afectan la intimidad del Titular o cuyo uso indebido puede generar su discriminación, tales como aquellos que revelen el origen racial o étnico, la orientación política, las convicciones religiosas o filosóficas, la pertenencia a sindicatos, organizaciones sociales o de derechos humanos, así como los datos relativos a menores de edad, a la salud, a la vida sexual y los datos biométricos. Dato Personal: Cualquier información vinculada o que pueda asociarse a una o a varias personas naturales determinadas o determinables. Debe entonces entenderse el \"dato personal\" como una información relacionada con una persona natural, individualmente considerada.",
      "Transferencia: La transferencia de datos tiene lugar cuando el responsable y/o encargado del tratamiento de datos personales, ubicado en Colombia, envía la información o los datos personales a un receptor que a su vez es Responsable del Tratamiento y se encuentra dentro o fuera del país. Transmisión: Tratamiento de datos personales que implica la comunicación de los mismos dentro o fuera del territorio de la República de Colombia cuando tenga por objeto la realización de un tratamiento por el Encargado por cuenta del responsable.",
      "Para la difusión del aviso de privacidad, el responsable de la información puede utilizar documentos, formatos electrónicos, medios verbales o cualquier otra tecnología, siempre y cuando garantice y cumpla con el deber de informar al titular. Cronchy llevará a cabo el tratamiento legal de la información de sus bases de datos, con fines relacionados con la prestación de su objeto social, con el consentimiento previo, expreso e informado del titular. El tratamiento a que se refiere la Ley 1.581 de 2.012 es una actividad reglada que debe sujetarse a lo establecido en ella y en las demás disposiciones que la desarrollen, debiendo obedecer a una finalidad legítima de acuerdo con la Constitución y la Ley, la cual debe ser informada por Cronchy a los titulares de la información. La información sujeta a tratamiento deberá ser veraz, completa, exacta, actualizada, comprobable y comprensible. Los datos personales, salvo la información pública, no podrán estar disponibles salvo a quienes son titulares, terceros autorizados o por disposición judicial. La información sujeta a tratamiento por su responsable o encargado se deberá manejar tomando las medidas técnicas y administrativas que brinden seguridad a los registros, procurando evitar su adulteración, pérdida, consulta, uso o acceso no autorizado o fraudulento.",
    ],
  },
  {
    titulo: "Objetivo",
    parrafos: [
      "Establecer los Derechos de los Titulares y los criterios para la recolección, almacenamiento, uso, circulación, consultas, quejas y supresión de los datos personales tratados por Cronchy.",
      "Ámbito de Aplicación: Las políticas y procedimientos contenidos en este documento serán aplicables a los datos de carácter personal registrados en cualquier base de datos susceptible de tratamiento por parte de Cronchy, en particular los recolectados a través de su plataforma de pedidos en línea y de los canales de atención asociados a la gestión de dichos pedidos.",
      datosDelResponsable,
    ],
  },
  {
    titulo: "Datos personales que recopilamos",
    parrafos: [
      "Cronchy recopila únicamente los datos que resultan pertinentes y adecuados para la finalidad para la cual son recolectados, conforme a la normativa vigente. Del cliente se recopilan su nombre, su número de teléfono, su dirección de entrega, el punto o coordenada que selecciona o confirma en el mapa para ubicar la entrega, y las observaciones que voluntariamente escriba sobre su pedido o sobre la entrega. Del pedido se registran los productos, sabores y adiciones solicitados, el valor total, la fecha y hora, y el estado en que se encuentra. En relación con el pago se registra el medio de pago seleccionado y, cuando dicho medio lo requiera, el comprobante o soporte de la transacción que el propio cliente carga en la plataforma.",
      "Cronchy no recopila número de cédula, correo electrónico, fecha de nacimiento, datos bancarios, claves, números de tarjeta ni datos sensibles de ninguna naturaleza, y en ningún caso solicitará claves, códigos de verificación o credenciales bancarias por ningún canal. La plataforma no está dirigida a menores de edad y los pedidos deben ser realizados por personas mayores de dieciocho (18) años; en caso de que llegare a tratarse información de niñas, niños o adolescentes, dicho tratamiento responderá al respeto de sus derechos prevalentes, atenderá a su interés superior y contará con la autorización previa de su representante legal.",
    ],
  },
  {
    titulo: "Finalidades del tratamiento",
    parrafos: [
      "Los datos personales recolectados por Cronchy serán tratados para las siguientes finalidades necesarias para la prestación del servicio: 1) recibir, registrar y procesar el pedido realizado por el cliente; 2) preparar el pedido conforme a lo solicitado, incluidas las observaciones indicadas; 3) determinar la dirección de entrega y calcular el costo del domicilio según la zona; 4) coordinar y ejecutar la entrega del pedido en la dirección indicada, comunicando al domiciliario los datos indispensables para realizarla; 5) contactar al cliente por WhatsApp, llamada telefónica o mensaje de texto para confirmar el pedido, informar su estado (recibido, en preparación, en camino, entregado) o resolver novedades relacionadas con la entrega; 6) verificar que el pago del pedido fue efectivamente realizado; 7) precargar los datos de entrega del cliente en pedidos posteriores, con el fin de agilizar el proceso de compra; 8) atender peticiones, quejas, reclamos y solicitudes de garantía sobre los pedidos realizados; y 9) cumplir obligaciones legales, contables y tributarias, así como atender requerimientos de autoridades administrativas o judiciales competentes.",
      "El envío de los avisos sobre el estado del pedido a que se refiere la finalidad 5 puede ser rechazado por el cliente al momento de realizarlo, sin que ello afecte la prestación del servicio: en tal caso podrá consultar el estado de su pedido en el enlace de seguimiento que se le entrega al confirmarlo. Cronchy no envía información comercial ni promocional por estos canales.",
      "Cronchy no utilizará los datos para finalidades distintas a las aquí señaladas sin obtener previamente una nueva autorización del Titular.",
    ],
  },
  {
    titulo: "Tratamiento de datos de ubicación",
    parrafos: [
      "La plataforma solicita al cliente confirmar un punto en el mapa, ya sea seleccionándolo manualmente o autorizando a su navegador a compartir su ubicación aproximada. Dicha información se utiliza exclusivamente para determinar la ubicación de entrega y calcular el costo del domicilio según la zona en que esta se encuentre. El permiso de ubicación del navegador es de carácter opcional: si el cliente no lo concede, podrá ubicar el punto manualmente en el mapa o escribir su dirección, y el pedido se procesará igualmente.",
      "Cronchy no realiza seguimiento continuo de la ubicación del cliente ni accede a ella fuera del momento en que se realiza el pedido. La coordenada se asocia únicamente al pedido correspondiente y se comunica al domiciliario para efectos de la entrega, sin que sea utilizada para perfilamiento ni para fines publicitarios.",
    ],
  },
  {
    titulo: "Tratamiento de información de pedidos y pagos",
    parrafos: [
      "Cuando el medio de pago seleccionado requiere que el cliente cargue un soporte de la transacción, dicho soporte se trata con la finalidad única de verificar que el pago del pedido se realizó y por el valor correspondiente. Cronchy solicita únicamente el comprobante de la transacción asociada al pedido y no solicita extractos, saldos ni información financiera adicional; se recomienda al cliente cubrir u omitir cualquier dato del comprobante que no sea necesario para dicha verificación.",
      "Los comprobantes se almacenan en un repositorio privado, no público ni indexable por buscadores, cuyo acceso se realiza mediante enlaces de vigencia limitada generados desde el servidor, y únicamente el personal autorizado del panel administrativo puede consultarlos. Los comprobantes se depuran de forma automática a los sesenta (60) días contados desde la fecha del pedido, salvo que exista una controversia en curso o un requerimiento de autoridad competente que exija conservarlos por un término mayor.",
    ],
  },
  {
    titulo: "Encargados y proveedores",
    parrafos: [
      "Para operar la plataforma y entregar los pedidos, Cronchy se apoya en terceros que actúan como Encargados del Tratamiento y que acceden a los datos únicamente para prestar el servicio contratado, sin poder usarlos para fines propios ni contactar a los clientes por su cuenta. Estos terceros corresponden a las siguientes categorías: proveedores de alojamiento de la aplicación y de bases de datos; proveedores de almacenamiento de archivos, incluidos los comprobantes de pago; proveedores de servicios de mensajería utilizados para comunicar al cliente el estado de su pedido; y domiciliarios externos encargados de la entrega.",
      "Los domicilios son realizados por repartidores externos, a quienes se les comunica únicamente la información indispensable para la entrega, esto es, el nombre del cliente, la dirección, el punto de ubicación, el teléfono de contacto, el detalle del pedido y el valor a cobrar. Dichos domiciliarios están obligados a usar esos datos exclusivamente para entregar el pedido asignado, a no conservarlos, copiarlos ni almacenarlos una vez completada la entrega, a no contactar al cliente por motivos ajenos al pedido y a no compartirlos con terceros; este deber de confidencialidad se mantiene aun después de terminada su vinculación con Cronchy.",
      "Los servidores de algunos de estos proveedores se encuentran ubicados fuera de Colombia, entre otros en los Estados Unidos de América; al aceptar la presente política el Titular autoriza expresamente a Cronchy para transmitir sus datos personales a dichos Encargados con el único fin de cumplir las finalidades señaladas en este documento. Cronchy verificará que estos proveedores cuenten con estándares adecuados de seguridad y con las cláusulas de tratamiento exigidas por el artículo 25 del Decreto 1.377 de 2.013.",
    ],
  },
  {
    titulo: "Derechos de los titulares",
    parrafos: [
      "a) Conocer, actualizar y rectificar en forma gratuita sus datos personales proporcionados que hayan sido objeto de tratamiento por Cronchy o frente al encargado del tratamiento designado por esta. Este derecho se podrá ejercer frente a datos parciales, inexactos, incompletos, fraccionados o que induzcan a error.",
      "b) Ser informado por parte de Cronchy o por parte del encargado del tratamiento designado, previa solicitud, respecto del uso que se les ha dado a sus datos personales.",
      "c) Presentar ante la Superintendencia de Industria y Comercio quejas por infracciones a lo dispuesto en la Ley 1.581 de 2.012 y las demás normas que la modifiquen, adicionen o complementen.",
      "d) Acceder en forma gratuita, en las condiciones definidas en este documento, a sus datos personales que hayan sido objeto de tratamiento.",
      "e) Solicitar la prueba de la Autorización otorgada, salvo en los casos exceptuados por la ley.",
      "f) Abstenerse de responder las preguntas sobre datos sensibles; tendrán carácter facultativo las respuestas que versen sobre datos sensibles o sobre datos de las niñas, niños y adolescentes.",
      "g) Solicitar a Cronchy, en cualquier momento, la supresión parcial o total de sus datos personales y revocar la autorización otorgada para el tratamiento de los mismos, mediante la presentación de un reclamo, de acuerdo con lo establecido en el artículo 15 de la Ley 1.581 de 2.012; la supresión no procederá cuando exista un deber legal o contractual de conservar la información.",
      "h) Solicitar en cualquier momento que se deje de enviar información a sus canales de contacto, sin que ello afecte la prestación del servicio.",
      "i) La información acerca de los datos personales que hayan sido materia de tratamiento por parte de Cronchy podrá suministrarse a las siguientes personas: 1. A los Titulares, sus causahabientes o sus representantes legales. 2. A las entidades públicas o administrativas en ejercicio de sus funciones legales o por orden judicial. 3. A los terceros autorizados por el Titular o por la ley.",
      "En la recolección de datos, Cronchy deberá limitarse a aquellos datos personales que son pertinentes y adecuados para la finalidad para la cual son recolectados o requeridos conforme a la normativa vigente, todo lo anterior previa autorización del titular e informándole las finalidades específicas de dicho tratamiento para las cuales se obtiene el consentimiento. En caso de realizarse cambios sustanciales en el contenido de las Políticas del Tratamiento de datos respecto a la identidad del responsable y/o a la finalidad del tratamiento, los cuales puedan afectar el contenido de la autorización, Cronchy deberá comunicarlo a los titulares con anterioridad a su implementación y además deberá obtener del titular una nueva autorización cuando el cambio se refiera a la finalidad del tratamiento. Para la comunicación de los cambios y la autorización se podrán utilizar medios digitales técnicos que faciliten esta actividad.",
    ],
  },
  {
    titulo: "Autorización para el tratamiento",
    parrafos: [
      "Antes de finalizar el pedido, la plataforma solicita al cliente aceptar la presente política mediante una casilla de verificación que no viene marcada por defecto y que enlaza al texto completo del documento; esta aceptación es necesaria para procesar el pedido. De manera separada, la plataforma permite al cliente rechazar el envío de los avisos sobre el estado de su pedido, sin que ello impida realizarlo.",
      "Cronchy conserva registro de la fecha, la hora, la versión de la política aceptada y el medio por el cual se otorgó cada autorización, de manera que esta pueda acreditarse ante el Titular o ante la autoridad competente.",
    ],
  },
  {
    titulo: "Obligaciones de Cronchy",
    parrafos: [
      "Estas políticas son de carácter obligatorio para Cronchy, en calidad de responsable del tratamiento, así como para los encargados que lo realizan por su cuenta, debiéndose salvaguardar la seguridad de las bases de datos y su estricta confidencialidad, salvo las autorizaciones expresas de los usuarios. Las personas que intervengan en el tratamiento de datos personales que no tengan la naturaleza de públicos están obligadas a garantizar la reserva de la información, inclusive después de finalizada su relación laboral o comercial, pudiendo sólo realizar suministro de datos personales cuando ello corresponda a las actividades autorizadas en la Ley 1.581 de 2.012 y el Decreto 1.377 de 2.013.",
      "Los siguientes son deberes de Cronchy: 1) Garantizar al titular, en todo tiempo, el pleno y efectivo ejercicio del derecho de hábeas data, entendido como aquel que tiene toda persona de conocer, actualizar y rectificar la información que se haya recogido sobre ella en archivos y bancos de datos de naturaleza pública o privada. 2) Solicitar y conservar, en las condiciones previstas en la Ley, copia de la respectiva autorización otorgada por el titular. 3) Informar debidamente al titular sobre la finalidad de la recolección y los derechos que le asisten por virtud de la autorización otorgada. 4) Tomar las medidas orientadas a conservar la información bajo las condiciones de seguridad necesarias para impedir su adulteración, pérdida, consulta, uso o acceso no autorizado o fraudulento. 5) Tomar las medidas para que la información que se suministre al encargado del tratamiento sea veraz, completa, exacta, actualizada, comprobable y comprensible. 6) Actualizar la información, comunicando de forma oportuna al encargado del tratamiento todas las novedades respecto de los datos que previamente le hayan suministrado, y adoptar las demás medidas necesarias para que dicha información se mantenga actualizada. 7) Rectificar la información cuando sea incorrecta y comunicar lo pertinente al encargado del tratamiento. 8) Suministrar al encargado del tratamiento, según el caso, únicamente datos cuyo tratamiento esté previamente autorizado de conformidad con lo previsto en la ley. 9) Exigir al encargado del tratamiento, en todo momento, el respeto a las condiciones de seguridad y privacidad de la información del titular. 10) Tramitar las consultas y reclamos formulados en los términos señalados en la Ley. 11) Adoptar un manual interno de políticas y procedimientos para garantizar el adecuado cumplimiento de la ley y en especial para la atención de consultas y reclamos. 12) Informar, a solicitud del titular, sobre el uso dado a sus datos. 13) Informar a la autoridad de protección de datos cuando se presenten violaciones a los códigos de seguridad y existan riesgos en la administración de la información de los titulares. 14) Cumplir las instrucciones y requerimientos que imparta la Superintendencia de Industria y Comercio. 15) Registrar sus bases de datos en el Registro Nacional de Bases de Datos cuando ello le sea exigible conforme a los umbrales definidos por la normatividad vigente.",
      "Cronchy tomará medidas de seguridad y todas las precauciones razonables y medidas de índole técnico, humano, administrativo y organizacional conducentes a garantizar la seguridad de los datos de carácter personal de los titulares, principalmente aquellas destinadas a impedir su alteración, pérdida y tratamiento o acceso no autorizado. Entre dichas medidas se encuentran el uso de conexiones cifradas (HTTPS/TLS) en todos los canales digitales; el acceso al panel administrativo mediante credenciales individuales con permisos diferenciados según el rol del usuario; el acceso a la base de datos exclusivamente desde el servidor, sin que las credenciales de conexión se expongan en el navegador del cliente; el almacenamiento de los comprobantes de pago en un repositorio privado con acceso mediante enlaces temporales; la realización de copias de seguridad periódicas de la información; la entrega a los domiciliarios únicamente de la información mínima necesaria bajo deber de confidencialidad; y la revocación inmediata de los accesos de toda persona que termine su relación laboral o comercial con Cronchy.",
      "Las medidas de seguridad se aplican tanto a los ficheros (Cookies) como a los tratamientos, y su aplicación tiene como fin procurar la conservación, confidencialidad, integridad y disponibilidad de los datos. La Superintendencia de Industria y Comercio, a través de una Delegatura para la Protección de Datos Personales, ejercerá la vigilancia y la imposición de las sanciones a que haya lugar para garantizar que en el tratamiento de datos personales se respeten los principios, derechos, garantías y procedimientos previstos en la Ley.",
    ],
  },
  {
    titulo: "Procedimiento para el ejercicio del derecho de hábeas data",
    parrafos: [
      "Atención de Peticiones, Consultas y Reclamos. Los derechos de los titulares de los datos personales se podrán ejercer a través de los canales o medios dispuestos por Cronchy para la atención al público, a saber: Email: wijimenezz@gmail.com; WhatsApp: 3116435036; y de manera presencial en Calle 17 #7-44, Fusagasugá, Cundinamarca.",
      "El titular o sus causahabientes que consideren que la información contenida en una base de datos debe ser objeto de corrección, actualización o supresión, o cuando adviertan el presunto incumplimiento de cualquiera de los deberes contenidos en la Ley 1.581 de 2.012, podrán presentar una solicitud y/o reclamo ante Cronchy, la cual responderá por el mismo medio en que fue recibida o por el que indique el titular.",
      "En cumplimiento de las normas sobre protección de datos personales, Cronchy dispone del siguiente procedimiento y requisitos mínimos para el ejercicio de sus derechos: 1. Para la radicación y atención de su solicitud le solicitamos suministrar su nombre completo y apellidos y sus datos de contacto, esto es, dirección física y/o electrónica y teléfonos de contacto. 2. El medio por el cual desea recibir respuesta a su solicitud. 3. El motivo o los hechos que dan lugar a la solicitud o reclamo, con una breve descripción del derecho que desea ejercer (conocer, informarse, actualizar, rectificar, solicitar prueba de la autorización otorgada, revocarla, suprimir o acceder a la información). 4. Firma, si aplica, y número de identificación.",
      "El término máximo previsto por la ley para resolver las consultas es de diez (10) días hábiles contados a partir del día siguiente a la fecha de su recibo; cuando no fuere posible atender la consulta dentro de dicho término, Cronchy informará al interesado los motivos de la demora y la fecha en que se atenderá, la cual en ningún caso podrá superar los cinco (5) días hábiles siguientes al vencimiento del primer término.",
      "Tratándose de reclamos, si el reclamo resulta incompleto se requerirá al interesado dentro de los cinco (5) días siguientes a su recepción para que subsane las fallas, y transcurridos dos (2) meses desde la fecha del requerimiento sin que el solicitante presente la información requerida se entenderá que ha desistido del reclamo; el término máximo para atender el reclamo será de quince (15) días hábiles contados a partir del día siguiente a la fecha de su recibo, y cuando no fuere posible atenderlo dentro de dicho término Cronchy informará al interesado los motivos de la demora y la fecha en que se atenderá su reclamo, la cual en ningún caso podrá superar los ocho (8) días hábiles siguientes al vencimiento del primer término.",
      "Una vez cumplidos los términos señalados por la Ley 1.581 de 2.012 y las demás normas que la reglamenten o complementen, el Titular al que se deniegue total o parcialmente el ejercicio de los derechos de acceso, actualización, rectificación, supresión y revocación podrá poner su caso en conocimiento de la Superintendencia de Industria y Comercio – Delegatura para la Protección de Datos Personales.",
    ],
  },
  {
    titulo: "Conservación y eliminación de los datos",
    parrafos: [
      "Cronchy conserva los datos personales durante el tiempo necesario para cumplir las finalidades autorizadas. Los comprobantes de pago cargados por el cliente se depuran automáticamente a los sesenta (60) días contados desde la fecha del pedido. Los datos de contacto y entrega, esto es, el nombre, el teléfono, la dirección y el punto de ubicación, se conservan mientras se mantenga la relación comercial con el cliente; si el cliente no realiza pedidos durante veinticuatro (24) meses consecutivos, dichos datos serán suprimidos o anonimizados.",
      "El historial de pedidos y su valor se conservan por el término exigido por la normatividad contable y tributaria aplicable, en registros que, una vez vencido el plazo anterior, no permanecen asociados a los datos de contacto del cliente. El cliente puede solicitar la supresión de sus datos en cualquier momento, sin necesidad de esperar el vencimiento de estos plazos, siguiendo el procedimiento descrito en el aparte anterior. Cumplidos los términos señalados, y salvo que exista un deber legal o contractual de conservar la información, los datos serán suprimidos o anonimizados de forma irreversible, conservando únicamente información agregada sin capacidad de identificar al cliente.",
    ],
  },
  {
    titulo: "Vigencia",
    parrafos: [
      "La presente Política de Datos rige a partir del 1 de septiembre de 2026 y permanecerá vigente mientras Cronchy desarrolle su actividad comercial. Cronchy podrá modificarla cuando lo considere necesario, publicando la nueva versión en la plataforma de pedidos con indicación de su fecha; cuando los cambios afecten las finalidades del tratamiento o la identidad del responsable, se comunicarán previamente a los titulares y se solicitará nueva autorización.",
      "Las bases de datos se conservarán mientras se mantenga la relación comercial con el Titular de la información y en los términos señalados en el aparte de Conservación y Eliminación de los Datos; una vez terminada dicha relación, y salvo que exista un deber legal o contractual de conservar su información, sus datos serán eliminados de nuestras bases de datos.",
    ],
  },
];
