const contenedor = document.querySelector('#estudiantes');

async function cargarEstudiantes() {
  try {
    const [respuestaEstudiantes, respuestaMisiones] = await Promise.all([
      fetch('/api/estudiantes'),
      fetch('/api/misiones')
    ]);

    if (!respuestaEstudiantes.ok || !respuestaMisiones.ok) {
      throw new Error('No se pudieron cargar los datos');
    }

    const estudiantes = await respuestaEstudiantes.json();
    const catalogo = await respuestaMisiones.json();

    contenedor.replaceChildren();

    for (const estudiante of estudiantes) {
      const tarjeta = document.createElement('article');
      const titulo = document.createElement('h2');
      titulo.textContent = estudiante.nombre;

      const carnet = document.createElement('p');
      carnet.textContent = `Carnet: ${estudiante.carnet}`;

      const completadas = catalogo.filter(mision =>
        estudiante.misiones.some(
          registro =>
            registro.misionId === mision.MisionID &&
            registro.estado === true
        )
      ).length;

      const avance = document.createElement('p');
      avance.textContent =
        `${completadas} de ${catalogo.length} misiones completadas`;

      const lista = document.createElement('ul');

      for (const mision of catalogo) {
        const registro = estudiante.misiones.find(
          item => item.misionId === mision.MisionID
        );

        const elemento = document.createElement('li');
        elemento.textContent =
          `${registro?.estado ? '✅' : '⬜'} ${mision.Nombre}`;

        lista.append(elemento);
      }

      tarjeta.append(titulo, carnet, avance, lista);
      contenedor.append(tarjeta);
    }
  } catch (error) {
    contenedor.textContent = error.message;
  }
}

cargarEstudiantes();