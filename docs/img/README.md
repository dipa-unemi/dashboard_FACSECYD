# Logos institucionales

Los originales viven en `data/`, que está fuera del repositorio por
`.gitignore`. Estas copias son las que se publican, ya recortadas al
contenido (sin margen transparente) para que el CSS controle el tamaño
óptico real.

| Archivo | Origen en `data/` | Dónde aparece | Alto al que se dibuja |
|---|---|---|---|
| `logo-vicerrectorado.png` | `Vicerrectorado Académico de Formación de Grado (1).png` | Banda superior de `index.html` | 34 px |
| `logo-dipa.png` | `DIPA.png` | Pie fijo, tema claro | 20 px |
| `logo-dipa-blanco.png` | `DIPA2BLANCO (1).png` | Pie fijo, tema oscuro | 20 px |

## Notas

- **El vicerrectorado solo existe en tinta azul.** Sobre el fondo oscuro
  del tema nocturno quedaría casi invisible, así que `styles.css` lo pasa
  a blanco con `filter: brightness(0) invert(1)`. Funciona porque el logo
  es de un solo color. Si consigues el archivo blanco oficial, reemplaza
  el PNG y borra ese filtro.
- **DIPA sí tiene las dos versiones**, así que el pie intercambia el
  archivo según el tema en lugar de filtrar.
- Si algún día llegan en SVG, cámbialos y ajusta la extensión en las tres
  etiquetas `<img>` de `index.html`.
- Al reemplazar un PNG, recórtale el margen transparente primero; si no,
  el logo se dibuja más chico de lo que indica su alto en CSS.
