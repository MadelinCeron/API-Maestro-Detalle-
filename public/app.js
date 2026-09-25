const contenedor = document.querySelector('#estudiantes');
const buscador = document.querySelector('#buscar');
const resultadoBusqueda = document.querySelector('#resultado-busqueda');

function crearElemento(etiqueta, texto, clase = '') {
  const elemento = document.createElement(etiqueta);
  elemento.textContent = texto;

  if (clase) {
    elemento.className = clase;
  }

  return elemento;
}

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function cargarEstudiantes() {
  try {
    const [respuestaEstudiantes, respuestaMisiones] = await Promise.all([
      fetch('/api/estudiantes'),
      fetch('/api/misiones')
    ]);

    if (!respuestaEstudiantes.ok || !respuestaMisiones.ok) {
      throw new Error('No se pudieron cargar los datos. Actualizá la página.');
    }

    const estudiantes = await respuestaEstudiantes.json();
    const catalogo = await respuestaMisiones.json();

    document.querySelector('#total-estudiantes').textContent =
      estudiantes.length;

    document.querySelector('#total-misiones').textContent =
      catalogo.length;

    const totalCompletadas = estudiantes.reduce((total, estudiante) => {
      const completadas = catalogo.filter(mision =>
        estudiante.misiones.some(registro =>
          registro.misionId === mision.MisionID &&
          registro.estado === true
        )
      ).length;

      return total + completadas;
    }, 0);

    const promedio = estudiantes.length && catalogo.length
      ? Math.round(
          (totalCompletadas / (estudiantes.length * catalogo.length)) * 100
        )
      : 0;

    document.querySelector('#promedio').textContent = `${promedio}%`;

    function mostrarEstudiantes() {
      const busqueda = normalizar(buscador.value.trim());

      const filtrados = estudiantes.filter(estudiante =>
        normalizar(estudiante.nombre).includes(busqueda) ||
        normalizar(estudiante.carnet).includes(busqueda)
      );

      contenedor.replaceChildren();

      resultadoBusqueda.textContent = busqueda
        ? `${filtrados.length} estudiante(s) encontrado(s)`
        : '';

      if (filtrados.length === 0) {
        contenedor.append(
          crearElemento(
            'p',
            'No encontramos estudiantes con esa búsqueda.',
            'sin-resultados'
          )
        );
        return;
      }

      for (const estudiante of filtrados) {
        const tarjeta = document.createElement('article');
        tarjeta.className = 'tarjeta';

        if (estudiante.carnet === '1890-23-16776') {
          tarjeta.classList.add('propia');
          tarjeta.append(
            crearElemento('span', 'TU AVANCE', 'insignia')
          );
        }

        tarjeta.append(
          crearElemento('h3', estudiante.nombre, 'nombre'),
          crearElemento('p', `Carnet ${estudiante.carnet}`, 'carnet')
        );

        const completadas = catalogo.filter(mision =>
          estudiante.misiones.some(registro =>
            registro.misionId === mision.MisionID &&
            registro.estado === true
          )
        ).length;

        const porcentaje = catalogo.length
          ? Math.round((completadas / catalogo.length) * 100)
          : 0;

        tarjeta.classList.add(
          porcentaje < 40
            ? 'avance-bajo'
            : porcentaje < 80
              ? 'avance-medio'
              : 'avance-alto'
        );

        const progreso = document.createElement('div');
        progreso.className = 'progreso';

        const textoProgreso = document.createElement('div');
        textoProgreso.className = 'progreso-texto';
        textoProgreso.append(
          crearElemento(
            'span',
            `${completadas} de ${catalogo.length} misiones`
          ),
          crearElemento('strong', `${porcentaje}%`)
        );

        const barra = document.createElement('div');
        barra.className = 'barra';
        barra.setAttribute('role', 'progressbar');
        barra.setAttribute(
          'aria-label',
          `Avance de ${estudiante.nombre}`
        );
        barra.setAttribute('aria-valuenow', String(porcentaje));
        barra.setAttribute('aria-valuemin', '0');
        barra.setAttribute('aria-valuemax', '100');

        const relleno = document.createElement('div');
        relleno.className = 'barra-relleno';
        relleno.style.width = `${porcentaje}%`;

        barra.append(relleno);
        progreso.append(textoProgreso, barra);

        const lista = document.createElement('ul');
        lista.className = 'lista-misiones';

        for (const mision of catalogo) {
          const completada = estudiante.misiones.some(registro =>
            registro.misionId === mision.MisionID &&
            registro.estado === true
          );

          lista.append(
            crearElemento(
              'li',
              `${completada ? '✓' : '○'}  ${mision.Nombre}`,
              completada ? 'completada' : 'pendiente'
            )
          );
        }

        tarjeta.append(progreso, lista);
        contenedor.append(tarjeta);
      }
    }

    buscador.addEventListener('input', mostrarEstudiantes);
    mostrarEstudiantes();
  } catch (error) {
    contenedor.textContent = error.message;
  }
}

cargarEstudiantes();